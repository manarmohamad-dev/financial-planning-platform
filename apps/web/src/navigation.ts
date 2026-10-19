import { Component, Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';

export const pages = [
  'overview',
  'planning',
  'imports',
  'forecasts',
  'decisions',
  'stress',
  'briefs',
  'members',
  'settings',
  'account',
  'setup',
] as const;
export type Page = (typeof pages)[number];
export type RecordContext = Partial<
  Record<
    | 'draft'
    | 'version'
    | 'baseline'
    | 'run'
    | 'comparison'
    | 'brief'
    | 'dataset'
    | 'file'
    | 'job'
    | 'source',
    string
  >
>;
export type Journey = { page: Page; records?: RecordContext };
@Injectable({ providedIn: 'root' })
export class NavigationState {
  readonly dirty = signal(false);
  readonly pending = signal(false);
  private operations = 0;
  begin() {
    this.operations++;
    this.pending.set(true);
  }
  end() {
    this.operations = Math.max(0, this.operations - 1);
    this.pending.set(this.operations > 0);
  }
  readonly prompt = signal(false);
  private resolveLeave: ((allow: boolean) => void) | null = null;
  private previousFocus: HTMLElement | null = null;
  private router = inject(Router);
  allowLeave() {
    if (this.pending()) return false;
    if (!this.dirty()) return true;
    if (this.resolveLeave) return false;
    this.previousFocus = document.activeElement as HTMLElement;
    this.prompt.set(true);
    setTimeout(() => document.querySelector<HTMLButtonElement>('[data-keep-editing]')?.focus(), 0);
    return new Promise<boolean>((resolve) => (this.resolveLeave = resolve));
  }
  decide(allow: boolean) {
    const resolve = this.resolveLeave;
    this.resolveLeave = null;
    this.prompt.set(false);
    if (allow) this.dirty.set(false);
    else this.previousFocus?.focus();
    resolve?.(allow);
  }
  promptKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.decide(false);
    }
    if (event.key === 'Tab') {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-leave-dialog] button'),
      );
      const next = event.shiftKey ? buttons.at(-1) : buttons[0];
      if (
        (!event.shiftKey && document.activeElement === buttons.at(-1)) ||
        (event.shiftKey && document.activeElement === buttons[0])
      ) {
        event.preventDefault();
        next?.focus();
      }
    }
  }
  constructor() {
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty() || this.pending()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
  go(workspaceId: string | null, page: Page = 'overview', records: RecordContext = {}) {
    return this.router.navigate(
      workspaceId ? ['/workspaces', workspaceId, page] : ['/workspaces'],
      { queryParams: records },
    );
  }
}
const leaveGuard: CanActivateFn = () => inject(NavigationState).allowLeave();
@Component({ standalone: true, template: '' })
export class RouteAnchor {}
export const routes: Routes = [
  { path: '', pathMatch: 'full', component: RouteAnchor, canActivate: [leaveGuard] },
  { path: 'workspaces/:workspaceId/account', redirectTo: '/account', pathMatch: 'full' },
  ...['workspaces', 'account', 'sign-in', 'sign-up', 'workspaces/:workspaceId/:page'].map(
    (path) => ({
      path,
      component: RouteAnchor,
      canActivate: [leaveGuard],
      runGuardsAndResolvers: 'always' as const,
    }),
  ),
  { path: '**', component: RouteAnchor, canActivate: [leaveGuard] },
];
