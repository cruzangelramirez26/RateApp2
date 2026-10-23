import { ListPlus, ListCheck } from 'lucide-react';
import { useSonando } from './sonando';
import { useA3333 } from '../../hooks/useA3333';
import { useToast } from '../../hooks/useToast';

/**
 * En la barra de arriba: manda lo que suena a <3333> (al final) para
 * calificarlo después, desde cualquier pantalla. Lleva la portada para que se
 * sepa de qué canción se habla sin leer nada. Ya dentro, se queda bloqueado.
 * En Tauri va sin texto: comparte el lado derecho con los botones de la ventana.
 */
export default function A3333({ compacto }) {
  const { sonando } = useSonando();
  const track = sonando?.track || null;
  const { estado, agregar } = useA3333(track);
  const toast = useToast();
  if (!track) return null;

  const dentro = estado === 'dentro';
  const titulo = dentro ? `${track.name} ya está en <3333>`
    : `Mandar «${track.name}» a <3333>`;
  const onClick = async () => {
    try {
      const r = await agregar();
      if (r) toast(r.ya_estaba ? `${track.name} ya estaba en <3333>` : `${track.name} → <3333>`, 'success');
    } catch (err) {
      toast(`No se pudo mandar a <3333>: ${err?.message || err}`, 'error');
    }
  };

  return (
    <button
      type="button"
      className={`esc-a3333${dentro ? ' dentro' : ''}${compacto ? ' compacto' : ''}`}
      onClick={onClick}
      disabled={estado !== 'libre'}
      title={titulo}
      aria-label={titulo}
    >
      {track.image && <img src={track.image} alt="" />}
      {dentro ? <ListCheck size={14} strokeWidth={1.75} /> : <ListPlus size={14} strokeWidth={1.75} />}
      {!compacto && <span>&lt;3333&gt;</span>}
    </button>
  );
}
