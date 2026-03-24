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
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, ?, 0)',
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
  if (db?.close) {
    db.close();
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

  const activeRes = await requestJson('GET', `/api/accounts/${accountId}/reconciliations/active`);
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

test('cannot deactivate account when it has active envelopes even with zero balance', async () => {
  const { accountId } = seedBaseData();

  const deactivateRes = await requestJson('POST', `/api/accounts/${accountId}/deactivate`);
  assert.equal(deactivateRes.res.status, 409);
  assert.equal(deactivateRes.json.error.code, 'CONFLICT');
  assert.equal(deactivateRes.json.error.message, 'Account has active envelopes');
  assert.deepEqual(deactivateRes.json.error.details, [{ field: 'envelopes', accountId }]);

  const account = db.prepare('SELECT is_active FROM account WHERE id = ?').get(accountId) as {
    is_active: number;
  };
  assert.equal(account.is_active, 1);
});

test('can deactivate account when it has no active envelopes even if it has historical balance', async () => {
  const { accountId, envelopeId, userId } = seedBaseData();

  const transactionRes = await requestJson('POST', '/api/transactions', {
    userId,
    date: '2024-01-31',
    type: 'ADJUSTMENT',
    description: 'Seed balance',
    lines: [
      {
        accountId,
        envelopeId,
        amount: 250,
      },
    ],
  });
  assert.equal(transactionRes.res.status, 201);

  db.prepare('UPDATE account_envelope SET is_active = 0 WHERE id = ?').run(envelopeId);

  const deactivateRes = await requestJson('POST', `/api/accounts/${accountId}/deactivate`);
  assert.equal(deactivateRes.res.status, 204);

  const account = db.prepare('SELECT is_active FROM account WHERE id = ?').get(accountId) as {
    is_active: number;
  };
  assert.equal(account.is_active, 0);
});

test('account balances report includes active envelope flags and counts', async () => {
  const { userId, institutionId, accountId, categoryId } = seedBaseData();

  const secondCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Groceries').lastInsertRowid as number;
  db.prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)').run(
    accountId,
    secondCategoryId,
  );

  const thirdCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Travel').lastInsertRowid as number;
  const inactiveEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(accountId, thirdCategoryId).lastInsertRowid as number;
  db.prepare('UPDATE account_envelope SET is_active = 0 WHERE id = ?').run(inactiveEnvelopeId);

  const secondAccountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, 1, 0)',
    )
    .run(userId, institutionId, 'Savings', 'USD').lastInsertRowid as number;
  const fourthCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Emergency').lastInsertRowid as number;
  const secondAccountEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(secondAccountId, fourthCategoryId).lastInsertRowid as number;
  db.prepare('UPDATE account_envelope SET is_active = 0 WHERE id = ?').run(secondAccountEnvelopeId);

  const reportRes = await requestJson('GET', '/api/reports/account-balances?isActive=true');
  assert.equal(reportRes.res.status, 200);

  const checking = reportRes.json.find((account: any) => account.id === accountId);
  assert.ok(checking);
  assert.equal(checking.user_id, userId);
  assert.equal(checking.has_active_envelopes, true);
  assert.equal(typeof checking.has_active_envelopes, 'boolean');
  assert.equal(checking.active_envelopes_count, 2);
  assert.equal(typeof checking.active_envelopes_count, 'number');

  const savings = reportRes.json.find((account: any) => account.id === secondAccountId);
  assert.ok(savings);
  assert.equal(savings.has_active_envelopes, false);
  assert.equal(savings.active_envelopes_count, 0);

  const originalEnvelope = db
    .prepare('SELECT is_active FROM account_envelope WHERE account_id = ? AND category_id = ?')
    .get(accountId, categoryId) as { is_active: number };
  assert.equal(originalEnvelope.is_active, 1);
});
