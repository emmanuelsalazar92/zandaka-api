import { Router } from 'express';
import { UserController } from '../controllers/user.controller';

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
 *               type: object
 *               properties:
 *                 userId:
 *                   type: integer
 *                   example: 1
 *                 baseCurrency:
 *                   type: string
 *                   example: USD
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/preferred-currency', UserController.getPreferredCurrency);

export default router;
