# Ampliación del desplegador para ZA-97

Registro del 5 de noviembre de 2026, hora de Costa Rica. CodexMacOS publicó en [SSH de Notion](https://app.notion.com/p/40fb70136a488093be28d20334b0ac4a) las fuentes, hashes y resultados de la ampliación instalada. Windows verificó fuentes/pins, actualizó el cliente y **completó la aceptación remota de solo lectura**. El propietario comunicó la nueva IP `192.168.31.118`; se comprobó la misma identidad de servidor fijada antes de actualizar únicamente HostName en el perfil dedicado. La dirección anterior `.35` produjo timeout y quedó obsoleta. Esta aceptación acredita la herramienta; no acredita preparación de la DB real.

No se ejecutó deploy, rollback, backup o preparación contra la DB del usuario durante esta aceptación. El estado de `budget_plan` en testing sigue sin comprobarse. La instalación del desplegador y la preparación del esquema son pasos distintos.

## Qué cambió

El helper y el endpoint del Mac soportan dos perfiles cerrados: `za90` prepara únicamente `transfer_request`; `za90-za97` prepara y verifica además `budget_plan`. La instalación conserva launcher, backup, clave/comando forzado, restricciones SSH, runtime Compose, journals y releases. El Mac informó 46 pruebas aisladas y comprobaciones locales de solo lectura. Windows revisó el código y sus pins, y ejecutó 19 pruebas adicionales de SQLite temporal usando el helper revisado y los **exports compilados reales** de la API 1ec71ac, sin el fixture CommonJS de presupuesto del Mac. Todas pasaron.

La preparación usa una transacción inmediata exterior, en una conexión, con ambos instaladores. Verifica esquema exacto y rechaza índices/triggers inesperados; compara objetos/filas históricos y, por separado, todas las filas/recibos auxiliares preexistentes. Un auxiliar nuevo debe quedar vacío. Conserva integridad y referencias sin corregir violaciones anteriores. Fallos de instalación o preservación revierten ambos cambios. Se mantiene backup consistente antes de preparar durante un deploy solicitado, con escritores detenidos.

## Protocolo y uso del cliente

Se conserva `zandaka-testing-v1`. La gramática remota agrega perfiles explícitos a plan y deploy; los demás verbos mantienen sus firmas:

```text
plan API_DIGEST WEB_DIGEST
plan API_DIGEST WEB_DIGEST za90
plan API_DIGEST WEB_DIGEST za90-za97
deploy REQUEST_UUID API_DIGEST WEB_DIGEST PLAN_ID za90
deploy REQUEST_UUID API_DIGEST WEB_DIGEST PLAN_ID za90-za97
```

Las mayúsculas representan campos a sustituir, no valores ejecutables. Digests SHA256 y UUIDv4 siguen siendo canónicos en minúsculas; no se admiten comandos, perfiles o argumentos arbitrarios. Un plan sin perfil conserva exclusivamente ZA-90. **El bloque de Presupuestos requiere crear el plan con `za90-za97`.**

Uso local del cliente Windows, después de seleccionar/verificar las imágenes del bloque:

```text
node scripts/testing-ssh-client.mjs plan API_DIGEST WEB_DIGEST za90-za97
node scripts/testing-ssh-client.mjs deploy PLAN_ID [REQUEST_UUID]
node scripts/testing-ssh-client.mjs status REQUEST_UUID
```

Deploy toma el perfil del plan persistido; no permite sustituirlo por un argumento independiente. Guarda UUID, perfil e intención antes de enviar. Status exige que el hash de la intención local coincida. Una respuesta perdida conserva el mismo intento; no genera otro UUID. El perfil forma parte del hash local del intento nuevo. Para preservar recuperación de trabajos históricos, ZA-90 mantiene la forma de intención previa, sin añadirle un campo profile ni cambiar su hash.

Los recibos nuevos ZA-97 deben identificar el perfil en ACK/status, `result.profile` y `result.database.profile`. Para confirmar éxito, además de imágenes, salud, backup y par anterior, se exige:

```json
{
  "profile": "za90-za97",
  "transferRequestReady": true,
  "budgetPlanReady": true,
  "historicalUnchanged": true,
  "auxiliaryHistoryUnchanged": true,
  "created": false,
  "budgetPlanCreated": true,
  "budgetPlanState": "created"
}
```

Es un ejemplo de estructura, no un recibo real. `created` informa la creación de `transfer_request`; `budgetPlanCreated` informa la de `budget_plan` y debe corresponder a `budgetPlanState`: `created` si true, `compatible` si false. No aceptar un succeeded sin todas las confirmaciones. Los recibos históricos sin perfil continúan verificando exclusivamente su alcance ZA-90; no se reinterpretan como ZA-97. Rollback sigue cambiando imágenes y conserva la base y recibos de ambas tablas.

## Vinculación del plan y pins revisados

Sea H la cadena `sha256:` más SHA256 del JSON compacto UTF-8, con claves ordenadas recursivamente y arrays en su orden. El perfil anterior conserva `H({current,target,installation})`. ZA-97 usa `H({current,target,installation,profile:'za90-za97',preparations:['transfer_request','budget_plan']})`. `current` es el objeto completo devuelto por plan. El worker vuelve a comprobar el hash y la intención antes de mutar. La aceptación Windows recalculará los planes contra el installationHash revisado.

Raíz del Mac: `/Users/emmanuelsalazar/.local/share/zandaka-testing-deployer`. Windows contrastó las fuentes publicadas con los siguientes hashes y comprobó independientemente los planes remotos contra su installationHash.

| Archivo                      | SHA256 de bytes                                                  |
| ---------------------------- | ---------------------------------------------------------------- |
| endpoint.mjs                 | 8c689b4e9f49214664a973f49ac2ef3c7217f17c77f69164c6e845da44d98ebc |
| database.cjs                 | 316747520bfd6321c0fc1c1fc6491e772451ad192e095595b4d1ea02fe8c50ee |
| launcher.sh, conservado      | 17c7c120439678538e5392acda1377ba3f3a5aa7c3d23830b1f2294a1c80aa2f |
| sqlite-backup.py, conservado | 0bd2c2f065f92e8eb363e8d7cf8441c6b13f39bcd99b6766bac70f01f97f2ee2 |

Nuevo installationHash: `sha256:427f835e936c3786655795ccf55e91e2556ff39375dd092460dde41f0c9ff025`. Los sourceHashes son H del string UTF-8 de cada fuente, no su SHA256 de bytes; installationHash es H del objeto sourceHashes. Se comprobaron ambos cálculos independientemente. Los planes de la instalación anterior quedan obsoletos; crear uno nuevo. No sustituir pins para silenciar drift.

## Validación y siguiente paso

Las 22 pruebas del cliente cubren argumentos estrictos, perfiles, rechazo de downgrade, recibos incompletos, intención persistida, pérdida de respuesta, conflictos, estado local alterado, historial y rollback. Las pruebas del helper verifican ambas tablas ausentes/presentes, recibos previos, esquemas incompatibles, triggers/índices, exports ausentes, rollback de DDL, alteraciones históricas/auxiliares, referencias y filas fabricadas. Ninguna utiliza bases del usuario.

La aceptación Windows pasó en `192.168.31.118:22`, con la misma huella de host `SHA256:QO9vRriTJcmFjMht9ZT/NOepcyP7+q27SnccD46nzH0`. Probe e inspect correctos. Se generaron planes de ambos perfiles **del par que ya corre** en un almacén separado del de despliegues; se recalcularon sus hashes contra el installationHash revisado. Son diferentes y vinculan el perfil. Inspect anuncia `deploymentProfiles`, `budgetPlanPreparation: true` y `databaseStateInspected: false`: capacidades de la herramienta, no estado del esquema.

Se consultaron ambos recibos históricos: c80b1c06… permanece failed y e6ee8950… succeeded, sin atribuirles preparación ZA-97. Se rechazaron seis comandos inválidos con 64, PTY/forwarding con 255 y SFTP con 64. Inspect antes/después confirmó iguales servicios, imágenes/IDs, configuración, release gestionado y montaje/identidad de DB. No se enviaron peticiones válidas de deploy/rollback ni se leyó el esquema o filas de la base del usuario.

Evidencia Windows local: `operaciones/ssh-testing/za97-acceptance/`, con baseline de archivos, fuentes como texto, hashes, resultados sintéticos y script `accept-readonly.mjs`. `acceptance-result.json` registra la aceptación remota satisfactoria. No reutilizar sus planes de lectura para desplegar ni presentar esta fase como creación de `budget_plan`. El próximo bloque puede gestionarse desde Windows conforme a [deploy-testing](deploy-testing.md), cuando el propietario lo solicite; ZA-97 no necesita otra instalación del Mac.
