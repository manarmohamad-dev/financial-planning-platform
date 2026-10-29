import { InPageLink } from './in-page';
import { GoogleSignIn, type GoogleAuthResult } from './google-sign-in';
import { PublicLanding } from './landing';
import {
  NavigationEnd,
  Router,
  RouterOutlet,
  provideRouter,
  withRouterConfig,
} from '@angular/router';
import {
  NavigationState,
  pages,
  routes,
  type Page,
  type Journey,
  type RecordContext,
} from './navigation';
import { inject } from '@angular/core';
import { LocaleService, TranslatePipe } from './i18n';
import { OverviewActivity } from './overview-activity';
import { ExecutiveOverview } from './overview';
import { StressWorkbench } from './stress';
import { ForecastWorkbench } from './forecasts';
import { ImportWorkbench } from './imports';
import { DecisionWorkbench } from './decisions';
import { PlanningWorkbench } from './planning';
import { Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
type User = { id: string; email: string; displayName: string };
type Workspace = {
  id: string;
  name: string;
  kind: 'company' | 'demo';
  currency: string;
  status: string;
  revision: number;
  role: string | null;
  permissions?: string[];
};
type Member = { user_id: string; display_name: string; email: string; role: string };
type AuditEvent = {
  id: string;
  action: string;
  created_at: string;
  actor_id: string;
  resource_id: string;
  metadata: unknown;
};
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    GoogleSignIn,
    PublicLanding,
    InPageLink,
    RouterOutlet,
    TranslatePipe,
    ExecutiveOverview,
    OverviewActivity,
    StressWorkbench,
    ForecastWorkbench,
    FormsModule,
    PlanningWorkbench,
    DecisionWorkbench,
    ImportWorkbench,
  ],
  templateUrl: './app.html',
})
class App {
  readonly googleRequest = <T>(path: string, method = 'GET', body?: unknown) => this.api<T>(path, method, body);
  googlePassword = '';
  googleLink = signal(false);
  async acceptGoogle(result: GoogleAuthResult) {
    await this.perform(async () => {
      this.csrf = result.csrfToken;
      this.user.set(result.user);
      this.password = '';
      await this.refresh();
      await this.navigation.go(null);
    });
  }
  finishGoogleLink() {
    this.googlePassword = '';
    this.googleLink.set(false);
    this.notice.set('Google account connected successfully.');
  }
  landing = signal(window.location.pathname === '/');
  readonly navigation = inject(NavigationState);
  readonly router = inject(Router);
  records: RecordContext = {};
  routeLoading = signal(false);
  account = signal(false);
  setup = signal<{ versions: number; published: number; scenarios: number; briefs: number } | null>(
    null,
  );
  private routeGeneration = 0;
  go(page: Page, records: RecordContext = {}) {
    void this.navigation.go(this.active()?.id ?? null, page, records);
  }
  journey(event: Journey) {
    this.go(event.page, event.records);
  }
  allWorkspaces() {
    void this.navigation.go(null);
  }
  openAccount() {
    void this.router.navigate(['/account']);
  }
  authMode() {
    void this.router.navigate([this.registering ? '/sign-in' : '/sign-up']);
  }
  async restoreRoute() {
    this.landing.set(this.router.url.split(/[?#]/)[0] === '/');
    if (!this.loaded()) return;
    const generation = ++this.routeGeneration;
    const tree = this.router.parseUrl(this.router.url);
    const segments = tree.root.children['primary']?.segments.map((s) => s.path) ?? [];
    this.registering = segments[0] === 'sign-up';
    this.account.set(segments[0] === 'account');
    this.navigation.dirty.set(false);
    this.menuOpen = false;
    this.error.set('');
    this.notice.set('');
    this.routeLoading.set(true);
    this.active.set(null);
    this.events.set([]);
    this.members.set([]);
    this.inviteToken.set('');
    this.setup.set(null);
    try {
      if (!this.user()) return;
      if (segments.length === 3 && segments[0] === 'workspaces') {
        const page = segments[2] as Page;
        if (!pages.includes(page)) throw new Error('Unknown page');
        const workspace = await this.api<Workspace>(
          '/workspaces/' + encodeURIComponent(segments[1]),
        );
        if (generation !== this.routeGeneration) return;
        if (workspace.status !== 'active') throw new Error('This workspace is archived.');
        if (
          (page === 'members' && !workspace.permissions?.includes('members.manage')) ||
          (page === 'settings' && !workspace.permissions?.includes('workspace.edit'))
        )
          throw new Error('Your role does not allow this action.');
        this.records = {};
        for (const key of [
          'draft',
          'version',
          'baseline',
          'run',
          'comparison',
          'brief',
          'dataset',
          'file',
          'job',
          'source',
        ] as const) {
          const value = tree.queryParams[key];
          if (typeof value === 'string' && value.length < 100) this.records[key] = value;
        }
        this.editedName = workspace.name;
        this.tab.set(page);
        this.active.set(workspace);
        if (page === 'members') {
          const data = await this.api<{ members: Member[] }>(
            '/workspaces/' + workspace.id + '/members',
          );
          if (generation !== this.routeGeneration) return;
          this.members.set(data.members);
        }
        if (page === 'overview' || page === 'setup') {
          const base = '/workspaces/' + workspace.id;
          const [events, versions, baselines, scenarios, briefs] = await Promise.all([
            this.api<{ events: AuditEvent[] }>(base + '/audit'),
            this.api<{ versions: unknown[] }>(base + '/planning/versions'),
            this.api<{ baselines: { published_at: string | null }[] }>(
              base + '/planning/baselines',
            ),
            this.api<{ runs: unknown[] }>(base + '/scenarios/runs'),
            this.api<{ briefs: unknown[] }>(base + '/stress/briefs'),
          ]);
          if (generation !== this.routeGeneration) return;
          this.events.set(events.events);
          this.setup.set({
            versions: versions.versions.length,
            published: baselines.baselines.filter((b) => b.published_at).length,
            scenarios: scenarios.runs.length,
            briefs: briefs.briefs.length,
          });
        }
      } else if (segments.length && !['workspaces', 'account', 'sign-in', 'sign-up'].includes(segments[0])) {
        throw new Error('Page not found. Choose a workspace to continue.');
      }
    } catch (e) {
      if (generation === this.routeGeneration) {
        this.active.set(null);
        this.error.set((e as Error).message);
      }
    } finally {
      if (generation === this.routeGeneration) {
        this.routeLoading.set(false);
        setTimeout(() => document.querySelector<HTMLElement>('main')?.focus(), 0);
      }
    }
  }
  readonly locale = inject(LocaleService);
  menuOpen = false;
  closeMenu() {
    this.menuOpen = false;
    document.querySelector<HTMLButtonElement>('.nav-toggle')?.focus();
  }
  readonly pageNames: Record<string, string> = {
    overview: 'Executive Overview',
    planning: 'Financial Baseline',
    imports: 'Data & Imports',
    decisions: 'Scenario Builder',
    forecasts: 'Forecasting',
    stress: 'Risk Center',
    briefs: 'Decision Briefs',
    members: 'Team & access',
    settings: 'Settings',
    account: 'Account',
    setup: 'Company setup',
  };
  user = signal<User | null>(null);
  workspaces = signal<Workspace[]>([]);
  active = signal<Workspace | null>(null);
  error = signal('');
  notice = signal('');
  busy = signal(false);
  loaded = signal(false);
  members = signal<Member[]>([]);
  events = signal<AuditEvent[]>([]);
  inviteToken = signal('');
  tab = signal<Page>('overview');
  registering = false;
  email = '';
  password = '';
  displayName = '';
  companyName = '';
  currency = 'EGP';
  inviteEmail = '';
  inviteRole = 'ANALYST';
  joinToken = '';
  editedName = '';
  private csrf = '';
  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) void this.restoreRoute();
    });
    void this.initialize();
  }
  private async api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (method !== 'GET' && !this.csrf)
      this.csrf = (await this.api<{ token: string }>('/auth/csrf')).token;
    const response = await fetch('/api/v1' + path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(method !== 'GET' ? { 'X-CSRF-Token': this.csrf } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.code ?? 'REQUEST_FAILED');
    return data;
  }
  private async initialize() {
    try {
      this.user.set((await this.api<{ user: User }>('/auth/me')).user);
      await this.refresh();
    } catch (e) {
      if ((e as Error).message !== 'UNAUTHENTICATED')
        this.error.set('Unable to reach the service. Please try again.');
    } finally {
      this.loaded.set(true);
      await this.restoreRoute();
    }
  }
  async perform(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await fn();
    } catch (e) {
      const code = (e as Error).message;
      const messages: Record<string, string> = {
        INVALID_CREDENTIALS: 'Email or password is incorrect.',
        ACCOUNT_UNAVAILABLE: 'This email cannot be registered. Try signing in.',
        CSRF_INVALID: 'Your session changed. Please try again.',
        FORBIDDEN: 'Your role does not allow this action.',
        VERSION_CONFLICT: 'Someone changed this record. Refresh before saving.',
        LAST_OWNER: 'Transfer ownership before removing the owner.',
        INVITATION_INVALID:
          'This invitation is invalid, expired, used, or belongs to another email.',
        VALIDATION_FAILED: 'Check your inputs. Passwords require 12–128 characters.',
        WORKSPACE_ARCHIVED: 'This workspace is archived.',
        RATE_LIMITED: 'Too many requests. Please wait before trying again.',
      };
      if (code === 'CSRF_INVALID') this.csrf = '';
      this.error.set(messages[code] ?? 'The request could not be completed. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }
  async refresh() {
    this.workspaces.set((await this.api<{ workspaces: Workspace[] }>('/workspaces')).workspaces);
  }
  async authenticate() {
    await this.perform(async () => {
      const result = await this.api<{ user: User; csrfToken: string }>(
        '/auth/' + (this.registering ? 'register' : 'login'),
        'POST',
        {
          email: this.email,
          password: this.password,
          ...(this.registering ? { displayName: this.displayName } : {}),
        },
      );
      this.csrf = result.csrfToken;
      this.user.set(result.user);
      this.password = '';
      await this.refresh();
      if (this.router.url.startsWith('/workspaces/')) await this.restoreRoute();
      else await this.navigation.go(null);
    });
  }
  async logout() {
    if (!(await this.navigation.allowLeave())) return;
    this.navigation.dirty.set(false);
    await this.perform(async () => {
      await this.api('/auth/logout', 'POST');
      this.csrf = '';
      this.user.set(null);
      this.active.set(null);
      this.workspaces.set([]);
      this.members.set([]);
      this.events.set([]);
      this.inviteToken.set('');
      await this.router.navigate(['/sign-in']);
    });
  }
  async select(w: Workspace) {
    await this.navigation.go(w.id);
  }
  async demo() {
    await this.perform(async () => {
      const { id } = await this.api<{ id: string }>('/demo', 'POST', {});
      await this.refresh();
      this.active.set(await this.api<Workspace>('/workspaces/' + id));
      await this.navigation.go(id);
      this.events.set(
        (await this.api<{ events: AuditEvent[] }>('/workspaces/' + id + '/audit')).events,
      );
    });
  }
  async createCompany() {
    await this.perform(async () => {
      const { id } = await this.api<{ id: string }>('/workspaces', 'POST', {
        name: this.companyName,
        currency: this.currency,
      });
      await this.refresh();
      this.active.set(await this.api<Workspace>('/workspaces/' + id));
      this.editedName = this.companyName;
      this.companyName = '';
      await this.navigation.go(id, 'setup');
    });
  }
  can(permission: string) {
    return this.active()?.permissions?.includes(permission) ?? false;
  }
  async showMembers() {
    this.go('members');
  }
  async invite() {
    await this.perform(async () => {
      const result = await this.api<{ token: string }>(
        '/workspaces/' + this.active()!.id + '/invitations',
        'POST',
        { email: this.inviteEmail, role: this.inviteRole },
      );
      this.inviteToken.set(result.token);
      this.notice.set(
        'Invitation created. Share the token privately with this person; it expires in 24 hours.',
      );
    });
  }
  async join() {
    await this.perform(async () => {
      await this.api('/invitations/accept', 'POST', { token: this.joinToken.trim() });
      this.joinToken = '';
      await this.refresh();
      this.notice.set('You joined the workspace. Select it below to continue.');
    });
  }
  async removeMember(m: Member) {
    if (!confirm(this.locale.t('Remove this person’s access?'))) return;
    await this.perform(async () => {
      await this.api('/workspaces/' + this.active()!.id + '/members/' + m.user_id, 'DELETE');
      this.members.set(this.members().filter((x) => x.user_id !== m.user_id));
    });
  }
  async changeRole(m: Member, role: string) {
    if (
      role === m.role ||
      !confirm(this.locale.t('Change {0} to {1}?', [m.display_name, this.locale.t(role)]))
    )
      return;
    await this.perform(async () => {
      await this.api('/workspaces/' + this.active()!.id + '/members/' + m.user_id, 'PATCH', {
        role,
      });
      this.members.update((all) => all.map((x) => (x.user_id === m.user_id ? { ...x, role } : x)));
    });
  }
  async transfer(m: Member) {
    if (
      !confirm(
        this.locale.t('Transfer ownership to {0}? Your role will become Manager.', [
          m.display_name,
        ]),
      )
    )
      return;
    await this.perform(async () => {
      const id = this.active()!.id;
      await this.api('/workspaces/' + id + '/ownership-transfer', 'POST', {
        targetUserId: m.user_id,
      });
      this.active.set(await this.api<Workspace>('/workspaces/' + id));
      await this.refresh();
      await this.navigation.go(id);
    });
  }
  async saveSettings() {
    await this.perform(async () => {
      const a = this.active()!;
      await this.api('/workspaces/' + a.id, 'PATCH', {
        name: this.editedName,
        revision: a.revision,
      });
      this.active.set(await this.api<Workspace>('/workspaces/' + a.id));
      await this.refresh();
      this.navigation.dirty.set(false);
      this.notice.set('Workspace settings saved.');
    });
  }
  async archive() {
    if (
      !confirm(
        this.locale.t('Archive this workspace? Planning and membership changes will be disabled.'),
      )
    )
      return;
    await this.perform(async () => {
      await this.api('/workspaces/' + this.active()!.id + '/archive', 'POST', {});
      this.active.set(null);
      this.navigation.dirty.set(false);
      await this.navigation.go(null);
      await this.refresh();
    });
  }
}
bootstrapApplication(App, {
  providers: [provideRouter(routes, withRouterConfig({ onSameUrlNavigation: 'reload' }))],
}).catch(() => {
  document.body.textContent = 'Unable to start the application.';
});
