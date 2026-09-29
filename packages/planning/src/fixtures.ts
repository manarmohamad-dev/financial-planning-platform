import { PLANNING_CONTRACT, type PlanningDocument, type PlanningEntry } from './model.js';
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function fixtureEntry(n: number, overrides: Partial<PlanningEntry> = {}): PlanningEntry {
  return {
    id: id(n),
    componentKey: `component_${n}`,
    label: `Synthetic component ${n}`,
    category: 'revenue',
    effect: 'revenue',
    currency: 'EGP',
    scope: { kind: 'company' },
    source: 'assumption',
    note: 'Synthetic planning assumption; not real company data.',
    start: '2026-01',
    end: '2026-03',
    date: null,
    driver: { kind: 'fixed', amount: '10000' },
    cashTreatment: { kind: 'profile', buckets: [{ offsetMonths: 0, proportion: '1' }] },
    committed: false,
    openingObligation: false,
    settles: null,
    ...overrides,
  };
}
export function fixtureDocument(entries: PlanningEntry[] = []): PlanningDocument {
  return {
    contractVersion: PLANNING_CONTRACT,
    title: 'Synthetic baseline',
    currency: 'EGP',
    projectionStart: '2026-01',
    horizonMonths: 3,
    requestedOutputs: ['operating', 'cash'],
    openingCash: {
      available: '50000',
      restricted: null,
      asOf: '2026-01-01',
      source: 'observed',
      note: 'Synthetic opening balance.',
    },
    coverage: {
      revenueComplete: true,
      expensesComplete: true,
      cashComplete: true,
      depreciation: 'excluded',
      revenueConvention: 'gross_with_refunds',
      settlementConvention: 'gross',
    },
    entries,
  };
}
export const fixtureNames = ['service', 'retail', 'new-company'] as const;
export function syntheticFixture(name: (typeof fixtureNames)[number]): PlanningDocument {
  if (name === 'service')
    return {
      ...fixtureDocument([
        fixtureEntry(1, {
          componentKey: 'service_sales',
          label: 'Service revenue',
          driver: { kind: 'fixed', amount: '40000' },
          cashTreatment: { kind: 'profile', buckets: [{ offsetMonths: 1, proportion: '1' }] },
        }),
        fixtureEntry(2, {
          componentKey: 'existing_payroll',
          label: 'Existing team payroll',
          category: 'payroll',
          effect: 'operating_expense',
          source: 'schedule',
          committed: true,
          driver: { kind: 'headcount', count: 2, monthlyCost: '8000', onboardingCost: null },
        }),
        fixtureEntry(3, {
          componentKey: 'office_rent',
          label: 'Office rent',
          category: 'rent',
          effect: 'operating_expense',
          source: 'schedule',
          committed: true,
          driver: { kind: 'fixed', amount: '5000' },
        }),
        fixtureEntry(4, {
          componentKey: 'software',
          label: 'Software subscriptions',
          category: 'software',
          effect: 'operating_expense',
          source: 'schedule',
          committed: true,
          driver: { kind: 'fixed', amount: '1000' },
        }),
      ]),
      title: 'Synthetic service company',
    };
  if (name === 'retail')
    return {
      ...fixtureDocument([
        fixtureEntry(10, {
          componentKey: 'retail_sales',
          label: 'Retail sales',
          driver: { kind: 'fixed', amount: '60000' },
        }),
        fixtureEntry(11, {
          componentKey: 'cost_of_sales',
          label: 'Cost of goods sold',
          category: 'cost_of_sales',
          effect: 'operating_expense',
          driver: { kind: 'fixed', amount: '36000' },
          cashTreatment: { kind: 'non_cash' },
        }),
        fixtureEntry(12, {
          componentKey: 'stock_purchases',
          label: 'Inventory purchasing payments',
          category: 'purchases',
          effect: 'cash_payment',
          source: 'schedule',
          committed: true,
          driver: { kind: 'fixed', amount: '40000' },
          cashTreatment: { kind: 'not_modeled' },
        }),
        fixtureEntry(13, {
          componentKey: 'retail_payroll',
          label: 'Shop payroll',
          category: 'payroll',
          effect: 'operating_expense',
          source: 'schedule',
          committed: true,
          driver: { kind: 'fixed', amount: '10000' },
        }),
        fixtureEntry(14, {
          componentKey: 'shop_rent',
          label: 'Shop rent',
          category: 'rent',
          effect: 'operating_expense',
          source: 'schedule',
          committed: true,
          driver: { kind: 'fixed', amount: '5000' },
        }),
        fixtureEntry(15, {
          componentKey: 'payment_fees',
          label: 'Payment processing fees',
          category: 'fees',
          effect: 'operating_expense',
          driver: { kind: 'revenue_linked', baseComponent: 'retail_sales', rate: '0.02' },
        }),
      ]),
      title: 'Synthetic retail company',
    };
  return {
    ...fixtureDocument([
      fixtureEntry(20, {
        componentKey: 'initial_sales',
        label: 'Assumed early sales',
        driver: { kind: 'fixed', amount: '12000' },
      }),
      fixtureEntry(21, {
        componentKey: 'operating_costs',
        label: 'Assumed operating costs',
        category: 'other_operating',
        effect: 'operating_expense',
        driver: { kind: 'fixed', amount: '15000' },
      }),
      fixtureEntry(22, {
        componentKey: 'setup_equipment',
        label: 'Committed equipment purchase',
        category: 'capex',
        effect: 'cash_payment',
        start: '2026-01',
        end: '2026-01',
        date: '2026-01-10',
        source: 'schedule',
        committed: true,
        driver: { kind: 'fixed', amount: '18000' },
        cashTreatment: { kind: 'not_modeled' },
      }),
    ]),
    title: 'Synthetic new company',
    openingCash: {
      available: '30000',
      restricted: null,
      asOf: '2026-01-01',
      source: 'assumption',
      note: 'Explicit synthetic opening funding assumption.',
    },
  };
}
