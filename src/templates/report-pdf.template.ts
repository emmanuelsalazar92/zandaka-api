import { ReportSnapshotDocument, ReportSnapshotLineRecord } from '../repositories/report.repo';
import { formatMoney } from '../utils/currency.util';

type AccountGroup = {
  accountName: string;
  accountCurrency: string;
  totalAmount: number;
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

function formatNullableMoney(value: number | null, currency: string): string {
  return value === null ? 'N/A' : formatMoney(value, currency);
}

function formatPeriod(reportMonth: string): string {
  const [year, month] = reportMonth.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatTimestamp(value: string): string {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: REPORT_TIMEZONE,
  }).format(date);
}

function getAmountClass(value: number | null): string {
  if (value === null) return 'is-muted';
  if (value < 0) return 'is-negative';
  if (value > 0) return 'is-positive';
  return '';
}

function groupLines(lines: ReportSnapshotLineRecord[]): AccountGroup[] {
  const groups: AccountGroup[] = [];

  for (const line of lines) {
    if (line.line_type === 'ACCOUNT_TOTAL') {
      groups.push({
        accountName: line.account_name,
        accountCurrency: line.account_currency,
        totalAmount: line.amount,
        envelopes: [],
      });
      continue;
    }

    const current = groups[groups.length - 1];
    if (current) {
      current.envelopes.push(line);
    }
  }

  return groups;
}

export function buildReportPdfHtml(
  document: ReportSnapshotDocument,
  logoDataUri: string | null,
): string {
  const { snapshot, lines } = document;
  const groupedAccounts = groupLines(lines);
  const reportReference = `Snapshot #${snapshot.id} | v${snapshot.version}`;

  const summaryCards = [
    ['Total CRC', formatMoney(snapshot.total_crc, 'CRC'), getAmountClass(snapshot.total_crc)],
    ['Total USD', formatMoney(snapshot.total_usd, 'USD'), getAmountClass(snapshot.total_usd)],
    [
      `Consolidated ${snapshot.base_currency}`,
      formatNullableMoney(snapshot.consolidated_amount, snapshot.base_currency),
      getAmountClass(snapshot.consolidated_amount),
    ],
    [
      'Exchange Rate Used',
      snapshot.exchange_rate_used === null ? 'N/A' : snapshot.exchange_rate_used.toFixed(4),
      snapshot.exchange_rate_used === null ? 'is-muted' : '',
    ],
  ];

  const accountSections = groupedAccounts
    .map((group) => {
      const rows = group.envelopes
        .map((line) => {
          const visibleName = line.envelope_name ?? line.category_name ?? 'Unassigned';
          return `
            <tr>
              <td class="envelope-name">${escapeHtml(visibleName)}</td>
              <td class="amount ${getAmountClass(line.amount)}">${escapeHtml(
                formatMoney(line.amount, group.accountCurrency),
              )}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <section class="account-section">
          <div class="account-header">
            <div>
              <h3>${escapeHtml(group.accountName)}</h3>
              <p>${escapeHtml(group.accountCurrency)} Account</p>
            </div>
            <div class="account-total ${getAmountClass(group.totalAmount)}">
              ${escapeHtml(formatMoney(group.totalAmount, group.accountCurrency))}
            </div>
          </div>
          <table class="envelope-table" cellspacing="0" cellpadding="0">
            <thead>
              <tr>
                <th>Envelope / Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td class="is-muted">No envelope lines</td><td class="amount is-muted">N/A</td></tr>'}
            </tbody>
          </table>
        </section>
      `;
    })
    .join('');

  const notesSection = snapshot.notes
    ? `
      <section class="notes-section">
        <h3>Notes</h3>
        <p>${escapeHtml(snapshot.notes)}</p>
      </section>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Zandaka Financial Report</title>
        <style>
          @page {
            size: A4;
            margin: 12mm 10mm 14mm;
          }

          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body {
            margin: 0;
            font-family: "Noto Sans", Arial, Helvetica, sans-serif;
            color: #374151;
            background: #ffffff;
            font-size: 11px;
            line-height: 1.35;
          }

          .report-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e5e7eb;
          }

          .report-brand {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .brand-logo {
            width: 42px;
            height: 42px;
            object-fit: contain;
            border-radius: 10px;
          }

          .brand-mark {
            width: 42px;
            height: 42px;
            border-radius: 10px;
            background: #1e3a8a;
            color: #ffffff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 17px;
            font-weight: 700;
          }

          .brand-copy small {
            display: block;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-size: 9px;
            margin-bottom: 2px;
          }

          .brand-copy h1 {
            margin: 0;
            font-size: 21px;
            color: #1e3a8a;
            line-height: 1.1;
          }

          .brand-copy p {
            margin: 3px 0 0;
            color: #4b5563;
            font-size: 11px;
          }

          .report-meta {
            min-width: 200px;
            background: #f8fafc;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            padding: 10px 12px;
          }

          .meta-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 2px 0;
            font-size: 10px;
          }

          .meta-row span:first-child {
            color: #6b7280;
          }

          .meta-row span:last-child {
            color: #111827;
            font-weight: 600;
            text-align: right;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            margin: 12px 0 14px;
          }

          .summary-card {
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            padding: 10px 11px;
            background: #ffffff;
            min-height: 72px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }

          .summary-card h2 {
            margin: 0 0 6px;
            font-size: 9px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .summary-card .summary-value {
            margin: 0;
            font-size: 15px;
            font-weight: 700;
            color: #111827;
            line-height: 1.15;
            text-align: right;
            font-variant-numeric: tabular-nums;
          }

          .section-title {
            margin: 0 0 4px;
            font-size: 14px;
            font-weight: 700;
            color: #1e3a8a;
          }

          .section-subtitle {
            margin: 0 0 10px;
            color: #6b7280;
            font-size: 10px;
          }

          .account-section {
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 10px;
            page-break-inside: auto;
            break-inside: auto;
          }

          .account-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
            padding: 10px 12px;
            background: #f8fafc;
            border-bottom: 1px solid #e5e7eb;
            break-after: avoid;
            page-break-after: avoid;
          }

          .account-header h3 {
            margin: 0;
            font-size: 13px;
            color: #111827;
          }

          .account-header p {
            margin: 2px 0 0;
            color: #6b7280;
            font-size: 10px;
          }

          .account-total {
            font-size: 14px;
            font-weight: 700;
            text-align: right;
            white-space: nowrap;
          }

          .envelope-table {
            width: 100%;
            border-collapse: collapse;
          }

          .envelope-table th,
          .envelope-table td {
            padding: 7px 12px;
            border-bottom: 1px solid #eef2f7;
          }

          .envelope-table th {
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #6b7280;
            background: #ffffff;
          }

          .envelope-table th:first-child {
            text-align: left;
          }

          .envelope-table th:last-child {
            text-align: right;
          }

          .envelope-table tbody tr {
            page-break-inside: avoid;
          }

          .envelope-table tbody tr:last-child td {
            border-bottom: 0;
          }

          .envelope-name {
            padding-left: 20px;
          }

          .amount {
            text-align: right;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
          }

          .notes-section {
            margin-top: 12px;
            padding: 10px 12px;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            background: #ffffff;
            page-break-inside: avoid;
          }

          .notes-section h3 {
            margin: 0 0 5px;
            font-size: 12px;
            color: #1e3a8a;
          }

          .notes-section p {
            margin: 0;
            color: #4b5563;
            white-space: pre-wrap;
          }

          .report-footer {
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            color: #6b7280;
            font-size: 10px;
          }

          .is-positive {
            color: #166534;
          }

          .is-negative {
            color: #b91c1c;
          }

          .is-muted {
            color: #9ca3af;
          }
        </style>
      </head>
      <body>
        <main>
          <header class="report-header">
            <div class="report-brand">
              ${
                logoDataUri
                  ? `<img class="brand-logo" src="${logoDataUri}" alt="Zandaka logo" />`
                  : '<div class="brand-mark">Z</div>'
              }
              <div class="brand-copy">
                <small>Zandaka</small>
                <h1>Financial Report</h1>
                <p>${escapeHtml(formatPeriod(snapshot.report_month))}</p>
              </div>
            </div>
            <div class="report-meta">
              <div class="meta-row"><span>Snapshot</span><span>${escapeHtml(reportReference)}</span></div>
              <div class="meta-row"><span>Report Month</span><span>${escapeHtml(snapshot.report_month)}</span></div>
              <div class="meta-row"><span>Generated At</span><span>${escapeHtml(
                formatTimestamp(snapshot.generated_at),
              )}</span></div>
              <div class="meta-row"><span>Base Currency</span><span>${escapeHtml(
                snapshot.base_currency,
              )}</span></div>
              <div class="meta-row"><span>Status</span><span>${escapeHtml(snapshot.status)}</span></div>
            </div>
          </header>
          <section>
            <div class="summary-grid">
              ${summaryCards
                .map(
                  ([label, value, className]) => `
                    <article class="summary-card">
                      <h2>${escapeHtml(label)}</h2>
                      <p class="summary-value ${className}">${escapeHtml(value)}</p>
                    </article>
                  `,
                )
                .join('')}
            </div>
          </section>
          <section>
            <h2 class="section-title">Account Detail</h2>
            <p class="section-subtitle">
              Historical balances preserved from the generated snapshot. Values below do not recalculate from live data.
            </p>
            ${accountSections}
          </section>
          ${notesSection}
          <footer class="report-footer">
            <span>Generated by Zandaka</span>
            <span>${escapeHtml(formatTimestamp(snapshot.generated_at))}</span>
          </footer>
        </main>
      </body>
    </html>
  `;
}
