// Corre el gradlew de android/ con el entorno ya puesto, para no depender de
// variables globales: JAVA_HOME a un JDK 21 (ver abajo), el SDK en
// AppData, y la cache de proyecto (.gradle/) FUERA de OneDrive — la salida del
// build ya se redirige en android/build.gradle, esto cubre lo demas.
//
// Uso: node gradle.mjs assembleDebug
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const android = join(aqui, 'android');
const local = process.env.LOCALAPPDATA;
const sdk = process.env.ANDROID_HOME || join(local, 'Android', 'Sdk');
// OJO: NO el Java que trae Android Studio. Es Java 25, y Gradle 8.14 (el que
// genera Capacitor 8) solo corre hasta Java 24: truena con "Unsupported class
// file major version 69". Se usa un JDK 21 portatil en AppData.
const jdkDir = join(local, 'rateapp-jdk');
const java = process.env.RATEAPP_JAVA_HOME
  || (existsSync(jdkDir) && readdirSync(jdkDir).filter((d) => d.startsWith('jdk-21')).map((d) => join(jdkDir, d))[0]);

if (!java) throw new Error(`No encontre un JDK 21 en ${jdkDir} (o pon RATEAPP_JAVA_HOME)`);
if (!existsSync(sdk)) throw new Error(`No encontre el SDK de Android en ${sdk}`);

// local.properties no se versiona (lo ignora android/.gitignore); se escribe
// aqui para que un checkout limpio compile sin abrir Android Studio.
writeFileSync(join(android, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`);

const r = spawnSync(join(android, 'gradlew.bat'), [
  '--project-cache-dir', join(local, 'rateapp-android-build', '.gradle'),
  ...process.argv.slice(2),
], {
  cwd: android,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk },
});
process.exit(r.status ?? 1);
