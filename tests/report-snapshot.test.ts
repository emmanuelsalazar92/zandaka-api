import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const testDbPath = path.join(os.tmpdir(), `report-snapshot-test-${Date.now()}.db`);
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

function seedReportBase(userBaseCurrency: 'CRC' | 'USD' = 'CRC') {
  const userId = db
    .prepare('INSERT INTO user (name, base_currency) VALUES (?, ?)')
    .run('Snapshot User', userBaseCurrency).lastInsertRowid as number;
  const institutionId = db
    .prepare('INSERT INTO institution (user_id, name, type, is_active) VALUES (?, ?, ?, 1)')
    .run(userId, 'Snapshot Bank', 'BANK').lastInsertRowid as number;

  const crcAccountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, 1, 0)',
    )
    .run(userId, institutionId, 'BAC Ahorros', 'CRC').lastInsertRowid as number;
  const usdAccountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, 1, 0)',
    )
    .run(userId, institutionId, 'Wise USD', 'USD').lastInsertRowid as number;
  const inactiveAccountId = db
    .prepare(
      'INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft) VALUES (?, ?, ?, ?, 0, 0)',
    )
    .run(userId, institutionId, 'Old Account', 'CRC').lastInsertRowid as number;

  const groceriesCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Supermercado').lastInsertRowid as number;
  const transportCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Transporte').lastInsertRowid as number;
  const travelCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Viajes').lastInsertRowid as number;
  const subscriptionsCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Suscripciones').lastInsertRowid as number;
  const archivedCategoryId = db
    .prepare('INSERT INTO category (user_id, name, parent_id, is_active) VALUES (?, ?, NULL, 1)')
    .run(userId, 'Archivada').lastInsertRowid as number;

  const groceriesEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(crcAccountId, groceriesCategoryId).lastInsertRowid as number;
  const transportEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(crcAccountId, transportCategoryId).lastInsertRowid as number;
  const travelEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(usdAccountId, travelCategoryId).lastInsertRowid as number;
  const subscriptionsEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(usdAccountId, subscriptionsCategoryId).lastInsertRowid as number;
  const inactiveEnvelopeId = db
    .prepare('INSERT INTO account_envelope (account_id, category_id, is_active) VALUES (?, ?, 1)')
    .run(inactiveAccountId, archivedCategoryId).lastInsertRowid as number;

  const usdToCrcRateId = db
    .prepare(
      'INSERT INTO exchange_rate (user_id, from_currency, to_currency, rate, effective_date) VALUES (?, ?, ?, ?, ?)',
    )
    .run(userId, 'USD', 'CRC', 510, '2026-03-31').lastInsertRowid as number;
  const crcToUsdRateId = db
    .prepare(
      'INSERT INTO exchange_rate (user_id, from_currency, to_currency, rate, effective_date) VALUES (?, ?, ?, ?, ?)',
    )
    .run(userId, 'CRC', 'USD', 520, '2026-03-31').lastInsertRowid as number;

  const insertTransaction = db.prepare(
    'INSERT INTO transactions (user_id, date, description, type) VALUES (?, ?, ?, ?)',
  );
  const insertLine = db.prepare(
    'INSERT INTO transaction_line (transaction_id, account_id, envelope_id, amount) VALUES (?, ?, ?, ?)',
  );

  const tx1Id = insertTransaction.run(userId, '2026-03-05', 'Depósito supermercado', 'INCOME')
    .lastInsertRowid as number;
  insertLine.run(tx1Id, crcAccountId, groceriesEnvelopeId, 100000);

  const tx2Id = insertTransaction.run(userId, '2026-03-08', 'Gasto transporte', 'EXPENSE')
    .lastInsertRowid as number;
  insertLine.run(tx2Id, crcAccountId, transportEnvelopeId, -25000);

  const tx3Id = insertTransaction.run(userId, '2026-03-09', 'Fondo viajes', 'INCOME')
    .lastInsertRowid as number;
  insertLine.run(tx3Id, usdAccountId, travelEnvelopeId, 200);

  const tx4Id = insertTransaction.run(userId, '2026-03-10', 'Cuenta vieja', 'INCOME')
    .lastInsertRowid as number;
  insertLine.run(tx4Id, inactiveAccountId, inactiveEnvelopeId, 999999);

  return {
    userId,
    crcAccountId,
    usdAccountId,
    groceriesEnvelopeId,
    transportEnvelopeId,
    travelEnvelopeId,
    subscriptionsEnvelopeId,
    usdToCrcRateId,
    crcToUsdRateId,
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
    DELETE FROM report_snapshot_line;
    DELETE FROM report_snapshot;
    DELETE FROM auto_assignment_rule;
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

test('POST /api/reports/generate persists a versioned historical snapshot with frozen detail lines', async () => {
  const seed = seedReportBase();

  const firstRes = await requestJson('POST', '/api/reports/generate', {
    user_id: seed.userId,
    report_month: '2026-03',
    base_currency: 'CRC',
    exchange_rate_id: seed.usdToCrcRateId,
    notes: 'Reporte mensual de marzo',
  });

  assert.equal(firstRes.res.status, 201);
  assert.equal(firstRes.json.message, 'Report snapshot generated successfully');
  assert.equal(firstRes.json.data.version, 1);
  assert.equal(firstRes.json.data.is_latest, 1);
  assert.equal(firstRes.json.data.base_currency, 'CRC');
  assert.equal(firstRes.json.data.total_crc, 75000);
  assert.equal(firstRes.json.data.total_usd, 200);
  assert.equal(firstRes.json.data.exchange_rate_used, 510);
  assert.equal(firstRes.json.data.exchange_rate_id, seed.usdToCrcRateId);
  assert.equal(firstRes.json.data.consolidated_amount, 177000);
  assert.equal(firstRes.json.data.line_count, 6);

  const firstSnapshotId = firstRes.json.data.id as number;
  const storedLines = db
    .prepare(
      `
        SELECT
          line_type,
          account_id,
          account_name,
          account_currency,
          envelope_id,
          envelope_name,
          category_id,
          category_name,
          amount,
          sort_order
        FROM report_snapshot_line
        WHERE report_snapshot_id = ?
        ORDER BY sort_order ASC
      `,
    )
    .all(firstSnapshotId) as Array<Record<string, any>>;

  assert.equal(storedLines.length, 6);
  assert.deepEqual(
    storedLines.map((line) => [line.line_type, line.account_name, line.envelope_name, line.amount]),
    [
      ['ACCOUNT_TOTAL', 'BAC Ahorros', null, 75000],
      ['ENVELOPE_TOTAL', 'BAC Ahorros', 'Supermercado', 100000],
      ['ENVELOPE_TOTAL', 'BAC Ahorros', 'Transporte', -25000],
      ['ACCOUNT_TOTAL', 'Wise USD', null, 200],
      ['ENVELOPE_TOTAL', 'Wise USD', 'Suscripciones', 0],
      ['ENVELOPE_TOTAL', 'Wise USD', 'Viajes', 200],
    ],
  );
  assert.equal(storedLines[1].category_name, 'Supermercado');
  assert.equal(storedLines[4].account_currency, 'USD');

  const tx5Id = db
    .prepare('INSERT INTO transactions (user_id, date, description, type) VALUES (?, ?, ?, ?)')
    .run(seed.userId, '2026-03-31', 'Ajuste cierre', 'ADJUSTMENT').lastInsertRowid as number;
  db.prepare(
    'INSERT INTO transaction_line (transaction_id, account_id, envelope_id, amount) VALUES (?, ?, ?, ?)',
  ).run(tx5Id, seed.crcAccountId, seed.groceriesEnvelopeId, 10);

  const secondRes = await requestJson('POST', '/api/reports/generate', {
    user_id: seed.userId,
    report_month: '2026-03',
    usd_to_crc_rate: 520,
    notes: 'Segunda versión',
  });

  assert.equal(secondRes.res.status, 201);
  assert.equal(secondRes.json.data.version, 2);
  assert.equal(secondRes.json.data.is_latest, 1);
  assert.equal(secondRes.json.data.exchange_rate_id, null);
  assert.equal(secondRes.json.data.exchange_rate_used, 520);
  assert.equal(secondRes.json.data.total_crc, 75010);
  assert.equal(secondRes.json.data.total_usd, 200);
  assert.equal(secondRes.json.data.consolidated_amount, 179010);

  const snapshots = db
    .prepare(
      'SELECT id, version, is_latest, total_crc, exchange_rate_used FROM report_snapshot WHERE user_id = ? AND report_month = ? ORDER BY version ASC',
    )
    .all(seed.userId, '2026-03') as Array<Record<string, any>>;

  assert.equal(snapshots.length, 2);
  assert.deepEqual(
    snapshots.map((snapshot) => ({
      version: snapshot.version,
      is_latest: snapshot.is_latest,
      total_crc: snapshot.total_crc,
      exchange_rate_used: snapshot.exchange_rate_used,
    })),
    [
      { version: 1, is_latest: 0, total_crc: 75000, exchange_rate_used: 510 },
      { version: 2, is_latest: 1, total_crc: 75010, exchange_rate_used: 520 },
    ],
  );
});

test('POST /api/reports/generate still creates a snapshot when no exchange rate is available', async () => {
  const seed = seedReportBase();

  const res = await requestJson('POST', '/api/reports/generate', {
    user_id: seed.userId,
    report_month: '2026-04',
    notes: 'Sin tasa',
  });

  assert.equal(res.res.status, 201);
  assert.equal(res.json.data.base_currency, 'CRC');
  assert.equal(res.json.data.exchange_rate_id, null);
  assert.equal(res.json.data.exchange_rate_used, null);
  assert.equal(res.json.data.consolidated_amount, null);
});

test('POST /api/reports/generate auto-fetches and stores a month-end exchange rate when none is provided', async () => {
  const seed = seedReportBase();
  db.prepare('DELETE FROM exchange_rate WHERE id = ?').run(seed.usdToCrcRateId);
  db.prepare('DELETE FROM exchange_rate WHERE id = ?').run(seed.crcToUsdRateId);
  const { ExchangeRateService } = await import('../src/services/exchange-rate.service');

  const originalGetByDate = ExchangeRateService.prototype.getByDate;
  ExchangeRateService.prototype.getByDate = async () => ({
    compra: 505.25,
    venta: 512.5,
    fecha: '2026-03-31',
  });

  try {
    const res = await requestJson('POST', '/api/reports/generate', {
      user_id: seed.userId,
      report_month: '2026-03',
      notes: 'Auto fetch rate',
    });

    assert.equal(res.res.status, 201);
    assert.equal(res.json.data.exchange_rate_used, 505.25);
    assert.ok(res.json.data.exchange_rate_id);
    assert.equal(res.json.data.consolidated_amount, 176050);

    const storedRate = db
      .prepare(
        'SELECT from_currency, to_currency, rate, effective_date FROM exchange_rate ORDER BY from_currency ASC',
      )
      .all() as Array<Record<string, any>>;

    assert.deepEqual(storedRate, [
      {
        from_currency: 'CRC',
        to_currency: 'USD',
        rate: 512.5,
        effective_date: '2026-03-31',
      },
      {
        from_currency: 'USD',
        to_currency: 'CRC',
        rate: 505.25,
        effective_date: '2026-03-31',
      },
    ]);
  } finally {
    ExchangeRateService.prototype.getByDate = originalGetByDate;
  }
});

test('POST /api/reports/generate returns 404 when the exchange rate does not exist', async () => {
  const seed = seedReportBase();

  const res = await requestJson('POST', '/api/reports/generate', {
    user_id: seed.userId,
    report_month: '2026-03',
    exchange_rate_id: 999999,
  });

  assert.equal(res.res.status, 404);
  assert.equal(res.json.error.code, 'NOT_FOUND');
});

test('POST /api/reports/generate uses one consolidated amount in the user base currency USD', async () => {
  const seed = seedReportBase('USD');

  const res = await requestJson('POST', '/api/reports/generate', {
    user_id: seed.userId,
    report_month: '2026-03',
    exchange_rate_id: seed.usdToCrcRateId,
  });

  assert.equal(res.res.status, 201);
  assert.equal(res.json.data.base_currency, 'USD');
  assert.equal(res.json.data.exchange_rate_used, 520);
  assert.equal(res.json.data.exchange_rate_id, seed.crcToUsdRateId);
  assert.ok(Math.abs(res.json.data.consolidated_amount - 344.2307692307692) < 0.000001);
});
test('GET /api/reports excludes archived snapshots and PATCH /api/reports/:id/archive promotes the previous version', async () => {
  const seed = seedReportBase();

  const firstRes = await requestJson('POST', '/api/reports/generate', {
    user_id: seed.userId,
    report_month: '2026-03',
    exchange_rate_id: seed.usdToCrcRateId,
  });
  const secondRes = await requestJson('POST', '/api/reports/generate', {
    user_id: seed.userId,
    report_month: '2026-03',
    usd_to_crc_rate: 520,
  });

  const latestSnapshotId = secondRes.json.data.id as number;

  const archiveRes = await requestJson('PATCH', `/api/reports/${latestSnapshotId}/archive`, {
    user_id: seed.userId,
  });

  assert.equal(archiveRes.res.status, 200);
  assert.equal(archiveRes.json.message, 'Report snapshot archived successfully');
  assert.equal(archiveRes.json.data.status, 'ARCHIVED');
  assert.equal(archiveRes.json.data.is_latest, 0);

  const listRes = await requestJson('GET', `/api/reports?userId=${seed.userId}`);
  assert.equal(listRes.res.status, 200);
  assert.equal(listRes.json.length, 1);
  assert.equal(listRes.json[0].id, firstRes.json.data.id);
  assert.equal(listRes.json[0].is_latest, 1);

  const archivedRes = await requestJson(
    'GET',
    `/api/reports?userId=${seed.userId}&includeArchived=true`,
  );
  assert.equal(archivedRes.res.status, 200);
  assert.equal(archivedRes.json.length, 2);
  assert.equal(
    archivedRes.json.some((snapshot: Record<string, unknown>) => snapshot.status === 'ARCHIVED'),
    true,
  );

  const storedSnapshots = db
    .prepare(
      'SELECT id, version, is_latest, status FROM report_snapshot WHERE user_id = ? ORDER BY version ASC',
    )
    .all(seed.userId) as Array<Record<string, any>>;

  assert.deepEqual(storedSnapshots, [
    { id: firstRes.json.data.id, version: 1, is_latest: 1, status: 'FINALIZED' },
    { id: secondRes.json.data.id, version: 2, is_latest: 0, status: 'ARCHIVED' },
  ]);
});
