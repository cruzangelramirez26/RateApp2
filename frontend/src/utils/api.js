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
  getRecent: (limit = 50) => request(`/tracks/recent?limit=${limit}`),
  searchTracks: (q, limit = 50) => request(`/tracks/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  getStats: () => request('/tracks/stats'),
  rateTrack: (data) => request('/tracks/rate', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getPlaylistTracks: (id) => request(`/tracks/playlist/${id}`),

  // Playlists
  getMyPlaylists: () => request('/playlists/mine'),
  getDistribution: () => request('/playlists/distribution'),
  orderPlaylist: (id, minRating) => request(`/playlists/order/${id}${minRating != null ? `?min_rating_order=${minRating}` : ''}`, { method: 'POST' }),

  // Virtual
  virtualStatus: () => request('/virtual/status'),
  virtualStart: () => request('/virtual/start', { method: 'POST' }),
  virtualSimulate: () => request('/virtual/simulate', { method: 'POST' }),
  virtualApply: (reorder = false) => request(`/virtual/apply?reorder=${reorder}`, { method: 'POST' }),
  virtualEnd: () => request('/virtual/end', { method: 'POST' }),

  // A+ Instant Detection
  aplusStatus: () => request('/tracks/aplus/status'),
  aplusScan: () => request('/tracks/aplus/scan', { method: 'POST' }),
  aplusApply: (trackIds) => request('/tracks/aplus/apply', {
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
