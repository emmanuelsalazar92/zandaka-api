import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const testDbPath = path.join(os.tmpdir(), `budget-test-${Date.now()}.db`);
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

function seedBudgetBase() {
  const userId = db
    .prepare('INSERT INTO user (name, base_currency) VALUES (?, ?)')
    .run('Budget User', 'USD').lastInsertRowid as number;
  const institutionId = db
    .prepare('INSERT INTO institution (user_id, name, type, is_active) VALUES (?, ?, ?, 1)')
    .run(userId, 'Bank', 'BANK').lastInsertRowid as number;
  const accountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, 1, 0)',
    )
    .run(userId, institutionId, 'Checking', 'USD').lastInsertRowid as number;
  const crcAccountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, 1, 0)',
    )
    .run(userId, institutionId, 'Wallet CRC', 'CRC').lastInsertRowid as number;
  const parentCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Needs').lastInsertRowid as number;
  const housingCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, ?, 1)')
    .run(userId, 'Housing', parentCategoryId).lastInsertRowid as number;
  const groceriesCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, ?, 1)')
    .run(userId, 'Groceries', parentCategoryId).lastInsertRowid as number;
  const travelCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, ?, 1)')
    .run(userId, 'Travel', parentCategoryId).lastInsertRowid as number;

  const housingEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(accountId, housingCategoryId).lastInsertRowid as number;
  const groceriesEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(accountId, groceriesCategoryId).lastInsertRowid as number;
  const travelEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(accountId, travelCategoryId).lastInsertRowid as number;
  const crcHousingEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(crcAccountId, housingCategoryId).lastInsertRowid as number;

  return {
    userId,
    institutionId,
    accountId,
    crcAccountId,
    housingCategoryId,
    groceriesCategoryId,
    travelCategoryId,
    housingEnvelopeId,
    groceriesEnvelopeId,
    travelEnvelopeId,
    crcHousingEnvelopeId,
  };
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
    DELETE FROM budget_line;
    DELETE FROM budget;
    DELETE FROM reconciliation;
    DELETE FROM account_envelope;
    DELETE FROM category;
    DELETE FROM account;
    DELETE FROM institution;
    DELETE FROM user;
  `);
});

test('budget happy path supports planning, funding plan and funding execution', async () => {
  const seed = seedBudgetBase();

  const createRes = await requestJson('POST', '/api/budgets', {
    userId: seed.userId,
    month: '2024-05',
    currency: 'usd',
    totalIncome: 1000,
  });
  assert.equal(createRes.res.status, 201);
  const budgetId = createRes.json.data.id as number;

  const replaceRes = await requestJson('PUT', `/api/budgets/${budgetId}/lines/bulk`, {
    userId: seed.userId,
    lines: [
      { categoryId: seed.housingCategoryId, amount: 600, percentage: 60, sortOrder: 1 },
      { categoryId: seed.groceriesCategoryId, amount: 400, percentage: 40, sortOrder: 2 },
    ],
  });
  assert.equal(replaceRes.res.status, 200);
  assert.equal(replaceRes.json.data.validation.isValid, true);

  const validateRes = await requestJson('GET', `/api/budgets/${budgetId}/validation?userId=${seed.userId}`);
  assert.equal(validateRes.res.status, 200);
  assert.equal(validateRes.json.data.distributedAmount, 1000);
  assert.equal(validateRes.json.data.distributedPercentage, 100);
  assert.equal(validateRes.json.data.remainingAmount, 0);

  const finalizeRes = await requestJson('POST', `/api/budgets/${budgetId}/finalize`, {
    userId: seed.userId,
  });
  assert.equal(finalizeRes.res.status, 200);
  assert.equal(finalizeRes.json.data.status, 'finalized');

  const budgetLines = replaceRes.json.data.lines as Array<any>;
  const planRes = await requestJson('PUT', `/api/budgets/${budgetId}/funding-plan`, {
    userId: seed.userId,
    sourceAccountId: seed.accountId,
    lines: [
      { budgetLineId: budgetLines[0].id, accountEnvelopeId: seed.housingEnvelopeId },
      { budgetLineId: budgetLines[1].id, accountEnvelopeId: seed.groceriesEnvelopeId },
    ],
  });
  assert.equal(planRes.res.status, 200);
  assert.equal(planRes.json.data.isComplete, true);
  assert.equal(planRes.json.data.sourceAccountId, seed.accountId);

  const fundRes = await requestJson('POST', `/api/budgets/${budgetId}/fund`, {
    userId: seed.userId,
    description: 'Fund May budget',
  });
  assert.equal(fundRes.res.status, 200);
  assert.equal(fundRes.json.data.budget.status, 'funded');
  assert.equal(fundRes.json.data.transactionType, 'ADJUSTMENT');

  const budget = db.prepare('SELECT status FROM budget WHERE id = ?').get(budgetId) as { status: string };
  assert.equal(budget.status, 'funded');

  const lines = db
    .prepare(
      'SELECT envelope_id, amount FROM transaction_line WHERE transaction_id = ? ORDER BY envelope_id ASC',
    )
    .all(fundRes.json.data.fundingTransactionId) as Array<{ envelope_id: number; amount: number }>;
  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map((line) => line.amount),
    [600, 400],
  );
});

test('cannot create duplicate budget for the same user month and currency', async () => {
  const seed = seedBudgetBase();

  const first = await requestJson('POST', '/api/budgets', {
    userId: seed.userId,
    month: '2024-06',
    currency: 'USD',
    totalIncome: 1200,
  });
  assert.equal(first.res.status, 201);

  const second = await requestJson('POST', '/api/budgets', {
    userId: seed.userId,
    month: '2024-06',
    currency: 'usd',
    totalIncome: 1300,
  });
  assert.equal(second.res.status, 409);
  assert.equal(second.json.message, 'A budget already exists for this month and currency.');
});

test('copy-from-previous copies lines and funding source metadata', async () => {
  const seed = seedBudgetBase();

  const sourceCreate = await requestJson('POST', '/api/budgets', {
    userId: seed.userId,
    month: '2024-04',
    currency: 'USD',
    totalIncome: 900,
  });
  const sourceBudgetId = sourceCreate.json.data.id as number;

  const sourceLines = await requestJson('PUT', `/api/budgets/${sourceBudgetId}/lines/bulk`, {
    userId: seed.userId,
    lines: [
      { categoryId: seed.housingCategoryId, amount: 500, percentage: 55.56, sortOrder: 1 },
      { categoryId: seed.groceriesCategoryId, amount: 400, percentage: 44.44, sortOrder: 2 },
    ],
  });
  assert.equal(sourceLines.res.status, 200);

  await requestJson('POST', `/api/budgets/${sourceBudgetId}/finalize`, { userId: seed.userId });
  const sourceBudgetLines = sourceLines.json.data.lines as Array<any>;
  const sourcePlan = await requestJson('PUT', `/api/budgets/${sourceBudgetId}/funding-plan`, {
    userId: seed.userId,
    sourceAccountId: seed.accountId,
    lines: [
      { budgetLineId: sourceBudgetLines[0].id, accountEnvelopeId: seed.housingEnvelopeId },
      { budgetLineId: sourceBudgetLines[1].id, accountEnvelopeId: seed.groceriesEnvelopeId },
    ],
  });
  assert.equal(sourcePlan.res.status, 200);

  const targetCreate = await requestJson('POST', '/api/budgets', {
    userId: seed.userId,
    month: '2024-05',
    currency: 'USD',
    totalIncome: 900,
  });
  const targetBudgetId = targetCreate.json.data.id as number;

  const copyRes = await requestJson('POST', `/api/budgets/${targetBudgetId}/copy-from-previous`, {
    userId: seed.userId,
  });
  assert.equal(copyRes.res.status, 200);
  assert.equal(copyRes.json.data.sourceBudgetId, sourceBudgetId);
  assert.equal(copyRes.json.data.budget.sourceAccountId, seed.accountId);
  assert.equal(copyRes.json.data.lines.length, 2);
  assert.equal(copyRes.json.data.lines[0].accountEnvelopeId, seed.housingEnvelopeId);
});

test('funding plan rejects envelopes that do not match the budget line category', async () => {
  const seed = seedBudgetBase();

  const createRes = await requestJson('POST', '/api/budgets', {
    userId: seed.userId,
    month: '2024-07',
    currency: 'USD',
    totalIncome: 500,
  });
  const budgetId = createRes.json.data.id as number;

  const replaceRes = await requestJson('PUT', `/api/budgets/${budgetId}/lines/bulk`, {
    userId: seed.userId,
    lines: [{ categoryId: seed.housingCategoryId, amount: 500, percentage: 100, sortOrder: 1 }],
  });
  const budgetLineId = replaceRes.json.data.lines[0].id as number;
  await requestJson('POST', `/api/budgets/${budgetId}/finalize`, { userId: seed.userId });

  const planRes = await requestJson('PUT', `/api/budgets/${budgetId}/funding-plan`, {
    userId: seed.userId,
    sourceAccountId: seed.accountId,
    lines: [{ budgetLineId, accountEnvelopeId: seed.travelEnvelopeId }],
  });
  assert.equal(planRes.res.status, 409);
  assert.equal(
    planRes.json.message,
    'Assigned account envelope category does not match the budget line category.',
  );
});

test('funding options only return accounts and envelopes in the budget currency', async () => {
  const seed = seedBudgetBase();

  const createRes = await requestJson('POST', '/api/budgets', {
    userId: seed.userId,
    month: '2024-08',
    currency: 'USD',
    totalIncome: 700,
  });
  const budgetId = createRes.json.data.id as number;

  await requestJson('PUT', `/api/budgets/${budgetId}/lines/bulk`, {
    userId: seed.userId,
    lines: [{ categoryId: seed.housingCategoryId, amount: 700, percentage: 100, sortOrder: 1 }],
  });
  await requestJson('POST', `/api/budgets/${budgetId}/finalize`, { userId: seed.userId });

  const optionsRes = await requestJson(
    'GET',
    `/api/budgets/${budgetId}/funding-options?userId=${seed.userId}`,
  );
  assert.equal(optionsRes.res.status, 200);
  assert.equal(optionsRes.json.data.accounts.some((account: any) => account.id === seed.accountId), true);
  assert.equal(optionsRes.json.data.accounts.some((account: any) => account.id === seed.crcAccountId), false);
  assert.equal(
    optionsRes.json.data.lines[0].availableEnvelopes.some(
      (envelope: any) => envelope.id === seed.crcHousingEnvelopeId,
    ),
    false,
  );
});
