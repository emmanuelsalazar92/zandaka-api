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

test('transactions list includes account currency in the response', async () => {
  const { accountId, envelopeId, userId } = seedBaseData();

  const transactionRes = await requestJson('POST', '/api/transactions', {
    userId,
    date: '2024-01-31',
    type: 'INCOME',
    description: 'Salary',
    lines: [
      {
        accountId,
        envelopeId,
        amount: 100,
      },
    ],
  });
  assert.equal(transactionRes.res.status, 201);

  const listRes = await requestJson(
    'GET',
    `/api/transactions?userId=${userId}&amountMin=0&page=1&pageSize=10&sortBy=date&sortDir=desc`,
  );
  assert.equal(listRes.res.status, 200);
  assert.equal(listRes.json.data.length, 1);
  assert.equal(listRes.json.data[0].accountCurrency, 'USD');
  assert.equal(listRes.json.data[0].lines[0].accountCurrency, 'USD');
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

test('can ignore an active reconciliation and create a new one afterwards', async () => {
  const { accountId } = seedBaseData();
  const reconciliationRes = await requestJson('POST', '/api/reconciliations', {
    accountId,
    date: '2024-01-31',
    realBalance: 100,
  });
  assert.equal(reconciliationRes.res.status, 201);
  const reconciliationId = reconciliationRes.json.id as number;

  const ignoreRes = await requestJson('POST', `/api/reconciliations/${reconciliationId}/ignore`);
  assert.equal(ignoreRes.res.status, 200);
  assert.equal(ignoreRes.json.status, 'IGNORED');
  assert.equal(ignoreRes.json.isActive, 0);
  assert.ok(ignoreRes.json.closedAt);

  const activeRes = await requestJson('GET', `/api/accounts/${accountId}/reconciliations/active`);
  assert.equal(activeRes.res.status, 404);

  const secondRes = await requestJson('POST', '/api/reconciliations', {
    accountId,
    date: '2024-02-29',
    realBalance: 120,
  });
  assert.equal(secondRes.res.status, 201);
});

test('cannot ignore an already inactive reconciliation', async () => {
  const { accountId } = seedBaseData();
  const reconciliationRes = await requestJson('POST', '/api/reconciliations', {
    accountId,
    date: '2024-01-31',
    realBalance: 0,
  });
  assert.equal(reconciliationRes.res.status, 201);
  const reconciliationId = reconciliationRes.json.id as number;

  const ignoreRes = await requestJson('POST', `/api/reconciliations/${reconciliationId}/ignore`);
  assert.equal(ignoreRes.res.status, 409);
  assert.equal(ignoreRes.json.error.message, 'Only active reconciliations can be ignored');
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
  db.prepare(
    'INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)',
  ).run(accountId, secondCategoryId);

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

test('envelope total report sums active envelopes by requested currency', async () => {
  const { userId, institutionId, accountId, envelopeId } = seedBaseData();

  const crcAccountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, 1, 0)',
    )
    .run(userId, institutionId, 'Cash Wallet', 'CRC').lastInsertRowid as number;
  const crcCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Cash').lastInsertRowid as number;
  const crcEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(crcAccountId, crcCategoryId).lastInsertRowid as number;
  const inactiveCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Archived').lastInsertRowid as number;
  const inactiveEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(accountId, inactiveCategoryId).lastInsertRowid as number;

  const usdTransaction = await requestJson('POST', '/api/transactions', {
    userId,
    date: '2024-02-01',
    type: 'ADJUSTMENT',
    description: 'USD seed',
    lines: [
      {
        accountId,
        envelopeId,
        amount: 1500,
      },
      {
        accountId,
        envelopeId: inactiveEnvelopeId,
        amount: 800,
      },
    ],
  });
  assert.equal(usdTransaction.res.status, 201);

  db.prepare('UPDATE account_envelope SET is_active = 0 WHERE id = ?').run(inactiveEnvelopeId);

  const crcTransaction = await requestJson('POST', '/api/transactions', {
    userId,
    date: '2024-02-02',
    type: 'ADJUSTMENT',
    description: 'CRC seed',
    lines: [
      {
        accountId: crcAccountId,
        envelopeId: crcEnvelopeId,
        amount: 75,
      },
    ],
  });
  assert.equal(crcTransaction.res.status, 201);

  const usdRes = await requestJson('GET', '/api/reports/envelope-total?currency=usd');
  assert.equal(usdRes.res.status, 200);
  assert.equal(usdRes.json.currency, 'USD');
  assert.equal(usdRes.json.total, 1500);

  const crcRes = await requestJson('GET', '/api/reports/envelope-total?currency=CRC');
  assert.equal(crcRes.res.status, 200);
  assert.equal(crcRes.json.currency, 'CRC');
  assert.equal(crcRes.json.total, 75);

  const eurRes = await requestJson('GET', '/api/reports/envelope-total?currency=EUR');
  assert.equal(eurRes.res.status, 200);
  assert.equal(eurRes.json.currency, 'EUR');
  assert.equal(eurRes.json.total, 0);
});

test('active inconsistencies report returns only active accounts', async () => {
  const { accountId } = seedBaseData();

  const inactiveUserId = db
    .prepare('INSERT INTO user (name, base_currency) VALUES (?, ?)')
    .run('Inactive User', 'CRC').lastInsertRowid as number;
  const inactiveInstitutionId = db
    .prepare('INSERT INTO institution (user_id, name, type, is_active) VALUES (?, ?, ?, 1)')
    .run(inactiveUserId, 'Inactive Bank', 'BANK').lastInsertRowid as number;
  const inactiveAccountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, 0, 0)',
    )
    .run(inactiveUserId, inactiveInstitutionId, 'Old Checking', 'CRC').lastInsertRowid as number;

  db.prepare(
    `INSERT INTO reconciliation
      (account_id, date, real_balance, status, calculated_balance, difference, is_active, note)
     VALUES (?, ?, ?, 'OPEN', 0, 0, 1, NULL)`,
  ).run(accountId, '2024-03-10', 100);

  db.prepare(
    `INSERT INTO reconciliation
      (account_id, date, real_balance, status, calculated_balance, difference, is_active, note)
     VALUES (?, ?, ?, 'OPEN', 0, 0, 1, NULL)`,
  ).run(inactiveAccountId, '2024-03-11', 250);

  const res = await requestJson('GET', '/api/reports/active-inconsistencies');
  assert.equal(res.res.status, 200);
  assert.equal(Array.isArray(res.json), true);
  assert.equal(res.json.length, 1);
  assert.equal(res.json[0].accountId, accountId);
  assert.equal(res.json[0].accountName, 'Checking');
});

test('preferred currency endpoint returns the hardcoded user base currency', async () => {
  db.prepare('INSERT INTO user (id, name, base_currency) VALUES (?, ?, ?)').run(1, 'Tester', 'USD');

  const res = await requestJson('GET', '/api/users/preferred-currency');
  assert.equal(res.res.status, 200);
  assert.equal(res.json.userId, 1);
  assert.equal(res.json.baseCurrency, 'USD');
});

test('active inconsistencies ignore inactive reconciliations on active accounts', async () => {
  const { accountId } = seedBaseData();

  db.prepare(
    `INSERT INTO reconciliation
      (account_id, date, real_balance, status, calculated_balance, difference, is_active, note, closed_at)
     VALUES (?, ?, ?, 'BALANCED', 0, 0, 0, NULL, ?)`,
  ).run(accountId, '2024-03-25', 100, '2024-03-25T12:00:00Z');

  const res = await requestJson('GET', '/api/reports/active-inconsistencies');
  assert.equal(res.res.status, 200);
  assert.equal(Array.isArray(res.json), true);
  assert.equal(res.json.length, 0);
});
