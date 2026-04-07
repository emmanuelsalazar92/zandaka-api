import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const testDbPath = path.join(os.tmpdir(), `settings-test-${Date.now()}.db`);
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

function seedBaseData() {
  const userId = db
    .prepare('INSERT INTO user (id, name, base_currency) VALUES (?, ?, ?)')
    .run(1, 'Settings User', 'USD').lastInsertRowid as number;
  const institutionId = db
    .prepare('INSERT INTO institution (user_id, name, type, is_active) VALUES (?, ?, ?, 1)')
    .run(userId, 'Rules Bank', 'BANK').lastInsertRowid as number;
  const accountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, 1, 0)',
    )
    .run(userId, institutionId, 'Checking', 'USD').lastInsertRowid as number;
  const categoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Subscriptions').lastInsertRowid as number;
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
    DELETE FROM auto_assignment_rule;
    DELETE FROM cash_reconciliation_detail;
    DELETE FROM cash_denomination;
    DELETE FROM exchange_rate;
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

test('cash denominations CRUD and duplicate protection work end-to-end', async () => {
  const { userId } = seedBaseData();

  const createRes = await requestJson('POST', '/api/settings/cash-denominations', {
    userId,
    currency: 'CRC',
    value: 500,
    type: 'COIN',
    label: '₡500',
    sortOrder: 6,
    isActive: true,
  });
  assert.equal(createRes.res.status, 201);
  assert.equal(createRes.json.currency, 'CRC');
  assert.equal(createRes.json.value, 500);
  assert.equal(createRes.json.type, 'COIN');
  assert.equal(createRes.json.isActive, true);
  const denominationId = createRes.json.id as number;

  const duplicateRes = await requestJson('POST', '/api/settings/cash-denominations', {
    userId,
    currency: 'CRC',
    value: 500,
    type: 'COIN',
    label: '₡500 repeat',
    sortOrder: 7,
  });
  assert.equal(duplicateRes.res.status, 409);

  const listRes = await requestJson(
    'GET',
    `/api/settings/cash-denominations?userId=${userId}&currency=CRC&includeInactive=true`,
  );
  assert.equal(listRes.res.status, 200);
  assert.equal(listRes.json.items.length, 1);

  const updateRes = await requestJson(
    'PUT',
    `/api/settings/cash-denominations/${denominationId}`,
    {
      userId,
      currency: 'CRC',
      value: 1000,
      type: 'BILL',
      label: '₡1000',
      sortOrder: 2,
      isActive: true,
    },
  );
  assert.equal(updateRes.res.status, 200);
  assert.equal(updateRes.json.value, 1000);
  assert.equal(updateRes.json.type, 'BILL');
  assert.equal(updateRes.json.sortOrder, 2);

  const deactivateRes = await requestJson(
    'DELETE',
    `/api/settings/cash-denominations/${denominationId}?userId=${userId}`,
  );
  assert.equal(deactivateRes.res.status, 200);
  assert.equal(deactivateRes.json.isActive, false);

  const stored = db.prepare('SELECT is_active FROM cash_denomination WHERE id = ?').get(
    denominationId,
  ) as {
    is_active: number;
  };
  assert.equal(stored.is_active, 0);
});

test('user settings and stored exchange rates CRUD work end-to-end', async () => {
  const { userId } = seedBaseData();

  const getUserRes = await requestJson('GET', `/api/users/${userId}`);
  assert.equal(getUserRes.res.status, 200);
  assert.equal(getUserRes.json.baseCurrency, 'USD');

  const updateUserRes = await requestJson('PUT', `/api/users/${userId}`, {
    name: 'Updated Settings User',
    baseCurrency: 'CRC',
  });
  assert.equal(updateUserRes.res.status, 200);
  assert.equal(updateUserRes.json.name, 'Updated Settings User');
  assert.equal(updateUserRes.json.baseCurrency, 'CRC');
  assert.ok(updateUserRes.json.updatedAt);

  const createRateRes = await requestJson('POST', '/api/exchange-rate', {
    userId,
    fromCurrency: 'USD',
    toCurrency: 'CRC',
    rate: 510.25,
    effectiveDate: '2026-03-28',
  });
  assert.equal(createRateRes.res.status, 201);
  assert.equal(createRateRes.json.effective_date, '2026-03-28');
  const rateId = createRateRes.json.id as number;

  const listRateRes = await requestJson('GET', `/api/exchange-rate?userId=${userId}`);
  assert.equal(listRateRes.res.status, 200);
  assert.equal(listRateRes.json.length, 1);
  assert.equal(listRateRes.json[0].effective_date, '2026-03-28');

  const updateRateRes = await requestJson('PUT', `/api/exchange-rate/${rateId}`, {
    userId,
    rate: 511.1,
    effectiveDate: '2026-03-29',
  });
  assert.equal(updateRateRes.res.status, 200);
  assert.equal(updateRateRes.json.rate, 511.1);
  assert.equal(updateRateRes.json.effective_date, '2026-03-29');
  assert.ok(updateRateRes.json.updated_at);

  const deleteRateRes = await requestJson('DELETE', `/api/exchange-rate/${rateId}?userId=${userId}`);
  assert.equal(deleteRateRes.res.status, 204);
  const remainingRates = db.prepare('SELECT COUNT(*) as total FROM exchange_rate').get() as {
    total: number;
  };
  assert.equal(remainingRates.total, 0);
});

test('auto assignment rules CRUD and matcher work end-to-end', async () => {
  const { userId, accountId, envelopeId } = seedBaseData();

  const createRuleRes = await requestJson('POST', '/api/auto-assignment-rules', {
    userId,
    pattern: 'spotify',
    matchType: 'CONTAINS',
    accountId,
    accountEnvelopeId: envelopeId,
    priority: 50,
    isActive: true,
    notes: 'Subscription rule',
  });
  assert.equal(createRuleRes.res.status, 201);
  const ruleId = createRuleRes.json.id as number;
  assert.equal(createRuleRes.json.pattern, 'spotify');
  assert.equal(createRuleRes.json.account_id, accountId);
  assert.equal(createRuleRes.json.account_envelope_id, envelopeId);

  const listRulesRes = await requestJson('GET', `/api/auto-assignment-rules?userId=${userId}`);
  assert.equal(listRulesRes.res.status, 200);
  assert.equal(listRulesRes.json.length, 1);
  assert.equal(listRulesRes.json[0].pattern, 'spotify');

  const testRuleRes = await requestJson('POST', '/api/auto-assignment-rules/test', {
    userId,
    description: 'Spotify USA monthly subscription',
  });
  assert.equal(testRuleRes.res.status, 200);
  assert.equal(testRuleRes.json.matched, true);
  assert.equal(testRuleRes.json.matchedRule.id, ruleId);

  const deactivateRuleRes = await requestJson(
    'PATCH',
    `/api/auto-assignment-rules/${ruleId}/status`,
    { userId, isActive: false },
  );
  assert.equal(deactivateRuleRes.res.status, 200);
  assert.equal(deactivateRuleRes.json.is_active, 0);

  const archiveRuleRes = await requestJson(
    'DELETE',
    `/api/auto-assignment-rules/${ruleId}?userId=${userId}`,
  );
  assert.equal(archiveRuleRes.res.status, 204);
  const storedRule = db.prepare('SELECT is_active FROM auto_assignment_rule WHERE id = ?').get(ruleId) as {
    is_active: number;
  };
  assert.equal(storedRule.is_active, 0);
});
