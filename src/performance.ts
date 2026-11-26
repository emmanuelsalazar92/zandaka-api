import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Database } from 'better-sqlite3';
import type { RequestHandler } from 'express';

const tables = new Set([
  'user',
  'institution',
  'account',
  'category',
  'account_envelope',
  'transactions',
  'transaction_line',
  'reconciliation',
  'cash_denomination',
  'cash_reconciliation_detail',
  'exchange_rate',
  'budget',
  'budget_line',
  'budget_plan',
  'transfer_request',
  'auto_assignment_rule',
  'report_snapshot',
  'report_snapshot_line',
  'payroll_rule_set',
  'payroll_ccss_worker_rate',
  'payroll_income_tax_bracket',
]);
const limits = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 5000];
const windowMs = 60_000;
const cap = 512;

export function queryLabel(sql: string, readonly: boolean) {
  const tokens =
    sql.match(
      /--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|(?:[:@$][a-z_]\w*|\?\d*)|0x[\da-f]+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z_]\w*|[^\s]/gi,
    ) ?? [];
  const normalized = tokens
    .filter((token) => !token.startsWith('--') && !token.startsWith('/*'))
    .map((token) => {
      if (/^[':\x40$?\d]|^\.\d/.test(token)) return '?';
      if (/^["`\[]/.test(token)) {
        const identifier = token.slice(1, -1).toLowerCase();
        return tables.has(identifier) ? identifier : '?';
      }
      return token.toLowerCase();
    });
  const referenced = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    if (!['from', 'join', 'into', 'update'].includes(normalized[i])) continue;
    const name = normalized[i + (normalized[i + 2] === '.' ? 3 : 1)];
    if (tables.has(name)) referenced.add(name);
  }
  const template = normalized.join(' ').replace(/\?(?: , \?)+/g, '?');
  return {
    operation: readonly ? 'read' : 'write',
    tables: [...referenced].sort(),
    id: createHash('sha256')
      .update((readonly ? 'read:' : 'write:') + template)
      .digest('hex')
      .slice(0, 24),
  };
}

type Label = { kind: 'sql' | 'http'; id: string; operation?: string; tables?: string[] };
type Row = Label & { count: number; samples: number; totalSampleMs: number; buckets: number[] };

export class PerformanceWindow {
  private rows = new Map<string, Row>();
  private dropped = 0;

  constructor(readonly sampleRate: number) {}

  sample() {
    return Math.random() < this.sampleRate ? performance.now() : undefined;
  }

  observe(label: Label, start: number | undefined) {
    const key = label.kind + ':' + label.id;
    let row = this.rows.get(key);
    if (!row) {
      if (this.rows.size >= cap) {
        this.dropped++;
        return;
      }
      row = {
        ...label,
        count: 0,
        samples: 0,
        totalSampleMs: 0,
        buckets: Array(limits.length + 1).fill(0),
      };
      this.rows.set(key, row);
    }
    row.count++;
    if (start === undefined) return;
    const duration = performance.now() - start;
    row.samples++;
    row.totalSampleMs += duration;
    const bucket = limits.findIndex((bound) => duration <= bound);
    row.buckets[bucket < 0 ? limits.length : bucket]++;
  }

  drain() {
    const ranking = [...this.rows.values()]
      .map(({ buckets, ...row }) => {
        function percentile(p: number, minimum: number) {
          if (row.samples < minimum) return null;
          let cumulative = 0;
          for (let i = 0; i < buckets.length; i++) {
            cumulative += buckets[i];
            if (cumulative >= Math.ceil(row.samples * p)) return limits[i] ?? '>5000';
          }
          return null;
        }
        return {
          ...row,
          meanMs: row.samples ? row.totalSampleMs / row.samples : null,
          p50UpperMs: percentile(0.5, 20),
          p95UpperMs: percentile(0.95, 100),
        };
      })
      .sort((a, b) => b.count - a.count);
    const dropped = this.dropped;
    this.rows.clear();
    this.dropped = 0;
    const tableCounts = new Map<string, { table: string; reads: number; writes: number }>();
    for (const row of ranking) {
      for (const table of row.tables ?? []) {
        const counts = tableCounts.get(table) ?? { table, reads: 0, writes: 0 };
        counts[row.operation === 'write' ? 'writes' : 'reads'] += row.count;
        tableCounts.set(table, counts);
      }
    }
    const tableRanking = [...tableCounts.values()].sort(
      (a, b) => b.reads + b.writes - a.reads - a.writes,
    );
    return { dropped, ranking, tableRanking };
  }
}

const configuredRate = Number(process.env.ZANDAKA_PERF_SAMPLE_RATE ?? 0.1);
const metrics =
  process.env.ZANDAKA_PERF_ENABLED === 'true' &&
  Number.isFinite(configuredRate) &&
  configuredRate >= 0 &&
  configuredRate <= 1
    ? new PerformanceWindow(configuredRate)
    : null;

export function instrumentDatabase(db: Database, collector = metrics) {
  if (!collector) return;
  const prepare = db.prepare;
  db.prepare = function (this: Database, sql: string) {
    const statement = prepare.call(this, sql);
    const query: Label = { kind: 'sql', ...queryLabel(sql, statement.readonly) };
    for (const method of ['get', 'all', 'run'] as const) {
      const execute = statement[method];
      Object.defineProperty(statement, method, {
        value(this: typeof statement, ...args: unknown[]) {
          const start = collector.sample();
          try {
            return Reflect.apply(execute, this, args);
          } finally {
            collector.observe(query, start);
          }
        },
      });
    }
    return statement;
  } as Database['prepare'];
}

export function measureRouter(prefix: string, collector = metrics): RequestHandler[] {
  if (!collector) return [];
  return [
    (req, res, next) => {
      const start = collector.sample();
      const method = req.method;
      res.once('finish', () => {
        const path: unknown = req.route?.path;
        if (
          typeof path === 'string' &&
          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)
        )
          collector.observe(
            { kind: 'http', id: method + ' ' + prefix + (path === '/' ? '' : path) },
            start,
          );
      });
      next();
    },
  ];
}

export function startPerformanceLogging() {
  if (!metrics) return;
  let from = new Date().toISOString();
  setInterval(() => {
    const to = new Date().toISOString();
    const report = metrics.drain();
    console.log(
      JSON.stringify({
        event: 'zandaka_performance',
        from,
        to,
        sampleRate: metrics.sampleRate,
        ...report,
      }),
    );
    from = to;
  }, windowMs).unref();
}
