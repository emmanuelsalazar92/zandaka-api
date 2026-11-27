import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { installProjectMovements, installProjects } from '../src/db/project';
import type { summarizeProjectMovements } from '../src/services/project-analysis';
import { ProjectService } from '../src/services/project.service';
import { createSyntheticDb } from './helpers/synthetic-db';

test('project movement search and links preserve the ledger and enforce eligibility', async () => {
  const file = path.join(os.tmpdir(), `project-movements-${randomUUID()}.db`);
  process.env.DB_PATH = file;
  delete process.env.ZANDAKA_PROJECT_OWNER_ID;
  createSyntheticDb(file);
  const { db } = await import('../src/db/db');
  const { createApp } = await import('../src/app');
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    db.exec(`
      INSERT INTO user(id,name,base_currency) VALUES(1,'Owner','CRC'),(2,'Other','CRC');
      INSERT INTO institution(id,user_id,name,type) VALUES(1,1,'Synthetic','BANK'),(2,2,'Other','BANK');
      INSERT INTO account(id,user_id,institution_id,name,currency)
        VALUES(1,1,1,'Lote CRC','CRC'),(2,1,1,'Lote USD','USD'),(3,2,2,'Private','USD');
      INSERT INTO category(id,user_id,name)
        VALUES(1,1,'Materiales'),(2,1,'Permisos'),(3,2,'Private');
      INSERT INTO account_envelope(id,account_id,category_id,is_active)
        VALUES(1,1,1,0),(2,1,2,1),(3,2,2,1),(4,3,3,1);
      INSERT INTO transactions(id,user_id,date,description,type) VALUES
        (100,1,'2026-11-12','Materiales del lote','EXPENSE'),
        (101,1,'2026-11-13','Materiales en USD','EXPENSE'),
        (102,1,'2026-11-14','Devolución del lote','INCOME'),
        (103,1,'2026-11-14','Transferencia del lote','TRANSFER'),
        (104,1,'2026-11-14','Ajuste de prueba','ADJUSTMENT'),
        (105,2,'2026-11-12','Private','EXPENSE'),
        (106,1,'2026-11-12','Inconsistent owner','EXPENSE');
      INSERT INTO transaction_line(id,transaction_id,account_id,envelope_id,amount) VALUES
        (1,100,1,1,-100),(2,100,1,2,-50),(3,101,2,3,-10),(4,102,1,1,20),
        (5,103,1,1,-500),(6,104,1,1,-10),(7,105,3,4,-999),(8,106,3,4,-99);
    `);
    const headers = db.prepare('SELECT * FROM transactions ORDER BY id').all();
    const lines = db.prepare('SELECT * FROM transaction_line ORDER BY id').all();
    const ledger = () => ({
      headers: db.prepare('SELECT * FROM transactions ORDER BY id').all(),
      lines: db.prepare('SELECT * FROM transaction_line ORDER BY id').all(),
    });
    installProjects(db);
    const project = new ProjectService(db, 1).create('Construcción del lote');
    const other = new ProjectService(db, 2).create('Proyecto ajeno');
    const parallel = new ProjectService(db, 1).create('Otra vista del lote');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) =>
      server!.once('listening', resolve).once('error', reject),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects`;
    async function request(suffix: string, method = 'GET', body?: object) {
      const response = await fetch(base + suffix, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: response.status,
        body: (await response.json()) as {
          revision: number;
          total: number;
          items: {
            id: number;
            lineId: number;
            amount: string;
            kind: string;
            eligible: boolean;
            lines: { lineId: number }[];
          }[];
          accounts: { id: number }[];
          id: number;
          calculatedAt: string;
          error: { code: string };
        } & ReturnType<typeof summarizeProjectMovements>,
      };
    }
    const link = (lineIds: number[], expectedRevision: number, kind = 'expense', id = project.id) =>
      request(`/${id}/movements`, 'POST', { lineIds, expectedRevision, kind });
    const list = () => request(`/${project.id}/movements`);
    const search = (query: string) => request(`/${project.id}/movement-search?${query}`);

    assert.equal((await list()).body.error.code, 'FEATURE_NOT_READY');
    assert.equal((await request(`/${project.id}/analysis`)).body.error.code, 'FEATURE_NOT_READY');
    assert.equal((await request(`/${other.id}/movements`)).status, 404);
    installProjectMovements(db);
    installProjectMovements(db);
    assert.deepEqual((await request(`/${project.id}/analysis`)).body.currencies, []);
    assert.equal((await request(`/${other.id}/analysis`)).status, 404);
    assert.equal((await search('q=materiales')).body.total, 2);
    const filtered = await search(
      'q=%23100&from=2026-11-12&to=2026-11-12&currency=CRC&accountId=1&categoryId=1',
    );
    assert.equal(filtered.status, 200);
    assert.deepEqual(
      filtered.body.items.map((item) => item.id),
      [100],
    );
    assert.deepEqual(
      filtered.body.items[0].lines.map((row) => row.lineId),
      [1, 2],
    );
    assert.equal((await search('q=%23100&currency=USD&categoryId=1')).body.total, 0);
    assert.equal((await search('q=%231')).body.total, 0);
    assert.equal((await search('q=%23x')).status, 400);
    assert.equal((await search('userId=2')).status, 400);
    assert.equal((await search('q=%23105')).body.total, 0);
    assert.equal((await search('q=%23106')).body.total, 0);
    assert.equal((await search('kind=refund&q=%23102')).body.total, 1);
    assert.deepEqual(
      (await request(`/${project.id}/movement-filters`)).body.accounts.map(({ id }) => id),
      [1, 2],
    );

    for (const invalid of [4, 5, 6, 7, 8, 999])
      assert.equal((await link([1, invalid], 1)).status, 400);
    assert.equal(
      (
        await link(
          Array.from({ length: 101 }, (_, i) => i + 1),
          1,
        )
      ).status,
      400,
    );
    assert.equal((await list()).body.total, 0);
    assert.equal((await link([1], 1)).body.revision, 2);
    assert.deepEqual(
      (await list()).body.items.map(({ amount }) => amount),
      ['-100'],
    );
    assert.equal((await link([1, 2, 2], 2)).body.revision, 3);
    assert.equal((await link([1, 2], 2)).body.revision, 3);
    assert.deepEqual(
      (await list()).body.items.map(({ amount }) => amount),
      ['-100', '-50'],
    );
    assert.equal((await link([1], 1, 'expense', parallel.id)).status, 200);
    assert.equal((await link([3], 1)).status, 409);
    assert.equal((await link([4], 3, 'refund')).body.revision, 4);
    assert.equal((await list()).body.items[0].kind, 'refund');
    const removal = { expectedRevision: 4, lineIds: [4] };
    assert.equal((await request(`/${project.id}/movements`, 'DELETE', removal)).body.revision, 5);
    assert.equal((await request(`/${project.id}/movements`, 'DELETE', removal)).body.revision, 5);
    const analysisProject = new ProjectService(db, 1).create('Análisis del lote');
    const scope = `/${analysisProject.id}`;
    assert.equal((await link([1, 2, 3], 1, 'expense', analysisProject.id)).status, 200);
    assert.equal((await link([4], 2, 'refund', analysisProject.id)).status, 200);
    assert.equal((await link([5], 3, 'expense', analysisProject.id)).status, 400);
    const { status: analysisStatus, body: analysis } = await request(scope + '/analysis');
    assert.equal(analysisStatus, 200);
    assert.ok(!Number.isNaN(Date.parse(analysis.calculatedAt)));
    assert.deepEqual(analysis.currencies, [
      {
        currency: 'CRC',
        expenses: '150',
        refunds: '20',
        net: '130',
        series: [
          { date: '2026-11-12', net: '150' },
          { date: '2026-11-14', net: '130' },
        ],
        categories: [
          { categoryId: 1, categoryName: 'Materiales', expenses: '100', refunds: '20', net: '80' },
          { categoryId: 2, categoryName: 'Permisos', expenses: '50', refunds: '0', net: '50' },
        ],
      },
      {
        currency: 'USD',
        expenses: '10',
        refunds: '0',
        net: '10',
        series: [{ date: '2026-11-13', net: '10' }],
        categories: [
          { categoryId: 2, categoryName: 'Permisos', expenses: '10', refunds: '0', net: '10' },
        ],
      },
    ]);
    const materials = await request(scope + '/movements?currency=CRC&categoryId=1');
    assert.deepEqual(
      materials.body.items.map(({ lineId }) => lineId),
      [4, 1],
    );
    assert.deepEqual(
      (await request(scope + '/movements?currency=USD&categoryId=2')).body.items.map(
        ({ lineId }) => lineId,
      ),
      [3],
    );
    assert.equal((await request(scope + '/movements?currency=CRC')).status, 400);
    assert.equal((await request(scope + '/movements/100')).body.id, 100);
    assert.equal((await request(scope + '/movements/103')).status, 404);
    assert.equal((await request(`/${other.id}/movements/100`)).status, 404);
    assert.equal((await request(scope + '/movements/100?userId=2')).status, 400);
    assert.equal((await request(scope + '/finalize', 'POST', { expectedRevision: 3 })).status, 200);
    assert.deepEqual(ledger(), { headers, lines });

    db.exec('UPDATE transaction_line SET amount=-120 WHERE id=1');
    assert.equal((await list()).body.items[0].amount, '-120');
    db.exec(
      "UPDATE transaction_line SET amount=200.21, updated_at='2099-01-01 00:00:00' WHERE id=4",
    );
    const corrected = (await request(scope + '/analysis')).body;
    assert.equal(corrected.latestLedgerUpdateAt, '2099-01-01T00:00:00.000Z');
    assert.equal(corrected.currencies[0].net, '-30.21');
    const correctedSeries = corrected.currencies[0].series;
    assert.equal(correctedSeries[correctedSeries.length - 1].net, '-30.21');
    db.exec("UPDATE transactions SET type='ADJUSTMENT' WHERE id=100");
    assert.equal((await list()).body.items[0].eligible, false);
    const reclassified = (await request(scope + '/analysis')).body;
    assert.equal(reclassified.excludedLineCount, 2);
    assert.equal(reclassified.currencies[0].net, '-200.21');
    assert.deepEqual(
      (await request(scope + '/movements?currency=CRC&categoryId=1')).body.items.map(
        ({ lineId }) => lineId,
      ),
      [4],
    );
    db.exec(`
      DELETE FROM transaction_line WHERE id=1;
      INSERT INTO transaction_line(id,transaction_id,account_id,envelope_id,amount) VALUES(1,101,2,3,-7);
    `);
    assert.deepEqual(
      (await list()).body.items.map(({ lineId }) => lineId),
      [2],
    );
    assert.equal((await request(`/${parallel.id}/movements`)).body.total, 0);
    const race = await Promise.all([
      request(`/${project.id}/finalize`, 'POST', { expectedRevision: 5 }),
      link([3], 5),
    ]);
    assert.deepEqual(race.map(({ status }) => status).sort(), [200, 409]);
    if (race[0].status === 409) {
      assert.equal(
        (await request(`/${project.id}/finalize`, 'POST', { expectedRevision: 6 })).status,
        200,
      );
    }
    assert.equal((await link([3], 6)).status, 409);
    assert.equal(
      (await request(`/${project.id}/movements`, 'DELETE', { expectedRevision: 6, lineIds: [2] }))
        .status,
      409,
    );
    assert.equal((await list()).status, 200);
    db.exec('UPDATE transaction_line SET envelope_id=1 WHERE id=3');
    const withoutCategory = (await request(scope + '/analysis')).body.currencies[1].categories[0];
    assert.equal(withoutCategory.categoryId, null);
    const uncategorized = await request(scope + '/movements?currency=USD&categoryId=none');
    assert.deepEqual(
      uncategorized.body.items.map(({ lineId }) => lineId),
      [3],
    );
  } finally {
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    db.close();
    fs.rmSync(file, { force: true });
  }
});
