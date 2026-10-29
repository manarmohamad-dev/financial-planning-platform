import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject, signal } from '@angular/core';
import { LocaleService, TranslatePipe } from './i18n';
export type GoogleAuthResult = { user: { id: string; email: string; displayName: string }; csrfToken: string };
interface GoogleId {
  initialize(input: { client_id: string; nonce: string; callback: (result: { credential?: string }) => void }): void;
  renderButton(element: HTMLElement, options: { theme: string; size: string; text: string; locale: string; width: number }): void;
}
let loading: Promise<void> | undefined;
function load(): Promise<void> {
  if ((window as Window & { google?: { accounts: { id: GoogleId } } }).google) return Promise.resolve();
  return loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loading = undefined; script.remove(); reject(new Error('GOOGLE_UNAVAILABLE')); };
    document.head.appendChild(script);
  });
}
@Component({
  selector: 'google-sign-in', standalone: true, imports: [TranslatePipe],
  template: `<div class="google-auth" [attr.aria-busy]="busy()"><p role="status">{{message() | t}}</p><div #button [hidden]="busy()"></div>@if(retry()){<button type="button" (click)="prepare()">{{'Try Google again' | t}}</button>}</div>`,
  styles: ['.google-auth{margin-block:1rem;max-width:100%;overflow:hidden}.google-auth p{font-size:.875rem;color:var(--muted)}'],
})
export class GoogleSignIn implements AfterViewInit, OnDestroy {
  @Input({ required: true }) request!: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  @Input() password: string | null = null;
  @Output() authenticated = new EventEmitter<GoogleAuthResult>();
  @Output() linked = new EventEmitter<void>();
  @ViewChild('button', { static: true }) button!: ElementRef<HTMLElement>;
  readonly locale = inject(LocaleService);
  readonly message = signal('Loading Google Sign-In…');
  readonly busy = signal(false);
  readonly retry = signal(false);
  private destroyed = false;
  ngAfterViewInit() { void this.prepare(); }
  ngOnDestroy() { this.destroyed = true; }
  async prepare() {
    this.retry.set(false);
    try {
      const config = await this.request<{ enabled: boolean; clientId: string }>('/auth/google/config');
      if (!config.enabled) { this.message.set('Google Sign-In is not configured. Use email and password.'); return; }
      await load();
      const { nonce } = await this.request<{ nonce: string }>('/auth/google/challenge', 'POST', {});
      if (this.destroyed) return;
      const api = (window as Window & { google?: { accounts: { id: GoogleId } } }).google?.accounts.id;
      if (!api) throw new Error('GOOGLE_UNAVAILABLE');
      this.message.set('');
      api.initialize({ client_id: config.clientId, nonce, callback: result => { void this.finish(result.credential, nonce); } });
      this.button.nativeElement.replaceChildren();
      api.renderButton(this.button.nativeElement, { theme: 'outline', size: 'large', text: 'continue_with', locale: this.locale.locale(), width: Math.min(400, this.button.nativeElement.clientWidth || 280) });
    } catch { this.message.set('Google Sign-In is unavailable. Use email and password or try again.'); this.retry.set(true); }
  }
  private async finish(credential: string | undefined, nonce: string) {
    if (this.destroyed || this.busy()) return;
    if (!credential) { this.message.set('Google Sign-In was cancelled.'); return; }
    this.busy.set(true); this.message.set('Verifying Google account…');
    try {
      if (this.password !== null) {
        await this.request('/auth/google/link', 'POST', { credential, nonce, password: this.password });
        this.linked.emit();
      } else {
        this.authenticated.emit(await this.request<GoogleAuthResult>('/auth/google', 'POST', { credential, nonce }));
      }
      this.message.set('');
    } catch (error) {
      const code = (error as Error).message;
      this.message.set(code === 'GOOGLE_LINK_REQUIRED' ? 'Sign in with your password, then connect Google from Account.' : code === 'GOOGLE_ACCOUNT_CONFLICT' ? 'Use an unlinked Google account with the same email.' : code === 'INVALID_CREDENTIALS' ? 'Your current password is incorrect.' : 'Google Sign-In could not be verified. Please try again.');
      this.retry.set(true); this.button.nativeElement.replaceChildren();
    } finally { this.busy.set(false); }
  }
}
