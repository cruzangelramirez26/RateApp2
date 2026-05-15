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
        return {"top_artists": top_artists, "by_cuatri": by_cuatri}


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
