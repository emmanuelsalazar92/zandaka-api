# Consulta completa de un movimiento — ZA-88

`GET /api/transactions/:id?userId=N` devuelve un registro histórico de solo lectura. Ambos identificadores son obligatorios, enteros positivos seguros. La respuesta usa `Cache-Control: no-store`. Un ID inexistente o ajeno al propietario solicitado devuelve el mismo 404 `NOT_FOUND`, sin metadatos; valores inválidos devuelven 400.

## Contrato

```json
{
  "id": 88,
  "userId": 1,
  "date": "2026-11-01",
  "description": "Traslado de prueba",
  "type": "TRANSFER",
  "createdAt": "2026-11-02 01:30:00",
  "correction": { "available": false, "reason": "NO_AUDITED_CORRECTION_FLOW" },
  "lines": [
    {
      "id": 1,
      "accountId": 1,
      "accountName": "Origen",
      "accountCurrency": "CRC",
      "institutionName": "Banco de prueba",
      "envelopeId": 1,
      "categoryName": "Reserva",
      "envelopeActive": true,
      "amount": -100
    },
    {
      "id": 2,
      "accountId": 2,
      "accountName": "Destino",
      "accountCurrency": "CRC",
      "institutionName": "Banco de prueba",
      "envelopeId": 2,
      "categoryName": "Ahorro",
      "envelopeActive": false,
      "amount": 100
    }
  ]
}
```

Nombres, moneda, estado del sobre y `createdAt` pueden ser null si no están disponibles. Los nombres son los actuales del catálogo. La moneda procede exclusivamente de la cuenta vinculada; no se deduce del importe ni se supone una base. `date` es fecha contable; `createdAt` es timestamp SQLite UTC. Las líneas se ordenan por ID, sin agrupar ni normalizar signos.

## Integridad, alcance y coste

Dos consultas parametrizadas en una transacción de lectura obtienen cabecera y líneas en una vista consistente. La cabecera se restringe por `id` y `user_id` antes de consultar el detalle. Los joins también restringen los nombres al propietario. LEFT JOIN conserva todas las líneas, incluso sobres inactivos o referencias faltantes; no se filtra por actividad ni por filtros del historial. Referencias a catálogos de otro usuario no exponen sus nombres.

El alcance por `userId` sigue el contrato existente: **un parámetro del cliente no autentica al usuario**. Este ticket no añade autenticación ni roles. El endpoint no constituye una garantía para exponer públicamente la API.

Se utiliza la hidratación monetaria existente. No se escribe DDL ni datos, no se ejecutan migraciones y no cambian las consultas del listado. El coste depende de las líneas del movimiento seleccionado; no se recupera todo el libro ni se precargan las fichas al listar. No se devuelven textos de procedencia monetaria ni campos internos innecesarios.

No se introducen PATCH, PUT o DELETE. `correction` expresa que no existe un contrato auditado de corrección histórica; no es una decisión de autorización por rol.

## Verificación y despliegue

`tests/transaction-detail.test.ts` está incluido en `npm test`: HTTP con DB sintética temporal, líneas inactivas, identificadores/usuario, enlaces sin resolver, aislamiento de nombres, signos y multiplicidad. Una prueba compara esquema, filas y `total_changes()` antes/después de tres lecturas, incluyendo un valor binario histórico no redondo. No se abre una DB del usuario. Los métodos de corrección siguen devolviendo 404.

Promover junto a una web que incluya ZA-88, siguiendo [staging](staging.md) y [la guía operativa](deploy-testing.md). **Sin cambios de DB para ZA-88.** La tabla auxiliar de ZA-90 sigue siendo un requisito independiente si está en el bloque. Revertir al par anterior de imágenes no exige revertir esquema por ZA-88. Publicar imágenes no despliega testing.
