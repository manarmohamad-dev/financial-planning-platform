import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  HostListener,
  inject,
  signal,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { LocaleService, TranslatePipe } from './i18n.js';
import type { AiOutput, AiSource, AiTask } from '../../../packages/ai/src/model.js';
import type { AiEvidence } from '../../../packages/ai/src/validation.js';
import {
  scenarioDocumentSchema,
  type ScenarioDocument,
} from '../../../packages/scenarios/src/model.js';
import { NavigationState } from './navigation.js';
type Artifact = {
  id: string;
  output: AiOutput;
  evidence: AiEvidence;
  proposal: ScenarioDocument | null;
  model: string;
  source_ref: AiSource;
  input_chain: { text: string | null; answers: { questionId: string; text: string }[] };
};
@Component({
  selector: 'ai-assistance',
  standalone: true,
  imports: [FormsModule, TranslatePipe, JsonPipe],
  templateUrl: './ai-assistance.html',
  styles: ['.ai-fact { display: inline-block; margin-inline: .25em; } @media print { :host { display: none !important; } }'],
})
export class AiAssistance implements OnChanges, OnDestroy {
  @Input({ required: true }) workspaceId!: string;
  @Input({ required: true }) source!: AiSource;
  @Input({ required: true }) task!: AiTask;
  @Input() historyOnly = false;
  get assistanceLabel() {
    if (this.historyOnly) return 'Saved AI assistance';
    if (this.task === 'assumption_review') return 'AI · Review recorded assumptions';
    if (this.task === 'brief_narrative') return 'AI · Explain this decision brief';
    if (this.source?.kind === 'stress_comparison') return 'AI · Explain these risk findings';
    return 'AI · Explain this saved result';
  }
  @Output() applied = new EventEmitter<string>();
  readonly locale = inject(LocaleService);
  readonly navigation = inject(NavigationState);
  constructor() {
    effect(() => {
      this.locale.locale();
      this.preview.set(null);
      this.consent = false;
    });
  }
  available = signal(false);
  busy = signal(false);
  error = signal('');
  artifact = signal<Artifact | null>(null);
  text = '';
  consent = false;
  reviewed = false;
  proposal = '';
  answers: Record<string, string> = {};
  preview = signal<unknown>(null);
  history = signal<{ id: string; created_at: string; outcome: string; locale: string }[]>([]);
  private generation = 0;
  private controller = new AbortController();
  @HostListener('input', ['$event']) markEdited(event: Event) {
    if ((event.target as HTMLInputElement).type === 'checkbox') return;
    this.navigation.dirty.set(true);
    this.reviewed = false;
    this.preview.set(null);
    this.consent = false;
  }
  ngOnDestroy() {
    this.controller.abort();
    this.generation++;
  }
  async ngOnChanges() {
    const generation = ++this.generation;
    this.controller.abort();
    this.controller = new AbortController();
    this.history.set([]);
    this.artifact.set(null);
    this.error.set('');
    this.available.set(false);
    this.reviewed = false;
    this.answers = {};
    this.preview.set(null);
    this.consent = false;
    this.text = '';
    try {
      const r = await this.api<{ available: boolean }>('/capabilities');
      if (generation === this.generation) {
        this.available.set(r.available);
        await this.loadHistory();
      }
    } catch {
      if (generation === this.generation) this.available.set(false);
    }
  }
  private async api<T>(path: string, body?: unknown): Promise<T> {
    const workspaceId = this.workspaceId,
      signal = this.controller.signal;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (body !== undefined) {
      const r = await fetch('/api/v1/auth/csrf', { signal });
      headers['X-CSRF-Token'] = (await r.json()).token;
    }
    const response = await fetch(`/api/v1/workspaces/${workspaceId}/ai${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.code ?? payload?.code ?? 'AI_UNAVAILABLE');
    }
    return response.json();
  }
  private errorMessage(error: unknown) {
    const code = error instanceof Error ? error.message : '';
    const messages: Record<string, string> = {
      AI_UNGROUNDED_PROSE: 'This assistance does not meet current evidence rules. Request fresh assistance or continue manually.',
      AI_UNSUPPORTED_CLAIM: 'This assistance does not meet current evidence rules. Request fresh assistance or continue manually.',
      AI_RATE_LIMITED:
        'AI is temporarily busy. Wait before retrying; manual tools remain available.',
      AI_TIMEOUT: 'AI timed out. Your inputs are preserved; retry or continue manually.',
      AI_CONTEXT_TOO_LARGE:
        'This source is too large for AI assistance. Continue with the complete manual tools.',
      AI_SOURCE_CHANGED:
        'The source changed. Reopen the current record before requesting assistance.',
      AI_CLARIFICATION_LIMIT: 'Continue the remaining clarification in the manual editor.',
      AI_INPUT_CHANGED: 'Start a new request after changing your original instructions.',
    };
    return (
      messages[code] ??
      'AI request could not be completed. Your manual workflow is still available.'
    );
  }
  private async loadHistory() {
    const generation = this.generation;
    const r = await this.api<{
      artifacts: { id: string; created_at: string; outcome: string; locale: string }[];
    }>(`/artifacts?sourceId=${encodeURIComponent(this.source.id)}&task=${this.task}`);
    if (generation === this.generation) this.history.set(r.artifacts);
  }
  async openArtifact(id: string) {
    if (this.busy() || !(await this.navigation.allowLeave())) return;
    const generation = this.generation;
    try {
      const a = await this.api<Artifact>('/artifacts/' + id);
      if (generation === this.generation) {
        this.artifact.set(a);
        this.proposal = a.proposal ? JSON.stringify(a.proposal, null, 2) : '';
        this.text = a.input_chain.text ?? '';
        this.answers = {};
        this.preview.set(null);
        this.consent = false;
        this.reviewed = false;
      }
    } catch (e) {
      this.error.set(this.errorMessage(e));
    }
  }
  restart() {
    this.artifact.set(null);
    this.answers = {};
    this.proposal = '';
    this.reviewed = false;
    this.consent = false;
  }
  async generate() {
    if (this.historyOnly || this.busy() || !this.consent || !this.available()) return;
    this.busy.set(true);
    this.error.set('');
    this.navigation.begin();
    const generation = this.generation;
    try {
      const old = this.artifact();
      const r = await this.api<Artifact>('/requests', {
        task: this.task,
        locale: this.locale.locale(),
        source: this.source,
        text: this.text.trim() || null,
        priorArtifactId: old?.output.outcome === 'needs_clarification' ? old.id : null,
        answers:
          old?.output.outcome === 'needs_clarification'
            ? Object.entries(this.answers)
                .filter(([, v]) => v.trim())
                .map(([questionId, text]) => ({ questionId, text }))
            : [],
        consentVersion: 'groq-minimal-context-1',
        idempotencyKey: crypto.randomUUID(),
      });
      if (generation !== this.generation) return;
      this.artifact.set(r);
      this.proposal = r.proposal ? JSON.stringify(r.proposal, null, 2) : '';
      this.reviewed = false;
      this.answers = {};
      await this.loadHistory();
    } catch (e) {
      if (generation === this.generation) this.error.set(this.errorMessage(e));
    } finally {
      this.busy.set(false);
      this.navigation.end();
    }
  }
  async previewContext() {
    if (this.historyOnly || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const generation = this.generation;
    try {
      const result = await this.api<{ context: unknown }>('/context', {
        task: this.task,
        locale: this.locale.locale(),
        source: this.source,
        text: this.text.trim() || null,
        priorArtifactId:
          this.artifact()?.output.outcome === 'needs_clarification' ? this.artifact()!.id : null,
        answers:
          this.artifact()?.output.outcome === 'needs_clarification'
            ? Object.entries(this.answers)
                .filter(([, v]) => v.trim())
                .map(([questionId, text]) => ({ questionId, text }))
            : [],
        consentVersion: 'groq-minimal-context-1',
        idempotencyKey: crypto.randomUUID(),
      });
      if (generation === this.generation) this.preview.set(result.context);
    } catch (e) {
      if (generation === this.generation) this.error.set(this.errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
  async apply() {
    if (!this.reviewed || this.busy() || !this.artifact()?.proposal) return;
    this.busy.set(true);
    this.error.set('');
    this.navigation.begin();
    const generation = this.generation;
    let createdId: string | undefined;
    try {
      const result = await this.api<{ id: string }>(`/artifacts/${this.artifact()!.id}/apply`, {
        reviewed: true,
        document: JSON.parse(this.proposal),
      });
      if (generation === this.generation) {
        this.navigation.dirty.set(false);
        createdId = result.id;
      }
    } catch (e) {
      if (generation === this.generation) this.error.set(this.errorMessage(e));
    } finally {
      this.busy.set(false);
      this.navigation.end();
    }
    if(createdId && generation === this.generation) this.applied.emit(createdId);
  }
  operationLabel(operation: string): string {
    return ({set:'Set monthly amount',add:'Increase by amount',subtract:'Reduce by amount',percentage_increase:'Increase by rate',percentage_decrease:'Decrease by rate',remove:'Remove during selected months'} as Record<string,string>)[operation] ?? operation;
  }
  reviewedProposal(): ScenarioDocument | null {
    try {
      const parsed = scenarioDocumentSchema.safeParse(JSON.parse(this.proposal));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
  fact(ref: string | null) {
    return ref ? this.artifact()?.evidence.facts[ref] : undefined;
  }
  narrative() {
    const v = this.artifact()?.output;
    return v?.task === 'result_explain' || v?.task === 'brief_narrative' ? v.payload : null;
  }
  issues() {
    const v = this.artifact()?.output;
    return v?.task === 'assumption_review' ? v.payload.issues : [];
  }
}
