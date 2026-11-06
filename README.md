# Personal Budgeting Backend

## Atlántico y staging

**Para desplegar testing, empezar por la [guía operativa del bloque](docs/deploy-testing.md). ZA-97 añade `budget_plan`, pendiente de preparación explícita; ZA-90 requiere `transfer_request`. La [ampliación del desplegador y cliente Windows](docs/testing-deployer-za97.md) incorpora el perfil `za90-za97`; su aceptación remota ya pasó desde Windows en 192.168.31.118. Actualizar imágenes no basta.**

Consultar [Presupuestos mensuales Marea](docs/budget-plans.md): ingreso neto/comprobantes, planificación USD/CRC y asignación balanceada de fondos existentes. Sin cambios en presupuestos ni saldos históricos.

Consultar [contrato histórico y renderizado de reportes](docs/atlantico-reportes.md) y [publicación desde staging](docs/staging.md). La alternativa HTML y la exportación PDF utilizan los valores conservados del snapshot. Web y API deben promoverse como imágenes compatibles.

A REST API for an envelope budgeting system built with Express, TypeScript, and SQLite.

## Features

- **Envelope Budgeting System**: Link categories to accounts to create spending envelopes
- **Transaction Management**: Create income, expense, transfer, and adjustment transactions
- **Multi-Currency Support**: Track accounts in different currencies
- **Reconciliation**: Compare real account balances with calculated balances
- **Reporting**: Get account balances, envelope balances, negative envelopes, monthly expenses, and more

## Tech Stack

- Node.js + Express
- TypeScript
- SQLite (better-sqlite3)
- Zod for validation

## Project Structure

```
src/
├── app.ts                    # Express app setup
├── server.ts                 # Server entry point
├── db/
│   └── db.ts                 # Database connection and schema
├── types/
│   └── index.ts              # TypeScript type definitions
├── repositories/             # Data access layer
│   ├── institution.repo.ts
│   ├── account.repo.ts
│   ├── category.repo.ts
│   ├── envelope.repo.ts
│   ├── transaction.repo.ts
│   ├── reconciliation.repo.ts
│   └── report.repo.ts
├── services/                 # Business logic layer
│   ├── institution.service.ts
│   ├── account.service.ts
│   ├── category.service.ts
│   ├── envelope.service.ts
│   ├── transaction.service.ts
│   ├── reconciliation.service.ts
│   └── report.service.ts
├── controllers/              # Request handlers
│   ├── institution.controller.ts
│   ├── account.controller.ts
│   ├── category.controller.ts
│   ├── envelope.controller.ts
│   ├── transaction.controller.ts
│   ├── reconciliation.controller.ts
│   └── report.controller.ts
├── routes/                   # Route definitions
│   ├── institution.routes.ts
│   ├── account.routes.ts
│   ├── category.routes.ts
│   ├── envelope.routes.ts
│   ├── transaction.routes.ts
│   ├── reconciliation.routes.ts
│   └── report.routes.ts
├── validators/               # Zod validation schemas
│   ├── institution.validator.ts
│   ├── account.validator.ts
│   ├── category.validator.ts
│   ├── envelope.validator.ts
│   ├── transaction.validator.ts
│   ├── reconciliation.validator.ts
│   └── report.validator.ts
└── middlewares/
    ├── validator.middleware.ts
    └── errorHandler.ts
```

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Create your environment file:**

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. **Run the development server:**

   ```bash
   npm run dev
   ```

   Configure `CORS_ORIGINS` in `.env`. By default, the example file allows both
   `http://localhost:3001` and `http://127.0.0.1:3001`.

   If you need multiple allowed frontend origins, separate them with commas:

   ```bash
   CORS_ORIGINS=http://localhost:3001,https://app.example.com
   ```

   For local Docker releases where the backend is only reachable inside the Docker network,
   `CORS_ORIGINS=*` can be used so LAN clients can access the frontend without editing the IP.

4. **Build for production:**

   ```bash
   npm run build
   npm start
   ```

The database file will be created automatically at `./data/presupuesto.db` when the server starts.

## API Endpoints

### Base URL: `/api`

### Institutions

- `POST /api/institutions` - Create institution
- `PATCH /api/institutions/:id` - Update institution
- `POST /api/institutions/:id/deactivate` - Deactivate institution

### Accounts

- `POST /api/accounts` - Create account
- `PATCH /api/accounts/:id` - Update account
- `POST /api/accounts/:id/deactivate` - Deactivate account
- `POST /api/accounts/:accountId/envelopes` - Create envelope (link category to account)

### Categories

- `POST /api/categories` - Create category
- `PATCH /api/categories/:id` - Update category
- `POST /api/categories/:id/deactivate` - Deactivate category

### Envelopes

- `POST /api/envelopes/:id/deactivate` - Deactivate envelope

### Transactions

- `POST /api/transactions` - Create transaction
- `GET /api/transactions` - List transactions (with filters: from, to, accountId, categoryId, q, userId)

### Reconciliations

- `POST /api/reconciliations` - Create reconciliation
- `GET /api/reconciliations?accountId=1` - List reconciliations for account

### Reports

- `GET /api/reports/account-balances` - Get all account balances
- `GET /api/reports/envelope-balances?accountId=1` - Get envelope balances for account
- `GET /api/reports/negative-envelopes` - Get all envelopes with negative balances
- `GET /api/reports/monthly-expenses?month=YYYY-MM` - Get monthly expenses by category
- `GET /api/reports/category-totals` - Get total amounts by category
- `GET /api/reports/inconsistencies?accountId=1` - Get reconciliation inconsistencies

## Example Requests

### Create a Transaction (Transfer)

```json
POST /api/transactions
{
  "userId": 1,
  "date": "2024-01-15",
  "type": "TRANSFER",
  "description": "Transfer from checking to savings",
  "lines": [
    { "accountId": 1, "envelopeId": 10, "amount": -50000 },
    { "accountId": 2, "envelopeId": 22, "amount": 50000 }
  ]
}
```

### Create a Reconciliation

```json
POST /api/reconciliations
{
  "accountId": 1,
  "date": "2024-01-31",
  "realBalance": 123456.78,
  "note": "End of month reconciliation"
}
```

Response includes `calculatedBalance` and `difference`:

```json
{
  "id": 1,
  "accountId": 1,
  "date": "2024-01-31",
  "realBalance": 123456.78,
  "calculatedBalance": 123400.0,
  "difference": 56.78,
  "note": "End of month reconciliation",
  "createdAt": "2024-01-31T12:00:00.000Z"
}
```

## Domain Rules

1. **Single-user system**: All tables include `user_id`, but MVP assumes one user
2. **Envelope system**: Categories are global; envelopes link categories to accounts
3. **Transaction lines**: Every transaction line must reference an envelope
4. **Transfers**: Represented as one transaction with two lines (negative + positive, sum = 0)
5. **Validation**: Transaction line `account_id` must match the envelope's account
6. **Active resources**: Inactive accounts/envelopes/categories/institutions block new movements
7. **Negative balances**: Allowed but reportable
8. **Multi-currency**: Each account has a currency; no automatic conversion
9. **Reconciliation**: Compare real balance with calculated balance as of a date

## Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR|NOT_FOUND|CONFLICT|INACTIVE_RESOURCE|INTERNAL_ERROR",
    "message": "Error description",
    "details": []
  }
}
```

## Database Schema

The database schema is automatically created on first run. Tables include:

- `user` - Users
- `institution` - Financial institutions
- `account` - Bank accounts
- `category` - Budget categories (supports hierarchy via `parent_id`)
- `account_envelope` - Links categories to accounts
- `transactions` - Transaction headers
- `transaction_line` - Transaction line items
- `reconciliation` - Account reconciliation snapshots
- `exchange_rate` - Currency exchange rates

## Development

- **Type checking**: `npm run type-check`
- **Watch mode**: `npm run dev` (uses nodemon + ts-node)

## Notes

- Amounts are stored as REAL (floating point) in SQLite
- Dates are stored as TEXT in YYYY-MM-DD format
- Boolean values are stored as INTEGER (0/1)
- Foreign keys are enforced by SQLite

Transferencias guiadas y preparación explícita de idempotencia: [ZA-90](docs/transfers.md).
