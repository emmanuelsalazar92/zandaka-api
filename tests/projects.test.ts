import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { installProjects } from '../src/db/project';
import { ProjectService } from '../src/services/project.service';
import { createSyntheticDb } from './helpers/synthetic-db';

test('projects lifecycle uses explicit setup, owner scoping, and atomic revisions', async () => {
  const file = path.join(os.tmpdir(), `projects-${randomUUID()}.db`);
  process.env.DB_PATH = file;
  delete process.env.ZANDAKA_PROJECT_OWNER_ID;
  createSyntheticDb(file);
  const { db } = await import('../src/db/db');
  const { createApp } = await import('../src/app');
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server!.once('listening', resolve).once('error', reject);
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects`;
    async function request(method = 'GET', suffix = '', body?: object) {
      const response = await fetch(base + suffix, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: response.status,
        body: (await response.json()) as {
          id: string;
          title: string;
          revision: number;
          finalizedAt: string | null;
          archivedAt: string | null;
          items: { id: string }[];
          total: number;
          error: { code: string };
        },
      };
    }
    const originalLedger = db.prepare('SELECT * FROM transactions').all();
    const originalLines = db.prepare('SELECT * FROM transaction_line').all();
    assert.equal((await request()).body.error.code, 'FEATURE_NOT_READY');
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='project'").get(), undefined);
    installProjects(db);
    installProjects(db);
    db.prepare("INSERT OR IGNORE INTO user(id,name,base_currency) VALUES (1,'Owner','CRC')").run();
    db.prepare("INSERT OR IGNORE INTO user(id,name,base_currency) VALUES (2,'Other','USD')").run();
    const other = new ProjectService(db, 2).create('Other profile');
    assert.equal((await request('GET', '/' + other.id)).status, 404);
    assert.equal((await request('GET', '?userId=2')).status, 400);
    assert.equal((await request('POST', '', { title: 'Foreign', userId: 2 })).status, 400);
    assert.equal((await request('POST', '', { title: '  ' })).status, 400);
    assert.equal((await request('POST', '', { title: 'a'.repeat(121) })).status, 400);
    const intent = { title: '  Construcción del lote  ', requestId: randomUUID() };
    const created = await request('POST', '', intent);
    assert.equal(created.status, 201);
    assert.equal(created.body.title, 'Construcción del lote');
    assert.equal(created.body.revision, 1);
    const item = '/' + created.body.id;
    assert.equal((await request('POST', '', intent)).body.id, created.body.id);
    assert.equal((await request('POST', '', { ...intent, title: 'Different' })).status, 409);
    assert.equal((await request()).body.total, 1);
    const updates = await Promise.all([
      request('PATCH', item, { expectedRevision: 1, title: 'Lote norte' }),
      request('PATCH', item, { expectedRevision: 1, title: 'Lote sur' }),
    ]);
    assert.deepEqual(updates.map((result) => result.status).sort(), [200, 409]);
    const finalized = await request('POST', item + '/finalize', { expectedRevision: 2 });
    assert.equal(finalized.status, 200);
    assert.ok(finalized.body.finalizedAt);
    assert.equal((await request('PATCH', item, { title: 'No', expectedRevision: 3 })).status, 409);
    const archived = await request('POST', item + '/archive', { expectedRevision: 3 });
    assert.ok(archived.body.archivedAt);
    assert.equal(archived.body.finalizedAt, finalized.body.finalizedAt);
    assert.equal((await request()).body.total, 0);
    assert.equal((await request('GET', '?view=archived')).body.items[0].id, created.body.id);
    assert.equal((await request('POST', item + '/reopen', { expectedRevision: 4 })).status, 409);
    const restored = await request('POST', item + '/restore', { expectedRevision: 4 });
    assert.equal(restored.body.archivedAt, null);
    assert.equal(restored.body.finalizedAt, finalized.body.finalizedAt);
    const reopened = await request('POST', item + '/reopen', { expectedRevision: 5 });
    assert.equal(reopened.body.finalizedAt, null);
    assert.equal((await request('GET', item)).body.revision, 6);
    for (let n = 0; n < 20; n++) new ProjectService(db, 1).create('Same title');
    const page1 = (await request()).body;
    const page2 = (await request('GET', '?page=2')).body;
    assert.equal(page1.items.length, 20);
    assert.equal(page2.items.length, 1);
    assert.ok(!page1.items.some((item: { id: string }) => item.id === page2.items[0].id));
    assert.deepEqual(db.prepare('SELECT * FROM transactions').all(), originalLedger);
    assert.deepEqual(db.prepare('SELECT * FROM transaction_line').all(), originalLines);
  } finally {
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    db.close();
    fs.rmSync(file, { force: true });
  }
});
