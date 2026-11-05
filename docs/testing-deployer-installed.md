# Desplegador de testing instalado y verificado

Registro del 4 de noviembre de 2026, hora de Costa Rica. **La instalación local del Mac terminó y Windows verificó su inspección/plan de solo lectura. Después, el propietario solicitó el primer deploy y se completó: [release aplicado y preparación real de DB](deployments/2026-11-04-testing.md).** Una nueva instalación local no forma parte de cada entrega normal; desde Windows se usa el cliente con la clave dedicada ya verificada. Un push o una imagen publicada no ejecuta el desplegador.

## Destino real descubierto

| Dato                 | Valor comprobado/comunicado                                                 |
| -------------------- | --------------------------------------------------------------------------- |
| SSH verificado       | `192.168.31.35:22`, usuario `emmanuelsalazar`                               |
| Clave del host       | `SHA256:QO9vRriTJcmFjMht9ZT/NOepcyP7+q27SnccD46nzH0`                        |
| Proyecto/contexto    | `zandaka-testing` / `desktop-linux`                                         |
| Compose original     | `/Users/emmanuelsalazar/Documents/MacOS/Testing/docker-compose.yml`         |
| API                  | Servicio `backend`, contenedor `zandaka-testing-backend`, `linux/amd64`     |
| Web                  | Servicio `frontend`, contenedor `zandaka-testing-frontend`, `linux/arm64`   |
| Daemon               | `aarch64`; la API conserva la plataforma emulada actual                     |
| SQLite dentro de API | `/app/data/presupuesto.db`                                                  |
| SQLite en Mac        | `/Users/emmanuelsalazar/Documents/MacOS/Testing/data/presupuesto.db`        |
| Montaje de DB        | Bind RW `/Users/emmanuelsalazar/Documents/MacOS/Testing/data` → `/app/data` |
| Web desde Windows    | `http://192.168.31.35:3101/`, GET 200                                       |
| Proxy desde Windows  | `http://192.168.31.35:3101/api/health`, GET 200 y JSON `status: ok`         |

Los datos de servicios, imágenes, contexto y montaje se obtuvieron también mediante el endpoint autenticado desde Windows. Durante la aceptación inicial, la presencia del archivo y su dispositivo/inode se comprobaron por metadatos; no se abrió SQLite ni se consultó su esquema. En el despliegue posterior documentado se obtuvo respaldo y se creó/verificó la tabla auxiliar de ZA-90 sin cambios históricos. Revalidar el esquema en cada entrega. No usar la copia productiva de auditoría de Windows.

## Instalación en el Mac

Raíz privada: `/Users/emmanuelsalazar/.local/share/zandaka-testing-deployer`. Archivos `launcher.sh`, `endpoint.mjs`, `database.cjs`, `sqlite-backup.py`, configuración privada y subdirectorios `jobs`, `backups`, `overrides`, `locks`. La copia de configuración efectiva `runtime-compose.json` puede contener valores de aplicación: no publicarla ni imprimirla. No se altera el Compose original al promover imágenes; cada release conserva su override y cómo reproducirlo.

La entrada forzada, conservando `restrict`, es:

```text
/bin/sh /Users/emmanuelsalazar/.local/share/zandaka-testing-deployer/launcher.sh
```

CodexMacOS reportó directorios/launcher con modo 700 y configuración/helpers/journals con 600, propietarios correctos, sin duplicar esta pública ni cambiar otros accesos. El bootstrap anterior se conserva. Node real `/usr/local/bin/node` v23.0.0, Docker `/usr/local/bin/docker` (Docker Desktop), Python `/usr/bin/python3` para la API de backup. Las rutas/herramientas fueron descubiertas localmente, no asumidas desde Windows.

Windows revisó los cuatro archivos publicados y contrastó tanto sus hashes de bytes instalados como sus pins internos. Referencias de bytes:

| Archivo            | SHA256                                                             |
| ------------------ | ------------------------------------------------------------------ |
| `launcher.sh`      | `17c7c120439678538e5392acda1377ba3f3a5aa7c3d23830b1f2294a1c80aa2f` |
| `endpoint.mjs`     | `f94bec061fb37449073ea6f28b7a3e54f80c37ce532b06e28d07114fc27f6939` |
| `database.cjs`     | `97c46e92bb556e32a989d0f0f3affdd0009ac767e874bb9f703a7a9f233dc43e` |
| `sqlite-backup.py` | `0bd2c2f065f92e8eb363e8d7cf8441c6b13f39bcd99b6766bac70f01f97f2ee2` |

El pin interno `installationHash` es `sha256:3228fc4c5ce911ee2c27808a34fb8dc3d70afca9a5b5fb65f284520c8425da29`. Los `sourceHashes` internos se calculan sobre representaciones JSON canónicas; no son los hashes de bytes de la tabla. No sustituir archivos/configuración para silenciar un error de pin: requiere revisión local y actualización documentada. Las fuentes completas y configuración saneada están en [SSH de Notion](https://app.notion.com/p/40fb70136a488093be28d20334b0ac4a); la copia de revisión local Windows está en `operaciones/ssh-testing/mac-source-reviewed/`, como texto no ejecutable.

## Qué se verificó realmente

- SSH con la misma clave/host pin: `probe` correcto mediante el cliente Windows.
- `inspect` antes/después y `plan` del par que ya ejecuta testing: protocolo válido y `readOnly: true`. Mismos IDs de contenedores/imágenes, identidad de archivo/montaje, hash de configuración y estado gestionado observados. No se pidieron acciones mutantes ni se leyó contenido de DB.
- Nueve cadenas inválidas rechazadas con retorno 64, incluidas separación de comandos, sustitución, salto de línea, tabulación, separador Unicode y un deploy de gramática inválida. No se envió una petición válida de deploy o rollback.
- PTY y forwarding remoto rechazados con 255; SFTP con 64. Conservada la verificación estricta de identidad.
- Web/proxy desde Windows correctos según la tabla anterior.

Mac reportó además 13 pruebas con Docker simulado, 5 de SQLite sintético aislado, 1 de backup temporal WAL y 1 de worker desacoplado con Docker/backup simulados. No se presentan como pruebas de un deploy real ni como comprobación del esquema actual de testing. Windows verificó fuentes/recibos y las acciones de lectura; esas pruebas aisladas no acreditaban un deploy real. La primera ejecución real posterior quedó comprobada en el registro del bloque enlazado arriba.

Evidencia local: `operaciones/ssh-testing/mac-readiness-checks/`, `mac-source-checksums.json`, `mac-installation-review.json`. El plan de aceptación se guardó en una carpeta de revisión separada del almacén habitual del cliente; no es una selección de imágenes nuevas ni un plan listo para promover el bloque pendiente.

## Próximo despliegue desde Windows

1. Recibir la petición del propietario y leer [deploy-testing](deploy-testing.md), ambas guías de staging y los tickets del bloque.
2. Seleccionar revisiones/digests publicados de API y web, con CI aprobado del mismo commit y arquitectura compatible. `plan` no certifica disponibilidad de candidatos en el registro.
3. Ejecutar `inspect` y un **plan nuevo para esos digests**, revisar destino/par anterior y guardar el planId en el almacén normal del cliente. No reutilizar el plan de aceptación del par antiguo.
4. Ejecutar deploy con ese planId. El cliente guarda un UUID antes de enviar; el Mac devuelve ACK y realiza el trabajo durable. Consultar status de ese mismo UUID hasta terminal. Pérdida de conexión no autoriza inventar otro intento.
5. Exigir el recibo completo: backup verificado, ZA-90 compatible/preparado sin cambios históricos, digests/IDs ejecutados y salud API/web/proxy. Un ACK queued no es éxito.
6. Registrar qué se desplegó y qué quedó aplicado en DB. Si hay que revertir, el rollback cambia imágenes y conserva la base, transfer_request y sus confirmaciones. No restaura automáticamente un backup.

El helper de DB instalado usa la función compilada `installTransferIdempotency` de la candidata dentro de una transacción exterior para verificar fingerprints y revertir ante cambios históricos; no ejecuta el CLI en otra conexión. No duplicar esta preparación manualmente en paralelo. Se mantiene el [contrato del cliente y la instalación](testing-deployer-contract.md).

Los pins detectan cambios del contexto, Compose/configuración efectiva, montajes y fuentes instaladas. Si hay drift, un lock abandonado, un worker interrumpido o no se puede demostrar un respaldo, detener la entrega y evaluar el diagnóstico. El procedimiento de revisión local de esos errores no es una tarea manual por cada bloque normal.
