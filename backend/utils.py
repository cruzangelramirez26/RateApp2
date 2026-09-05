"""Shared utility functions."""
from datetime import datetime, timezone
import pandas as pd

# Previous cuatrimestre in the cycle. Latte has no defined next for now.
CUATRIMESTRE_PREV = {
    "perla": None,
    "miel": "perla",
    "latte": "miel",
}


def get_cuatrimestre(dt: datetime) -> str:
    """Return cuatrimestre name based on month."""
    m = dt.month
    if 1 <= m <= 4:
        return "perla"
    elif 5 <= m <= 8:
        return "miel"
    else:
        return "latte"


def safe_to_datetime(x, utc=True):
    """Parse dates robustly — handles Spotify ISO and MySQL formats."""
    try:
        return pd.to_datetime(x, errors="coerce", utc=utc)
    except Exception:
        if isinstance(x, str):
            try:
                dt = datetime.fromisoformat(x.replace("Z", "+00:00"))
                return dt if utc else dt.replace(tzinfo=None)
            except Exception:
                pass
        return pd.NaT


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_utc_str() -> str:
    return now_utc().strftime("%Y-%m-%dT%H:%M:%SZ")


def chunk_list(lst, n):
    """Yield chunks of size n from lst."""
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def dedupe_preserve_order(ids: list) -> list:
    """Remove duplicates while preserving order."""
    seen = set()
    out = []
    for x in ids:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


# ---------------------------------------------------------------------------
# Clave de emparejamiento para el historial de escuchas
# ---------------------------------------------------------------------------
#
# POR QUE EXISTE. Spotify le da IDs DISTINTOS a la misma cancion segun el album,
# el mercado o la reedicion (track relinking). El id que aparece en el export de
# historial no siempre es el que hoy tiene esa cancion en Me Gusta, asi que
# cruzar solo por `track_id` pierde reproducciones.
#
# Medido contra los datos reales de Angel: 17 canciones marcaban 0 escuchas
# habiendolas escuchado (LUCES DE COLORES decia 0 y tenia 18), y 884 mas salian
# subcontadas. En total se perdian ~12,000 reproducciones.
#
# LA NORMALIZACION ES A PROPOSITO CONSERVADORA: minusculas, acentos, caracteres
# invisibles (el export trae U+2060 en algunos titulos) y puntuacion. Y NADA
# mas. Se probo una version que ademas truncaba en " - " o " (feat" y fusionaba
# "Punto G (Remix)" con "Punto G (feat. Darell)", que son canciones distintas:
# esa se descarto. La conservadora solo junta variantes de escritura del mismo
# titulo, y recupera 16 de las 17 perdidas mas 815 conteos corregidos.

import re
import unicodedata


def norm_text(s: str) -> str:
    """Minusculas sin acentos, sin invisibles y sin puntuacion.

    Defensiva a proposito con lo que no es texto: una ruta de FastAPI llamada
    de Python a Python recibe sus defaults como objetos `Query`, no como el
    valor, y sin esta guarda `unicodedata.normalize` truena con un TypeError
    confuso. Ya paso una vez con `backfill_playlist`.
    """
    if not isinstance(s, str):
        s = "" if s is None else str(s)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = "".join(c for c in s if unicodedata.category(c) != "Cf")
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def listening_key(name: str, artist: str) -> str:
    """Clave con la que se agrupan las escuchas de una misma cancion."""
    return (norm_text(name) + "|" + norm_text(artist))[:255]
