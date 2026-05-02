# RateApp — Contexto para Claude

@README.md

## Reglas de trabajo

- Nunca hacer nada sin explicar primero qué entendí y qué voy a hacer
- Siempre preguntar dudas antes de asumir algo
- Solo actuar con visto bueno del usuario
- Al final de cada sesión donde se hagan cambios de código: actualizar `CLAUDE_LOG.md` con la fecha, qué se cambió y por qué, y el commit hash. Luego incluirlo en el push a GitHub.

## Deploy

- La app vive en **Render** (filesystem efímero) conectado a **GitHub** (`cruzangelramirez26/RateApp2`, rama `main`)
- Cualquier archivo escrito en disco desaparece al reiniciar — **toda persistencia va a MySQL**
- Después de cada cambio: `git add` los archivos modificados → `git commit` → `git push origin HEAD:main`

## Base de datos MySQL

Dos tablas:
- `tracks` — track_id, name, artist, album, added_at, rating, manual_order
- `config` — key/value para config persistente (ej: `aplus_cutoff`)

## Constantes clave

```
TOP_SET = {B+, A, A+}   → van a MMG y Galería Anual
RATING_ORDER = {D:0, C:1, C+:2, B:3, B+:4, A:5, A+:6}
Cuatrimestres: perla (ene-abr), miel (may-ago), latte (sep-dic)
```

## Flujo A+ Instantáneo

- Cutoff guardado en tabla `config` clave `aplus_cutoff`
- Se fija la **primera vez** que el usuario escanea y **nunca se mueve**
- `aplus_apply` acepta lista de IDs seleccionados por el usuario (no aplica todo automáticamente)

## Changelog

@CLAUDE_LOG.md
