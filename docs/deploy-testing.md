# Desplegar un bloque en testing

Esta es la guía de entrada para retomar un despliegue sin depender del chat. Leer también [staging](staging.md) y los requisitos de los tickets posteriores que se incluyan en el bloque. El propietario solicita cuándo desplegar; no se despliega por cada ticket. Los proyectos web y API se promueven juntos mediante imágenes publicadas por GitHub desde `staging`.

El [desplegador SSH del Mac está instalado y pasó la aceptación de lectura desde Windows](testing-deployer-installed.md): identidad contrastada, cliente dedicado, servicios/montaje reales y protocolo de inspección/plan comprobados. **El primer deploy real terminó el 4 de noviembre de 2026 y creó `transfer_request` sin cambios históricos: [registro del bloque aplicado](deployments/2026-11-04-testing.md).** Ese registro acredita esa entrega; comprobar siempre el estado vigente al retomar. Usar el cliente `scripts/testing-ssh-client.mjs` conforme a esa guía. Cada bloque requiere petición del propietario, selección de imágenes y un plan nuevo; un push no despliega testing.

## Preparación de esquema: ZA-97 — nuevo requisito pendiente

**Todo bloque que incluya Presupuestos Marea (ZA-97) requiere `budget_plan`, además de `transfer_request` de ZA-90.** El 5 de noviembre de 2026 se implementó el instalador y se probó con bases sintéticas; **no se ejecutó contra ninguna base del usuario ni se desplegó testing**. Inspeccionar el estado real al entregar. Las tablas `budget` anteriores no cambian ni se migran. Ver [contrato de presupuestos](budget-plans.md).

**La ampliación ZA-97 está instalada y Windows completó su aceptación remota de solo lectura en `192.168.31.118`.** Ver [registro y contrato de la ampliación](testing-deployer-za97.md). El cliente está actualizado: crear un plan nuevo con perfil explícito `za90-za97`; deploy deriva su alcance del plan persistido y exige `budgetPlanReady` en el recibo. Un ACK o recibo antiguo con `transferRequestReady` no acredita ZA-97. Mantener el comando forzado y las restricciones existentes; no eludirlas ni cambiar pins para silenciar drift. La DB real no se preparó durante la instalación de la herramienta.

La ampliación debe cargar `installBudgetPlans` de `/app/dist/db/budget-plan.js` de la candidata, dentro de la misma transacción exterior de preparación, después del backup y con servicios detenidos. Debe verificar la definición con `budgetPlansReady`, rechazar triggers/DDL incompatibles, conservar filas y recibos existentes de ambas tablas auxiliares y demostrar que todas las demás tablas/objetos conservan sus valores. Excluir del fingerprint únicamente la creación esperada de objetos auxiliares; verificar por separado que no cambian sus filas preexistentes. Exigir en el recibo `budgetPlanReady`, tabla creada o ya compatible y preservación histórica, además de los controles actuales. Probar creación, repetición, incompatibilidad y rollback sobre SQLite sintético antes de instalar. Registrar nueva identidad/pins del helper y comprobar inspect/plan desde Windows antes de pedir el deploy.

Si se usa una intervención operativa local autorizada en lugar del helper ampliado, ejecutar **con la imagen API candidata**, el montaje real ya identificado y un backup consistente verificado:

```sh
node dist/scripts/enable-budget-plans.js --db /RUTA_INTERNA_REAL_DE_TESTING.db
```

El marcador debe sustituirse por la ruta comprobada. No arrancar el servidor ni crear una DB/volumen vacío para preparar. No ejecutar CLI manual y worker en paralelo. Comprobar `budget_plan` antes/después, integridad, referencias y preservación de libro, snapshots y presupuestos anteriores. El arranque no prepara el esquema. Sin tabla compatible, la nueva planificación responde 503; sin ZA-90 la aplicación a sobres tampoco puede completarse.

Al promover, comprobar lista/creación/guardado/preparación y consulta del recibo; probar asignación/reintento únicamente con datos aislados. No convertir divisas ni introducir fondos para una prueba visual. Al revertir imágenes **conservar `budget_plan`, `transfer_request` y todos sus recibos**. Registrar explícitamente qué quedó aplicado y qué continúa pendiente. No declarar completo un despliegue ZA-97 solo por actualizar contenedores o por aprobar salud.

## Preparación de esquema: ZA-90

**ZA-90 requiere crear la tabla auxiliar `transfer_request` en la base de testing antes de habilitar las nuevas transferencias. Actualizar las imágenes por sí solo no completa este despliegue.**

Al cerrar la implementación el 3 de noviembre de 2026, no se había ejecutado esta preparación en ninguna base del usuario ni desplegado testing. Esto es un registro histórico, no una afirmación del estado actual: inspeccionar testing al retomar y registrar el resultado.

| Requisito                  | Qué preparar o comprobar                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB                         | Tabla nueva `transfer_request`: clave por usuario/intento, hash y referencia al movimiento confirmado.                                                        |
| Código API mínimo de ZA-90 | `47c276034efc498b85056c273a69ffcd054f10e2`, que contiene el endpoint y el script compilado.                                                                   |
| Código web mínimo de ZA-90 | `841a3cb1944e2fd0df673f9e3ea20f14e53fc565`, que usa `POST /api/transfers`.                                                                                    |
| Imágenes a promover        | Seleccionar las revisiones reales del bloque y sus digests publicados; los commits anteriores son referencias de inclusión, no órdenes de retroceder staging. |
| Falta de preparación       | La API devuelve `FEATURE_NOT_READY` (503), antes de escribir. El arranque y el POST no crean la tabla.                                                        |
| Efecto de la preparación   | Agrega únicamente la tabla y sus restricciones. No modifica tablas existentes, líneas históricas, saldos o snapshots.                                         |

La preparación explícita de ZA-90 forma parte de completar el deploy solicitado cuando ese ticket esté incluido. No dejarla como un paso olvidado que el propietario deba volver a pedir.

## 1. Identificar el entorno y las imágenes

**Compatibilidad ZA-88:** si el bloque incluye la ficha de movimientos, ambas imágenes deben incluir el ticket. La web consulta `GET /api/transactions/:id?userId=...`; la API debe devolver todas las líneas, incluidas las de sobres inactivos. ZA-88 no requiere cambios de DB. Verificar descripción completa, extremos de transferencia, fechas y retorno al historial con datos de prueba aislados. La preparación de `transfer_request` de ZA-90 sigue vigente si está incluido. Ver [contrato de consulta](transaction-detail.md).

1. Reconfirmar el destino: `192.168.31.118`, proyecto `zandaka-testing`, contexto `desktop-linux`, servicios `backend` y `frontend`. La web `http://192.168.31.118:3101/` y `/api/health` respondieron correctamente desde Windows durante la aceptación. Las IP anteriores `192.168.31.35` y `192.168.31.76` quedaron obsoletas; se conservó la misma identidad de host verificada. La DB dentro de la API es `/app/data/presupuesto.db`, bind desde `/Users/emmanuelsalazar/Documents/MacOS/Testing/data`, archivo host `presupuesto.db` dentro de esa carpeta. Reconfirmar mediante inspect el montaje, identidades e imágenes actuales; ver [instalación comprobada](testing-deployer-installed.md). No confundir el archivo del host con la ruta interna ni asumir que el esquema ya fue preparado.
2. Registrar tickets incluidos, commits de ambos repositorios, calidad CI y publicación efectiva de sus imágenes. Verificar disponibilidad y arquitectura del manifiesto para el host. Un job de calidad aprobado no demuestra que la imagen ya esté publicada.
3. Seleccionar los manifiestos específicos de las plataformas configuradas, verificar su pertenencia al índice OCI publicado y su revisión/arquitectura. El primer intento con índices multiarquitectura fue rechazado en la validación de candidatos; el bloque se completó con sus manifiestos por plataforma, conservando todos los controles. Seleccionar y registrar digests inmutables de `ghcr.io/emmanuelsalazar92/zandaka-api` y `ghcr.io/emmanuelsalazar92/zandaka-web`. Evitar depender de la etiqueta móvil `staging`; `latest` corresponde a main. Registrar el par anterior y la configuración necesaria para revertir.
4. Resolver `DB_PATH` efectivo y el montaje que lo conecta con la base persistente de testing. Mantener `API_INTERNAL_URL` apuntando a la API dentro de la red del despliegue, y comprobar CORS y puertos. No imprimir secretos en registros o documentación.

## 2. Respaldar e inspeccionar la base seleccionada

1. Verificar que el archivo existente y el volumen resueltos sean los de **testing**. `C:\sqlite\production-audit-2026-11-01.db` es una copia productiva de auditoría y no es un destino válido para este procedimiento.
2. Obtener un respaldo SQLite consistente y registrar ubicación y método. Usar la API de backup de SQLite o una copia con escrituras detenidas y tratamiento correcto de WAL/SHM. Copiar solo el archivo principal mientras hay escrituras no garantiza un respaldo consistente.
3. Registrar el esquema existente, el estado de `transfer_request` y comprobaciones de referencia del libro. Si la tabla ya existe, comparar columnas, clave primaria y referencias con `src/db/transfer-idempotency.ts`; `CREATE TABLE IF NOT EXISTS` no corrige una tabla incompatible.
4. Comprobar integridad y referencias antes/después. No usar este despliegue para corregir datos históricos o violaciones preexistentes; registrar cualquier diferencia introducida por la preparación.

## 3. Preparar la tabla con la imagen API candidata

En el flujo SSH gestionado, el worker realiza este paso después de detener API/web y verificar el respaldo. Invoca el instalador compilado dentro de una transacción exterior que verifica la preservación histórica. **No ejecutar además el CLI manual en paralelo.** Las indicaciones siguientes documentan la preparación equivalente para una intervención operativa manual autorizada; el recibo del worker registra lo efectivamente aplicado en el flujo automático.

Usar la **nueva imagen API seleccionada**, con el mismo archivo persistente de testing montado y la ruta interna ya verificada. Puede ejecutarse como contenedor temporal sin arrancar el servidor, con usuario/permisos compatibles con el servicio. El contenedor API anterior puede no contener el script: no asumir que basta con ejecutar el comando dentro de él. No crear un volumen vacío para este paso.

Dentro de esa imagen, desde `/app`, ejecutar:

```sh
node dist/scripts/enable-transfer-idempotency.js --db /RUTA_INTERNA_REAL_DE_TESTING.db
```

**La ruta anterior es un marcador, no una ruta detectada ni un comando listo para copiar sin sustituirla.** El script exige un archivo existente y una ruta explícita; no utiliza `DB_PATH` por defecto. La ejecución es aditiva y repetible.

Verificar salida y código de retorno, existencia y definición de `transfer_request`, y ausencia de cambios en las tablas y valores históricos registrados. Si falla, no habilitar el nuevo flujo ni presentar el despliegue como completo. No ejecutar `migrate-money`, herramientas de saneamiento o recálculos: no son requisitos de ZA-90.

## 4. Promover y comprobar web/API

1. Promover el par de imágenes por digest manteniendo el volumen preparado y las variables de testing. Comprobar salud, logs sin errores y proxy web/API. Registrar los digests efectivamente ejecutados, no solo las etiquetas solicitadas.
2. Verificar el recorrido de transferencias con datos de prueba aislados en testing: origen/destino válidos, importe positivo, resumen y confirmación. Cubrir sobres de la misma cuenta y cuentas de la misma moneda. No introducir movimientos en datos históricos para una prueba visual.
3. Confirmar que ya no aparece `FEATURE_NOT_READY`. Comprobar que un reintento del mismo UUID/cuerpo devuelve el mismo movimiento y no genera otro; conservar exactamente la clave original. No usar un UUID nuevo para simular un reintento.
4. Verificar también Movimientos, sobres y reportes HTML/PDF del bloque, además de móvil y temas. El contrato de reportes de Atlántico requiere web/API compatibles y los snapshots conservan sus valores históricos.

El contrato de transferencia, sus límites y la recuperación por pestaña están en [transferencias](transfers.md) y en la [documentación web](https://github.com/emmanuelsalazar92/zandaka-web/blob/staging/docs/transfers.md).

## 5. Reversión y registro de entrega

Si debe revertirse la aplicación, promover el par anterior de imágenes y verificar salud. **Conservar `transfer_request` y sus confirmaciones**: las imágenes anteriores ignoran la tabla y borrarla puede permitir duplicados al reactivar el nuevo flujo. Revertir imágenes no requiere restaurar el respaldo de DB. Una restauración de respaldo puede descartar movimientos posteriores; evaluar expresamente el estado real antes de hacerlo.

Registrar el bloque en un documento fechado: tickets, commits/digests nuevos y anteriores, host/servicios sin secretos, base seleccionada, respaldo, si la tabla fue creada o ya existía y era compatible, verificaciones antes/después, resultado funcional y pendientes. Actualizar los tickets con lo efectivamente desplegado. El deploy solo se considera completo cuando la preparación de DB y las comprobaciones funcionales hayan terminado.
