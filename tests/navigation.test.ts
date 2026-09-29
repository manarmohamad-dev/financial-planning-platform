import '@angular/compiler';
import { createEnvironmentInjector, runInInjectionContext, type EnvironmentInjector } from '@angular/core';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationState } from '../apps/web/src/navigation.js';

describe('Workspace navigation and unsaved work',()=>{
 let injector:EnvironmentInjector,state:NavigationState;
 const navigate=vi.fn().mockResolvedValue(true);
 let beforeUnload:(event:{preventDefault:()=>void;returnValue:string})=>void;
 beforeEach(()=>{
  vi.useFakeTimers();navigate.mockClear();
  vi.stubGlobal('window',{addEventListener:(_name:string,fn:typeof beforeUnload)=>beforeUnload=fn});
  vi.stubGlobal('document',{activeElement:{focus:vi.fn()},querySelector:()=>null});
  injector=createEnvironmentInjector([{provide:Router,useValue:{navigate}}],null as unknown as EnvironmentInjector);
  state=runInInjectionContext(injector,()=>new NavigationState());
 });
 afterEach(()=>{injector.destroy();vi.useRealTimers();vi.unstubAllGlobals();});
 it('allows clean navigation without confirmation',()=>expect(state.allowLeave()).toBe(true));
 it('keeps unsaved edits after cancelling navigation',async()=>{state.dirty.set(true);const decision=state.allowLeave();expect(state.prompt()).toBe(true);state.decide(false);expect(await decision).toBe(false);expect(state.dirty()).toBe(true);});
 it('discards only after explicit confirmation',async()=>{state.dirty.set(true);const decision=state.allowLeave();state.decide(true);expect(await decision).toBe(true);expect(state.dirty()).toBe(false);});
 it('blocks departure until all nested operations settle',()=>{state.begin();state.begin();state.end();expect(state.allowLeave()).toBe(false);state.end();expect(state.allowLeave()).toBe(true);});
 it('preserves exact workspace and record IDs in navigation',async()=>{await state.go('company-a','planning',{version:'version-a'});expect(navigate).toHaveBeenCalledWith(['/workspaces','company-a','planning'],{queryParams:{version:'version-a'}});await state.go('company-b','overview');expect(navigate).toHaveBeenLastCalledWith(['/workspaces','company-b','overview'],{queryParams:{}});});
 it('protects reload only for unsaved or pending work',()=>{const event={preventDefault:vi.fn(),returnValue:'unchanged'};beforeUnload(event);expect(event.preventDefault).not.toHaveBeenCalled();state.dirty.set(true);beforeUnload(event);expect(event.preventDefault).toHaveBeenCalledOnce();expect(event.returnValue).toBe('');});
});
