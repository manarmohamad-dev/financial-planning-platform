# M4 synthetic acceptance files

All values are artificial. There are **28 input files**: 24 CSV files and 4 XLSX files (three ordinary workbooks and one intentionally suspicious archive). `.inspect.ndjson` files are authoring inspection metadata, not inputs. Do not use these as company financial data.

| File prefix | Case / required outcome |
| --- | --- |
| 01 | Clean service XLSX; reviewed revenue/payroll/rent and opening cash normalize successfully |
| 02 | Retail CSV; COGS needs explicit non-cash treatment and separate purchasing cash if cash analysis is requested |
| 03 | Unfamiliar terminology; low-confidence suggestions require manual meaning |
| 04 | Multiple sheets; select Service, do not combine Instructions |
| 05 | Total row; block until explicitly excluded |
| 06 | Duplicate monthly row; block double counting |
| 07 | Missing month; block, never infer zero |
| 08 | Partial boundary month; declare coverage and acknowledge warning; no extrapolation |
| 09 | Blank versus zero; zero retained, blank blocks |
| 10 | Negative outflows; require explicit sign convention |
| 11 | Mixed date conventions; block invalid dates under selected convention |
| 12 | Semicolon CSV / decimal comma; explicit locale preserves cents |
| 13 | Mixed currencies; block, no FX |
| 14 | Actual plus Budget; no overlapping authoritative revenue series |
| 15 | Ambiguous Sales; explicit recognized-revenue or cash meaning required |
| 16 | Opening cash present; point-in-time balance only |
| 17 | No opening cash; supply reviewed opening or use operating-only analysis |
| 18 | Daily details plus monthly aggregate; block mixed aggregation |
| 19 | Compatible later workbook; template proposals still require fresh review |
| 20 | Changed column structure; old template cannot be applied |
| 21 | Malformed CSV quoting; reject parsing |
| 22 | 2,001 rows including header; reject size limit |
| 23 | Suspicious XLSX with vbaProject member; reject active content (contains inert test text) |
| 24 | Recurring rent schedule; explicit end month and commitment |
| 25 | Dated detail; exact monthly aggregation and original row lineage |
| 26 | Supplied Forecast; cannot become Actual or platform forecast |
| 27 | Branch data; reject unsupported scope |
| 28 | UTF-8 BOM and quoted grouped decimals; parse without loss |

Executable cases are in `tests/import-engine.test.ts`, `tests/import-security.test.ts` and the M4 section of `tests/api.test.ts`. Additional hostile archives are generated in memory with `tests/zip-fixtures.ts`; they exercise encryption, formula cells, external relationships, entity declarations, XML depth, malformed XML, traversal, duplicate members and decompression/member limits. The low-level ZIP writer is test-only and is never used by the application.

The three ordinary workbooks were authored with the bundled spreadsheet artifact tool; every sheet was rendered and inspected. Their reusable authoring script and render previews are in the conversation workspace at `work/m4-artifacts/`. CSV fixtures deliberately preserve anomalies and raw formats needed by the acceptance cases.
