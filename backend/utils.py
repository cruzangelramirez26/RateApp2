"""Shared utility functions."""
from datetime import datetime, timezone
import pandas as pd


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
