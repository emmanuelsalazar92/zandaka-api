# Desplegar un bloque en testing

Esta es la guía de entrada para retomar un despliegue sin depender del chat. Leer también [staging](staging.md) y los requisitos de los tickets posteriores que se incluyan en el bloque. El propietario solicita cuándo desplegar; no se despliega por cada ticket. Los proyectos web y API se promueven juntos mediante imágenes publicadas por GitHub desde `staging`.

El canal Windows → Mac está [en preparación por SSH](ssh-testing.md): clave dedicada creada, acceso de red a `192.168.31.35` comprobado e instalación restringida de prueba propuesta. **No declarar completadas identidad, autenticación o capacidad de despliegue sin sus verificaciones.** Esa guía y Notion distinguen datos comunicados de lo realmente aplicado; configurar SSH no prepara DB ni despliega imágenes.

## Pendiente conocido: ZA-90 cambia el esquema

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

1. Identificar el host, el proyecto de contenedores, los servicios reales, sus imágenes actuales y la configuración efectiva de testing. La URL de web comunicada anteriormente fue `http://192.168.31.76:3101/`; esa IP no respondió durante la preparación SSH y el propietario comunicó después `192.168.31.35`, que sí responde en puerto 22. No se verificó todavía la web en la nueva IP. Usuario, proyecto y archivo Compose comunicados están en [SSH](ssh-testing.md); siguen pendientes la identidad/autenticación y descubrir los nombres reales de servicios y la ruta del volumen SQLite. Comprobar la vigencia del entorno antes de actuar; no inventar esos datos ni confundir una ruta del host con la ruta dentro del contenedor.
2. Registrar tickets incluidos, commits de ambos repositorios, calidad CI y publicación efectiva de sus imágenes. Verificar disponibilidad y arquitectura del manifiesto para el host. Un job de calidad aprobado no demuestra que la imagen ya esté publicada.
3. Seleccionar y registrar digests inmutables de `ghcr.io/emmanuelsalazar92/zandaka-api` y `ghcr.io/emmanuelsalazar92/zandaka-web`. Evitar depender de la etiqueta móvil `staging`; `latest` corresponde a main. Registrar el par anterior y la configuración necesaria para revertir.
4. Resolver `DB_PATH` efectivo y el montaje que lo conecta con la base persistente de testing. Mantener `API_INTERNAL_URL` apuntando a la API dentro de la red del despliegue, y comprobar CORS y puertos. No imprimir secretos en registros o documentación.

## 2. Respaldar e inspeccionar la base seleccionada

1. Verificar que el archivo existente y el volumen resueltos sean los de **testing**. `C:\sqlite\production-audit-2026-11-01.db` es una copia productiva de auditoría y no es un destino válido para este procedimiento.
2. Obtener un respaldo SQLite consistente y registrar ubicación y método. Usar la API de backup de SQLite o una copia con escrituras detenidas y tratamiento correcto de WAL/SHM. Copiar solo el archivo principal mientras hay escrituras no garantiza un respaldo consistente.
3. Registrar el esquema existente, el estado de `transfer_request` y comprobaciones de referencia del libro. Si la tabla ya existe, comparar columnas, clave primaria y referencias con `src/db/transfer-idempotency.ts`; `CREATE TABLE IF NOT EXISTS` no corrige una tabla incompatible.
4. Comprobar integridad y referencias antes/después. No usar este despliegue para corregir datos históricos o violaciones preexistentes; registrar cualquier diferencia introducida por la preparación.

## 3. Preparar la tabla con la imagen API candidata

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
