// Copia el APK recien compilado a `instalador/` en la raiz del proyecto, junto
// al instalador de escritorio. La salida de Gradle vive fuera de OneDrive
// (android/build.gradle), asi que aqui solo viaja el APK.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const apk = join(process.env.LOCALAPPDATA, 'rateapp-android-build', 'app',
  'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(apk)) throw new Error(`No hay APK en ${apk}`);

const destino = join(aqui, '..', 'instalador');
mkdirSync(destino, { recursive: true });
copyFileSync(apk, join(destino, 'RateApp.apk'));
console.log('APK listo: instalador/RateApp.apk');
