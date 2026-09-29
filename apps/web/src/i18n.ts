import { Injectable, Pipe, PipeTransform, inject, signal } from '@angular/core';
import { AR } from './locales/ar.js';
export type Locale = 'en' | 'ar';
export function translate(value: string, locale: Locale, params: unknown[] = []): string {
  const key = value.replace(/\s+/g, ' ').trim();
  if (locale === 'ar' && !AR[key]) {
    const risk = key.match(
      /^(Projected closing cash|Operating result) is below the declared ([A-Z]{3}) (-?[\d.]+) threshold from (\d{4}-\d{2}) through (\d{4}-\d{2})\.$/,
    );
    if (risk)
      return translate(
        risk[1] + ' is below the declared {0} {1} threshold from {2} through {3}.',
        locale,
        risk.slice(2),
      );
    const history = key.match(
      /^(\d+)-month evaluation requires at least (\d+) observations: 12 training months plus three non-overlapping (\d+)-month validation windows\.$/,
    );
    if (history)
      return translate(
        '{0}-month evaluation requires at least {1} observations: 12 training months plus three non-overlapping {2}-month validation windows.',
        locale,
        history.slice(1),
      );
  }
  const translated = locale === 'ar' ? (AR[key] ?? key) : key;
  return translated.replace(/\{(\d+)\}/g, (_, n) => {
    const param = String(params[Number(n)] ?? '');
    // Isolate source IDs, dates and user text in mixed-direction sentences.
    return locale === 'ar' ? '\u2068' + param + '\u2069' : param;
  });
}
export function formatMoney(value: string | null | undefined, locale: Locale, currency = '') {
  if (value === null || value === undefined || value === '')
    return translate('Not available', locale);
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  // Intl accepts a decimal string without converting authoritative money to binary arithmetic.
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...(currency ? { style: 'currency', currency, currencyDisplay: 'code' } : {}),
  }).format(value as unknown as number);
}
@Injectable({ providedIn: 'root' })
export class LocaleService {
  readonly locale = signal<Locale>(
    localStorage.getItem('decision-studio-locale') === 'ar' ? 'ar' : 'en',
  );
  constructor() {
    this.apply();
  }
  set(locale: Locale) {
    this.locale.set(locale);
    localStorage.setItem('decision-studio-locale', locale);
    this.apply();
  }
  private apply() {
    document.documentElement.lang = this.locale();
    document.documentElement.dir = this.locale() === 'ar' ? 'rtl' : 'ltr';
  }
  t(value: string, params: unknown[] = []) {
    return translate(value, this.locale(), params);
  }
}
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  transform(value: unknown, params: unknown[] = []) {
    return this.locale.t(String(value ?? ''), params);
  }
}
@Pipe({ name: 'money', standalone: true, pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  transform(value: string | null | undefined, currency = '') {
    return formatMoney(value, this.locale.locale(), currency);
  }
}

export function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) || Number.isNaN(date.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    calendar: 'gregory',
    timeZone: 'UTC',
    ...(value.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {}),
  };
  return (
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', options).format(date) +
    (value.includes('T') ? ' UTC' : '')
  );
}
@Pipe({ name: 'localDate', standalone: true, pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  transform(value: string) {
    return formatDate(value, this.locale.locale());
  }
}
