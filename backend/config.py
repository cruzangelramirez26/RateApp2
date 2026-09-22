import os
from dotenv import load_dotenv

load_dotenv()

# Spotify
SPOTIPY_CLIENT_ID = os.getenv("SPOTIPY_CLIENT_ID", "")
SPOTIPY_CLIENT_SECRET = os.getenv("SPOTIPY_CLIENT_SECRET", "")
SPOTIPY_REDIRECT_URI = os.getenv("SPOTIPY_REDIRECT_URI", "http://localhost:8000/auth/callback")

# MySQL
MYSQL_HOST = os.getenv("MYSQL_HOST", "")
MYSQL_USER = os.getenv("MYSQL_USER", "")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "")

# App
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
PORT = int(os.getenv("PORT", 8000))

# Playlist IDs
CALIFICAR_PLAYLIST_ID = os.getenv("CALIFICAR_PLAYLIST_ID", "1kGf7O4l7tWfhWBEMuwyNx")

DISTRIBUTION_PLAYLISTS = {
    "perla":         os.getenv("PL_PERLA", "41CXGh7OcFkplIo6BF44OJ"),
    "miel":          os.getenv("PL_MIEL", "5pFFpx2dYnfUdOKW4WBN3y"),
    "latte":         os.getenv("PL_LATTE", "3DltKEaaDVOchGxfIQlPu9"),
    "mis_me_gusta":  os.getenv("PL_MMG", "43nvb8fJ7DKuo64AxBF5Cp"),
    "anual":         os.getenv("PL_ANUAL", "4BrxCvMSNdQSOEQbRXh7WN"),
    "marea_archivo": os.getenv("PL_MAREA_ARCHIVO", "2VvxQF4XrjpkDo4QmNRjTQ"),
}

# ─── Como se LLAMA cada cuatrimestre ─────────────────────────────────────
#
# LA FUENTE DE VERDAD DE LOS NOMBRES ES ESTE MAPA, y no hay otra. Antes el
# nombre visible y el identificador interno eran la misma palabra, asi que
# habia tres copias de un `_CUATRI_DISPLAY` que se limitaban a capitalizar el
# id. Eso ya mentia: en 2025 los cuatrimestres se llamaban Savia/Lirio/Marea y
# Herramientas igual decia "Perla".
#
# `perla` / `miel` / `latte` son IDENTIFICADORES, no nombres: viven en el
# codigo, en el SQL de stats y — lo que los vuelve caros de cambiar — dentro de
# la columna `cuatrimestre_override` de MySQL, en filas reales. Nunca se
# muestran. El nombre que ve el usuario cambia cada anio y solo se toca aqui.
#
# Anio nuevo = una entrada nueva. Un anio sin bautizar cae al identificador
# capitalizado en vez de romperse.
#
# La portada se deriva del nombre: /portadas/<anio>/<Nombre>.jpg. Si el archivo
# no coincide con el nombre, se pone "img" explicito.
CUATRI_NOMBRES = {
    2025: {
        "perla": {"nombre": "Savia", "color": "#cfd8be"},
        "miel":  {"nombre": "Lirio", "color": "#efdffc"},
        "latte": {"nombre": "Marea", "color": "#bde8f3"},
    },
    # Angel los renombro en Spotify el 2026-09-21 y la etiqueta de la app es
    # IDENTICA a la de alla, decision suya: ver el mismo texto en los dos lados
    # sin traduccion mental. Cuesta que el Dashboard imprima el anio dos veces
    # ("2026 PT.-1" con "sep-dic 2026" debajo); se le advirtio y lo eligio asi.
    #
    # `img` = RESPALDO LOCAL, y solo se usa si Spotify no contesta: la portada
    # de verdad sale de Spotify en /playlists/distribution. Perla y Miel siguen
    # apuntando a sus archivos porque su arte NO cambio (todavia dice "Perla" y
    # "Miel" pintado dentro). PT.-3 va con None a proposito: su arte viejo era
    # la taza de cafe de Latte y ya no es su portada, asi que mostrarla seria
    # peor que no mostrar ninguna.
    2026: {
        "perla": {"nombre": "2026 PT.-1", "color": "#5ba8d4",
                  "img": "/portadas/2026/Perla.jpg"},
        "miel":  {"nombre": "2026 PT.-2", "color": "#f5c542",
                  "img": "/portadas/2026/Miel.jpg"},
        # #d04e54 es el carmin de las flores de la portada nueva (H=357,
        # muestreado del arte real), subido de L=0.30 a 0.56. El dominante
        # crudo era casi negro —194 de 6400 pixeles del arte tienen color
        # usable— y habria sido invisible sobre el tema oscuro. Asi da
        # 3.89:1 en claro y 4.05:1 en oscuro, mejor balanceado que el resto
        # de la paleta (Miel da 1.47:1 en claro).
        "latte": {"nombre": "2026 PT.-3", "color": "#d04e54", "img": None},
    },
}

# Orden "novedades arriba" (ver Mejoras.txt seccion 6)
#
# Una cancion de TOP_SET calificada dentro de esta ventana se ordena ENCIMA de
# todo lo historico, en vez de quedar sepultada bajo cientos de A+ viejas. La
# ventana es por playlist y proporcional a lo que la playlist dura: las de
# cuatrimestre viven 4 meses, la Galeria Anual vive 12.
#
# Solo TOP_SET puede subir. Una C+ o una B recien calificada NO se trepa arriba
# de una A+ vieja: eso seria peor que el problema original.
NOVEDAD_DIAS_CUATRI = 45   # mes y medio
NOVEDAD_DIAS_ANUAL = 90    # tres meses

# Rating system
RATINGS = ["A+", "A", "B+", "B", "C+", "C", "D"]
RATING_ORDER = {"D": 0, "C": 1, "C+": 2, "B": 3, "B+": 4, "A": 5, "A+": 6}
RATINGS_IN_ORDER = ("A+", "A", "B+", "B", "C+", "C")
TOP_SET = {"B+", "A", "A+"}
