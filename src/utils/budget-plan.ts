import Decimal from 'decimal.js';

// Mirrored in web/lib/budget-plan.ts; contract tests protect the calculation boundary.
const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
export type PlanLine = {
  id: string;
  name: string;
  group: 50 | 30 | 20;
  kind: 'fixed' | 'percent' | 'subscription';
  currency: 'USD' | 'CRC';
  payCurrency: 'USD' | 'CRC';
  amount: string;
  iva: string;
  roundUsd: 'up' | 'none';
  targetEnvelopeId: number | null;
};
export type BudgetPlanDocument = {
  version: 1;
  month: string;
  incomeMonth: string;
  incomeMode: 'net' | 'receipts';
  income: { net: string; gross: string; ccss: string; tax: string; q1: string; q2: string };
  exchange: { source: string; date: string; buy: string; sell: string; margin: string };
  incomeAccountId: number | null;
  retainedAccountId: number | null;
  sources: Array<{ accountId: number; envelopeId: number }>;
  lines: PlanLine[];
};
export type PlanLineResult = {
  id: string;
  reserveUsd: string;
  payAmount: string;
  rawPayAmount: string;
  payCurrency: 'USD' | 'CRC';
  explanation: string[];
};
export type PlanCalculation = {
  net: string | null;
  incomeDifference: string | null;
  buy: string | null;
  sell: string | null;
  assigned: string | null;
  free: string | null;
  closing: string | null;
  convertUsd: string | null;
  conversionCrc: string | null;
  paymentsCrc: string | null;
  paymentsUsd: string | null;
  bufferCrc: string | null;
  groups: Array<{ group: 50 | 30 | 20; cap: string; assigned: string; free: string }>;
  lines: PlanLineResult[];
  issues: Array<{ field: string; detail: string }>;
};
const text = (v: Decimal) => (v.isZero() ? '0' : v.toFixed());
const money = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const numeric = (v: string): Decimal | null => {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(v)) return null;
  return new D(v);
};

export function calculateBudgetPlan(doc: BudgetPlanDocument): PlanCalculation {
  const result: PlanCalculation = {
    net: null,
    incomeDifference: null,
    buy: null,
    sell: null,
    assigned: null,
    free: null,
    closing: null,
    convertUsd: null,
    conversionCrc: null,
    paymentsCrc: null,
    paymentsUsd: null,
    bufferCrc: null,
    groups: [],
    lines: [],
    issues: [],
  };
  const issue = (field: string, detail: string) => result.issues.push({ field, detail });
  const read = (v: string, field: string) => {
    const n = numeric(v);
    if (!n) issue(field, 'Introduce un importe válido.');
    return n;
  };
  let net: Decimal | null = null;
  if (doc.incomeMode === 'net') net = read(doc.income.net, 'income.net');
  else {
    const gross = read(doc.income.gross, 'income.gross'),
      ccss = read(doc.income.ccss, 'income.ccss'),
      tax = read(doc.income.tax, 'income.tax'),
      q1 = read(doc.income.q1, 'income.q1'),
      q2 = read(doc.income.q2, 'income.q2');
    if (gross && ccss && tax) net = gross.minus(ccss).minus(tax);
    if (net && q1 && q2) {
      const difference = net.minus(q1).minus(q2);
      result.incomeDifference = text(difference);
      if (!difference.isZero())
        issue('income', 'Los rebajos y las quincenas no cuadran con el salario.');
    }
  }
  if (net) {
    result.net = text(net);
    if (!net.gt(0)) issue('income', 'El neto debe ser mayor que cero.');
  }
  const buyInput = read(doc.exchange.buy, 'exchange.buy'),
    sellInput = read(doc.exchange.sell, 'exchange.sell'),
    margin = read(doc.exchange.margin, 'exchange.margin');
  if (!margin || margin.gt(20)) issue('exchange.margin', 'El margen debe estar entre 0 y 20 %.');
  if (!doc.exchange.source.trim()) issue('exchange.source', 'Indica la fuente de la cotización.');
  if (!doc.exchange.date) issue('exchange.date', 'Indica la fecha de referencia.');
  if (!doc.incomeMonth) issue('incomeMonth', 'Indica el mes en que recibiste el ingreso.');
  if (doc.incomeMonth && doc.incomeMonth > doc.month)
    issue('incomeMonth', 'El ingreso debe haberse recibido antes o durante el mes presupuestado.');
  let buy: Decimal | null = null,
    sell: Decimal | null = null;
  if (buyInput && sellInput && margin && margin.lte(20)) {
    buy = buyInput.mul(new D(1).minus(margin.div(100))).floor();
    sell = sellInput.mul(new D(1).plus(margin.div(100))).ceil();
    if (!buy.gt(0) || !sell.gt(0) || buy.gt(sell))
      issue('exchange', 'Revisa compra, venta y margen.');
    else {
      result.buy = text(buy);
      result.sell = text(sell);
    }
  }
  if (!net?.gt(0) || !buy?.gt(0) || !sell?.gt(0) || result.buy === null) return result;
  if (!doc.lines.length) issue('lines', 'Añade al menos una asignación.');
  let assigned = new D(0),
    convert = new D(0),
    crc = new D(0),
    usd = new D(0);
  for (const line of doc.lines) {
    const field = `lines.${line.id}`;
    const amount = read(line.amount, `${field}.amount`);
    if (!amount?.gt(0)) {
      issue(field, 'La asignación debe ser mayor que cero.');
      continue;
    }
    const explanation: string[] = [];
    let reserve: Decimal, raw: Decimal;
    if (line.kind === 'percent') {
      if (amount.gt(100) || line.currency !== 'USD' || line.roundUsd !== 'none') {
        issue(field, 'El porcentaje del neto USD no usa redondeo adicional.');
        continue;
      }
      reserve = net.mul(amount).div(100);
      raw = line.payCurrency === 'CRC' ? reserve.mul(buy) : reserve;
      explanation.push(`${text(amount)} % del neto USD ${text(net)} = USD ${text(reserve)}.`);
    } else if (line.kind === 'subscription') {
      const iva = read(line.iva, `${field}.iva`);
      if (!iva || iva.gt(100)) {
        issue(field, 'Revisa el porcentaje de impuesto.');
        continue;
      }
      const withTax = amount.mul(new D(1).plus(iva.div(100)));
      explanation.push(
        `${line.currency} ${text(amount)} × (1 + ${text(iva)} / 100) = ${text(withTax)}.`,
      );
      if (line.payCurrency === 'USD') {
        if (line.currency !== 'USD') {
          issue(field, 'Un precio CRC debe pagarse en CRC en este plan.');
          continue;
        }
        raw = withTax;
        reserve = money(raw);
      } else {
        const beforeRound = line.currency === 'USD' ? withTax.mul(sell) : withTax;
        raw = beforeRound.div(50).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(50);
        reserve = raw.div(buy);
        if (line.roundUsd === 'up') reserve = reserve.ceil();
        explanation.push(
          `Pago CRC ${text(beforeRound)}, al múltiplo de 50 más cercano: ${text(raw)}.`,
        );
      }
    } else if (line.currency === 'USD') {
      reserve = amount;
      raw = line.payCurrency === 'CRC' ? amount.mul(buy) : amount;
      explanation.push(`Importe original USD ${text(amount)}.`);
    } else {
      if (line.payCurrency !== 'CRC') {
        issue(field, 'Un compromiso CRC debe pagarse en CRC en este plan.');
        continue;
      }
      raw = amount;
      reserve = amount.div(buy);
      if (line.roundUsd === 'up') reserve = reserve.ceil();
      explanation.push(
        `CRC ${text(amount)} / compra presupuestaria ${text(buy)}; reserva ${line.roundUsd === 'up' ? 'al dólar superior' : 'sin redondeo adicional'}.`,
      );
    }
    const settled = money(raw);
    if (!settled.gt(0)) {
      issue(field, 'El importe final debe alcanzar al menos un centavo.');
      continue;
    }
    if (settled.gt('9000000000000') || reserve.gt('9000000000000')) {
      issue(field, 'El importe calculado excede el límite permitido.');
      continue;
    }
    explanation.push(
      `Asignación ${line.payCurrency} ${text(settled)}; reserva presupuestaria USD ${text(reserve)}.`,
    );
    assigned = assigned.plus(reserve);
    if (line.payCurrency === 'CRC') {
      convert = convert.plus(reserve);
      crc = crc.plus(settled);
    } else usd = usd.plus(settled);
    result.lines.push({
      id: line.id,
      reserveUsd: text(reserve),
      rawPayAmount: text(raw),
      payAmount: text(settled),
      payCurrency: line.payCurrency,
      explanation,
    });
  }
  if (result.lines.length !== doc.lines.length) return result;
  const free = net.minus(assigned);
  if (free.lt(0)) issue('lines', 'Las asignaciones superan el ingreso disponible.');
  Object.assign(result, {
    assigned: text(assigned),
    free: text(free),
    closing: text(net.minus(assigned).minus(free)),
    convertUsd: text(convert),
    conversionCrc: text(convert.mul(buy)),
    paymentsCrc: text(crc),
    paymentsUsd: text(usd),
    bufferCrc: text(convert.mul(buy).minus(crc)),
  });
  result.groups = ([50, 30, 20] as const).map((group) => {
    const cap = net.mul(group).div(100);
    const used = doc.lines
      .filter((l) => l.group === group)
      .reduce((total, line) => {
        const value = result.lines.find((r) => r.id === line.id);
        return total.plus(value?.reserveUsd ?? 0);
      }, new D(0));
    return { group, cap: text(cap), assigned: text(used), free: text(cap.minus(used)) };
  });
  return result;
}
