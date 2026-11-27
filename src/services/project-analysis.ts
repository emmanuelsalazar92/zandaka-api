import type { ProjectMovementGroup } from '../repositories/project-movements.repo';
import { decimal, decimalText } from '../utils/money';

function amounts() {
  return { expenses: decimal(0), refunds: decimal(0) };
}

type Amounts = ReturnType<typeof amounts>;
type Category = Amounts & { categoryId: number | null; categoryName: string | null };

function add(target: Amounts, delta: Amounts) {
  target.expenses = target.expenses.plus(delta.expenses);
  target.refunds = target.refunds.plus(delta.refunds);
}

function serialize({ expenses, refunds }: Amounts) {
  return {
    expenses: decimalText(expenses),
    refunds: decimalText(refunds),
    net: decimalText(expenses.minus(refunds)),
  };
}

// Input is ordered by accounting day and represents a single SQLite read snapshot.
export function summarizeProjectMovements(groups: Iterable<ProjectMovementGroup>) {
  const currencies = new Map<
    string,
    {
      totals: Amounts;
      days: Map<string, Amounts>;
      categories: Map<number | null, Category>;
    }
  >();
  let excludedLineCount = 0;
  let latestLedgerUpdate = '';

  for (const group of groups) {
    excludedLineCount += group.excluded;
    if (group.latestLedgerUpdate > latestLedgerUpdate)
      latestLedgerUpdate = group.latestLedgerUpdate;
    if (!group.included) continue;
    let entry = currencies.get(group.currency);
    if (!entry) {
      entry = { totals: amounts(), days: new Map(), categories: new Map() };
      currencies.set(group.currency, entry);
    }
    const delta = { expenses: decimal(group.expenseDebits).neg(), refunds: decimal(group.refunds) };
    add(entry.totals, delta);

    const day = entry.days.get(group.date) ?? amounts();
    add(day, delta);
    entry.days.set(group.date, day);

    const category = entry.categories.get(group.categoryId) ?? {
      ...amounts(),
      categoryId: group.categoryId,
      categoryName: group.categoryName,
    };
    add(category, delta);
    entry.categories.set(group.categoryId, category);
  }

  return {
    currencies: [...currencies.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, entry]) => {
        let running = decimal(0);
        const series = [...entry.days].map(([date, day]) => {
          running = running.plus(day.expenses).minus(day.refunds);
          return { date, net: decimalText(running) };
        });
        const categories = [...entry.categories.values()]
          .sort(
            (left, right) =>
              right.expenses.cmp(left.expenses) || (left.categoryId ?? 0) - (right.categoryId ?? 0),
          )
          .map(({ categoryId, categoryName, ...total }) => ({
            categoryId,
            categoryName,
            ...serialize(total),
          }));
        return { currency, ...serialize(entry.totals), series, categories };
      }),
    excludedLineCount,
    latestLedgerUpdateAt: latestLedgerUpdate || null,
  };
}
