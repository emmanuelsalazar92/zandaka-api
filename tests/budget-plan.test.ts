import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Database } from 'better-sqlite3';
import { createSyntheticDb } from './helpers/synthetic-db';
import { installBudgetPlans } from '../src/db/budget-plan';
import { installTransferIdempotency } from '../src/db/transfer-idempotency';
import { calculateBudgetPlan, type BudgetPlanDocument } from '../src/utils/budget-plan';

const file = path.join(os.tmpdir(), `budget-plan-${randomUUID()}.db`);
process.env.DB_PATH = file;
createSyntheticDb(file);
let db: Database,
  server: ReturnType<import('express').Express['listen']>,
  base = '';
let userId: number,
  foreignUserId: number,
  usdAccount: number,
  account1: number,
  account2: number,
  usdSource: number,
  usdTarget: number,
  source1: number,
  target1: number,
  source2: number,
  target2: number;
const postDate = '2026-01-01';
async function request(method: string, url: string, body?: unknown) {
  const response = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: (await response.json()) as any };
}
function document(): BudgetPlanDocument {
  return {
    version: 1,
    month: '2026-01',
    incomeMonth: '2025-08',
    incomeMode: 'receipts',
    income: { net: '', gross: '3600', ccss: '390', tax: '210', q1: '1500.10', q2: '1499.90' },
    exchange: { source: 'Synthetic bank', date: postDate, buy: '500', sell: '515', margin: '2' },
    incomeAccountId: usdAccount,
    retainedAccountId: usdAccount,
    sources: [
      { accountId: account1, envelopeId: source1 },
      { accountId: account2, envelopeId: source2 },
      { accountId: usdAccount, envelopeId: usdSource },
    ],
    lines: [
      {
        id: randomUUID(),
        name: 'Household',
        group: 50,
        kind: 'fixed',
        currency: 'CRC',
        payCurrency: 'CRC',
        amount: '10000',
        iva: '0',
        roundUsd: 'up',
        targetEnvelopeId: target1,
      },
      {
        id: randomUUID(),
        name: 'Personal',
        group: 30,
        kind: 'percent',
        currency: 'USD',
        payCurrency: 'CRC',
        amount: '15',
        iva: '0',
        roundUsd: 'none',
        targetEnvelopeId: target2,
      },
      {
        id: randomUUID(),
        name: 'Goal',
        group: 20,
        kind: 'fixed',
        currency: 'USD',
        payCurrency: 'USD',
        amount: '68',
        iva: '0',
        roundUsd: 'none',
        targetEnvelopeId: usdTarget,
      },
    ],
  };
}
const snapshot = () =>
  JSON.stringify(db.prepare('SELECT * FROM transaction_line ORDER BY id').all());
const counts = () => ({
  transactions: (db.prepare('SELECT COUNT(*) n FROM transactions').get() as { n: number }).n,
  receipts: (db.prepare('SELECT COUNT(*) n FROM transfer_request').get() as { n: number }).n,
});
async function save(doc = document(), id = randomUUID(), expectedRevision = 0) {
  return {
    id,
    ...(await request('PUT', `/api/budget-plans/${id}`, {
      userId,
      expectedRevision,
      document: doc,
    })),
  };
}
async function prepared(doc = document()) {
  const saved = await save(doc);
  assert.equal(saved.status, 200);
  const response = await request('POST', `/api/budget-plans/${saved.id}/finalize`, {
    userId,
    revision: saved.body.revision,
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { id: saved.id, revision: response.body.revision };
}
before(async () => {
  db = (await import('../src/db/db')).default;
  installBudgetPlans(db);
  installTransferIdempotency(db);
  server = (await import('../src/app')).createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  for (const suffix of ['', '-wal', '-shm'])
    if (fs.existsSync(file + suffix)) fs.unlinkSync(file + suffix);
});
beforeEach(() => {
  db.exec(
    'DROP TRIGGER IF EXISTS fail_plan_receipt; DELETE FROM budget_plan; DELETE FROM transfer_request; DELETE FROM transaction_line; DELETE FROM transactions; DELETE FROM budget_line; DELETE FROM budget; DELETE FROM reconciliation; DELETE FROM account_envelope; DELETE FROM category; DELETE FROM account; DELETE FROM institution; DELETE FROM user;',
  );
  userId = Number(
    db.prepare("INSERT INTO user(name,base_currency) VALUES('Synthetic planner','USD')").run()
      .lastInsertRowid,
  );
  foreignUserId = Number(
    db.prepare("INSERT INTO user(name,base_currency) VALUES('Other user','USD')").run()
      .lastInsertRowid,
  );
  const institution = Number(
    db
      .prepare(
        "INSERT INTO institution(user_id,name,type,is_active) VALUES(?,'Synthetic bank','BANK',1)",
      )
      .run(userId).lastInsertRowid,
  );
  const makeAccount = (name: string, currency: string) =>
    Number(
      db
        .prepare(
          'INSERT INTO account(user_id,institution_id,name,currency,is_active,allow_overdraft) VALUES(?,?,?,?,1,0)',
        )
        .run(userId, institution, name, currency).lastInsertRowid,
    );
  usdAccount = makeAccount('USD reserve', 'USD');
  account1 = makeAccount('CRC payments', 'CRC');
  account2 = makeAccount('CRC debit', 'CRC');
  const parent = Number(
    db
      .prepare("INSERT INTO category(user_id,name,parent_id,is_active) VALUES(?,'Root',NULL,1)")
      .run(userId).lastInsertRowid,
  );
  const envelope = (account: number, name: string) => {
    const category = Number(
      db
        .prepare('INSERT INTO category(user_id,name,parent_id,is_active) VALUES(?,?,?,1)')
        .run(userId, name, parent).lastInsertRowid,
    );
    return Number(
      db
        .prepare('INSERT INTO account_envelope(account_id,category_id,is_active) VALUES(?,?,1)')
        .run(account, category).lastInsertRowid,
    );
  };
  usdSource = envelope(usdAccount, 'Available USD');
  usdTarget = envelope(usdAccount, 'USD goal');
  source1 = envelope(account1, 'Available CRC 1');
  target1 = envelope(account1, 'Household');
  source2 = envelope(account2, 'Available CRC 2');
  target2 = envelope(account2, 'Personal');
  const transaction = Number(
    db
      .prepare(
        "INSERT INTO transactions(user_id,date,description,type) VALUES(?,?,'Synthetic prior funds','INCOME')",
      )
      .run(userId, postDate).lastInsertRowid,
  );
  for (const [account, envelopeId, amount] of [
    [usdAccount, usdSource, 5000],
    [account1, source1, 1000000],
    [account2, source2, 1000000],
  ])
    db.prepare(
      'INSERT INTO transaction_line(transaction_id,account_id,envelope_id,amount) VALUES(?,?,?,?)',
    ).run(transaction, account, envelopeId, amount);
});

test('plan calculations keep origin currency, exact percentage, IVA and two exchange directions', () => {
  const doc = document();
  doc.income = { ...doc.income, gross: '3600.05', q1: '1500.10', q2: '1499.95' };
  doc.lines.push({
    id: randomUUID(),
    name: 'Subscription',
    group: 30,
    kind: 'subscription',
    currency: 'USD',
    payCurrency: 'CRC',
    amount: '14.99',
    iva: '13',
    roundUsd: 'up',
    targetEnvelopeId: target2,
  });
  const result = calculateBudgetPlan(doc);
  assert.equal(result.buy, '490');
  assert.equal(result.sell, '526');
  assert.equal(result.incomeDifference, '0');
  assert.equal(result.lines[1].reserveUsd, '450.0075');
  assert.equal(result.lines[1].rawPayAmount, '220503.675');
  assert.equal(result.lines[1].payAmount, '220503.68');
  assert.equal(result.lines[3].payAmount, '8900');
  assert.equal(result.lines[3].reserveUsd, '19');
  assert.equal(result.closing, '0');
  assert.equal(result.issues.length, 0);
  doc.incomeMode = 'net';
  doc.income.net = '100';
  doc.income.gross = '';
  doc.income.ccss = '';
  doc.income.tax = '';
  assert.equal(calculateBudgetPlan(doc).net, '100');
});
test('fixed CRC assignments round individually; USD original is not rounded to a dollar', () => {
  const doc = document();
  doc.lines = [
    { ...doc.lines[0], amount: '10001' },
    { ...doc.lines[0], id: randomUUID(), amount: '10001' },
    { ...doc.lines[2], amount: '68.25' },
  ];
  const c = calculateBudgetPlan(doc);
  assert.equal(c.lines[0].reserveUsd, '21');
  assert.equal(c.lines[1].reserveUsd, '21');
  assert.equal(c.lines[2].reserveUsd, '68.25');
  assert.equal(c.assigned, '110.25');
});
test('blank and invalid inputs never become zero or a valid budget', () => {
  const doc = document();
  doc.income.net = '';
  doc.incomeMode = 'net';
  assert.equal(calculateBudgetPlan(doc).net, null);
  doc.incomeMode = 'receipts';
  doc.income.q1 = '1501';
  assert.ok(calculateBudgetPlan(doc).issues.some((i) => i.field === 'income'));
  doc.exchange.margin = '100';
  assert.equal(calculateBudgetPlan(doc).buy, null);
});
test('storage preparation is additive and repeatable, rejecting a compatible-looking unsafe table', async () => {
  const before = snapshot();
  installBudgetPlans(db);
  installBudgetPlans(db);
  assert.equal(snapshot(), before);
  db.exec('DROP TABLE budget_plan; CREATE TABLE budget_plan(id TEXT)');
  assert.throws(() => installBudgetPlans(db));
  const disabled = await request('GET', `/api/budget-plans?userId=${userId}`);
  assert.equal(disabled.status, 503);
  assert.equal(snapshot(), before);
  db.exec('DROP TABLE budget_plan');
  installBudgetPlans(db);
  const definition = (
    db.prepare("SELECT sql FROM sqlite_master WHERE name='budget_plan'").get() as { sql: string }
  ).sql;
  for (const invalid of ["'DRAFT'", "'d r a f t'"]) {
    db.exec('DROP TABLE budget_plan');
    db.exec(definition.replace("'draft'", invalid));
    assert.throws(() => installBudgetPlans(db));
  }
  db.exec('DROP TABLE budget_plan');
  installBudgetPlans(db);
});
test('save replay, stale revision, duplicate month and ownership are enforced without ledger writes', async () => {
  const before = snapshot(),
    doc = document(),
    id = randomUUID();
  const first = await save(doc, id);
  assert.equal(first.status, 200);
  const replay = await save(doc, id);
  assert.equal(replay.body.revision, 1);
  const updated = await save({ ...doc, incomeMonth: '2025-07' }, id, 1);
  assert.equal(updated.body.revision, 2);
  const stale = await save({ ...doc, incomeMonth: '2025-06' }, id, 1);
  assert.equal(stale.status, 409);
  assert.equal((await save(doc)).status, 409);
  assert.equal(
    (await request('GET', `/api/budget-plans/${id}?userId=${foreignUserId}`)).status,
    404,
  );
  assert.equal(snapshot(), before);
});
test('strict document validation rejects duplicate lines, foreign fields and unsafe precision', async () => {
  const doc = document();
  doc.lines.push({ ...doc.lines[0] });
  assert.equal((await save(doc)).status, 400);
  doc.lines.pop();
  assert.equal((await save({ ...doc, unexpected: true } as BudgetPlanDocument)).status, 400);
  doc.lines[0].amount = '1.001';
  assert.equal((await save(doc)).status, 400);
});
test('finalize requires reconciled income, destinations, sources and retained USD account', async () => {
  const doc = document();
  doc.income.q1 = '1500';
  const saved = await save(doc);
  const action = () =>
    request('POST', `/api/budget-plans/${saved.id}/finalize`, { userId, revision: 1 });
  assert.equal((await action()).status, 400);
  doc.income.q1 = '1500.10';
  doc.lines[0].targetEnvelopeId = null;
  assert.equal((await save(doc, saved.id, 1)).status, 200);
  assert.equal(
    (await request('POST', `/api/budget-plans/${saved.id}/finalize`, { userId, revision: 2 }))
      .status,
    400,
  );
});
test('applying redistributes existing balances in both currencies atomically and replays its receipt', async () => {
  const before = snapshot(),
    preparedPlan = await prepared(),
    requestId = randomUUID(),
    body = { userId, revision: preparedPlan.revision, requestId, date: postDate };
  const response = await request('POST', `/api/budget-plans/${preparedPlan.id}/fund`, body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.status, 'funded');
  assert.equal(response.body.receipt.transactions.length, 3);
  assert.deepEqual(counts(), { transactions: 4, receipts: 3 });
  for (const accountId of [usdAccount, account1, account2]) {
    const total = db
      .prepare('SELECT decimal_sum(amount) AS n FROM transaction_line WHERE account_id=?')
      .get(accountId) as { n: string };
    assert.equal(Number(total.n), accountId === usdAccount ? 5000 : 1000000);
  }
  assert.notEqual(snapshot(), before);
  const replay = await request('POST', `/api/budget-plans/${preparedPlan.id}/fund`, body);
  assert.deepEqual(replay.body.receipt, response.body.receipt);
  assert.deepEqual(counts(), { transactions: 4, receipts: 3 });
  assert.equal(
    (
      await request('POST', `/api/budget-plans/${preparedPlan.id}/fund`, {
        ...body,
        requestId: randomUUID(),
      })
    ).status,
    409,
  );
});
test('a failed later transfer rolls back earlier transfers, receipts and plan status', async () => {
  const p = await prepared(),
    before = snapshot();
  db.exec(
    "CREATE TRIGGER fail_plan_receipt BEFORE INSERT ON transfer_request WHEN (SELECT COUNT(*) FROM transfer_request)>=1 BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END;",
  );
  const result = await request('POST', `/api/budget-plans/${p.id}/fund`, {
    userId,
    revision: p.revision,
    requestId: randomUUID(),
    date: postDate,
  });
  assert.equal(result.status, 500);
  assert.equal(snapshot(), before);
  assert.deepEqual(counts(), { transactions: 1, receipts: 0 });
  assert.equal(
    (await request('GET', `/api/budget-plans/${p.id}?userId=${userId}`)).body.status,
    'finalized',
  );
});
test('insufficient funds, changed endpoints and future dates cannot write any ledger entry', async () => {
  const p = await prepared(),
    before = snapshot(),
    fund = () =>
      request('POST', `/api/budget-plans/${p.id}/fund`, {
        userId,
        revision: p.revision,
        requestId: randomUUID(),
        date: postDate,
      });
  db.prepare('UPDATE account_envelope SET is_active=0 WHERE id=?').run(target2);
  assert.equal((await fund()).status, 400);
  assert.equal(snapshot(), before);
  db.prepare('UPDATE account_envelope SET is_active=1 WHERE id=?').run(target2);
  db.prepare('UPDATE transaction_line SET amount=1 WHERE envelope_id=?').run(source2);
  const insufficient = snapshot();
  assert.equal((await fund()).status, 409);
  assert.equal(snapshot(), insufficient);
  assert.equal(
    (
      await request('POST', `/api/budget-plans/${p.id}/fund`, {
        userId,
        revision: p.revision,
        requestId: randomUUID(),
        date: '2099-01-01',
      })
    ).status,
    400,
  );
});
test('copying returns only prior assignments with new IDs and preserves current income/rates', async () => {
  const previous = await save();
  assert.equal(previous.status, 200);
  const current = document();
  current.month = '2026-02';
  current.income.net = '123';
  current.exchange.buy = '505';
  const saved = await save(current);
  const copy = await request(
    'GET',
    `/api/budget-plans/${saved.id}/previous-assignments?userId=${userId}`,
  );
  assert.equal(copy.status, 200);
  assert.equal(copy.body.document.exchange.buy, '505');
  assert.equal(copy.body.document.income.net, '123');
  assert.notEqual(copy.body.document.lines[0].id, previous.body.document.lines[0].id);
  assert.equal(copy.body.document.lines[0].amount, previous.body.document.lines[0].amount);
});
