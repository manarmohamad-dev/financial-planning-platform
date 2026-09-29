import '@angular/compiler';
import { createEnvironmentInjector, runInInjectionContext, signal, type EnvironmentInjector } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { NavigationState } from '../apps/web/src/navigation.js';
import { StressWorkbench } from '../apps/web/src/stress.js';

describe('Risk and brief record handoffs',()=>{
 for(const records of [{source:'scenario',run:'saved-run'},{comparison:'saved-comparison'},{brief:'saved-brief'}]){
  it('restores '+JSON.stringify(records)+' after loading workspace lists',async()=>{
   const navigation={dirty:signal(false),begin:vi.fn(),end:vi.fn()};
   const injector=createEnvironmentInjector([{provide:NavigationState,useValue:navigation}],null as unknown as EnvironmentInjector);
   const workbench=runInInjectionContext(injector,()=>new StressWorkbench());
   workbench.workspace={id:'company-a',kind:'company',currency:'EGP'};workbench.records=records;
   const api=vi.spyOn(workbench,'api').mockImplementation(async (path)=>({
    '/planning/runs':{runs:[]},'/scenarios/runs':{runs:[]},'/stress/policies':{policies:[]},
    '/stress/definitions':{definitions:[]},'/stress/batches':{batches:[]},'/stress/briefs':{briefs:[]},'/stress/comparisons':{comparisons:[]},
    '/stress/source':{ref:{kind:'scenario',runId:'saved-run'}},'/stress/comparisons/saved-comparison':{id:'saved-comparison'},'/stress/briefs/saved-brief':{id:'saved-brief'}
   }[path] as never));
   await workbench.ngOnChanges();
   if(records.run){expect(api).toHaveBeenCalledWith('/stress/source','POST',{kind:'scenario',runId:'saved-run'});expect(workbench.sourceKey).toBe('scenario:saved-run');}
   if(records.comparison)expect(workbench.comparison()?.id).toBe('saved-comparison');
   if(records.brief)expect(workbench.brief()?.id).toBe('saved-brief');
   expect(navigation.dirty()).toBe(false);injector.destroy();
  });
 }
});
