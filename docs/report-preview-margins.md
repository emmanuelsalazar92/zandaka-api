# Márgenes de previsualización — ZA-110

La plantilla compartida por HTML y PDF tenía margin: 0 en body y solo añadía padding bajo 600 px. En escritorio el HTML quedaba pegado al visor; el PDF mantenía márgenes porque PdfUtil los proporciona mediante Puppeteer.

La corrección añade exclusivamente reglas @media screen: fondo neutro del visor, hoja blanca centrada con ancho máximo de 816 px y márgenes interiores de 48 px; hasta 600 px usa separación exterior de 12 px e interior de 20 px. Los nombres e importes largos pueden partirse en pantalla. No cambia contenido de snapshots, consultas, saldos, generador de PDF ni sus márgenes Letter (14/13/18/13 mm). No añade DB ni variables.

Verificación local con la plantilla real y datos sintéticos: 360, 390, 600, 601, 820 y 1440 px sin desbordamiento, encabezado y bloque principal dentro de la hoja. Comparación automatizada de geometría y estilos de impresión de body, main, títulos, secciones, tablas, filas, celdas y pie: idénticos antes/después. Evidencia y script: operaciones/ZA-110 del workspace. La comprobación compara impresión del navegador; no representa una revisión de todos los PDFs históricos ni datos reales.

Implementado en staging con commit local, sin push ni deploy. El cambio pertenece a la plantilla servida por la API: una futura entrega debe incluir la nueva API; actualizar únicamente la web no lo aplica. Seguir docs/deploy-testing.md y la cadencia por bloques. No requiere preparación de DB por este ticket.
