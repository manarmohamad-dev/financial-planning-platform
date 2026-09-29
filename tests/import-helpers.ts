import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {parseFile} from '../packages/imports/src/parser.js';
import {initialMapping} from '../packages/imports/src/normalize.js';
import type {RawImport,Mapping,MappingRule} from '../packages/imports/src/model.js';
export const fixtureBytes=(name:string)=>readFile(new URL('./fixtures/imports/'+name,import.meta.url));
export const fixtureRaw=async(name:string)=>parseFile(name,await fixtureBytes(name),name.includes('locale')?';':',');
export function rule(column:number,overrides:Partial<MappingRule>={}):MappingRule{return {id:randomUUID(),column,filter:null,component:'revenue',category:'revenue',effect:'revenue',basis:'actual',approveBudgetAsAssumption:false,semanticConfirmed:true,behavior:'monthly',sign:'nonnegative',timing:'same_month',offset:0,committed:false,openingObligation:false,note:'Synthetic reviewer confirms recognized activity and same-month settlement.',...overrides};}
export function reviewed(raw:RawImport):Mapping{
 const m=initialMapping(raw,raw.sheets.at(-1)!.name);Object.assign(m,{title:'M4 synthetic reviewed data',projectionStart:'2026-01',numberLocale:'decimal_dot',dateFormat:'iso',currencyConfirmed:true,basisConfirmed:true,scopeConfirmed:true,coverageFrom:'2026-01-01',coverageTo:'2026-03-31',coverageReviewed:true,sourceResolution:{mode:'new_dataset',note:'Use only this explicitly reviewed standalone source.'},coverage:{revenueComplete:true,expensesComplete:true,cashComplete:true,depreciation:'excluded',revenueConvention:'gross_with_refunds',settlementConvention:'gross'},opening:{available:'1000',restricted:null,source:'observed',note:'Synthetic known opening balance'}});
 const headers=raw.sheets.at(-1)!.rows[0].map(c=>c.value);
 m.columns=headers.map((h,column)=>({column,role:column===0?'period':h==='Currency'?'currency':h==='Basis'?'basis':h==='Branch'?'scope':h==='End month'?'end_period':h==='Opening Cash'?'opening_available':'amount',reason:''}));
 m.rules=m.columns.filter(c=>c.role==='amount').map(c=>{const h=headers[c.column].toLowerCase();return rule(c.column,/payroll|rent|cost|marketing/.test(h)?{component:h.includes('payroll')?'payroll':h.includes('rent')?'rent':h.includes('marketing')?'marketing':'cost_of_sales',category:h.includes('payroll')?'payroll':h.includes('rent')?'rent':h.includes('marketing')?'marketing':'cost_of_sales',effect:'operating_expense'}:{});});
 if(headers.includes('Opening Cash'))m.opening=null;
 return m;
}

