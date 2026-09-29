export type ChartPeriod = {
  period: string;
  closingCash: string | null;
  revenue?: string | null;
  operatingExpenses?: string | null;
};

/** SVG geometry only; no financial calculations or missing-value imputation. */
export class FinancialPath {
  periods: ChartPeriod[] = [];
  scalePeriods: ChartPeriod[] = [];
  readonly keys = ['closingCash', 'revenue', 'operatingExpenses'] as const;
  readonly colors = { closingCash: '#0f2744', revenue: '#0d9488', operatingExpenses: '#b7791f' };
  get points() {
    return this.periods;
  }
  x(index: number) {
    return 66 + (index * 704) / Math.max(1, this.points.length - 1);
  }
  // Numbers below scale SVG geometry only. Financial values remain backend-owned decimal strings.
  get bounds() {
    const values = (this.scalePeriods.length ? this.scalePeriods : this.points)
      .flatMap((p) => this.keys.map((k) => p[k]))
      .filter((v) => v != null)
      .map(Number);
    return { min: Math.min(0, ...values), max: Math.max(1, ...values) };
  }
  get ticks() {
    const { min, max } = this.bounds;
    return [0, 0.5, 1].map((f) => ({
      y: 190 - f * 160,
      label: new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
        min + f * (max - min),
      ),
    }));
  }
  y(value: string) {
    const { min, max } = this.bounds;
    return 190 - ((Number(value) - min) / (max - min)) * 160;
  }
  line(key: (typeof this.keys)[number]) {
    if (this.points.some((p) => p[key] == null)) return '';
    return this.points.map((p, i) => `${this.x(i)},${this.y(p[key]!)}`).join(' ');
  }
}
