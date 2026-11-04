import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server, AddressInfo } from 'node:net';
import { createSyntheticDb } from './helpers/synthetic-db';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zandaka-detail-'));
const testDbPath = path.join(directory, 'synthetic.db');
process.env.DB_PATH = testDbPath;
createSyntheticDb(testDbPath);
let db: Database.Database, server: Server, baseUrl: string;

before(async () => {
  db = (await import('../src/db/db')).db;
  const { createApp } = await import('../src/app');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => {
  db.pragma('foreign_keys=OFF');
  for (const { name } of db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>)
    db.exec(`DELETE FROM "${name}"`);
  db.pragma('foreign_keys=ON');
  db.exec(`
    INSERT INTO user(id,name,base_currency) VALUES(1,'Synthetic','CRC'),(2,'Other','CRC');
    INSERT INTO institution(id,user_id,name,type) VALUES(1,1,'Banco sintético','BANK'),(2,2,'Private other bank','BANK');
    INSERT INTO account(id,user_id,institution_id,name,currency) VALUES(1,1,1,'Origen','CRC'),(2,1,1,'Destino','CRC'),(3,2,2,'Private other account','USD');
    INSERT INTO category(id,user_id,name) VALUES(1,1,'Origen'),(2,1,'Destino'),(3,2,'Private other category');
    INSERT INTO account_envelope(id,account_id,category_id,is_active) VALUES(1,1,1,1),(2,2,2,0),(3,3,3,1);
    INSERT INTO transactions(id,user_id,date,description,type,created_at) VALUES(1,1,'2026-11-01','Traslado de prueba','TRANSFER','2026-11-02 01:30:00'),(2,2,'2026-11-01','Other user secret','INCOME','2026-11-02 01:30:00');
    INSERT INTO transaction_line(id,transaction_id,account_id,envelope_id,amount) VALUES(1,1,1,1,-0.02),(2,1,2,2,0.02),(3,2,3,3,50);
  `);
});
async function get(query = '/1?userId=1') {
  const response = await fetch(baseUrl + '/api/transactions' + query);
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as any,
  };
}

test('complete inspection includes inactive transfer destination, ordered signed lines and both dates', async () => {
  const result = await get();
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'no-store');
  assert.equal(result.body.date, '2026-11-01');
  assert.equal(result.body.createdAt, '2026-11-02 01:30:00');
  assert.deepEqual(
    result.body.lines.map((line: any) => [
      line.id,
      line.accountName,
      line.envelopeActive,
      line.amount,
    ]),
    [
      [1, 'Origen', true, -0.02],
      [2, 'Destino', false, 0.02],
    ],
  );
  assert.equal(result.body.lines[1].institutionName, 'Banco sintético');
  assert.deepEqual(result.body.correction, {
    available: false,
    reason: 'NO_AUDITED_CORRECTION_FLOW',
  });
});

test('missing transaction and a different requested owner both return the same 404 without metadata', async () => {
  const missing = await get('/999?userId=1'),
    other = await get('/2?userId=1');
  assert.equal(missing.status, 404);
  assert.equal(other.status, 404);
  assert.deepEqual(other.body, missing.body);
  assert.ok(!JSON.stringify(other.body).includes('secret'));
});

test('invalid path/query identifiers fail validation rather than broadening the scope', async () => {
  for (const query of [
    '/1',
    '/0?userId=1',
    '/1.5?userId=1',
    '/1?userId=0',
    '/1?userId=1.5',
    '/9007199254740992?userId=1',
    '/1?userId=1&userId=2',
    '/1%20OR%201=1?userId=1',
  ])
    assert.equal((await get(query)).status, 400, query);
});

test('inactive accounts/institutions/categories do not remove their historical lines', async () => {
  db.exec(
    'UPDATE account SET is_active=0; UPDATE institution SET is_active=0; UPDATE category SET is_active=0; UPDATE account_envelope SET is_active=0;',
  );
  const result = await get();
  assert.equal(result.status, 200);
  assert.equal(result.body.lines.length, 2);
  assert.equal(result.body.lines[0].accountName, 'Origen');
});

test('broken and foreign-owner catalog links retain line amounts without disclosing foreign names', async () => {
  db.pragma('foreign_keys=OFF');
  db.exec(
    'UPDATE transaction_line SET account_id=999, envelope_id=999 WHERE id=1; UPDATE transaction_line SET account_id=3, envelope_id=3 WHERE id=2;',
  );
  db.pragma('foreign_keys=ON');
  const result = await get();
  assert.equal(result.body.lines.length, 2);
  for (const line of result.body.lines) {
    assert.equal(line.accountName, null);
    assert.equal(line.accountCurrency, null);
    assert.equal(line.institutionName, null);
    assert.equal(line.categoryName, null);
    assert.equal(line.envelopeActive, null);
  }
  assert.deepEqual(
    result.body.lines.map((line: any) => line.amount),
    [-0.02, 0.02],
  );
  assert.ok(!JSON.stringify(result.body).includes('Private other'));
});

test('all repeated endpoint lines, zero lines and mixed currencies remain distinguishable', async () => {
  db.exec(
    "UPDATE account SET currency='USD' WHERE id=2; INSERT INTO transaction_line(id,transaction_id,account_id,envelope_id,amount) VALUES(4,1,1,1,-0.01),(5,1,1,1,0);",
  );
  const result = await get();
  assert.deepEqual(
    result.body.lines.map((line: any) => [line.id, line.accountCurrency, line.amount]),
    [
      [1, 'CRC', -0.02],
      [2, 'USD', 0.02],
      [4, 'CRC', -0.01],
      [5, 'CRC', 0],
    ],
  );
});

test('GET leaves schema, rows, total_changes and historical binary amounts untouched', async () => {
  const snapshot = () =>
    JSON.stringify({
      schema: db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(),
      transactions: db.prepare('SELECT * FROM transactions ORDER BY id').all(),
      lines: db.prepare('SELECT * FROM transaction_line ORDER BY id').all(),
      changes: db.prepare('SELECT total_changes() AS n').get(),
    });
  db.prepare('UPDATE transaction_line SET amount=? WHERE id=1').run(-0.019999999998617554);
  const prior = snapshot();
  for (let i = 0; i < 3; i++) assert.equal((await get()).status, 200);
  assert.equal(snapshot(), prior);
});

test('no edit or delete action is installed for historical detail', async () => {
  for (const method of ['PATCH', 'PUT', 'DELETE']) {
    const response = await fetch(baseUrl + '/api/transactions/1?userId=1', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Changed' }),
    });
    assert.equal(response.status, 404);
  }
  assert.equal((await get()).body.description, 'Traslado de prueba');
});

after(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  if (db) db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
