# 002 — Replace the global reduced-motion kill switch with gentle fallbacks

- **Status**: DONE
- **Commit**: b28f23d
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 5 files, about 70 lines

## Problem

`src/index.css:749-757` disables every animation and transition, including opacity and color feedback that helps users understand state changes:

```css
/* src/index.css:749-757 — current */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}
```

Reduced motion should remove spatial travel, scale, bounce, and decorative loops while retaining a short opacity/color bridge. The universal rule also hides whether individual components have an accessible alternative.

Several CSS/keyframe surfaces need explicit selectors before the universal override can be removed:

```tsx
// src/components/ui/ConfirmDialog.tsx:26-53 — current
<ModalOverlay
  // no stable class name
  style={{
    animation: 'fadeIn var(--transition-fast, 0.12s) ease',
  }}
>
  <Modal
    style={{
      animation: 'scaleIn var(--transition-normal, 0.2s) ease',
    }}
  >
```

```tsx
// src/components/ui/Dropdown.tsx:315-337 — current
<div
  ref={popupRef}
  role="listbox"
  // no stable popup class name
  style={{
    animation: 'dsDropdownIn var(--transition-fast) ease',
  }}
>
```

```tsx
// src/pages/Dashboard/RecentRequests.tsx:139-141 — current
transition: 'background var(--transition-fast, 0.12s) ease, opacity 0.3s ease',
animation: isNewRow ? 'slideInUp 0.25s ease-out both' : 'none',
```

```tsx
// src/pages/ModelConfig/AggregationTable.tsx:93-95 — current
transition: 'background var(--transition-fast, 0.12s) ease',
animation: `slideInUp 0.2s ease-out both`,
animationDelay: `${idx * 30}ms`,
```

## Target

Execute this plan only after plans 001, 003, 004, 005, and 006. Those plans provide component-level handling for the Canvas, header, Stepper, button press feedback, and Toast.

Replace the universal override with named, auditable fallbacks:

```css
/* target in src/index.css */
@keyframes reducedFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }

  .ds-confirm-overlay,
  .ds-confirm-dialog,
  .ds-dropdown__popup,
  .rb-recent-request-new,
  .mc-aggregation-row {
    animation: reducedFadeIn 200ms ease both !important;
    animation-delay: 0ms !important;
    transform: none !important;
  }

  .ds-menu {
    transform: none !important;
    transition: opacity 200ms ease !important;
  }

  .rb-pulse-dot,
  .rb-status-dot--error,
  .rb-status-dot--checking,
  .rb-shiny-text.is-active {
    animation: none !important;
  }

  .ds-btn:active:not(:disabled),
  .rb-spotlight-card,
  .rb-spotlight-card:hover,
  .rb-spotlight-card.is-active {
    transform: none !important;
  }
}
```

Add the stable classes referenced above:

- `className="ds-confirm-overlay"` on `ModalOverlay`.
- `className="ds-confirm-dialog"` on `Modal`.
- `className="ds-dropdown__popup"` on the portal popup.
- `className={isNewRow ? 'rb-recent-request-new' : undefined}` on recent request rows.
- `className="mc-aggregation-row"` on aggregation rows.

Opacity/color transitions that aid comprehension may remain. Position, scale, blur, shimmer, and decorative repetition must not run in reduced mode.

## Repo conventions to follow

- Global motion tokens and keyframes live in `src/index.css:45-50,361-436`; keep `reducedFadeIn` there.
- `src/components/ui/ReactBits.tsx:36-42,152-158,187-200` already omits spatial/decorative classes when reduced motion is active. Do not duplicate that hook logic.
- Use the audit-prescribed reduced-motion fallback exactly: `200ms ease` opacity feedback with movement removed.

## Steps

1. Complete plans 001, 003, 004, 005, and 006 first. If any remains TODO, STOP; removing the universal rule would expose unmanaged movement.
2. Add the five stable class names to `ConfirmDialog.tsx`, `Dropdown.tsx`, `RecentRequests.tsx`, and `AggregationTable.tsx` exactly as specified.
3. Add `@keyframes reducedFadeIn` near the existing global keyframes in `src/index.css`.
4. Replace the universal `0.001ms` media query with the targeted media query above.
5. Search `src/` for `animation:`, `@keyframes`, `motion.`, `animate=`, and `transition:`. Confirm every remaining spatial/looping animation is either handled by this media query, already handled through `useReducedMotion`, or documented as a small functional loader (`spin`) or opacity-only skeleton.
6. Do not change normal-motion values while doing this accessibility pass.

## Boundaries

- Do NOT use another universal selector to set all durations to zero or near-zero.
- Do NOT disable functional opacity/color state feedback, loading spinners, or the opacity-only skeleton pulse.
- Do NOT redesign ConfirmDialog, Dropdown, RecentRequests, or AggregationTable.
- Do NOT add dependencies.
- If any prerequisite plan is not implemented against commit `b28f23d`, STOP and report it.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm format:check`; all must exit successfully. Run `rg -n "0\\.001ms|prefers-reduced-motion" src` and confirm the universal duration kill switch is gone.
- **Feel check**: with DevTools Rendering set to reduced motion:
  - Open ConfirmDialog and Dropdown: they fade for `200ms` without scale or translation.
  - Add/update a recent request and visit the aggregation table: rows fade without sliding or stagger.
  - Navigate the header, use Stepper, show/close a Toast, press a Button, and inspect the dither to confirm the prerequisite plans' reduced alternatives remain active.
  - Hover KPI/provider cards: no lift or motion remains.
  - Status colors and opacity feedback remain legible rather than snapping off globally.
- **Done when**: reduced mode contains no spatial/decorative movement in the selected surfaces, while opacity and color feedback still bridge state changes.
