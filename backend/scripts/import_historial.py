# -*- coding: utf-8 -*-
"""Importa el export de "Historial de reproduccion extendido" de Spotify a MySQL.

Se corre A MANO y UNA VEZ (o cada vez que llegue un export nuevo). No es parte
de la app: el servidor nunca lee estos JSON, solo la tabla agregada que este
script deja.

POR QUE ES LOCAL Y NO UN ENDPOINT:
el export son 156 MB que nunca deben subir al repo ni a la imagen de Docker
(`historial/` esta en .gitignore y en .dockerignore — cada fila trae ip_addr).
Procesar aqui y subir solo el agregado es lo que mantiene chica a la DB: de
187 mil reproducciones salen ~24 mil filas.

LA CONTRASENA NO SE ESCRIBE EN NINGUN LADO. Se toma de la variable de entorno
MYSQL_PASSWORD, que se pone en la shell justo antes de correr esto. Es a
proposito: en la sesion del 2026-08-25 se decidio que ese valor no pasara por
Claude ni quede en un archivo.

USO (PowerShell, desde la raiz del repo):

    $env:MYSQL_PASSWORD = 'la-contrasena-de-TiDB'
    python backend/scripts/import_historial.py

Para ver que haria sin escribir nada:

    python backend/scripts/import_historial.py --dry-run
"""
import os
import sys
import io
import glob
import json
import time
import argparse

# La app cuenta una reproduccion a partir de 30 s. Se usa el mismo umbral para
# que estos numeros signifiquen lo mismo que los de Spotify.
UMBRAL_PLAY_MS = 30000

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HISTORIAL = os.path.join(RAIZ, "historial")
BACKEND = os.path.join(RAIZ, "backend")


def cargar_agregado(carpeta):
    """Lee los JSON del export y devuelve una fila por cancion."""
    patron = os.path.join(carpeta, "Streaming_History_Audio_*.json")
    archivos = sorted(glob.glob(patron))
    if not archivos:
        sys.exit("No se encontro ningun Streaming_History_Audio_*.json en %s" % carpeta)

    agg = {}
    filas = sin_uri = 0
    for path in archivos:
        with io.open(path, encoding="utf-8") as f:
            data = json.load(f)
        for r in data:
            filas += 1
            uri = r.get("spotify_track_uri")
            if not uri:
                sin_uri += 1
                continue
            tid = uri.rsplit(":", 1)[-1]
            ms = r.get("ms_played") or 0
            # 'ts' viene como 2026-01-01T03:48:35Z -> DATETIME de MySQL
            ts = (r.get("ts") or "").replace("T", " ").replace("Z", "")[:19]

            a = agg.get(tid)
            if a is None:
                a = agg[tid] = {
                    "track_id": tid,
                    "name": r.get("master_metadata_track_name") or "",
                    "artist": r.get("master_metadata_album_artist_name") or "",
                    "plays": 0, "skips": 0, "ms_total": 0,
                    "first_played": ts or None, "last_played": ts or None,
                }
            a["ms_total"] += ms
            if ms >= UMBRAL_PLAY_MS:
                a["plays"] += 1
            else:
                a["skips"] += 1
            if ts:
                if not a["first_played"] or ts < a["first_played"]:
                    a["first_played"] = ts
                if not a["last_played"] or ts > a["last_played"]:
                    a["last_played"] = ts

        print("  leido %-46s %7d filas" % (os.path.basename(path), len(data)))

    print("\n  reproducciones totales : %s" % format(filas, ","))
    print("  canciones unicas       : %s" % format(len(agg), ","))
    print("  filas sin track_uri    : %s (se ignoran)" % format(sin_uri, ","))
    return list(agg.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="procesa y reporta, pero no escribe en MySQL")
    ap.add_argument("--carpeta", default=HISTORIAL,
                    help="carpeta con los JSON del export")
    args = ap.parse_args()

    print("=" * 64)
    print("IMPORT DEL HISTORIAL EXTENDIDO DE SPOTIFY")
    print("=" * 64)
    print("Carpeta: %s\n" % args.carpeta)

    t0 = time.time()
    filas = cargar_agregado(args.carpeta)
    print("\n  procesado en %.1f s" % (time.time() - t0))

    if args.dry_run:
        print("\n--dry-run: no se escribio nada en MySQL.")
        muestra = sorted(filas, key=lambda r: -r["plays"])[:5]
        print("\nLas 5 mas escuchadas que se subirian:")
        for r in muestra:
            print("  %5d plays  %-38.38s %.24s" % (r["plays"], r["name"], r["artist"]))
        return

    if not os.getenv("MYSQL_PASSWORD"):
        sys.exit(
            "\nFALTA MYSQL_PASSWORD.\n\n"
            "En PowerShell, antes de correr esto:\n"
            "    $env:MYSQL_PASSWORD = 'la-contrasena-de-TiDB'\n\n"
            "Se saca de Secret Manager (secreto `mysql-password`, ultima version).\n"
            "No la pongas en ningun archivo."
        )

    # Datos de conexion NO secretos, los mismos que usa Cloud Run.
    os.environ.setdefault("MYSQL_HOST", "gateway01.us-east-1.prod.aws.tidbcloud.com")
    os.environ.setdefault("MYSQL_USER", "4CCP4ijs5Bk8TUT.root")
    os.environ.setdefault("MYSQL_DATABASE", "rateapp")

    sys.path.insert(0, BACKEND)
    import database  # se importa DESPUES de fijar el entorno

    print("\nConectando a MySQL...")
    try:
        database.ensure_listening_table()
    except Exception as e:
        sys.exit(
            "\nNo se pudo conectar o crear la tabla: %s\n\n"
            "Si el error habla de SSL/TLS: TiDB Serverless exige TLS y el\n"
            "conector necesita los certificados del sistema. Suele arreglarse\n"
            "con `pip install --upgrade mysql-connector-python`." % e
        )
    print("  tabla listening_stats lista")

    print("\nSubiendo %s filas en lotes de 1000..." % format(len(filas), ","))
    t1 = time.time()
    escritas = database.replace_listening_batch(filas, chunk=1000)
    dt = time.time() - t1

    print("  %s filas escritas en %.1f s" % (format(escritas, ","), dt))

    resumen = database.get_listening_summary()
    print("\n" + "=" * 64)
    print("LISTO. Lo que quedo en la base:")
    print("  canciones      : %s" % format(resumen["tracks"], ","))
    print("  reproducciones : %s" % format(resumen["plays"], ","))
    print("  horas          : %s" % format(resumen["hours"], ","))
    print("  desde          : %s" % resumen["first_played"])
    print("  hasta          : %s" % resumen["last_played"])
    print("=" * 64)


if __name__ == "__main__":
    main()
