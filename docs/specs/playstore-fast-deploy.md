# Especificación: Despliegue Rápido a Google Play Store (`PlayStore Fast Deploy`)

## 1. Contexto y Objetivo
El usuario ya cuenta con su **cuenta de Google Play Console ($25 USD pagados)** y busca una forma rápida, repetible y segura de compilar, firmar y publicar aplicaciones Android (`.aab`) hacia Play Store, evitando los pasos manuales repetitivos en el panel web.

Esta especificación cubre:
1. **El flujo técnico mínimo y más rápido** para publicar (requisito único inevitable de Google: la **primera subida** de una app nueva y la configuración inicial de ficha/políticas se hace una sola vez en Play Console; a partir de la versión 2, todo el ciclo es **100% automático en 1 comando / 1 clic**).
2. **Integración en AgentHub**: una acción rápida en `action-handlers.ts` + asistente/modal de configuración y ejecución en la terminal integrada.

---

## 2. Arquitectura de la Solución

### Flujo de 2 Fases
1. **Onboarding único por app (Setup Wizard / Checklist):**
   - Crear la app en Google Play Console y subir manualmente el **primer `.aab`** en pista *Internal Testing* (obligación de Google Play).
   - Crear una **Service Account** en Google Cloud vinculada a Play Console con permiso *Release Manager* y descargar su JSON (`play-store-key.json`, guardado fuera de git).
   - Generar/registrar el **Keystore** de firma Android (`upload-keystore.jks`) y variables en `.env.playstore` (gitignored).
2. **Despliegue Rápido (Día a día — 1 clic / 1 comando):**
   - **Pre-flight checks**: verificar `versionCode` > último publicado, existencia de keystore, JSON de service account no expuesto en git, y tests pasando.
   - **Build & Sign**: generar `.aab` firmado (`./gradlew bundleRelease` para Android/Kotlin/Capacitor, `flutter build appbundle --release` para Flutter, o `eas build` / `gradlew` para React Native/Expo).
   - **Upload automático vía API oficial (`androidpublisher v3`)**: subir el `.aab` al track elegido (`internal`, `alpha`, `beta`, `production`) con release notes y `status: completed | draft`.

### Stack Recomendado (Sin fricción en Windows/Node)
- **Opción A (Nativa Node.js en AgentHub — recomendada):** usar `@googleapis/androidpublisher` (o `googleapis` / script Node ligero) directamente desde AgentHub, sin obligar al usuario a instalar Ruby/Fastlane en Windows.
- **Opción B (CLI estándar):** `fastlane supply` como alternativa si el proyecto ya tiene `fastlane/Fastfile`.

---

## 3. Modelo de Datos

### Configuración por proyecto (`.agent-hub/playstore.json` — sin secretos)
```ts
export type MobileFramework = 'android-native' | 'flutter' | 'react-native' | 'expo' | 'capacitor';
export type PlayTrack = 'internal' | 'alpha' | 'beta' | 'production';

export interface PlayStoreConfig {
  packageName: string; // ej. com.miempresa.miapp
  framework: MobileFramework;
  defaultTrack: PlayTrack;
  aabPath?: string; // ruta relativa al .aab generado
  serviceAccountKeyPath: string; // ruta local fuera del repo o en .gitignore
  keystorePath?: string;
  autoIncrementVersionCode: boolean;
}

export interface PlayDeployRun {
  id: string;
  packageName: string;
  track: PlayTrack;
  versionName: string;
  versionCode: number;
  status: 'preflight' | 'building' | 'uploading' | 'success' | 'failed';
  startedAt: number;
  finishedAt?: number;
  error?: string;
}
```
> **Seguridad:** Los secretos (`serviceAccountKeyPath`, contraseñas del keystore `KEYSTORE_PASS`, `KEY_ALIAS`, `KEY_PASS`) **nunca** se guardan en `.agent-hub/playstore.json`; se leen de `.env.playstore` (añadido automáticamente a `.gitignore`) o variables de entorno del sistema.

---

## 4. Endpoints / Mensajes IPC e Integración en AgentHub

1. **Acción en `src/host/handlers/action-handlers.ts`:**
   - Registrar `'playstore-deploy'` en `ACTION_RUNNERS` y en la paleta de acciones del workspace.
2. **Mensajes Webview ↔ Host:**
   - `playstoreInspectProject`: `{ cwd: string }` → detecta framework (`pubspec.yaml`, `android/app/build.gradle`, `capacitor.config.*`, `app.json`), `packageName` y si ya existe `.agent-hub/playstore.json`.
   - `playstoreSaveConfig`: `{ cwd: string; config: PlayStoreConfig }` → guarda configuración sin secretos y asegura `.gitignore`.
   - `playstoreRunDeploy`: `{ cwd: string; track: PlayTrack; releaseNotes?: string; dryRun?: boolean }` → ejecuta pre-flight, build `.aab` y subida vía `androidpublisher v3`, transmitiendo progreso a la terminal integrada (`terminalOutput`).

---

## 5. Criterios de Aceptación (Given / When / Then)

- **CA-1 (Detección automática de proyecto móvil):**
  - *Given* un workspace con `pubspec.yaml` o `android/app/build.gradle(.kts)`,
  - *When* el usuario abre la acción `Deploy Play Store`,
  - *Then* el sistema detecta el framework, extrae el `applicationId` / `packageName` y sugiere el comando de build `.aab`.

- **CA-2 (Bloqueo de seguridad por secretos expuestos):**
  - *Given* un archivo `play-store-key.json` o `.jks` dentro del repositorio sin estar en `.gitignore`,
  - *When* se ejecuta el pre-flight de despliegue,
  - *Then* el despliegue se detiene antes de compilar y ofrece añadir los patrones a `.gitignore` automáticamente.

- **CA-3 (Despliegue rápido a Internal Testing):**
  - *Given* un proyecto configurado con keystore y Service Account válidos,
  - *When* el usuario ejecuta `Deploy → internal`,
  - *Then* se compila el `.aab` firmado, se sube mediante `Google Play Developer API v3` al track `internal` y se muestra el `versionCode` publicado en el log.

- **CA-4 (Modo Dry-Run):**
  - *Given* la opción `dryRun: true` activada,
  - *When* el usuario lanza el flujo,
  - *Then* se ejecutan pre-flight checks y compilación del `.aab` firmado sin subir nada a Play Console.

---

## 6. Tareas Atómicas de Implementación
1. **T1 (Detector & Pre-flight):** Crear módulo `src/host/playstore-deploy.ts` para detectar framework móvil, leer `packageName` y validar `.gitignore` / credenciales.
2. **T2 (Uploader API v3):** Implementar cliente de subida `.aab` usando `googleapis` (`androidpublisher.edits.insert`, `bundles.upload`, `tracks.update`, `edits.commit`) con soporte `dryRun`.
3. **T3 (Handlers & Acción):** Exponer mensajes IPC (`playstoreInspectProject`, `playstoreSaveConfig`, `playstoreRunDeploy`) y registrar `'playstore-deploy'` en `ACTION_RUNNERS`.
4. **T4 (UI Wizard / Modal):** Crear modal compacto en `src/webview/components/PlayStoreDeployModal.tsx` con selector de track (`internal`/`alpha`/`beta`/`production`), release notes, checklist de primera subida y botón "Desplegar ahora".
5. **T5 (Tests):** Tests unitarios de detección de framework, validación de `.gitignore` y flujo `dryRun` mockeado.

---

## 7. Riesgos y Mitigaciones
- **Riesgo 1 (Regla de primera subida de Google Play):** La API `androidpublisher` rechaza subidas si la app nunca tuvo un `.aab` subido manualmente en Play Console.
  - *Mitigación:* El checklist del modal muestra explícitamente "Paso 1 único: sube tu primer `.aab` en Play Console" y ofrece un botón "Compilar primer `.aab` y abrir carpeta" para arrastrarlo en segundos.
- **Riesgo 2 (Cuentas personales nuevas — Política de 12 testers / 14 días):** Si la cuenta de $25 es personal (no organización) creada recientemente, Google exige pruebas cerradas con testers antes de pasar a Producción.
  - *Mitigación:* Configurar `internal` como track por defecto para pruebas inmediatas en segundos y `beta` (Closed Testing) a 1 clic.
- **Riesgo 3 (Filtración de Keystore o Service Account JSON):** Subir credenciales a GitHub compromete la firma de la app para siempre.
  - *Mitigación:* Pre-flight obligatorio que bloquea si `.jks`, `.keystore` o `*-playstore-key.json` están trackeados por git.
