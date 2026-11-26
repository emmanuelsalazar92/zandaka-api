# Rama staging y publicación para testing

CI and Docker use Node.js 26 LTS. Select the version in `.node-version` before `npm ci`. The SQLite driver includes native binaries for Linux amd64 and arm64. The runtime update does not require a database migration.

**Último estado operativo observado: [deploy del 22 de noviembre de 2026](deployments/2026-11-22-testing.md). Web 237d40f / API fc65024; solicitud 3474c9b8-8970-4b45-b10a-d55a38ca8b64. Respaldo e historia conservados; auxiliares compatibles. Salud operativa aprobada, sin repetir suites ni declarar aceptación humana. Los estados anteriores son historia.**

Preparación local del 22 de noviembre: ZA-108/109 añade protocolo, evidencia de zoom nativo y comparación de rendimiento reconstruida, sin nuevo deploy ni cambios de DB. Ver [entrega reversible](redesign-release.md). Las notas de implementación anteriores se conservan como historia; el último estado remoto observado se identifica abajo.

**Último estado operativo observado: [deploy del 6 de noviembre de 2026](deployments/2026-11-06-testing.md). Web c22cfc1 / API af90bae, host 192.168.31.76. Respaldo e historia conservados; auxiliares compatibles. Sin pruebas funcionales por instrucción del propietario. Los registros anteriores se conservan como historia.**

**Entrega anterior registrada: [testing del 5 de noviembre de 2026](deployments/2026-11-05-testing.md). Web `a64a2bb` y API `1ec71ac`; ZA-97 y ZA-90 preparadas y verificadas, historia conservada. Incluye corrección para HTTP LAN y comprobación funcional sobre la web publicada. Los pushes posteriores no despliegan testing.**

La actualización de marca Atlántico unifica el logo de los reportes con la web. El cambio en la API es únicamente el SVG local y documentación, sin cambios de endpoints o DB. Publicar/promover ambas imágenes del bloque para obtener la identidad uniforme; conservar overrides `ZANDAKA_LOGO_PATH` e imágenes personalizadas, cuya prioridad se documenta en `src/assets/logo/README.md`. No requiere migraciones; ZA-90 mantiene su preparación independiente.

**Entrada operativa: [Desplegar un bloque en testing](deploy-testing.md). Incluye verificación/preparación auxiliar de ZA-90 y ZA-97, respaldo, orden de ejecución, comprobaciones y reversión.**

La API y la web son repositorios independientes. Trabajan sobre staging y se despliegan a testing en bloques de X tickets definidos por el propietario, utilizando imágenes publicadas por GitHub. Una publicación de imagen no es un despliegue.

## Pipeline

ZA-99 añade el filtro opcional type=EXPENSE a monthly-expenses para el [Resumen Marea](dashboard.md); al omitirlo conserva el comportamiento anterior. La web del bloque depende de esta extensión. Sin preparación de DB o recálculos. Implementación del 6 de noviembre solo en commits locales, sin push ni deploy; no sustituye la última entrega de testing registrada arriba.

CI se ejecuta en main/staging, pull requests, etiquetas de versión y ejecución manual. quality ejecuta formato, lint, tipos, pruebas y build. Solo después el trabajo docker llama a docker-publish.yml. quality usa permisos de lectura; packages:write queda en el trabajo de publicación.

La imagen ghcr.io/emmanuelsalazar92/zandaka-api:staging contiene plataformas linux/amd64 y linux/arm64. Las etiquetas SHA permiten identificar builds; latest solo se publica desde main. La etiqueta staging cambia con los pushes: registrar el digest para una promoción reproducible.

## Compatibilidad del bloque Atlántico

ZA-88 añade `GET /api/transactions/:id?userId=...` para la [ficha completa de movimientos](transaction-detail.md), con todas las líneas históricas incluso inactivas. Promover una pareja compatible web/API que incluya el ticket. **Sin cambios de DB por ZA-88**; no ejecutar migraciones monetarias ni recálculos. La preparación auxiliar de ZA-90 sigue siendo independiente.

La web usa el nuevo GET /api/reports/:id/html. Promover un par compatible de imágenes web/API y conservar el par anterior para revertir. Los cambios de presentación no requieren migraciones financieras ni recalcular reportes históricos. La base de testing es independiente de la copia productiva de auditoría.

Mantener DB_PATH, CORS y API_INTERNAL_URL conforme a la red privada de testing. No incorporar la base real ni secretos al build o a los fixtures. La instalación de fuentes está en Dockerfile; no requiere descargas de fuentes al exportar un reporte.

## Comprobaciones

Ejecutar npm run format:check, npm run lint, npm run type-check, npm test y npm run build. Las pruebas utilizan bases sintéticas temporales. Los tests HTTP necesitan permitir conexiones loopback; una denegación EACCES de localhost no debe confundirse con un fallo funcional de las rutas.

Registrar por bloque tickets, commits web/API, checks, revisión visual, etiquetas/digests de imagen, verificación de salud y procedimiento de reversión. El número X no se fija desde un ticket individual.

## Transferencias guiadas — ZA-90

Este bloque funcional añade POST /api/transfers. Antes de promover la pareja de imágenes web/API, preparar transfer_request en la base de testing mediante el script explícito descrito en [Transferencias](transfers.md). El arranque no modifica el esquema. Sin esa preparación, el endpoint devuelve FEATURE_NOT_READY antes de escribir. Conservar la tabla auxiliar al revertir imágenes para mantener las confirmaciones de reintento. La copia productiva de auditoría no se usa para este paso.

## Presupuestos Marea — ZA-97

Consultar [contrato y preparación](budget-plans.md). Requiere budget_plan compatible antes de habilitar la nueva planificación; transfer_request sigue siendo necesario para asignar. No modifica presupuestos históricos. La [ampliación del desplegador y cliente Windows](testing-deployer-za97.md) incorpora el perfil explícito za90-za97; su aceptación remota desde Windows pasó en 192.168.31.118. Ambas tablas quedaron preparadas/verificadas en la entrega real del 5 de noviembre enlazada arriba. Al implementar o aceptar la herramienta no se había preparado una base del usuario: esa preparación ocurrió durante el deploy solicitado. Para otro bloque crear un plan nuevo y comprobar su estado, conforme a [deploy-testing](deploy-testing.md).

## Medición de uso — ZA-100

Este ticket solo instrumenta la web mediante el SDK ya existente de Vercel, con opt-in apagado por defecto. No añade endpoints, variables de API, tablas o migraciones. Testing en Docker no tiene colector de métricas; no activar VERCEL=1 para simularlo. Ver [contrato y límites web](https://github.com/emmanuelsalazar92/zandaka-web/blob/staging/docs/usage-analytics.md). Los requisitos de DB de los demás tickets del bloque siguen vigentes.
