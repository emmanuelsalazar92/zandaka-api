import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server, AddressInfo } from 'node:net';
import { monetaryBalance } from '../src/utils/monetary-balance';
import { assertMoney, sumMoney } from '../src/utils/money';
import { formatMoney } from '../src/utils/currency.util';
import { createSyntheticDb } from './helpers/synthetic-db';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zandaka-balance-'));
const testDbPath = path.join(directory, 'synthetic.db');
process.env.DB_PATH = testDbPath;
createSyntheticDb(testDbPath);
const inspect = new Database(testDbPath, { readonly: true });
const schemaSql = 'SELECT name,sql FROM sqlite_master ORDER BY name';
const schemaBefore = inspect.prepare(schemaSql).all();
inspect.close();

let db: Database.Database;
let server: Server;
let baseUrl: string;
let envelopes: import('../src/repositories/envelope.repo').EnvelopeRepository;
let reports: import('../src/repositories/report.repo').ReportRepository;

async function request(method: string, route: string, body?: unknown) {
  const response = await fetch(baseUrl + route, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? (JSON.parse(text) as any) : null };
}

function seed(amount: number, envelopeId = 1): number {
  const tx = db
    .prepare(
      "INSERT INTO transactions(user_id,date,description,type) VALUES(1,'2026-01-01','Synthetic legacy','ADJUSTMENT')",
    )
    .run().lastInsertRowid;
  return Number(
    db
      .prepare(
        'INSERT INTO transaction_line(transaction_id,account_id,envelope_id,amount) VALUES(?,1,?,?)',
      )
      .run(tx, envelopeId, amount).lastInsertRowid,
  );
}

function adjustment(amount: number) {
  return request('POST', '/api/transactions', {
    userId: 1,
    date: '2026-01-02',
    description: 'Synthetic single closing operation',
    type: 'ADJUSTMENT',
    lines: [{ accountId: 1, envelopeId: 1, amount }],
  });
}

function historicalBits(id: number): string {
  const row = db.prepare('SELECT amount FROM transaction_line WHERE id=?').get(id) as {
    amount: number;
  };
  const bits = Buffer.alloc(8);
  bits.writeDoubleBE(row.amount);
  return bits.toString('hex');
}

before(async () => {
  db = (await import('../src/db/db')).db;
  const { EnvelopeRepository } = await import('../src/repositories/envelope.repo');
  const { ReportRepository } = await import('../src/repositories/report.repo');
  envelopes = new EnvelopeRepository();
  reports = new ReportRepository();
  const { createApp } = await import('../src/app');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  db.pragma('foreign_keys=OFF');
  for (const row of db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>) {
    db.exec(`DELETE FROM "${row.name}"`);
  }
  db.pragma('foreign_keys=ON');
  db.exec(`
    INSERT INTO user(id,name,base_currency) VALUES(1,'Synthetic','CRC');
    INSERT INTO institution(id,user_id,name,type) VALUES(1,1,'Synthetic','BANK');
    INSERT INTO account(id,user_id,institution_id,name,currency) VALUES(1,1,1,'Synthetic CRC','CRC'),(2,1,1,'Synthetic USD','USD');
    INSERT INTO category(id,user_id,name) VALUES(1,1,'Source'),(2,1,'Destination'),(3,1,'USD');
    INSERT INTO account_envelope(id,account_id,category_id) VALUES(1,1,1),(2,1,2),(3,2,3);
  `);
});

afterEach(() => {
  assert.deepEqual(
    db.prepare(schemaSql).all(),
    schemaBefore,
    'No schema changes or migration markers',
  );
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

after(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  if (db?.open) db.close();
  const target = path.resolve(directory);
  assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(target).startsWith('zandaka-balance-'));
  fs.rmSync(target, { recursive: true });
});

test('balance policy recognizes representation noise only at the aggregate calculation scale', () => {
  assert.equal(monetaryBalance(sumMoney([0.1, 0.2]), 'CRC'), 0.3);
  assert.equal(formatMoney(monetaryBalance('0.3', 'CRC'), 'CRC'), '₡ 0.30');
  assert.equal(monetaryBalance('0.019999999998617554', 'CRC'), 0.02);
  assert.equal(monetaryBalance('121734.26999999997', 'CRC'), 121734.27);
  for (const value of ['-0.000000000001382446', '0.000000000032165846']) {
    assert.equal(monetaryBalance(value, 'CRC'), 0);
    assert.equal(Object.is(monetaryBalance(value, 'CRC'), -0), false);
  }
  for (const value of ['0.001', '0.000001', '1.311', '0.009']) {
    assert.throws(() => monetaryBalance(value, 'CRC'), /material fraction/);
  }
  assert.equal(monetaryBalance('0.01', 'CRC'), 0.01);
  assert.equal(monetaryBalance('-0.01', 'CRC'), -0.01);
  assert.throws(() => assertMoney('0.019999999998617554', 'CRC'));
});

test('startup uses the unchanged legacy NUMERIC schema without a precision migration', () => {
  assert.equal(
    (
      db.prepare('PRAGMA table_info(transaction_line)').all() as Array<{
        name: string;
        type: string;
      }>
    ).find((c) => c.name === 'amount')?.type,
    'NUMERIC',
  );
  assert.equal(
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='schema_migration'").get(),
    undefined,
  );
  assert.equal(
    (db.prepare('PRAGMA table_info(transaction_line)').all() as Array<{ name: string }>).some(
      (c) => c.name === 'source_amount_text',
    ),
    false,
  );
});

test('0.1 plus 0.2 is 0.30 in repositories, reports and API', async () => {
  seed(0.1);
  seed(0.2);
  assert.equal(envelopes.getBalance(1), 0.3);
  assert.equal(reports.getAccountCalculatedBalance(1), 0.3);
  const response = await request('GET', '/api/reports/envelope-balances?accountId=1');
  assert.equal(response.status, 200);
  assert.equal(response.json.find((row: any) => row.envelopeId === 1).balance.toFixed(2), '0.30');
});

test('one -0.02 adjustment closes the monetary balance without modifying history or adding compensation', async () => {
  const id = seed(0.019999999998617554),
    bits = historicalBits(id);
  assert.equal(envelopes.getBalance(1), 0.02);
  const expected = await request(
    'GET',
    '/api/reconciliations/accounts/1/expected-total?date=2026-01-02',
  );
  assert.equal(expected.status, 200);
  assert.equal(expected.json.expectedTotal, 0.02);
  const created = await adjustment(-0.02);
  assert.equal(created.status, 201);
  assert.equal(created.json.lines[0].amount, -0.02);
  assert.equal(envelopes.getBalance(1), 0);
  assert.equal(reports.getAccountCalculatedBalance(1), 0);
  assert.equal(reports.getEnvelopeTotalByCurrency('CRC').total, 0);
  for (const route of [
    '/api/reports/account-balances',
    '/api/reports/envelope-balances?accountId=1',
  ]) {
    const response = await request('GET', route);
    assert.equal(response.status, 200);
    assert.equal(response.json.find((row: any) => (row.id ?? row.envelopeId) === 1).balance, 0);
  }
  assert.equal((db.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n, 2);
  assert.equal(
    (db.prepare('SELECT count(*) AS n FROM transaction_line').get() as { n: number }).n,
    2,
  );
  assert.equal(historicalBits(id), bits);
  const close = await request('POST', '/api/envelopes/1/deactivate');
  assert.equal(close.status, 204);
  assert.equal(
    (db.prepare('SELECT count(*) AS n FROM transaction_line').get() as { n: number }).n,
    2,
  );
});

test('near-zero residue is zero everywhere and zero adjustments are not recorded', async () => {
  const id = seed(-1.382446e-12),
    bits = historicalBits(id);
  assert.equal(envelopes.getBalance(1), 0);
  const negatives = await request('GET', '/api/reports/negative-envelopes');
  assert.equal(negatives.status, 200);
  assert.deepEqual(negatives.json, []);
  assert.equal((await adjustment(0)).status, 400);
  assert.equal(
    (db.prepare('SELECT count(*) AS n FROM transaction_line').get() as { n: number }).n,
    1,
  );
  assert.equal(historicalBits(id), bits);
});

test('normalization happens after summing, never by rounding historical lines', async () => {
  const first = seed(0.005),
    second = seed(0.005);
  const bits = [historicalBits(first), historicalBits(second)];
  assert.equal(envelopes.getBalance(1), 0.01);
  assert.equal((await adjustment(-0.01)).status, 201);
  assert.equal(envelopes.getBalance(1), 0);
  assert.deepEqual([historicalBits(first), historicalBits(second)], bits);
});

test('new snapshots and API use the same monetary balance while prior snapshots remain frozen', async () => {
  const id = seed(0.019999999998617554),
    bits = historicalBits(id);
  const generate = () =>
    request('POST', '/api/reports/generate', {
      user_id: 1,
      report_month: '2026-01',
      usd_to_crc_rate: 500,
    });
  const before = await generate();
  assert.equal(before.status, 201);
  assert.equal(before.json.data.total_crc, 0.02);
  assert.equal((await adjustment(-0.02)).status, 201);
  const after = await generate();
  assert.equal(after.status, 201);
  assert.equal(after.json.data.total_crc, 0);
  const originalSnapshot = db
    .prepare('SELECT total_crc FROM report_snapshot WHERE id=?')
    .get(before.json.data.id) as { total_crc: number };
  assert.equal(originalSnapshot.total_crc, 0.02);
  assert.equal(historicalBits(id), bits);
  assert.equal(
    (db.prepare('SELECT count(*) AS n FROM transaction_line').get() as { n: number }).n,
    2,
  );
});

test('large legacy representation residue can be closed by one valid monetary adjustment', async () => {
  const id = seed(121734.26999999997),
    bits = historicalBits(id);
  assert.equal(envelopes.getBalance(1), 121734.27);
  const response = await request('GET', '/api/reports/account-balances');
  assert.equal(response.json.find((row: any) => row.id === 1).balance, 121734.27);
  assert.equal((await adjustment(-121734.27)).status, 201);
  assert.equal(envelopes.getBalance(1), 0);
  assert.equal(historicalBits(id), bits);
});

test('new transfers conserve both amounts and move the complete monetary balance', async () => {
  const id = seed(0.019999999998617554),
    bits = historicalBits(id);
  const response = await request('POST', '/api/transactions', {
    userId: 1,
    date: '2026-01-02',
    description: 'Synthetic transfer',
    type: 'TRANSFER',
    lines: [
      { accountId: 1, envelopeId: 1, amount: -0.02 },
      { accountId: 1, envelopeId: 2, amount: 0.02 },
    ],
  });
  assert.equal(response.status, 201);
  assert.deepEqual(
    response.json.lines.map((line: any) => line.amount),
    [-0.02, 0.02],
  );
  assert.equal(sumMoney(response.json.lines.map((line: any) => line.amount)), 0);
  assert.equal(envelopes.getBalance(1), 0);
  assert.equal(envelopes.getBalance(2), 0.02);
  assert.equal(reports.getAccountCalculatedBalance(1), 0.02);
  assert.equal(historicalBits(id), bits);
  assert.equal(
    (db.prepare('SELECT count(*) AS n FROM transaction_line').get() as { n: number }).n,
    3,
  );
});

test('invalid new amounts and unbalanced or cross-currency transfers fail atomically', async () => {
  for (const type of ['INCOME', 'EXPENSE', 'ADJUSTMENT', 'TRANSFER']) {
    const amount = type === 'EXPENSE' ? -0.001 : 0.001;
    const lines =
      type === 'TRANSFER'
        ? [
            { accountId: 1, envelopeId: 1, amount },
            { accountId: 1, envelopeId: 2, amount: -amount },
          ]
        : [{ accountId: 1, envelopeId: 1, amount }];
    assert.equal(
      (
        await request('POST', '/api/transactions', {
          userId: 1,
          date: '2026-01-02',
          description: 'Invalid synthetic',
          type,
          lines,
        })
      ).status,
      400,
    );
  }
  for (const second of [
    { accountId: 1, envelopeId: 2, amount: 0.01 },
    { accountId: 2, envelopeId: 3, amount: 0.02 },
  ]) {
    assert.equal(
      (
        await request('POST', '/api/transactions', {
          userId: 1,
          date: '2026-01-02',
          description: 'Invalid synthetic transfer',
          type: 'TRANSFER',
          lines: [{ accountId: 1, envelopeId: 1, amount: -0.02 }, second],
        })
      ).status,
      400,
    );
  }
  assert.equal((db.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n, 0);
});

test('real cents are not treated as zero and material fractional balances are not hidden', async () => {
  seed(0.01);
  assert.equal(envelopes.getBalance(1), 0.01);
  seed(0.001);
  assert.throws(() => envelopes.getBalance(1), /material fraction/);
  const response = await request('GET', '/api/reports/account-balances');
  assert.equal(response.status, 400);
  assert.equal((await adjustment(-0.01)).status, 400);
  assert.equal((db.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n, 2);
});

test('valid income, expense and adjustment work on the existing schema without provenance column', async () => {
  for (const [type, amount] of [
    ['INCOME', 1000],
    ['EXPENSE', -0.02],
    ['ADJUSTMENT', -999.98],
  ] as const) {
    const response = await request('POST', '/api/transactions', {
      userId: 1,
      date: '2026-01-02',
      description: 'Synthetic valid operation',
      type,
      lines: [{ accountId: 1, envelopeId: 1, amount, sourceAmountText: String(amount) }],
    });
    assert.equal(response.status, 201);
  }
  assert.equal(envelopes.getBalance(1), 0);
});
