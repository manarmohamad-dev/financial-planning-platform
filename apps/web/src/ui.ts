import { FinancialPath, type ChartPeriod } from './chart-model.js';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MoneyPipe, TranslatePipe, LocalDatePipe } from './i18n.js';

@Component({
  selector: 'workflow-stages',
  standalone: true,
  imports: [TranslatePipe],
  template: `<ol class="workflow-stages" [attr.aria-label]="'Workflow progress' | t">
    @for (label of labels; track $index) {
      <li
        [class.current]="$index === active"
        [attr.aria-current]="$index === active ? 'step' : null"
      >
        <span aria-hidden="true">{{ $index + 1 }}</span
        ><strong>{{ label | t }}</strong>
      </li>
    }
  </ol><p class="workflow-progress-note">{{ 'Progress indicator — use the actions below to continue.' | t }}</p>`,
})
export class WorkflowStages {
  @Input() labels: string[] = [];
  @Input() active = 0;
}

@Component({
  selector: 'record-history',
  standalone: true,
  imports: [TranslatePipe, LocalDatePipe],
  template: `<details class="card workbench-history" [open]="expanded">
    <summary>{{ title | t }} ({{ records.length }})</summary>
    @for (record of records; track record.id) {
      <article class="list-record">
        <button (click)="openRecord.emit(record.id)">
          {{ record.title || record.name || record.id }}
        </button>
        @if (record.created_at || record.confirmed_at || record.updated_at) {
          <small>{{
            (record.created_at || record.confirmed_at || record.updated_at)! | localDate
          }}</small>
        }
        @if (record.status) {
          <span class="badge">{{ record.status | t }}</span>
        }
        <details class="record-reference">
          <summary>{{ 'Source assignments and lineage' | t }}</summary>
          <small
            ><bdi>{{ record.id }}</bdi></small
          >
        </details>
      </article>
    } @empty {
      <p class="empty-state">
        {{ 'No saved records yet. Complete the review steps above to create one.' | t }}
      </p>
    }
  </details>`,
})
export class RecordHistory {
  @Input() expanded = false;
  @Input() title = 'Saved work and evidence';
  @Input() records: {
    id: string;
    title?: string;
    name?: string;
    created_at?: string;
    confirmed_at?: string;
    updated_at?: string;
    status?: string;
  }[] = [];
  @Output() openRecord = new EventEmitter<string>();
}
@Component({
  selector: 'ui-metric',
  standalone: true,
  imports: [MoneyPipe, TranslatePipe],
  template: `<div class="financial-metric" [attr.data-tone]="tone">
    @if (icon) {
      <span class="metric-icon" aria-hidden="true"
        ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          @switch (icon) {
            @case ('wallet') {
              <path d="M4 6h14v4M4 6v13h17V9H4V5l12-2v3M16 13h5" />
            }
            @case ('shield') {
              <path d="M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6Z" />
              <path d="m8 12 3 3 5-6" />
            }
            @case ('activity') {
              <path d="M2 12h5l3-8 4 16 3-8h5" />
            }
            @default {
              <path d="M4 8h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" />
            }
          }</svg
      ></span>
    }

    <span class="metric-label">{{ label | t }}</span
    ><strong dir="ltr">{{ value | money: currency }}</strong
    ><small>{{ note | t }}</small>
  </div>`,
})
export class FinancialMetric {
  @Input() tone: 'capital' | 'reserve' | 'performance' | 'neutral' = 'neutral';
  @Input() icon = '';
  @Input() label = '';
  @Input() value: string | null | undefined = null;
  @Input() currency = '';
  @Input() note = '';
}
@Component({
  selector: 'financial-chart',
  standalone: true,
  imports: [TranslatePipe, MoneyPipe],
  template: ` <figure class="financial-chart">
    <figcaption>
      <div>
        <span class="eyebrow">{{
          (forecastPoints ? 'FORECAST ESTIMATES' : 'CALCULATED FINANCIAL PATH') | t
        }}</span>
        <h2>{{ title | t }}</h2>
      </div>
      <span class="badge">{{ currency }} · {{ 'Monthly' | t }}</span>
    </figcaption>
    @if (points.length) {
      <div class="chart-legend">
        <span class="legend-cash">{{
          (forecastPoints ? 'Forecast estimate' : 'Closing cash') | t
        }}</span>
        @if (!forecastPoints) {
          <span class="legend-revenue">{{ 'Revenue' | t }}</span
          ><span class="legend-cost">{{ 'Operating costs' | t }}</span>
        }
      </div>
      <svg
        viewBox="0 0 800 245"
        role="img"
        [attr.aria-label]="title | t"
        preserveAspectRatio="xMidYMid meet"
        dir="ltr"
      >
        @for (tick of ticks; track tick.y) {
          <line x1="66" x2="770" [attr.y1]="tick.y" [attr.y2]="tick.y" stroke="#e2e8f0" />
          <text x="58" [attr.y]="tick.y + 4" text-anchor="end" fill="#52647a" font-size="11">
            {{ tick.label }}
          </text>
        }
        @for (key of keys; track key) {
          <polyline
            [attr.points]="line(key)"
            fill="none"
            [attr.stroke]="colors[key]"
            stroke-width="3"
            stroke-linejoin="round"
          />
        }
        @for (p of points; track p.period; let i = $index) {
          @if (p.closingCash !== null) {
            <circle [attr.cx]="x(i)" [attr.cy]="y(p.closingCash)" r="4" fill="#0f2744">
              <title>{{ p.period }} · {{ p.closingCash | money: currency }}</title>
            </circle>
          }
          <text [attr.x]="x(i)" y="225" text-anchor="middle" fill="#52647a" font-size="12">
            {{ p.period }}
          </text>
        }
      </svg>
      <details class="chart-data">
        <summary>{{ 'View exact monthly values' | t }}</summary>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ 'Month' | t }}</th>
                <th>{{ (forecastPoints ? 'Forecast estimate' : 'Closing cash') | t }}</th>
                @if (!forecastPoints) {
                  <th>{{ 'Revenue' | t }}</th>
                  <th>{{ 'Operating costs' | t }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (p of points; track p.period) {
                <tr>
                  <th>
                    <bdi>{{ p.period }}</bdi>
                  </th>
                  <td>
                    <bdi>{{ p.closingCash | money }}</bdi>
                  </td>
                  @if (!forecastPoints) {
                    <td>
                      <bdi>{{ p.revenue | money }}</bdi>
                    </td>
                    <td>
                      <bdi>{{ p.operatingExpenses | money }}</bdi>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </details>
    } @else {
      <div class="empty-state">
        {{ 'No calculated cash path is available. Missing values remain unknown.' | t }}
      </div>
    }
  </figure>`,
})
export class FinancialChart extends FinancialPath {
  @Input() override periods: ChartPeriod[] = [];
  @Input() override scalePeriods: ChartPeriod[] = [];
  @Input() forecastPoints: { period: string; value: string }[] | null = null;
  override get points(): ChartPeriod[] {
    return (
      this.forecastPoints?.map((p) => ({ period: p.period, closingCash: p.value })) ?? this.periods
    );
  }
  @Input() title = 'Financial outlook';
  @Input() currency = '';
}
