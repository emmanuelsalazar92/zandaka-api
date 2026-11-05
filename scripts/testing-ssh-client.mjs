import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const PROTOCOL = 'zandaka-testing-v1';
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PHASES = new Set(['queued', 'running', 'succeeded', 'failed', 'rejected', 'interrupted']);
const exec = promisify(execFile);

export class ClientError extends Error {
  constructor(code, requestId) {
    super(code);
    this.code = code;
    this.requestId = requestId;
  }
}
const requireValue = (condition, code = 'UNVERIFIABLE_RESPONSE') => {
  if (!condition) throw new ClientError(code);
};
const digestOf = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const isDigest = (value) => typeof value === 'string' && DIGEST.test(value);
const isUuid = (value) => typeof value === 'string' && UUID.test(value);

function readJson(file) {
  requireValue(fs.existsSync(file), 'LOCAL_STATE_NOT_FOUND');
  requireValue(!fs.lstatSync(file).isSymbolicLink(), 'LOCAL_STATE_SYMLINK');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new ClientError('INVALID_LOCAL_STATE');
  }
}
function writeJson(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (exclusive) {
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return;
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, file);
}

function checkSafeResponse(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    requireValue(
      !/^(?:env|environment|password|secret|token|credentials|authorization|private_?key)$/i.test(
        key,
      ),
      'UNSAFE_RESPONSE_FIELDS',
    );
    if (typeof item === 'string')
      requireValue(!/-----BEGIN .*PRIVATE KEY-----/.test(item), 'UNSAFE_RESPONSE_FIELDS');
    else checkSafeResponse(item);
  }
}
function parseReply(raw, action) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ClientError('INVALID_REMOTE_JSON');
  }
  requireValue(
    value && !Array.isArray(value) && value.protocol === PROTOCOL && value.action === action,
  );
  checkSafeResponse(value);
  requireValue(value.ok === true, 'REMOTE_REQUEST_REJECTED');
  return value;
}
function validatePlan(reply, target) {
  requireValue(reply.readOnly === true && isDigest(reply.planId));
  requireValue(
    reply.target?.apiDigest === target.apiDigest && reply.target?.webDigest === target.webDigest,
  );
}
function validateJob(reply, request) {
  requireValue(
    reply && request && isDigest(request.target?.apiDigest) && isDigest(request.target?.webDigest),
  );
  requireValue(reply.requestId === request.requestId && PHASES.has(reply.phase));
  requireValue(
    typeof reply.terminal === 'boolean' &&
      reply.terminal === !['queued', 'running'].includes(reply.phase),
  );
  if (reply.phase !== 'succeeded') return;
  const result = reply.result;
  requireValue(
    result &&
      result.apiDigest === request.target.apiDigest &&
      result.webDigest === request.target.webDigest,
  );
  requireValue(
    result.health?.api === true && result.health?.web === true && result.health?.proxy === true,
  );
  if (request.operation === 'deploy') {
    requireValue(
      result.database?.transferRequestReady === true &&
        result.database?.historicalUnchanged === true,
    );
    requireValue(
      typeof result.backup?.sha256 === 'string' && /^[a-f0-9]{64}$/.test(result.backup.sha256),
    );
    requireValue(isDigest(result.previous?.apiDigest) && isDigest(result.previous?.webDigest));
  } else {
    requireValue(result.rollbackOf === request.releaseId && result.databaseRestored === false);
  }
}

export async function defaultTransport(command) {
  const ssh =
    process.platform === 'win32'
      ? path.join(process.env.SystemRoot, 'System32/OpenSSH/ssh.exe')
      : 'ssh';
  const profile = path.join(os.homedir(), '.ssh/zandaka-testing.conf');
  const result = await exec(ssh, ['-F', profile, '-T', 'zandaka-testing', command], {
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1048576,
    windowsHide: true,
  });
  return result.stdout;
}

/** Only fixed verbs and validated hex/UUID tokens ever reach SSH. No shell is used locally. */
export async function runClient(argv, options = {}) {
  const transport = options.transport ?? defaultTransport;
  const root =
    options.stateRoot ??
    fileURLToPath(new URL('../../operaciones/ssh-testing/client-state/', import.meta.url));
  const [action, ...args] = argv;
  let command, target, request, record, requestFile;
  if (['probe', 'inspect'].includes(action) && args.length === 0) command = action;
  else if (action === 'plan' && args.length === 2 && args.every(isDigest)) {
    target = { apiDigest: args[0], webDigest: args[1] };
    command = `plan ${target.apiDigest} ${target.webDigest}`;
  } else if (
    action === 'deploy' &&
    [1, 2].includes(args.length) &&
    isDigest(args[0]) &&
    (args[1] === undefined || isUuid(args[1]))
  ) {
    const plan = readJson(path.join(root, 'plans', `${args[0].slice(7)}.json`));
    requireValue(
      plan.protocol === PROTOCOL &&
        plan.action === 'plan' &&
        plan.ok === true &&
        plan.planId === args[0],
      'INVALID_LOCAL_PLAN',
    );
    requireValue(
      isDigest(plan.target?.apiDigest) && isDigest(plan.target?.webDigest),
      'INVALID_LOCAL_PLAN',
    );
    validatePlan(plan, plan.target);
    request = {
      operation: 'deploy',
      requestId: args[1] ?? randomUUID(),
      planId: plan.planId,
      target: { apiDigest: plan.target.apiDigest, webDigest: plan.target.webDigest },
    };
    command = `deploy ${request.requestId} ${request.target.apiDigest} ${request.target.webDigest} ${request.planId} za90`;
  } else if (
    action === 'rollback' &&
    [1, 2].includes(args.length) &&
    isUuid(args[0]) &&
    (args[1] === undefined || isUuid(args[1]))
  ) {
    const original = readJson(path.join(root, 'requests', `${args[0]}.json`));
    requireValue(
      original.request?.operation === 'deploy' && original.request.requestId === args[0],
      'INVALID_ROLLBACK_SOURCE',
    );
    validateJob(original.reply, original.request);
    requireValue(original.reply.phase === 'succeeded', 'INVALID_ROLLBACK_SOURCE');
    target = original.reply.result.previous;
    request = {
      operation: 'rollback',
      requestId: args[1] ?? randomUUID(),
      releaseId: args[0],
      target,
    };
    command = `rollback ${request.requestId} ${request.releaseId}`;
  } else if (action === 'status' && args.length === 1 && isUuid(args[0])) {
    requestFile = path.join(root, 'requests', `${args[0]}.json`);
    record = readJson(requestFile);
    request = record.request;
    requireValue(
      request?.requestId === args[0] && ['deploy', 'rollback'].includes(request.operation),
      'INVALID_LOCAL_REQUEST',
    );
    command = `status ${args[0]}`;
  } else throw new ClientError('INVALID_ARGUMENTS');

  if (request && action !== 'status') {
    requestFile = path.join(root, 'requests', `${request.requestId}.json`);
    if (fs.existsSync(requestFile)) {
      record = readJson(requestFile);
      requireValue(
        record.requestHash === digestOf(request) && digestOf(record.request) === digestOf(request),
        'REQUEST_ID_CONFLICT',
      );
    } else {
      record = { request, requestHash: digestOf(request), lastAttempt: 'not_confirmed' };
      writeJson(requestFile, record, true);
    }
  }
  let reply;
  try {
    const raw = await transport(command);
    if (action === 'probe') {
      const output = raw.trim().replace(/\r\n/g, '\n');
      requireValue(
        output === 'ZANDAKA_TESTING_SSH_PROBE_V1\nuser=emmanuelsalazar\ncompose_readable=true',
      );
      return { protocol: PROTOCOL, action, ok: true, readOnly: true };
    }
    reply = parseReply(raw, action);
    if (action === 'inspect') requireValue(reply.readOnly === true);
    if (action === 'plan') {
      validatePlan(reply, target);
      const file = path.join(root, 'plans', `${reply.planId.slice(7)}.json`);
      if (fs.existsSync(file)) {
        const prior = readJson(file);
        requireValue(
          prior.planId === reply.planId && digestOf(prior.target) === digestOf(target),
          'LOCAL_PLAN_CONFLICT',
        );
      } else writeJson(file, reply, true);
    }
    if (request) validateJob(reply, request);
  } catch (error) {
    if (record) {
      record.lastAttempt = 'confirmation_unknown';
      writeJson(requestFile, record);
    }
    throw new ClientError(
      error instanceof ClientError
        ? error.code
        : request
          ? 'CONNECTION_UNCERTAIN'
          : 'SSH_REQUEST_FAILED',
      request?.requestId,
    );
  }
  if (record) {
    record.reply = reply;
    record.lastAttempt = 'confirmed';
    writeJson(requestFile, record);
  }
  return reply;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runClient(process.argv.slice(2))
    .then((reply) => {
      process.stdout.write(JSON.stringify(reply, null, 2) + '\n');
      if (reply.terminal && reply.phase !== 'succeeded') process.exitCode = 2;
    })
    .catch((error) => {
      process.stderr.write(
        JSON.stringify({
          ok: false,
          code: error instanceof ClientError ? error.code : 'CLIENT_FAILED',
          ...(error.requestId ? { requestId: error.requestId } : {}),
        }) + '\n',
      );
      process.exitCode = 1;
    });
}
