# Regresión financiera del rediseño — ZA-107

Revisión local del 22 de noviembre de 2026 sobre API `af90bae` y web `c22cfc1`, más las correcciones de layout de ZA-107. No se despliega testing ni se modifican contratos, reglas monetarias, esquema o datos del propietario.

## Resultado de API

`npm test` terminó correctamente: **98 pruebas financieras**, **4 de aritmética decimal** y **22 del cliente operativo**. Formato de evidencia: logs de la ejecución en `operaciones/ZA-107/api-tests-loopback.log`, con código de salida cero. Lint, tipos y build también terminaron correctamente.

| Riesgo               | Cobertura ejecutada                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Precisión CRC/USD    | Centavos, sumas repetidas, escala de moneda, rango numérico, overflow y conservación de totales; `monetary-balance`, `settings`, `decimal-arithmetic`.                |
| Historia heredada    | Normalización del agregado sin redondear o modificar líneas históricas; ajuste único de residuos frente a diferencias monetarias reales; esquema anterior preservado. |
| Transferencias       | Origen/destino, misma moneda, importe positivo, líneas opuestas, propiedad, rechazo atómico y replay durable del mismo UUID, incluso tras perder la confirmación.     |
| Conciliación         | Centavo real permanece abierto, conteo manual/denominaciones, restricciones de actividad y cierre sin alterar historia.                                               |
| Presupuestos         | Origen USD/CRC, compra/venta, porcentajes, IVA y redondeos explícitos; guardado, revisión, asignación y recibos atómicos; rollback íntegro si falla una parte.        |
| Reportes             | Snapshot versionado y congelado, lectura HTML/PDF a partir de datos guardados, escape de contenido y conservación de snapshots/esquema tras inicialización repetida.  |
| Resumen              | Filtro mensual exclusivo de gastos, exclusión de transferencias y separación de monedas; parámetros inválidos rechazados.                                             |
| Ficha de movimientos | Fecha contable y timestamp separados, todas las líneas y extremos inactivos; aislamiento entre propietarios y errores sin metadatos ajenos.                           |

Las suites crean su propia SQLite sintética en directorios temporales y seleccionan `DB_PATH` antes de cargar la aplicación. No arrancar el servidor de desarrollo ni apuntar las pruebas a una DB real. No se ejecutó `migrate-money`, saneamiento, recálculo o preparación contra testing. La ejecución del cliente operativo usa transporte simulado, no SSH real.

El primer intento bajo sandbox tuvo errores `connect EACCES 127.0.0.1`. Se conservaron sus logs como fallo de entorno y se repitió con loopback habilitado; no se modificaron expectativas para silenciarlos.

## Reproducción

Desde este repositorio: `npm test`, `npm run lint`, `npm run type-check`, `npm run build`. No requieren la copia productiva de auditoría. No incorporar la base del propietario a fixtures o reportes.

La [matriz web del mismo ticket](https://github.com/emmanuelsalazar92/zandaka-web/blob/staging/docs/critical-regression.md) detalla escenarios UX-01 a UX-15, ampliación de texto, temas, teclado y los hallazgos de layout. Ambos documentos se entregan en commits locales; el enlace remoto estará actualizado cuando el propietario solicite publicar.

Esta revisión no acredita el estado actual de imágenes remotas ni una sesión con lector de pantalla o zoom nativo. La validación humana sigue en ZA-108; rendimiento y entrega gradual en ZA-109. No confundir tests locales aprobados con un nuevo deploy.
