# Personal Budgeting Backend

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

2. **Run the development server:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

The database file will be created automatically at `./data/presupuesto.db` when the server starts.

## API Endpoints

### Base URL: `http://localhost:3000/api`

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
  "calculatedBalance": 123400.00,
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

