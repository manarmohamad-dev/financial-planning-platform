import { RecordHistory, WorkflowStages } from './ui';
import { NavigationState, type Journey, type RecordContext } from './navigation';
import { inject, HostListener } from '@angular/core';
import { FinancialChart } from './ui';
import { TranslatePipe } from './i18n';

import { Component, Input, Output, EventEmitter, OnChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import type {
  Eligibility,
  History,
  RuntimeResult,
  Assignment,
} from '../../../packages/forecasting/src/model';
import type { PlanningDocument } from '../../../packages/planning/src/model';
type Artifact = {
  id: string;
  history: History;
  eligibility: Eligibility;
  result: RuntimeResult;
  approval_id: string | null;
  created_at: string;
};
type Job = {
  id: string;
  status: string;
  error_code: string | null;
  artifact_id: string | null;
  history?: History;
  eligibility?: Eligibility;
};
@Component({
  selector: 'forecast-workbench',
  standalone: true,
  imports: [RecordHistory, WorkflowStages, FinancialChart, TranslatePipe, FormsModule, JsonPipe],
  templateUrl: './forecasts.html',
  styles: [
    `
      :host {
        display: block;
      }
      fieldset {
        border: 1px solid #d8e0da;
        border-radius: 12px;
        padding: 16px;
        margin: 16px 0;
      }
      label {
        display: block;
        margin: 12px 0;
      }
      input[type='checkbox'] {
        width: auto;
        margin-right: 8px;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        max-height: 420px;
        overflow: auto;
      }
      .forecast-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
        gap: 16px;
      }
      .forecast-values {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .forecast-values span {
        padding: 10px;
        background: #f0f5f1;
        border-radius: 8px;
      }
      .lineage {
        overflow-wrap: anywhere;
      }
      select,
      input,
      textarea {
        max-width: 100%;
      }
    `,
  ],
})
export class ForecastWorkbench implements OnChanges {
  @Input() records: RecordContext = {};
  @Output() navigate = new EventEmitter<Journey>();
  readonly navigation = inject(NavigationState);
  @HostListener('input', ['$event']) markEdited(event: Event) {
    if (!(event.target as HTMLElement).closest('[data-record-picker]'))
      this.navigation.dirty.set(true);
  }
  async openContext() {
    const r = this.records;
    if (r.job) await this.openJob(r.job);
    if (r.version) {
      this.templateId = r.version;
      await this.chooseTemplate();
    }
    this.navigation.dirty.set(false);
  }

  @Input({ required: true }) workspace!: { id: string; kind: string; permissions?: string[] };
  @Output() usePlanning = new EventEmitter<RecordContext>();
  versions = signal<{ id: string; title: string }[]>([]);
  selected = new Set<string>();
  series = signal<string[]>([]);
  component = '';
  origin = '';
  horizon = 3;
  scheduled = false;
  structural = false;
  reviewed = false;
  evidence = signal<{ history: History; eligibility: Eligibility } | null>(null);
  artifact = signal<Artifact | null>(null);
  job = signal<Job | null>(null);
  jobs = signal<Job[]>([]);
  busy = signal(false);
  error = signal('');
  notice = signal('');
  templateId = '';
  template = signal<PlanningDocument | null>(null);
  mode: 'forecast' | 'assumption' = 'assumption';
  values = '';
  note = '';
  replace: string[] = [];
  sourceReview = false;
  composition = signal<{ baseline_version_id: string; assignments: Assignment[] } | null>(null);
  async ngOnChanges() {
    this.reset();
    await this.action(async () => {
      this.versions.set(
        (await this.api<{ versions: { id: string; title: string }[] }>('/planning/versions'))
          .versions,
      );
      this.jobs.set((await this.api<{ jobs: Job[] }>('/forecasts/jobs')).jobs);
      await this.openContext();
    });
  }
  reset() {
    this.selected.clear();
    this.evidence.set(null);
    this.artifact.set(null);
    this.job.set(null);
    this.template.set(null);
    this.composition.set(null);
  }
  async api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (method !== 'GET') {
      const r = await fetch('/api/v1/auth/csrf');
      headers['X-CSRF-Token'] = (await r.json()).token;
    }
    const response = await fetch(`/api/v1/workspaces/${this.workspace.id}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? data.error?.code ?? 'Request failed');
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
  changed() {
    this.evidence.set(null);
    this.artifact.set(null);
    this.job.set(null);
    this.sourceReview = false;
    this.composition.set(null);
  }
  async select(id: string, checked: boolean) {
    if (checked) this.selected.add(id);
    else this.selected.delete(id);
    this.changed();
    await this.action(async () => {
      const documents = await Promise.all(
        [...this.selected].map((id) =>
          this.api<{ document: PlanningDocument }>('/planning/versions/' + id),
        ),
      );
      this.series.set([
        ...new Set(documents.flatMap((v) => v.document.entries.map((e) => e.componentKey))),
      ]);
      if (!this.series().includes(this.component)) this.component = this.series()[0] ?? '';
    });
  }
  request() {
    return {
      planningVersionIds: [...this.selected],
      componentKey: this.component,
      origin: this.origin,
      horizon: Number(this.horizon),
      nature: this.scheduled ? 'known_schedule' : 'variable',
      structuralChange: this.structural,
      historyReviewed: this.reviewed,
      idempotencyKey: crypto.randomUUID(),
    };
  }
  async check() {
    await this.action(async () => {
      this.artifact.set(null);
      this.job.set(null);
      this.evidence.set(await this.api('/forecasts/eligibility', 'POST', this.request()));
      this.mode = 'assumption';
    });
  }
  async start() {
    await this.action(async () => {
      const job = await this.api<Job>('/forecasts/jobs', 'POST', this.request());
      this.job.set(job);
      await this.execute(job.id);
    });
  }
  async actionRetry(id: string) {
    await this.action(() => this.execute(id));
  }
  async execute(id: string) {
    this.job.set({ ...this.job()!, id, status: 'running' });
    const job = await this.api<Job>('/forecasts/jobs/' + id + '/run', 'POST', {});
    this.job.set(job);
    if (job.artifact_id) await this.loadArtifact(job.artifact_id);
    this.jobs.set((await this.api<{ jobs: Job[] }>('/forecasts/jobs')).jobs);
  }
  async openJob(id: string) {
    await this.action(async () => {
      const j = await this.api<Job>('/forecasts/jobs/' + id);
      this.job.set(j);
      if (j.artifact_id) await this.loadArtifact(j.artifact_id);
      else if (j.history && j.eligibility) {
        this.artifact.set(null);
        this.evidence.set({ history: j.history, eligibility: j.eligibility });
        this.selected = new Set(j.history.sourceVersionIds);
        this.series.set([j.history.componentKey]);
        this.component = j.history.componentKey;
        this.origin = j.history.origin;
        this.horizon = j.history.horizon;
        this.mode = 'assumption';
      }
    });
  }
  async loadArtifact(id: string) {
    const a = await this.api<Artifact>('/forecasts/artifacts/' + id);
    this.artifact.set(a);
    this.selected = new Set(a.history.sourceVersionIds);
    this.series.set([a.history.componentKey]);
    this.component = a.history.componentKey;
    this.origin = a.history.origin;
    this.horizon = a.history.horizon;
    this.scheduled = a.history.nature === 'known_schedule';
    this.structural = a.history.structuralChange;
    this.reviewed = true;
    this.sourceReview = false;
    this.evidence.set({ history: a.history, eligibility: a.eligibility });
    this.mode = a.result.status === 'supported' && a.approval_id ? 'forecast' : 'assumption';
  }
  async approve() {
    await this.action(async () => {
      const a = this.artifact()!;
      await this.api('/forecasts/artifacts/' + a.id + '/approve', 'POST', { reviewed: true });
      await this.loadArtifact(a.id);
      this.notice.set('Forecast approved. Create a new baseline to use these values.');
    });
  }
  async chooseTemplate() {
    this.sourceReview = false;
    await this.action(async () => {
      const t = await this.api<{ document: PlanningDocument }>(
        '/planning/versions/' + this.templateId,
      );
      this.template.set(t.document);
      this.replace = t.document.entries
        .filter(
          (e) => e.componentKey === this.component && e.effect === this.evidence()?.history.effect,
        )
        .map((e) => e.id);
    });
  }
  async compose() {
    await this.action(async () => {
      const history = this.evidence()!.history,
        a = this.artifact(),
        t = this.template()!;
      const existing = t.entries.find((e) => this.replace.includes(e.id));
      this.composition.set(
        await this.api('/forecasts/compositions', 'POST', {
          idempotencyKey: crypto.randomUUID(),
          templateVersionId: this.templateId,
          artifactId: this.mode === 'forecast' ? a?.id : null,
          approvalId: this.mode === 'forecast' ? a?.approval_id : null,
          componentKey: this.component,
          origin: this.origin,
          horizon: Number(this.horizon),
          title: t.title + ' — hybrid',
          mode: this.mode,
          assumptionValues:
            this.mode === 'assumption' ? this.values.split(/[\s,]+/).filter(Boolean) : [],
          note: this.note,
          cashTreatment: existing?.cashTreatment ?? {
            kind: 'profile',
            buckets: [{ offsetMonths: 0, proportion: '1' }],
          },
          category: history.category,
          effect: history.effect,
          replaceEntryIds: this.replace,
          sourcesReviewed: this.sourceReview,
        }),
      );
      this.navigation.dirty.set(false);
      this.notice.set('New hybrid baseline prepared. Open Data & baseline to run or publish it.');
    });
  }
}
