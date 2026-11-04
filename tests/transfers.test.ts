import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server, AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createSyntheticDb } from './helpers/synthetic-db';
import { installTransferIdempotency } from '../src/db/transfer-idempotency';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zandaka-transfers-'));
const testDbPath = path.join(directory, 'synthetic.db');
process.env.DB_PATH = testDbPath;
createSyntheticDb(testDbPath);
const setup = new Database(testDbPath);
installTransferIdempotency(setup);
setup.close();
let db: Database.Database, server: Server, baseUrl: string;

const payload = (overrides = {}) => ({
  userId: 1,
  requestId: randomUUID(),
  date: '2026-01-02',
  description: 'Synthetic transfer',
  from: { accountId: 1, envelopeId: 1 },
  to: { accountId: 1, envelopeId: 2 },
  amount: 0.02,
  ...overrides,
});
async function post(body: unknown) {
  const response = await fetch(baseUrl + '/api/transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}
const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
async function balances(accountId: number) {
  const response = await fetch(`${baseUrl}/api/reports/envelope-balances?accountId=${accountId}`);
  return (await response.json()) as Array<{ envelopeId: number; balance: number }>;
}

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
    INSERT INTO user(id,name,base_currency) VALUES(1,'Synthetic','CRC'),(2,'Other synthetic','CRC');
    INSERT INTO institution(id,user_id,name,type) VALUES(1,1,'Synthetic','BANK'),(2,2,'Other','BANK');
    INSERT INTO account(id,user_id,institution_id,name,currency,is_active) VALUES
      (1,1,1,'Source','CRC',1),(2,1,1,'Destination','CRC',1),(3,1,1,'USD','USD',1),(4,1,1,'Inactive','CRC',0),(5,2,2,'Other user','CRC',1);
    INSERT INTO category(id,user_id,name) VALUES(1,1,'Source'),(2,1,'Destination'),(3,1,'Other account'),(4,1,'USD'),(5,1,'Inactive'),(6,2,'Other source'),(7,2,'Other destination');
    INSERT INTO account_envelope(id,account_id,category_id) VALUES(1,1,1),(2,1,2),(3,2,3),(4,3,4),(5,4,5),(6,5,6),(7,5,7);
    INSERT INTO transactions(id,user_id,date,description,type) VALUES(1,1,'2026-01-01','Synthetic historical','ADJUSTMENT');
    INSERT INTO transaction_line(id,transaction_id,account_id,envelope_id,amount) VALUES(1,1,1,1,0.019999999998617554);
  `);
});

test('positive composer amount creates exactly opposite lines; same-account total and historical bits stay intact', async () => {
  const bits = () => {
    const bytes = Buffer.alloc(8);
    bytes.writeDoubleBE(
      (db.prepare('SELECT amount FROM transaction_line WHERE id=1').get() as { amount: number })
        .amount,
    );
    return bytes.toString('hex');
  };
  const beforeBits = bits(),
    result = await post(payload());
  assert.equal(result.status, 201);
  assert.deepEqual(
    result.body.lines.map((line: any) => [line.account_id, line.envelope_id, line.amount]),
    [
      [1, 1, -0.02],
      [1, 2, 0.02],
    ],
  );
  const rows = await balances(1);
  assert.equal(rows.find((r) => r.envelopeId === 1)?.balance, 0);
  assert.equal(rows.find((r) => r.envelopeId === 2)?.balance, 0.02);
  assert.equal(bits(), beforeBits);
  assert.equal(count('transfer_request'), 1);
});

test('same-currency inter-account transfer preserves the global amount', async () => {
  const result = await post(payload({ to: { accountId: 2, envelopeId: 3 } }));
  assert.equal(result.status, 201);
  assert.equal((await balances(1)).find((r) => r.envelopeId === 1)?.balance, 0);
  assert.equal((await balances(2)).find((r) => r.envelopeId === 3)?.balance, 0.02);
});

test('discarded confirmation, concurrent retries and a new service instance replay one durable receipt', async () => {
  const data = payload();
  const first = await fetch(baseUrl + '/api/transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  assert.equal(first.status, 201);
  await first.body?.cancel(); // The caller did not consume the confirmation.
  const results = await Promise.all(Array.from({ length: 4 }, () => post(data)));
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(new Set(results.map((r) => r.body.transaction.id)).size, 1);
  assert.equal(
    (await post({ ...data, requestId: data.requestId.toUpperCase() })).body.transaction.id,
    results[0].body.transaction.id,
  );
  const { TransferService } = await import('../src/services/transfer.service');
  const replay = new TransferService().create(data);
  assert.equal(replay.transaction.id, results[0].body.transaction.id);
  assert.equal(count('transactions'), 2); // one historical seed plus one transfer
  assert.equal(count('transaction_line'), 3);
  assert.equal(count('transfer_request'), 1);
  const inspect = new Database(testDbPath, { readonly: true });
  assert.equal(
    (inspect.prepare('SELECT COUNT(*) AS n FROM transfer_request').get() as { n: number }).n,
    1,
  );
  inspect.close();
});

test('replay remains readable after endpoints become inactive; changed intent conflicts without another posting', async () => {
  const data = payload(),
    first = await post(data);
  db.exec('UPDATE account SET is_active=0 WHERE id=1');
  assert.deepEqual((await post(data)).body, first.body);
  assert.equal((await post({ ...data, amount: 1 })).status, 409);
  assert.equal((await post({ ...data, description: 'Different intent' })).status, 409);
  assert.equal(count('transactions'), 2);
});

test('request keys are scoped by the declared user and endpoints must belong to that user', async () => {
  const data = payload();
  assert.equal((await post(data)).status, 201);
  assert.equal((await post({ ...data, userId: 2 })).status, 403);
  const other = await post({
    ...data,
    userId: 2,
    from: { accountId: 5, envelopeId: 6 },
    to: { accountId: 5, envelopeId: 7 },
  });
  assert.equal(other.status, 201);
  assert.equal(other.body.transaction.user_id, 2);
  assert.equal(count('transfer_request'), 2);
});

test('unsupported endpoints, currencies, dates and precision fail without any partial ledger writes', async () => {
  for (const overrides of [
    { to: { accountId: 1, envelopeId: 1 } },
    { to: { accountId: 1, envelopeId: 3 } },
    { to: { accountId: 3, envelopeId: 4 } },
    { amount: 0 },
    { amount: -1 },
    { amount: 0.001 },
    { amount: '1e-2' },
    { date: '2026-02-30' },
    { requestId: 'invalid' },
    { currency: 'USD' },
  ])
    assert.equal((await post(payload(overrides))).status, 400);
  assert.equal((await post(payload({ to: { accountId: 4, envelopeId: 5 } }))).status, 409);
  assert.equal((await post(payload({ to: { accountId: 5, envelopeId: 6 } }))).status, 403);
  db.exec('UPDATE account_envelope SET is_active=0 WHERE id=2');
  assert.equal((await post(payload())).status, 409);
  assert.equal(count('transactions'), 1);
  assert.equal(count('transaction_line'), 1);
  assert.equal(count('transfer_request'), 0);
});

test('receipt failure rolls back transfer and reconciliation, then allows the identical retry', async () => {
  db.exec(
    "INSERT INTO reconciliation(id,account_id,date,real_balance) VALUES(1,1,'2026-01-02',0.02)",
  );
  db.exec(
    "CREATE TRIGGER fail_transfer_receipt BEFORE INSERT ON transfer_request BEGIN SELECT RAISE(ABORT,'Synthetic receipt failure'); END",
  );
  const data = payload();
  try {
    assert.equal((await post(data)).status, 500);
    assert.equal(count('transactions'), 1);
    assert.equal(count('transaction_line'), 1);
    assert.equal(count('transfer_request'), 0);
    assert.equal(
      (db.prepare('SELECT is_active FROM reconciliation WHERE id=1').get() as { is_active: number })
        .is_active,
      1,
    );
  } finally {
    db.exec('DROP TRIGGER fail_transfer_receipt');
  }
  assert.equal((await post(data)).status, 201);
  assert.equal(count('transactions'), 2);
  assert.equal(
    (db.prepare('SELECT is_active FROM reconciliation WHERE id=1').get() as { is_active: number })
      .is_active,
    0,
  );
});

test('missing retry storage fails closed; explicit setup adds only its table and is repeatable', async () => {
  db.exec('DROP TABLE transfer_request');
  const before = db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all();
  try {
    assert.equal((await post(payload())).status, 503);
    assert.equal(count('transactions'), 1);
    assert.deepEqual(db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all(), before);
  } finally {
    installTransferIdempotency(db);
  }
  const schema = db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all();
  installTransferIdempotency(db);
  assert.deepEqual(db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all(), schema);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

after(async () => {
  if (server)
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  if (db?.open) db.close();
  const target = path.resolve(directory);
  assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(target).startsWith('zandaka-transfers-'));
  fs.rmSync(target, { recursive: true });
});
