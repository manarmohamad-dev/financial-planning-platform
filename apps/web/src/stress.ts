import { RecordHistory, WorkflowStages, FinancialChart } from './ui.js';
import { NavigationState, type Journey, type RecordContext } from './navigation.js';
import { inject, HostListener, Output, EventEmitter } from '@angular/core';
import { TranslatePipe, MoneyPipe, LocalDatePipe } from './i18n.js';

import { Component, Input, OnChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import type {
  Source,
  Definition,
  Policy,
  Comparison,
  Brief,
} from '../../../packages/stress/src/model.js';
type Summary = { id: string; title: string };
type Batch = {
  id: string;
  title: string;
  status: string;
  children: {
    id: string;
    status: string;
    attempt: number;
    error_code: string | null;
    result_id: string | null;
    definition_id: string;
    document: Definition;
  }[];
};
@Component({
  selector: 'stress-workbench',
  standalone: true,
  imports: [
    RecordHistory,
    WorkflowStages,
    FinancialChart,
    LocalDatePipe,
    TranslatePipe,
    MoneyPipe,
    FormsModule,
    JsonPipe,
  ],
  templateUrl: './stress.html',
  styleUrl: './stress.css',
})
export class StressWorkbench implements OnChanges {
  @Input() records: RecordContext = {};
  @Output() navigate = new EventEmitter<Journey>();
  readonly navigation = inject(NavigationState);
  @HostListener('input', ['$event']) markEdited(event: Event) {
    if (!(event.target as HTMLElement).closest('[data-record-picker]'))
      this.navigation.dirty.set(true);
  }
  async openContext() {
    const r = this.records;
    if (r.source && r.run) {
      this.sourceKey = r.source + ':' + r.run;
      await this.selectSource();
    }
    if (r.comparison) await this.openComparison(r.comparison);
    if (r.brief) await this.openBrief(r.brief);
    this.navigation.dirty.set(false);
  }

  comparisonChartPeriods() {
    return this.comparison()?.document.options.flatMap((option) => option.financial.periods) ?? [];
  }
  briefChartPeriods() {
    return this.brief()?.document.options.flatMap((option) => option.periods) ?? [];
  }
  @Input() briefOnly = false;
  @Input({ required: true }) workspace!: {
    id: string;
    kind: string;
    currency: string;
    permissions?: string[];
  };
  sources = signal<{ id: string; title: string; kind: 'baseline' | 'scenario' }[]>([]);
  sourceKey = '';
  source = signal<Source | null>(null);
  definitions = signal<(Summary & { revision: number; source: Definition['source'] })[]>([]);
  caseIds = new Set<string>();
  parentId: string | null = null;
  template: Definition['template'] = 'revenue';
  title = 'Revenue decline';
  modifications: Definition['modifications'] = [];
  caseReviewed = false;
  targetId = '';
  customKind: Definition['modifications'][number]['kind'] = 'revenue_decrease';
  policies = signal<
    (Summary & { revision: number; configuration: { currency: string; rules: Policy['rules'] } })[]
  >([]);
  policyId = '';
  policy = signal<Policy | null>(null);
  reserve = '100';
  operatingFloor = '0';
  negativeCash = true;
  policySource = '';
  policyReviewed = false;
  batch = signal<Batch | null>(null);
  batches = signal<Summary[]>([]);
  batchIds = new Set<string>();
  batchTitle = 'Adverse conditions';
  comparison = signal<{ id: string; document: Comparison } | null>(null);
  brief = signal<{ id: string; document: Brief; created_at: string } | null>(null);
  briefs = signal<Summary[]>([]);
  savedComparisons = signal<(Summary & { created_at: string })[]>([]);
  async openComparison(id: string) {
    await this.action(async () => this.comparison.set(await this.api('/stress/comparisons/' + id)));
  }
  evidence = signal<unknown>(null);
  printPreview = false;
  busy = signal(false);
  error = signal('');
  notice = signal('');
  async ngOnChanges() {
    this.notice.set('');
    this.error.set('');
    this.source.set(null);
    this.caseIds.clear();
    this.batchIds.clear();
    this.batch.set(null);
    this.comparison.set(null);
    this.brief.set(null);
    await this.action(async () => {
      const [baselines, scenarios] = await Promise.all([
        this.api<{ runs: Summary[] }>('/planning/runs'),
        this.api<{ runs: Summary[] }>('/scenarios/runs'),
      ]);
      this.sources.set([
        ...baselines.runs.map((r) => ({ ...r, kind: 'baseline' as const })),
        ...scenarios.runs.map((r) => ({ ...r, kind: 'scenario' as const })),
      ]);
      await this.refresh();
      await this.openContext();
    });
  }
  async api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (method !== 'GET') {
      const t = await fetch('/api/v1/auth/csrf');
      headers['X-CSRF-Token'] = (await t.json()).token;
    }
    const r = await fetch(`/api/v1/workspaces/${this.workspace.id}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message ?? 'Request failed');
    return data;
  }
  async action(fn: () => Promise<void>) {
    this.busy.set(true);
    this.navigation.begin();
    this.error.set('');
    try {
      await fn();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Request failed');
    } finally {
      this.busy.set(false);
      this.navigation.end();
    }
  }
  async refresh() {
    const [p, d, b, briefs, comparisons] = await Promise.all([
      this.api<{
        policies: (Summary & {
          revision: number;
          configuration: { currency: string; rules: Policy['rules'] };
        })[];
      }>('/stress/policies'),
      this.api<{ definitions: (Summary & { revision: number; source: Definition['source'] })[] }>(
        '/stress/definitions',
      ),
      this.api<{ batches: Summary[] }>('/stress/batches'),
      this.api<{ briefs: Summary[] }>('/stress/briefs'),
      this.api<{ comparisons: (Summary & { created_at: string })[] }>('/stress/comparisons'),
    ]);
    this.policies.set(p.policies);
    this.definitions.set(d.definitions);
    this.batches.set(b.batches);
    this.briefs.set(briefs.briefs);
    this.savedComparisons.set(comparisons.comparisons);
    if (!this.policyId && p.policies[0]) {
      this.policyId = p.policies[0].id;
      this.policy.set(await this.api('/stress/policies/' + this.policyId));
    }
  }
  can(permission: string) {
    return this.workspace.permissions?.includes(permission) ?? false;
  }
  async selectSource() {
    await this.action(async () => {
      const [kind, runId] = this.sourceKey.split(':');
      this.source.set(await this.api('/stress/source', 'POST', { kind, runId }));
      this.parentId = null;
      this.caseIds.clear();
      this.modifications = [];
      this.caseReviewed = false;
    });
  }
  targets(kind = this.customKind) {
    return (
      this.source()?.snapshot.document.entries.filter(
        (e) =>
          e.driver.kind === 'fixed' &&
          e.driver.amount !== null &&
          (kind === 'expense_increase'
            ? e.effect === 'operating_expense' && e.category !== 'payroll'
            : e.effect === 'revenue') &&
          e.start <= this.endMonth() &&
          e.end >= this.source()!.snapshot.document.projectionStart,
      ) ?? []
    );
  }
  endMonth() {
    return this.source()?.financial.periods.at(-1)?.period ?? '';
  }
  add(kind: Definition['modifications'][number]['kind'], id: string) {
    const e = this.source()?.snapshot.document.entries.find((e) => e.id === id);
    if (!e) return;
    this.modifications.push({
      id: crypto.randomUUID(),
      kind,
      targetEntryId: id,
      start: e.start,
      end: e.end > this.endMonth() ? this.endMonth() : e.end,
      rate: kind === 'collection_delay' ? null : kind === 'revenue_decrease' ? '0.20' : '0.10',
      delayMonths: kind === 'collection_delay' ? 1 : null,
      reference: 'pinned_source',
      dependencies: [],
      note: 'Explicit adverse assumption for review',
    });
    this.caseReviewed = false;
  }
  applyTemplate() {
    this.navigation.dirty.set(true);
    this.modifications = [];
    this.parentId = null;
    this.caseReviewed = false;
    this.title = {
      revenue: 'Revenue decline',
      expenses: 'Operating cost increase',
      delay: 'Slower collections',
      combined: 'Combined adverse conditions',
      zero: 'Unchanged reference',
      custom: 'Custom adverse case',
    }[this.template];
    if (['revenue', 'combined'].includes(this.template))
      for (const e of this.targets('revenue_decrease')) this.add('revenue_decrease', e.id);
    if (['expenses', 'combined'].includes(this.template))
      for (const e of this.targets('expense_increase')) this.add('expense_increase', e.id);
    if (['delay', 'combined'].includes(this.template))
      for (const e of this.targets('collection_delay').filter(
        (e) => e.cashTreatment.kind === 'profile',
      ))
        this.add('collection_delay', e.id);
  }
  label(id: string) {
    const e = this.source()?.snapshot.document.entries.find((e) => e.id === id);
    return e ? `${e.label} · ${e.componentKey} · ${e.start}–${e.end}` : id;
  }
  async saveCase() {
    await this.action(async () => {
      const document: Definition = {
        version: 'stress-1.0.0',
        title: this.title,
        source: this.source()!.ref,
        template: this.template,
        modifications: this.modifications,
        reviewed: true,
      };
      const d = await this.api<{ id: string }>('/stress/definitions', 'POST', {
        document,
        parentId: this.parentId,
      });
      this.caseIds.add(d.id);
      this.navigation.dirty.set(false);
      this.notice.set('Stress definition confirmed as an immutable version.');
      await this.refresh();
    });
  }
  async editCase(id: string) {
    await this.action(async () => {
      const d = await this.api<{ document: Definition; source: Source }>(
        '/stress/definitions/' + id,
      );
      this.source.set(d.source);
      this.sourceKey = d.source.ref.kind + ':' + d.source.ref.runId;
      this.parentId = id;
      this.title = d.document.title;
      this.template = d.document.template;
      this.modifications = structuredClone(d.document.modifications);
      this.caseReviewed = false;
    });
  }
  toggleCase(id: string, checked: boolean) {
    if (checked) this.caseIds.add(id);
    else this.caseIds.delete(id);
  }
  toggleBatch(id: string, checked: boolean) {
    if (checked) this.batchIds.add(id);
    else this.batchIds.delete(id);
  }
  async choosePolicy() {
    await this.action(async () =>
      this.policy.set(await this.api('/stress/policies/' + this.policyId)),
    );
  }
  async savePolicy() {
    await this.action(async () => {
      const p = await this.api<Policy>('/stress/policies', 'POST', {
        title: 'Reviewed financial constraints',
        currency: this.workspace.currency,
        minimumCash: this.reserve || null,
        minimumOperatingResult: this.operatingFloor || null,
        negativeCash: this.negativeCash,
        source: this.policySource,
        expectedRevision: this.policies()[0]?.revision ?? 0,
        reviewed: this.policyReviewed,
      });
      this.policyId = p.id;
      this.policy.set(p);
      this.policyReviewed = false;
      this.navigation.dirty.set(false);
      await this.refresh();
    });
  }
  async prepareBatch() {
    await this.action(async () => {
      this.batch.set(
        await this.api('/stress/batches', 'POST', {
          title: this.batchTitle,
          definitionIds: [...this.caseIds],
          policyId: this.policyId,
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      await this.refresh();
    });
  }
  async openBatch(id: string) {
    await this.action(async () => this.batch.set(await this.api('/stress/batches/' + id)));
  }
  async runBatch() {
    await this.action(async () => {
      const id = this.batch()!.id;
      this.batch.set({ ...this.batch()!, status: 'running' });
      this.batch.set(await this.api('/stress/batches/' + id + '/run', 'POST', {}));
      this.batchIds.add(id);
      await this.refresh();
    });
  }
  async cancel() {
    try {
      this.batch.set(await this.api('/stress/batches/' + this.batch()!.id + '/cancel', 'POST', {}));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Cancellation failed');
    }
  }
  async inspectResult(id: string) {
    await this.action(async () => this.evidence.set(await this.api('/stress/results/' + id)));
  }
  async compare() {
    await this.action(async () => {
      this.comparison.set(
        await this.api('/stress/comparisons', 'POST', {
          title: this.batchTitle + ' — decision evidence',
          batchIds: [...this.batchIds],
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      this.brief.set(null);
    });
  }
  async prepareBrief() {
    await this.action(async () => {
      this.brief.set(
        await this.api('/stress/briefs', 'POST', { comparisonId: this.comparison()!.id }),
      );
      await this.refresh();
    });
  }
  async openBrief(id: string) {
    await this.action(async () => this.brief.set(await this.api('/stress/briefs/' + id)));
  }
  async replayBrief() {
    await this.action(async () => {
      const r = await this.api<{ matches: boolean }>(
        '/stress/briefs/' + this.brief()!.id + '/replay',
        'POST',
        {},
      );
      this.notice.set(
        r.matches
          ? 'Historical brief matches its stored evidence exactly.'
          : 'Brief replay did not match.',
      );
    });
  }
  print() {
    window.print();
  }
}
