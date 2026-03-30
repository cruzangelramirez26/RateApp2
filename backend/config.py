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
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))

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

# Rating system
RATINGS = ["A+", "A", "B+", "B", "C+", "C", "D"]
RATING_ORDER = {"D": 0, "C": 1, "C+": 2, "B": 3, "B+": 4, "A": 5, "A+": 6}
RATINGS_IN_ORDER = ("A+", "A", "B+", "B", "C+", "C")
TOP_SET = {"B+", "A", "A+"}
