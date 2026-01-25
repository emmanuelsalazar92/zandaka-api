import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';

const testDbPath = path.join(os.tmpdir(), `backend-test-${Date.now()}.db`);
process.env.DB_PATH = testDbPath;
fs.writeFileSync(testDbPath, '');

let db: any;
let baseUrl = '';
let server: any;

async function requestJson(method: string, url: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { res, json };
}

function seedBaseData(options?: { accountActive?: number }) {
  const accountActive = options?.accountActive ?? 1;
  const userId = db
    .prepare('INSERT INTO user (name, base_currency) VALUES (?, ?)')
    .run('Test User', 'USD').lastInsertRowid as number;
  const institutionId = db
    .prepare('INSERT INTO institution (user_id, name, type, is_active) VALUES (?, ?, ?, 1)')
    .run(userId, 'Test Bank', 'BANK').lastInsertRowid as number;
  const accountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, ?, 0)'
    )
    .run(userId, institutionId, 'Checking', 'USD', accountActive).lastInsertRowid as number;
  const categoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Adjustments').lastInsertRowid as number;
  const envelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(accountId, categoryId).lastInsertRowid as number;

  return { userId, institutionId, accountId, categoryId, envelopeId };
}

before(async () => {
  const dbModule = await import('../src/db/db');
  db = dbModule.db;
  const appModule = await import('../src/app');
  const app = appModule.createApp();
  server = app.listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

beforeEach(() => {
  db.exec(`
    DELETE FROM transaction_line;
    DELETE FROM transactions;
    DELETE FROM reconciliation;
    DELETE FROM account_envelope;
    DELETE FROM category;
    DELETE FROM account;
    DELETE FROM institution;
    DELETE FROM user;
  `);
});

test('cannot create new reconciliation if active exists', async () => {
  const { accountId } = seedBaseData();
  const first = await requestJson('POST', '/api/reconciliations', {
    accountId,
    date: '2024-01-31',
    realBalance: 100,
    note: 'Month end',
  });
  assert.equal(first.res.status, 201);

  const second = await requestJson('POST', '/api/reconciliations', {
    accountId,
    date: '2024-02-29',
    realBalance: 120,
  });
  assert.equal(second.res.status, 409);
});

test('cannot reconcile inactive account', async () => {
  const { accountId } = seedBaseData({ accountActive: 0 });
  const res = await requestJson('POST', '/api/reconciliations', {
    accountId,
    date: '2024-01-31',
    realBalance: 50,
  });
  assert.equal(res.res.status, 409);
});

test('adjustment closes reconciliation when difference reaches 0', async () => {
  const { accountId, envelopeId, userId } = seedBaseData();
  const reconciliationRes = await requestJson('POST', '/api/reconciliations', {
    accountId,
    date: '2024-01-31',
    realBalance: 100,
  });
  assert.equal(reconciliationRes.res.status, 201);
  const reconciliationId = reconciliationRes.json.id as number;

  const transactionRes = await requestJson('POST', '/api/transactions', {
    userId,
    date: '2024-01-31',
    type: 'ADJUSTMENT',
    description: 'Balance adjustment',
    lines: [
      {
        accountId,
        envelopeId,
        amount: 100,
      },
    ],
  });
  assert.equal(transactionRes.res.status, 201);

  const activeRes = await requestJson(
    'GET',
    `/api/accounts/${accountId}/reconciliations/active`
  );
  assert.equal(activeRes.res.status, 404);

  const reconciliationGet = await requestJson('GET', `/api/reconciliations/${reconciliationId}`);
  assert.equal(reconciliationGet.res.status, 200);
  assert.equal(reconciliationGet.json.status, 'BALANCED');
  assert.equal(reconciliationGet.json.isActive, 0);
  assert.ok(reconciliationGet.json.closedAt);
});

test('cannot edit real_balance fields, only note', async () => {
  const { accountId } = seedBaseData();
  const reconciliationRes = await requestJson('POST', '/api/reconciliations', {
    accountId,
    date: '2024-01-31',
    realBalance: 100,
  });
  assert.equal(reconciliationRes.res.status, 201);
  const reconciliationId = reconciliationRes.json.id as number;

  const badPatch = await requestJson('PATCH', `/api/reconciliations/${reconciliationId}`, {
    realBalance: 999,
  });
  assert.equal(badPatch.res.status, 400);

  const okPatch = await requestJson('PATCH', `/api/reconciliations/${reconciliationId}`, {
    note: 'Updated note',
  });
  assert.equal(okPatch.res.status, 200);
  assert.equal(okPatch.json.note, 'Updated note');

  const reconciliationGet = await requestJson('GET', `/api/reconciliations/${reconciliationId}`);
  assert.equal(reconciliationGet.json.realBalance, 100);
});

test('delete is blocked', async () => {
  const { accountId } = seedBaseData();
  const reconciliationRes = await requestJson('POST', '/api/reconciliations', {
    accountId,
    date: '2024-01-31',
    realBalance: 100,
  });
  assert.equal(reconciliationRes.res.status, 201);
  const reconciliationId = reconciliationRes.json.id as number;

  const deleteRes = await requestJson('DELETE', `/api/reconciliations/${reconciliationId}`);
  assert.equal(deleteRes.res.status, 409);
});
