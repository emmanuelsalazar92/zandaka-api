import express, { Express } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { errorHandler } from './middlewares/errorHandler';
import { measureRouter } from './performance';
import { swaggerSpec } from './config/swagger';

// Routes
import institutionRoutes from './routes/institution.routes';
import accountRoutes from './routes/account.routes';
import categoryRoutes from './routes/category.routes';
import envelopeRoutes from './routes/envelope.routes';
import transactionRoutes from './routes/transaction.routes';
import transferRoutes from './routes/transfer.routes';
import reconciliationRoutes from './routes/reconciliation.routes';
import reportRoutes from './routes/report.routes';
import exchangeRateRoutes from './routes/exchange-rate.routes';
import userRoutes from './routes/user.routes';
import budgetRoutes from './routes/budget.routes';
import budgetPlanRoutes from './routes/budget-plan.routes';
import autoAssignmentRuleRoutes from './routes/auto-assignment-rule.routes';
import cashDenominationRoutes from './routes/cash-denomination.routes';
import payrollRuleRoutes from './routes/payroll-rule.routes';
import payrollRoutes from './routes/payroll.routes';
import projectRoutes from './routes/project.routes';

export function createApp(): Express {
  const app = express();
  // Keep the Express 4 query shape so ambiguous identifiers still fail validation.
  app.set('query parser', 'extended');
  const corsOrigins =
    process.env.CORS_ORIGINS ??
    process.env.CORS_ORIGIN ??
    'http://localhost:3001,http://127.0.0.1:3001';
  const allowedOrigins = corsOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowAllOrigins = allowedOrigins.includes('*');

  // Middleware
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true, // permite cookies/cabeceras auth entre frontend y backend
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Swagger Documentation
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Budget API Documentation',
    }),
  );

  // Health check
  /**
   * @swagger
   * /health:
   *   get:
   *     summary: Health check endpoint
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Server is running
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: ok
   *                 timestamp:
   *                   type: string
   *                   format: date-time
   */
  app.get(['/health', '/api/health'], (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/institutions', measureRouter('/api/institutions'), institutionRoutes);
  app.use('/api/accounts', measureRouter('/api/accounts'), accountRoutes);
  app.use('/api/categories', measureRouter('/api/categories'), categoryRoutes);
  app.use('/api/envelopes', measureRouter('/api/envelopes'), envelopeRoutes);
  app.use('/api/transactions', measureRouter('/api/transactions'), transactionRoutes);
  app.use('/api/transfers', measureRouter('/api/transfers'), transferRoutes);
  app.use('/api/reconciliations', measureRouter('/api/reconciliations'), reconciliationRoutes);
  app.use('/api/reports', measureRouter('/api/reports'), reportRoutes);
  app.use('/api/exchange-rate', measureRouter('/api/exchange-rate'), exchangeRateRoutes);
  app.use(
    '/api/auto-assignment-rules',
    measureRouter('/api/auto-assignment-rules'),
    autoAssignmentRuleRoutes,
  );
  app.use('/api/users', measureRouter('/api/users'), userRoutes);
  app.use('/api/budgets', measureRouter('/api/budgets'), budgetRoutes);
  app.use('/api/budget-plans', measureRouter('/api/budget-plans'), budgetPlanRoutes);
  app.use(
    '/api/settings/cash-denominations',
    measureRouter('/api/settings/cash-denominations'),
    cashDenominationRoutes,
  );
  app.use('/api/payroll-rules', measureRouter('/api/payroll-rules'), payrollRuleRoutes);
  app.use('/api/payroll', measureRouter('/api/payroll'), payrollRoutes);

  app.use('/api/projects', measureRouter('/api/projects'), projectRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
