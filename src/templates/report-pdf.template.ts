import type { ReportSnapshotDocument, ReportSnapshotLineRecord } from '../repositories/report.repo';
import { formatMoney } from '../utils/currency.util';

type AccountGroup = {
  accountName: string;
  accountCurrency: string;
  totalAmount: number | null;
  envelopes: ReportSnapshotLineRecord[];
};

const REPORT_TIMEZONE = process.env.REPORT_TIMEZONE ?? 'America/Costa_Rica';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPeriod(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || month < 1 || month > 12) return value;
  return new Intl.DateTimeFormat('es-CR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatTimestamp(value: string): string {
  const normalized = value.replace(' ', 'T');
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : normalized + 'Z';
  const date = new Date(withTimezone);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: REPORT_TIMEZONE,
  }).format(date);
}

function groupLines(lines: ReportSnapshotLineRecord[]): AccountGroup[] {
  const groups = new Map<string, AccountGroup>();
  const keyFor = (line: ReportSnapshotLineRecord) =>
    String(line.account_id ?? line.account_name) + '|' + line.account_currency;
  // Resolve totals first so a line's position cannot accidentally assign it to another account.
  for (const line of lines) {
    if (line.line_type === 'ACCOUNT_TOTAL') {
      groups.set(keyFor(line), {
        accountName: line.account_name,
        accountCurrency: line.account_currency,
        totalAmount: line.amount,
        envelopes: [],
      });
    }
  }
  for (const line of lines) {
    if (line.line_type !== 'ENVELOPE_TOTAL') continue;
    const key = keyFor(line);
    let group = groups.get(key);
    if (!group) {
      group = {
        accountName: line.account_name,
        accountCurrency: line.account_currency,
        totalAmount: null,
        envelopes: [],
      };
      groups.set(key, group);
    }
    group.envelopes.push(line);
  }
  return [...groups.values()];
}

export function buildReportPdfHtml(
  document: ReportSnapshotDocument,
  logoDataUri: string | null,
): string {
  const { snapshot, lines } = document;
  const accounts = groupLines(lines);
  const amount = (value: number | null, currency: string) =>
    escapeHtml(value === null ? 'No disponible' : formatMoney(value, currency));
  const logoIsSafe =
    logoDataUri !== null &&
    /^data:image\/(?:png|jpeg|svg\+xml|x-icon);base64,[A-Za-z0-9+/=]+$/.test(logoDataUri);
  const rateAvailable = snapshot.exchange_rate_used !== null && snapshot.exchange_rate_used > 0;
  const rate = rateAvailable
    ? '1 USD = ' + formatMoney(snapshot.exchange_rate_used, 'CRC')
    : 'Sin cotización registrada';
  const status =
    { DRAFT: 'Borrador', FINALIZED: 'Finalizado', ARCHIVED: 'Archivado' }[snapshot.status] ??
    snapshot.status;
  const accountSections = accounts
    .map((group) => {
      const rows = group.envelopes
        .map(
          (line) => `
      <tr>
        <td>${escapeHtml(line.envelope_name ?? line.category_name ?? 'Sin categoría')}</td>
        <td class="amount ${line.amount < 0 ? 'negative' : ''}">${amount(line.amount, group.accountCurrency)}</td>
      </tr>`,
        )
        .join('');
      return `
      <table class="account-table" aria-label="${escapeHtml(group.accountName)}">
        <thead>
          <tr><th colspan="2" class="account-heading">
            <div class="account-heading-inner">
              <div><h3>${escapeHtml(group.accountName)}</h3><p>Moneda original · ${escapeHtml(group.accountCurrency)}</p></div>
              <div class="account-total ${(group.totalAmount ?? 0) < 0 ? 'negative' : ''}">${amount(group.totalAmount, group.accountCurrency)}</div>
            </div>
          </th></tr>
          <tr class="column-headings"><th>Sobre / categoría</th><th class="amount">Saldo · ${escapeHtml(group.accountCurrency)}</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="2" class="muted">Sin desglose de sobres en esta versión.</td></tr>'}</tbody>
      </table>`;
    })
    .join('');
  const notes = snapshot.notes
    ? `<section class="notes"><h2>Notas de esta versión</h2><p>${escapeHtml(snapshot.notes)}</p></section>`
    : '';

  return `<!DOCTYPE html>
<html lang="es-CR">
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light" />
  <title>Zandaka · Resumen financiero</title>
  <style>
    @page { size: letter; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; color: #172b46; background: #fff; font-family: "Noto Sans", "DejaVu Sans", Arial, sans-serif; font-size: 13px; line-height: 1.5; }
    .masthead { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 26px; }
    .brand { display: flex; gap: 12px; align-items: center; }
    .logo { height: 38px; width: 38px; object-fit: contain; }
    .wordmark { font-size: 22px; font-weight: 700; letter-spacing: -0.7px; }
    .tagline { font-size: 11px; color: #56677e; }
    .period { text-align: right; }
    .eyebrow { font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 600; }
    .period p { margin: 3px 0 0; }
    h1 { margin: 0 0 20px; font-size: 32px; line-height: 1.12; letter-spacing: -1px; font-weight: 700; }
    .hero { padding: 28px 30px; border-radius: 20px; background: radial-gradient(ellipse at 110% 0%, #0d657d 0%, transparent 52%), linear-gradient(120deg, #102b57, #1c49b1 78%, #245bdb); color: #fff; break-inside: avoid; }
    .hero .eyebrow { color: #e3edff; }
    .hero-amount { margin: 10px 0 8px; font-size: 45px; font-weight: 700; letter-spacing: -1.8px; line-height: 1.2; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .hero p { margin: 0; font-size: 11px; color: #e3edff; }
    .originals { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 20px; padding: 22px 0; border-bottom: 1px solid #dce4ef; break-inside: avoid; }
    .originals dt { color: #56677e; font-size: 11px; }
    .originals dd { margin: 5px 0 0; font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .originals .rate { font-size: 14px; }
    .capture { padding: 16px 0 22px; }
    .capture p { margin: 3px 0; }
    .capture .muted { font-size: 11px; }
    .section-title { margin: 10px 0 6px; font-size: 21px; font-weight: 700; letter-spacing: -0.5px; }
    .section-caption { margin: 0 0 20px; color: #56677e; font-size: 11px; }
    .account-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; margin-bottom: 24px; break-inside: auto; }
    .account-table thead { display: table-header-group; }
    .account-table th:first-child, .account-table td:first-child { width: 64%; }
    .account-heading { padding: 0; text-align: left; }
    .account-heading-inner { display: flex; justify-content: space-between; align-items: center; gap: 20px; background: #eef3fc; border-radius: 12px 12px 0 0; padding: 16px; border-top: 3px solid #245bdb; }
    .account-heading h3 { margin: 0; font-size: 14px; font-weight: 700; overflow-wrap: anywhere; }
    .account-heading p { margin: 3px 0 0; color: #56677e; font-size: 10px; font-weight: 400; }
    .account-total { flex-shrink: 0; font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .column-headings th { padding: 10px 16px; color: #56677e; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.7px; border-bottom: 1px solid #dce4ef; text-align: left; }
    .account-table td { padding: 9px 16px; border-bottom: 1px solid #e6edf5; overflow-wrap: anywhere; }
    .account-table tbody tr { break-inside: avoid; page-break-inside: avoid; }
    .amount { text-align: right !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .negative { color: #ac3028; }
    .muted { color: #56677e; }
    .notes { break-inside: avoid; border-left: 3px solid #0b858b; padding: 12px 18px; background: #f4f8fa; margin: 24px 0; }
    .notes h2 { margin: 0 0 8px; font-size: 13px; }
    .notes p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .trace { border-top: 1px solid #dce4ef; padding-top: 14px; font-size: 10px; color: #56677e; }
    .trace p { margin: 3px 0; }
    @media screen and (max-width: 600px) {
      body { padding: 16px; }
      .masthead { flex-wrap: wrap; }
      .period { text-align: left; }
      .originals { grid-template-columns: 1fr; gap: 12px; }
      .hero { padding: 22px; }
      .hero-amount { font-size: 30px; }
      .account-heading-inner { flex-wrap: wrap; }
      .account-total { white-space: normal; overflow-wrap: anywhere; }
      .account-table td, .column-headings th { padding: 9px 6px; }
    }
  </style>
</head>
<body><main>
  <header class="masthead">
    <div class="brand">${logoIsSafe ? `<img class="logo" alt="" src="${logoDataUri}" />` : ''}
      <div><div class="wordmark">Zandaka</div><div class="tagline">Tu dinero, con claridad.</div></div>
    </div>
    <div class="period"><span class="eyebrow muted">Mes de referencia</span><p>${escapeHtml(formatPeriod(snapshot.report_month))}</p></div>
  </header>
  <h1>Tu resumen financiero.</h1>
  <section class="hero" aria-label="Saldo consolidado">
    <div class="eyebrow">Saldo consolidado · ${escapeHtml(snapshot.base_currency)}</div>
    <div class="hero-amount">${amount(snapshot.consolidated_amount, snapshot.base_currency)}</div>
    <p>${snapshot.consolidated_amount === null ? 'La versión no conserva un total consolidado. Consulta los saldos por moneda.' : 'Saldos originales reunidos en la moneda de presentación.'}</p>
  </section>
  <dl class="originals">
    <div><dt>Saldo original · CRC</dt><dd>${amount(snapshot.total_crc, 'CRC')}</dd></div>
    <div><dt>Saldo original · USD</dt><dd>${amount(snapshot.total_usd, 'USD')}</dd></div>
    <div><dt>Conversión conservada</dt><dd class="rate">${escapeHtml(rate)}</dd></div>
  </dl>
  <section class="capture" aria-label="Alcance temporal">
    <p><strong>Captura de saldos:</strong> ${escapeHtml(formatTimestamp(snapshot.generated_at))} · Costa Rica</p>
    <p class="muted">El mes identifica el informe. Esta versión conserva los saldos capturados al generarse; no acredita un cierre contable al último día del mes.</p>
  </section>
  <h2 class="section-title">Tu dinero, por cuenta.</h2>
  <p class="section-caption">Detalle histórico de esta versión. Los movimientos posteriores no recalculan estos saldos.</p>
  ${accountSections || '<p class="muted">Esta versión no conserva un detalle por cuenta.</p>'}
  ${notes}
  <footer class="trace">
    <p>Versión ${snapshot.version} · Documento #${snapshot.id} · ${escapeHtml(status)} · Moneda de presentación: ${escapeHtml(snapshot.base_currency)}</p>
    <p>Fecha efectiva de cotización y corte contable: no conservados como campos independientes en esta versión.</p>
  </footer>
</main></body>
</html>`;
}
