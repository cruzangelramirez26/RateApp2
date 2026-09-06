# -*- coding: utf-8 -*-
"""Rellena la SERIE TEMPORAL de escuchas desde el export de Spotify.

Hermano de import_historial.py, y la diferencia es justo el punto:

  import_historial.py -> listening_stats  : UNA fila por cancion (el total)
  import_eventos.py   -> listening_events : UNA fila por REPRODUCCION

El agregado no puede contestar "cuantas veces la escuche en los ultimos 30
dias" porque suma sin guardar cuando paso cada cosa. Una cancion de 200 plays
en 2021 y una sola vez ayer se ve igual de reciente que una que suena 50 veces
este mes. Esta tabla es lo que arregla eso, y es lo que hace posibles las
ventanas de 30 dias / 1 anio / historico.

SE APLICA EL MISMO UMBRAL DE 30 s, a proposito: asi COUNT(*) de una ventana
significa exactamente lo mismo que `plays` del agregado, y los dos numeros
nunca se contradicen entre pantallas.

ES IDEMPOTENTE. La PK es (track_id, played_at) e inserta con INSERT IGNORE, asi
que correrlo dos veces no duplica nada.

LA CONTRASENA NO SE ESCRIBE EN NINGUN LADO. Sale de la variable de entorno
MYSQL_PASSWORD, igual que el otro script: en la sesion del 2026-08-25 se
decidio que ese valor no pasara por Claude ni quede en un archivo.

USO (PowerShell, desde la raiz del repo):

    $env:MYSQL_PASSWORD = 'la-contrasena-de-TiDB'
    python backend/scripts/import_eventos.py

Para ver que haria sin escribir nada:

    python backend/scripts/import_eventos.py --dry-run
"""
import os
import sys
import io
import glob
import json
import time
import argparse
from collections import Counter
from datetime import datetime, timedelta

UMBRAL_PLAY_MS = 30000

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HISTORIAL = os.path.join(RAIZ, "historial")
BACKEND = os.path.join(RAIZ, "backend")


def cargar_eventos(carpeta):
    """Lee los JSON del export y devuelve UNA fila por reproduccion."""
    patron = os.path.join(carpeta, "Streaming_History_Audio_*.json")
    archivos = sorted(glob.glob(patron))
    if not archivos:
        sys.exit("No se encontro ningun Streaming_History_Audio_*.json en %s" % carpeta)

    eventos = []
    filas = sin_uri = cortas = 0
    for path in archivos:
        with io.open(path, encoding="utf-8") as f:
            data = json.load(f)
        for r in data:
            filas += 1
            uri = r.get("spotify_track_uri")
            if not uri:
                sin_uri += 1
                continue
            ms = r.get("ms_played") or 0
            if ms < UMBRAL_PLAY_MS:
                cortas += 1
                continue
            ts = (r.get("ts") or "").replace("T", " ").replace("Z", "")[:19]
            if not ts:
                continue
            eventos.append({
                "track_id": uri.rsplit(":", 1)[-1],
                "played_at": ts,
                "ms_played": ms,
                "name": r.get("master_metadata_track_name") or "",
                "artist": r.get("master_metadata_album_artist_name") or "",
            })
        print("  leido %-46s %7d filas" % (os.path.basename(path), len(data)))

    print("\n  filas leidas           : %s" % format(filas, ","))
    print("  sin track_uri          : %s (se ignoran)" % format(sin_uri, ","))
    print("  bajo el umbral de 30 s : %s (se ignoran)" % format(cortas, ","))
    print("  EVENTOS a guardar      : %s" % format(len(eventos), ","))
    return eventos


def reporte_ventanas(eventos):
    """Lo que quedara disponible por ventana, que es el punto del ejercicio."""
    ahora = datetime.utcnow()
    print("\n  Lo que se podra consultar:")
    print("  %-12s %15s %18s" % ("ventana", "reproducciones", "canciones"))
    print("  " + "-" * 47)
    for nombre, dias in (("30 dias", 30), ("90 dias", 90), ("1 anio", 365),
                         ("2 anios", 730), ("historico", None)):
        if dias:
            corte = (ahora - timedelta(days=dias)).strftime("%Y-%m-%d %H:%M:%S")
            sel = [e for e in eventos if e["played_at"] >= corte]
        else:
            sel = eventos
        print("  %-12s %15s %18s" % (
            nombre, format(len(sel), ","),
            format(len({e["track_id"] for e in sel}), ",")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="procesa y reporta, pero no escribe en MySQL")
    ap.add_argument("--carpeta", default=HISTORIAL)
    args = ap.parse_args()

    print("=" * 64)
    print("IMPORT DE LA SERIE TEMPORAL DE ESCUCHAS")
    print("=" * 64)
    print("Carpeta: %s\n" % args.carpeta)

    t0 = time.time()
    eventos = cargar_eventos(args.carpeta)
    print("\n  procesado en %.1f s" % (time.time() - t0))
    reporte_ventanas(eventos)

    if args.dry_run:
        print("\n--dry-run: no se escribio nada en MySQL.")
        top = Counter((e["name"], e["artist"]) for e in eventos).most_common(5)
        print("\nLas 5 mas escuchadas del historico:")
        for (nom, art), n in top:
            print("  %5d plays  %-38.38s %.24s" % (n, nom, art))
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
    import database

    print("\nConectando a MySQL...")
    try:
        database.ensure_listening_events_table()
    except Exception as e:
        sys.exit(
            "\nNo se pudo conectar o crear la tabla: %s\n\n"
            "Si el error habla de SSL/TLS: TiDB Serverless exige TLS y el\n"
            "conector necesita los certificados del sistema. Suele arreglarse\n"
            "con `pip install --upgrade mysql-connector-python`." % e
        )
    print("  tabla listening_events lista")

    print("\nSubiendo %s eventos en lotes de 1000..." % format(len(eventos), ","))
    t1 = time.time()
    escritas = database.add_events_batch(eventos, chunk=1000)
    print("  %s filas mandadas en %.1f s" % (format(escritas, ","), time.time() - t1))

    resumen = database.get_events_summary()
    print("\n" + "=" * 64)
    print("LISTO. Lo que quedo en la base:")
    print("  eventos   : %s" % format(resumen["eventos"], ","))
    print("  canciones : %s" % format(resumen["canciones"], ","))
    print("  desde     : %s" % resumen["primera"])
    print("  hasta     : %s" % resumen["ultima"])
    print("=" * 64)


if __name__ == "__main__":
    main()
