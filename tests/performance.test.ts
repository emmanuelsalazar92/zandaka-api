import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import {
  instrumentDatabase,
  measureRouter,
  PerformanceWindow,
  queryLabel,
} from '../src/performance';

test('normalization groups values and retains only known table names', () => {
  const a = queryLabel("SELECT * FROM account WHERE name = 'PRIVATE' AND id IN (1, 2)", true);
  const b = queryLabel('select * from "account" where name = ? and id in (?, ?, ?)', true);
  assert.deepEqual(a, b);
  assert.deepEqual(a.tables, ['account']);
  assert.equal(
    queryLabel('WITH x AS (SELECT * FROM account) DELETE FROM category', false).operation,
    'write',
  );
  assert.doesNotMatch(JSON.stringify(a), /PRIVATE|SELECT/);
});

test('counts prepared executions and ranks frequent reads above slower, rare writes', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE account (name TEXT)');
    db.function('delay', () => {
      const end = performance.now() + 2;
      while (performance.now() < end) {
        /* Synthetic workload only. */
      }
      return 'PRIVATE';
    });
    const collector = new PerformanceWindow(1);
    instrumentDatabase(db, collector);
    const read = db.prepare('SELECT * FROM account WHERE name = ?');
    const write = db.prepare('INSERT INTO account VALUES (delay())');
    for (let i = 0; i < 120; i++) read.all('PRIVATE');
    for (let i = 0; i < 20; i++) write.run();
    const result = collector.drain();
    assert.deepEqual(
      result.ranking.map((row) => row.count),
      [120, 20],
    );
    assert.ok(result.ranking[0].meanMs! < result.ranking[1].meanMs!);
    assert.notEqual(result.ranking[0].p95UpperMs, null);
    assert.equal(result.ranking[1].p95UpperMs, null);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|INSERT|SELECT/);
    assert.deepEqual(collector.drain().ranking, []);
  } finally {
    db.close();
  }
});

test('HTTP uses the matched route template and disabled capture adds no handler', () => {
  assert.deepEqual(measureRouter('/api/accounts', null), []);
  const collector = new PerformanceWindow(1);
  const [middleware] = measureRouter('/api/accounts', collector);
  const response = new EventEmitter() as unknown as Response;
  const request = {
    method: 'GET',
    originalUrl: '/api/accounts/123?search=PRIVATE',
  } as Request;
  middleware(request, response, () => {
    request.route = { path: '/:id' };
    response.emit('finish');
  });
  const [row] = collector.drain().ranking;
  assert.equal(row.id, 'GET /api/accounts/:id');
  assert.equal(row.count, 1);
  assert.doesNotMatch(JSON.stringify(row), /PRIVATE|123/);
});
