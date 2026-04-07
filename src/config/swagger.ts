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
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
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
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
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
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
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
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
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
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Envelope: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            account_id: { type: 'integer' },
            category_id: { type: 'integer' },
            is_active: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
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
            updated_at: { type: 'string', format: 'date-time' },
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
                  created_at: { type: 'string', format: 'date-time' },
                  updated_at: { type: 'string', format: 'date-time' },
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
            currency: { type: 'string', example: 'CRC' },
            date: { type: 'string', format: 'date' },
            countMethod: {
              type: 'string',
              enum: ['MANUAL_TOTAL', 'DENOMINATION_COUNT'],
            },
            expectedTotal: { type: 'number' },
            countedTotal: { type: 'number' },
            realBalance: { type: 'number' },
            calculatedBalance: { type: 'number' },
            difference: { type: 'number' },
            status: { type: 'string', enum: ['OPEN', 'BALANCED', 'IGNORED'] },
            isActive: { type: 'integer', enum: [0, 1] },
            note: { type: 'string', nullable: true },
            notes: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            closedAt: { type: 'string', format: 'date-time', nullable: true },
            lines: {
              type: 'array',
              items: { $ref: '#/components/schemas/ReconciliationLine' },
            },
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
        ReconciliationExpectedTotal: {
          type: 'object',
          properties: {
            accountId: { type: 'integer' },
            currency: { type: 'string', example: 'CRC' },
            date: { type: 'string', format: 'date' },
            expectedTotal: { type: 'number' },
          },
        },
        ReconciliationLine: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            reconciliationId: { type: 'integer' },
            denominationId: { type: 'integer', nullable: true },
            denominationValue: { type: 'number' },
            denominationType: { type: 'string', enum: ['BILL', 'COIN'] },
            denominationLabel: { type: 'string', nullable: true },
            quantity: { type: 'integer' },
            lineTotal: { type: 'number' },
            sortOrder: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateReconciliationLineRequest: {
          type: 'object',
          required: ['quantity'],
          properties: {
            denominationId: { type: 'integer', nullable: true, example: 1 },
            denominationValue: { type: 'number', nullable: true, example: 500 },
            denominationType: {
              type: 'string',
              nullable: true,
              enum: ['BILL', 'COIN'],
              example: 'COIN',
            },
            denominationLabel: { type: 'string', nullable: true, example: '₡500' },
            quantity: { type: 'integer', minimum: 0, example: 4 },
            sortOrder: { type: 'integer', minimum: 0, example: 6 },
          },
        },
        CreateReconciliationRequest: {
          type: 'object',
          required: ['accountId'],
          properties: {
            accountId: { type: 'integer', example: 12 },
            date: { type: 'string', format: 'date', example: '2026-04-01' },
            countMethod: {
              type: 'string',
              enum: ['MANUAL_TOTAL', 'DENOMINATION_COUNT'],
              default: 'MANUAL_TOTAL',
            },
            realBalance: { type: 'number', nullable: true, example: 30120 },
            countedTotal: { type: 'number', nullable: true, example: 30120 },
            note: { type: 'string', nullable: true, example: 'Conteo físico de caja' },
            notes: { type: 'string', nullable: true, example: 'Conteo físico de caja' },
            lines: {
              type: 'array',
              items: { $ref: '#/components/schemas/CreateReconciliationLineRequest' },
            },
          },
        },
        CashDenomination: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            userId: { type: 'integer' },
            currency: { type: 'string', example: 'CRC' },
            value: { type: 'number', example: 500 },
            type: { type: 'string', enum: ['BILL', 'COIN'] },
            label: { type: 'string', nullable: true, example: '₡500' },
            sortOrder: { type: 'integer', example: 6 },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CashDenominationList: {
          type: 'object',
          properties: {
            userId: { type: 'integer' },
            currency: { type: 'string', nullable: true },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/CashDenomination' },
            },
          },
        },
        CreateCashDenominationRequest: {
          type: 'object',
          required: ['userId', 'currency', 'value', 'type'],
          properties: {
            userId: { type: 'integer', example: 1 },
            currency: { type: 'string', example: 'CRC' },
            value: { type: 'number', example: 500 },
            type: { type: 'string', enum: ['BILL', 'COIN'], example: 'COIN' },
            label: { type: 'string', nullable: true, example: '₡500' },
            sortOrder: { type: 'integer', example: 6 },
            isActive: { type: 'boolean', default: true },
          },
        },
        UpdateCashDenominationRequest: {
          allOf: [{ $ref: '#/components/schemas/CreateCashDenominationRequest' }],
        },
        AccountCashDenominations: {
          type: 'object',
          properties: {
            accountId: { type: 'integer' },
            currency: { type: 'string', example: 'CRC' },
            countMethod: {
              type: 'string',
              enum: ['DENOMINATION_COUNT'],
            },
            denominations: {
              type: 'array',
              items: { $ref: '#/components/schemas/CashDenomination' },
            },
          },
        },
        PreferredCurrency: {
          type: 'object',
          properties: {
            userId: { type: 'integer' },
            baseCurrency: { type: 'string' },
          },
        },
        UserSettings: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            baseCurrency: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        StoredExchangeRate: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            from_currency: { type: 'string', example: 'USD' },
            to_currency: { type: 'string', example: 'CRC' },
            rate: { type: 'number', example: 508.12 },
            effective_date: { type: 'string', format: 'date', example: '2026-03-28' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateStoredExchangeRateRequest: {
          type: 'object',
          required: ['userId', 'fromCurrency', 'toCurrency', 'rate', 'effectiveDate'],
          properties: {
            userId: { type: 'integer', example: 1 },
            fromCurrency: { type: 'string', example: 'USD' },
            toCurrency: { type: 'string', example: 'CRC' },
            rate: { type: 'number', example: 508.12 },
            effectiveDate: { type: 'string', format: 'date', example: '2026-03-28' },
          },
        },
        UpdateStoredExchangeRateRequest: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'integer', example: 1 },
            fromCurrency: { type: 'string', example: 'USD' },
            toCurrency: { type: 'string', example: 'CRC' },
            rate: { type: 'number', example: 508.12 },
            effectiveDate: { type: 'string', format: 'date', example: '2026-03-28' },
          },
        },
        AutoAssignmentRule: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            pattern: { type: 'string', example: 'spotify' },
            match_type: {
              type: 'string',
              enum: ['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EXACT', 'REGEX'],
            },
            account_id: { type: 'integer', nullable: true },
            account_envelope_id: { type: 'integer', nullable: true },
            priority: { type: 'integer', example: 100 },
            is_active: { type: 'integer', enum: [0, 1] },
            notes: { type: 'string', nullable: true },
            account_name: { type: 'string', nullable: true },
            account_currency: { type: 'string', nullable: true },
            account_envelope_account_id: { type: 'integer', nullable: true },
            category_id: { type: 'integer', nullable: true },
            category_name: { type: 'string', nullable: true },
            account_envelope_label: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateAutoAssignmentRuleRequest: {
          type: 'object',
          required: ['userId', 'pattern'],
          properties: {
            userId: { type: 'integer', example: 1 },
            pattern: { type: 'string', example: 'spotify' },
            matchType: {
              type: 'string',
              enum: ['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EXACT', 'REGEX'],
              example: 'CONTAINS',
            },
            accountId: { type: 'integer', nullable: true, example: 2 },
            accountEnvelopeId: { type: 'integer', nullable: true, example: 9 },
            priority: { type: 'integer', example: 90 },
            isActive: { type: 'boolean', example: true },
            notes: { type: 'string', nullable: true, example: 'Monthly subscription rule' },
          },
        },
        UpdateAutoAssignmentRuleRequest: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'integer', example: 1 },
            pattern: { type: 'string', example: 'spotify' },
            matchType: {
              type: 'string',
              enum: ['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EXACT', 'REGEX'],
            },
            accountId: { type: 'integer', nullable: true },
            accountEnvelopeId: { type: 'integer', nullable: true },
            priority: { type: 'integer', example: 90 },
            isActive: { type: 'boolean', example: true },
            notes: { type: 'string', nullable: true },
          },
        },
        AutoAssignmentRuleTestRequest: {
          type: 'object',
          required: ['userId', 'description'],
          properties: {
            userId: { type: 'integer', example: 1 },
            description: { type: 'string', example: 'Spotify USA monthly subscription' },
          },
        },
        AutoAssignmentRuleTestResult: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            matched: { type: 'boolean' },
            matchedRule: {
              anyOf: [
                { $ref: '#/components/schemas/AutoAssignmentRule' },
                { type: 'null' },
              ],
            },
            matches: {
              type: 'array',
              items: { $ref: '#/components/schemas/AutoAssignmentRule' },
            },
          },
        },
        PayrollCcssDetail: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            employee_rate: { type: 'number', example: 0.1083 },
            employer_rate: { type: 'number', nullable: true, example: null },
            base_type: { type: 'string', example: 'GROSS_SALARY' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        PayrollIncomeTaxBracket: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            range_order: { type: 'integer', example: 1 },
            amount_from: { type: 'number', example: 0 },
            amount_to: { type: 'number', nullable: true, example: 918000 },
            tax_rate: { type: 'number', example: 0 },
            is_exempt: { type: 'boolean', example: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        PayrollRuleSet: {
          type: 'object',
          description:
            'Versioned payroll rule set resolved by effective_from <= date and (effective_to is null or effective_to >= date) while is_active = true.',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            country_code: { type: 'string', example: 'CR' },
            rule_type: { type: 'string', enum: ['CCSS_WORKER', 'INCOME_TAX'] },
            name: { type: 'string', example: 'Income Tax 2026' },
            effective_from: { type: 'string', format: 'date', example: '2026-01-01' },
            effective_to: { type: 'string', format: 'date', nullable: true, example: '2026-12-31' },
            is_active: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            ccss_detail: {
              anyOf: [
                { $ref: '#/components/schemas/PayrollCcssDetail' },
                { type: 'null' },
              ],
            },
            income_tax_brackets: {
              type: 'array',
              items: { $ref: '#/components/schemas/PayrollIncomeTaxBracket' },
            },
          },
        },
        PayrollRuleHistory: {
          type: 'object',
          properties: {
            user_id: { type: 'integer' },
            type: {
              type: 'string',
              nullable: true,
              enum: ['CCSS_WORKER', 'INCOME_TAX'],
            },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/PayrollRuleSet' },
            },
          },
        },
        CreatePayrollCcssRuleRequest: {
          type: 'object',
          required: ['user_id', 'name', 'effective_from', 'employee_rate', 'base_type'],
          properties: {
            user_id: { type: 'integer', example: 1 },
            country_code: { type: 'string', example: 'CR', default: 'CR' },
            name: { type: 'string', example: 'CCSS Worker 2026' },
            effective_from: { type: 'string', format: 'date', example: '2026-01-01' },
            effective_to: { type: 'string', format: 'date', nullable: true, example: null },
            is_active: { type: 'boolean', default: true },
            employee_rate: { type: 'number', example: 0.1083 },
            employer_rate: { type: 'number', nullable: true, example: null },
            base_type: { type: 'string', example: 'GROSS_SALARY' },
          },
        },
        CreatePayrollIncomeTaxBracketRequest: {
          type: 'object',
          required: ['range_order', 'amount_from', 'tax_rate', 'is_exempt'],
          properties: {
            range_order: { type: 'integer', example: 1 },
            amount_from: { type: 'number', example: 0 },
            amount_to: { type: 'number', nullable: true, example: 918000 },
            tax_rate: { type: 'number', example: 0 },
            is_exempt: { type: 'integer', enum: [0, 1], example: 1 },
          },
        },
        CreatePayrollIncomeTaxRuleRequest: {
          type: 'object',
          required: ['user_id', 'name', 'effective_from', 'brackets'],
          description:
            'Brackets must be contiguous and use a lower-inclusive, upper-exclusive convention: [amount_from, amount_to). The last bracket may use amount_to = null.',
          properties: {
            user_id: { type: 'integer', example: 1 },
            country_code: { type: 'string', example: 'CR', default: 'CR' },
            name: { type: 'string', example: 'Income Tax 2026' },
            effective_from: { type: 'string', format: 'date', example: '2026-01-01' },
            effective_to: { type: 'string', format: 'date', nullable: true, example: null },
            is_active: { type: 'boolean', default: true },
            brackets: {
              type: 'array',
              items: { $ref: '#/components/schemas/CreatePayrollIncomeTaxBracketRequest' },
            },
          },
        },
        UpdatePayrollRuleRequest: {
          type: 'object',
          required: ['user_id'],
          description:
            'rule_type is immutable. Send either CCSS detail fields or income-tax brackets depending on the existing rule type.',
          properties: {
            user_id: { type: 'integer', example: 1 },
            country_code: { type: 'string', example: 'CR' },
            name: { type: 'string', example: 'Income Tax 2027' },
            effective_from: { type: 'string', format: 'date', example: '2027-01-01' },
            effective_to: { type: 'string', format: 'date', nullable: true, example: '2027-12-31' },
            is_active: { type: 'boolean' },
            employee_rate: { type: 'number', example: 0.1091 },
            employer_rate: { type: 'number', nullable: true, example: null },
            base_type: { type: 'string', example: 'GROSS_SALARY' },
            brackets: {
              type: 'array',
              items: { $ref: '#/components/schemas/CreatePayrollIncomeTaxBracketRequest' },
            },
          },
        },
        PayrollTaxBreakdownLine: {
          type: 'object',
          properties: {
            range_order: { type: 'integer', example: 2 },
            taxable_amount: { type: 'number', example: 419550 },
            tax_rate: { type: 'number', example: 0.1 },
            tax_amount: { type: 'number', example: 41955 },
          },
        },
        CalculateNetSalaryRequest: {
          type: 'object',
          required: ['user_id', 'gross_salary', 'period_date'],
          properties: {
            user_id: { type: 'integer', example: 1 },
            gross_salary: { type: 'number', example: 1500000 },
            period_date: { type: 'string', format: 'date', example: '2026-04-01' },
          },
        },
        NetSalaryCalculation: {
          type: 'object',
          description:
            'Uses the active CCSS and income-tax rule sets for period_date. Both CCSS and income tax are currently calculated from gross_salary.',
          properties: {
            gross_salary: { type: 'number', example: 1500000 },
            period_date: { type: 'string', format: 'date', example: '2026-04-01' },
            ccss_worker_rate: { type: 'number', example: 0.1083 },
            ccss_worker_amount: { type: 'number', example: 162450 },
            taxable_base: { type: 'number', example: 1500000 },
            income_tax_amount: { type: 'number', example: 65850 },
            net_salary: { type: 'number', example: 1271700 },
            ccss_rule_set_id: { type: 'integer', example: 1 },
            income_tax_rule_set_id: { type: 'integer', example: 2 },
            tax_breakdown: {
              type: 'array',
              items: { $ref: '#/components/schemas/PayrollTaxBreakdownLine' },
            },
          },
        },
        CreateReportSnapshotRequest: {
          type: 'object',
          required: ['user_id', 'report_month'],
          properties: {
            user_id: { type: 'integer', example: 1 },
            report_month: { type: 'string', example: '2026-03' },
            base_currency: { type: 'string', enum: ['CRC', 'USD'], nullable: true },
            exchange_rate_id: { type: 'integer', nullable: true, example: 5 },
            usd_to_crc_rate: { type: 'number', nullable: true, example: 512.34 },
            ccss_rule_set_id: {
              type: 'integer',
              nullable: true,
              description: 'Optional reference preserved in the historical snapshot.',
              example: 11,
            },
            income_tax_rule_set_id: {
              type: 'integer',
              nullable: true,
              description: 'Optional reference preserved in the historical snapshot.',
              example: 12,
            },
            notes: { type: 'string', nullable: true, example: 'Reporte mensual de marzo' },
          },
        },
        ReportSnapshotSummary: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            report_month: { type: 'string', example: '2026-03' },
            version: { type: 'integer', example: 1 },
            is_latest: { type: 'integer', enum: [0, 1] },
            base_currency: { type: 'string', example: 'CRC' },
            total_crc: { type: 'number', example: 1250000 },
            total_usd: { type: 'number', example: 2430 },
            exchange_rate_used: { type: 'number', nullable: true, example: 512.34 },
            exchange_rate_id: { type: 'integer', nullable: true, example: 5 },
            consolidated_amount: { type: 'number', nullable: true, example: 2494986.2 },
            ccss_rule_set_id: { type: 'integer', nullable: true, example: 11 },
            income_tax_rule_set_id: { type: 'integer', nullable: true, example: 12 },
            generated_at: { type: 'string', format: 'date-time' },
            line_count: { type: 'integer', example: 9 },
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
            ccssRuleSetId: {
              type: 'integer',
              nullable: true,
              example: 11,
              description:
                'Optional payroll rule reference used when this budget was derived from a net-salary calculation.',
            },
            incomeTaxRuleSetId: {
              type: 'integer',
              nullable: true,
              example: 12,
              description:
                'Optional payroll rule reference used when this budget was derived from a net-salary calculation.',
            },
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
            ccssRuleSetId: { type: 'integer', nullable: true, example: 11 },
            incomeTaxRuleSetId: { type: 'integer', nullable: true, example: 12 },
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
      { name: 'Cash Denominations', description: 'User-managed cash denomination catalogs' },
      { name: 'Payroll Rules', description: 'Versioned payroll tax and contribution rule sets' },
      { name: 'Payroll', description: 'Net salary calculations based on historical payroll rules' },
      { name: 'Reports', description: 'Financial reports and analytics' },
      { name: 'Exchange Rates', description: 'Exchange rate lookup and stored rate management' },
      { name: 'Auto Assignment Rules', description: 'Rules for automatic account and envelope suggestions' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/app.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
