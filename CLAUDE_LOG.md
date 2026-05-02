# Changelog de sesiones

---

## 2026-05-01

**Bug corregido: A+ Instantáneo**

Problema: el cutoff se guardaba en `a_plus_cutoff.json` (archivo local). En Render, ese archivo se borraba en cada reinicio. Además, el cutoff se movía después de cada apply, lo que hacía que canciones antiguas volvieran a aparecer.

Cambios:
- `backend/database.py` — `ensure_config_table()`, `get_config()`, `set_config()`: tabla `config` en MySQL
- `backend/main.py` — llama `ensure_config_table()` en lifespan
- `backend/models.py` — nuevo modelo `AplusApplyRequest` con `track_ids: list[str]`
- `backend/routes/tracks.py` — cutoff migrado a MySQL, `aplus_apply` no mueve el cutoff, acepta IDs seleccionados
- `frontend/src/utils/api.js` — `aplusApply(trackIds)` manda los IDs seleccionados
- `frontend/src/pages/StatsPage.jsx` — checkboxes por candidato, todos marcados por defecto, botón "Marcar/Desmarcar todo", botón Aplicar muestra conteo y se deshabilita si hay 0 seleccionados

Commit: `9432400` → desplegado en Render.
