import { randomUUID } from 'node:crypto';
import { fixtureDocument, fixtureEntry } from '../packages/planning/src/fixtures.js';
import { calculateBaseline } from '../packages/planning/src/engine.js';
import {
  ENGINE_VERSION,
  PLANNING_CONTRACT,
  type BaselineSnapshot,
} from '../packages/planning/src/model.js';
import { ROUNDING_POLICY } from '../packages/contracts/src/index.js';
import { rules } from '../packages/stress/src/engine.js';
import {
  STRESS_VERSION,
  type Source,
  type Definition,
  type Policy,
} from '../packages/stress/src/model.js';
export function stressSource(): Source {
  const document = fixtureDocument([
    fixtureEntry(1, { driver: { kind: 'fixed', amount: '100' } }),
    fixtureEntry(2, {
      category: 'rent',
      effect: 'operating_expense',
      driver: { kind: 'fixed', amount: '80' },
    }),
  ]);
  document.openingCash!.available = '100';
  const snapshot: BaselineSnapshot = {
    contractVersion: PLANNING_CONTRACT,
    workspaceId: randomUUID(),
    planningVersionId: randomUUID(),
    baselineVersionId: randomUUID(),
    actorId: randomUUID(),
    confirmedBy: randomUUID(),
    suppliedBy: {},
    confirmedAt: '2026-01-01T00:00:00.000Z',
    document,
    reservePolicy: null,
    engineVersion: ENGINE_VERSION,
    roundingPolicyVersion: ROUNDING_POLICY,
  };
  const financial = calculateBaseline(snapshot);
  return {
    ref: { kind: 'baseline', runId: randomUUID() },
    title: 'Synthetic stress source',
    baselineVersionId: snapshot.baselineVersionId,
    snapshot,
    financial,
    baseFinancial: financial,
    context: {},
    payback: null,
  };
}
export function stressDefinition(
  source: Source,
  kind: Definition['modifications'][number]['kind'] = 'revenue_decrease',
  rate = '0.20',
): Definition {
  return {
    version: STRESS_VERSION,
    title: 'Synthetic adverse case',
    source: source.ref,
    template: 'custom',
    reviewed: true,
    modifications: [
      {
        id: randomUUID(),
        kind,
        targetEntryId: source.snapshot.document.entries.find(
          (e) => e.effect === (kind === 'expense_increase' ? 'operating_expense' : 'revenue'),
        )!.id,
        start: '2026-01',
        end: '2026-03',
        rate: kind === 'collection_delay' ? null : rate,
        delayMonths: kind === 'collection_delay' ? 1 : null,
        reference: 'pinned_source',
        dependencies: [],
        note: 'Explicit synthetic stress assumption',
      },
    ],
  };
}
export function stressPolicy(threshold = '100'): Policy {
  return {
    id: randomUUID(),
    revision: 1,
    title: 'Declared constraint',
    currency: 'EGP',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: randomUUID(),
    rules: rules({
      title: 'Declared constraint',
      currency: 'EGP',
      minimumCash: threshold,
      minimumOperatingResult: '0',
      negativeCash: true,
      source: 'Explicit manager constraint, confirmed by Owner',
      expectedRevision: 0,
      reviewed: true,
    }),
  };
}
