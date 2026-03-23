import { Router } from 'express';
import { ExchangeRateController } from '../controllers/exchange-rate.controller';
import { validate } from '../middlewares/validator.middleware';
import { getExchangeRateSchema } from '../validators/exchange-rate.validator';

const router = Router();

/**
 * @swagger
 * /api/exchange-rate/{day}/{month}/{year}:
 *   get:
 *     summary: Get exchange rate by date
 *     description: Retrieves CRC exchange rate data from the external service tipodecambio.paginasweb.cr
 *     tags: [Exchange Rate]
 *     parameters:
 *       - in: path
 *         name: day
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 31
 *         example: 16
 *       - in: path
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         example: 1
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         example: 2026
 *     responses:
 *       200:
 *         description: Exchange rate retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 compra:
 *                   type: number
 *                   example: 485.91
 *                 venta:
 *                   type: number
 *                   example: 491.51
 *                 fecha:
 *                   type: string
 *                   example: "16/01/2026"
 *       400:
 *         description: Invalid date parameters
 *       500:
 *         description: External service error
 */
router.get('/:day/:month/:year', validate(getExchangeRateSchema), ExchangeRateController.getByDate);

export default router;
