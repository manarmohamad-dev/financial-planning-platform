import { RecordHistory, WorkflowStages } from './ui';
import { NavigationState, type Journey, type RecordContext } from './navigation';
import { inject, HostListener } from '@angular/core';
import { TranslatePipe, LocalDatePipe } from './i18n';

import { Component, Input, Output, EventEmitter, OnChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import type {
  Mapping,
  MappingRule,
  Inspection,
  Suggestion,
  Validation,
} from '../../../packages/imports/src/model';
type Summary = {
  id: string;
  name: string;
  status: string;
  parse_error: string | null;
  cancelled: boolean;
};
type FileInfo = Summary & {
  file_hash: string;
  uploaded_by: string;
  uploaded_at: string;
  sheets: { name: string; rows: number; columns: number }[];
  warnings: string[];
  drafts: { id: string; revision: number; mapping: Mapping }[];
};
type Dataset = {
  id: string;
  title: string;
  planning_version_id: string;
  mapping_version_id: string;
};
@Component({
  selector: 'import-workbench',
  standalone: true,
  imports: [RecordHistory, WorkflowStages, LocalDatePipe, TranslatePipe, FormsModule, JsonPipe],
  templateUrl: './imports.html',
})
export class ImportWorkbench implements OnChanges {
  @Input() records: RecordContext = {};
  @Output() navigate = new EventEmitter<Journey>();
  readonly navigation = inject(NavigationState);
  @HostListener('input', ['$event']) markEdited(event: Event) {
    if (!(event.target as HTMLElement).closest('[data-record-picker]'))
      this.navigation.dirty.set(true);
  }
  async openContext() {
    const r = this.records;
    if (r.file) await this.openFile(r.file);
    if (r.file && r.draft) await this.loadDraft(r.draft);
    if (r.dataset) await this.loadDataset(r.dataset);
    this.navigation.dirty.set(false);
  }

  @Input({ required: true }) workspace!: {
    id: string;
    kind: string;
    currency: string;
    permissions?: string[];
  };
  @Output() usePlanning = new EventEmitter<RecordContext>();
  files = signal<Summary[]>([]);
  datasets = signal<Dataset[]>([]);
  templates = signal<{ id: string; name: string; version: number; fingerprint: string }[]>([]);
  info = signal<FileInfo | null>(null);
  inspection = signal<Inspection | null>(null);
  suggestions = signal<Suggestion[]>([]);
  report = signal<Validation | null>(null);
  history = signal<unknown>(null);
  error = signal('');
  notice = signal('');
  busy = signal(false);
  file: File | null = null;
  delimiter = ',';
  sheet = '';
  headerRow = 1;
  mapping: Mapping | null = null;
  draftId = '';
  revision = 0;
  mappingVersionId = '';
  datasetId = '';
  planningVersionId = '';
  reviewed = false;
  accepted: string[] = [];
  templateName = '';
  templateId = '';
  excludeRow = 0;
  excludeReason = '';
  readonly roles = [
    'unreviewed',
    'ignore',
    'period',
    'end_period',
    'currency',
    'basis',
    'scope',
    'label',
    'amount',
    'opening_available',
    'opening_restricted',
  ];
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
  readonly effects = [
    'revenue',
    'revenue_reduction',
    'operating_expense',
    'non_operating_expense',
    'cash_receipt',
    'cash_payment',
    'restricted_release',
  ];
  ngOnChanges() {
    this.mapping = null;
    this.info.set(null);
    this.inspection.set(null);
    this.report.set(null);
    this.history.set(null);
    return this.perform(async () => {
      await this.refresh();
      await this.openContext();
    });
  }
  can(p: string) {
    return this.workspace.permissions?.includes(p) ?? false;
  }
  text(s: string) {
    return s.replaceAll('_', ' ');
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
  private async api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (method !== 'GET')
      headers['X-CSRF-Token'] = (await fetch('/api/v1/auth/csrf').then((r) => r.json())).token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`/api/v1/workspaces/${this.workspace.id}/imports${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const d = await response.json();
    if (!response.ok) {
      if (d.error?.details?.issues) this.report.set(d.error.details);
      throw new Error(d.error?.message ?? d.error?.code ?? 'Request failed');
    }
    return d;
  }
  async refresh() {
    const [f, d, t] = await Promise.all([
      this.api<{ imports: Summary[] }>(''),
      this.api<{ datasets: Dataset[] }>('/datasets'),
      this.api<{ templates: { id: string; name: string; version: number; fingerprint: string }[] }>(
        '/templates',
      ),
    ]);
    this.files.set(f.imports);
    this.datasets.set(d.datasets);
    this.templates.set(t.templates);
  }
  picked(event: Event) {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
  }
  upload() {
    return this.perform(async () => {
      if (!this.file) throw new Error('Select an XLSX or CSV file.');
      if (this.file.size > 5 * 1024 * 1024) throw new Error('Files must be no larger than 5 MiB.');
      const token = (await fetch('/api/v1/auth/csrf').then((r) => r.json())).token;
      const response = await fetch(`/api/v1/workspaces/${this.workspace.id}/imports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-CSRF-Token': token,
          'X-File-Name': encodeURIComponent(this.file.name),
          'X-CSV-Delimiter': this.delimiter,
        },
        body: this.file,
      });
      const d = await response.json();
      if (!response.ok) throw new Error(d.error?.message ?? 'Upload failed');
      await this.openFile(d.id);
      await this.refresh();
    });
  }
  private async openFile(id: string) {
    const f = await this.api<FileInfo>('/' + id);
    this.info.set(f);
    this.mapping = null;
    this.mappingVersionId = '';
    this.datasetId = '';
    this.planningVersionId = '';
    this.report.set(null);
    this.inspection.set(null);
    this.sheet = f.sheets[0]?.name ?? '';
    this.headerRow = 1;
    if (f.status === 'failed')
      this.error.set(
        'Parsing rejected: ' +
          f.parse_error +
          '. Use a supported values-only file within the documented limits.',
      );
    else if (this.sheet) await this.previewNow();
  }
  loadFile(id: string) {
    return this.perform(() => this.openFile(id));
  }
  private async previewNow() {
    const p = await this.api<{ inspection: Inspection; suggestions: Suggestion[] }>(
      '/' +
        this.info()!.id +
        '/preview?sheet=' +
        encodeURIComponent(this.sheet) +
        '&headerRow=' +
        this.headerRow,
    );
    this.inspection.set(p.inspection);
    this.suggestions.set(p.suggestions);
  }
  preview() {
    return this.perform(() => this.previewNow());
  }
  select() {
    return this.perform(async () => {
      const d = await this.api<{
        id: string;
        revision: number;
        mapping: Mapping;
        inspection: Inspection;
        suggestions: Suggestion[];
      }>('/' + this.info()!.id + '/select-sheet', 'POST', {
        sheet: this.sheet,
        headerRow: this.headerRow,
      });
      this.draftId = d.id;
      this.revision = d.revision;
      this.mapping = d.mapping;
      this.inspection.set(d.inspection);
      this.suggestions.set(d.suggestions);
      this.changed();
    });
  }
  changed() {
    this.navigation.dirty.set(true);
    this.mappingVersionId = '';
    this.reviewed = false;
    this.accepted = [];
    this.report.set(null);
    this.datasetId = '';
    this.planningVersionId = '';
  }
  roleChanged(column: number) {
    this.changed();
    if (
      this.mapping?.columns.find((c) => c.column === column)?.role === 'amount' &&
      !this.mapping.rules.some((r) => r.column === column)
    )
      this.addRule(column);
  }
  addRule(column: number) {
    if (!this.mapping) return;
    const suggested = this.suggestions().find((s) => s.column === column)?.meaning;
    const category = this.categories.includes(suggested ?? '') ? suggested! : 'revenue';
    this.mapping.rules.push({
      id: crypto.randomUUID(),
      column,
      filter: null,
      component: 'column_' + (column + 1),
      category: category as MappingRule['category'],
      effect:
        category === 'revenue'
          ? 'revenue'
          : category === 'known_receipt'
            ? 'cash_receipt'
            : ['known_payment', 'capex', 'purchases'].includes(category)
              ? 'cash_payment'
              : 'operating_expense',
      basis: null,
      approveBudgetAsAssumption: false,
      semanticConfirmed: false,
      behavior: 'monthly',
      sign: null,
      timing: 'unknown',
      offset: 0,
      committed: false,
      openingObligation: false,
      note: '',
    });
    this.changed();
  }
  addFilter(r: MappingRule) {
    r.filter = { column: 0, value: '' };
    this.changed();
  }
  addOpening() {
    if (this.mapping)
      this.mapping.opening = { available: null, restricted: null, source: 'observed', note: '' };
    this.changed();
  }
  exclude() {
    if (!this.mapping || !this.excludeRow || !this.excludeReason.trim()) return;
    this.mapping.excludedRows = this.mapping.excludedRows.filter((x) => x.row !== this.excludeRow);
    this.mapping.excludedRows.push({ row: this.excludeRow, reason: this.excludeReason });
    this.excludeRow = 0;
    this.excludeReason = '';
    this.changed();
  }
  private async save() {
    const d = await this.api<{ revision: number }>('/mappings/' + this.draftId, 'PATCH', {
      revision: this.revision,
      mapping: this.mapping,
    });
    this.revision = d.revision;
  }
  saveDraft() {
    return this.perform(async () => {
      await this.save();
      this.navigation.dirty.set(false);
      this.notice.set('Mapping draft saved. No dataset has been confirmed.');
    });
  }
  validate() {
    return this.perform(async () => {
      await this.save();
      this.navigation.dirty.set(false);
      this.mappingVersionId = '';
      this.report.set(
        await this.api<Validation>('/mappings/' + this.draftId + '/validate', 'POST'),
      );
      this.accepted = [];
    });
  }
  confirmMapping() {
    return this.perform(async () => {
      if (!this.reviewed) throw new Error('Explicitly review the mapping before confirming it.');
      await this.save();
      this.navigation.dirty.set(false);
      const v = await this.api<{ id: string }>('/mappings/' + this.draftId + '/confirm', 'POST', {
        revision: this.revision,
        reviewed: true,
      });
      this.mappingVersionId = v.id;
      this.report.set(
        await this.api<Validation>('/mapping-versions/' + v.id + '/validate', 'POST'),
      );
      this.accepted = [];
      this.notice.set(
        'Mapping version is immutable. Review validation and warnings before confirming the dataset.',
      );
    });
  }
  accept(code: string, on: boolean) {
    this.accepted = on ? [...this.accepted, code] : this.accepted.filter((x) => x !== code);
  }
  warnings() {
    return [
      ...new Set(
        this.report()
          ?.issues.filter((x) => x.severity === 'warning')
          .map((x) => x.code) ?? [],
      ),
    ];
  }
  confirm() {
    return this.perform(async () => {
      const d = await this.api<{ id: string; planningVersionId: string }>(
        '/mapping-versions/' + this.mappingVersionId + '/dataset',
        'POST',
        { confirmed: true, acceptedWarnings: this.accepted },
      );
      this.datasetId = d.id;
      this.planningVersionId = d.planningVersionId;
      this.notice.set(
        'Immutable dataset confirmed. It is now an ordinary M2 planning version available in Data & baseline.',
      );
      await this.refresh();
    });
  }
  loadDraft(id: string) {
    return this.perform(async () => {
      const d = await this.api<{
        id: string;
        importId: string;
        revision: number;
        mapping: Mapping;
      }>('/mappings/' + id);
      this.mapping = d.mapping;
      this.draftId = d.id;
      this.revision = d.revision;
      this.sheet = d.mapping.sheet;
      this.headerRow = d.mapping.headerRow;
      await this.previewNow();
      this.changed();
    });
  }
  loadDataset(id: string) {
    return this.perform(async () => {
      this.history.set(await this.api('/datasets/' + id));
      this.datasetId = id;
      const d = this.datasets().find((x) => x.id === id);
      this.planningVersionId = d?.planning_version_id ?? '';
      this.mappingVersionId = d?.mapping_version_id ?? '';
    });
  }
  replay() {
    return this.perform(async () => {
      const r = await this.api<{ matches: boolean }>(
        '/datasets/' + this.datasetId + '/replay',
        'POST',
      );
      this.notice.set(
        r.matches
          ? 'Normalization replay matched the immutable dataset and row lineage.'
          : 'Normalization replay mismatch.',
      );
    });
  }
  template() {
    return this.perform(async () => {
      await this.api('/templates', 'POST', {
        name: this.templateName,
        mappingVersionId: this.mappingVersionId,
      });
      await this.refresh();
      this.notice.set('Workspace mapping template saved as a new immutable template version.');
    });
  }
  applyTemplate() {
    return this.perform(async () => {
      const d = await this.api<{ revision: number; mapping: Mapping }>(
        '/mappings/' + this.draftId + '/template',
        'POST',
        { templateId: this.templateId, revision: this.revision, reviewBeforeConfirmation: true },
      );
      this.mapping = d.mapping;
      this.revision = d.revision;
      this.changed();
      this.notice.set(
        'Template proposed. Reconfirm meanings, coverage, currency and evidence for this new file.',
      );
    });
  }
  cancel() {
    return this.perform(async () => {
      await this.api('/' + this.info()!.id + '/cancel', 'POST');
      this.mapping = null;
      this.inspection.set(null);
      this.info.set(null);
      await this.refresh();
      this.notice.set(
        'Import cancelled. Original provenance is retained; it cannot create further datasets.',
      );
    });
  }
}
