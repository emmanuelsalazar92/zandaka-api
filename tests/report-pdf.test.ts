import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createSyntheticDb } from './helpers/synthetic-db';

const testDbPath = path.join(os.tmpdir(), `report-pdf-test-${Date.now()}.db`);
process.env.DB_PATH = testDbPath;
createSyntheticDb(testDbPath);

let db: any;
let baseUrl = '';
let server: any;

async function requestPdf(url: string) {
  const res = await fetch(`${baseUrl}${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  let json: any = null;
  try {
    json = JSON.parse(buffer.toString('utf8'));
  } catch {
    json = null;
  }

  return { res, buffer, json };
}

function seedSnapshot() {
  const userId = db
    .prepare('INSERT INTO user (name, base_currency) VALUES (?, ?)')
    .run('PDF User', 'CRC').lastInsertRowid as number;
  const snapshotId = db
    .prepare(
      `
        INSERT INTO report_snapshot (
          user_id,
          report_month,
          base_currency,
          total_crc,
          total_usd,
          exchange_rate_used,
          consolidated_amount,
          version,
          is_latest,
          notes,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      userId,
      '2026-03',
      'CRC',
      1250000,
      2430,
      512.34,
      2495986.2,
      2,
      1,
      'Executive PDF snapshot',
      'FINALIZED',
    ).lastInsertRowid as number;

  const insertLine = db.prepare(
    `
      INSERT INTO report_snapshot_line (
        report_snapshot_id,
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
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );

  insertLine.run(
    snapshotId,
    'ACCOUNT_TOTAL',
    1,
    'BAC Ahorros',
    'CRC',
    null,
    null,
    null,
    null,
    850000,
    0,
  );
  insertLine.run(
    snapshotId,
    'ENVELOPE_TOTAL',
    1,
    'BAC Ahorros',
    'CRC',
    10,
    'Supermercado',
    10,
    'Supermercado',
    120000,
    1,
  );
  insertLine.run(
    snapshotId,
    'ENVELOPE_TOTAL',
    1,
    'BAC Ahorros',
    'CRC',
    11,
    'Transporte',
    11,
    'Transporte',
    80000,
    2,
  );

  return snapshotId;
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

test('GET /api/reports/:id/pdf returns a PDF attachment generated from the stored snapshot', async () => {
  const { PdfRenderer } = await import('../src/utils/pdf.util');
  const originalRender = PdfRenderer.prototype.renderHtmlToPdf;
  let capturedHtml = '';
  let capturedFooter = '';

  PdfRenderer.prototype.renderHtmlToPdf = async function (html: string, footerLabel: string) {
    capturedHtml = html;
    capturedFooter = footerLabel;
    return Buffer.from('%PDF-FAKE%');
  };

  try {
    const snapshotId = seedSnapshot();
    const response = await requestPdf(`/api/reports/${snapshotId}/pdf`);

    assert.equal(response.res.status, 200);
    assert.equal(response.res.headers.get('content-type'), 'application/pdf');
    assert.equal(
      response.res.headers.get('content-disposition'),
      'attachment; filename="zandaka-report-2026-03-v2.pdf"',
    );
    assert.equal(response.buffer.toString('utf8'), '%PDF-FAKE%');
    assert.match(capturedHtml, /Tu resumen financiero/);
    assert.match(capturedHtml, /Mes de referencia/);
    assert.match(capturedHtml, /no acredita un cierre contable/);
    assert.match(capturedHtml, /size: letter/);
    assert.match(capturedHtml, /BAC Ahorros/);
    assert.match(capturedHtml, /Executive PDF snapshot/);
    assert.doesNotMatch(capturedHtml, /::before/);
    assert.match(capturedFooter, /2026-03/);
  } finally {
    PdfRenderer.prototype.renderHtmlToPdf = originalRender;
  }
});

test('GET /api/reports/:id/pdf returns 404 when the snapshot does not exist', async () => {
  const response = await requestPdf('/api/reports/999999/pdf');

  assert.equal(response.res.status, 404);
  assert.equal(response.json.error.code, 'NOT_FOUND');
});

test('HTML report uses the stored snapshot, escapes user text and blocks active content', async () => {
  const snapshotId = seedSnapshot();
  db.prepare('UPDATE report_snapshot SET notes = ? WHERE id = ?').run(
    '<script>alert("unsafe")</script>',
    snapshotId,
  );
  const response = await fetch(`${baseUrl}/api/reports/${snapshotId}/html`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /BAC Ahorros/);
  assert.match(html, /no acredita un cierre contable/);
});

test('HTML report returns 404 for an absent snapshot', async () => {
  const response = await fetch(`${baseUrl}/api/reports/999999/html`);
  assert.equal(response.status, 404);
});
