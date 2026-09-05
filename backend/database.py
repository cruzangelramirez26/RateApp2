"""
Database layer — MySQL connection pool + all track queries.
Uses a connection pool so we don't open/close connections on every request.
"""
import mysql.connector
from mysql.connector import pooling, Error
import pandas as pd
from contextlib import contextmanager
from typing import Optional
import config

_pool: Optional[pooling.MySQLConnectionPool] = None


def _get_pool() -> pooling.MySQLConnectionPool:
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(
            pool_name="rateapp",
            pool_size=5,
            pool_reset_session=True,
            host=config.MYSQL_HOST,
            user=config.MYSQL_USER,
            password=config.MYSQL_PASSWORD,
            database=config.MYSQL_DATABASE,
            use_pure=True,
            autocommit=False,
        )
    return _pool


@contextmanager
def get_conn():
    """Context manager that yields a pooled connection and auto-closes."""
    conn = _get_pool().get_connection()
    try:
        yield conn
    finally:
        try:
            conn.close()
        except Exception:
            pass


def ensure_table():
    """Create the tracks table if it doesn't exist, and apply schema migrations."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tracks (
                track_id   VARCHAR(64)  PRIMARY KEY,
                name       VARCHAR(512) NOT NULL DEFAULT '',
                artist     VARCHAR(512) NOT NULL DEFAULT '',
                album      VARCHAR(512) NOT NULL DEFAULT '',
                added_at   DATETIME     NULL,
                rating     VARCHAR(8)   NOT NULL DEFAULT '',
                manual_order INT        NOT NULL DEFAULT 0
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        """)
        # Migration: add cuatrimestre_override column if absent
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tracks'
              AND COLUMN_NAME = 'cuatrimestre_override'
        """)
        if cur.fetchone()[0] == 0:
            cur.execute(
                "ALTER TABLE tracks "
                "ADD COLUMN cuatrimestre_override VARCHAR(10) NULL DEFAULT NULL"
            )
        conn.commit()
        cur.close()


def ensure_config_table():
    """Create the config table if it doesn't exist."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS config (
                `key`   VARCHAR(64) PRIMARY KEY,
                `value` TEXT        NULL
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        """)
        conn.commit()
        cur.close()


def get_config(key: str) -> Optional[str]:
    """Return a config value by key, or None if not set."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT `value` FROM config WHERE `key` = %s", (key,))
        row = cur.fetchone()
        cur.close()
        return row[0] if row else None


def set_config(key: str, value: str):
    """Insert or update a config value."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO config (`key`, `value`) VALUES (%s, %s) "
            "ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
            (key, value),
        )
        conn.commit()
        cur.close()


def delete_config(key: str):
    """Remove a config row. No-op if the key doesn't exist."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM config WHERE `key` = %s", (key,))
        conn.commit()
        cur.close()


def load_all() -> pd.DataFrame:
    """Return all tracks as a DataFrame."""
    with get_conn() as conn:
        try:
            return pd.read_sql("SELECT * FROM tracks", conn)
        except Error:
            return pd.DataFrame(
                columns=["track_id", "name", "artist", "album", "added_at", "rating", "manual_order"]
            )


def get_track(track_id: str) -> Optional[dict]:
    """Return a single track as dict, or None."""
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM tracks WHERE track_id = %s", (track_id,))
        row = cur.fetchone()
        cur.close()
        return row


def upsert_track(track_id: str, name: str, artist: str, album: str, added_at, rating: str):
    """Insert or update a single track."""
    # Normalize added_at
    if isinstance(added_at, pd.Timestamp):
        added_at = added_at.to_pydatetime()
    elif hasattr(added_at, "strftime"):
        added_at = added_at.strftime("%Y-%m-%d %H:%M:%S")

    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO tracks (track_id, name, artist, album, added_at, rating, manual_order)
               VALUES (%s, %s, %s, %s, %s, %s, 0)
               ON DUPLICATE KEY UPDATE
                 name=VALUES(name), artist=VALUES(artist), album=VALUES(album),
                 rating=VALUES(rating)""",
            (track_id, name, artist, album, added_at, rating),
        )
        conn.commit()
        cur.close()


def bulk_upsert(rows: list[tuple]):
    """
    Bulk insert/update.
    rows: list of (track_id, name, artist, album, added_at, rating, manual_order)
    """
    if not rows:
        return
    with get_conn() as conn:
        cur = conn.cursor()
        cur.executemany(
            """INSERT INTO tracks (track_id, name, artist, album, added_at, rating, manual_order)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE
                 name=VALUES(name), artist=VALUES(artist), album=VALUES(album),
                 added_at=VALUES(added_at), rating=VALUES(rating), manual_order=VALUES(manual_order)""",
            rows,
        )
        conn.commit()
        cur.close()


def bulk_set_rating(track_ids: list[str], rating: str):
    """Set the same rating for multiple tracks."""
    if not track_ids:
        return
    with get_conn() as conn:
        cur = conn.cursor()
        ph = ",".join(["%s"] * len(track_ids))
        cur.execute(
            f"UPDATE tracks SET rating=%s WHERE track_id IN ({ph})",
            [rating] + track_ids,
        )
        conn.commit()
        cur.close()


def search_tracks(query: str, limit: int = 50) -> list[dict]:
    """Search tracks by name or artist (LIKE)."""
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """SELECT * FROM tracks
               WHERE name LIKE %s OR artist LIKE %s
               ORDER BY added_at DESC
               LIMIT %s""",
            (f"%{query}%", f"%{query}%", limit),
        )
        rows = cur.fetchall()
        cur.close()
        return rows


def get_recent(limit: int = 50) -> list[dict]:
    """Return the most recently added/updated tracks."""
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT * FROM tracks ORDER BY added_at DESC LIMIT %s",
            (limit,),
        )
        rows = cur.fetchall()
        cur.close()
        return rows


def get_stats() -> dict:
    """Return rating distribution counts."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT rating, COUNT(*) FROM tracks GROUP BY rating")
        rows = cur.fetchall()
        cur.close()
        return {r: c for r, c in rows}


def get_stats_extended() -> dict:
    """Return extended stats: top artists and cuatrimestre breakdown."""
    with get_conn() as conn:
        cur = conn.cursor()

        cur.execute("""
            SELECT artist, COUNT(*) AS cnt
            FROM tracks
            WHERE rating NOT IN ('D', '') AND rating IS NOT NULL
            GROUP BY artist
            ORDER BY cnt DESC
            LIMIT 5
        """)
        top_artists = [{"artist": a, "count": c} for a, c in cur.fetchall()]

        cur.execute("""
            SELECT artist, COUNT(*) AS cnt
            FROM tracks
            WHERE rating NOT IN ('D', '') AND rating IS NOT NULL
              AND YEAR(added_at) = YEAR(NOW())
            GROUP BY artist
            ORDER BY cnt DESC
            LIMIT 5
        """)
        top_artists_year = [{"artist": a, "count": c} for a, c in cur.fetchall()]

        cur.execute("""
            SELECT
                YEAR(added_at) AS yr,
                CASE
                    WHEN MONTH(added_at) BETWEEN 1 AND 4 THEN 'perla'
                    WHEN MONTH(added_at) BETWEEN 5 AND 8 THEN 'miel'
                    ELSE 'latte'
                END AS cuatri,
                COUNT(*) AS cnt
            FROM tracks
            WHERE rating NOT IN ('D', '') AND rating IS NOT NULL
              AND added_at IS NOT NULL
              AND YEAR(added_at) >= YEAR(NOW()) - 2
            GROUP BY yr, cuatri
            ORDER BY yr DESC, FIELD(cuatri, 'latte', 'miel', 'perla')
        """)
        cuatri_rows = cur.fetchall()

        # Per-cuatri rating breakdown (including D) for filtered metrics in frontend
        cur.execute("""
            SELECT
                YEAR(added_at) AS yr,
                CASE
                    WHEN MONTH(added_at) BETWEEN 1 AND 4 THEN 'perla'
                    WHEN MONTH(added_at) BETWEEN 5 AND 8 THEN 'miel'
                    ELSE 'latte'
                END AS cuatri,
                rating,
                COUNT(*) AS cnt
            FROM tracks
            WHERE rating IS NOT NULL AND rating != ''
              AND added_at IS NOT NULL
              AND YEAR(added_at) >= YEAR(NOW()) - 2
            GROUP BY yr, cuatri, rating
        """)
        rating_map = {}
        for yr, c, rating, cnt in cur.fetchall():
            key = (int(yr), c)
            if key not in rating_map:
                rating_map[key] = {}
            rating_map[key][rating] = int(cnt)

        _top_order = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D']
        by_cuatri = []
        for yr, c, cnt in cuatri_rows:
            yr = int(yr)
            by_r = rating_map.get((yr, c), {})
            top_r = next((r for r in _top_order if by_r.get(r, 0) > 0), None)
            by_cuatri.append({
                "year": yr, "cuatri": c, "count": int(cnt),
                "by_rating": by_r, "top_rating": top_r,
            })

        cur.close()
        return {"top_artists": top_artists, "top_artists_year": top_artists_year, "by_cuatri": by_cuatri}


_CUATRI_MONTHS = {
    "perla": (1, 4),
    "miel": (5, 8),
    "latte": (9, 12),
}


def get_migration_candidates(from_cuatri: str, from_year: int) -> list[dict]:
    """
    Return tracks whose added_at falls in from_cuatri/from_year that haven't
    been migrated out yet. Excludes D-rated and unrated tracks.
    """
    start_m, end_m = _CUATRI_MONTHS[from_cuatri]
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """SELECT * FROM tracks
               WHERE YEAR(added_at) = %s
                 AND MONTH(added_at) BETWEEN %s AND %s
                 AND (cuatrimestre_override IS NULL OR cuatrimestre_override = %s)
                 AND rating NOT IN ('D', '')""",
            (from_year, start_m, end_m, from_cuatri),
        )
        rows = cur.fetchall()
        cur.close()
        return rows


def set_cuatrimestre_override(track_ids: list[str], to_cuatri: str):
    """Mark tracks as migrated to to_cuatri without touching added_at or rating."""
    if not track_ids:
        return
    with get_conn() as conn:
        cur = conn.cursor()
        ph = ",".join(["%s"] * len(track_ids))
        cur.execute(
            f"UPDATE tracks SET cuatrimestre_override = %s WHERE track_id IN ({ph})",
            [to_cuatri] + track_ids,
        )
        conn.commit()
        cur.close()


def get_virtual_state() -> dict:
    """Return the virtual edit mode state from DB (survives Render restarts)."""
    import json
    val = get_config("virtual_state")
    if not val:
        return {}
    try:
        return json.loads(val)
    except Exception:
        return {}


def set_virtual_state(state: dict):
    """Persist virtual edit mode state to DB."""
    import json
    set_config("virtual_state", json.dumps(state, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Historial de escuchas real  (Mejoras.txt seccion 8)
# ---------------------------------------------------------------------------
#
# Spotify NO expone play counts por API. Este agregado sale del export de
# "Historial de reproduccion extendido" (187,577 reproducciones, 2018-2026) y
# se mantiene al dia capturando /me/player/recently-played.
#
# REGLA DE RENDIMIENTO, y es la unica que importa:
# esta tabla es ~24k filas contra las ~1.3k de `tracks`, pero eso NO es lo que
# puede costar caro. Lo caro seria consultarla FILA POR FILA dentro de un loop:
# la DB vive en us-east-1 y cada viaje cuesta ~80 ms, asi que 500 canciones a
# query por cabeza son 40 SEGUNDOS. Por eso existe get_listening_many(): toda
# vista de lista usa esa, con un solo IN (...). Nunca get_listening() en un for.
#
# La tabla es INDEPENDIENTE de `tracks` a proposito. load_all() no la toca y
# ninguna query existente cambia, asi que los tiempos de carga de hoy quedan
# exactamente igual.

def _utils():
    import utils
    return utils


def ensure_listening_table():
    """Create the listening_stats table if it doesn't exist."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS listening_stats (
                track_id     VARCHAR(64)  PRIMARY KEY,
                name         VARCHAR(512) NOT NULL DEFAULT '',
                artist       VARCHAR(512) NOT NULL DEFAULT '',
                plays        INT          NOT NULL DEFAULT 0,
                skips        INT          NOT NULL DEFAULT 0,
                ms_total     BIGINT       NOT NULL DEFAULT 0,
                first_played DATETIME     NULL,
                last_played  DATETIME     NULL,
                INDEX idx_last_played (last_played),
                INDEX idx_plays (plays)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        """)
        conn.commit()
        cur.close()


_LISTENING_COLS = ("track_id, name, artist, plays, skips, ms_total, "
                   "first_played, last_played")


def replace_listening_batch(rows: list, chunk: int = 1000) -> int:
    """Overwrite listening stats for the given tracks. Used by the bulk import.

    `rows` = list of dicts with track_id, name, artist, plays, skips, ms_total,
    first_played, last_played.

    Sends `chunk` rows per round trip. One INSERT per row would be ~24k trips of
    ~80 ms each: over half an hour, and Request Units burned for nothing.
    """
    if not rows:
        return 0
    sql = """
        INSERT INTO listening_stats
            (track_id, name, artist, plays, skips, ms_total, first_played,
             last_played, match_key)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            match_key    = VALUES(match_key),
            name         = VALUES(name),
            artist       = VALUES(artist),
            plays        = VALUES(plays),
            skips        = VALUES(skips),
            ms_total     = VALUES(ms_total),
            first_played = VALUES(first_played),
            last_played  = VALUES(last_played)
    """
    total = 0
    with get_conn() as conn:
        cur = conn.cursor()
        for i in range(0, len(rows), chunk):
            batch = [
                (r["track_id"], (r.get("name") or "")[:512],
                 (r.get("artist") or "")[:512],
                 int(r.get("plays", 0)), int(r.get("skips", 0)),
                 int(r.get("ms_total", 0)),
                 r.get("first_played"), r.get("last_played"),
                 _utils().listening_key(r.get("name"), r.get("artist")))
                for r in rows[i:i + chunk]
            ]
            cur.executemany(sql, batch)
            conn.commit()
            total += len(batch)
        cur.close()
    return total


def add_listening_batch(rows: list) -> int:
    """Add plays on top of what's already stored. Used by the periodic capture.

    Distinct from replace_listening_batch on purpose: the bulk import knows the
    absolute truth for a track and overwrites it, while the capture only knows
    about the handful of plays since last time and must ADD them. Using replace
    here would reset every track to whatever the last hour happened to see.
    """
    if not rows:
        return 0
    sql = """
        INSERT INTO listening_stats
            (track_id, name, artist, plays, skips, ms_total, first_played,
             last_played, match_key)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            match_key    = VALUES(match_key),
            name         = VALUES(name),
            artist       = VALUES(artist),
            plays        = plays    + VALUES(plays),
            skips        = skips    + VALUES(skips),
            ms_total     = ms_total + VALUES(ms_total),
            first_played = LEAST(COALESCE(first_played, VALUES(first_played)),
                                 VALUES(first_played)),
            last_played  = GREATEST(COALESCE(last_played, VALUES(last_played)),
                                    VALUES(last_played))
    """
    with get_conn() as conn:
        cur = conn.cursor()
        cur.executemany(sql, [
            (r["track_id"], (r.get("name") or "")[:512],
             (r.get("artist") or "")[:512],
             int(r.get("plays", 0)), int(r.get("skips", 0)),
             int(r.get("ms_total", 0)),
             r.get("first_played"), r.get("last_played"),
             _utils().listening_key(r.get("name"), r.get("artist")))
            for r in rows
        ])
        conn.commit()
        cur.close()
    return len(rows)


def _listening_row(row) -> dict:
    ms_total = int(row[5] or 0)   # ver la nota de Decimal en get_listening_summary
    return {
        "track_id": row[0], "name": row[1], "artist": row[2],
        "plays": int(row[3] or 0), "skips": int(row[4] or 0), "ms_total": ms_total,
        "hours": round(ms_total / 3600000.0, 2),
        "first_played": row[6].isoformat() if row[6] else None,
        "last_played": row[7].isoformat() if row[7] else None,
    }


def get_listening(track_id: str) -> Optional[dict]:
    """Listening stats for ONE track. Single PK lookup: do not call in a loop."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT " + _LISTENING_COLS +
            " FROM listening_stats WHERE track_id = %s",
            (track_id,),
        )
        row = cur.fetchone()
        cur.close()
        return _listening_row(row) if row else None


def get_listening_many(track_ids: list, chunk: int = 900) -> dict:
    """Listening stats for many tracks at once -> {track_id: stats}.

    This is the one to use from any list view. Chunked because a single IN ()
    with thousands of placeholders can blow past the statement size limit.
    """
    out = {}
    ids = [t for t in dict.fromkeys(track_ids) if t]
    if not ids:
        return out
    with get_conn() as conn:
        cur = conn.cursor()
        for i in range(0, len(ids), chunk):
            part = ids[i:i + chunk]
            marks = ",".join(["%s"] * len(part))
            cur.execute(
                "SELECT " + _LISTENING_COLS +
                " FROM listening_stats WHERE track_id IN (" + marks + ")",
                tuple(part),
            )
            for row in cur.fetchall():
                out[row[0]] = _listening_row(row)
        cur.close()
    return out


def get_listening_summary() -> dict:
    """Global totals. One aggregate query, no full table transfer."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT COUNT(*), COALESCE(SUM(plays), 0), COALESCE(SUM(ms_total), 0),
                   MIN(first_played), MAX(last_played)
            FROM listening_stats
        """)
        row = cur.fetchone()
        cur.close()
        # int() antes de dividir NO es cosmetico: SUM() en MySQL devuelve
        # Decimal, y Decimal / float lanza TypeError. Con la tabla vacia el
        # COALESCE entrega un 0 entero y el bug no aparece — solo sale cuando
        # ya hay datos, que es justo cuando importa.
        ms_total = int(row[2] or 0)
        return {
            "tracks": row[0],
            "plays": int(row[1] or 0),
            "hours": round(ms_total / 3600000.0, 1),
            "first_played": row[3].isoformat() if row[3] else None,
            "last_played": row[4].isoformat() if row[4] else None,
        }


# ---------------------------------------------------------------------------
# Emparejamiento por nombre+artista  (arregla el conteo de escuchas)
# ---------------------------------------------------------------------------
#
# Spotify da IDs distintos a la misma cancion segun album, mercado o reedicion,
# asi que cruzar solo por track_id perdia reproducciones: 17 canciones de Angel
# marcaban 0 habiendolas escuchado, 884 salian subcontadas, y en total se
# perdian ~12,000 reproducciones. Ver utils.listening_key().

def ensure_listening_match_key():
    """Agrega la columna match_key si falta. Idempotente."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'listening_stats'
              AND COLUMN_NAME = 'match_key'
        """)
        if cur.fetchone()[0] == 0:
            cur.execute("ALTER TABLE listening_stats "
                        "ADD COLUMN match_key VARCHAR(255) NULL DEFAULT NULL")
            cur.execute("CREATE INDEX idx_match_key ON listening_stats (match_key)")
            conn.commit()
        cur.close()


def reindex_listening_keys(chunk: int = 1000) -> dict:
    """Recalcula match_key para todas las filas.

    Existe para no obligar a re-correr el import de 156 MB (que ademas pide la
    contrasena de MySQL a mano): la tabla ya guarda name y artist, asi que la
    clave se puede derivar de lo que hay.

    Usa INSERT ... ON DUPLICATE KEY UPDATE y NO `executemany` con UPDATE, y la
    diferencia no es de estilo: el conector agrupa los INSERT en una sola
    sentencia multi-valor, pero los UPDATE los manda de uno en uno. Con 24k
    filas a ~80 ms de viaje eso son mas de 30 MINUTOS, y el request de Cloud Run
    muere antes. Medido: la primera version se quedo colgada. Asi son ~24
    viajes y termina en segundos.

    Ningun track_id se inserta de verdad: todos salen de la propia tabla, asi
    que siempre entran por la rama del duplicado.
    """
    import utils
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT track_id, name, artist FROM listening_stats")
        filas = cur.fetchall()
        pares = [(r[0], utils.listening_key(r[1], r[2])) for r in filas]
        for i in range(0, len(pares), chunk):
            lote = pares[i:i + chunk]
            marks = ",".join(["(%s,%s)"] * len(lote))
            plano = [v for par in lote for v in par]
            cur.execute(
                "INSERT INTO listening_stats (track_id, match_key) VALUES "
                + marks +
                " ON DUPLICATE KEY UPDATE match_key = VALUES(match_key)",
                plano)
            conn.commit()
        cur.close()
    return {"filas": len(pares), "claves_unicas": len({p[1] for p in pares})}


def get_listening_for(tracks: list, chunk: int = 500) -> dict:
    """Escuchas de varias canciones -> {track_id: stats}.

    `tracks` = lista de dicts con track_id (o id), name y artist.

    SUMA todas las filas que comparten nombre+artista, que es lo que arregla el
    subconteo: una cancion puede tener varias filas con IDs distintos y las
    reproducciones estan repartidas entre ellas.

    Cae al emparejamiento por track_id cuando la fila todavia no tiene
    match_key (tabla sin reindexar) o cuando la clave no encuentra nada.
    """
    import utils
    if not tracks:
        return {}

    porTrack, claves, ids = {}, {}, []
    for t in tracks:
        tid = t.get("track_id") or t.get("id")
        if not tid:
            continue
        k = utils.listening_key(t.get("name"), t.get("artist"))
        claves[tid] = k
        ids.append(tid)
    if not ids:
        return {}

    # 1) por clave, agregando las filas repartidas entre varios IDs
    porClave = {}
    unicas = sorted({k for k in claves.values() if k and k != "|"})
    with get_conn() as conn:
        cur = conn.cursor()
        for i in range(0, len(unicas), chunk):
            parte = unicas[i:i + chunk]
            marks = ",".join(["%s"] * len(parte))
            cur.execute(
                "SELECT match_key, SUM(plays), SUM(skips), SUM(ms_total), "
                "MIN(first_played), MAX(last_played) "
                "FROM listening_stats WHERE match_key IN (" + marks + ") "
                "GROUP BY match_key", tuple(parte))
            for row in cur.fetchall():
                porClave[row[0]] = row

        # 2) respaldo por track_id, para lo que la clave no cubrio
        faltan = [t for t in ids if claves.get(t) not in porClave]
        porId = {}
        for i in range(0, len(faltan), chunk):
            parte = faltan[i:i + chunk]
            marks = ",".join(["%s"] * len(parte))
            cur.execute(
                "SELECT track_id, SUM(plays), SUM(skips), SUM(ms_total), "
                "MIN(first_played), MAX(last_played) "
                "FROM listening_stats WHERE track_id IN (" + marks + ") "
                "GROUP BY track_id", tuple(parte))
            for row in cur.fetchall():
                porId[row[0]] = row
        cur.close()

    for tid in ids:
        row = porClave.get(claves.get(tid)) or porId.get(tid)
        if not row:
            continue
        ms = int(row[3] or 0)
        porTrack[tid] = {
            "track_id": tid,
            "plays": int(row[1] or 0),
            "skips": int(row[2] or 0),
            "ms_total": ms,
            "hours": round(ms / 3600000.0, 2),
            "first_played": row[4].isoformat() if row[4] else None,
            "last_played": row[5].isoformat() if row[5] else None,
        }
    return porTrack
