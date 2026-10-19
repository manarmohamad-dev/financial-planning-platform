import { AiAssistance } from './ai-assistance.js';
import { RecordHistory, WorkflowStages } from './ui';
import { InPageLink } from './in-page';
import { NavigationState, type Journey, type RecordContext } from './navigation';
import { inject, HostListener, Output, EventEmitter } from '@angular/core';
import { TranslatePipe, MoneyPipe } from './i18n.js';
import { FinancialChart, FinancialMetric } from './ui';
import { Component, Input, OnChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import type {
  PlanningDocument,
  PlanningEntry,
  CapabilityReport,
  BaselineResult,
  Movement,
} from '../../../packages/planning/src/model';
type Workspace = { id: string; kind: string; currency: string; permissions?: string[] };
@Component({
  selector: 'planning-workbench',
  standalone: true,
  imports: [AiAssistance,
    RecordHistory,
    WorkflowStages,
    InPageLink,
    TranslatePipe,
    MoneyPipe,
    FinancialChart,
    FinancialMetric,
    FormsModule,
    JsonPipe,
  ],
  templateUrl: './planning.html',
})
export class PlanningWorkbench implements OnChanges {
  @Input() records: RecordContext = {};
  @Output() navigate = new EventEmitter<Journey>();
  readonly navigation = inject(NavigationState);
  @HostListener('input', ['$event']) markEdited(event: Event) {
    if (!(event.target as HTMLElement).closest('[data-record-picker]'))
      this.navigation.dirty.set(true);
  }
  async openContext() {
    const r = this.records;
    if (r.version) {
      await this.api('/versions/' + r.version);
      this.versionId = r.version;
    }
    if (r.baseline) {
      const b = await this.api<{ planning_version_id: string }>('/baselines/' + r.baseline);
      this.baselineId = r.baseline;
      this.versionId = b.planning_version_id;
    }
    if (r.run) await this.showRun(r.run);
    if (r.draft) await this.loadDraft(r.draft);
    this.navigation.dirty.set(false);
  }

  @Input({ required: true }) workspace!: Workspace;
  document!: PlanningDocument;
  draftId = '';
  revision = 0;
  versionId = '';
  baselineId = '';
  runId = '';
  drafts = signal<{ id: string; title: string; revision: number }[]>([]);
  versions = signal<{ id: string; title: string }[]>([]);
  baselines = signal<{ id: string; title: string; published_at: string | null }[]>([]);
  runs = signal<{ id: string; title: string }[]>([]);
  report = signal<CapabilityReport | null>(null);
  result = signal<BaselineResult | null>(null);
  evidence = signal<Movement | null>(null);
  error = signal('');
  notice = signal('');
  busy = signal(false);
  reserve = '';
  reserveNote = '';
  reserveRevision = 0;
  reserveCurrent = signal<string | null>(null);
  profile = 'service';
  opening = '';
  restricted = '';
  openingSource = '';
  openingNote = '';
  operating = true;
  cash = true;
  entryId = '';
  label = '';
  component = '';
  category = 'revenue';
  effect = 'revenue';
  source = '';
  note = '';
  start = '';
  end = '';
  date = '';
  amount = '';
  driver = 'fixed';
  count = '';
  monthlyCost = '';
  onboarding = '';
  rate = '';
  baseComponent = '';
  timing = 'not_modeled';
  buckets: { offsetMonths: number; proportion: string }[] = [];
  committed = false;
  openingObligation = false;
  settlesId = '';
  settlesPeriod = '';
  readonly categoryOptions = [
    'revenue',
    'payroll',
    'rent',
    'marketing',
    'software',
    'utilities',
    'fees',
    'cost_of_sales',
    'other_operating',
    'depreciation',
    'noncash',
    'known_receipt',
    'known_payment',
    'purchases',
    'capex',
    'debt_principal',
    'debt_interest',
    'financing',
    'owner_contribution',
    'owner_withdrawal',
    'tax',
    'refunds',
    'net_settlement',
    'restricted_release',
  ];
  readonly effectOptions = [
    'revenue',
    'revenue_reduction',
    'operating_expense',
    'non_operating_expense',
    'cash_receipt',
    'cash_payment',
    'restricted_release',
  ];
  ngOnChanges() {
    this.reset();
    return this.perform(async () => {
      await this.refresh();
      await this.openContext();
    });
  }
  can(p: string) {
    return this.workspace.permissions?.includes(p) ?? false;
  }
  text(value: string) {
    return value.replaceAll('_', ' ');
  }
  sourceText(value: string) {
    return (
      (
        {
          observed: 'Observed Data',
          schedule: 'Known Schedule',
          assumption: 'Explicit Assumption',
          forecast: 'Approved Forecast',
        } as Record<string, string>
      )[value] ?? value
    );
  }
  stateText(value: string) {
    return (
      (
        {
          ready: 'Ready',
          missing_required_input: 'Needs Input',
          invalid_conflicting_input: 'Invalid / Conflict',
          unsupported: 'Unsupported',
        } as Record<string, string>
      )[value] ?? value
    );
  }
  private async api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (method !== 'GET') {
      const token = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' }).then((r) =>
        r.json(),
      );
      headers['X-CSRF-Token'] = token.token;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`/api/v1/workspaces/${this.workspace.id}/planning${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.error?.details?.capabilities) this.report.set(data.error.details);
      throw new Error(data.error?.message ?? 'Request failed');
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
  reset() {
    this.document = {
      contractVersion: 'baseline-1.0.0',
      title: 'Company baseline',
      currency: this.workspace.currency as PlanningDocument['currency'],
      projectionStart: new Date().toISOString().slice(0, 7),
      horizonMonths: 3,
      requestedOutputs: ['operating', 'cash'],
      openingCash: null,
      coverage: {
        revenueComplete: false,
        expensesComplete: false,
        cashComplete: false,
        depreciation: 'excluded',
        revenueConvention: 'gross_with_refunds',
        settlementConvention: 'gross',
      },
      entries: [],
    };
    this.draftId = '';
    this.revision = 0;
    this.versionId = '';
    this.baselineId = '';
    this.runId = '';
    this.opening = '';
    this.restricted = '';
    this.openingSource = '';
    this.openingNote = '';
    this.operating = true;
    this.cash = true;
    this.report.set(null);
    this.result.set(null);
    this.evidence.set(null);
    this.resetEntry();
  }
  resetEntry() {
    this.entryId = '';
    this.label = '';
    this.component = '';
    this.category = 'revenue';
    this.effect = 'revenue';
    this.source = '';
    this.note = '';
    this.start = this.document.projectionStart;
    this.end = this.document.projectionStart;
    this.date = '';
    this.amount = '';
    this.driver = 'fixed';
    this.count = '';
    this.monthlyCost = '';
    this.onboarding = '';
    this.rate = '';
    this.baseComponent = '';
    this.timing = 'not_modeled';
    this.buckets = [];
    this.committed = false;
    this.openingObligation = false;
    this.settlesId = '';
    this.settlesPeriod = '';
  }
  private sync() {
    this.document.requestedOutputs = [
      ...(this.operating ? ['operating' as const] : []),
      ...(this.cash ? ['cash' as const] : []),
    ];
    if (!this.document.requestedOutputs.length) throw new Error('Select at least one output.');
    const hasOpening = this.opening !== '' || this.restricted !== '';
    if (hasOpening && (!this.openingSource || !this.openingNote.trim()))
      throw new Error('Label opening cash as observed or assumed and explain its source.');
    this.document.openingCash = hasOpening
      ? {
          available: this.opening || null,
          restricted: this.restricted || null,
          asOf: this.document.projectionStart + '-01',
          source: this.openingSource as 'observed' | 'assumption',
          note: this.openingNote,
        }
      : null;
  }
  addEntry() {
    this.error.set('');
    if (
      !this.label.trim() ||
      !this.component.match(/^[a-z][a-z0-9_-]{0,59}$/) ||
      !this.source ||
      !this.note.trim()
    ) {
      this.error.set(
        'Give this item a name, component key, evidence type, and source explanation.',
      );
      return;
    }
    if (
      this.driver === 'headcount' &&
      this.count !== '' &&
      (!Number.isInteger(Number(this.count)) || Number(this.count) < 0)
    ) {
      this.error.set('Headcount must be a nonnegative whole number.');
      return;
    }
    const e: PlanningEntry = {
      id: this.entryId || crypto.randomUUID(),
      componentKey: this.component,
      label: this.label,
      category: this.category as PlanningEntry['category'],
      effect: this.effect as PlanningEntry['effect'],
      currency: this.document.currency,
      scope: { kind: 'company' },
      source: this.source as PlanningEntry['source'],
      note: this.note,
      start: this.start,
      end: this.end,
      date: this.date || null,
      driver:
        this.driver === 'fixed'
          ? { kind: 'fixed', amount: this.amount || null }
          : this.driver === 'headcount'
            ? {
                kind: 'headcount',
                count: this.count === '' ? null : Number(this.count),
                monthlyCost: this.monthlyCost || null,
                onboardingCost: this.onboarding || null,
              }
            : {
                kind: 'revenue_linked',
                baseComponent: this.baseComponent,
                rate: this.rate || null,
              },
      cashTreatment:
        this.timing === 'profile'
          ? { kind: 'profile', buckets: structuredClone(this.buckets) }
          : { kind: this.timing as 'explicit' | 'non_cash' | 'not_modeled' | 'included_in_net' },
      committed: this.committed,
      openingObligation: this.openingObligation,
      settles: this.settlesId
        ? { entryId: this.settlesId, activityPeriod: this.settlesPeriod }
        : null,
    };
    const index = this.document.entries.findIndex((x) => x.id === e.id);
    if (index < 0) this.document.entries.push(e);
    else this.document.entries[index] = e;
    this.report.set(null);
    this.resetEntry();
    this.notice.set('Item added to the unsaved draft. Save before confirming.');
  }
  editEntry(e: PlanningEntry) {
    this.entryId = e.id;
    this.label = e.label;
    this.component = e.componentKey;
    this.category = e.category;
    this.effect = e.effect;
    this.source = e.source;
    this.note = e.note;
    this.start = e.start;
    this.end = e.end;
    this.date = e.date ?? '';
    this.driver = e.driver.kind;
    this.amount = e.driver.kind === 'fixed' ? (e.driver.amount ?? '') : '';
    this.count = e.driver.kind === 'headcount' ? String(e.driver.count ?? '') : '';
    this.monthlyCost = e.driver.kind === 'headcount' ? (e.driver.monthlyCost ?? '') : '';
    this.onboarding = e.driver.kind === 'headcount' ? (e.driver.onboardingCost ?? '') : '';
    this.rate = e.driver.kind === 'revenue_linked' ? (e.driver.rate ?? '') : '';
    this.baseComponent = e.driver.kind === 'revenue_linked' ? e.driver.baseComponent : '';
    this.timing = e.cashTreatment.kind;
    this.buckets =
      e.cashTreatment.kind === 'profile' ? structuredClone(e.cashTreatment.buckets) : [];
    this.committed = e.committed;
    this.openingObligation = e.openingObligation;
    this.settlesId = e.settles?.entryId ?? '';
    this.settlesPeriod = e.settles?.activityPeriod ?? '';
  }
  removeEntry(id: string) {
    this.navigation.dirty.set(true);
    this.document.entries = this.document.entries.filter((e) => e.id !== id);
    this.report.set(null);
  }
  async refresh() {
    const [drafts, versions, baselines, runs, reserve] = await Promise.all([
      this.api<{ drafts: { id: string; title: string; revision: number }[] }>('/drafts'),
      this.api<{ versions: { id: string; title: string }[] }>('/versions'),
      this.api<{ baselines: { id: string; title: string; published_at: string | null }[] }>(
        '/baselines',
      ),
      this.api<{ runs: { id: string; title: string }[] }>('/runs'),
      this.api<{ policy: { minimum: string | null; revision: number } | null }>('/reserve'),
    ]);
    this.drafts.set(drafts.drafts);
    this.versions.set(versions.versions);
    this.baselines.set(baselines.baselines);
    this.runs.set(runs.runs);
    this.reserveRevision = reserve.policy?.revision ?? 0;
    this.reserveCurrent.set(reserve.policy?.minimum ?? null);
  }
  loadDraft(id: string) {
    return this.perform(async () => {
      const d = await this.api<{ document: PlanningDocument; id: string; revision: number }>(
        '/drafts/' + id,
      );
      this.document = d.document;
      this.draftId = d.id;
      this.revision = d.revision;
      this.opening = d.document.openingCash?.available ?? '';
      this.restricted = d.document.openingCash?.restricted ?? '';
      this.openingSource = d.document.openingCash?.source ?? '';
      this.openingNote = d.document.openingCash?.note ?? '';
      this.operating = d.document.requestedOutputs.includes('operating');
      this.cash = d.document.requestedOutputs.includes('cash');
      this.report.set(null);
      this.resetEntry();
    });
  }
  private async save() {
    this.sync();
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
      this.notice.set('Draft saved. Confirming creates an immutable planning version.');
    });
  }
  validate() {
    return this.perform(async () => {
      this.sync();
      this.report.set(await this.api<CapabilityReport>('/validate', 'POST', this.document));
    });
  }
  confirm() {
    return this.perform(async () => {
      await this.save();
      this.navigation.dirty.set(false);
      const v = await this.api<{ id: string; capabilities: CapabilityReport }>(
        `/drafts/${this.draftId}/confirm`,
        'POST',
        { revision: this.revision },
      );
      this.versionId = v.id;
      this.report.set(v.capabilities);
      await this.refresh();
      this.notice.set('Planning version confirmed. Prepare a baseline from it below.');
    });
  }
  prepare() {
    return this.perform(async () => {
      const b = await this.api<{ id: string }>('/baselines', 'POST', {
        planningVersionId: this.versionId,
      });
      this.baselineId = b.id;
      await this.refresh();
      this.notice.set(
        'Baseline prepared with the current reserve policy frozen into this version.',
      );
    });
  }
  publish() {
    return this.perform(async () => {
      await this.api(`/baselines/${this.baselineId}/publish`, 'POST', {});
      await this.refresh();
      this.notice.set('Baseline published to this workspace.');
    });
  }
  execute() {
    return this.perform(async () => {
      const r = await this.api<{ id: string }>(`/baselines/${this.baselineId}/runs`, 'POST', {
        idempotencyKey: crypto.randomUUID(),
      });
      await this.showRun(r.id);
      await this.refresh();
    });
  }
  async showRun(id: string) {
    const r = await this.api<{ result: BaselineResult }>('/runs/' + id);
    this.runId = id;
    this.baselineId = r.result.manifest.baselineVersionId;
    this.versionId = r.result.manifest.planningVersionId;
    this.result.set(r.result);
    this.evidence.set(null);
  }
  loadRun(id: string) {
    return this.perform(() => this.showRun(id));
  }
  replay() {
    return this.perform(async () => {
      const r = await this.api<{ matches: boolean }>(`/runs/${this.runId}/replay`, 'POST', {});
      this.notice.set(
        r.matches
          ? 'Replay matches the stored result exactly.'
          : 'Replay mismatch: do not rely on this result until reviewed.',
      );
    });
  }
  saveReserve() {
    return this.perform(async () => {
      await this.api('/reserve', 'POST', {
        minimum: this.reserve || null,
        note: this.reserveNote,
        expectedRevision: this.reserveRevision,
      });
      await this.refresh();
      this.notice.set('Reserve policy version saved. It applies to newly prepared baselines.');
    });
  }
  demo() {
    return this.perform(async () => {
      const r = await this.api<{ id: string }>('/demo-fixture', 'POST', { profile: this.profile });
      await this.showRun(r.id);
      await this.refresh();
    });
  }
}
