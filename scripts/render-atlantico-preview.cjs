// Reproducible visual QA. Purely synthetic snapshot; never opens a database or calls a bank API.
const fs = require('node:fs');
const path = require('node:path');
const { buildReportPdfHtml } = require('../src/templates/report-pdf.template');
const { PdfRenderer } = require('../src/utils/pdf.util');
const { LogoAssetService } = require('../src/utils/logo.util');

async function main() {
  const output = process.argv[2];
  if (!output || path.extname(output).toLowerCase() !== '.pdf') {
    throw new Error(
      'Usage: node -r ts-node/register scripts/render-atlantico-preview.cjs <output.pdf>',
    );
  }
  const lines = [];
  const account = (id, name, currency, total, envelopes) => {
    const base = {
      report_snapshot_id: 1,
      account_id: id,
      account_name: name,
      account_currency: currency,
      envelope_id: null,
      envelope_name: null,
      category_id: null,
      category_name: null,
      created_at: '2026-07-01 16:00:00',
      updated_at: '2026-07-01 16:00:00',
    };
    lines.push({
      ...base,
      id: lines.length + 1,
      line_type: 'ACCOUNT_TOTAL',
      amount: total,
      sort_order: lines.length,
    });
    for (const [label, value] of envelopes) {
      lines.push({
        ...base,
        id: lines.length + 1,
        line_type: 'ENVELOPE_TOTAL',
        envelope_id: lines.length + 1,
        envelope_name: label,
        category_name: label,
        category_id: lines.length + 1,
        amount: value,
        sort_order: lines.length,
      });
    }
  };
  account(1, 'Cuenta principal', 'CRC', 7450000, [
    ['Uso personal', 1200000],
    ['Ahorro', 4000000],
    ['Servicios', 250000],
    ['Metas', 2000000],
    ['Ejemplo de saldo negativo', -5000],
    ['Reserva disponible', 5000],
  ]);
  account(
    2,
    'Ahorro y objetivos personales de largo plazo — ejemplo con nombre extenso',
    'CRC',
    5000000,
    Array.from({ length: 25 }, (_, index) => [
      'Objetivo ' +
        (index + 1) +
        (index === 10 ? ': formación profesional y proyectos personales' : ''),
      200000,
    ]),
  );
  account(3, 'Cuenta en dólares', 'USD', 2500, [
    ['Ahorro', 2000],
    ['Suscripciones', 500],
  ]);
  const snapshot = {
    id: 1,
    user_id: 1,
    report_month: '2026-06',
    generated_at: '2026-07-01 16:00:00',
    base_currency: 'CRC',
    total_crc: 12450000,
    total_usd: 2500,
    exchange_rate_used: 500,
    exchange_rate_id: null,
    consolidated_amount: 13700000,
    ccss_rule_set_id: null,
    income_tax_rule_set_id: null,
    version: 1,
    is_latest: 1,
    status: 'FINALIZED',
    notes:
      'Demostración visual con datos completamente ficticios. Incluye nombres largos, un saldo negativo y un detalle que continúa en otra página.',
    created_at: '2026-07-01 16:00:00',
    updated_at: '2026-07-01 16:00:00',
  };
  const html = buildReportPdfHtml({ snapshot, lines }, new LogoAssetService().getLogoDataUri());
  const target = path.resolve(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target.replace(/\.pdf$/i, '.html'), html);
  const pdf = await new PdfRenderer().renderHtmlToPdf(
    html,
    'Zandaka · Demostración con datos ficticios',
  );
  fs.writeFileSync(target, pdf);
  process.stdout.write(target + '\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
