import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { validate } from '../middlewares/validator.middleware';
import { getUserSchema, updateUserSchema } from '../validators/user.validator';

const router = Router();

/**
 * @swagger
 * /api/users/preferred-currency:
 *   get:
 *     summary: Get the preferred currency for the hardcoded user
 *     description: Returns the base currency configured for user ID 1
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Preferred currency retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PreferredCurrency'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/preferred-currency', UserController.getPreferredCurrency);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user settings
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserSettings'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', validate(getUserSchema), UserController.getById);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user settings
 *     tags: [Users]
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
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Emma Soto
 *               baseCurrency:
 *                 type: string
 *                 example: USD
 *     responses:
 *       200:
 *         description: User settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserSettings'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', validate(updateUserSchema), UserController.update);

export default router;
