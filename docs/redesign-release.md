# Entrega reversible del rediseño — ZA-109

Preparación del 22 de noviembre de 2026. Esta guía no ejecuta ni autoriza un deploy. ZA-107 aporta regresión financiera y accesibilidad automática; ZA-108 documenta evaluación experta y el protocolo humano. Las limitaciones de participantes, lector de pantalla y zoom deben conservarse en el registro de entrega, no convertirse en aprobaciones por publicar una imagen.

## Estado acreditado y candidata

Último estado remoto **observado y documentado**, no reinspeccionado hoy: [testing del 6 de noviembre](deployments/2026-11-06-testing.md), solicitud `a41b3979-3590-4549-a825-e6b28bddfe8e`; web `c22cfc1`, API `af90bae`, entonces `192.168.31.76`. No asumir que el Mac conserva la IP, contenedores o estado desde esa fecha. El registro de noviembre 5 es historia previa.

La candidata incorpora web `5818dad` (ZA-107) y las herramientas/documentación de ZA-108/109. API `ad8bdee` añade evidencia, sin cambiar el runtime de `af90bae`. Al publicar el bloque, seleccionar los commits reales finales y sus manifiestos por plataforma; no usar los hashes de esta referencia para omitir cambios posteriores ni confundir una copia compilada local con una imagen de GHCR.

**Sin nuevos requisitos de DB por ZA-107/108/109.** Se mantienen `transfer_request` y `budget_plan` compatibles, recibos y snapshots. No ejecutar migraciones monetarias, saneamiento o recálculos. Los scripts de medición web son herramientas de desarrollo con fixtures; no se incorporan como telemetría de cuentas reales.

## Habilitación por etapas

| Etapa                        | Acción / evidencia                                                                                                                           | Criterio de avance y responsable                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0 · Local aislado            | Builds comparables, regresión con SQLite temporal y frontend interceptado; crítica y protocolo.                                              | Agente registra revisión, método, resultados, defectos y pendientes. No es un deploy.                                                    |
| 1 · Testing por bloque       | Solo tras solicitud del propietario: imágenes exactas compatibles, inspect, plan nuevo explícito `za90-za97`, respaldo y worker restringido. | Recibo terminal completo, salud y revisiones efectivas; conservación de historia/recibos. Propietario solicita; agente ejecuta.          |
| 2 · Revisión del propietario | Tareas de ZA-108 sobre la revisión identificada. Escrituras sintéticas solo interceptadas/aisladas.                                          | Registrar lo observado, ayuda, defectos y decisión; no inventar éxito con ausencia de participantes.                                     |
| 3 · Producción               | Solicitud y proceso habitual autorizado para producción.                                                                                     | Decisión explícita del propietario; el helper de testing no es un mecanismo de producción. No se habilita automáticamente desde staging. |

No se añade un feature flag monetario ni se mezclan módulos de versiones incompatibles. La gradualidad aprovecha el entorno testing y la promoción de pares completos, reversible por imágenes. El despliegue por bloques existente se conserva. Si el propietario pide solo deploy operativo, su instrucción prevalece sobre la comprobación funcional opcional: registrar exactamente qué se omitió y no declarar aceptación humana o financiera por salud del contenedor.

## Checklist de la próxima entrega

- Identificar el destino vigente y leer `deploy-testing.md`, ambas guías de staging y este documento. No usar la copia productiva de auditoría.
- Registrar web/API finales, tickets, publicación efectiva y arquitecturas actuales; fijar manifiestos por digest, no `latest` ni la etiqueta móvil `staging`.
- Reconfirmar API compatible: ficha de movimiento, filtro `type=EXPENSE` del Resumen, HTML de reportes y auxiliares de transferencias/presupuestos. No mezclar la web nueva con una API que ignore el filtro de gastos.
- Crear un plan nuevo con perfil `za90-za97`; revisar par anterior y montaje/identidad reales de DB. Conservar pins y restricciones SSH. Una IP antigua o un recibo pasado no acreditan el destino actual.
- Exigir backup consistente verificado y preparación/verificación idempotente de auxiliares con la imagen candidata. `budgetPlanReady`, `transferRequestReady`, `historicalUnchanged` y `auxiliaryHistoryUnchanged` deben ser verdaderos. No preparar manualmente en paralelo al worker.
- Consultar el mismo UUID hasta terminal; ACK no significa deploy terminado. Exigir revisiones/digests ejecutados y salud API/web/proxy.
- Registrar rutas disponibles, límites, pendientes humanos y comparación de rendimiento con método/dispositivo. Salud no reemplaza la prueba por HTTP LAN ni las tareas con fixtures. Aplicar las instrucciones explícitas del propietario sobre qué comprobar.
- Publicar el registro fechado con par actual/anterior, backup y reversión; actualizar tickets con lo realmente entregado. No actualizar historia pasada para aparentar que una comprobación ocurrió antes.

## Reversión sin tocar dinero

El plan/recibo del nuevo bloque debe registrar su par anterior real. Si se decide revertir **ese bloque**, desde el checkout API usar `node scripts/testing-ssh-client.mjs rollback RELEASE_UUID`, sustituyendo el UUID por el release efectivamente aplicado, y consultar el intento persistido hasta terminal. No copiar el UUID de un release antiguo como si revirtiera una candidata nueva.

Rollback cambia imágenes y conserva base, `transfer_request`, `budget_plan`, confirmaciones y snapshots. No restaura backups implícitamente: restaurar una DB podría descartar operaciones posteriores y requiere una decisión separada. No borrar registros de importación ni generar UUID nuevos para resolver confirmaciones inciertas. Si el worker detecta drift, incompatibilidad o falta de respaldo, no modificar pins, endpoint o datos para silenciarlo.

La checklist de pantallas y los resultados del laboratorio están en [preparación web](https://github.com/emmanuelsalazar92/zandaka-web/blob/staging/docs/release-readiness.md). Los nuevos documentos quedan locales hasta que el propietario solicite push; sus enlaces remotos se actualizarán entonces.
