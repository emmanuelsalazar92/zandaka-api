import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer';
import { installProjectMovements } from '../src/db/project';
import { ProjectService } from '../src/services/project.service';
import { createSyntheticDb } from './helpers/synthetic-db';

test('project PDF uses the analyzed amounts, checks scope and releases the renderer after timeout', async (t) => {
  const file = path.join(os.tmpdir(), `project-pdf-${randomUUID()}.db`);
  process.env.DB_PATH = file;
  delete process.env.ZANDAKA_PROJECT_OWNER_ID;
  createSyntheticDb(file);
  const { db } = await import('../src/db/db');
  const { createApp } = await import('../src/app');
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  let html = '';
  let mode: 'ready' | 'blocked' | 'failure' = 'ready';
  let closed = 0;
  let notifyStart: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    notifyStart = resolve;
  });
  const timeout = new AbortController();
  const nativeTimeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, 'timeout', (ms: number) =>
    ms === 20_000 && mode === 'blocked' ? timeout.signal : nativeTimeout(ms),
  );
  const launcher = t.mock.method(
    puppeteer,
    'launch',
    async (options?: LaunchOptions) =>
      ({
        newPage: async () => ({
          setJavaScriptEnabled: async (enabled: boolean) => assert.equal(enabled, false),
          setRequestInterception: async (enabled: boolean) => assert.equal(enabled, true),
          on: () => undefined,
          setContent: async (value: string) => {
            html = value;
          },
          emulateMediaType: async () => undefined,
          evaluate: async () => undefined,
          pdf: async () => {
            if (mode === 'failure') throw new Error('Chromium failed');
            if (mode === 'blocked') {
              const signal = options?.signal;
              assert.ok(signal);
              assert.equal(options?.timeout, 20_000);
              return new Promise<never>((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                notifyStart();
              });
            }
            return Buffer.from('%PDF-1.7\nSynthetic project report\n');
          },
        }),
        close: async () => {
          closed++;
        },
      }) as unknown as Browser,
  );

  try {
    installProjectMovements(db);
    db.exec(`
      INSERT INTO user(id,name,base_currency) VALUES(1,'QA','CRC'),(2,'Otro','CRC');
      INSERT INTO institution(id,user_id,name,type) VALUES(1,1,'Banco sintético','BANK');
      INSERT INTO account(id,user_id,institution_id,name,currency)
        VALUES(1,1,1,'Lote CRC','CRC'),(2,1,1,'Lote USD','USD');
      INSERT INTO category(id,user_id,name) VALUES(1,1,'Materiales & señalización'),(2,1,'Permisos');
      INSERT INTO account_envelope(id,account_id,category_id,is_active) VALUES(1,1,1,1),(2,1,2,1),(3,2,2,1);
      INSERT INTO transactions(id,user_id,date,description,type) VALUES
        (100,1,'2026-11-12','Materiales <lote>','EXPENSE'),
        (101,1,'2026-11-13','Trámite en USD','EXPENSE'),
        (102,1,'2026-11-14','Devolución','INCOME'),
        (103,1,'2026-11-15','Traslado fuera del costo','TRANSFER');
      INSERT INTO transaction_line(id,transaction_id,account_id,envelope_id,amount) VALUES
        (1,100,1,1,-100),(2,100,1,2,-50),(3,101,2,3,-10),(4,102,1,1,20),(5,100,1,2,-999),
        (6,103,1,1,-500),(7,103,1,2,500);
    `);
    const ledger = db.prepare('SELECT * FROM transaction_line ORDER BY id').all();
    const other = new ProjectService(db, 2).create('Privado');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) =>
      server!.once('listening', resolve).once('error', reject),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects`;
    const send = (suffix: string, body: object) =>
      fetch(base + suffix, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const title = 'Construcción de señalización y acceso al lote Norte <Etapa & revisión>';
    const created = await send('', { title });
    assert.equal(created.status, 201);
    const { id } = (await created.json()) as { id: string };
    const scope = '/' + id;
    const pdfUrl = base + scope + '/pdf';
    assert.equal((await fetch(base + '/' + other.id + '/pdf')).status, 404);
    assert.equal((await fetch(pdfUrl + '?userId=2')).status, 400);
    assert.equal(launcher.mock.callCount(), 0);

    const empty = await fetch(pdfUrl);
    assert.equal(empty.status, 200);
    await empty.arrayBuffer();
    assert.match(html, /Sin movimientos/);
    assert.match(html, />Activo<\/div>/);
    assert.equal(
      (
        await send(scope + '/movements', {
          expectedRevision: 1,
          lineIds: [1, 2, 3],
          kind: 'expense',
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await send(scope + '/movements', {
          expectedRevision: 2,
          lineIds: [4],
          kind: 'refund',
        })
      ).status,
      200,
    );
    const analysisResponse = await fetch(base + scope + '/analysis');
    const analysis = (await analysisResponse.json()) as {
      currencies: { currency: string; net: string }[];
    };
    assert.deepEqual(
      analysis.currencies.map(({ currency, net }) => [currency, net]),
      [
        ['CRC', '130'],
        ['USD', '10'],
      ],
    );
    assert.equal((await send(scope + '/finalize', { expectedRevision: 3 })).status, 200);
    const finalized = await fetch(pdfUrl);
    assert.equal(finalized.status, 200);
    assert.equal(finalized.headers.get('content-type'), 'application/pdf');
    assert.equal(finalized.headers.get('cache-control'), 'private, no-store');
    assert.match(
      finalized.headers.get('content-disposition') ?? '',
      /^attachment; filename="?zandaka-proyecto-[a-z0-9-]+\.pdf"?$/,
    );
    assert.equal(
      Buffer.from(await finalized.arrayBuffer())
        .subarray(0, 5)
        .toString(),
      '%PDF-',
    );
    assert.match(html, /Finalizado/);
    assert.match(html, /Cierre/);
    assert.match(html, /12\/11\/2026 al 14\/11\/2026/);
    assert.match(html, /&lt;Etapa &amp; revisión&gt;/);
    assert.match(html, /Materiales &lt;lote&gt;/);
    assert.match(html, /₡ 130,00/);
    assert.match(html, /\$ 10,00/);
    assert.doesNotMatch(html, /999,00/);
    assert.doesNotMatch(html, /Traslado fuera del costo/);
    assert.ok(html.indexOf('Materiales &lt;lote&gt;') < html.indexOf('Trámite en USD'));
    assert.ok(html.indexOf('Trámite en USD') < html.indexOf('Devolución'));
    assert.equal((await send(scope + '/archive', { expectedRevision: 4 })).status, 200);
    const archived = await fetch(pdfUrl);
    assert.equal(archived.status, 200);
    await archived.arrayBuffer();
    assert.match(html, /Finalizado · Archivado/);
    assert.equal((await send(scope + '/restore', { expectedRevision: 5 })).status, 200);
    const restored = await fetch(pdfUrl);
    assert.equal(restored.status, 200);
    await restored.arrayBuffer();
    assert.doesNotMatch(html, /Finalizado · Archivado/);
    assert.deepEqual(db.prepare('SELECT * FROM transaction_line ORDER BY id').all(), ledger);

    mode = 'blocked';
    const pending = fetch(pdfUrl);
    await started;
    const busy = await fetch(pdfUrl);
    assert.equal(busy.status, 503);
    assert.equal(((await busy.json()) as { error: { code: string } }).error.code, 'PDF_BUSY');
    const priorClosed = closed;
    timeout.abort();
    const timedOut = await pending;
    assert.equal(timedOut.status, 504);
    assert.equal(
      ((await timedOut.json()) as { error: { code: string } }).error.code,
      'PDF_TIMEOUT',
    );
    assert.equal(closed, priorClosed + 1);
    mode = 'failure';
    assert.equal((await fetch(pdfUrl)).status, 500);
    mode = 'ready';
    assert.equal((await fetch(pdfUrl)).status, 200);

    const insertLine = db.prepare(
      'INSERT INTO transaction_line(id,transaction_id,account_id,envelope_id,amount) VALUES(?,100,1,1,-1)',
    );
    const insertLink = db.prepare("INSERT INTO project_transaction_line VALUES(?,?,'expense')");
    db.transaction(() => {
      for (let n = 8; n <= 2004; n++) {
        insertLine.run(n);
        insertLink.run(id, n);
      }
    })();
    const renders = launcher.mock.callCount();
    const limited = await fetch(pdfUrl);
    assert.equal(limited.status, 422);
    assert.equal(
      ((await limited.json()) as { error: { code: string } }).error.code,
      'PROJECT_PDF_LIMIT',
    );
    assert.equal(launcher.mock.callCount(), renders);
  } finally {
    timeout.abort();
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    db.close();
    fs.rmSync(file, { force: true });
  }
});
