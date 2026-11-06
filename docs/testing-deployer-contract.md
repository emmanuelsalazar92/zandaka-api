# Instalación única del desplegador de testing

**Ampliación ZA-97:** consultar [perfiles, hashes y aceptación actual](testing-deployer-za97.md). El cliente soporta `plan API_DIGEST WEB_DIGEST za90-za97` y deriva de ese plan el perfil de deploy. El contrato siguiente conserva la referencia inicial ZA-90; sus recibos anteriores continúan legibles. La aceptación remota del perfil nuevo ya pasó desde Windows; crear un plan nuevo para las candidatas del bloque solicitado.

## Estado y responsables

Este documento conserva el contrato utilizado para preparar e instalar el endpoint. **La instalación del Mac y la aceptación remota de lectura ya se completaron; el estado operativo vigente está en [desplegador instalado](testing-deployer-installed.md). No se ha ejecutado un deploy real.** El propietario pidió automatizar las entregas posteriores al bootstrap SSH exclusivo de prueba.

Windows mantiene el cliente y verifica el resultado. La instalación local del Mac ya descubrió la configuración efectiva, instaló el endpoint y registró código/pruebas en la [página SSH](https://app.notion.com/p/40fb70136a488093be28d20334b0ac4a). Este contrato conserva sus requisitos; el registro instalado informa lo efectivamente comprobado. Los bloques normales se gestionan desde Windows sin ampliar el acceso por cada entrega ni conceder un shell remoto general.

## Datos de instalación y descubrimiento

Son datos ya comunicados: usuario `emmanuelsalazar`, Compose `/Users/emmanuelsalazar/Documents/MacOS/Testing/docker-compose.yml`, proyecto comunicado `zandaka-testing`, servidor `192.168.31.35`. Se verificó identidad SSH y legibilidad del Compose, **no su contenido ni los servicios/montajes**.

Antes de instalar, descubrir localmente y registrar únicamente datos operativos sin secretos:

- Rutas reales y versiones de Node/Docker/Compose, contexto y arquitectura del daemon. No suponer ubicaciones Homebrew ni contexto por defecto.
- Nombre efectivo del proyecto y servicios API/web, contenedores y sus etiquetas Compose; imágenes actuales, IDs y digests necesarios para revertir.
- `DB_PATH` efectivo de la API, existencia del archivo, montaje que lo contiene, tipo/source/destination y relación entre ruta interna y persistente. No crear una DB vacía o sustituir el volumen. No leer filas o migrar la base durante esta instalación.
- URL/puerto local de web y comprobaciones de API, web y proxy. La URL web de la IP nueva todavía no se verificó desde Windows; no suponer que el puerto anterior sigue vigente.
- Ubicación privada de backups, journals y locks del desplegador, fuera de Git. Comprobar permisos/propietario y evitar symlinks que permitan retargetear operaciones.

Se puede resolver Compose/inspeccionar Docker en memoria para extraer esos datos; **no publicar salidas completas de config, inspect, `.env`, credenciales o tokens**. La configuración instalada debe tener valores reales, sin marcadores. Si falta un dato, devolver ese bloqueo concreto en Notion y no habilitar una operación insegura.

## Instalación host local

El launcher, configuración y helpers viven fuera de repositorios, volúmenes de aplicación y artefactos actualizables por PR, bajo control del propietario. Usar modo 700 para directorios/launcher y 600 para configuración y journals; comprobar propietarios y ausencia de escritura por otros. El launcher fija ejecutables/rutas y elimina `NODE_OPTIONS`, `NODE_PATH`, `BASH_ENV` y `ENV` antes de iniciar Node.

Reemplazar **solo la entrada de esta clave** en authorized_keys, manteniendo `restrict` y un comando obligatorio hacia el launcher. Preservar otras claves y comprobar que esta no figure duplicada sin restricciones. Conservar el endpoint viejo hasta que pase el nuevo. No cambiar la verificación estricta de identidad del cliente Windows, abrir SSH a Internet, habilitar PTY/forwarding/SFTP ni otorgar sudo.

El endpoint interpreta `SSH_ORIGINAL_COMMAND` como datos. Validar la cadena completa contra la gramática siguiente **antes de cualquier acción**. Prohibidos `eval`, `sh -c`, concatenar comandos de usuario o ejecutar scripts/código recibidos por SSH. Invocar Docker con arrays de argumentos y un contexto fijado localmente; eliminar overrides ambientales de Docker/Compose que puedan cambiar el destino. No modificar archivos del repositorio o el Compose base durante un deploy; usar overrides locales de imágenes y registrar cómo reproducirlos.

## Protocolo fijo v1

Los identificadores son UUID v4 canónicos en minúsculas. Los digests tienen exactamente la forma `sha256:` seguida de 64 caracteres hexadecimales en minúsculas. Los nombres siguientes son notación de campos, no comandos con valores reales listos para ejecutar:

| Petición exacta                                          | Alcance                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `probe`                                                  | Conservar las tres líneas del bootstrap actual y retorno 0                         |
| `inspect`                                                | Metadatos de entorno/servicios/DB y capacidades, sin tocar DB o contenedores       |
| `plan API_DIGEST WEB_DIGEST`                             | Plan y validaciones de destino, sin pull, stop, migración o cambio de imágenes     |
| `deploy REQUEST_UUID API_DIGEST WEB_DIGEST PLAN_ID za90` | Trabajo durable, solo al pedir el propietario el despliegue                        |
| `status REQUEST_UUID`                                    | Estado y recibo del mismo trabajo, sin reenviarlo                                  |
| `rollback REQUEST_UUID RELEASE_UUID`                     | Trabajo durable que revierte exclusivamente imágenes del release activo registrado |

No admitir verbos, argumentos extras, whitespace alternativo, saltos de línea o metacaracteres. Los repositorios de imagen son fijos: `ghcr.io/emmanuelsalazar92/zandaka-api` y `ghcr.io/emmanuelsalazar92/zandaka-web`; el cliente solo aporta digests. No aceptar tags móviles, repositorios arbitrarios, rutas, nombres de servicio, comandos, SQL o fragmentos de script por SSH.

Todas las respuestas salvo `probe` son un único objeto JSON con `protocol: "zandaka-testing-v1"`, `action` igual al verbo y `ok` booleano. Un rechazo debe incluir un código estable sin imprimir input, secretos o stderr crudo. `ok: false` no confirma ninguna operación.

- **inspect:** requiere `readOnly: true`; incluir capacidades reales, nombres de servicios, imágenes/IDs, metadatos del montaje y ubicaciones operativas. No incluir objetos `env`, `environment`, `password`, `secret`, `token`, `credentials`, `authorization` o `privateKey`, ni contenido de claves privadas.
- **plan:** requiere `readOnly: true`, `planId` con forma de digest, `target: { apiDigest, webDigest }` iguales a lo solicitado y datos actuales necesarios para revisar el impacto. Calcular planId sobre una representación canónica de configuración efectiva/pins, contexto, imágenes actuales, montaje/DB y objetivo. El worker vuelve a contrastarlo antes de mutar; un plan obsoleto se rechaza.
- **deploy/rollback/status:** incluir `requestId`, `phase` y `terminal`. Fases: `queued`, `running`, `succeeded`, `failed`, `rejected`, `interrupted`. Solo queued/running llevan terminal false. El campo opcional `stage` puede describir la fase operativa. Un ACK queued no es un despliegue terminado.
- **Recibo de deploy succeeded:** `result.apiDigest`, `result.webDigest`; `result.health: { api: true, web: true, proxy: true }`; `result.database: { transferRequestReady: true, historicalUnchanged: true }`; `result.backup.sha256` de 64 hex; `result.previous: { apiDigest, webDigest }` del par anterior inmutable. Registrar también IDs realmente ejecutados, rutas del respaldo/journal y estado de preparación de DB sin valores financieros.
- **Recibo de rollback succeeded:** digests efectivos iguales al par anterior del release, health api/web/proxy true, `result.rollbackOf` igual al release y `result.databaseRestored: false`. Nunca restaurar el backup automáticamente ni eliminar transfer_request.

El cliente está implementado en `scripts/testing-ssh-client.mjs`. Sus pruebas son la referencia ejecutable de validación de argumentos y recibos; no simulan que un deploy ya ocurrió en el Mac.

## Durabilidad y operación

Guardar REQUEST_UUID e intención exacta antes de iniciar. Mismo UUID/cuerpo devuelve el mismo trabajo; mismo UUID con otro cuerpo se rechaza antes de mutar. Serializar trabajos con lock exclusivo. No eliminar locks ajenos o stale ni iniciar otro despliegue para resolver un estado incierto sin inspeccionarlo.

Deploy/rollback deben devolver un ACK rápido y ejecutar un worker desacoplado de la conexión SSH, con journal privado y status consultable. Perder la conexión no debe cancelar silenciosamente un trabajo a mitad de actualización ni crear otro intento. Si el worker se interrumpe, informar interrupted y conservar diagnóstico, backup y plan anterior; no declarar éxito o restaurar DB por inferencia.

Un deploy, cuando sea solicitado, debe completar en orden:

1. Revalidar destino, contexto, proyecto, Compose, planId y montaje/archivo existentes. Detectar drift o mounts peligrosos (socket Docker, raíz del host, privilegios inesperados). Registrar par anterior y estados para reversión; no asumir que una etiqueta staging equivale a un digest.
2. Descargar solo las imágenes propias seleccionadas por digest y comprobar compatibilidad de arquitectura antes de detener servicios. Registrar referencia solicitada, ID local y revisión OCI. La selección del bloque desde Windows debe haber verificado CI/publicación del mismo commit; no ejecutar código de PR o workflows remotos como comandos de administración.
3. Detener únicamente API/web del proyecto verificado, con timeout, para que el cambio de esquema y los fingerprints no compitan con escrituras normales. No usar down -v, prune, recrear volúmenes o afectar otros proyectos. Si hay otros escritores detectados, detener el procedimiento y registrarlo.
4. Crear un respaldo SQLite consistente mediante backup API o procedimiento offline correcto con WAL/SHM. Verificar integridad del respaldo y registrar SHA256, ruta y fingerprint de tablas/valores históricos. No copiar solo el .db vivo ni imprimir filas en logs. Mantener copia/pins de configuración anterior sin publicar secretos.
5. Con la imagen API candidata y **el mismo archivo persistente existente**, comprobar transfer_request. Si está ausente, preparar únicamente ZA-90 con el instalador compilado; si existe, verificar columnas, PK y FK antes de considerarla compatible. No ejecutar migraciones monetarias, saneamiento, recálculos o inicialización de DB. Comparar tablas/valores históricos antes/después y abortar/rollback transaccional ante cambios no autorizados. Conservar violaciones preexistentes como diagnóstico, sin corregirlas implícitamente.
6. Promover API y web mediante overrides de imagen locales, `--no-build` y sin dependencias adicionales no autorizadas. Comprobar API, web y proxy con reintentos acotados. Comparar IDs de contenedores con los resueltos para las referencias seleccionadas; no confundir un digest de índice multiarch con el ID de configuración de la imagen.
7. Si falla después de detener/promover, intentar revertir el par anterior y verificarlo, conservando DB, transfer_request y confirmaciones. Registrar failed con resultado de reversión; si falla también, dejar diagnóstico explícito. No restaurar un backup automáticamente porque podría eliminar movimientos posteriores.
8. Registrar el estado efectivo y emitir succeeded únicamente cuando todo esté comprobado. Conservar historial de releases/backups/recibos y la forma de volver a levantar el mismo override, para que un compose up manual sin ese override no se confunda con el estado gestionado.

La definición exacta de ZA-90 está en `src/db/transfer-idempotency.ts` y la guía en [deploy-testing](deploy-testing.md). Un CREATE IF NOT EXISTS no demuestra compatibilidad de una tabla existente. La copia productiva de auditoría de Windows nunca es un destino.

## Pruebas de aceptación de la instalación

No ejecutar deploy, stop, backup, migraciones o rollback contra testing para probar esta instalación. Validar esas ramas con un runner Docker simulado y SQLite sintético/temporal, completamente separado del montaje real. Cubrir éxito, recuperación, esquema compatible/incompatible, preservación histórica, imágenes inválidas, directorios inesperados, doble UUID, concurrencia y pérdida de conexión. No presentar mocks como un despliegue real.

Tras instalar, Windows comprobará solo probe, inspect, plan, rechazos de gramática/PTY/forwarding/SFTP, datos reales de servicios/DB y que ningún plan cambie contenedores/DB. La primera ejecución mutante queda para una petición explícita de desplegar testing.

Al completar la instalación local, registrar en Notion:

- Configuración operativa real saneada y capacidades que efectivamente quedaron instaladas.
- Código completo del launcher/dispatcher/helpers o un bundle de sus fuentes, con SHA256 de cada archivo instalado para su revisión desde Windows. No incluir secretos/config raw.
- Pruebas de instalación y pruebas aisladas, con resultados y límites. Conservar la clave y huella ya verificadas; no generar otra clave ni reemplazar otros accesos.
- Comando exacto de entrada forzada y permisos, sin hacer el deploy real ni pedir al propietario que copie nombres de servicios o rutas.

## Uso desde Windows

La acción por defecto no existe: siempre indicar un verbo. `probe` funciona con el bootstrap actual; los demás esperan la contraparte instalada. El cliente no modifica el perfil SSH ni acepta claves de host automáticamente.

```powershell
node scripts/testing-ssh-client.mjs probe
node scripts/testing-ssh-client.mjs inspect
```

Plan recibe los dos digests seleccionados. Deploy recibe el planId que devolvió el plan, y opcionalmente un UUID ya guardado para recuperar exactamente el mismo intento. Status recibe ese UUID. Rollback recibe el UUID del release activo y requiere el recibo local confirmado que contiene el par anterior. La gramática detallada está arriba; no usar valores ilustrativos como digests reales.

Los planes y solicitudes se guardan fuera de Git en `operaciones/ssh-testing/client-state/`. No contienen la clave privada. Ante respuesta perdida, consultar status del UUID registrado y conservar el intento; no inventar otro UUID. Un ACK o error de red no es prueba de éxito.

Referencias: [configuración Compose](https://docs.docker.com/reference/cli/docker/compose/config/), [actualización de servicios](https://docs.docker.com/reference/cli/docker/compose/up/), [merge de overrides](https://docs.docker.com/reference/compose-file/merge/), [backup SQLite](https://www.sqlite.org/backup.html).
