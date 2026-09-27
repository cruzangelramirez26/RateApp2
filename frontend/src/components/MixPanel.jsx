/**
 * Lo de adentro de la tarjeta "Mix" de Herramientas, compartido por el
 * escritorio (dentro de su Ventana) y el móvil (dentro de Crece). Solo cambian
 * las clases de los botones; el acomodo vive en `.mix-*` (global.css).
 *
 * Estilo Blend, decidido por Angel el 2026-09-27: primero lo que los dos
 * escuchan, luego lo que uno escucha y el otro tiene en Me Gusta, y el resto
 * una y una. Un mes, 50 canciones, se rehace cada semana.
 */

function fecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function MixPanel({ m, movil = false }) {
  const pri = movil ? 'mv-boton pri' : 'esc-primario';
  const sec = movil ? 'mv-boton' : 'esc-fantasma esc-fantasma-chico';
  const { estado, ocupado } = m;

  if (!estado) return <p className="mix-p">Cargando…</p>;
  const { personas, invitacion } = estado;

  const bloqueInvitacion = invitacion ? (
    <div className="mix-invitacion">
      <div className="mix-rotulo">Link de invitación · vence {new Date(invitacion.expira).toLocaleDateString('es-MX', { weekday: 'long' })}</div>
      <input className="mix-link" readOnly value={invitacion.url} onFocus={(e) => e.target.select()} />
      <div className="mix-acciones">
        <button type="button" className={pri} onClick={() => m.compartir(invitacion.url)}>
          {movil && navigator.share ? 'Compartir' : 'Copiar link'}
        </button>
        <button type="button" className={sec} disabled={!!ocupado} onClick={m.invitar}>Otro link</button>
      </div>
      <p className="mix-p tenue">Sirve una sola vez. Que lo abra en su celular, con su cuenta de Spotify.</p>
    </div>
  ) : (
    <button type="button" className={personas.length ? sec : pri} disabled={!!ocupado} onClick={m.invitar}>
      {ocupado === 'invitar' ? 'Creando…' : personas.length ? 'Invitar a otra persona' : 'Crear link de invitación'}
    </button>
  );

  return (
    <div className="mix">
      {!personas.length && (
        <>
          <p className="mix-p">
            Le mandas un link, entra con su Spotify y se arma una playlist de {estado.tamano} en tu cuenta con lo
            que los dos escuchan este mes. Su conexión es de solo lectura: no puede tocar tus playlists.
          </p>
          <p className="mix-p tenue">
            Antes: agrégala en developer.spotify.com → tu app → User Management, con el correo de su Spotify.
            La app está en modo desarrollo y Spotify no la deja entrar sin eso.
          </p>
        </>
      )}

      {personas.map((p) => {
        const mx = p.mix;
        return (
          <section key={p.id} className="mix-persona">
            <div className="mix-persona-cab">
              <div>
                <b>Tú + {p.nombre}</b>
                <span>{mx ? `Actualizado ${fecha(mx.fecha)} · se rehace cada semana` : 'Conectada · todavía sin mix'}</span>
              </div>
              <button type="button" className="mix-quitar" disabled={!!ocupado} onClick={() => m.desconectar(p.id, p.nombre)}>Desconectar</button>
            </div>

            {mx && (
              <div className="mix-cifras">
                <div><b>{mx.ambos}</b><span>de los dos</span></div>
                <div><b>{mx.tuyas}</b><span>tuyas</span></div>
                <div><b>{mx.suyas}</b><span>suyas</span></div>
              </div>
            )}

            <div className="mix-acciones">
              <button type="button" className={pri} disabled={!!ocupado} onClick={() => m.rehacer(p.id)}>
                {ocupado === `rehacer-${p.id}` ? 'Armando… (unos segundos)' : mx ? 'Rehacer ahora' : 'Armar el mix'}
              </button>
              {mx && (
                <>
                  <button type="button" className={sec} disabled={!!ocupado} onClick={() => m.reproducir(p.id)}>
                    {ocupado === `play-${p.id}` ? '…' : 'Escuchar'}
                  </button>
                  <a className={sec} href={mx.spotify_url} target="_blank" rel="noreferrer">Abrir en Spotify</a>
                </>
              )}
            </div>

            {mx?.items?.length > 0 && (
              <ol className="mix-lista">
                {mx.items.map((t, i) => (
                  <li key={t.track_id} title={t.motivo}>
                    <span className="mix-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="mix-cancion"><b>{t.name || '—'}</b><span>{t.artist}</span></span>
                    <span className={`mix-de ${t.de}`}>{t.de === 'ambos' ? 'Los dos' : t.de === 'a' ? 'Tú' : p.nombre.split(' ')[0]}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}

      {bloqueInvitacion}
    </div>
  );
}
