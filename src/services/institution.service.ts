import { InstitutionRepository } from '../repositories/institution.repo';
import { Institution } from '../types';

export class InstitutionService {
  private repo = new InstitutionRepository();

  create(userId: number, name: string, type: string): Institution {
    return this.repo.create(userId, name, type);
  }

  update(id: number, name?: string, type?: string): Institution {
    const institution = this.repo.update(id, name, type);
    if (!institution) {
      throw { code: 'NOT_FOUND', message: 'Institution not found' };
    }
    return institution;
  }

  deactivate(id: number): void {
    const success = this.repo.deactivate(id);
    if (!success) {
      throw { code: 'NOT_FOUND', message: 'Institution not found' };
    }
  }

  isActive(id: number): boolean {
    return this.repo.isActive(id);
  }

  findById(id: number): Institution {
    const institution = this.repo.findById(id);
    if (!institution) {
      throw { code: 'NOT_FOUND', message: 'Institution not found' };
    }
    return institution;
  }

  findAll(): Institution[] {
    const institutions = this.repo.findAll();
    if (institutions.length === 0) {
      throw { code: 'NOT_FOUND', message: 'No institutions found' };
    }
    return institutions;
  }
}

