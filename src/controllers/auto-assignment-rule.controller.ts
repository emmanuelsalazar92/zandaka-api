import { Request, Response } from 'express';
import { AutoAssignmentRuleService } from '../services/auto-assignment-rule.service';

const service = new AutoAssignmentRuleService();

export class AutoAssignmentRuleController {
  static list(req: Request, res: Response) {
    const { userId } = req.query;
    const rules = service.list(Number(userId));
    res.json(rules);
  }

  static getById(req: Request, res: Response) {
    const { id } = req.params;
    const { userId } = req.query;
    const rule = service.findById(Number(id), Number(userId));
    res.json(rule);
  }

  static create(req: Request, res: Response) {
    const { userId, pattern, matchType, accountId, accountEnvelopeId, priority, isActive, notes } =
      req.body;
    const rule = service.create({
      userId,
      pattern,
      matchType,
      accountId,
      accountEnvelopeId,
      priority,
      isActive,
      notes,
    });
    res.status(201).json(rule);
  }

  static update(req: Request, res: Response) {
    const { id } = req.params;
    const { userId, pattern, matchType, accountId, accountEnvelopeId, priority, isActive, notes } =
      req.body;
    const rule = service.update(Number(id), {
      userId,
      pattern,
      matchType,
      accountId,
      accountEnvelopeId,
      priority,
      isActive,
      notes,
    });
    res.json(rule);
  }

  static updateStatus(req: Request, res: Response) {
    const { id } = req.params;
    const { userId, isActive } = req.body;
    const rule = service.setStatus(Number(id), userId, isActive);
    res.json(rule);
  }

  static remove(req: Request, res: Response) {
    const { id } = req.params;
    const { userId } = req.query;
    service.remove(Number(id), Number(userId));
    res.status(204).send();
  }

  static test(req: Request, res: Response) {
    const { userId, description } = req.body;
    const result = service.test(userId, description);
    res.json(result);
  }
}
