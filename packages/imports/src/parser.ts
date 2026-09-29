import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { fromBuffer, type Entry } from 'yauzl';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parse } from 'csv-parse/sync';
import {
  IMPORT_CONTRACT,
  LIMITS,
  type Cell,
  type RawImport,
  type RawSheet,
  type Inspection,
  type Suggestion,
} from './model.js';
export class ImportFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string): never => {
  throw new ImportFailure(code, message);
};
export const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export function safeFilename(name: string) {
  if (
    !/^[^<>:"/\\|?*]{1,150}$/.test(name) ||
    [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    name.includes('..') ||
    name.trim() !== name
  )
    fail('FILENAME_INVALID', 'Use a simple file name without paths or control characters.');
  return name;
}
function decode(b: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^\uFEFF/, '');
  } catch {
    return fail('ENCODING_UNSUPPORTED', 'Use UTF-8 encoding (with or without BOM).');
  }
}
const cell = (value: unknown, kind: Cell['kind'] = 'text'): Cell => {
  const v = String(value ?? '');
  if (v.length > LIMITS.cellChars) fail('CELL_LIMIT', 'A cell exceeds the 2,000-character limit.');
  return { value: v, kind: v === '' ? 'blank' : kind };
};
function checkSheets(sheets: RawSheet[]) {
  if (new Set(sheets.map((s) => s.name.toLowerCase())).size !== sheets.length)
    fail('SHEET_NAMES', 'Worksheet names must be unique.');
  if (!sheets.length || sheets.length > LIMITS.sheets)
    fail('SHEET_LIMIT', 'A workbook must contain 1–10 sheets.');
  let count = 0;
  for (const s of sheets) {
    if (
      s.name.length > 100 ||
      s.rows.length > LIMITS.rows ||
      s.rows.some((r) => r.length > LIMITS.columns)
    )
      fail('GRID_LIMIT', 'Each sheet supports at most 2,000 rows and 40 columns.');
    count += s.rows.reduce((n, r) => n + r.length, 0);
  }
  if (count > LIMITS.totalCells)
    fail('CELL_COUNT_LIMIT', 'This import exceeds 80,000 cells across sheets.');
}
async function archive(b: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    fromBuffer(
      b,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (err, zip) => {
        if (err || !zip) {
          reject(new ImportFailure('XLSX_INVALID', 'The workbook archive is malformed.'));
          return;
        }
        const files = new Map<string, Buffer>();
        let size = 0,
          count = 0,
          finished = false;
        const stop = (e: unknown) => {
          if (finished) return;
          finished = true;
          zip.close();
          reject(
            e instanceof ImportFailure
              ? e
              : new ImportFailure('XLSX_INVALID', 'The workbook archive is malformed.'),
          );
        };
        zip.on('error', stop);
        zip.on('end', () => {
          if (!finished) {
            finished = true;
            resolve(files);
          }
        });
        zip.on('entry', (e: Entry) => {
          try {
            if (
              ++count > LIMITS.archiveEntries ||
              e.uncompressedSize > LIMITS.partBytes ||
              size + e.uncompressedSize > LIMITS.uncompressedBytes
            )
              fail('ARCHIVE_LIMIT', 'Workbook expansion exceeds the supported archive limits.');
            if (e.generalPurposeBitFlag & 1)
              fail('ENCRYPTED_UNSUPPORTED', 'Encrypted workbooks are not supported.');
            if (
              e.fileName.includes('..') ||
              e.fileName.includes('\\') ||
              e.fileName.startsWith('/') ||
              files.has(e.fileName)
            )
              fail('ARCHIVE_PATH', 'Unsafe or duplicate workbook archive path.');
            if (
              /vba|activex|externalLinks|connections|embeddings|macrosheets|customUI|\.bin$/i.test(
                e.fileName,
              )
            )
              fail(
                'ACTIVE_CONTENT',
                'Macros, external links, connections and embedded active content are not supported.',
              );
            if (e.fileName.endsWith('/')) {
              zip.readEntry();
              return;
            }
            zip.openReadStream(e, (error, stream) => {
              if (error || !stream) {
                stop(error);
                return;
              }
              const chunks: Buffer[] = [];
              let read = 0;
              stream.on('data', (chunk: Buffer) => {
                read += chunk.length;
                if (read > LIMITS.partBytes || size + read > LIMITS.uncompressedBytes) {
                  stream.destroy();
                  stop(
                    new ImportFailure('ARCHIVE_LIMIT', 'Workbook decompression limit exceeded.'),
                  );
                  return;
                }
                chunks.push(chunk);
              });
              stream.on('error', stop);
              stream.on('end', () => {
                if (finished) return;
                size += read;
                files.set(e.fileName, Buffer.concat(chunks));
                zip.readEntry();
              });
            });
          } catch (error) {
            stop(error);
          }
        });
        zip.readEntry();
      },
    );
  });
}
type Xml = Record<string, unknown>;
const object = (v: unknown): Xml =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Xml) : {};
const array = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string =>
  typeof v === 'object' ? String(object(v)['#text'] ?? '') : String(v ?? '');
function xml(b: Buffer): Xml {
  const s = decode(b);
  if (/<!DOCTYPE|<!ENTITY/i.test(s))
    fail('XML_ENTITIES', 'DTD and entity declarations are not permitted.');
  if (XMLValidator.validate(s) !== true) fail('XML_INVALID', 'Malformed workbook XML.');
  let depth = 0;
  for (const m of s.matchAll(/<\/?[^!?][^>]*>/g)) {
    if (m[0].startsWith('</')) depth--;
    else if (!m[0].endsWith('/>')) depth++;
    if (depth > 40) fail('XML_DEPTH', 'Workbook XML exceeds supported nesting.');
  }
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    removeNSPrefix: true,
    processEntities: true,
  }).parse(s) as Xml;
}
const textRun = (v: unknown) => {
  const o = object(v);
  return o.t !== undefined
    ? str(o.t)
    : array(o.r)
        .map((r) => str(object(r).t))
        .join('');
};
function colIndex(s: string) {
  let n = 0;
  for (const c of s) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}
export async function parseFile(name: string, b: Buffer, delimiter = ','): Promise<RawImport> {
  safeFilename(name);
  if (!b.length || b.length > LIMITS.fileBytes)
    fail('FILE_LIMIT', 'Files must contain data and be no larger than 5 MiB.');
  const ext = name.toLowerCase().split('.').at(-1);
  if (ext === 'csv') {
    if (![',', ';', '\t'].includes(delimiter))
      fail('DELIMITER_UNSUPPORTED', 'Choose comma, semicolon or tab.');
    const s = decode(b);
    if (s.includes('\0') || s.startsWith('PK'))
      fail('CSV_INVALID', 'This file is not supported CSV text.');
    let records: string[][];
    try {
      records = parse(s, {
        delimiter,
        bom: true,
        skip_empty_lines: false,
        relax_column_count: true,
        max_record_size: 80000,
        cast: false,
        trim: false,
        to: LIMITS.rows + 1,
      }) as string[][];
    } catch {
      fail(
        'CSV_MALFORMED',
        'Malformed CSV quoting or record structure. Check delimiter and quoted values.',
      );
    }
    const width = records![0]?.length ?? 0;
    const rows = records!.map((r) => {
      if (r.length !== width && r.some((x) => x !== ''))
        fail(
          'CSV_COLUMNS',
          'CSV rows have inconsistent column counts. Check the selected delimiter.',
        );
      return r.map((x) => cell(x));
    });
    const sheets = [{ name: 'CSV', rows }];
    checkSheets(sheets);
    return {
      type: 'csv',
      sheets,
      warnings: ['CSV encoding: UTF-8. Delimiter was explicitly selected.'],
      parserVersion: IMPORT_CONTRACT,
    };
  }
  if (ext !== 'xlsx') fail('FILE_TYPE', 'Only .xlsx and UTF-8 .csv files are supported.');
  if (b[0] !== 0x50 || b[1] !== 0x4b) fail('XLSX_INVALID', 'The file is not an XLSX archive.');
  const files = await archive(b);
  const parsed = new Map<string, Xml>();
  for (const [path, data] of files) {
    if (path.endsWith('.xml') || path.endsWith('.rels')) {
      const s = decode(data);
      if (
        /<(?:\w+:)?f(?:\s|>|\/)|TargetMode\s*=\s*["']External|macroEnabled|oleObject|ddeLink/i.test(
          s,
        )
      )
        fail(
          'ACTIVE_CONTENT',
          'Formula cells and external/active workbook content are unsupported. Export values only.',
        );
      const decoded = xml(data);
      if (
        path.endsWith('.rels') &&
        array(object(decoded.Relationships).Relationship).some((r) => {
          const mode = str(object(r)['@TargetMode']);
          return mode !== '' && mode.toLowerCase() !== 'internal';
        })
      )
        fail(
          'ACTIVE_CONTENT',
          'External workbook relationships are unsupported, including encoded attributes.',
        );
      parsed.set(path, decoded);
    }
  }
  const workbook = object(parsed.get('xl/workbook.xml')?.workbook);
  if (!Object.keys(workbook).length || !files.has('[Content_Types].xml'))
    fail('XLSX_INVALID', 'Required XLSX workbook parts are missing.');
  const relationships = array(
    object(parsed.get('xl/_rels/workbook.xml.rels')?.Relationships).Relationship,
  ).map(object);
  const shared = array(object(parsed.get('xl/sharedStrings.xml')?.sst).si).map(textRun);
  if (shared.length > LIMITS.totalCells) fail('CELL_COUNT_LIMIT', 'Too many shared strings.');
  for (const v of shared) cell(v);
  const sheets: RawSheet[] = [];
  const warnings: string[] = [];
  const sheetDefs = array(object(workbook.sheets).sheet);
  if (sheetDefs.length > LIMITS.sheets) fail('SHEET_LIMIT', 'At most 10 sheets are supported.');
  if (
    str(object(workbook.workbookPr)['@date1904']) === '1' ||
    str(object(workbook.workbookPr)['@date1904']) === 'true'
  )
    warnings.push(
      'Workbook uses the Excel 1904 date system; select it explicitly when mapping numeric dates.',
    );
  for (const value of sheetDefs) {
    const def = object(value);
    const rel = relationships.find((r) => str(r['@Id']) === str(def['@id']));
    if (!rel || !str(rel['@Type']).endsWith('/worksheet'))
      fail('SHEET_UNSUPPORTED', 'Only ordinary worksheet sheets are supported.');
    const target = str(rel!['@Target']);
    const path = target.startsWith('/') ? target.slice(1) : posix.normalize('xl/' + target);
    if (!path.startsWith('xl/worksheets/'))
      fail('ARCHIVE_PATH', 'Worksheet relationship points outside supported workbook parts.');
    const sheet = object(parsed.get(path)?.worksheet);
    if (!Object.keys(sheet).length) fail('XLSX_INVALID', 'A worksheet part is missing.');
    if (sheet.mergeCells)
      warnings.push(
        `${str(def['@name'])}: merged cells are present. Select a simple table header and review every column.`,
      );
    if (str(def['@state']) && str(def['@state']) !== 'visible')
      warnings.push(`${str(def['@name'])}: hidden sheet is listed for explicit review.`);
    const rows: Cell[][] = [];
    const seen = new Set<string>();
    for (const row of array(object(sheet.sheetData).row)) {
      const r = object(row);
      const index = Number(r['@r']);
      if (!Number.isInteger(index) || index < 1 || index > LIMITS.rows)
        fail('GRID_LIMIT', 'Worksheet row is outside the 2,000-row limit.');
      while (rows.length < index) rows.push([]);
      for (const cv of array(r.c)) {
        const c = object(cv),
          ref = str(c['@r']),
          m = /^([A-Z]+)([1-9]\d*)$/.exec(ref);
        if (!m || Number(m[2]) !== index || colIndex(m[1]) >= LIMITS.columns || seen.has(ref))
          fail('CELL_REFERENCE', 'Invalid, duplicated or out-of-range cell reference.');
        seen.add(ref);
        const ci = colIndex(m![1]);
        while (rows[index - 1].length <= ci) rows[index - 1].push(cell(''));
        const type = str(c['@t']);
        let out: Cell = cell('');
        if (type === 's') {
          const n = Number(str(c.v));
          if (!Number.isInteger(n) || n < 0 || n >= shared.length)
            fail('XLSX_INVALID', 'Invalid shared-string reference.');
          out = cell(shared[n]);
        } else if (type === 'inlineStr') out = cell(textRun(c.is));
        else if (type === 'e')
          fail(
            'CELL_ERROR',
            'Workbook contains spreadsheet error cells. Resolve them before importing.',
          );
        else
          out = cell(
            str(c.v),
            type === 'b' ? 'boolean' : type === 'd' ? 'date' : type === 'str' ? 'text' : 'number',
          );
        rows[index - 1][ci] = out;
      }
    }
    sheets.push({ name: str(def['@name']), rows });
  }
  checkSheets(sheets);
  return { type: 'xlsx', sheets, warnings, parserVersion: IMPORT_CONTRACT };
}
export const normalizeHeader = (s: string) =>
  s.normalize('NFKC').toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
export function inspect(raw: RawImport, sheetName: string, headerRow = 1): Inspection {
  const sheet = raw.sheets.find((s) => s.name === sheetName);
  if (!sheet || headerRow < 1 || headerRow > 20 || headerRow > sheet.rows.length)
    fail('SHEET_SELECTION', 'Select an existing sheet and header row (1–20).');
  const columns = Math.max(0, ...sheet!.rows.map((r) => r.length));
  const headers = Array.from(
    { length: columns },
    (_, i) => sheet!.rows[headerRow - 1][i]?.value ?? '',
  );
  const body = sheet!.rows.slice(headerRow);
  const warnings = [...raw.warnings];
  const keys = headers.map(normalizeHeader);
  if (new Set(keys).size !== keys.length)
    warnings.push(
      'Duplicate headers: column position must be reviewed; names alone are not unique.',
    );
  if (headers.some((h) => !h.trim()))
    warnings.push('Blank header: explicitly map or exclude this column.');
  const flaggedRows: Inspection['flaggedRows'] = [];
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const values = r.map((c) => c.value);
    const key = JSON.stringify(values);
    if (!values.some((v) => v.trim()))
      flaggedRows.push({ row: headerRow + i + 1, reason: 'Blank row' });
    else {
      if (
        values.some((v) =>
          /^(grand\s+total|sub[ -]?total|total|الإجمالي|المجموع)(\b|\s|$)/i.test(v.trim()),
        )
      )
        flaggedRows.push({
          row: headerRow + i + 1,
          reason:
            'Possible total/subtotal: exclude it or explicitly explain why it is not duplicate detail.',
        });
      if (JSON.stringify(values.map(normalizeHeader)) === JSON.stringify(keys))
        flaggedRows.push({ row: headerRow + i + 1, reason: 'Repeated header' });
      if (seen.has(key))
        flaggedRows.push({
          row: headerRow + i + 1,
          reason: 'Duplicate row: exclude or explain distinct underlying records.',
        });
      seen.add(key);
    }
  });
  const types = headers.map((_, i) => {
    const v = body.map((r) => r[i]?.value ?? '').filter((v) => v.trim());
    if (!v.length) return 'empty';
    if (v.every((x) => /^\d{4}-\d{2}(?:-\d{2})?$|^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(x)))
      return 'period/date-like';
    if (v.every((x) => /^[()\-+\d.,\s]+$/.test(x))) return 'numeric-like';
    return 'text/mixed';
  });
  return {
    sheet: sheetName,
    fingerprint: hash(JSON.stringify([headers, types])),
    headers,
    rows: sheet!.rows.length,
    columns,
    sample: body.slice(0, 8).map((r, i) => ({
      row: headerRow + i + 1,
      values: Array.from({ length: columns }, (_, j) => r[j]?.value ?? ''),
    })),
    types,
    warnings,
    flaggedRows,
    emptyColumns: types.flatMap((t, i) => (t === 'empty' ? [i] : [])),
  };
}
export function suggest(i: Inspection): Suggestion[] {
  return i.headers.map((header, column) => {
    const h = normalizeHeader(header);
    const roles: Record<string, string> = {
      month: 'period',
      period: 'period',
      date: 'period',
      currency: 'currency',
      basis: 'basis',
      type: 'basis',
      scope: 'scope',
      branch: 'scope',
      department: 'scope',
      category: 'label',
      description: 'label',
      'end month': 'end_period',
      'opening cash': 'opening_available',
      'restricted cash': 'opening_restricted',
    };
    const meanings: Record<string, string> = {
      revenue: 'revenue',
      'recognized revenue': 'revenue',
      sales: 'revenue',
      'cash received': 'known_receipt',
      collections: 'known_receipt',
      payroll: 'payroll',
      'staff cost': 'payroll',
      rent: 'rent',
      'office rent': 'rent',
      ads: 'marketing',
      marketing: 'marketing',
      'cash paid': 'known_payment',
      investment: 'capex',
      amount: 'amount',
    };
    const base = h
      .replace(/\b(actual|budget|forecast|egp|usd|sar|aed)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const meaning = meanings[base] ?? null;
    return {
      column,
      header,
      role:
        roles[h] ??
        (meaning ? 'amount' : i.types[column] === 'period/date-like' ? 'period' : 'unreviewed'),
      meaning,
      confidence: roles[h] ? 'high' : meaning ? 'medium' : 'low',
      reason: roles[h]
        ? 'Header alias matches a structural role; review is still required.'
        : meaning
          ? `${base === 'sales' ? 'Sales could mean orders, recognized revenue or collected cash.' : 'Header alias suggests a possible category.'} Select financial meaning, evidence basis and timing explicitly.`
          : 'No reliable alias. Review the examples and choose the meaning yourself.',
    };
  });
}
