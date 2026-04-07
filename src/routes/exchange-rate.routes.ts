import { Router } from 'express';
import { ExchangeRateController } from '../controllers/exchange-rate.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createStoredExchangeRateSchema,
  deleteStoredExchangeRateSchema,
  getExchangeRateSchema,
  getStoredExchangeRateSchema,
  listStoredExchangeRatesSchema,
  updateStoredExchangeRateSchema,
} from '../validators/exchange-rate.validator';

const router = Router();

/**
 * @swagger
 * /api/exchange-rate:
 *   get:
 *     summary: List stored exchange rates
 *     tags: [Exchange Rates]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: fromCurrency
 *         schema:
 *           type: string
 *       - in: query
 *         name: toCurrency
 *         schema:
 *           type: string
 *       - in: query
 *         name: effectiveDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Stored exchange rates
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StoredExchangeRate'
 */
router.get('/', validate(listStoredExchangeRatesSchema), ExchangeRateController.list);

/**
 * @swagger
 * /api/exchange-rate:
 *   post:
 *     summary: Create a stored exchange rate
 *     tags: [Exchange Rates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateStoredExchangeRateRequest'
 *     responses:
 *       201:
 *         description: Exchange rate created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StoredExchangeRate'
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate effective date for the same pair
 */
router.post('/', validate(createStoredExchangeRateSchema), ExchangeRateController.create);

/**
 * @swagger
 * /api/exchange-rate/{day}/{month}/{year}:
 *   get:
 *     summary: Get exchange rate by date from the external CRC service
 *     description: Retrieves CRC exchange rate data from tipodecambio.paginasweb.cr
 *     tags: [Exchange Rates]
 *     parameters:
 *       - in: path
 *         name: day
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 31
 *       - in: path
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1900
 *     responses:
 *       200:
 *         description: External exchange rate retrieved successfully
 */
router.get('/:day/:month/:year', validate(getExchangeRateSchema), ExchangeRateController.getByDate);

/**
 * @swagger
 * /api/exchange-rate/{id}:
 *   get:
 *     summary: Get a stored exchange rate by ID
 *     tags: [Exchange Rates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Exchange rate found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StoredExchangeRate'
 *       404:
 *         description: Exchange rate not found
 */
router.get('/:id', validate(getStoredExchangeRateSchema), ExchangeRateController.getById);

/**
 * @swagger
 * /api/exchange-rate/{id}:
 *   put:
 *     summary: Update a stored exchange rate
 *     tags: [Exchange Rates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateStoredExchangeRateRequest'
 *     responses:
 *       200:
 *         description: Exchange rate updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StoredExchangeRate'
 *       404:
 *         description: Exchange rate not found
 *       409:
 *         description: Duplicate effective date for the same pair
 */
router.put('/:id', validate(updateStoredExchangeRateSchema), ExchangeRateController.update);

/**
 * @swagger
 * /api/exchange-rate/{id}:
 *   delete:
 *     summary: Delete a stored exchange rate
 *     tags: [Exchange Rates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Exchange rate deleted successfully
 *       404:
 *         description: Exchange rate not found
 */
router.delete('/:id', validate(deleteStoredExchangeRateSchema), ExchangeRateController.remove);

export default router;
