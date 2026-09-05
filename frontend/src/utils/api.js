/**
 * API client — all backend calls go through here.
 * In dev, Vite proxy handles /tracks → localhost:8000.
 * In prod, same origin.
 */

const BASE = '';  // proxy handles it in dev, same origin in prod

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  // Auth
  authStatus: () => request('/auth/status'),
  loginUrl: () => `${BASE}/auth/login`,
  logout: () => request('/auth/logout', { method: 'POST' }),

  // Tracks
  getPending: () => request('/tracks/pending'),
  getNowPlaying: () => request('/tracks/now-playing'),
  getRecent: (limit = 50) => request(`/tracks/recent?limit=${limit}`),
  getRecentlyPlayed: () => request('/tracks/recently-played'),
  searchTracks: (q, limit = 50) => request(`/tracks/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  getStats: () => request('/tracks/stats'),
  rateTrack: (data) => request('/tracks/rate', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  rateTrackSoft: (data) => request('/tracks/rate?soft=true', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getLikedAll: (limit = 500, offset = 0) => request(`/tracks/liked-all?limit=${limit}&offset=${offset}`),
  getPlaylistTracks: (id) => request(`/tracks/playlist/${id}`),

  // Playlists
  getMyPlaylists: () => request('/playlists/mine'),
  getDistribution: () => request('/playlists/distribution'),
  orderPlaylist: (id, minRating) => request(`/playlists/order/${id}${minRating != null ? `?min_rating_order=${minRating}` : ''}`, { method: 'POST' }),
  rebuildPlaylist: (cuatri) => request(`/playlists/rebuild/${cuatri}`, { method: 'POST' }),
  rebuildAnual: () => request('/playlists/rebuild/anual', { method: 'POST' }),

  // Virtual
  virtualStatus: () => request('/virtual/status'),
  virtualStart: () => request('/virtual/start', { method: 'POST' }),
  virtualSimulate: () => request('/virtual/simulate', { method: 'POST' }),
  virtualApply: (reorder = false) => request(`/virtual/apply?reorder=${reorder}`, { method: 'POST' }),
  virtualEnd: () => request('/virtual/end', { method: 'POST' }),
  getVirtualPlaylist: () => request('/virtual/playlist'),
  reorderPlaylist: (items) => request('/virtual/reorder', {
    method: 'POST',
    body: JSON.stringify(items),
  }),

  // A+ Instant Detection
  aplusStatus: () => request('/tracks/aplus/status'),
  aplusScan: () => request('/tracks/aplus/scan', { method: 'POST' }),
  aplusApply: (trackIds) => request('/tracks/aplus/apply', {
    method: 'POST',
    body: JSON.stringify({ track_ids: trackIds }),
  }),

  // Player controls (Premium only)
  playerPause: () => request('/tracks/player/pause', { method: 'POST' }),
  playerPlay: () => request('/tracks/player/play', { method: 'POST' }),
  playerNext: () => request('/tracks/player/next', { method: 'POST' }),
  playerPrevious: () => request('/tracks/player/previous', { method: 'POST' }),
  // Reproduce el track DENTRO de la playlist (default <3333>), shuffle off
  playInContext: (trackId, playlistId = null, shuffleOff = true) =>
    request('/tracks/player/play-in-context', {
      method: 'POST',
      body: JSON.stringify({ track_id: trackId, playlist_id: playlistId, shuffle_off: shuffleOff }),
    }),

  // Historial de escuchas real (ver Mejoras.txt sección 8).
  // Sale del export de privacidad de Spotify, que la API no expone: no hay
  // endpoint de play counts. Se mantiene al día con /listening/capture.
  getListening: (trackId) => request(`/tracks/listening/${trackId}`),
  getListeningSummary: () => request('/tracks/listening/summary'),

  // Cola de "califica lo que sí escuchas": los Me Gusta que nunca pasaron por
  // RateApp, ordenados por escuchas reales. Tarda: recorre TODOS los Me Gusta
  // de Spotify (~47 llamadas para 2,300).
  getBackfillQueue: () => request('/tracks/backfill/queue'),

  // Limpieza de Me Gusta.
  // OJO: aquí se dijo alguna vez que "las menos escuchadas no existen". Estaba
  // MAL MEDIDO — se miró el umbral 0-2 plays. Con la mediana en 20 escuchas,
  // 5 sí es casi nada: hay 115 así y 405 con 10 o menos.
  //
  // TODOS los Me Gusta con sus escuchas, sin filtrar. El umbral lo pone Angel
  // desde la UI, no el backend: con la mediana en 20 escuchas, 5 ya es "casi
  // nunca", y ese corte solo lo sabe él.
  getCleanupQueue: () => request('/tracks/cleanup/queue'),
  getAbandoned: (meses = 12, minPlays = 5) =>
    request(`/tracks/abandoned/queue?meses=${meses}&min_plays=${minPlays}`),
  // Única acción destructiva de la app: siempre desde una selección explícita.
  unlikeTracks: (trackIds) => request('/tracks/unlike', {
    method: 'POST',
    body: JSON.stringify({ track_ids: trackIds }),
  }),
  // Arma una playlist real con lo primero de la cola y la reproduce, para no
  // ir canción por canción. Reutiliza siempre la misma playlist.
  // trackIds explícito = "escuchar de la 60 a la 100" sin tener que calificar
  // las 50 primeras. Si va vacío, el backend toma las primeras N de la cola.
  buildQueuePlaylist: (source = 'backfill', limit = 50, play = true, trackIds = null) =>
    request(`/tracks/backfill/playlist?source=${source}&limit=${limit}&play=${play}`, {
      method: 'POST',
      body: JSON.stringify({ track_ids: trackIds }),
    }),

  // Migración de cuatrimestre
  getMigrationCandidates: () => request('/tracks/migrate/candidates'),
  migrateTracks: (trackIds, toCuatrimestre) => request('/tracks/migrate', {
    method: 'POST',
    body: JSON.stringify({ track_ids: trackIds, to_cuatrimestre: toCuatrimestre }),
  }),
};
