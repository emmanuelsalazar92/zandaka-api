import { CategoryRepository } from '../repositories/category.repo';
import { Category } from '../types';

export class CategoryService {
  private repo = new CategoryRepository();

  create(userId: number, name: string, parentId?: number): Category {
    // Validate parent exists if provided
    if (parentId !== undefined && parentId !== null) {
      const parent = this.repo.findById(parentId);
      if (!parent) {
        throw { code: 'NOT_FOUND', message: 'Parent category not found' };
      }
      if (!this.repo.isActive(parentId)) {
        throw { code: 'INACTIVE_RESOURCE', message: 'Parent category is inactive' };
      }
    }

    return this.repo.create(userId, name, parentId);
  }

  update(id: number, name?: string, parentId?: number): Category {
    // Validate parent exists if provided
    if (parentId !== undefined && parentId !== null) {
      const parent = this.repo.findById(parentId);
      if (!parent) {
        throw { code: 'NOT_FOUND', message: 'Parent category not found' };
      }
      if (!this.repo.isActive(parentId)) {
        throw { code: 'INACTIVE_RESOURCE', message: 'Parent category is inactive' };
      }
    }

    const category = this.repo.update(id, name, parentId);
    if (!category) {
      throw { code: 'NOT_FOUND', message: 'Category not found' };
    }
    return category;
  }

  deactivate(id: number): void {
    if (this.repo.hasActiveChildren(id)) {
      throw { code: 'CONFLICT', message: 'Category has active subcategories' };
    }

    const success = this.repo.deactivate(id);
    if (!success) {
      throw { code: 'NOT_FOUND', message: 'Category not found' };
    }
  }

  isActive(id: number): boolean {
    return this.repo.isActive(id);
  }

  findById(id: number): Category {
    const category = this.repo.findById(id);
    if (!category) {
      throw { code: 'NOT_FOUND', message: 'Category not found' };
    }
    return category;
  }

  findAllActive(): Category[] {
    const categories = this.repo.findAllActive();
    if (categories.length === 0) {
      throw { code: 'NOT_FOUND', message: 'No categories found' };
    }
    return categories;
  }
}

