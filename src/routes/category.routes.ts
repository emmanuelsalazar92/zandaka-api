import { Router } from 'express';
import { CategoryController } from '../controllers/category.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createCategorySchema,
  updateCategorySchema,
  deactivateCategorySchema,
} from '../validators/category.validator';

const router = Router();

/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Create a new category
 *     tags: [Categories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - name
 *             properties:
 *               userId:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *                 example: "Groceries"
 *               parentId:
 *                 type: integer
 *                 nullable: true
 *                 example: null
 *     responses:
 *       201:
 *         description: Category created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Category'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Parent category not found
 *       409:
 *         description: Parent category is inactive
 */
router.post('/', validate(createCategorySchema), CategoryController.create);

/**
 * @swagger
 * /api/categories/{id}:
 *   patch:
 *     summary: Update a category
 *     tags: [Categories]
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
 *                 example: "Updated Category Name"
 *               parentId:
 *                 type: integer
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Category updated successfully
 *       404:
 *         description: Category not found
 *       409:
 *         description: Parent category is inactive
 */
router.patch('/:id', validate(updateCategorySchema), CategoryController.update);

/**
 * @swagger
 * /api/categories/{id}/deactivate:
 *   post:
 *     summary: Deactivate a category
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Category deactivated successfully
 *       404:
 *         description: Category not found
 */
router.post('/:id/deactivate', validate(deactivateCategorySchema), CategoryController.deactivate);

export default router;

