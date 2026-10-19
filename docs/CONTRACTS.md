# Shared contract guide

Executable schemas are in `packages/contracts/src/index.ts`. Contract version is 1.0.0. Breaking changes require a new version; old stored snapshots must remain readable and may never be silently reinterpreted.

## Implemented primitives

- Money and Rate: strict decimal input, finite forecast conversion, exact addition, precision-preserving multiplication, explicit movement quantization, deterministic timing allocation.
- Period and currency: YYYY-MM and supported currency enum; dated events use ISO calendar dates.
- Scope: company or one flat branch/department identifier. A scope ID is a reference, not proof of tenant ownership; future snapshot assembly must resolve it in the active workspace.
- Draft revisions and confirmed-version references.
- Source assignments: uniqueness by component, period, scope and basis/effect. No automatic precedence.
- Requirement/capability: necessity independent of permitted evidence; readiness independent of evidence labels.
- Scenario: baseline reference, typed changes, units, references, explicit dependency ordering. Full overlap/conflict execution belongs to M3.
- Engine input/output: planning components, resolved paths, opening cash, schedules/timing, assumptions, changes, result series/findings. Schema validation alone is not financial completeness; M2 must implement that validation before executing.
- Forecast request/response: finite numeric series, candidate and fold specifications, response evidence and warnings. Statistical eligibility/fitting is deferred.
- Job/attempt/run contracts: distinct identities, immutable references, status and safe failures. No jobs execute in M1.

## Financial source boundary

Revenue never implies cash collection. Expense never implies payment. Explicit schedules can represent opening obligations, purchases, investment, debt principal/interest, owner movements, taxes, refunds and fees. The future compiler must identify their financial categories and prevent overlap between provided cash schedules and generated timing movements.

Inventory timing applies to purchasing/payment plans, not automatically to cost of goods sold. An unresolved collection portion or out-of-horizon movement is not zero and must remain traceable. M1 models the references and proportions; M2 implements reconciliation.

Source-to-result financial lineage is part of the output contract. M1 provenance is verified for workspace/assumption changes and confirmed versions; there are no spreadsheet cells or financial results yet.

## Reproducibility

Financial replay uses the same stored inputs, engine, contract and policy versions. Forecast reproduction pins training data/folds/runtime/configuration/seeds and uses stated numerical tolerance. AI historical text is saved rather than claimed regenerable byte-for-byte. Runtime artifacts and replay support are future operational work.

## Before M2

Implement snapshot completeness, schedule classification and monthly normalization, formula dependency resolution, effect overlap checks, scope ownership/aggregation, horizon tails, precise indicator definitions and golden financial cases. These are planned M2 behaviors, not missing M1 authentication/tenant foundations.
