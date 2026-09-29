import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  mappingSchema,
  type Mapping,
  type RawImport,
  type Validation,
} from '../../../packages/imports/src/model.js';
import {
  parseFile,
  safeFilename,
  hash,
  inspect,
  suggest,
  ImportFailure,
} from '../../../packages/imports/src/parser.js';
import { initialMapping, normalizeImport } from '../../../packages/imports/src/normalize.js';
import type { PlanningDocument } from '../../../packages/planning/src/model.js';
import {
  createFinancialDraft,
  confirmPlanning,
  readPlanningVersion,
  type PlanningContext,
} from './planning-service.js';
import { audit } from './db.js';
import { AppError } from './errors.js';
export async function uploadImport(
  c: PlanningContext,
  name: string,
  bytes: Buffer,
  delimiter: string,
) {
  safeFilename(name);
  const id = randomUUID();
  let raw: RawImport | null = null,
    error: string | null = null;
  try {
    raw = await parseFile(name, bytes, delimiter);
  } catch (e) {
    if (!(e instanceof ImportFailure)) throw e;
    error = e.code;
  }
  await c.db.query(
    'INSERT INTO import_files(id,workspace_id,name,file_type,file_hash,original,raw,status,parse_error,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      id,
      c.workspaceId,
      name,
      name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv',
      hash(bytes),
      bytes,
      raw,
      raw ? 'parsed' : 'failed',
      error,
      c.actorId,
    ],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'import.uploaded', id, c.requestId);
  await audit(
    c.db,
    c.workspaceId,
    c.actorId,
    raw ? 'import.parsing_completed' : 'import.parsing_failed',
    id,
    c.requestId,
    { ...(error ? { code: error } : {}) },
  );
  return { id, status: raw ? 'parsed' : 'failed', error };
}
export async function getImport(c: PlanningContext, id: string) {
  const r = (
    await c.db.query(
      'SELECT id,name,file_type,file_hash,raw,status,parse_error,uploaded_by,uploaded_at,EXISTS(SELECT 1 FROM import_cancellations x WHERE x.workspace_id=f.workspace_id AND x.import_id=f.id) AS cancelled FROM import_files f WHERE workspace_id=$1 AND id=$2',
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return r as {
    id: string;
    name: string;
    file_type: string;
    file_hash: string;
    raw: RawImport | null;
    status: string;
    parse_error: string | null;
    uploaded_by: string;
    uploaded_at: Date;
    cancelled: boolean;
  };
}
async function usable(c: PlanningContext, id: string) {
  const f = await getImport(c, id);
  if (f.cancelled) throw new AppError(409, 'IMPORT_CANCELLED');
  if (!f.raw) throw new AppError(422, 'PARSE_FAILED', f.parse_error ?? 'Parsing failed');
  return { ...f, raw: f.raw };
}
export async function selectSheet(
  c: PlanningContext,
  id: string,
  sheet: string,
  headerRow: number,
) {
  const f = await usable(c, id);
  const mapping = initialMapping(f.raw, sheet, headerRow);
  const draftId = randomUUID();
  await c.db.query(
    'INSERT INTO import_mapping_drafts(id,workspace_id,import_id,mapping,updated_by) VALUES($1,$2,$3,$4,$5)',
    [draftId, c.workspaceId, id, mapping, c.actorId],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'import.sheet_selected', id, c.requestId);
  await audit(c.db, c.workspaceId, c.actorId, 'import.mapping_suggested', draftId, c.requestId);
  return {
    id: draftId,
    revision: 1,
    mapping,
    inspection: inspect(f.raw, sheet, headerRow),
    suggestions: suggest(inspect(f.raw, sheet, headerRow)),
  };
}
export async function getMapping(c: PlanningContext, id: string, lock = false) {
  const r = (
    await c.db.query(
      `SELECT * FROM import_mapping_drafts WHERE workspace_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`,
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return {
    id: r.id as string,
    importId: r.import_id as string,
    revision: r.revision as number,
    mapping: mappingSchema.parse(r.mapping),
  };
}
export async function editMapping(
  c: PlanningContext,
  id: string,
  revision: number,
  mapping: Mapping,
) {
  const old = await getMapping(c, id, true);
  if (old.revision !== revision) throw new AppError(409, 'VERSION_CONFLICT');
  const f = await usable(c, old.importId);
  if (inspect(f.raw, mapping.sheet, mapping.headerRow).fingerprint !== mapping.fingerprint)
    throw new AppError(422, 'STRUCTURE_CHANGED');
  await c.db.query(
    'UPDATE import_mapping_drafts SET mapping=$1,revision=revision+1,updated_by=$2,updated_at=now() WHERE workspace_id=$3 AND id=$4',
    [mapping, c.actorId, c.workspaceId, id],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'import.mapping_edited', id, c.requestId, {
    revision: revision + 1,
  });
  return { id, revision: revision + 1 };
}
export async function confirmMapping(c: PlanningContext, id: string, revision: number) {
  const d = await getMapping(c, id, true);
  if (d.revision !== revision) throw new AppError(409, 'VERSION_CONFLICT');
  await usable(c, d.importId);
  if (
    d.mapping.columns.some((x) => x.role === 'unreviewed') ||
    d.mapping.rules.some((r) => !r.semanticConfirmed)
  )
    throw new AppError(
      422,
      'MAPPING_REVIEW_REQUIRED',
      'Review every column and explicitly confirm each financial meaning before confirming this mapping.',
    );
  const prior = (
    await c.db.query(
      'SELECT id FROM import_mapping_versions WHERE workspace_id=$1 AND draft_id=$2 AND draft_revision=$3',
      [c.workspaceId, id, revision],
    )
  ).rows[0];
  if (prior) return { id: prior.id as string };
  const versionId = randomUUID();
  await c.db.query(
    'INSERT INTO import_mapping_versions(id,workspace_id,import_id,draft_id,draft_revision,mapping,confirmed_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [versionId, c.workspaceId, d.importId, id, revision, d.mapping, c.actorId],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'import.mapping_confirmed', versionId, c.requestId, {
    revision,
  });
  return { id: versionId };
}
export async function getMappingVersion(c: PlanningContext, id: string) {
  const r = (
    await c.db.query('SELECT * FROM import_mapping_versions WHERE workspace_id=$1 AND id=$2', [
      c.workspaceId,
      id,
    ])
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return { ...r, mapping: mappingSchema.parse(r.mapping) } as {
    id: string;
    import_id: string;
    mapping: Mapping;
    confirmed_by: string;
    confirmed_at: Date;
  };
}
async function existingDocuments(c: PlanningContext) {
  const ids = (
    await c.db.query(
      'SELECT id FROM planning_versions WHERE workspace_id=$1 ORDER BY confirmed_at DESC LIMIT 50',
      [c.workspaceId],
    )
  ).rows;
  const docs: PlanningDocument[] = [];
  for (const r of ids) docs.push((await readPlanningVersion(c, r.id)).document);
  return docs;
}
export async function validateMapping(
  c: PlanningContext,
  importId: string,
  mapping: Mapping,
  currency: PlanningDocument['currency'],
) {
  const f = await usable(c, importId);
  const report = normalizeImport(f.raw, mapping, currency, importId, await existingDocuments(c));
  await audit(
    c.db,
    c.workspaceId,
    c.actorId,
    'import.validation_performed',
    importId,
    c.requestId,
    { blockers: report.issues.filter((x) => x.severity === 'blocker').length },
  );
  return report;
}
export async function confirmDataset(
  c: PlanningContext,
  versionId: string,
  currency: PlanningDocument['currency'],
  acceptedWarnings: string[],
) {
  const v = await getMappingVersion(c, versionId);
  const prior = (
    await c.db.query(
      'SELECT id,planning_version_id FROM import_datasets WHERE workspace_id=$1 AND mapping_version_id=$2',
      [c.workspaceId, versionId],
    )
  ).rows[0];
  if (prior)
    return { id: prior.id as string, planningVersionId: prior.planning_version_id as string };
  const report = await validateMapping(c, v.import_id, v.mapping, currency);
  if (!report.canConfirm || !report.document)
    throw new AppError(
      422,
      'IMPORT_BLOCKED',
      'Resolve blockers before dataset confirmation.',
      report,
    );
  const required = [
    ...new Set(report.issues.filter((x) => x.severity === 'warning').map((x) => x.code)),
  ];
  if (required.some((code) => !acceptedWarnings.includes(code)))
    throw new AppError(
      422,
      'WARNINGS_NOT_ACCEPTED',
      'Review and explicitly acknowledge every current warning.',
      report,
    );
  const draft = await createFinancialDraft(c, report.document);
  const version = await confirmPlanning(c, draft.id, 1);
  const id = randomUUID();
  await c.db.query(
    'INSERT INTO import_datasets(id,workspace_id,import_id,mapping_version_id,planning_version_id,normalized_document,lineage,validation,accepted_warnings,confirmed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      id,
      c.workspaceId,
      v.import_id,
      versionId,
      version.id,
      report.document,
      JSON.stringify(report.lineage),
      report,
      JSON.stringify(required),
      c.actorId,
    ],
  );
  for (const code of required)
    await audit(c.db, c.workspaceId, c.actorId, 'import.warning_accepted', id, c.requestId, {
      code,
    });
  await audit(c.db, c.workspaceId, c.actorId, 'import.source_selection_confirmed', id, c.requestId);
  await audit(c.db, c.workspaceId, c.actorId, 'import.dataset_confirmed', id, c.requestId);
  return { id, planningVersionId: version.id };
}
export async function readDataset(c: PlanningContext, id: string) {
  const r = (
    await c.db.query(
      'SELECT d.*,f.name,f.file_hash,f.uploaded_by,f.uploaded_at FROM import_datasets d JOIN import_files f ON f.workspace_id=d.workspace_id AND f.id=d.import_id WHERE d.workspace_id=$1 AND d.id=$2',
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return r as {
    id: string;
    import_id: string;
    mapping_version_id: string;
    planning_version_id: string;
    normalized_document: PlanningDocument;
    lineage: unknown;
    validation: Validation;
  };
}
export async function replayDataset(
  c: PlanningContext,
  id: string,
  currency: PlanningDocument['currency'],
) {
  const d = await readDataset(c, id),
    v = await getMappingVersion(c, d.mapping_version_id),
    f = await getImport(c, d.import_id);
  const result = normalizeImport(f.raw!, v.mapping, currency, d.import_id);
  return {
    matches:
      isDeepStrictEqual(result.document, d.normalized_document) &&
      isDeepStrictEqual(result.lineage, d.lineage),
  };
}
export async function saveTemplate(c: PlanningContext, versionId: string, name: string) {
  const v = await getMappingVersion(c, versionId);
  if (
    !(
      await c.db.query(
        'SELECT 1 FROM import_datasets WHERE workspace_id=$1 AND mapping_version_id=$2',
        [c.workspaceId, versionId],
      )
    ).rowCount
  )
    throw new AppError(
      422,
      'DATASET_CONFIRM_REQUIRED',
      'Save templates only from a confirmed, validated dataset.',
    );
  const revision = Number(
    (
      await c.db.query(
        'SELECT COALESCE(MAX(version),0)+1 AS n FROM import_mapping_templates WHERE workspace_id=$1 AND name=$2',
        [c.workspaceId, name],
      )
    ).rows[0].n,
  );
  const id = randomUUID();
  await c.db.query(
    'INSERT INTO import_mapping_templates(id,workspace_id,name,version,mapping_version_id,fingerprint,mapping,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, c.workspaceId, name, revision, versionId, v.mapping.fingerprint, v.mapping, c.actorId],
  );
  await audit(
    c.db,
    c.workspaceId,
    c.actorId,
    revision === 1 ? 'import.template_created' : 'import.template_versioned',
    id,
    c.requestId,
    { revision },
  );
  return { id, version: revision };
}
export async function applyTemplate(
  c: PlanningContext,
  draftId: string,
  templateId: string,
  revision: number,
) {
  const d = await getMapping(c, draftId);
  const t = (
    await c.db.query(
      'SELECT mapping,fingerprint FROM import_mapping_templates WHERE workspace_id=$1 AND id=$2',
      [c.workspaceId, templateId],
    )
  ).rows[0];
  if (!t) throw new AppError(404, 'NOT_FOUND');
  if (t.fingerprint !== d.mapping.fingerprint)
    throw new AppError(
      422,
      'TEMPLATE_STRUCTURE_MISMATCH',
      'Headers or column order changed. Review a fresh mapping; no template columns were applied.',
    );
  const prior = mappingSchema.parse(t.mapping);
  const mapping: Mapping = {
    ...prior,
    sheet: d.mapping.sheet,
    headerRow: d.mapping.headerRow,
    title: d.mapping.title,
    projectionStart: d.mapping.projectionStart,
    coverageFrom: null,
    coverageTo: null,
    coverageReviewed: false,
    currencyConfirmed: false,
    basisConfirmed: false,
    scopeConfirmed: false,
    opening: null,
    excludedRows: [],
    reviewedRows: [],
    sourceResolution: { mode: null, note: '' },
    rules: prior.rules.map((r) => ({ ...r, semanticConfirmed: false })),
  };
  const saved = await editMapping(c, draftId, revision, mapping);
  await audit(c.db, c.workspaceId, c.actorId, 'import.template_proposed', templateId, c.requestId);
  return { ...saved, mapping };
}
