import fs from 'fs';
import path from 'path';

export function loadEnv(filePath = path.resolve(process.cwd(), '.env')): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalizedLine = line.startsWith('export ') ? line.slice('export '.length) : line;
    const separatorIndex = normalizedLine.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    let value = normalizedLine.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const hasMatchingQuotes =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (hasMatchingQuotes) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
