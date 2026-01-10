import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Personal Budgeting API',
      version: '1.0.0',
      description: 'REST API for envelope budgeting system with Express, TypeScript, and SQLite',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  enum: ['VALIDATION_ERROR', 'NOT_FOUND', 'CONFLICT', 'INACTIVE_RESOURCE', 'INTERNAL_ERROR'],
                },
                message: { type: 'string' },
                details: {
                  type: 'array',
                  items: { type: 'object' },
                },
              },
            },
          },
        },
        Institution: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            name: { type: 'string' },
            type: { type: 'string' },
            is_active: { type: 'integer' },
          },
        },
        Account: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            institution_id: { type: 'integer' },
            name: { type: 'string' },
            currency: { type: 'string' },
            is_active: { type: 'integer' },
            allow_overdraft: { type: 'integer' },
          },
        },
        Category: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            name: { type: 'string' },
            parent_id: { type: 'integer', nullable: true },
            is_active: { type: 'integer' },
          },
        },
        Envelope: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            account_id: { type: 'integer' },
            category_id: { type: 'integer' },
            is_active: { type: 'integer' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            date: { type: 'string', format: 'date' },
            description: { type: 'string' },
            type: {
              type: 'string',
              enum: ['INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT'],
            },
            created_at: { type: 'string', format: 'date-time' },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  transaction_id: { type: 'integer' },
                  account_id: { type: 'integer' },
                  envelope_id: { type: 'integer' },
                  amount: { type: 'number' },
                },
              },
            },
          },
        },
        Reconciliation: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            accountId: { type: 'integer' },
            date: { type: 'string', format: 'date' },
            realBalance: { type: 'number' },
            calculatedBalance: { type: 'number' },
            difference: { type: 'number' },
            note: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    tags: [
      { name: 'Institutions', description: 'Financial institutions management' },
      { name: 'Accounts', description: 'Bank accounts management' },
      { name: 'Categories', description: 'Budget categories management' },
      { name: 'Envelopes', description: 'Account-category envelope management' },
      { name: 'Transactions', description: 'Transaction and ledger entries' },
      { name: 'Reconciliations', description: 'Account reconciliation' },
      { name: 'Reports', description: 'Financial reports and analytics' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/app.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

