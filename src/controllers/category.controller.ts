import { Request, Response } from 'express';
import { CategoryService } from '../services/category.service';

const service = new CategoryService();

export class CategoryController {
  static create(req: Request, res: Response) {
    const { userId, name, parentId } = req.body;
    const category = service.create(userId, name, parentId);
    res.status(201).json(category);
  }

  static update(req: Request, res: Response) {
    const { id } = req.params;
    const { name, parentId } = req.body;
    const category = service.update(Number(id), name, parentId);
    res.json(category);
  }

  static deactivate(req: Request, res: Response) {
    const { id } = req.params;
    service.deactivate(Number(id));
    res.status(204).send();
  }
}

