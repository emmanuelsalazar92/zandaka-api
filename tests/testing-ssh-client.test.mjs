import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ClientError, PROTOCOL, runClient } from '../scripts/testing-ssh-client.mjs';

const API = `sha256:${'a'.repeat(64)}`,
  WEB = `sha256:${'b'.repeat(64)}`,
  PLAN = `sha256:${'c'.repeat(64)}`;
const PREVIOUS = { apiDigest: `sha256:${'d'.repeat(64)}`, webDigest: `sha256:${'e'.repeat(64)}` };
const ID = '11111111-1111-4111-8111-111111111111',
  ROLLBACK = '22222222-2222-4222-8222-222222222222';
const plan = () => ({
  protocol: PROTOCOL,
  action: 'plan',
  ok: true,
  readOnly: true,
  planId: PLAN,
  target: { apiDigest: API, webDigest: WEB },
});
const queued = (action = 'deploy') => ({
  protocol: PROTOCOL,
  action,
  ok: true,
  requestId: ID,
  phase: 'queued',
  terminal: false,
});
const complete = () => ({
  protocol: PROTOCOL,
  action: 'status',
  ok: true,
  requestId: ID,
  phase: 'succeeded',
  terminal: true,
  result: {
    apiDigest: API,
    webDigest: WEB,
    health: { api: true, web: true, proxy: true },
    database: { transferRequestReady: true, historicalUnchanged: true },
    backup: { sha256: 'f'.repeat(64) },
    previous: PREVIOUS,
  },
});

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zandaka-ssh-client-'));
  t.after(() => {
    assert.ok(
      path.resolve(dir).startsWith(path.join(path.resolve(os.tmpdir()), 'zandaka-ssh-client-')),
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    stateRoot: dir,
    transport: async () => {
      throw Error('Unexpected transport call');
    },
  };
}
async function prepare(t) {
  const context = fixture(t);
  context.transport = async () => JSON.stringify(plan());
  await runClient(['plan', API, WEB], context);
  return context;
}
const rejected = (promise, code) =>
  assert.rejects(promise, (error) => error instanceof ClientError && error.code === code);

test('probe validates the existing fixed response without a mutating command', async (t) => {
  const context = fixture(t);
  context.transport = async (command) => {
    assert.equal(command, 'probe');
    return 'ZANDAKA_TESTING_SSH_PROBE_V1\r\nuser=emmanuelsalazar\r\ncompose_readable=true\r\n';
  };
  assert.equal((await runClient(['probe'], context)).readOnly, true);
  context.transport = async () => 'partial';
  await rejected(runClient(['probe'], context), 'UNVERIFIABLE_RESPONSE');
});

test('invalid verbs, digests, UUIDs and shell tokens never reach SSH', async (t) => {
  const context = fixture(t);
  let calls = 0;
  context.transport = async () => {
    calls++;
  };
  for (const argv of [
    ['sh'],
    ['inspect', 'id'],
    ['plan', `${API};id`, WEB],
    ['plan', `${API}\n`, WEB],
    ['plan', API, `${WEB}\r\n`],
    ['plan', API.toUpperCase(), WEB],
    ['plan', API, WEB, 'unknown'],
    ['plan', API, WEB, 'za90-za97;id'],
    ['plan', API, WEB, 'za90-za97\n'],
    ['plan', API, WEB, 'za90-za97', 'extra'],
    ['deploy', '../../private'],
    ['deploy', PLAN, 'bad-id'],
    ['status', '$(id)'],
    ['status', `${ID}\n`],
    ['rollback', ID, `${ROLLBACK};id`],
  ]) {
    await rejected(runClient(argv, context), 'INVALID_ARGUMENTS');
  }
  assert.equal(calls, 0);
});

test('inspect must be read-only and does not accept environment or secret fields', async (t) => {
  const context = fixture(t);
  context.transport = async () =>
    JSON.stringify({
      protocol: PROTOCOL,
      action: 'inspect',
      ok: true,
      readOnly: true,
      services: { api: 'example-api' },
    });
  assert.equal((await runClient(['inspect'], context)).readOnly, true);
  context.transport = async () =>
    JSON.stringify({
      protocol: PROTOCOL,
      action: 'inspect',
      ok: true,
      readOnly: true,
      nested: { environment: { SECRET: 'do-not-print' } },
    });
  await rejected(runClient(['inspect'], context), 'UNSAFE_RESPONSE_FIELDS');
});

test('a plan of another target is rejected and never persisted', async (t) => {
  const context = fixture(t);
  context.transport = async () => JSON.stringify({ ...plan(), target: PREVIOUS });
  await rejected(runClient(['plan', API, WEB], context), 'UNVERIFIABLE_RESPONSE');
  assert.equal(fs.existsSync(path.join(context.stateRoot, 'plans')), false);
});

test('deployment requires a recorded matching plan and saves its UUID before transport', async (t) => {
  const context = await prepare(t);
  context.transport = async (command) => {
    assert.equal(command, `deploy ${ID} ${API} ${WEB} ${PLAN} za90`);
    const stored = JSON.parse(
      fs.readFileSync(path.join(context.stateRoot, 'requests', `${ID}.json`)),
    );
    assert.equal(stored.request.requestId, ID);
    assert.equal(stored.lastAttempt, 'not_confirmed');
    return JSON.stringify(queued());
  };
  const result = await runClient(['deploy', PLAN, ID], context);
  assert.equal(result.phase, 'queued');
  assert.equal(result.terminal, false);
});

test('lost confirmation retains the request and reuses exactly the same intent', async (t) => {
  const context = await prepare(t);
  const commands = [];
  context.transport = async (command) => {
    commands.push(command);
    throw Error('network timeout with sensitive diagnostics');
  };
  await assert.rejects(
    runClient(['deploy', PLAN, ID], context),
    (e) =>
      e.code === 'CONNECTION_UNCERTAIN' && e.requestId === ID && !e.message.includes('sensitive'),
  );
  const file = path.join(context.stateRoot, 'requests', `${ID}.json`);
  assert.equal(JSON.parse(fs.readFileSync(file)).lastAttempt, 'confirmation_unknown');
  context.transport = async (command) => {
    commands.push(command);
    return JSON.stringify(queued());
  };
  await runClient(['deploy', PLAN, ID], context);
  assert.equal(commands[0], commands[1]);
});

test('one UUID cannot be reused with a different plan even when images match', async (t) => {
  const context = await prepare(t);
  context.transport = async () => JSON.stringify(queued());
  await runClient(['deploy', PLAN, ID], context);
  const otherId = `sha256:${'1'.repeat(64)}`;
  context.transport = async () => JSON.stringify({ ...plan(), planId: otherId });
  await runClient(['plan', API, WEB], context);
  context.transport = async () => {
    assert.fail('Conflicting request reached SSH');
  };
  await rejected(runClient(['deploy', otherId, ID], context), 'REQUEST_ID_CONFLICT');
});

test('wrong request identity and premature terminal success cannot confirm deployment', async (t) => {
  const context = await prepare(t);
  context.transport = async () => JSON.stringify({ ...queued(), requestId: ROLLBACK });
  await rejected(runClient(['deploy', PLAN, ID], context), 'UNVERIFIABLE_RESPONSE');
  context.transport = async () => JSON.stringify({ ...queued(), terminal: true });
  await rejected(runClient(['deploy', PLAN, ID], context), 'UNVERIFIABLE_RESPONSE');
});

test('successful status requires image, backup, DB and health confirmations', async (t) => {
  const context = await prepare(t);
  context.transport = async () => JSON.stringify(queued());
  await runClient(['deploy', PLAN, ID], context);
  for (const change of [
    (r) => {
      r.result.webDigest = API;
    },
    (r) => {
      r.result.health.proxy = false;
    },
    (r) => {
      r.result.database.historicalUnchanged = false;
    },
    (r) => {
      r.result.backup.sha256 = '';
    },
    (r) => {
      r.result.previous = {};
    },
  ]) {
    const value = complete();
    change(value);
    context.transport = async () => JSON.stringify(value);
    await rejected(runClient(['status', ID], context), 'UNVERIFIABLE_RESPONSE');
  }
  context.transport = async () => JSON.stringify(complete());
  assert.equal((await runClient(['status', ID], context)).phase, 'succeeded');
});

test('rollback binds the previous recorded pair and must preserve the current database', async (t) => {
  const context = await prepare(t);
  context.transport = async () => JSON.stringify(queued());
  await runClient(['deploy', PLAN, ID], context);
  context.transport = async () => JSON.stringify(complete());
  await runClient(['status', ID], context);
  context.transport = async (command) => {
    assert.equal(command, `rollback ${ROLLBACK} ${ID}`);
    return JSON.stringify({ ...queued('rollback'), requestId: ROLLBACK });
  };
  await runClient(['rollback', ID, ROLLBACK], context);
  const reply = {
    protocol: PROTOCOL,
    ok: true,
    action: 'status',
    requestId: ROLLBACK,
    phase: 'succeeded',
    terminal: true,
    result: {
      ...PREVIOUS,
      health: { api: true, web: true, proxy: true },
      rollbackOf: ID,
      databaseRestored: false,
    },
  };
  context.transport = async () =>
    JSON.stringify({ ...reply, result: { ...reply.result, databaseRestored: true } });
  await rejected(runClient(['status', ROLLBACK], context), 'UNVERIFIABLE_RESPONSE');
  context.transport = async () => JSON.stringify(reply);
  assert.equal((await runClient(['status', ROLLBACK], context)).phase, 'succeeded');
});

test('malformed confirmation never leaks its content and leaves an uncertain intent', async (t) => {
  const context = await prepare(t);
  context.transport = async () => 'invalid-json-private-data';
  await assert.rejects(
    runClient(['deploy', PLAN, ID], context),
    (e) =>
      e.code === 'INVALID_REMOTE_JSON' && e.requestId === ID && !e.message.includes('private-data'),
  );
});

test('missing plans and rollback receipts never call the server', async (t) => {
  const context = fixture(t);
  await rejected(runClient(['deploy', PLAN, ID], context), 'LOCAL_STATE_NOT_FOUND');
  await rejected(runClient(['rollback', ID, ROLLBACK], context), 'LOCAL_STATE_NOT_FOUND');
});

const budgetPlan = () => ({
  ...plan(),
  profile: 'za90-za97',
  preparations: ['transfer_request', 'budget_plan'],
});
const budgetComplete = () => {
  const reply = complete();
  reply.profile = 'za90-za97';
  reply.result.profile = 'za90-za97';
  Object.assign(reply.result.database, {
    profile: 'za90-za97',
    budgetPlanReady: true,
    auxiliaryHistoryUnchanged: true,
    created: false,
    budgetPlanCreated: true,
    budgetPlanState: 'created',
  });
  return reply;
};
async function prepareBudget(t) {
  const context = fixture(t);
  context.transport = async (command) => {
    assert.equal(command, `plan ${API} ${WEB} za90-za97`);
    return JSON.stringify(budgetPlan());
  };
  await runClient(['plan', API, WEB, 'za90-za97'], context);
  return context;
}
test('ZA97 plan binds the explicit profile and persists it before deployment transport', async (t) => {
  const context = await prepareBudget(t);
  context.transport = async (command) => {
    assert.equal(command, `deploy ${ID} ${API} ${WEB} ${PLAN} za90-za97`);
    const stored = JSON.parse(
      fs.readFileSync(path.join(context.stateRoot, 'requests', `${ID}.json`)),
    );
    assert.equal(stored.request.profile, 'za90-za97');
    assert.equal(stored.lastAttempt, 'not_confirmed');
    return JSON.stringify({ ...queued(), profile: 'za90-za97' });
  };
  assert.equal((await runClient(['deploy', PLAN, ID], context)).phase, 'queued');
});
test('ZA97 rejects downgrade, unknown profile and incomplete or reordered preparations before storing a plan', async (t) => {
  const context = fixture(t);
  for (const value of [
    plan(),
    { ...budgetPlan(), profile: 'za90' },
    { ...budgetPlan(), profile: 'unknown' },
    { ...budgetPlan(), preparations: ['transfer_request'] },
    { ...budgetPlan(), preparations: ['budget_plan', 'transfer_request'] },
    { ...budgetPlan(), profile: null },
  ]) {
    context.transport = async () => JSON.stringify(value);
    await rejected(runClient(['plan', API, WEB, 'za90-za97'], context), 'UNVERIFIABLE_RESPONSE');
    assert.equal(fs.existsSync(path.join(context.stateRoot, 'plans')), false);
  }
});
test('ZA90 default cannot silently receive a ZA97 plan', async (t) => {
  const context = fixture(t);
  context.transport = async () => JSON.stringify(budgetPlan());
  await rejected(runClient(['plan', API, WEB], context), 'UNVERIFIABLE_RESPONSE');
});
test('ZA97 queued acknowledgement must identify the same profile', async (t) => {
  const context = await prepareBudget(t);
  for (const value of [queued(), { ...queued(), profile: 'za90' }]) {
    context.transport = async () => JSON.stringify(value);
    await rejected(runClient(['deploy', PLAN, ID], context), 'UNVERIFIABLE_RESPONSE');
  }
});
test('ZA97 success requires both schema confirmations, auxiliary preservation and consistent creation state', async (t) => {
  const context = await prepareBudget(t);
  context.transport = async () => JSON.stringify({ ...queued(), profile: 'za90-za97' });
  await runClient(['deploy', PLAN, ID], context);
  for (const change of [
    (r) => delete r.profile,
    (r) => (r.profile = 'za90'),
    (r) => delete r.result.profile,
    (r) => (r.result.database.profile = 'za90'),
    (r) => delete r.result.database.budgetPlanReady,
    (r) => (r.result.database.budgetPlanReady = false),
    (r) => delete r.result.database.auxiliaryHistoryUnchanged,
    (r) => (r.result.database.auxiliaryHistoryUnchanged = false),
    (r) => delete r.result.database.created,
    (r) => delete r.result.database.budgetPlanCreated,
    (r) => (r.result.database.budgetPlanState = 'compatible'),
  ]) {
    const reply = budgetComplete();
    change(reply);
    context.transport = async () => JSON.stringify(reply);
    await rejected(runClient(['status', ID], context), 'UNVERIFIABLE_RESPONSE');
  }
  for (const created of [true, false]) {
    const reply = budgetComplete();
    reply.result.database.budgetPlanCreated = created;
    reply.result.database.budgetPlanState = created ? 'created' : 'compatible';
    context.transport = async () => JSON.stringify(reply);
    assert.equal((await runClient(['status', ID], context)).phase, 'succeeded');
  }
});
test('ZA97 transport loss preserves exact intent across retry and status recovery', async (t) => {
  const context = await prepareBudget(t),
    commands = [];
  context.transport = async (command) => {
    commands.push(command);
    throw Error('lost ACK');
  };
  await rejected(runClient(['deploy', PLAN, ID], context), 'CONNECTION_UNCERTAIN');
  const file = path.join(context.stateRoot, 'requests', `${ID}.json`),
    original = JSON.parse(fs.readFileSync(file));
  context.transport = async (command) => {
    commands.push(command);
    return JSON.stringify({ ...queued(), profile: 'za90-za97' });
  };
  await runClient(['deploy', PLAN, ID], context);
  assert.equal(commands[0], commands[1]);
  context.transport = async (command) => {
    assert.equal(command, `status ${ID}`);
    return JSON.stringify(budgetComplete());
  };
  await runClient(['status', ID], context);
  const recovered = JSON.parse(fs.readFileSync(file));
  assert.deepEqual(recovered.request, original.request);
  assert.equal(recovered.requestHash, original.requestHash);
  assert.equal(recovered.lastAttempt, 'confirmed');
});
test('changing profile cannot reuse a prior request UUID even with the same target images', async (t) => {
  const context = await prepareBudget(t);
  context.transport = async () => JSON.stringify({ ...queued(), profile: 'za90-za97' });
  await runClient(['deploy', PLAN, ID], context);
  const other = `sha256:${'9'.repeat(64)}`;
  context.transport = async () => JSON.stringify({ ...plan(), planId: other });
  await runClient(['plan', API, WEB], context);
  context.transport = async () => assert.fail('Profile conflict reached SSH');
  await rejected(runClient(['deploy', other, ID], context), 'REQUEST_ID_CONFLICT');
});
test('tampered local profile fails before status transport', async (t) => {
  const context = await prepareBudget(t);
  context.transport = async () => JSON.stringify({ ...queued(), profile: 'za90-za97' });
  await runClient(['deploy', PLAN, ID], context);
  const file = path.join(context.stateRoot, 'requests', `${ID}.json`),
    record = JSON.parse(fs.readFileSync(file));
  record.request.profile = 'za90';
  fs.writeFileSync(file, JSON.stringify(record));
  context.transport = async () => assert.fail('Tampered intent reached SSH');
  await rejected(runClient(['status', ID], context), 'INVALID_LOCAL_REQUEST');
  await rejected(runClient(['rollback', ID, ROLLBACK], context), 'INVALID_ROLLBACK_SOURCE');
});
test('historical ZA90 request shape and hash survive a new-client status query', async (t) => {
  const context = await prepare(t);
  context.transport = async () => JSON.stringify(queued());
  await runClient(['deploy', PLAN, ID], context);
  const file = path.join(context.stateRoot, 'requests', `${ID}.json`),
    before = JSON.parse(fs.readFileSync(file));
  assert.equal(Object.hasOwn(before.request, 'profile'), false);
  context.transport = async () => JSON.stringify(complete());
  await runClient(['status', ID], context);
  const after = JSON.parse(fs.readFileSync(file));
  assert.deepEqual(after.request, before.request);
  assert.equal(after.requestHash, before.requestHash);
});
test('rollback of a confirmed ZA97 deployment still preserves the database', async (t) => {
  const context = await prepareBudget(t);
  context.transport = async () => JSON.stringify({ ...queued(), profile: 'za90-za97' });
  await runClient(['deploy', PLAN, ID], context);
  context.transport = async () => JSON.stringify(budgetComplete());
  await runClient(['status', ID], context);
  context.transport = async (command) => {
    assert.equal(command, `rollback ${ROLLBACK} ${ID}`);
    return JSON.stringify({ ...queued('rollback'), requestId: ROLLBACK });
  };
  await runClient(['rollback', ID, ROLLBACK], context);
  context.transport = async () =>
    JSON.stringify({
      protocol: PROTOCOL,
      action: 'status',
      ok: true,
      requestId: ROLLBACK,
      phase: 'succeeded',
      terminal: true,
      result: {
        ...PREVIOUS,
        health: { api: true, web: true, proxy: true },
        rollbackOf: ID,
        databaseRestored: false,
      },
    });
  assert.equal((await runClient(['status', ROLLBACK], context)).phase, 'succeeded');
});
