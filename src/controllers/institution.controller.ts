import { Request, Response } from 'express';
import { InstitutionService } from '../services/institution.service';

const service = new InstitutionService();

export class InstitutionController {
  static create(req: Request, res: Response) {
    const { userId, name, type } = req.body;
    const institution = service.create(userId, name, type);
    res.status(201).json(institution);
  }

  static update(req: Request, res: Response) {
    const { id } = req.params;
    const { name, type } = req.body;
    const institution = service.update(Number(id), name, type);
    res.json(institution);
  }

  static deactivate(req: Request, res: Response) {
    const { id } = req.params;
    service.deactivate(Number(id));
    res.status(204).send();
  }

  static getById(req: Request, res: Response) {
    const { id } = req.params;
    const institution = service.findById(Number(id));
    res.json(institution);
  }

  static getAll(req: Request, res: Response) {
    const institutions = service.findAll();
    res.json(institutions);
  }
}
