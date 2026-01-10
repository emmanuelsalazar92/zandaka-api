import { Router } from 'express';
import { EnvelopeController } from '../controllers/envelope.controller';
import { validate } from '../middlewares/validator.middleware';
import { deactivateEnvelopeSchema } from '../validators/envelope.validator';

const router = Router();

/**
 * @swagger
 * /api/envelopes/{id}/deactivate:
 *   post:
 *     summary: Deactivate an envelope
 *     tags: [Envelopes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Envelope ID
 *     responses:
 *       204:
 *         description: Envelope deactivated successfully
 *       404:
 *         description: Envelope not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/deactivate', validate(deactivateEnvelopeSchema), EnvelopeController.deactivate);

export default router;

