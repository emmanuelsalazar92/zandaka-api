import { Router } from 'express';
import { InstitutionController } from '../controllers/institution.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createInstitutionSchema,
  updateInstitutionSchema,
  deactivateInstitutionSchema,
} from '../validators/institution.validator';

const router = Router();

/**
 * @swagger
 * /api/institutions:
 *   post:
 *     summary: Create a new institution
 *     tags: [Institutions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - name
 *               - type
 *             properties:
 *               userId:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *                 example: "Chase Bank"
 *               type:
 *                 type: string
 *                 example: "Bank"
 *     responses:
 *       201:
 *         description: Institution created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Institution'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', validate(createInstitutionSchema), InstitutionController.create);

/**
 * @swagger
 * /api/institutions/{id}:
 *   get:
 *     summary: Get institution by ID
 *     tags: [Institutions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Institution ID
 *     responses:
 *       200:
 *         description: Institution found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Institution'
 *       404:
 *         description: Institution not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', InstitutionController.getById);

/**
 * @swagger
 * /api/institutions/{id}:
 *   patch:
 *     summary: Update an institution
 *     tags: [Institutions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Institution ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Bank Name"
 *               type:
 *                 type: string
 *                 example: "Credit Union"
 *     responses:
 *       200:
 *         description: Institution updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Institution'
 *       404:
 *         description: Institution not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id', validate(updateInstitutionSchema), InstitutionController.update);

/**
 * @swagger
 * /api/institutions/{id}/deactivate:
 *   post:
 *     summary: Deactivate an institution
 *     tags: [Institutions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Institution ID
 *     responses:
 *       204:
 *         description: Institution deactivated successfully
 *       404:
 *         description: Institution not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/deactivate', validate(deactivateInstitutionSchema), InstitutionController.deactivate);

/**
 * @swagger
 * /api/institutions:
 *   get:
 *     summary: Get all institutions
 *     tags: [Institutions]
 *     responses:
 *       200:
 *         description: Institutions found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Institution'
 *       404:
 *         description: No institutions found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', InstitutionController.getAll);

export default router;
