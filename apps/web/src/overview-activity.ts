import { Component, Input, inject, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { LocaleService, LocalDatePipe } from './i18n';

@Component({
  selector: 'overview-activity',
  standalone: true,
  imports: [JsonPipe, LocalDatePipe],
  template: ` <section
    class="activity-feed"
    [attr.aria-label]="text('Workspace activity', 'نشاط مساحة العمل')"
  >
    <header>
      <div>
        <h2>{{ text('Workspace activity', 'نشاط مساحة العمل') }}</h2>
        <p>
          {{
            text(
              'Changes and their source evidence ·',
              'التغييرات وأدلتها المصدرية · التوقيت العالمي المنسق'
            )
          }}
          <bdi>UTC</bdi>
        </p>
      </div>
      <span class="count">{{ events.length }}</span>
    </header>
    <ol>
      @for (event of expanded() ? events : events.slice(0, 5); track event.id) {
        <li>
          <details>
            <summary>
              <span class="event-label">{{ label(event.action) }}</span
              ><time [attr.datetime]="event.created_at"
                ><bdi>{{ event.created_at | localDate }}</bdi></time
              ><span class="disclosure" aria-hidden="true">⌄</span>
            </summary>
            <div class="evidence">
              <p>{{ text('Source and audit details', 'تفاصيل المصدر والتدقيق') }}</p>
              <dl>
                <dt>{{ text('Event', 'الحدث') }}</dt>
                <dd>
                  <bdi>{{ event.action }}</bdi>
                </dd>
                <dt>{{ text('Audit ID', 'معرّف التدقيق') }}</dt>
                <dd>
                  <bdi>{{ event.id }}</bdi>
                </dd>
                <dt>{{ text('Actor', 'المستخدم') }}</dt>
                <dd>
                  <bdi>{{ event.actor_id }}</bdi>
                </dd>
                <dt>{{ text('Record', 'السجل') }}</dt>
                <dd>
                  <bdi>{{ event.resource_id }}</bdi>
                </dd>
                <dt>{{ text('Timestamp', 'التوقيت') }}</dt>
                <dd>
                  <bdi>{{ event.created_at }}</bdi>
                </dd>
              </dl>
              <pre dir="ltr">{{ event.metadata | json }}</pre>
            </div>
          </details>
        </li>
      } @empty {
        <li class="empty">{{ text('No recent activity.', 'لا يوجد نشاط حديث.') }}</li>
      }
    </ol>
    @if (events.length > 5) {
      <button type="button" [attr.aria-expanded]="expanded()" (click)="expanded.set(!expanded())">
        {{
          expanded()
            ? text('Show less', 'عرض أقل')
            : text('Show remaining activity', 'عرض بقية النشاط')
        }}
        @if (!expanded()) {
          <bdi>({{ events.length - 5 }})</bdi>
        }
      </button>
    }
  </section>`,
  styles: [
    `
      :host {
        display: block;
      }
      .activity-feed {
        background: #f8f9fb;
        border: 1px solid #c5ceda;
        border-radius: 16px;
        padding: 20px 24px;
        color: #24384f;
        margin-top: 18px;
      }
      header {
        position: static;
        background: transparent;
        border: 0;
        box-shadow: none;
        padding: 0;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      h2 {
        font-size: 18px;
        margin: 0;
      }
      header p {
        font-size: 12px;
        color: #52647a;
        margin: 6px 0 12px;
      }
      .count {
        border: 1px solid #c5ceda;
        border-radius: 20px;
        padding: 3px 10px;
        font-variant-numeric: tabular-nums;
      }
      details {
        padding: 0;
        margin: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }
      ol {
        list-style: none;
        padding: 0;
        margin: 0;
        max-height: 440px;
        overflow: auto;
      }
      li {
        border-top: 1px solid #e0e5ed;
      }
      summary {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 13px 8px;
        cursor: pointer;
        list-style: none;
        border-radius: 7px;
      }
      summary::-webkit-details-marker {
        display: none;
      }
      .event-label {
        font-weight: 600;
        font-size: 13px;
        flex: 1;
      }
      .event-label:before {
        content: '';
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #117c80;
        margin-inline-end: 12px;
      }
      time {
        font-size: 11px;
        color: #52647a;
        font-variant-numeric: tabular-nums;
      }
      summary:hover {
        background: #e8eef4;
      }
      summary:focus-visible,
      button:focus-visible {
        outline: 3px solid #117c80;
        outline-offset: 2px;
      }
      details[open] .disclosure {
        transform: rotate(180deg);
      }
      .evidence {
        background: #edf0f4;
        padding: 12px 18px;
        margin: 0 8px 12px;
        border-radius: 8px;
        font-size: 12px;
      }
      dl {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 7px 14px;
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        max-height: 220px;
        overflow: auto;
        font-size: 11px;
      }
      button {
        margin-top: 12px;
        padding: 9px 14px;
        background: #e8ecf1;
        border: 1px solid #bac8d6;
        border-radius: 8px;
        color: #24384f;
        cursor: pointer;
      }
      button:hover {
        background: #dbe5ee;
      }
      summary,
      button {
        transition: background-color 160ms ease;
      }
      .empty {
        padding: 14px;
      }
      @media (max-width: 600px) {
        .activity-feed {
          padding: 16px;
        }
        summary {
          flex-wrap: wrap;
          gap: 6px;
        }
        .event-label {
          flex-basis: 85%;
        }
        time {
          margin-inline-start: 19px;
        }
        dl {
          grid-template-columns: 1fr;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        summary,
        button {
          transition: none;
        }
      }
    `,
  ],
})
export class OverviewActivity {
  @Input() events: {
    id: string;
    action: string;
    created_at: string;
    actor_id: string;
    resource_id: string;
    metadata: unknown;
  }[] = [];
  readonly expanded = signal(false);
  private readonly locale = inject(LocaleService);
  text(en: string, ar: string) {
    return this.locale.locale() === 'ar' ? ar : en;
  }
  label(action: string) {
    const labels: Record<string, [string, string]> = {
      'risk.policy_versioned': ['Risk policy version created', 'إنشاء نسخة سياسة المخاطر'],
      'brief.prepared': ['Decision brief prepared', 'إعداد موجز القرار'],
      'stress.definition_confirmed': ['Stress definition confirmed', 'تأكيد تعريف اختبار الضغط'],
      'stress.batch_created': ['Stress batch created', 'إنشاء مجموعة اختبارات الضغط'],
      'stress.batch_cancelled': ['Stress batch cancelled', 'إلغاء مجموعة اختبارات الضغط'],
      'stress.child_succeeded': ['Stress case completed', 'اكتمال حالة اختبار الضغط'],
      'stress.child_completed': ['Stress case completed', 'اكتمال حالة اختبار الضغط'],
      'stress.child_failed': ['Stress case failed', 'تعذّر إكمال حالة اختبار الضغط'],
      'stress.child_cancelled': ['Stress case cancelled', 'إلغاء حالة اختبار الضغط'],
      'stress.comparison_created': ['Stress comparison saved', 'حفظ مقارنة اختبارات الضغط'],
      'scenario.draft_edited': ['Scenario draft updated', 'تحديث مسودة السيناريو'],
      'scenario.assumptions_changed': ['Scenario assumptions updated', 'تحديث افتراضات السيناريو'],
      'scenario.versioned': ['Scenario version created', 'إنشاء نسخة السيناريو'],
      'financial.draft_created': ['Financial draft created', 'إنشاء مسودة البيانات المالية'],
      'financial.draft_updated': ['Financial draft updated', 'تحديث مسودة البيانات المالية'],
      'planning.confirmed': ['Planning version confirmed', 'تأكيد نسخة التخطيط'],
      'schedule.confirmed': ['Schedule confirmed', 'تأكيد الجدول المالي'],
      'assumption.confirmed': ['Assumptions confirmed', 'تأكيد الافتراضات'],
      'assumption.draft_created': ['Assumption draft created', 'إنشاء مسودة الافتراضات'],
      'assumption.draft_updated': ['Assumption draft updated', 'تحديث مسودة الافتراضات'],
      'baseline.prepared': ['Baseline prepared', 'إعداد خط الأساس'],
      'baseline.published': ['Baseline published', 'نشر خط الأساس'],
      'baseline.run_completed': ['Baseline calculated', 'اكتمال حساب خط الأساس'],
      'workspace.created': ['Workspace created', 'إنشاء مساحة العمل'],
      'workspace.updated': ['Workspace updated', 'تحديث مساحة العمل'],
      'workspace.archived': ['Workspace archived', 'أرشفة مساحة العمل'],
      'scenario.created': ['Scenario created', 'إنشاء سيناريو'],
      'scenario.confirmed': ['Scenario confirmed', 'تأكيد السيناريو'],
      'scenario.run_completed': ['Scenario calculated', 'اكتمال حساب السيناريو'],
      'scenario.comparison_created': ['Scenario comparison saved', 'حفظ مقارنة السيناريوهات'],
      'membership.invited': ['Teammate invited', 'دعوة عضو للفريق'],
      'membership.joined': ['Teammate joined', 'انضمام عضو للفريق'],
      'membership.role_changed': ['Member responsibility updated', 'تحديث مسؤولية عضو'],
      'membership.removed': ['Member removed', 'إزالة عضو من الفريق'],
    };
    const value = labels[action];
    return value
      ? this.text(...value)
      : this.text('Workspace event · open evidence', 'حدث في مساحة العمل · افتح الأدلة');
  }
}
