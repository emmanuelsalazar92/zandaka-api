import express, { Express } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { errorHandler } from './middlewares/errorHandler';
import { swaggerSpec } from './config/swagger';

// Routes
import institutionRoutes from './routes/institution.routes';
import accountRoutes from './routes/account.routes';
import categoryRoutes from './routes/category.routes';
import envelopeRoutes from './routes/envelope.routes';
import transactionRoutes from './routes/transaction.routes';
import reconciliationRoutes from './routes/reconciliation.routes';
import reportRoutes from './routes/report.routes';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(cors({
    origin: 'http://localhost:3001',
    credentials: true // permite cookies/cabeceras auth entre frontend y backend
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Swagger Documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Budget API Documentation',
  }));

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
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/institutions', institutionRoutes);
  app.use('/api/accounts', accountRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/envelopes', envelopeRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/reconciliations', reconciliationRoutes);
  app.use('/api/reports', reportRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

