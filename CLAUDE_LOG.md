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

---

## 2026-05-01 (sesión 2)

**Feature: Migración de cuatrimestre + página Herramientas**

Nueva funcionalidad para mover canciones del cuatrimestre anterior al actual sin alterar `added_at` ni `rating`. Las canciones históricas permanecen visibles en su cuatrimestre de origen; la migración es aditiva (se agregan a la playlist destino en Spotify, la playlist origen queda intocable).

Ciclo definido: Perla → Miel → Latte → (sin siguiente por ahora).

Cambios:
- `backend/database.py` — `ensure_table()` aplica migración de columna `cuatrimestre_override` (nullable); `get_migration_candidates(from_cuatri, from_year)` filtra por año exacto y excluye ya migradas; `set_cuatrimestre_override(track_ids, to_cuatri)`
- `backend/utils.py` — constante `CUATRIMESTRE_PREV` con el ciclo
- `backend/models.py` — nuevo modelo `MigrateRequest`
- `backend/routes/tracks.py` — `GET /tracks/migrate/candidates` y `POST /tracks/migrate`
- `frontend/src/utils/api.js` — `getMigrationCandidates()` y `migrateTracks()`
- `frontend/src/pages/ToolsPage.jsx` — página nueva con Modo Virtual, A+ Instantáneos, Migración y Orden de playlists
- `frontend/src/pages/StatsPage.jsx` — simplificado, solo muestra distribución de ratings
- `frontend/src/components/NavBar.jsx` — tab "Herramientas" antes de Dashboard
- `frontend/src/App.jsx` — ruta `/tools`

Commit: pendiente
