import { canStartGuidedEntry, guidedDecisionTypes } from './guided-entry.js';
import { AiAssistance } from './ai-assistance.js';
import { RecordHistory, WorkflowStages, FinancialMetric } from './ui';
import { InPageLink } from './in-page';
import { NavigationState, type Journey, type RecordContext } from './navigation';
import { inject, HostListener, Output, EventEmitter } from '@angular/core';
import { TranslatePipe, MoneyPipe, LocaleService } from './i18n.js';
import { FinancialChart } from './ui';
import { comparisonMetrics } from '../../../packages/scenarios/src/metrics';
import { Component, Input, OnChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import type { BaselineSnapshot, PlanningEntry } from '../../../packages/planning/src/model';
import {
  type ScenarioDocument,
  type ScenarioChange,
  type ScenarioReadiness,
  type ScenarioResult,
} from '../../../packages/scenarios/src/model';
type Item = { id: string; title: string; baseline_version_id?: string };
type Comparison = {
  id: string;
  title: string;
  baselineVersionId: string;
  runs: { id: string; title: string; result: ScenarioResult }[];
};
@Component({
  selector: 'decision-workbench',
  standalone: true,
  imports: [AiAssistance,
    RecordHistory,
    WorkflowStages,
    FinancialMetric,
    InPageLink,
    TranslatePipe,
    MoneyPipe,
    FinancialChart,
    FormsModule,
    JsonPipe,
  ],
  templateUrl: './decisions.html',
})
export class DecisionWorkbench implements OnChanges {
  @Input() records: RecordContext = {};
  @Output() navigate = new EventEmitter<Journey>();
  readonly locale = inject(LocaleService);
  readonly navigation = inject(NavigationState);
  private guidedEdited = false;
  @HostListener('change', ['$event']) rememberGuidedEdit(event: Event) {
    if (!(event.target as HTMLElement).closest('[data-record-picker]')) this.guidedEdited = true;
  }
  @HostListener('input', ['$event']) markEdited(event: Event) {
    this.rememberGuidedEdit(event);
    if (!(event.target as HTMLElement).closest('[data-record-picker]'))
      this.navigation.dirty.set(true);
  }
  async openContext() {
    const r = this.records;
    if (r.baseline) await this.chooseBaseline(r.baseline);
    if (r.draft) await this.loadDraft(r.draft);
    if (r.run) await this.openRun(r.run);
    if (r.comparison) await this.loadComparison(r.comparison);
    this.navigation.dirty.set(false);
  }

  @Input({ required: true }) workspace!: {
    id: string;
    kind: string;
    currency: string;
    permissions?: string[];
  };
  baseline = signal<BaselineSnapshot | null>(null);
  baselines = signal<Item[]>([]);
  drafts = signal<Item[]>([]);
  versions = signal<Item[]>([]);
  runs = signal<Item[]>([]);
  comparisons = signal<Item[]>([]);
  report = signal<ScenarioReadiness | null>(null);
  result = signal<ScenarioResult | null>(null);
  comparison = signal<Comparison | null>(null);
  evidence = signal<unknown>(null);
  busy = signal(false);
  error = signal('');
  notice = signal('');
  document: ScenarioDocument = this.empty();
  draftId = '';
  revision = 0;
  versionId = '';
  runId = '';
  approved = false;
  demoType = 'sales';
  guidedEntry = false;
  readonly guidedTypes = guidedDecisionTypes;
  startGuidedEntry(type: typeof guidedDecisionTypes[number]) {
    if (this.busy() || !this.can('scenario.edit') || !this.baseline()) return;
    this.guidedEntry = true;
    if (canStartGuidedEntry(this.document, this.draftId, [this.label, this.component, this.target, this.value, this.amount, this.count, this.monthlyCost, this.onboarding, this.note, this.reference, this.rate, this.baseComponent, this.timing, this.editId, this.guidedEdited ? 'edited' : ''])) {
      this.document.type = type;
      this.typeChanged();
      this.notice.set('Enter each input explicitly, then review and save. No AI request was made.');
    } else {
      this.notice.set('Your current draft and unsaved inputs are preserved. Continue reviewing them in the editor.');
    }
    requestAnimationFrame(() => {
      const heading = document.getElementById('scenario-decision');
      const editor = heading?.closest('details');
      if (editor) editor.open = true;
      heading?.focus();
      heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
  selected: string[] = [];
  comparisonTitle = 'Decision alternatives';
  editId = '';
  decision = 'sales';
  mode = 'adjust';
  label = '';
  component = '';
  target = '';
  operation = 'percentage_increase';
  value = '';
  start = '';
  end = '';
  category = 'revenue';
  driver = 'fixed';
  amount = '';
  count = '';
  monthlyCost = '';
  onboarding = '';
  baseComponent = '';
  rate = '';
  timing = '';
  offset = 0;
  source = 'assumption';
  note = '';
  reference = '';
  committed = false;
  dependencies: string[] = [];
  replacements: { period: string; activityPeriod: string; amount: string; date: string | null }[] =
    [];
  readonly metrics = comparisonMetrics;
  readonly types = ['sales', 'hiring', 'spending', 'expansion', 'combined'];
  readonly categories = [
    'revenue',
    'payroll',
    'rent',
    'marketing',
    'software',
    'utilities',
    'fees',
    'cost_of_sales',
    'other_operating',
    'capex',
    'purchases',
    'known_receipt',
    'known_payment',
  ];
  empty(): ScenarioDocument {
    return {
      contractVersion: 'scenario-1.0.0',
      title: '',
      baselineVersionId: '',
      currency: 'EGP',
      type: 'sales',
      changes: [],
      expansion: null,
      paybackRequested: false,
    };
  }
  ngOnChanges() {
    this.guidedEntry = false;
    this.guidedEdited = false;
    this.document = this.empty();
    this.baseline.set(null);
    this.draftId = '';
    this.versionId = '';
    this.runId = '';
    this.result.set(null);
    this.report.set(null);
    this.comparison.set(null);
    this.selected = [];
    return this.perform(async () => {
      await this.refresh();
      await this.openContext();
    });
  }
  can(p: string) {
    return this.workspace.permissions?.includes(p) ?? false;
  }
  text(s: string) {
    return s.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  display(v: unknown) {
    return v === null || v === undefined ? 'Not available' : String(v);
  }
  private async api<T>(path: string, method = 'GET', body?: unknown, planning = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (method !== 'GET') {
      headers['X-CSRF-Token'] = (await fetch('/api/v1/auth/csrf').then((r) => r.json())).token;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(
      `/api/v1/workspaces/${this.workspace.id}/${planning ? 'planning' : 'scenarios'}${path}`,
      { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    );
    const data = await response.json();
    if (!response.ok) {
      if (data.error?.details?.readiness) this.report.set(data.error.details);
      throw new Error(data.error?.message ?? data.error?.code ?? 'Request failed');
    }
    return data;
  }
  async perform(fn: () => Promise<void>) {
    this.busy.set(true);
    this.navigation.begin();
    this.error.set('');
    this.notice.set('');
    try {
      await fn();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
      this.navigation.end();
    }
  }
  async refresh() {
    const [b, d, v, r, c] = await Promise.all([
      this.api<{ baselines: (Item & { published_at: string | null })[] }>(
        '/baselines',
        'GET',
        undefined,
        true,
      ),
      this.api<{ drafts: Item[] }>('/drafts'),
      this.api<{ versions: Item[] }>('/versions'),
      this.api<{ runs: Item[] }>('/runs'),
      this.api<{ comparisons: Item[] }>('/comparisons'),
    ]);
    this.baselines.set(b.baselines.filter((x) => x.published_at));
    this.drafts.set(d.drafts);
    this.versions.set(v.versions);
    this.runs.set(r.runs);
    this.comparisons.set(c.comparisons);
  }
  changed() {
    this.navigation.dirty.set(true);
    this.approved = false;
    this.report.set(null);
    this.versionId = '';
  }
  chooseBaseline(id: string) {
    return this.perform(async () => {
      this.baseline.set(await this.api<BaselineSnapshot>('/baselines/' + id + '/inputs'));
      this.document.baselineVersionId = id;
      this.document.currency = this.baseline()!.document.currency;
      this.changed();
      this.resetEditor();
    });
  }
  newDraft() {
    this.guidedEdited = false;
    this.result.set(null);
    this.evidence.set(null);
    this.notice.set('');
    this.runId = '';
    const b = this.baseline();
    this.document = this.empty();
    if (b) {
      this.document.baselineVersionId = b.baselineVersionId;
      this.document.currency = b.document.currency;
    }
    this.draftId = '';
    this.revision = 0;
    this.changed();
    this.resetEditor();
  }
  typeChanged() {
    this.changed();
    this.decision = this.document.type === 'combined' ? 'sales' : this.document.type;
    this.resetEditor();
    this.ensureExpansion();
  }
  ensureExpansion() {
    if (
      this.document.type === 'expansion' ||
      this.document.changes.some((x) => x.decision === 'expansion')
    )
      this.document.expansion ??= { revenueMode: null, costsReviewed: false, note: '' };
    else this.document.expansion = null;
  }
  resetEditor() {
    this.editId = '';
    this.decision = this.document.type === 'combined' ? 'sales' : this.document.type;
    this.mode = this.decision === 'sales' ? 'adjust' : 'entry';
    this.label = '';
    this.component = '';
    this.target = '';
    this.operation = 'percentage_increase';
    this.value = '';
    this.start = this.baseline()?.document.projectionStart ?? '';
    this.end = this.start;
    this.category =
      this.decision === 'hiring'
        ? 'payroll'
        : this.decision === 'spending'
          ? 'marketing'
          : this.decision === 'expansion'
            ? 'capex'
            : 'revenue';
    this.driver = this.decision === 'hiring' ? 'headcount' : 'fixed';
    this.amount = '';
    this.count = '';
    this.monthlyCost = '';
    this.onboarding = '';
    this.baseComponent = '';
    this.rate = '';
    this.timing = '';
    this.offset = 0;
    this.source = 'assumption';
    this.note = '';
    this.reference = '';
    this.committed = false;
    this.dependencies = [];
    this.replacements = [];
  }
  decisionChanged() {
    this.mode = this.decision === 'sales' ? 'adjust' : 'entry';
    this.category =
      this.decision === 'hiring'
        ? 'payroll'
        : this.decision === 'spending'
          ? 'marketing'
          : this.decision === 'expansion'
            ? 'capex'
            : 'revenue';
    this.driver = this.decision === 'hiring' ? 'headcount' : 'fixed';
  }
  targets() {
    return (
      this.baseline()?.document.entries.filter((e) =>
        this.decision === 'sales'
          ? e.effect === 'revenue'
          : e.effect === 'operating_expense' && e.category !== 'payroll',
      ) ?? []
    );
  }
  targetExplicit() {
    return (
      this.baseline()?.document.entries.find((e) => e.id === this.target)?.cashTreatment.kind ===
      'explicit'
    );
  }
  directCash() {
    return ['capex', 'purchases', 'known_receipt', 'known_payment'].includes(this.category);
  }
  toggleDependency(id: string, on: boolean) {
    this.dependencies = on ? [...this.dependencies, id] : this.dependencies.filter((x) => x !== id);
  }
  addChange() {
    this.error.set('');
    if (!this.label.trim() || !this.note.trim() || !this.reference.trim()) {
      this.error.set(
        'Give the change a name, source reference and explanation so its assumptions can be reviewed.',
      );
      return;
    }
    if (this.mode === 'adjust' && !this.target) {
      this.error.set('Select the baseline item to change.');
      return;
    }
    if (this.mode === 'entry' && !/^[a-z][a-z0-9_-]{0,59}$/.test(this.component)) {
      this.error.set(
        'Use a component key such as branch_rent to identify the financial effect and detect duplicate costs.',
      );
      return;
    }
    if (
      this.driver === 'headcount' &&
      this.count !== '' &&
      (!Number.isInteger(Number(this.count)) || Number(this.count) < 0)
    ) {
      this.error.set('Employee count must be a nonnegative whole number.');
      return;
    }
    const old = this.document.changes.find((c) => c.id === this.editId);
    const c: ScenarioChange = {
      id: this.editId || crypto.randomUUID(),
      label: this.label,
      decision: this.decision as ScenarioChange['decision'],
      currency: this.document.currency,
      scope: { kind: 'company' },
      source: {
        kind: this.source as ScenarioChange['source']['kind'],
        note: this.note,
        reference: this.reference,
      },
      dependencies: [...this.dependencies],
      primitive:
        this.mode === 'adjust'
          ? {
              kind: 'adjust',
              targetEntryId: this.target,
              start: this.start,
              end: this.end,
              operation: this.operation as 'set',
              value: this.value || null,
              cashReplacement: this.targetExplicit() ? structuredClone(this.replacements) : null,
            }
          : {
              kind: 'entry',
              entry: {
                id: old?.primitive.kind === 'entry' ? old.primitive.entry.id : crypto.randomUUID(),
                componentKey: this.component,
                label: this.label,
                category: this.category as PlanningEntry['category'],
                effect:
                  this.category === 'revenue'
                    ? 'revenue'
                    : ['capex', 'purchases', 'known_payment'].includes(this.category)
                      ? 'cash_payment'
                      : this.category === 'known_receipt'
                        ? 'cash_receipt'
                        : 'operating_expense',
                currency: this.document.currency,
                scope: { kind: 'company' },
                source: this.source as PlanningEntry['source'],
                note: this.note,
                start: this.start,
                end: this.end,
                date: null,
                driver:
                  this.driver === 'headcount'
                    ? {
                        kind: 'headcount',
                        count: this.count === '' ? null : Number(this.count),
                        monthlyCost: this.monthlyCost || null,
                        onboardingCost: this.onboarding || null,
                      }
                    : this.driver === 'revenue_linked'
                      ? {
                          kind: 'revenue_linked',
                          baseComponent: this.baseComponent,
                          rate: this.rate || null,
                        }
                      : { kind: 'fixed', amount: this.amount || null },
                cashTreatment: this.directCash()
                  ? { kind: 'not_modeled' }
                  : this.timing === 'profile'
                    ? { kind: 'profile', buckets: [{ offsetMonths: this.offset, proportion: '1' }] }
                    : { kind: this.timing === 'non_cash' ? 'non_cash' : 'not_modeled' },
                committed: this.committed,
                openingObligation: false,
                settles: null,
              },
            },
    };
    const i = this.document.changes.findIndex((x) => x.id === c.id);
    if (i < 0) this.document.changes.push(c);
    else this.document.changes[i] = c;
    this.ensureExpansion();
    this.changed();
    this.resetEditor();
    this.notice.set('Change added to the draft. Review readiness before confirming.');
  }
  edit(c: ScenarioChange) {
    this.resetEditor();
    this.editId = c.id;
    this.decision = c.decision;
    this.label = c.label;
    this.source = c.source.kind;
    this.note = c.source.note;
    this.reference = c.source.reference;
    this.dependencies = [...c.dependencies];
    const p = c.primitive;
    this.start = p.kind === 'entry' ? p.entry.start : p.start;
    this.end = p.kind === 'entry' ? p.entry.end : p.end;
    this.mode = p.kind === 'adjust' ? 'adjust' : 'entry';
    if (p.kind === 'adjust') {
      this.target = p.targetEntryId;
      this.operation = p.operation;
      this.value = p.value ?? '';
      this.replacements = structuredClone(p.cashReplacement ?? []);
    } else {
      const e = p.entry;
      this.component = e.componentKey;
      this.category = e.category;
      this.driver = e.driver.kind;
      this.amount = e.driver.kind === 'fixed' ? (e.driver.amount ?? '') : '';
      this.count = e.driver.kind === 'headcount' ? String(e.driver.count ?? '') : '';
      this.monthlyCost = e.driver.kind === 'headcount' ? (e.driver.monthlyCost ?? '') : '';
      this.onboarding = e.driver.kind === 'headcount' ? (e.driver.onboardingCost ?? '') : '';
      this.baseComponent = e.driver.kind === 'revenue_linked' ? e.driver.baseComponent : '';
      this.rate = e.driver.kind === 'revenue_linked' ? (e.driver.rate ?? '') : '';
      this.timing = e.cashTreatment.kind;
      this.offset =
        e.cashTreatment.kind === 'profile' ? (e.cashTreatment.buckets[0]?.offsetMonths ?? 0) : 0;
      this.committed = e.committed;
    }
  }
  remove(id: string) {
    this.document.changes = this.document.changes.filter((c) => c.id !== id);
    this.changed();
    this.ensureExpansion();
  }
  describe(c: ScenarioChange) {
    const p = c.primitive;
    if (p.kind === 'adjust')
      return this.locale.t('{0} {1} · {2} to {3}', [
        this.locale.t(this.text(p.operation)),
        p.value ?? '—',
        p.start,
        p.end,
      ]);
    const e = p.entry;
    const driver =
      e.driver.kind === 'fixed'
        ? (e.driver.amount ?? this.locale.t('Missing amount'))
        : e.driver.kind === 'headcount'
          ? this.locale.t('{0} employees × {1} / month', [
              e.driver.count ?? '?',
              e.driver.monthlyCost ?? '?',
            ])
          : `${e.driver.rate ?? '?'} × ${e.driver.baseComponent}`;
    return this.locale.t('{0} · {1} · {2} to {3}', [
      this.locale.t(this.text(e.category)),
      driver,
      e.start,
      e.end,
    ]);
  }
  validate() {
    return this.perform(async () => {
      this.report.set(await this.api<ScenarioReadiness>('/validate', 'POST', this.document));
    });
  }
  private async save() {
    const d = await this.api<{ id: string; revision: number }>(
      this.draftId ? '/drafts/' + this.draftId : '/drafts',
      this.draftId ? 'PATCH' : 'POST',
      this.draftId ? { document: this.document, revision: this.revision } : this.document,
    );
    this.draftId = d.id;
    this.revision = d.revision;
    await this.refresh();
  }
  saveDraft() {
    return this.perform(async () => {
      await this.save();
      this.navigation.dirty.set(Boolean(this.label.trim()));
      this.notice.set('Draft saved. Existing confirmed versions and results are unchanged.');
    });
  }
  confirm() {
    return this.perform(async () => {
      if (!this.approved) throw new Error('Review and confirm the assumptions first.');
      await this.save();
      this.navigation.dirty.set(false);
      const v = await this.api<{ id: string; readiness: ScenarioReadiness }>(
        '/drafts/' + this.draftId + '/confirm',
        'POST',
        { revision: this.revision, assumptionsConfirmed: true },
      );
      this.versionId = v.id;
      this.report.set(v.readiness);
      await this.refresh();
      this.notice.set(
        'Immutable scenario version confirmed. Run this version to calculate its impact.',
      );
    });
  }
  loadDraft(id: string) {
    return this.perform(async () => {
      const d = await this.api<{ id: string; revision: number; document: ScenarioDocument }>(
        '/drafts/' + id,
      );
      this.document = d.document;
      this.draftId = d.id;
      this.revision = d.revision;
      this.baseline.set(
        await this.api<BaselineSnapshot>('/baselines/' + d.document.baselineVersionId + '/inputs'),
      );
      this.changed();
      this.resetEditor();
      this.notice.set('Draft reopened. Edits will require a new confirmation.');
    });
  }
  run() {
    return this.perform(async () => {
      const r = await this.api<{ id: string }>('/versions/' + this.versionId + '/runs', 'POST', {
        idempotencyKey: crypto.randomUUID(),
      });
      await this.openRun(r.id);
      await this.refresh();
    });
  }
  private async openRun(id: string) {
    const r = await this.api<{ result: ScenarioResult }>('/runs/' + id);
    this.runId = id;
    this.result.set(r.result);
    this.evidence.set(null);
  }
  loadRun(id: string) {
    return this.perform(() => this.openRun(id));
  }
  inspect() {
    return this.perform(async () => {
      this.evidence.set(await this.api('/runs/' + this.runId + '/evidence'));
    });
  }
  replay() {
    return this.perform(async () => {
      const r = await this.api<{ matches: boolean }>('/runs/' + this.runId + '/replay', 'POST');
      this.notice.set(
        r.matches
          ? 'Replay verified: immutable inputs reproduce the saved result.'
          : 'Replay mismatch: saved result could not be reproduced.',
      );
    });
  }
  demo() {
    return this.perform(async () => {
      const r = await this.api<{ id: string }>('/demo-examples', 'POST', { type: this.demoType });
      await this.openRun(r.id);
      await this.refresh();
    });
  }
  toggleRun(id: string, on: boolean) {
    this.selected = on ? [...this.selected, id] : this.selected.filter((x) => x !== id);
  }
  saveComparison() {
    return this.perform(async () => {
      const c = await this.api<{ id: string }>('/comparisons', 'POST', {
        title: this.comparisonTitle,
        runIds: this.selected,
      });
      this.comparison.set(await this.api<Comparison>('/comparisons/' + c.id));
      await this.refresh();
    });
  }
  loadComparison(id: string) {
    return this.perform(async () => {
      this.comparison.set(await this.api<Comparison>('/comparisons/' + id));
    });
  }
}
