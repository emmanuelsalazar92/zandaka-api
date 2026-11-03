# Reportes Atlántico: presentación y contrato histórico

Trabajo relacionado: ZA-104. El rediseño cambia presentación y vías de consulta, preservando los valores almacenados de cada snapshot.

## Contrato temporal

generateSnapshot obtiene saldos activos al generar la versión. report_month identifica el mes de referencia; no constituye por sí mismo un filtro temporal de movimientos ni un cierre contable. generated_at registra la captura. La implementación existente no conserva corte contable y fecha efectiva de cotización como campos independientes del snapshot.

Por ello, la plantilla distingue Mes de referencia y Captura de saldos y explica ese alcance. No infiere el último día del mes como corte, ni reconstruye un cierre retrospectivo. La evolución de esa semántica requiere un cambio de contrato separado y una política explícita para versiones antiguas. El rediseño no migra ni reescribe datos.

Las cantidades originales, tasa y consolidado proceden del snapshot. Consultar o exportar no recalcula los saldos contra transacciones actuales. La agrupación de líneas usa identidad de cuenta y moneda, evitando asignar una línea a otra cuenta por su posición en la lista.

## Endpoints

### GET /api/reports/:id/html

Alternativa de consulta HTML basada en el mismo documento histórico. Valida id y devuelve 404 cuando no existe. No abre Chromium. La respuesta incluye Content-Type HTML con UTF-8, Cache-Control private/no-store, X-Content-Type-Options nosniff y una CSP sin scripts ni recursos de red. Solo se admiten estilos internos e imágenes data. La vista puede incrustarse desde el mismo origen mediante el proxy web.

### GET /api/reports/:id/pdf

Conserva la descarga y disposition inline/attachment. La exportación se genera bajo demanda en formato Letter, con fondos, fuentes del sistema y numeración de páginas. Los encabezados de cuenta pertenecen al thead para repetirse al continuar la tabla. Las filas evitan partirse y los nombres largos pueden envolver.

## Renderizado y seguridad

- Escape de nombres, categorías, notas, referencias y metadatos antes de construir HTML.
- Logos limitados a data URI de imagen base64; no se aceptan URLs remotas desde la plantilla.
- JavaScript deshabilitado en Chromium y solicitudes de red abortadas durante el renderizado.
- Espera de fuentes antes de exportar, límites de tiempo de renderizado y cierre del navegador en finally.
- El pie del PDF también escapa su etiqueta.
- La imagen Docker instala fonts-noto-core y fonts-dejavu-core para conservar el glifo del colón y otros caracteres sin cargar fuentes remotas.

El renderer conserva los argumentos de sandbox de la imagen existente; no sustituye el aislamiento del contenedor. No se añade un mecanismo de autenticación nuevo: los endpoints mantienen el modelo de acceso de la API existente. No interpretar el endurecimiento del renderer como una auditoría completa de seguridad del producto.

## Identidad

Azul profundo, cobalto y un acento turquesa controlado. El saldo consolidado ocupa la jerarquía principal; monedas originales y conversión quedan en el segundo nivel. Importes normales usan tinta neutral y los negativos incluyen signo y color. No se usan colores arbitrarios por cuenta.

Los importes del reporte usan convenciones es-CR y precisión monetaria existente. Un total ausente se presenta como No disponible. Las notas y la trazabilidad tienen una jerarquía secundaria, conservando versión, identificador y estado.

## QA reproducible sin datos reales

Desde la raíz de la API:

    node -r ts-node/register scripts/render-atlantico-preview.cjs <ruta-absoluta-output.pdf>

El script construye un documento sintético equilibrado con CRC, USD, nombres largos, un saldo negativo y una cuenta con 25 sobres para comprobar continuidad de páginas. No abre SQLite ni llama a servicios bancarios. Escribe HTML y PDF para inspección.

Para revisar la aplicación completa:

    node -r ts-node/register scripts/start-atlantico-preview.cjs

Esta segunda herramienta crea una base nueva en el directorio temporal, rechaza rutas existentes mediante el helper de tests y escucha solo en localhost:3210. Las cotizaciones son ficticias. Se utiliza exclusivamente para previsualización local.

Después de cambios de plantilla, generar PDF, renderizar cada página con Poppler y revisar glifos, márgenes, encabezados repetidos, importes y notas. Las pruebas HTTP verifican snapshots, respuestas 404, escape de contenido y encabezados de la alternativa HTML. La revisión visual no reemplaza esas pruebas.
