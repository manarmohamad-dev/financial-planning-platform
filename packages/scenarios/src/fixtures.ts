import { fixtureEntry } from '../../planning/src/fixtures.js';
import type { BaselineSnapshot, PlanningEntry } from '../../planning/src/model.js';
import { derivedId } from './engine.js';
import { SCENARIO_CONTRACT, type ScenarioChange, type ScenarioDocument } from './model.js';
export const demoDecisions = ['sales', 'hiring', 'spending', 'expansion', 'combined'] as const;
export function entryChange(
  key: string,
  decision: ScenarioChange['decision'],
  overrides: Partial<PlanningEntry>,
): ScenarioChange {
  const id = derivedId(`synthetic-change/${key}`);
  const entry = fixtureEntry(100, {
    id: derivedId(`synthetic-entry/${key}`),
    componentKey: key,
    label: `Synthetic ${key}`,
    source: 'assumption',
    note: 'Explicit synthetic decision assumption.',
    ...overrides,
  });
  return {
    id,
    label: entry.label,
    decision,
    scope: { kind: 'company' },
    currency: entry.currency,
    source: { kind: entry.source, note: entry.note, reference: 'synthetic-example' },
    dependencies: [],
    primitive: { kind: 'entry', entry },
  };
}
export function syntheticScenario(
  type: (typeof demoDecisions)[number],
  b: BaselineSnapshot,
): ScenarioDocument {
  const start = b.document.projectionStart;
  const end = b.document.entries.find((e) => e.effect === 'revenue')!.end;
  const revenue = b.document.entries.find((e) => e.effect === 'revenue')!;
  const sales: ScenarioChange = {
    id: derivedId('demo/sales'),
    label: 'Sales decrease 20%',
    decision: 'sales',
    scope: { kind: 'company' },
    currency: b.document.currency,
    source: {
      kind: 'assumption',
      note: 'Synthetic sales decrease, with baseline collection timing retained.',
      reference: 'demo-sales',
    },
    dependencies: [],
    primitive: {
      kind: 'adjust',
      targetEntryId: revenue.id,
      start,
      end,
      operation: 'percentage_decrease',
      value: '0.20',
      cashReplacement: null,
    },
  };
  const hiring = entryChange('additional_team', 'hiring', {
    start,
    end,
    category: 'payroll',
    effect: 'operating_expense',
    driver: { kind: 'headcount', count: 2, monthlyCost: '5000', onboardingCost: '2000' },
  });
  const spending = entryChange('extra_marketing', 'spending', {
    start,
    end,
    category: 'marketing',
    effect: 'operating_expense',
    driver: { kind: 'fixed', amount: '3000' },
  });
  const expansion = [
    entryChange('branch_investment', 'expansion', {
      start,
      end: start,
      category: 'capex',
      effect: 'cash_payment',
      driver: { kind: 'fixed', amount: '15000' },
      cashTreatment: { kind: 'not_modeled' },
      committed: true,
    }),
    entryChange('branch_costs', 'expansion', {
      start,
      end,
      category: 'rent',
      effect: 'operating_expense',
      driver: { kind: 'fixed', amount: '3000' },
    }),
    entryChange('branch_payroll', 'expansion', {
      start,
      end,
      category: 'payroll',
      effect: 'operating_expense',
      driver: { kind: 'headcount', count: 1, monthlyCost: '4000', onboardingCost: null },
    }),
    entryChange('branch_sales', 'expansion', {
      start,
      end,
      driver: { kind: 'fixed', amount: '12000' },
      cashTreatment: { kind: 'profile', buckets: [{ offsetMonths: 1, proportion: '1' }] },
    }),
  ];
  const changes =
    type === 'sales'
      ? [sales]
      : type === 'hiring'
        ? [hiring]
        : type === 'spending'
          ? [spending]
          : type === 'expansion'
            ? expansion
            : [...expansion, hiring, spending, sales];
  return {
    contractVersion: SCENARIO_CONTRACT,
    title: `Synthetic ${type} decision`,
    type,
    baselineVersionId: b.baselineVersionId,
    currency: b.document.currency,
    changes,
    expansion: ['expansion', 'combined'].includes(type)
      ? {
          revenueMode: 'modeled',
          costsReviewed: true,
          note: 'Explicit synthetic expansion revenue; company-level impact only.',
        }
      : null,
    paybackRequested: type === 'expansion',
  };
}
