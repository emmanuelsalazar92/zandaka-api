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
import { installBudgetMonthStart } from '../src/db/budget-month-start';
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
test('month-start links actual FX and expenses without changing the ledger', async () => {
  const doc = document();
  doc.incomeAccountId = Number(
    db
      .prepare(
        `INSERT INTO account(user_id,institution_id,name,currency,is_active,allow_overdraft)
    SELECT user_id,institution_id,'Salary USD','USD',1,0 FROM account WHERE id=?`,
      )
      .run(usdAccount).lastInsertRowid,
  );
  doc.exchange.margin = '0';
  doc.exchange.buy = '434';
  doc.lines = [
    { ...doc.lines[0], amount: '259966' },
    { ...doc.lines[0], id: randomUUID(), name: 'Otro pago', amount: '434' },
  ];
  const saved = await save(doc);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const url = `/api/budget-plans/${saved.id}/month-start`;
  assert.equal((await request('GET', `${url}?userId=${userId}`)).status, 503);
  installBudgetMonthStart(db);
  installBudgetMonthStart(db);
  const movement = (type: string, account: number, envelope: number, amount: number) => {
    const id = Number(
      db
        .prepare('INSERT INTO transactions(user_id,date,description,type) VALUES(?,?,?,?)')
        .run(userId, postDate, 'Synthetic movement', type).lastInsertRowid,
    );
    db.prepare(
      'INSERT INTO transaction_line(transaction_id,account_id,envelope_id,amount) VALUES(?,?,?,?)',
    ).run(id, account, envelope, amount);
    return id;
  };
  const debit = movement('EXPENSE', usdAccount, usdSource, -600);
  const credit = movement('INCOME', account1, source1, 262000);
  const expense = movement('EXPENSE', account1, target1, -250000);
  const before = snapshot();
  const link = (step: string, movementIds: number[], revision = 1) =>
    request('PUT', `${url}/link`, { userId, step, revision, movementIds });
  assert.equal((await request('GET', `${url}?userId=${foreignUserId}`)).status, 404);
  assert.equal((await link('fx', [debit, debit])).status, 400);
  assert.equal((await link('fx', [credit, debit])).status, 400);
  assert.equal((await link('fx', [expense, credit])).status, 400);
  const confirmed = await link('fx', [debit, credit]);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.steps[0].planned, '600');
  assert.equal(confirmed.body.steps[0].alternateFromAccountId, usdAccount);
  assert.deepEqual(
    confirmed.body.steps[0].evidence.movements.map((m: { amount: string }) => m.amount),
    ['600', '262000'],
  );
  assert.equal(confirmed.body.steps[0].evidence.rate, '436.666667');
  assert.deepEqual((await link('fx', [debit, credit])).body, confirmed.body);
  assert.equal((await link(`payment:${doc.lines[0].id}`, [credit])).status, 400);
  assert.equal((await link(`payment:${doc.lines[0].id}`, [expense])).status, 200);
  assert.equal((await link(`payment:${doc.lines[1].id}`, [expense])).status, 409);
  assert.equal(snapshot(), before);
  const edited = await save({ ...doc, exchange: { ...doc.exchange, buy: '435' } }, saved.id, 1);
  assert.equal(edited.status, 200);
  const reread = await request('GET', `${url}?userId=${userId}`);
  assert.equal(reread.body.steps[0].evidence.current, false);
  assert.equal((await link('fx', [debit, credit])).status, 409);
  assert.equal((await link('fx', [debit, credit], 2)).status, 200);
});

test('month-start commits transfers and evidence together and replays the same receipt', async () => {
  installBudgetMonthStart(db);
  const doc = document();
  const saved = await save(doc);
  assert.equal(saved.status, 200);
  const url = `/api/budget-plans/${saved.id}`;
  const insTransaction = db.prepare(
    'INSERT INTO transactions(user_id,date,description,type) VALUES(?,?,?,?)',
  );
  const insLine = db.prepare(
    'INSERT INTO transaction_line(transaction_id,account_id,envelope_id,amount) VALUES(?,?,?,?)',
  );
  const debit = Number(
    insTransaction.run(userId, postDate, 'Synthetic USD sold', 'EXPENSE').lastInsertRowid,
  );
  const credit = Number(
    insTransaction.run(userId, postDate, 'Synthetic CRC received', 'INCOME').lastInsertRowid,
  );
  insLine.run(debit, usdAccount, usdSource, -600);
  insLine.run(credit, account1, source1, 262000);
  const conversion = await request('PUT', `${url}/month-start/link`, {
    userId,
    step: 'fx',
    revision: 1,
    movementIds: [debit, credit],
  });
  assert.equal(conversion.status, 200, JSON.stringify(conversion.body));
  const step = `transfer:${account2}`;
  const amount = Number(conversion.body.steps.find((s: { key: string }) => s.key === step).planned);
  const transfer = {
    requestId: randomUUID(),
    date: postDate,
    description: 'Synthetic month transfer',
    from: { accountId: account1, envelopeId: source1 },
    to: { accountId: account2, envelopeId: source2 },
    amount,
  };
  const payload = { userId, revision: 1, step, transfer };
  const before = counts();
  assert.equal(
    (
      await request('POST', `${url}/month-start/transfer`, {
        ...payload,
        transfer: { ...transfer, amount: 9999999 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('POST', `${url}/month-start/transfer`, {
        ...payload,
        transfer: { ...transfer, to: { accountId: account2, envelopeId: target2 } },
      })
    ).status,
    400,
  );
  assert.deepEqual(counts(), before);
  const first = await request('POST', `${url}/month-start/transfer`, payload);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(
    (await request('POST', `${url}/month-start/transfer`, payload)).body,
    first.body,
  );
  assert.deepEqual(counts(), {
    transactions: before.transactions + 1,
    receipts: before.receipts + 1,
  });
  assert.equal(
    (
      await request('POST', `${url}/month-start/transfer`, {
        ...payload,
        transfer: { ...transfer, requestId: randomUUID() },
      })
    ).status,
    409,
  );
  assert.equal((await request('POST', `${url}/finalize`, { userId, revision: 1 })).status, 200);
  assert.deepEqual(
    (await request('POST', `${url}/month-start/transfer`, payload)).body,
    first.body,
  );
  const read = await request('GET', `${url}/month-start?userId=${userId}`);
  assert.equal(read.body.steps.find((s: { key: string }) => s.key === step).evidence.current, true);
  assert.equal((await request('POST', `${url}/reopen`, { userId, revision: 2 })).status, 200);
  const reopened = await request('GET', `${url}/month-start?userId=${userId}`);
  assert.equal(
    reopened.body.steps.find((s: { key: string }) => s.key === 'fx').evidence.current,
    false,
  );
  assert.equal(reopened.body.detachedCount, 1);
});

test('tracking keeps plan, receipt and Costa Rica expenses independent by envelope and currency', async () => {
  const doc = document();
  doc.lines = [{ ...doc.lines[0], amount: '100' }, doc.lines[2]];
  // Ensure the late receipt can be posted while all funding destinations remain active.
  const { id, revision } = await prepared(doc);
  const url = `/api/budget-plans/${id}`;
  const tracking = () => request('GET', `${url}/tracking?userId=${userId}`);
  const draft = await tracking();
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  assert.equal(draft.body.fundingStatus, 'pending');
  assert.equal(
    draft.body.rows.find((r: { envelopeId: number }) => r.envelopeId === target1).assigned,
    '0',
  );
  const fund = await request('POST', `${url}/fund`, {
    userId,
    revision,
    requestId: randomUUID(),
    date: '2026-02-02',
  });
  assert.equal(fund.status, 200, JSON.stringify(fund.body));
  const tx = db.prepare(
    'INSERT INTO transactions(user_id,date,description,type,created_at) VALUES(?,?,?,?,?)',
  );
  const line = db.prepare(
    'INSERT INTO transaction_line(transaction_id,account_id,envelope_id,amount) VALUES(?,?,?,?)',
  );
  const last = tx.run(
    userId,
    '2026-01-31',
    '23:59 Costa Rica',
    'EXPENSE',
    '2026-02-01T05:59:00Z',
  ).lastInsertRowid;
  line.run(last, account1, target1, -90);
  line.run(last, account2, target2, -7);
  const next = tx.run(
    userId,
    '2026-02-01',
    '00:00 Costa Rica',
    'EXPENSE',
    '2026-02-01T06:00:00Z',
  ).lastInsertRowid;
  line.run(next, account1, target1, -99);
  // No explicit refund relation exists in the budget ledger. Credits never reduce gross expense.
  for (const type of ['INCOME', 'ADJUSTMENT', 'TRANSFER']) {
    const credit = tx.run(
      userId,
      '2026-01-20',
      'Synthetic credit or transfer',
      type,
      '2026-01-20T12:00:00Z',
    ).lastInsertRowid;
    line.run(credit, account1, target1, type === 'TRANSFER' ? -40 : 40);
    if (type === 'TRANSFER') line.run(credit, account1, source1, 40);
  }
  db.prepare('UPDATE account_envelope SET is_active=0 WHERE id=?').run(target2);
  const before = snapshot();
  const result = await tracking();
  assert.equal(result.status, 200);
  assert.equal(result.body.fundingStatus, 'confirmed');
  assert.equal(result.body.fundingDate, '2026-02-02');
  assert.equal(result.body.from, '2026-01-01');
  assert.equal(result.body.to, '2026-01-31');
  const row = (id: number) =>
    result.body.rows.find((r: { envelopeId: number }) => r.envelopeId === id);
  assert.deepEqual(
    [row(target1).planned, row(target1).assigned, row(target1).spent],
    ['100', '100', '90'],
  );
  assert.deepEqual(
    [row(usdTarget).currency, row(usdTarget).assigned, row(usdTarget).spent],
    ['USD', '68', '0'],
  );
  assert.deepEqual(
    [row(target2).active, row(target2).hasPlan, row(target2).planned, row(target2).spent],
    [false, false, null, '7'],
  );
  for (const [accountId, envelopeId, amount] of [
    [account1, target1, -90],
    [account2, target2, -7],
  ]) {
    const link = await request(
      'GET',
      `/api/transactions?userId=${userId}&from=2026-01-01&to=2026-01-31&type=EXPENSE&accountId=${accountId}&accountEnvelopeId=${envelopeId}`,
    );
    assert.equal(link.status, 200, JSON.stringify(link.body));
    assert.equal(link.body.meta.totalItems, 1);
    assert.equal(link.body.data[0].amount, amount);
    assert.equal(link.body.data[0].lines.length, 1);
    assert.equal(link.body.data[0].lines[0].envelopeId, envelopeId);
  }
  assert.equal((await request('GET', `${url}/tracking?userId=${foreignUserId}`)).status, 404);
  assert.equal(snapshot(), before);
});

test('tracking marks funded totals unknown when their receipt or ledger evidence is incomplete', async () => {
  const { id, revision } = await prepared();
  const url = `/api/budget-plans/${id}`;
  const funded = await request('POST', `${url}/fund`, {
    userId,
    revision,
    requestId: randomUUID(),
    date: postDate,
  });
  assert.equal(funded.status, 200);
  const receipt = funded.body.receipt;
  const update = db.prepare('UPDATE budget_plan SET receipt_json=? WHERE id=?');
  for (const broken of [
    '{',
    JSON.stringify({ ...receipt, transactions: receipt.transactions.slice(1) }),
  ]) {
    update.run(broken, id);
    const result = await request('GET', `${url}/tracking?userId=${userId}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.fundingStatus, 'unverified');
    assert.equal(result.body.fundingDate, null);
    assert.ok(result.body.rows.every((row: { assigned: unknown }) => row.assigned === null));
  }
  update.run(JSON.stringify(receipt), id);
  const transferId = receipt.transactions[0].transactionId;
  db.prepare('UPDATE transaction_line SET amount=? WHERE transaction_id=? AND envelope_id=?').run(
    '0',
    transferId,
    target1,
  );
  const result = await request('GET', `${url}/tracking?userId=${userId}`);
  assert.equal(result.body.fundingStatus, 'unverified');
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
