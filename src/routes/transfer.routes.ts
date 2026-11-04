import { Router } from 'express';
import { validate } from '../middlewares/validator.middleware';
import { TransferService } from '../services/transfer.service';
import { createTransferSchema } from '../validators/transfer.validator';

const router = Router();
/**
 * @swagger
 * /api/transfers:
 *   post:
 *     summary: Transfer a positive amount between two envelopes in the same currency
 *     description: Generates opposite ledger lines atomically. Required requestId is a UUID v4 retained by the caller for retries. The same user/key and identical intent replay the original result, including after endpoints become inactive. Changed intent returns IDEMPOTENCY_CONFLICT. Requires explicit transfer_request setup; startup never creates the table. userId follows the existing API identity contract; this endpoint does not introduce authentication.
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [requestId, userId, date, description, from, to, amount]
 *             properties:
 *               requestId:
 *                 type: string
 *                 format: uuid
 *               userId:
 *                 type: integer
 *                 minimum: 1
 *               date:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *               from:
 *                 type: object
 *                 additionalProperties: false
 *                 required: [accountId, envelopeId]
 *                 properties:
 *                   accountId:
 *                     type: integer
 *                     minimum: 1
 *                   envelopeId:
 *                     type: integer
 *                     minimum: 1
 *               to:
 *                 type: object
 *                 additionalProperties: false
 *                 required: [accountId, envelopeId]
 *                 properties:
 *                   accountId:
 *                     type: integer
 *                     minimum: 1
 *                   envelopeId:
 *                     type: integer
 *                     minimum: 1
 *               amount:
 *                 type: number
 *                 minimum: 0
 *                 exclusiveMinimum: true
 *                 example: 1234.56
 *     responses:
 *       201:
 *         description: New or replayed transaction and its two original ledger lines
 *       400:
 *         description: Invalid amount, date, endpoints, precision or unsupported currency pair
 *       403:
 *         description: Account, category or institution does not belong to the declared user
 *       409:
 *         description: Inactive resource or request key reused with a different intent
 *       503:
 *         description: FEATURE_NOT_READY; explicit retry storage setup is required
 */
router.post('/', validate(createTransferSchema), (req, res) => {
  const { body } = createTransferSchema.parse({ body: req.body });
  res.status(201).json(new TransferService().create(body));
});
export default router;
