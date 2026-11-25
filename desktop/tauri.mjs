// Corre el CLI de Tauri con los artefactos de Rust FUERA de OneDrive.
//
// La primera compilacion genero 4.25 GB en 3,118 archivos. OneDrive no lee
// .gitignore, asi que intentaria subirlos todos, y ademas bloquea archivos
// mientras sincroniza, lo que puede tronar una compilacion a media corrida.
//
// Antes esto vivia en .cargo/config.toml con la ruta escrita a mano, pero
// Cargo no expande variables ahi y el usuario de Windows cambia entre la PC
// (cruza) y la laptop (cramirez). Aqui sale de LOCALAPPDATA de quien compile.
//
// Uso: node tauri.mjs build --bundles nsis
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const targetDir = process.env.CARGO_TARGET_DIR
  || join(process.env.LOCALAPPDATA, 'rateapp-rust-target');

const aqui = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = spawnSync('npx', ['tauri', ...process.argv.slice(2)], {
    cwd: aqui,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, CARGO_TARGET_DIR: targetDir },
  });
  process.exit(r.status ?? 1);
}
