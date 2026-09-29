import type { ScenarioResult } from '../../../packages/scenarios/src/model';
import type { Journey } from './navigation';
import { Component, Input, Output, EventEmitter, OnChanges, signal } from '@angular/core';
import type { BaselineResult } from '../../../packages/planning/src/model';
import type { Brief } from '../../../packages/stress/src/model';
import { FinancialChart, FinancialMetric } from './ui';
import { TranslatePipe } from './i18n';
type Summary = { id: string; title: string; created_at?: string };
@Component({
  selector: 'executive-overview',
  standalone: true,
  imports: [TranslatePipe, FinancialChart, FinancialMetric],
  templateUrl: './overview.html',
})
export class ExecutiveOverview implements OnChanges {
  @Input({ required: true }) workspace!: { id: string; currency: string; kind: string };
  @Output() navigate = new EventEmitter<Journey>();
  result = signal<BaselineResult | null>(null);
  run = signal<Summary | null>(null);
  scenarios = signal<Summary[]>([]);
  briefs = signal<Summary[]>([]);
  brief = signal<Brief | null>(null);
  recentScenario = signal<ScenarioResult | null>(null);
  busy = signal(false);
  error = signal('');
  private generation = 0;
  ngOnChanges() {
    void this.load();
  }
  async load() {
    const gen = ++this.generation,
      wid = this.workspace.id;
    this.result.set(null);
    this.run.set(null);
    this.scenarios.set([]);
    this.briefs.set([]);
    this.brief.set(null);
    this.recentScenario.set(null);
    this.busy.set(true);
    this.error.set('');
    const get = async <T>(path: string): Promise<T> => {
      const r = await fetch(`/api/v1/workspaces/${wid}${path}`, { credentials: 'same-origin' });
      if (!r.ok) throw Error('Unable to load workspace evidence. Please retry.');
      return r.json();
    };
    try {
      const [runs, scenarios, briefs] = await Promise.all([
        get<{ runs: Summary[] }>('/planning/runs'),
        get<{ runs: Summary[] }>('/scenarios/runs'),
        get<{ briefs: Summary[] }>('/stress/briefs'),
      ]);
      const [result, brief, scenario] = await Promise.all([
        runs.runs[0] ? get<{ result: BaselineResult }>('/planning/runs/' + runs.runs[0].id) : null,
        briefs.briefs[0] ? get<{ document: Brief }>('/stress/briefs/' + briefs.briefs[0].id) : null,
        scenarios.runs[0]
          ? get<{ result: ScenarioResult }>('/scenarios/runs/' + scenarios.runs[0].id)
          : null,
      ]);
      if (gen !== this.generation) return;
      this.run.set(runs.runs[0] ?? null);
      this.result.set(result?.result ?? null);
      this.scenarios.set(scenarios.runs.slice(0, 3));
      this.briefs.set(briefs.briefs.slice(0, 3));
      this.brief.set(brief?.document ?? null);
      this.recentScenario.set(scenario?.result ?? null);
    } catch (e) {
      if (gen === this.generation) this.error.set((e as Error).message);
    } finally {
      if (gen === this.generation) this.busy.set(false);
    }
  }
  get last() {
    return this.result()?.periods.at(-1);
  }
}
