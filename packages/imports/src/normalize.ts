import { Decimal } from 'decimal.js';
import { Money, dateSchema, periodSchema } from '../../contracts/src/index.js';
import { evaluateCapabilities } from '../../planning/src/engine.js';
import {
  PLANNING_CONTRACT,
  planningDocumentSchema,
  monthsFrom,
  isCash,
  type PlanningDocument,
  type PlanningEntry,
} from '../../planning/src/model.js';
import { derivedId } from '../../scenarios/src/engine.js';
import {
  mappingSchema,
  IMPORT_CONTRACT,
  type Mapping,
  type RawImport,
  type Validation,
  type ImportIssue,
  type Origin,
} from './model.js';
import { inspect, normalizeHeader } from './parser.js';
export function initialMapping(raw: RawImport, sheet: string, headerRow = 1): Mapping {
  const i = inspect(raw, sheet, headerRow);
  return {
    contractVersion: IMPORT_CONTRACT,
    sheet,
    headerRow,
    fingerprint: i.fingerprint,
    title: 'Imported planning dataset',
    projectionStart: new Date().toISOString().slice(0, 7),
    horizonMonths: 3,
    requestedOutputs: ['operating', 'cash'],
    numberLocale: null,
    dateFormat: null,
    currencyConfirmed: false,
    basisConfirmed: false,
    scopeConfirmed: false,
    columns: i.headers.map((_, column) => ({ column, role: 'unreviewed', reason: '' })),
    rules: [],
    excludedRows: [],
    reviewedRows: [],
    coverageFrom: null,
    coverageTo: null,
    coverageReviewed: false,
    coverage: {
      revenueComplete: false,
      expensesComplete: false,
      cashComplete: false,
      depreciation: 'excluded',
      revenueConvention: 'gross_with_refunds',
      settlementConvention: 'gross',
    },
    opening: null,
    sourceResolution: { mode: null, note: '' },
  };
}
export function parseAmount(
  raw: string,
  locale: Mapping['numberLocale'],
  numericCell = false,
): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!locale)
    throw new Error('Choose the decimal/thousands convention before interpreting amounts.');
  if (numericCell) {
    if (s.length > 80 || Math.abs(Number(/[eE]([+-]?\d+)$/.exec(s)?.[1] ?? 0)) > 24)
      throw new Error('Numeric exponent or precision exceeds the supported range.');
    if (!/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s))
      throw new Error('Invalid workbook numeric value.');
    return new Decimal(s).toFixed();
  }
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('-')) {
    if (negative) throw new Error('Conflicting negative signs.');
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  const dot = locale === 'decimal_dot';
  const decimal = dot ? '.' : ',';
  const group = dot ? ',' : '.';
  s = s.replace(/[\u00a0\u202f]/g, ' ');
  const segments = s.split(decimal);
  if (segments.length > 2 || !/^\d*$/.test(segments[1] ?? ''))
    throw new Error('Amount does not match the selected decimal convention.');
  const integer = segments[0];
  const separators = integer.includes(group) ? group : integer.includes(' ') ? ' ' : null;
  if (separators) {
    const parts = integer.split(separators);
    if (!/^\d{1,3}$/.test(parts[0]) || parts.slice(1).some((p) => !/^\d{3}$/.test(p)))
      throw new Error('Invalid or ambiguous thousands grouping.');
  } else if (!/^\d+$/.test(integer))
    throw new Error('Amount contains unsupported text or currency.');
  const n =
    integer.split(group).join('').replaceAll(' ', '') +
    (segments.length === 2 ? '.' + segments[1] : '');
  if (!/^\d+(?:\.\d+)?$/.test(n)) throw new Error('Invalid amount.');
  return (negative ? '-' : '') + n;
}
export function parsePeriod(
  raw: string,
  format: Mapping['dateFormat'],
): { period: string; date: string | null } {
  const s = raw.trim();
  if (!format)
    throw new Error('Select a date convention; ambiguous day/month order is never guessed.');
  if (periodSchema.safeParse(s).success) return { period: s, date: null };
  let date = s;
  if (format === 'excel1900' || format === 'excel1904') {
    if (!/^\d+$/.test(s))
      throw new Error('Excel dates must be integer serial days or YYYY-MM periods.');
    const n = Number(s);
    if (n < 1 || n > 2950000 || (format === 'excel1900' && n === 60))
      throw new Error('Invalid Excel date serial.');
    date = new Date(
      Date.UTC(
        format === 'excel1900' ? 1899 : 1904,
        format === 'excel1900' ? 11 : 0,
        format === 'excel1900' ? 31 : 1,
      ) +
        (n - (format === 'excel1900' && n > 60 ? 1 : 0)) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  } else if (format === 'dmy' || format === 'mdy') {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m)
      date = `${m[3]}-${(format === 'dmy' ? m[2] : m[1]).padStart(2, '0')}-${(format === 'dmy' ? m[1] : m[2]).padStart(2, '0')}`;
  }
  if (!dateSchema.safeParse(date).success)
    throw new Error('Invalid date or date format. Use one explicitly selected convention.');
  return { period: date.slice(0, 7), date };
}
export function normalizeImport(
  raw: RawImport,
  rawMapping: Mapping,
  currency: PlanningDocument['currency'],
  importId: string,
  existing: PlanningDocument[] = [],
): Validation {
  const m = mappingSchema.parse(rawMapping),
    i = inspect(raw, m.sheet, m.headerRow),
    sheet = raw.sheets.find((s) => s.name === m.sheet)!;
  const issues: ImportIssue[] = [],
    lineage: Origin[] = [];
  const flag = (
    code: string,
    message: string,
    severity: ImportIssue['severity'] = 'blocker',
    row?: number,
    column?: number,
  ) =>
    issues.push({
      code,
      severity,
      message,
      ...(row ? { row } : {}),
      ...(column === undefined ? {} : { column }),
    });
  if (m.fingerprint !== i.fingerprint)
    flag(
      'STRUCTURE_CHANGED',
      'The selected sheet headers differ from this mapping. Review the new structure before using a template.',
    );
  if (
    m.columns.length !== i.columns ||
    new Set(m.columns.map((c) => c.column)).size !== i.columns ||
    m.columns.some((c) => c.column >= i.columns)
  )
    flag('COLUMN_REVIEW', 'Every source column must be mapped or explicitly excluded.');
  for (const c of m.columns) {
    if (c.role === 'unreviewed')
      flag(
        'COLUMN_UNREVIEWED',
        `Choose the meaning of column ${c.column + 1}; suggestions are not confirmations.`,
        'blocker',
        undefined,
        c.column,
      );
    if (c.role === 'ignore' && !c.reason.trim())
      flag(
        'EXCLUSION_REASON',
        'Explain why this column is excluded so omitted financial data is visible.',
        'blocker',
        undefined,
        c.column,
      );
  }
  const role = (name: Mapping['columns'][number]['role']) =>
    m.columns.filter((c) => c.role === name).map((c) => c.column);
  for (const name of [
    'period',
    'end_period',
    'currency',
    'basis',
    'scope',
    'opening_available',
    'opening_restricted',
  ] as const)
    if (role(name).length > 1) flag('AMBIGUOUS_COLUMN', `Select at most one ${name} column.`);
  if (role('period').length !== 1)
    flag(
      'PERIOD_REQUIRED',
      'A period/date column is needed to place financial activity in the correct month.',
    );
  if (!m.numberLocale)
    flag(
      'NUMBER_LOCALE',
      'Choose the numeric convention before interpreting decimal and thousands separators.',
    );
  if (!m.dateFormat)
    flag('DATE_FORMAT', 'Choose the date convention to avoid reversing month and day.');
  if (!m.currencyConfirmed)
    flag(
      'CURRENCY_CONFIRM',
      'Confirm the source currency matches this workspace; no conversion is performed.',
    );
  if (!m.basisConfirmed)
    flag(
      'BASIS_CONFIRM',
      'Confirm the distinction between Actual, Budget, Forecast and Assumption.',
    );
  if (!m.scopeConfirmed)
    flag(
      'SCOPE_CONFIRM',
      'Confirm company-wide scope; branch/department analysis is not supported.',
    );
  if (!m.coverageReviewed || !m.coverageFrom || !m.coverageTo)
    flag(
      'COVERAGE_REQUIRED',
      'Declare and review the source coverage start/end dates. Incomplete months are not assumed complete.',
    );
  const months = monthsFrom(m.projectionStart, m.horizonMonths),
    last = months.at(-1)!;
  let partial = false;
  if (m.coverageFrom && m.coverageTo) {
    if (
      m.coverageTo < m.coverageFrom ||
      m.coverageFrom.slice(0, 7) !== m.projectionStart ||
      m.coverageTo.slice(0, 7) !== last
    )
      flag(
        'COVERAGE_RANGE',
        'Declared coverage must span the selected planning months. Select the appropriate supported horizon.',
      );
    const endDay = new Date(
      Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0),
    ).getUTCDate();
    partial = m.coverageFrom !== m.projectionStart + '-01' || m.coverageTo !== `${last}-${endDay}`;
    if (partial)
      flag(
        'PARTIAL_PERIOD',
        'Partial source months are used only as supplied amounts, with no extrapolation. They do not establish full-month revenue, profitability or within-month liquidity.',
        'warning',
      );
  }
  if (m.sourceResolution.mode !== 'new_dataset' || !m.sourceResolution.note.trim())
    flag(
      'SOURCE_SELECTION',
      'Explicitly select a new standalone dataset and document source selection. Existing manual/imported versions are never overwritten or automatically merged.',
    );
  for (const w of i.warnings) flag('STRUCTURAL_WARNING', w, 'warning');
  const excludes = new Map(m.excludedRows.map((x) => [x.row, x.reason]));
  const reviews = new Map(m.reviewedRows.map((x) => [x.row, x.reason]));
  for (const f of i.flaggedRows) {
    if (f.reason === 'Blank row') continue;
    if (
      !excludes.has(f.row) &&
      (!reviews.has(f.row) ||
        f.reason === 'Repeated header' ||
        f.reason.startsWith('Possible total'))
    )
      flag(
        'ROW_REVIEW',
        f.reason + ' Explicit row exclusion is required for totals and repeated headers.',
        'blocker',
        f.row,
      );
    else if (reviews.has(f.row) && !excludes.has(f.row))
      flag(
        'REVIEWED_DUPLICATE',
        'Duplicate-looking row retained with a documented distinct-record explanation.',
        'warning',
        f.row,
      );
  }
  if (excludes.size)
    flag(
      'ROWS_EXCLUDED',
      `${excludes.size} source row(s) excluded with recorded reasons. Review coverage after exclusions.`,
      'warning',
    );
  if (m.columns.some((c) => c.role === 'ignore'))
    flag(
      'COLUMNS_EXCLUDED',
      'Some source columns were explicitly excluded. Their values will not be included in this dataset.',
      'warning',
    );
  if (new Set(m.rules.map((r) => r.id)).size !== m.rules.length)
    flag('RULE_DUPLICATE', 'Mapping rules require distinct identities.');
  for (const c of role('amount'))
    if (!m.rules.some((r) => r.column === c))
      flag(
        'AMOUNT_UNMAPPED',
        'This amount column needs at least one reviewed financial rule.',
        'blocker',
        undefined,
        c,
      );
  const doc: PlanningDocument = {
    contractVersion: PLANNING_CONTRACT,
    title: m.title,
    currency,
    projectionStart: m.projectionStart,
    horizonMonths: m.horizonMonths,
    requestedOutputs: m.requestedOutputs,
    openingCash: null,
    coverage: m.coverage,
    entries: [],
  };
  const openings: {
    field: 'available' | 'restricted';
    value: string;
    row: number;
    column: number;
  }[] = [];
  const claimed = new Set<string>();
  const entryMap = new Map<string, PlanningEntry>();
  const basisMap = new Map<string, string>();
  const at = (r: number, c: number | undefined) =>
    c === undefined ? '' : (sheet.rows[r - 1]?.[c]?.value ?? '');
  const origin = (
    row: number,
    column: number,
    entryId: string | null,
    field: string,
    basis: string,
    ruleId: string | null,
  ) =>
    lineage.push({
      entryId,
      field,
      sheet: m.sheet,
      row,
      column,
      header: i.headers[column] ?? '',
      rawValue: at(row, column),
      originalBasis: basis,
      mappingRuleId: ruleId,
    });
  for (let row = m.headerRow + 1; row <= sheet.rows.length; row++) {
    const cells = sheet.rows[row - 1];
    if (excludes.has(row) || !cells.some((c) => c.value.trim())) continue;
    let p: { period: string; date: string | null };
    try {
      p = parsePeriod(at(row, role('period')[0]), m.dateFormat);
    } catch (e) {
      flag('PERIOD_INVALID', (e as Error).message, 'blocker', row);
      continue;
    }
    if (p.period < m.projectionStart || p.period > last) {
      flag(
        'OUTSIDE_HORIZON',
        'This row is outside the selected horizon. Explicitly exclude it or change the planning period.',
        'blocker',
        row,
      );
      continue;
    }
    if (
      p.date &&
      m.coverageFrom &&
      m.coverageTo &&
      (p.date < m.coverageFrom || p.date > m.coverageTo)
    )
      flag('DATE_COVERAGE', 'This dated row is outside declared source coverage.', 'blocker', row);
    const cur = at(row, role('currency')[0]).trim().toUpperCase();
    if (role('currency').length && cur !== currency)
      flag(
        'CURRENCY_MISMATCH',
        'Source currency must equal the workspace currency on every included row. Blank currency is not converted or guessed.',
        'blocker',
        row,
      );
    const scope = normalizeHeader(at(row, role('scope')[0]));
    if (role('scope').length && !['company', 'all company', 'company-wide'].includes(scope))
      flag(
        'SCOPE_UNSUPPORTED',
        'Only explicitly company-wide rows are supported; do not silently aggregate branches.',
        'blocker',
        row,
      );
    for (const [name, field] of [
      ['opening_available', 'available'],
      ['opening_restricted', 'restricted'],
    ] as const) {
      const column = role(name)[0];
      if (column !== undefined && at(row, column).trim()) {
        try {
          if (role('basis').length && normalizeHeader(at(row, role('basis')[0])) !== 'actual')
            throw new Error(
              'Imported opening balances require Actual basis; supply an explicitly sourced manual assumption for a budget balance.',
            );
          const amount = parseAmount(
            at(row, column),
            m.numberLocale,
            cells[column]?.kind === 'number',
          );
          if (p.period !== m.projectionStart || (p.date && p.date !== m.projectionStart + '-01'))
            throw new Error(
              'Opening cash must be the balance immediately before the first planning month.',
            );
          if (amount === null || amount.startsWith('-'))
            throw new Error('Opening cash must be an explicit nonnegative value.');
          openings.push({ field, value: Money.parse(amount, currency).serialize(), row, column });
          origin(row, column, null, 'opening.' + field, 'actual', null);
        } catch (e) {
          flag('OPENING_INVALID', (e as Error).message, 'blocker', row, column);
        }
      }
    }
    for (const rule of m.rules) {
      if (!role('amount').includes(rule.column)) {
        flag('RULE_COLUMN', 'A financial rule must reference a column marked Amount.');
        continue;
      }
      if (rule.filter && at(row, rule.filter.column).trim() !== rule.filter.value) continue;
      const key = `${row}/${rule.column}`;
      if (claimed.has(key)) {
        flag(
          'CELL_DOUBLE_COUNT',
          'Two mapping rules include the same source amount. Make filters mutually exclusive.',
          'blocker',
          row,
          rule.column,
        );
        continue;
      }
      claimed.add(key);
      if (!rule.semanticConfirmed || !rule.note.trim()) {
        flag(
          'MEANING_UNCONFIRMED',
          'Confirm financial meaning and explain whether this is recognition, payment or another supported effect.',
          'blocker',
          row,
          rule.column,
        );
        continue;
      }
      const rawBasis = normalizeHeader(at(row, role('basis')[0]) || rule.basis || '');
      if (!['actual', 'budget', 'forecast', 'assumption', 'schedule'].includes(rawBasis)) {
        flag(
          'BASIS_REQUIRED',
          'Select or map a supported financial basis; Actual/Budget/Forecast must remain distinct.',
          'blocker',
          row,
          rule.column,
        );
        continue;
      }
      const header = normalizeHeader(i.headers[rule.column]);
      const hinted = /\b(actual|budget|forecast)\b/.exec(header)?.[1];
      if (hinted && hinted !== rawBasis)
        flag(
          'BASIS_CONFLICT',
          'The column label and selected financial basis conflict. Resolve the source meaning.',
          'blocker',
          row,
          rule.column,
        );
      if (rawBasis === 'forecast') {
        flag(
          'FORECAST_UNSUPPORTED',
          'Company-supplied Forecast is preserved as a source label but cannot feed M2 forecast evidence. Exclude it; platform forecasting is not implemented.',
          'blocker',
          row,
          rule.column,
        );
        continue;
      }
      if (rawBasis === 'budget' && !rule.approveBudgetAsAssumption) {
        flag(
          'BUDGET_APPROVAL',
          'Budget is not Actual. Explicitly approve this budget as a planning assumption or exclude it.',
          'blocker',
          row,
          rule.column,
        );
        continue;
      }
      if (rawBasis === 'budget')
        flag(
          'BUDGET_ASSUMPTION',
          'Supplied Budget is used as an explicitly approved assumption, with original Budget lineage preserved.',
          'warning',
          row,
          rule.column,
        );
      const currencyLabels = header.match(/\b(?:egp|usd|sar|aed|eur|gbp)\b/g) ?? [];
      if (currencyLabels.some((x) => x.toUpperCase() !== currency))
        flag(
          'CURRENCY_LABEL',
          'Monetary column label conflicts with the workspace currency.',
          'blocker',
          row,
          rule.column,
        );
      let amount: string;
      try {
        const parsed = parseAmount(
          at(row, rule.column),
          m.numberLocale,
          cells[rule.column]?.kind === 'number',
        );
        if (parsed === null)
          throw new Error(
            'A mapped amount is blank. Supply data or explicitly exclude the row; blank never means zero.',
          );
        if (!rule.sign)
          throw new Error(
            'Confirm whether expenses are supplied as positive amounts or negative accounting outflows.',
          );
        let n = Money.parse(parsed, currency);
        if (rule.sign === 'negative_outflow') {
          if (
            ![
              'operating_expense',
              'non_operating_expense',
              'cash_payment',
              'revenue_reduction',
            ].includes(rule.effect)
          )
            throw new Error(
              'Negative-outflow convention is only valid for costs/payments/refunds.',
            );
          if (n.compare(Money.parse('0', currency)) > 0)
            throw new Error(
              'Positive amount conflicts with the chosen negative-outflow convention.',
            );
          n = Money.parse('0', currency).subtract(n);
        }
        if (n.compare(Money.parse('0', currency)) < 0)
          throw new Error('Negative amount requires an explicit supported outflow convention.');
        amount = n.serialize();
      } catch (e) {
        flag('AMOUNT_INVALID', (e as Error).message, 'blocker', row, rule.column);
        continue;
      }
      let end = p.period;
      if (rule.behavior === 'recurring') {
        try {
          end = parsePeriod(at(row, role('end_period')[0]), m.dateFormat).period;
          if (end < p.period || end > last)
            throw new Error('Recurring end period must be within the horizon and at/after start.');
        } catch (e) {
          flag('END_PERIOD_REQUIRED', (e as Error).message, 'blocker', row);
          continue;
        }
      }
      if (rule.behavior === 'dated_detail' && !p.date) {
        flag(
          'DETAIL_DATE',
          'Dated-detail aggregation requires full dates; monthly aggregates cannot be mixed with daily details.',
          'blocker',
          row,
        );
        continue;
      }
      if (isCash(rule.effect) && rule.timing !== 'direct_cash')
        flag(
          'DIRECT_TIMING',
          'Direct cash entries already use payment/receipt months; choose Direct cash schedule.',
          'blocker',
          row,
          rule.column,
        );
      if (!isCash(rule.effect) && rule.timing === 'direct_cash')
        flag(
          'ACTIVITY_TIMING',
          'Recognized revenue/expense needs separate collection/payment timing.',
          'blocker',
          row,
          rule.column,
        );
      for (const month of monthsFrom(
        p.period,
        (Number(end.slice(0, 4)) - Number(p.period.slice(0, 4))) * 12 +
          Number(end.slice(5, 7)) -
          Number(p.period.slice(5, 7)) +
          1,
      )) {
        const group = `${rule.component}/${rule.effect}/${month}`,
          entryId = derivedId(`import/${importId}/${group}`);
        const old = entryMap.get(group);
        if (
          old &&
          (rule.behavior !== 'dated_detail' || basisMap.get(group) !== `${rawBasis}/${rule.id}`)
        ) {
          flag(
            'SOURCE_OVERLAP',
            'More than one authoritative source supplies this component/effect/month. Exclude the overlap or separate the intended financial effects.',
            'blocker',
            row,
            rule.column,
          );
          continue;
        }
        const entry: PlanningEntry = old ?? {
          id: entryId,
          componentKey: rule.component,
          label: i.headers[rule.column] || rule.component,
          category: rule.category,
          effect: rule.effect,
          currency,
          scope: { kind: 'company' },
          source:
            rawBasis === 'actual'
              ? 'observed'
              : rawBasis === 'schedule'
                ? 'schedule'
                : 'assumption',
          note: `Import ${importId}; ${rawBasis}; ${rule.note}${partial ? '; PARTIAL coverage, no extrapolation' : ''}`.slice(
            0,
            500,
          ),
          start: month,
          end: month,
          date: null,
          driver: { kind: 'fixed', amount: '0' },
          cashTreatment:
            rule.timing === 'same_month' || rule.timing === 'offset'
              ? {
                  kind: 'profile',
                  buckets: [
                    {
                      offsetMonths: rule.timing === 'same_month' ? 0 : rule.offset,
                      proportion: '1',
                    },
                  ],
                }
              : { kind: rule.timing === 'non_cash' ? 'non_cash' : 'not_modeled' },
          committed: rule.committed,
          openingObligation: rule.openingObligation,
          settles: null,
        };
        entry.driver = {
          kind: 'fixed',
          amount: old
            ? Money.parse(old.driver.kind === 'fixed' ? old.driver.amount! : '0', currency)
                .add(Money.parse(amount, currency))
                .serialize()
            : amount,
        };
        entryMap.set(group, entry);
        basisMap.set(group, `${rawBasis}/${rule.id}`);
        origin(row, rule.column, entryId, 'amount', rawBasis, rule.id);
        origin(row, role('period')[0], entryId, 'period', rawBasis, rule.id);
        for (const name of ['currency', 'basis', 'scope', 'label', 'end_period'] as const)
          for (const column of role(name)) origin(row, column, entryId, name, rawBasis, rule.id);
      }
    }
    for (const column of role('amount'))
      if (!claimed.has(`${row}/${column}`))
        flag(
          'UNMATCHED_ROW',
          'No mapping rule selects this included amount row. Add a rule or explicitly exclude the row.',
          'blocker',
          row,
          column,
        );
  }
  for (const field of ['available', 'restricted'] as const) {
    const matches = openings.filter((x) => x.field === field);
    if (matches.length > 1)
      flag(
        'OPENING_DUPLICATE',
        'Opening cash must be a single point-in-time balance, not a sum of monthly balances.',
      );
    if (matches.length && m.opening?.[field] !== null && m.opening?.[field] !== undefined)
      flag(
        'OPENING_CONFLICT',
        'Both imported and manual opening cash supply the same field. Select one source explicitly.',
      );
  }
  const openingValues: { available: string | null; restricted: string | null } = {
    available: openings.find((x) => x.field === 'available')?.value ?? null,
    restricted: openings.find((x) => x.field === 'restricted')?.value ?? null,
  };
  if (m.opening) {
    if (!m.opening.note.trim())
      flag('OPENING_SOURCE', 'Explain the manually supplied opening balance and its source.');
    for (const field of ['available', 'restricted'] as const)
      if (m.opening[field] !== null) {
        try {
          const v = parseAmount(m.opening[field]!, m.numberLocale);
          if (v === null || v.startsWith('-'))
            throw new Error('Opening cash must be supplied as a nonnegative number.');
          openingValues[field] = Money.parse(v, currency).serialize();
        } catch (e) {
          flag('OPENING_INVALID', (e as Error).message);
        }
      }
  }
  if (openingValues.available !== null || openingValues.restricted !== null)
    doc.openingCash = {
      ...openingValues,
      asOf: m.projectionStart + '-01',
      source: m.opening?.source ?? 'observed',
      note: m.opening?.note || `Imported opening balance; import ${importId}`,
    };
  doc.entries = [...entryMap.values()].sort(
    (a, b) =>
      a.componentKey.localeCompare(b.componentKey) ||
      a.start.localeCompare(b.start) ||
      a.effect.localeCompare(b.effect),
  );
  for (const rule of m.rules.filter((r) => !isCash(r.effect))) {
    const supplied = new Set(
      doc.entries
        .filter((e) => e.componentKey === rule.component && e.effect === rule.effect)
        .map((e) => e.start),
    );
    for (const month of months)
      if (!supplied.has(month))
        flag(
          'MISSING_MONTH',
          `${rule.component}: ${month} has no supplied monthly value. Add an explicit zero if appropriate; missing is not zero.`,
        );
  }
  if (
    existing.some((d) =>
      d.entries.some((e) =>
        doc.entries.some(
          (n) =>
            n.componentKey === e.componentKey &&
            n.effect === e.effect &&
            n.start <= e.end &&
            n.end >= e.start,
        ),
      ),
    )
  )
    flag(
      'EXISTING_OVERLAP',
      'Existing manual/imported versions contain overlapping financial components. This explicitly selected standalone dataset does not merge with or overwrite them; old baseline/scenario references remain unchanged.',
      'warning',
    );
  let capabilities: Validation['capabilities'] = null;
  let document: PlanningDocument | null = null;
  const parsed = planningDocumentSchema.safeParse(doc);
  if (!parsed.success)
    flag(
      'MODEL_LIMIT',
      'Normalized inputs exceed or conflict with the supported M2 planning contract (maximum 150 entries).',
    );
  else {
    document = parsed.data;
    capabilities = evaluateCapabilities(document);
    for (const c of capabilities.capabilities)
      if (m.requestedOutputs.includes(c.capability))
        for (const f of c.findings) flag('M2_' + f.code, f.message);
  }
  flag(
    'MONTHLY_RESOLUTION',
    'Monthly totals do not establish within-month liquidity. No formulas, FX conversion or financial benefits are inferred.',
    'information',
  );
  const unique = [...new Map(issues.map((x) => [JSON.stringify(x), x])).values()];
  const executable = !unique.some((x) => x.severity === 'blocker');
  return {
    issues: unique,
    canConfirm: executable,
    document,
    lineage,
    capabilities,
    evidenceQuality:
      !executable || partial || unique.some((x) => x.severity === 'warning')
        ? 'limited'
        : 'reviewed',
    scenarioCapabilities: [
      {
        name: 'Baseline',
        readiness: executable ? 'ready' : 'needs_input',
        reason: 'Uses existing M2 readiness for the requested outputs.',
      },
      {
        name: 'Sales Change',
        readiness:
          executable && doc.entries.some((e) => e.effect === 'revenue') ? 'ready' : 'needs_input',
        reason:
          'Requires a published baseline with recognized revenue and an explicit scenario change.',
      },
      {
        name: 'Hiring',
        readiness: 'needs_input',
        reason: 'Supply additional employee count and loaded employee cost in M3.',
      },
      {
        name: 'Expansion',
        readiness: 'needs_input',
        reason:
          'Supply explicit investment, costs, timing and revenue/unknown-benefit assumptions in M3.',
      },
      {
        name: 'Multi-currency',
        readiness: 'unsupported',
        reason: 'One workspace currency; no FX conversion.',
      },
    ],
  };
}
