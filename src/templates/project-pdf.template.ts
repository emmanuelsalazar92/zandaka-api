import type { ProjectPdfSnapshot } from '../services/project.service';
import { formatMoney } from '../utils/currency.util';
import { escapeHtml } from '../utils/html.util';
import { currencyDigits, decimal, decimalNumber } from '../utils/money';

const timestamp = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Costa_Rica',
});

function day(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function amount(value: string, currency: string) {
  try {
    if (decimal(value).dp() <= currencyDigits(currency)) {
      return escapeHtml(formatMoney(decimalNumber(value), currency));
    }
  } catch {
    // Preserve historical precision when the numeric formatter cannot represent it.
  }
  return escapeHtml(value.replace('.', ','));
}

export function buildProjectPdfHtml(data: ProjectPdfSnapshot, logo: string | null) {
  const { project, currencies, lines, calculatedAt, excludedLineCount } = data;
  const first = lines[0];
  const last = lines[lines.length - 1];
  const start = first ? day(first.date) : '';
  const end = last ? day(last.date) : '';
  const period = start === end ? start : `${start} al ${end}`;
  const status = `${project.finalizedAt ? 'Finalizado' : 'Activo'}${project.archivedAt ? ' · Archivado' : ''}`;
  const safeLogo =
    logo && /^data:image\/(?:png|jpeg|svg\+xml|x-icon);base64,[A-Za-z0-9+/=]+$/.test(logo);
  const totals = currencies
    .map(
      ({ currency, expenses, refunds, net }) => `
    <tr><th scope="row">${escapeHtml(currency)}</th>
      <td class="amount">${amount(expenses, currency)}</td>
      <td class="amount">${amount(refunds, currency)}</td>
      <td class="amount net">${amount(net, currency)}</td></tr>`,
    )
    .join('');
  const categories = currencies
    .flatMap(({ currency, categories }) =>
      categories.map(
        (row) => `
    <tr><th scope="row">${escapeHtml(row.categoryName ?? 'Sin categoría')}</th>
      <td>${escapeHtml(currency)}</td><td class="amount">${amount(row.expenses, currency)}</td>
      <td class="amount">${amount(row.refunds, currency)}</td>
      <td class="amount net">${amount(row.net, currency)}</td></tr>`,
      ),
    )
    .join('');
  const annex = lines
    .map(
      (line) => `
    <tr>
      <td class="date">${escapeHtml(day(line.date))}</td>
      <th scope="row">${escapeHtml(line.description || 'Movimiento sin descripción')}
        <span class="muted detail">#${line.transactionId}</span></th>
      <td>${escapeHtml(line.categoryName ?? 'Sin categoría')}</td>
      <td>${line.kind === 'refund' ? 'Reembolso' : 'Gasto'}</td>
      <td class="amount">${amount(line.amount.replace(/^-/, ''), line.currency)}
        <span class="muted detail">${escapeHtml(line.currency)}</span></td>
    </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es-CR">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
  <title>Informe de proyecto · ${escapeHtml(project.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font: 10pt/1.4 'Noto Sans', 'DejaVu Sans', Arial, sans-serif; color: #152840; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    h1, h2, p, dl, dd { margin: 0; }
    h1 { font-size: 24pt; line-height: 1.12; letter-spacing: -.02em; overflow-wrap: anywhere; }
    h2 { margin: 17pt 0 5pt; font-size: 13pt; break-after: avoid; }
    .brand, .brand-name { display: flex; align-items: center; gap: 8pt; }
    .brand { justify-content: space-between; margin-bottom: 10pt; }
    .brand-name { font-weight: 700; font-size: 12pt; }
    .brand img { width: 23pt; height: 23pt; }
    .status { padding: 3pt 8pt; border-radius: 8pt; font-size: 9pt; background: #d5f1eb; color: #075751; }
    .hero { background: #14346e; color: #fff; padding: 17pt; border-radius: 12pt; break-inside: avoid; }
    .label, dt { font-weight: 700; font-size: 8pt; letter-spacing: .06em; text-transform: uppercase; }
    .label { color: #d9e6ff; margin-bottom: 5pt; }
    dl { display: flex; flex-wrap: wrap; gap: 9pt 18pt; margin-top: 12pt; }
    dt, .muted { color: #4d6179; }
    .explanation { margin-top: 5pt; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    td, th { padding: 5pt 6pt; border-bottom: 1px solid #dbe3ee; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    thead th { color: #314761; background: #eff4fa; font-size: 8.5pt; }
    tbody th { font-weight: 600; }
    .amount { text-align: right; font-variant-numeric: tabular-nums; }
    .net { font-weight: 700; color: #163e83; }
    .detail { display: block; font-size: 8pt; margin-top: 1pt; }
    .annex { font-size: 9pt; }
    .date { white-space: nowrap; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-name">${safeLogo ? `<img alt="" src="${logo}">` : ''}Zandaka</div>
      <div class="status">${status}</div>
    </div>
    <div class="hero"><p class="label">Informe de proyecto</p><h1>${escapeHtml(project.title)}</h1></div>
    <dl>
      <div><dt>Período de los movimientos</dt><dd>${escapeHtml(period || 'Sin movimientos')}</dd></div>
      <div><dt>Generado · Costa Rica</dt><dd>${escapeHtml(timestamp.format(new Date(calculatedAt)))}</dd></div>
      ${project.finalizedAt ? `<div><dt>Cierre</dt><dd>${escapeHtml(timestamp.format(new Date(project.finalizedAt)))}</dd></div>` : ''}
    </dl>
  </header>
  <main>
    <h2>Costo por moneda</h2>
    <table aria-label="Costo por moneda">
      <thead><tr><th scope="col">Moneda</th><th scope="col" class="amount">Gastos</th>
        <th scope="col" class="amount">Reembolsos</th><th scope="col" class="amount">Costo neto</th></tr></thead>
      <tbody>${totals || '<tr><td colspan="4">Sin movimientos</td></tr>'}</tbody>
    </table>
    <p class="muted explanation">Importes vigentes al generar este informe.</p>
    ${excludedLineCount ? `<p class="muted explanation">Líneas vinculadas fuera del costo por cambios en el libro · ${excludedLineCount}</p>` : ''}
    ${
      categories
        ? `
      <h2>Desglose por categoría</h2>
      <table aria-label="Desglose por categoría">
        <colgroup><col style="width:36%"><col style="width:10%"><col><col><col></colgroup>
        <thead><tr><th scope="col">Categoría</th><th scope="col">Moneda</th>
          <th scope="col" class="amount">Gastos</th><th scope="col" class="amount">Reembolsos</th>
          <th scope="col" class="amount">Neto</th></tr></thead>
        <tbody>${categories}</tbody>
      </table>`
        : ''
    }
    <h2>Anexo de movimientos</h2>
    <table class="annex" aria-label="Anexo de movimientos">
      <colgroup><col style="width:14%"><col style="width:38%"><col style="width:17%"><col style="width:13%"><col style="width:18%"></colgroup>
      <thead><tr><th scope="col">Fecha</th><th scope="col">Movimiento / ID</th><th scope="col">Categoría</th>
        <th scope="col">Tipo</th><th scope="col" class="amount">Importe vinculado</th></tr></thead>
      <tbody>${annex || '<tr><td colspan="5">Sin movimientos</td></tr>'}</tbody>
    </table>
  </main>
</body>
</html>`;
}
