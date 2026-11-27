import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { projectMovementsReady, projectsReady } from '../db/project';
import {
  ProjectMovementsRepository,
  type ProjectBreakdownFilter,
  type ProjectMovementKind,
  type ProjectMovementSearch,
} from '../repositories/project-movements.repo';
import { summarizeProjectMovements } from './project-analysis';

type Project = {
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  archivedAt: string | null;
};

type Change =
  | { action: 'rename'; title: string }
  | { action: 'finalize' | 'reopen' | 'archive' | 'restore' };

const fields = `id, title, revision, created_at AS createdAt, updated_at AS updatedAt,
  finalized_at AS finalizedAt, archived_at AS archivedAt`;

function conflict(): never {
  throw { code: 'CONFLICT', message: 'Project state or revision has changed' };
}

export class ProjectService {
  private readonly movements: ProjectMovementsRepository;

  constructor(
    private db: Database,
    private owner: number,
  ) {
    this.movements = new ProjectMovementsRepository(db);
  }

  private checkStorage() {
    if (!Number.isSafeInteger(this.owner) || this.owner < 1 || !projectsReady(this.db))
      throw { code: 'FEATURE_NOT_READY', message: 'Project storage or profile is not configured' };
  }

  private read(id: string): Project {
    const row = this.db
      .prepare(`SELECT ${fields} FROM project WHERE id = ? AND user_id = ?`)
      .get(id, this.owner) as Project | undefined;
    if (!row) throw { code: 'NOT_FOUND', message: 'Project not found' };
    return row;
  }

  get(id: string) {
    this.checkStorage();
    return this.read(id);
  }

  private readForMovements(id: string) {
    const project = this.get(id);
    if (!projectMovementsReady(this.db))
      throw { code: 'FEATURE_NOT_READY', message: 'Project movement storage is not configured' };
    return project;
  }

  listMovements(id: string, page: number, filter?: ProjectBreakdownFilter) {
    return this.db.transaction(() => {
      const project = this.readForMovements(id);
      return { ...this.movements.list(id, this.owner, page, filter), project };
    })();
  }

  analysis(id: string) {
    return this.db.transaction(() => {
      const project = this.readForMovements(id);
      return {
        project,
        calculatedAt: new Date().toISOString(),
        ...summarizeProjectMovements(this.movements.groups(id, this.owner)),
      };
    })();
  }

  linkedTransaction<T>(id: string, transactionId: number, read: (owner: number) => T | null) {
    return this.db.transaction(() => {
      this.readForMovements(id);
      if (this.movements.includesTransaction(id, this.owner, transactionId)) {
        const detail = read(this.owner);
        if (detail) return detail;
      }
      throw { code: 'NOT_FOUND', message: 'Transaction is not linked to the project' };
    })();
  }

  searchMovements(id: string, search: ProjectMovementSearch) {
    return this.db.transaction(() => {
      this.readForMovements(id);
      return this.movements.search(id, this.owner, search);
    })();
  }

  movementFilters(id: string) {
    return this.db.transaction(() => {
      this.readForMovements(id);
      return this.movements.filters(this.owner);
    })();
  }

  changeMovements(id: string, expectedRevision: number, ids: number[], kind?: ProjectMovementKind) {
    return this.db
      .transaction(() => {
        const project = this.readForMovements(id);
        if (project.archivedAt || project.finalizedAt) conflict();
        const lineIds = [...new Set(ids)];
        const changes = kind
          ? this.movements.planAdd(id, this.owner, lineIds, kind)
          : this.movements.planRemove(id, lineIds);
        // A repeated request whose effect is already present can safely confirm the current state.
        if (!changes.length) return project;
        if (project.revision !== expectedRevision) conflict();
        if (kind) this.movements.add(id, changes, kind);
        else this.movements.remove(id, changes);
        this.db
          .prepare(
            'UPDATE project SET updated_at = ?, revision = revision + 1 WHERE id = ? AND user_id = ?',
          )
          .run(new Date().toISOString(), id, this.owner);
        return this.read(id);
      })
      .immediate();
  }

  list(view: 'visible' | 'archived', page: number) {
    this.checkStorage();
    const active = view === 'visible' ? 'IS NULL' : 'IS NOT NULL';
    const pageSize = 20;
    return this.db.transaction(() => {
      const where = `WHERE user_id = ? AND archived_at ${active}`;
      const { total } = this.db
        .prepare(`SELECT count(*) AS total FROM project ${where}`)
        .get(this.owner) as { total: number };
      const items = this.db
        .prepare(
          `SELECT ${fields} FROM project ${where}
        ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(this.owner, pageSize, (page - 1) * pageSize) as Project[];
      return { items, total, page, pageSize };
    })();
  }

  create(title: string, requestId?: string) {
    this.checkStorage();
    return this.db
      .transaction(() => {
        if (requestId) {
          const existing = this.db
            .prepare(
              'SELECT id, creation_title FROM project WHERE user_id = ? AND creation_key = ?',
            )
            .get(this.owner, requestId) as { id: string; creation_title: string } | undefined;
          if (existing) {
            if (existing.creation_title !== title)
              throw {
                code: 'IDEMPOTENCY_CONFLICT',
                message: 'Creation intent has already been used',
              };
            return this.read(existing.id);
          }
        }
        if (!this.db.prepare('SELECT 1 FROM user WHERE id = ?').get(this.owner))
          throw { code: 'FEATURE_NOT_READY', message: 'Project profile is not configured' };
        const id = randomUUID();
        const now = new Date().toISOString();
        this.db
          .prepare(
            `INSERT INTO project
        (id, user_id, title, created_at, updated_at, creation_key, creation_title)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, this.owner, title, now, now, requestId ?? null, requestId ? title : null);
        return this.read(id);
      })
      .immediate();
  }

  change(id: string, expectedRevision: number, change: Change) {
    this.checkStorage();
    return this.db
      .transaction(() => {
        const row = this.read(id);
        if (row.revision !== expectedRevision) conflict();
        if (row.archivedAt && change.action !== 'restore') conflict();
        const now = new Date().toISOString();
        switch (change.action) {
          case 'rename':
            if (row.finalizedAt) conflict();
            row.title = change.title;
            break;
          case 'finalize':
            if (row.finalizedAt) conflict();
            row.finalizedAt = now;
            break;
          case 'reopen':
            if (!row.finalizedAt) conflict();
            row.finalizedAt = null;
            break;
          case 'archive':
            row.archivedAt = now;
            break;
          case 'restore':
            if (!row.archivedAt) conflict();
            row.archivedAt = null;
            break;
        }
        this.db
          .prepare(
            `UPDATE project SET title = ?, finalized_at = ?, archived_at = ?,
        updated_at = ?, revision = revision + 1 WHERE id = ? AND user_id = ?`,
          )
          .run(row.title, row.finalizedAt, row.archivedAt, now, id, this.owner);
        return this.read(id);
      })
      .immediate();
  }
}
