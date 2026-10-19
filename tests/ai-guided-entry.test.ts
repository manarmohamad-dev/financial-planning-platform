import { describe, expect, it } from 'vitest';
import { canStartGuidedEntry, guidedDecisionTypes } from '../apps/web/src/guided-entry.js';
import type { ScenarioDocument } from '../packages/scenarios/src/model.js';
const empty = (): ScenarioDocument => ({contractVersion:'scenario-1.0.0',title:'',baselineVersionId:'baseline',currency:'EGP',type:'sales',changes:[],expansion:null,paybackRequested:false});
describe('guided entry preserves reviewed and unfinished work',()=>{
  it('offers all four families and compound decisions',()=>expect(guidedDecisionTypes).toEqual(['sales','hiring','spending','expansion','combined']));
  it('allows type choice on untouched draft without mutating input',()=>{const d=empty();const before=structuredClone(d);expect(canStartGuidedEntry(d,'',['',''])).toBe(true);expect(d).toEqual(before);});
  it('preserves a saved empty draft',()=>expect(canStartGuidedEntry(empty(),'saved',[''])).toBe(false));
  it('preserves an unsaved title',()=>expect(canStartGuidedEntry({...empty(),title:'My draft'},'',[''])).toBe(false));
  it('preserves explicit payback selection',()=>expect(canStartGuidedEntry({...empty(),paybackRequested:true},'',[''])).toBe(false));
  it('preserves expansion review state',()=>expect(canStartGuidedEntry({...empty(),expansion:{revenueMode:null,costsReviewed:false,note:''}},'',[''])).toBe(false));
  for(const value of ['0','0.15','2026-02','edited','rent']) it(`preserves pending input ${value}`,()=>expect(canStartGuidedEntry(empty(),'',['',value])).toBe(false));
});
