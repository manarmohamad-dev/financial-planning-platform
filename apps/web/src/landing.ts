import { Component, Input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService, TranslatePipe } from './i18n';
import { InPageLink } from './in-page';

@Component({
  selector: 'public-landing',
  standalone: true,
  imports: [RouterLink, TranslatePipe, InPageLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class PublicLanding {
  @Input() signedIn = false;
  readonly locale = inject(LocaleService);
  readonly decisions = [
    ['01', 'Sales', 'Explore changes in sales and when cash is collected.'],
    ['02', 'Hiring', 'Review headcount, recurring pay and onboarding costs.'],
    ['03', 'Expenses', 'See how operating costs and payment timing affect cash.'],
    ['04', 'Expansion', 'Review the linked commitments behind a growth decision.'],
  ];
}
