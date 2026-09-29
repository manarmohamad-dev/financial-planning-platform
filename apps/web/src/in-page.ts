import { Directive, ElementRef, HostListener, inject } from '@angular/core';
/** Fragment links must remain inside the current routed document despite <base href="/">. */
@Directive({ selector: 'a[inPage]', standalone: true })
export class InPageLink {
  private element = inject<ElementRef<HTMLAnchorElement>>(ElementRef);
  @HostListener('click', ['$event']) follow(event: Event) {
    event.preventDefault();
    const target = document.getElementById(
      this.element.nativeElement.getAttribute('href')!.slice(1),
    );
    if (!target) return;
    let parent = target.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    target.setAttribute('tabindex', '-1');
    target.focus();
    target.scrollIntoView({ block: 'start' });
  }
}
