import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const testDbPath = path.join(os.tmpdir(), `payroll-test-${Date.now()}.db`);
process.env.DB_PATH = testDbPath;
fs.writeFileSync(testDbPath, '');

let db: any;
let baseUrl = '';
let server: any;

const incomeTaxBrackets2027 = [
  { range_order: 1, amount_from: 0, amount_to: 918000, tax_rate: 0, is_exempt: 1 },
  { range_order: 2, amount_from: 918000, amount_to: 1347000, tax_rate: 0.1, is_exempt: 0 },
  { range_order: 3, amount_from: 1347000, amount_to: 2364000, tax_rate: 0.15, is_exempt: 0 },
  { range_order: 4, amount_from: 2364000, amount_to: 4727000, tax_rate: 0.2, is_exempt: 0 },
  { range_order: 5, amount_from: 4727000, amount_to: null, tax_rate: 0.25, is_exempt: 0 },
];

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

function seedUser(baseCurrency: 'CRC' | 'USD' = 'CRC') {
  const userId = db
    .prepare('INSERT INTO user (name, base_currency) VALUES (?, ?)')
    .run('Payroll User', baseCurrency).lastInsertRowid as number;
  const institutionId = db
    .prepare('INSERT INTO institution (user_id, name, type, is_active) VALUES (?, ?, ?, 1)')
    .run(userId, 'Payroll Bank', 'BANK').lastInsertRowid as number;

  return { userId, institutionId };
}

function seedBudgetAndReportBase() {
  const base = seedUser('CRC');
  const accountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, 1, 0)',
    )
    .run(base.userId, base.institutionId, 'Payroll Checking', 'CRC').lastInsertRowid as number;
  const parentCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(base.userId, 'Income').lastInsertRowid as number;
  const salaryCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, ?, 1)')
    .run(base.userId, 'Salary Envelope', parentCategoryId).lastInsertRowid as number;
  const envelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(accountId, salaryCategoryId).lastInsertRowid as number;
  const transactionId = db
    .prepare('INSERT INTO transactions (user_id, date, description, type) VALUES (?, ?, ?, ?)')
    .run(base.userId, '2026-03-15', 'Monthly salary', 'INCOME').lastInsertRowid as number;

  db.prepare(
    'INSERT INTO transaction_line (transaction_id, account_id, envelope_id, amount) VALUES (?, ?, ?, ?)',
  ).run(transactionId, accountId, envelopeId, 250000);

  return {
    ...base,
    accountId,
    parentCategoryId,
    salaryCategoryId,
    envelopeId,
  };
}

async function createCcssRule(userId: number, overrides?: Partial<Record<string, unknown>>) {
  return requestJson('POST', '/api/payroll-rules/ccss', {
    user_id: userId,
    name: 'CCSS Worker 2027',
    effective_from: '2027-01-01',
    effective_to: '2027-12-31',
    employee_rate: 0.1083,
    employer_rate: null,
    base_type: 'GROSS_SALARY',
    ...overrides,
  });
}

async function createIncomeTaxRule(userId: number, overrides?: Partial<Record<string, unknown>>) {
  return requestJson('POST', '/api/payroll-rules/income-tax', {
    user_id: userId,
    name: 'Income Tax 2027',
    effective_from: '2027-01-01',
    effective_to: '2027-12-31',
    brackets: incomeTaxBrackets2027,
    ...overrides,
  });
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
    DELETE FROM report_snapshot_line;
    DELETE FROM report_snapshot;
    DELETE FROM budget_line;
    DELETE FROM budget;
    DELETE FROM payroll_income_tax_bracket;
    DELETE FROM payroll_ccss_worker_rate;
    DELETE FROM payroll_rule_set;
    DELETE FROM exchange_rate;
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

test('POST /api/payroll-rules/ccss creates a valid CCSS rule set', async () => {
  const { userId } = seedUser();

  const response = await createCcssRule(userId);

  assert.equal(response.res.status, 201);
  assert.equal(response.json.rule_type, 'CCSS_WORKER');
  assert.equal(response.json.user_id, userId);
  assert.equal(response.json.effective_from, '2027-01-01');
  assert.equal(response.json.ccss_detail.employee_rate, 0.1083);
  assert.equal(response.json.ccss_detail.base_type, 'GROSS_SALARY');
  assert.deepEqual(response.json.income_tax_brackets, []);

  const stored = db
    .prepare(
      `SELECT prs.rule_type, pcr.employee_rate
       FROM payroll_rule_set prs
       JOIN payroll_ccss_worker_rate pcr ON pcr.rule_set_id = prs.id
       WHERE prs.id = ?`,
    )
    .get(response.json.id) as { rule_type: string; employee_rate: number };

  assert.equal(stored.rule_type, 'CCSS_WORKER');
  assert.equal(stored.employee_rate, 0.1083);
});

test('POST /api/payroll-rules/income-tax creates a valid income tax rule set', async () => {
  const { userId } = seedUser();

  const response = await createIncomeTaxRule(userId);

  assert.equal(response.res.status, 201);
  assert.equal(response.json.rule_type, 'INCOME_TAX');
  assert.equal(response.json.income_tax_brackets.length, 5);
  assert.equal(response.json.income_tax_brackets[0].amount_from, 0);
  assert.equal(response.json.income_tax_brackets[4].amount_to, null);

  const storedBrackets = db
    .prepare(
      'SELECT range_order, amount_from, amount_to, tax_rate FROM payroll_income_tax_bracket WHERE rule_set_id = ? ORDER BY range_order ASC',
    )
    .all(response.json.id) as Array<{
    range_order: number;
    amount_from: number;
    amount_to: number | null;
    tax_rate: number;
  }>;

  assert.equal(storedBrackets.length, 5);
  assert.deepEqual(
    storedBrackets.map((bracket) => bracket.range_order),
    [1, 2, 3, 4, 5],
  );
});

test('payroll rule creation rejects overlapping active validity ranges', async () => {
  const { userId } = seedUser();

  const first = await createCcssRule(userId);
  assert.equal(first.res.status, 201);

  const overlapping = await createCcssRule(userId, {
    name: 'CCSS Worker Mid 2027',
    effective_from: '2027-06-01',
    effective_to: null,
  });

  assert.equal(overlapping.res.status, 409);
  assert.equal(overlapping.json.error.code, 'CONFLICT');
});

test('GET /api/payroll-rules/active resolves by date and GET /api/payroll-rules/history returns versions in descending order', async () => {
  const { userId } = seedUser();

  const rule2026 = await createCcssRule(userId, {
    name: 'CCSS Worker 2026',
    effective_from: '2026-01-01',
    effective_to: '2026-12-31',
  });
  const rule2027 = await createCcssRule(userId, {
    name: 'CCSS Worker 2027',
    effective_from: '2027-01-01',
    effective_to: '2027-12-31',
  });

  assert.equal(rule2026.res.status, 201);
  assert.equal(rule2027.res.status, 201);

  const active = await requestJson(
    'GET',
    `/api/payroll-rules/active?user_id=${userId}&type=CCSS_WORKER&date=2027-04-01`,
  );
  assert.equal(active.res.status, 200);
  assert.equal(active.json.name, 'CCSS Worker 2027');

  const history = await requestJson(
    'GET',
    `/api/payroll-rules/history?user_id=${userId}&type=CCSS_WORKER`,
  );
  assert.equal(history.res.status, 200);
  assert.equal(history.json.items.length, 2);
  assert.deepEqual(
    history.json.items.map((item: { effective_from: string }) => item.effective_from),
    ['2027-01-01', '2026-01-01'],
  );
});

test('PUT /api/payroll-rules/:id updates a CCSS rule set detail and dates', async () => {
  const { userId } = seedUser();
  const created = await createCcssRule(userId);
  const ruleId = created.json.id as number;

  const updated = await requestJson('PUT', `/api/payroll-rules/${ruleId}`, {
    user_id: userId,
    name: 'CCSS Worker 2027 Revised',
    effective_to: '2027-11-30',
    employee_rate: 0.1091,
  });

  assert.equal(updated.res.status, 200);
  assert.equal(updated.json.name, 'CCSS Worker 2027 Revised');
  assert.equal(updated.json.effective_to, '2027-11-30');
  assert.equal(updated.json.ccss_detail.employee_rate, 0.1091);
});

test('POST /api/payroll/calculate-net-salary calculates a net salary in the exempt bracket', async () => {
  const { userId } = seedUser();

  const response = await requestJson('POST', '/api/payroll/calculate-net-salary', {
    user_id: userId,
    gross_salary: 500000,
    period_date: '2026-04-01',
  });

  assert.equal(response.res.status, 200);
  assert.equal(response.json.ccss_worker_rate, 0.1083);
  assert.equal(response.json.ccss_worker_amount, 54150);
  assert.equal(response.json.taxable_base, 500000);
  assert.equal(response.json.income_tax_amount, 0);
  assert.equal(response.json.net_salary, 445850);
  assert.deepEqual(response.json.tax_breakdown, [
    {
      range_order: 1,
      taxable_amount: 500000,
      tax_rate: 0,
      tax_amount: 0,
    },
  ]);
});

test('POST /api/payroll/calculate-net-salary calculates a salary in the second bracket', async () => {
  const { userId } = seedUser();

  const response = await requestJson('POST', '/api/payroll/calculate-net-salary', {
    user_id: userId,
    gross_salary: 1500000,
    period_date: '2026-04-01',
  });

  assert.equal(response.res.status, 200);
  assert.equal(response.json.ccss_worker_amount, 162450);
  assert.equal(response.json.taxable_base, 1500000);
  assert.equal(response.json.income_tax_amount, 65850);
  assert.equal(response.json.net_salary, 1271700);
  assert.deepEqual(response.json.tax_breakdown, [
    {
      range_order: 1,
      taxable_amount: 918000,
      tax_rate: 0,
      tax_amount: 0,
    },
    {
      range_order: 2,
      taxable_amount: 429000,
      tax_rate: 0.1,
      tax_amount: 42900,
    },
    {
      range_order: 3,
      taxable_amount: 153000,
      tax_rate: 0.15,
      tax_amount: 22950,
    },
  ]);
});

test('POST /api/payroll/calculate-net-salary calculates a salary across multiple tax brackets', async () => {
  const { userId } = seedUser();

  const response = await requestJson('POST', '/api/payroll/calculate-net-salary', {
    user_id: userId,
    gross_salary: 6000000,
    period_date: '2026-04-01',
  });

  assert.equal(response.res.status, 200);
  assert.equal(response.json.ccss_worker_amount, 649800);
  assert.equal(response.json.taxable_base, 6000000);
  assert.equal(response.json.income_tax_amount, 986300);
  assert.equal(response.json.net_salary, 4363900);
  assert.deepEqual(response.json.tax_breakdown, [
    { range_order: 1, taxable_amount: 918000, tax_rate: 0, tax_amount: 0 },
    { range_order: 2, taxable_amount: 429000, tax_rate: 0.1, tax_amount: 42900 },
    { range_order: 3, taxable_amount: 1017000, tax_rate: 0.15, tax_amount: 152550 },
    { range_order: 4, taxable_amount: 2363000, tax_rate: 0.2, tax_amount: 472600 },
    { range_order: 5, taxable_amount: 1273000, tax_rate: 0.25, tax_amount: 318250 },
  ]);
});

test('POST /api/payroll/calculate-net-salary fails when no active rule covers the requested date', async () => {
  const { userId } = seedUser();

  const response = await requestJson('POST', '/api/payroll/calculate-net-salary', {
    user_id: userId,
    gross_salary: 500000,
    period_date: '2027-04-01',
  });

  assert.equal(response.res.status, 404);
  assert.equal(response.json.error.code, 'NOT_FOUND');
});

test('budgets and report snapshots persist the payroll rule set references used', async () => {
  const seed = seedBudgetAndReportBase();
  const ccss = await createCcssRule(seed.userId);
  const incomeTax = await createIncomeTaxRule(seed.userId);
  const ccssRuleSetId = ccss.json.id as number;
  const incomeTaxRuleSetId = incomeTax.json.id as number;

  const budgetResponse = await requestJson('POST', '/api/budgets', {
    userId: seed.userId,
    month: '2026-04',
    currency: 'CRC',
    totalIncome: 1500000,
    ccssRuleSetId,
    incomeTaxRuleSetId,
  });

  assert.equal(budgetResponse.res.status, 201);
  assert.equal(budgetResponse.json.data.ccssRuleSetId, ccssRuleSetId);
  assert.equal(budgetResponse.json.data.incomeTaxRuleSetId, incomeTaxRuleSetId);

  const storedBudget = db
    .prepare('SELECT ccss_rule_set_id, income_tax_rule_set_id FROM budget WHERE id = ?')
    .get(budgetResponse.json.data.id) as {
    ccss_rule_set_id: number | null;
    income_tax_rule_set_id: number | null;
  };

  assert.equal(storedBudget.ccss_rule_set_id, ccssRuleSetId);
  assert.equal(storedBudget.income_tax_rule_set_id, incomeTaxRuleSetId);

  const snapshotResponse = await requestJson('POST', '/api/reports/generate', {
    user_id: seed.userId,
    report_month: '2026-03',
    ccss_rule_set_id: ccssRuleSetId,
    income_tax_rule_set_id: incomeTaxRuleSetId,
    notes: 'Payroll-backed snapshot',
  });

  assert.equal(snapshotResponse.res.status, 201);
  assert.equal(snapshotResponse.json.data.ccss_rule_set_id, ccssRuleSetId);
  assert.equal(snapshotResponse.json.data.income_tax_rule_set_id, incomeTaxRuleSetId);

  const storedSnapshot = db
    .prepare('SELECT ccss_rule_set_id, income_tax_rule_set_id FROM report_snapshot WHERE id = ?')
    .get(snapshotResponse.json.data.id) as {
    ccss_rule_set_id: number | null;
    income_tax_rule_set_id: number | null;
  };

  assert.equal(storedSnapshot.ccss_rule_set_id, ccssRuleSetId);
  assert.equal(storedSnapshot.income_tax_rule_set_id, incomeTaxRuleSetId);
});
