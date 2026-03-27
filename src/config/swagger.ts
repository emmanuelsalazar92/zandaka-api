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
            message: { type: 'string' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  detail: { type: 'string' },
                },
              },
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  enum: [
                    'VALIDATION_ERROR',
                    'NOT_FOUND',
                    'FORBIDDEN',
                    'CONFLICT',
                    'INACTIVE_RESOURCE',
                    'INTERNAL_ERROR',
                  ],
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
        AccountInfo: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            institution_id: { type: 'integer' },
            name: { type: 'string' },
            currency: { type: 'string' },
            is_active: { type: 'integer' },
            allow_overdraft: { type: 'integer' },
            institution: { type: 'string' },
            type: { type: 'string' },
          },
        },
        AccountBalance: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            institution_id: { type: 'integer' },
            name: { type: 'string' },
            currency: { type: 'string' },
            is_active: { type: 'integer' },
            allow_overdraft: { type: 'integer' },
            institution: { type: 'string', nullable: true },
            type: { type: 'string', nullable: true },
            balance: { type: 'number' },
            has_active_envelopes: { type: 'boolean' },
            active_envelopes_count: { type: 'integer' },
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
            status: { type: 'string', enum: ['OPEN', 'BALANCED', 'IGNORED'] },
            isActive: { type: 'integer', enum: [0, 1] },
            note: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            closedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ReconciliationSummary: {
          allOf: [
            { $ref: '#/components/schemas/Reconciliation' },
            {
              type: 'object',
              properties: {
                calculatedCurrent: { type: 'number' },
                differenceCurrent: { type: 'number' },
                statusCurrent: { type: 'string', enum: ['OPEN', 'BALANCED'] },
              },
            },
          ],
        },
        PreferredCurrency: {
          type: 'object',
          properties: {
            userId: { type: 'integer' },
            baseCurrency: { type: 'string' },
          },
        },
        CreateBudgetRequest: {
          type: 'object',
          required: ['userId', 'month', 'currency', 'totalIncome'],
          properties: {
            userId: { type: 'integer', example: 1 },
            month: { type: 'string', example: '2026-03' },
            currency: { type: 'string', example: 'USD' },
            totalIncome: { type: 'number', example: 2450.75 },
          },
        },
        ReplaceBudgetLinesRequest: {
          type: 'object',
          required: ['userId', 'lines'],
          properties: {
            userId: { type: 'integer', example: 1 },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                required: ['categoryId', 'amount', 'percentage', 'sortOrder'],
                properties: {
                  categoryId: { type: 'integer', example: 12 },
                  amount: { type: 'number', example: 800 },
                  percentage: { type: 'number', example: 32.65 },
                  notes: { type: 'string', nullable: true, example: 'Rent and HOA' },
                  sortOrder: { type: 'integer', example: 1 },
                },
              },
            },
          },
        },
        BudgetFinalizeRequest: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'integer', example: 1 },
          },
        },
        BudgetCopyRequest: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'integer', example: 1 },
            sourceBudgetId: { type: 'integer', nullable: true, example: 14 },
          },
        },
        BudgetFundingPlanRequest: {
          type: 'object',
          required: ['userId', 'sourceAccountId', 'lines'],
          properties: {
            userId: { type: 'integer', example: 1 },
            sourceAccountId: { type: 'integer', example: 5 },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                required: ['budgetLineId', 'accountEnvelopeId'],
                properties: {
                  budgetLineId: { type: 'integer', example: 101 },
                  accountEnvelopeId: { type: 'integer', example: 55 },
                },
              },
            },
          },
        },
        BudgetFundRequest: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'integer', example: 1 },
            description: {
              type: 'string',
              nullable: true,
              example: 'Fund March budget after payroll deposit',
            },
          },
        },
        BudgetSummary: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            userId: { type: 'integer' },
            month: { type: 'string', example: '2026-03' },
            currency: { type: 'string', example: 'USD' },
            totalIncome: { type: 'number', example: 2450.75 },
            status: { type: 'string', enum: ['draft', 'finalized', 'funded'] },
            sourceAccountId: { type: 'integer', nullable: true },
            sourceAccountName: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            linesCount: { type: 'integer', example: 5 },
            distributedAmount: { type: 'number', example: 2450.75 },
            distributedPercentage: { type: 'number', example: 100 },
            remainingAmount: { type: 'number', example: 0 },
            remainingPercentage: { type: 'number', example: 0 },
          },
        },
        BudgetLine: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            budgetId: { type: 'integer' },
            categoryId: { type: 'integer' },
            categoryName: { type: 'string' },
            amount: { type: 'number' },
            percentage: { type: 'number' },
            notes: { type: 'string', nullable: true },
            sortOrder: { type: 'integer' },
            accountEnvelopeId: { type: 'integer', nullable: true },
            accountId: { type: 'integer', nullable: true },
            accountName: { type: 'string', nullable: true },
            accountCurrency: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        BudgetValidation: {
          type: 'object',
          properties: {
            isValid: { type: 'boolean' },
            distributedAmount: { type: 'number' },
            distributedPercentage: { type: 'number' },
            remainingAmount: { type: 'number' },
            remainingPercentage: { type: 'number' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  detail: { type: 'string' },
                },
              },
            },
          },
        },
        BudgetFundingAccount: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            currency: { type: 'string' },
            institutionId: { type: 'integer' },
            institutionName: { type: 'string' },
          },
        },
        BudgetFundingEnvelopeOption: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            accountId: { type: 'integer' },
            accountName: { type: 'string' },
            accountCurrency: { type: 'string' },
            institutionName: { type: 'string' },
            categoryId: { type: 'integer' },
            categoryName: { type: 'string' },
          },
        },
        BudgetFundingPlanLine: {
          type: 'object',
          properties: {
            budgetLineId: { type: 'integer' },
            categoryId: { type: 'integer' },
            categoryName: { type: 'string' },
            amount: { type: 'number' },
            percentage: { type: 'number' },
            accountEnvelopeId: { type: 'integer', nullable: true },
            accountId: { type: 'integer', nullable: true },
            accountName: { type: 'string', nullable: true },
            accountCurrency: { type: 'string', nullable: true },
            isAssigned: { type: 'boolean' },
          },
        },
        BudgetFundingPlan: {
          type: 'object',
          properties: {
            budget: { $ref: '#/components/schemas/BudgetSummary' },
            sourceAccountId: { type: 'integer', nullable: true },
            sourceAccountName: { type: 'string', nullable: true },
            lines: {
              type: 'array',
              items: { $ref: '#/components/schemas/BudgetFundingPlanLine' },
            },
            isComplete: { type: 'boolean' },
          },
        },
        BudgetFundingOptionLine: {
          allOf: [
            { $ref: '#/components/schemas/BudgetLine' },
            {
              type: 'object',
              properties: {
                availableEnvelopes: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/BudgetFundingEnvelopeOption' },
                },
              },
            },
          ],
        },
        BudgetFundingOptions: {
          type: 'object',
          properties: {
            budget: { $ref: '#/components/schemas/BudgetSummary' },
            accounts: {
              type: 'array',
              items: { $ref: '#/components/schemas/BudgetFundingAccount' },
            },
            lines: {
              type: 'array',
              items: { $ref: '#/components/schemas/BudgetFundingOptionLine' },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Budgets', description: 'Monthly budget planning and funding workflows' },
      { name: 'Users', description: 'User preferences and profile data' },
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
