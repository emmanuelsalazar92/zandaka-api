# Gastos del Resumen — ZA-99

Extensión compatible del 6 de noviembre de 2026. Trabajo en `staging`, con commit local; sin push, imágenes ni deploy por este ticket.

`GET /api/reports/monthly-expenses?month=YYYY-MM&type=EXPENSE` devuelve solo las líneas negativas de movimientos de tipo EXPENSE en el mes indicado, agrupadas por categoría y moneda. No cuenta transferencias internas como gasto. El mes admite 01–12; el único type opcional aceptado es EXPENSE. Valores inválidos o repetidos se rechazan con 400.

Omitir type **conserva la consulta anterior**: salidas de EXPENSE y TRANSFER. No cambia su agrupación, alcance de cuentas ni política de normalización monetaria. Se emplea el parámetro textual ALL/EXPENSE con binding; `moneyStatement` serializa los números como texto, de modo que no debe usarse una comparación `? = 0` como selector booleano SQL.

El nuevo Resumen consume el filtro EXPENSE y consulta la actividad con los límites inclusivos del mismo mes mediante el GET existente de Movimientos. La web conserva el alcance anterior del consolidado de sobres activos y la cotización; el saldo no se convierte en un cierre histórico al elegir un mes. Ver [comportamiento web](https://github.com/emmanuelsalazar92/zandaka-web/blob/staging/docs/dashboard.md) cuando se publique el bloque.

`tests/monetary-balance.test.ts` verifica por HTTP real y SQLite temporal: separación CRC/USD, exclusión de transferencias con el filtro, compatibilidad al omitirlo, límites mensuales, validación de query y conservación de líneas/esquema. Las suites anteriores siguen incluidas en npm test.

Validación local: formato, lint, tipos y build correctos; npm test pasó 98 pruebas funcionales, 4 aritméticas y 22 del cliente SSH (124 en total). No se llamó al desplegador real para ejecutar esas pruebas.

No hay cambios de DB, preparación auxiliar, migración monetaria, saneamiento, recalculado o actualización de snapshots. Para el futuro deploy, promover ambas imágenes de ZA-99; no basta desplegar la web sobre una API anterior que ignore type. Esta entrega local no cambia el estado de testing registrado en [deploy-testing](deploy-testing.md).
