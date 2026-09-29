import { parseTemplate, BindingPipe, LiteralPrimitive } from '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { translate, formatMoney, formatDate } from '../apps/web/src/i18n.js';
import { AR } from '../apps/web/src/locales/ar.js';
import { EN } from '../apps/web/src/locales/en.js';
import { FinancialPath } from '../apps/web/src/chart-model.js';

describe('Presentation localization and financial integrity', () => {
  it('covers the English catalogue and preserves every interpolation slot', () => {
    for (const key of EN) {
      expect(AR[key], key).toBeTruthy();
      expect([...AR[key].matchAll(/\{\d+\}/g)].map((x) => x[0]).sort(), key).toEqual(
        [...key.matchAll(/\{\d+\}/g)].map((x) => x[0]).sort(),
      );
    }
  });
  it('covers static translated strings in all HTML templates and shared components', () => {
    const files = readdirSync('apps/web/src').filter((f) => f.endsWith('.html') || f === 'ui.ts');
    for (const file of files) {
      const source = readFileSync('apps/web/src/' + file, 'utf8');
      const templates = file.endsWith('.html')
        ? [source]
        : [...source.matchAll(/template:\s*`([^`]+)`/g)].map((x) => x[1]);
      for (const template of templates) {
        const seen = new Set<object>();
        const visit = (v: unknown): void => {
          if (!v || typeof v !== 'object' || seen.has(v)) return;
          seen.add(v);
          if (
            v instanceof BindingPipe &&
            v.name === 't' &&
            v.exp instanceof LiteralPrimitive &&
            typeof v.exp.value === 'string'
          ) {
            const key = v.exp.value.replace(/\s+/g, ' ').trim();
            expect(AR[key], `${file}: ${key}`).toBeTruthy();
          }
          for (const child of Object.values(v)) visit(child);
        };
        visit(parseTemplate(template, file).nodes);
      }
    }
  });
  it('never translates source titles or financial values passed as parameters', () => {
    expect(translate('Baseline {0}', 'ar', ['My original plan 125.75'])).toBe(
      'خط الأساس \u2068My original plan 125.75\u2069',
    );
    expect(translate('Source: {0}', 'en', ['Rent & equipment <literal>'])).toBe(
      'Source: Rent & equipment <literal>',
    );
  });
  it('uses Gregorian locale dates and an explicit UTC label without changing stored timestamps', () => {
    expect(formatDate('2026-09-22T12:34:03Z', 'en')).toContain('22 Sept 2026');
    expect(formatDate('2026-09-22T12:34:03Z', 'ar')).toContain('٢٠٢٦');
    expect(formatDate('2026-09-22T12:34:03Z', 'ar')).toContain('UTC');
    expect(formatDate('2026-09', 'ar')).toBe('2026-09');
  });
  it('distinguishes missing financial evidence from an explicit zero', () => {
    expect(formatMoney(null, 'en')).toBe('Not available');
    expect(formatMoney(undefined, 'ar')).toBe('غير متاح');
    expect(formatMoney('', 'ar')).toBe('غير متاح');
    expect(formatMoney('0', 'en')).toBe('0.00');
    expect(formatMoney('0', 'ar')).toBe('٠٫٠٠');
  });
  it('formats SAR and negative decimals without modifying authoritative values', () => {
    const source = '-1234.56';
    expect(formatMoney(source, 'en', 'SAR')).toContain('1,234.56');
    expect(formatMoney(source, 'ar', 'SAR')).toContain('١٬٢٣٤٫٥٦');
    expect(source).toBe('-1234.56');
    expect(formatMoney('9007199254740993.25', 'en')).toBe('9,007,199,254,740,993.25');
  });
  it('does not draw an invented line across unknown cash values', () => {
    const chart = new FinancialPath();
    chart.periods = [
      { period: '2026-01', closingCash: '100', revenue: '10' },
      { period: '2026-02', closingCash: null, revenue: '20' },
    ];
    const original = JSON.stringify(chart.periods);
    expect(chart.line('closingCash')).toBe('');
    expect(chart.line('revenue')).not.toBe('');
    expect(JSON.stringify(chart.periods)).toBe(original);
  });
  it('keeps zero/negative paths finite and chronological', () => {
    const chart = new FinancialPath();
    chart.periods = [
      { period: '2026-01', closingCash: '0' },
      { period: '2026-02', closingCash: '-4' },
    ];
    expect(chart.x(0)).toBeLessThan(chart.x(1));
    expect(chart.line('closingCash')).not.toMatch(/NaN|Infinity/);
    expect(chart.y('-4')).toBeGreaterThan(chart.y('0'));
  });
  it('uses identical vertical geometry for paired baseline and scenario charts', () => {
    const baseline = new FinancialPath();
    const scenario = new FinancialPath();
    baseline.periods = [{ period: '2026-01', closingCash: '800' }];
    scenario.periods = [{ period: '2026-01', closingCash: '290' }];
    const shared = baseline.periods.concat(scenario.periods);
    baseline.scalePeriods = shared;
    scenario.scalePeriods = shared;
    expect(baseline.bounds).toEqual(scenario.bounds);
    expect(baseline.y('290')).toBe(scenario.y('290'));
    expect(scenario.y('290')).toBeGreaterThan(baseline.y('800'));
  });
});
