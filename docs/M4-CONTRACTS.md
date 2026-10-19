# M4 — Financial import and reviewed mapping

M4 extends the existing Angular / Express / PostgreSQL application. It does not introduce another financial engine. Contract identifier: `import-1.0.0`.

## Data flow

1. An Owner or Analyst uploads raw bytes with a simple filename and an explicit CSV delimiter. The server authorizes the workspace before reading the upload body.
2. A bounded structural parser reads values, sheet names and cell coordinates. It does not evaluate formulas or fetch workbook relationships.
3. The reviewer selects one sheet and a header row. Deterministic header aliases and structural types produce suggestions with reasons. Every column starts unreviewed.
4. The reviewer chooses financial meaning, basis, behavior, signs, currency, dates, coverage, timing, exclusions and source selection. Draft edits use revision checks.
5. A confirmed mapping version freezes the reviewed selection. Validation distinguishes blockers, warnings and information, and delegates financial readiness to M2.
6. Confirmation revalidates against current workspace sources and requires acceptance of every current warning code. In one transaction it creates an ordinary confirmed M2 planning version and an immutable import dataset with lineage.
7. The existing M2 workflow prepares/publishes/calculates a baseline. Existing M3 scenarios reference that baseline. No import replaces an earlier baseline, scenario or dataset.

## Supported financial interpretation

- Wide value tables with a period/date column and separate amount columns; long tables using explicit exact-label row filters.
- One amount per component/month, dated details summed by month, or an explicit recurring start/end schedule.
- Recognized revenue/costs and direct cash schedules remain distinct. Recognition needs an explicit same-month or whole-month delay profile for cash output. Unknown timing blocks cash readiness.
- Categories do not imply behavior. Cost of sales is not automatically a purchase payment. Model it with non-cash treatment and supply purchasing payments separately, or request operating-only analysis.
- Positive magnitudes use the selected financial effect for direction. Negative accounting outflows require an explicit supported sign convention.
- Blank is not zero. Missing recognized-activity months require explicit values, including explicit zeros. Dated details and recurring schedules also cannot silently imply a missing month is zero.
- Opening cash is a single balance immediately before the first month. It is not summed across periods or imported as revenue. An imported Basis column must identify it as Actual; a budget opening must instead be a reviewed manual assumption. Available and restricted balances remain separate.
- Actual, Schedule and Assumption map to existing M2 evidence. Budget needs explicit approval as an assumption and retains its original Budget lineage. Supplied Forecast is blocked, not relabeled Actual or presented as a platform forecast.
- One workspace currency and company-wide scope. Mismatching currency labels/values and branch rows are blocked. No conversion or consolidation occurs.
- Partial boundary months carry a required warning; supplied amounts are not extrapolated. Monthly results cannot establish daily liquidity.

## Source authority and lineage

Source selection is always an explicit **new standalone dataset**, with a recorded explanation. There is no automatic merge, replacement or carry-forward of missing manual values. Existing overlapping components generate an acknowledgement warning; the overlap comparison considers the latest 50 confirmed planning versions. Even outside that comparison window, all previous versions remain immutable and unmerged.

The parser flags likely totals, repeated headers and exact duplicate rows. Totals/repeated headers require exclusion with reasons. A duplicate-looking detail may be retained only with a recorded distinct-record explanation through the mapping API; the UI supports explicit exclusion. Multiple rules claiming one cell or multiple authoritative monthly values are blocked. Semantic duplicates with unrelated labels cannot be identified reliably: stable component keys and human review remain necessary.

Trace path: baseline/scenario movement → M2 entry and planning version → import dataset → immutable mapping version → original file hash/uploader/time → selected sheet and original row/column/raw value. Amount, period and mapped currency/basis/scope/label/end-period coordinates are retained. Manual opening values and review assumptions live in the immutable mapping with the confirmer identity. CSV row numbers identify parsed records; a quoted multiline record may span more than one physical text line.

## Templates

Templates are workspace-private immutable versions, created only from confirmed datasets. Compatibility requires exact header names/order and detected column types. A compatible template proposes rules but resets semantic confirmations, coverage dates/review, currency/basis/scope confirmations, manual opening, row exclusions/reviews and source selection. It never confirms a new file automatically. A changed fingerprint is rejected and requires a fresh mapping.

## Persistence and authorization

Migration `006_imports.sql` adds:

| Table | Purpose |
| --- | --- |
| `import_files` | Original bytes, parsed values, filename/hash, uploader/time, parsing outcome |
| `import_mapping_drafts` | Editable, revision-checked review |
| `import_mapping_versions` | Immutable confirmed mapping |
| `import_datasets` | Immutable normalized document, lineage, validation, accepted warnings, M2 version |
| `import_mapping_templates` | Workspace template versions |
| `import_cancellations` | Immutable cancellation tombstones |

All six tables use tenant row-level security and composite workspace foreign keys. Runtime updates are granted only for mapping drafts. Immutable triggers protect originals, mapping versions, datasets, templates and cancellations, including from accidental application updates. Original downloads are authenticated, authorized and sent as octet-stream attachments with nosniff headers.

Owner/Analyst: upload, select, map, validate, confirm and template operations. Manager: view/replay/use confirmed data through existing baseline/scenario permissions; cannot upload or confirm mappings. Anonymous and foreign-workspace requests fail. Personal Demo shows a labeled synthetic preview and rejects real uploads. Successful actions, parsing failures, cancellation and denied mutations are audited without financial payloads.

## API surface

All paths below are relative to `/api/v1/workspaces/:workspaceId/imports`. Mutations require the existing authenticated session, origin and CSRF checks.

| Method / route | Function |
| --- | --- |
| `POST /` | Octet-stream upload; `X-File-Name` URI encoded, `X-CSV-Delimiter` comma/semicolon/`tab` |
| `GET /`, `GET /:id` | Import history and file/sheet metadata |
| `GET /:id/preview?sheet=...&headerRow=...` | Structural preview and suggestions |
| `GET /:id/original` | Tenant-private source download |
| `POST /:id/select-sheet` | Create a mapping draft |
| `POST /:id/cancel` | Prevent subsequent mapping/confirmation without deleting history |
| `GET /mappings/:id`, `PATCH /mappings/:id` | Read/edit with expected revision |
| `POST /mappings/:id/validate` | Validate the saved draft |
| `POST /mappings/:id/confirm` | Immutable mapping, explicit `reviewed: true` |
| `GET /mapping-versions/:id` | Read confirmed mapping |
| `POST /mapping-versions/:id/validate` | Validate immutable selection |
| `POST /mapping-versions/:id/dataset` | Confirm with explicit warning codes; idempotent per mapping version |
| `GET /datasets`, `GET /datasets/:id` | Dataset history, normalized input and lineage |
| `POST /datasets/:id/replay` | Compare regenerated normalization and lineage with saved values |
| `GET /templates`, `POST /templates` | List/create template versions |
| `POST /mappings/:id/template` | Propose compatible template; revision and re-review acknowledgement required |

## Explicit limits and exclusions

| Limit | Value |
| --- | --- |
| Upload | 5 MiB |
| ZIP decompressed total / individual part | 32 MiB / 8 MiB |
| ZIP members | 250 |
| Sheets | 10 |
| Rows / columns per sheet | 2,000 / 40, including headers |
| Cells across workbook | 80,000 |
| Cell text | 2,000 characters |
| XML nesting | 40 |
| Selectable header row | 1–20 |
| Rules / normalized M2 entries | 40 / 150 |
| Mapping JSON request | Existing 64 KiB API limit |
| Horizon | 3, 6 or 12 months |
| Timing delay | Whole months, up to 120 |
| History lists | Latest 100 imports/datasets; older IDs remain directly readable |

Only values-only XLSX and UTF-8 CSV with comma, semicolon or tab delimiters. Unsupported: XLS/XLSM, encrypted workbooks, formulas (even cached values), macros, external relationships/connections, embedded active content, DTD/entities, unsafe archive paths and excessive expansion. Numeric date serials require explicit Excel 1900/1904 selection; no locale guessing. Spreadsheet numbers arrive as the values stored by Excel; precision already lost by the source spreadsheet cannot be recovered.

One selected sheet/table per dataset. No horizontal month-column unpivoting, arbitrary report extraction, workbook joins, split timing profiles, import-derived headcount/margin drivers, inventory valuation, financial-statement reconstruction, multi-entity/branch consolidation or multi-currency planning. More complex supported M2 inputs remain available through the manual workflow. Original files are bounded private database blobs; retention/deletion, malware scanning and background processing are not production features in this MVP.

No statistical forecasting, AI mapping/explanations, stress testing, OCR/PDF, external integrations or deployment. **M5 has not been started.**

Parser libraries: [yauzl](https://github.com/thejoshwolfe/yauzl), [csv-parse](https://csv.js.org/parse/options/), [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser). Application-level restrictions are stricter than the formats supported by these libraries.
