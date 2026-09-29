import { randomUUID } from 'node:crypto';
import { monthsFrom, type PlanningDocument } from '../packages/planning/src/model.js';
import type { History } from '../packages/forecasting/src/model.js';
export function history(
  n = 36,
  horizon = 3,
  value: (i: number) => string = (i) => String(100 + i * 2),
): History {
  return {
    currency: 'EGP',
    componentKey: 'sales',
    category: 'revenue',
    effect: 'revenue',
    origin: monthsFrom('2020-01', n + 1)[n],
    horizon,
    nature: 'variable',
    structuralChange: false,
    sourceVersionIds: [randomUUID()],
    observations: monthsFrom('2020-01', n).map((period, i) => ({
      period,
      value: value(i),
      planningVersionId: '11111111-1111-4111-8111-111111111111',
      entryId: randomUUID(),
      source: 'observed',
      committed: false,
      partial: false,
    })),
  };
}
export function documents(
  n = 36,
  value: (i: number) => string = (i) => String(100 + i * 2),
): PlanningDocument[] {
  const h = history(n);
  return Array.from({ length: Math.ceil(n / 12) }, (_, part) => ({
    contractVersion: 'baseline-1.0.0',
    title: `Synthetic Actuals ${2020 + part}`,
    currency: 'EGP',
    projectionStart: monthsFrom('2020-01', part * 12 + 1)[part * 12],
    horizonMonths: 12,
    requestedOutputs: ['operating'],
    openingCash: null,
    coverage: {
      revenueComplete: true,
      expensesComplete: true,
      cashComplete: false,
      depreciation: 'not_applicable',
      revenueConvention: 'net_of_refunds',
      settlementConvention: 'gross',
    },
    entries: h.observations
      .slice(part * 12, part * 12 + 12)
      .map((p, i) => ({
        id: p.entryId,
        componentKey: 'sales',
        label: 'Sales',
        category: 'revenue',
        effect: 'revenue',
        currency: 'EGP',
        scope: { kind: 'company' },
        source: 'observed',
        note: 'Complete synthetic monthly Actual',
        start: p.period,
        end: p.period,
        date: null,
        driver: { kind: 'fixed', amount: value(part * 12 + i) },
        cashTreatment: { kind: 'not_modeled' },
        committed: false,
        openingObligation: false,
        settles: null,
      })),
  }));
}
export function futureTemplate(): PlanningDocument {
  const d = documents()[0];
  d.title = 'Synthetic future template';
  d.projectionStart = '2023-01';
  d.horizonMonths = 3;
  d.requestedOutputs = ['operating', 'cash'];
  d.coverage.cashComplete = true;
  d.openingCash = {
    available: '1000',
    restricted: '0',
    asOf: '2023-01-01',
    source: 'observed',
    note: 'Synthetic opening cash',
  };
  d.entries = [
    {
      ...d.entries[0],
      id: randomUUID(),
      source: 'assumption',
      start: '2023-01',
      end: '2023-03',
      driver: { kind: 'fixed', amount: '100' },
      cashTreatment: { kind: 'profile', buckets: [{ offsetMonths: 0, proportion: '1' }] },
    },
    {
      ...d.entries[0],
      id: randomUUID(),
      componentKey: 'rent',
      label: 'Rent',
      category: 'rent',
      effect: 'operating_expense',
      source: 'schedule',
      committed: true,
      start: '2023-01',
      end: '2023-03',
      driver: { kind: 'fixed', amount: '50' },
      cashTreatment: { kind: 'profile', buckets: [{ offsetMonths: 0, proportion: '1' }] },
    },
  ];
  return d;
}
