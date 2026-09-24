// Copia el instalador NSIS recien compilado a `instalador/` en la raiz del
// proyecto, para no tener que ir a buscarlo al target-dir.
//
// El target-dir vive FUERA de OneDrive a proposito (ver .cargo/config.toml), asi
// que la ruta se lee de ahi en vez de repetirla. Solo se copia el instalador
// (~3 MB); los artefactos pesados se quedan donde estan.
import { readFileSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const config = readFileSync(join(aqui, '.cargo', 'config.toml'), 'utf8');
const targetDir = config.match(/^\s*target-dir\s*=\s*"([^"]+)"/m)?.[1];
if (!targetDir) throw new Error('No encontre target-dir en desktop/.cargo/config.toml');

const nsis = join(targetDir, 'release', 'bundle', 'nsis');
// El mas reciente, por si quedan instaladores de otra version.
const [exe] = readdirSync(nsis)
  .filter((f) => f.endsWith('-setup.exe'))
  .map((f) => ({ f, t: statSync(join(nsis, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
  .map(({ f }) => f);
if (!exe) throw new Error(`No hay instalador en ${nsis}`);

const destino = join(aqui, '..', 'instalador');
mkdirSync(destino, { recursive: true });
copyFileSync(join(nsis, exe), join(destino, exe));
console.log(`Instalador listo: instalador/${exe}`);
