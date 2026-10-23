import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../utils/api';
import { anunciarAgregada, escucharAgregadas } from '../utils/reproductor';

/**
 * El botón de "mandar a <3333>" (2026-10-22): lo que suena entra al final de
 * la cola para calificarlo después, sin abrir Spotify. Lo usan el PiP, la
 * barra de arriba del escritorio y la barra de abajo del móvil.
 *
 * `estado`:
 *   null          no hay canción
 *   'consultando' preguntando si ya está
 *   'libre'       se puede mandar
 *   'enviando'    petición en vuelo
 *   'dentro'      ya está en <3333>: el botón se bloquea (decisión de Angel:
 *                 no la quita, para no sacarla por un toque de más)
 *
 * Lo que ya se sabe se guarda por id para no volver a preguntar cada vez que
 * se monta un botón. Si la consulta falla se deja 'libre': el backend no
 * duplica, así que intentarlo es seguro.
 */
const sabido = new Map();   // track_id -> true (dentro) | false (libre)

export function useA3333(track) {
  const id = track?.id || null;
  const [estado, setEstado] = useState(null);
  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    if (!id) { setEstado(null); return; }
    if (sabido.has(id)) { setEstado(sabido.get(id) ? 'dentro' : 'libre'); return; }
    setEstado('consultando');
    api.estaEnCalificar(id)
      .then((r) => {
        sabido.set(id, !!r.en_calificar);
        if (idRef.current === id) setEstado(r.en_calificar ? 'dentro' : 'libre');
      })
      .catch(() => { if (idRef.current === id) setEstado('libre'); });
  }, [id]);

  // Mandada desde otro botón u otra ventana (el PiP y la app se enteran).
  useEffect(() => escucharAgregadas((t) => {
    if (!t?.id) return;
    sabido.set(t.id, true);
    if (idRef.current === t.id) setEstado('dentro');
  }), []);

  /** Devuelve {ya_estaba} si salió bien; lanza el error si no. */
  const agregar = useCallback(async () => {
    if (!track?.id || estado !== 'libre') return null;
    const t = track;
    setEstado('enviando');
    try {
      const r = await api.agregarACalificar(t.id);
      sabido.set(t.id, true);
      if (idRef.current === t.id) setEstado('dentro');
      anunciarAgregada(t, !r.ya_estaba);
      return r;
    } catch (err) {
      if (idRef.current === t.id) setEstado('libre');
      throw err;
    }
  }, [track, estado]);

  return { estado, agregar };
}
