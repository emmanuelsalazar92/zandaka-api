# Rama staging y publicación para testing

La API y la web son repositorios independientes. Trabajan sobre staging y se despliegan a testing en bloques de X tickets definidos por el propietario, utilizando imágenes publicadas por GitHub. Una publicación de imagen no es un despliegue.

## Pipeline

CI se ejecuta en main/staging, pull requests, etiquetas de versión y ejecución manual. quality ejecuta formato, lint, tipos, pruebas y build. Solo después el trabajo docker llama a docker-publish.yml. quality usa permisos de lectura; packages:write queda en el trabajo de publicación.

La imagen ghcr.io/emmanuelsalazar92/zandaka-api:staging contiene plataformas linux/amd64 y linux/arm64. Las etiquetas SHA permiten identificar builds; latest solo se publica desde main. La etiqueta staging cambia con los pushes: registrar el digest para una promoción reproducible.

## Compatibilidad del bloque Atlántico

La web usa el nuevo GET /api/reports/:id/html. Promover un par compatible de imágenes web/API y conservar el par anterior para revertir. Los cambios de presentación no requieren migraciones financieras ni recalcular reportes históricos. La base de testing es independiente de la copia productiva de auditoría.

Mantener DB_PATH, CORS y API_INTERNAL_URL conforme a la red privada de testing. No incorporar la base real ni secretos al build o a los fixtures. La instalación de fuentes está en Dockerfile; no requiere descargas de fuentes al exportar un reporte.

## Comprobaciones

Ejecutar npm run format:check, npm run lint, npm run type-check, npm test y npm run build. Las pruebas utilizan bases sintéticas temporales. Los tests HTTP necesitan permitir conexiones loopback; una denegación EACCES de localhost no debe confundirse con un fallo funcional de las rutas.

Registrar por bloque tickets, commits web/API, checks, revisión visual, etiquetas/digests de imagen, verificación de salud y procedimiento de reversión. El número X no se fija desde un ticket individual.

## Transferencias guiadas — ZA-90

Este bloque funcional añade POST /api/transfers. Antes de promover la pareja de imágenes web/API, preparar transfer_request en la base de testing mediante el script explícito descrito en [Transferencias](transfers.md). El arranque no modifica el esquema. Sin esa preparación, el endpoint devuelve FEATURE_NOT_READY antes de escribir. Conservar la tabla auxiliar al revertir imágenes para mantener las confirmaciones de reintento. La copia productiva de auditoría no se usa para este paso.
