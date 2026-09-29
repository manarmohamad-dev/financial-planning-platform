export const comparisonMetrics = [
  'revenue',
  'operatingExpenses',
  'operatingResult',
  'cashInflows',
  'cashOutflows',
  'netCashMovement',
  'closingCash',
] as const;
export type Metric = (typeof comparisonMetrics)[number];
