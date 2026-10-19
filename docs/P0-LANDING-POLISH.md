# Landing mobile polish — 2026-10-19

Limited changes: landing.html, landing.css, locales/p0.ts only (plus verification artifacts).

- Mobile navigation now uses three clear equal-width targets, at least 48px high; language/sign-in targets at least 44px.
- Mobile primary/secondary CTAs are full-width and at least 52px high.
- Existing actual synthetic dashboard screenshots use a larger scrollable preview on mobile, with AR/EN instructions, keyboard-focusable region and the existing full-image link. Desktop screenshot presentation is unchanged.
- Arabic wording refined for cash inflows/outflows, recurring pay/onboarding, column mapping and stress scenarios.
- No reversed DOM ordering: RTL desktop grids begin on the right; mobile steps/cards retain logical top-to-bottom order.

Verification: 19 relevant tests passed across ui-presentation, navigation and workbench-navigation. Typecheck passed. Lint passed with generated tmp/p0-release build output excluded as in P0. API and Angular production builds passed; frontend initial 735.25 kB, no budget warning.

Chrome checks at 1440, 768, 390 and 320 widths, both languages: no page overflow/header overlap, required mobile touch sizes, correct step/card order on desktop/mobile, scrollable preview. Keyboard preview scrolling and section focus passed. No JavaScript page errors. Tablet decision grid retains two-column layout (not included in linear order assertion). Updated screenshots and results: docs/evidence/p0-polish/.

Initial translation coverage test exposed missing newly added preview strings while editing; dictionary completed and all 19 tests passed on rerun.

Remaining limits: viewport emulation rather than physical devices; larger image requires panning on mobile, deliberately indicated in the UI. No production deployment or Git push. No backend logic, financial calculations, authentication, permissions or database changes. Existing desktop composition and workflows retained.
