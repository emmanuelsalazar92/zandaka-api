import { Request, Response } from 'express';
import { EnvelopeService } from '../services/envelope.service';

const service = new EnvelopeService();

export class EnvelopeController {
  static create(req: Request, res: Response) {
    const { accountId } = req.params;
    const { categoryId } = req.body;
    const envelope = service.create(Number(accountId), categoryId);
    res.status(201).json(envelope);
  }

  static deactivate(req: Request, res: Response) {
    const { id } = req.params;
    service.deactivate(Number(id));
    res.status(204).send();
  }
}

