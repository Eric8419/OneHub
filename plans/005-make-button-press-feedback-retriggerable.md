# 005 — Make button press feedback immediate and retriggerable

- **Status**: DONE
- **Commit**: b28f23d
- **Severity**: MEDIUM
- **Category**: Response, interruptibility
- **Estimated scope**: 2 files, about 45 lines removed and 8 added

## Problem

`src/components/ui/Button.tsx:59-78` stores one boolean ripple and clears it with a fixed `400ms` timer:

```tsx
// src/components/ui/Button.tsx:59-78 — current
const btnRef = useRef<HTMLButtonElement>(null);
const [showRipple, setShowRipple] = useState(false);

const hasRipple = ripple ?? (variant === 'brand' || variant === 'primary');

const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
  if (disabled || loading) return;
  if (hasRipple && btnRef.current) {
    // ...measure and set CSS variables...
    setShowRipple(true);
    setTimeout(() => setShowRipple(false), 400);
  }
  props.onClick?.(e);
}, [disabled, loading, hasRipple, props.onClick]);
```

A second click during the existing ripple sets `true` to `true`, so it cannot create fresh feedback. The ripple begins on click/release rather than pointer-down. The later `{...props}` spread also appears after `onClick={handleClick}`, so a caller-provided `onClick` can replace the wrapper entirely.

The ripple surface at `src/components/ui/Button.tsx:135-149` is a fixed keyframe starting from `scale(0)`:

```tsx
{hasRipple && showRipple && (
  <span
    style={{
      transform: 'translate(-50%, -50%) scale(0)',
      animation: 'ripple 0.4s ease-out forwards',
    }}
  />
)}
```

The component already attempts the better feedback at `src/components/ui/Button.tsx:126-131`, but mouse-only imperative handlers are not necessary and do not cover touch/pointer cancellation cleanly.

## Target

Use the browser's native `:active` state as the sole physical press feedback. It responds on pointer-down, restarts on every press, cancels when the pointer leaves, and requires no timer or React state.

```css
/* target in src/index.css */
.ds-btn:active:not(:disabled) {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .ds-btn:active:not(:disabled) {
    transform: none;
  }
}
```

```tsx
// target transition in Button.tsx
transition:
  'background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast), transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
```

Remove ripple state, measurement, timeout, keyframe rendering, the `ripple` prop, the normal inline `transform: scale(1)`, and mouse down/up transform mutations. Keep existing hover color behavior and native caller `onClick` behavior.

## Repo conventions to follow

- `Button` already supplies className `ds-btn` at `src/components/ui/Button.tsx:108`; use it instead of adding component state.
- The press recipe must be exactly `scale(0.97)` with `160ms cubic-bezier(0.23, 1, 0.32, 1)`.
- Global reusable motion selectors live in `src/index.css`.
- No current call site passes the `ripple` prop (`rg -n "ripple=" src` has no results at commit `b28f23d`), so removal is repo-safe and typecheck will catch drift.

## Steps

1. Remove `useRef`, `useState`, and `useCallback` imports if they become unused; retain only the React import needed by the component.
2. Remove `ripple` from `ButtonProps` and component destructuring.
3. Remove `btnRef`, `showRipple`, `hasRipple`, `handleClick`, and ripple coordinate/timer logic.
4. Remove the ripple `<span>` block and the conditional `overflow` style used only by it.
5. Remove inline normal `transform` and the `onMouseDown`, `onMouseUp`, and transform reset in `onMouseLeave`. Keep hover background restoration.
6. Let `{...props}` provide the caller's native `onClick` exactly once; remove the wrapper `onClick` and `ref`.
7. Set the inline transition to the exact target string and add the `.ds-btn:active:not(:disabled)` rule to `src/index.css`.
8. Ensure plan 002's reduced-motion selector neutralizes the press scale while retaining color feedback.

## Boundaries

- Do NOT change button dimensions, variants, loading spinner, icon sizing, disabled state, or hover colors.
- Do NOT add a new ripple implementation, Pointer Events state machine, animation library, timer, or keyframe.
- Do NOT remove the global `@keyframes ripple` in this plan unless `rg -n "ripple" src` proves it is otherwise unused after the component edit; removing that now-dead keyframe is allowed only as cleanup.
- Do NOT add dependencies.
- If a call site begins using the `ripple` prop after commit `b28f23d`, STOP and report before changing the public prop.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm format:check`; all must succeed. Run `rg -n "showRipple|hasRipple|ripple=|setTimeout.*Ripple|onMouseDown|onMouseUp" src/components/ui/Button.tsx` and expect no matches.
- **Feel check**:
  - Press and hold every Button variant: scale feedback begins on pointer-down, not release.
  - Drag outside while held: native `:active` cancellation returns the button cleanly.
  - Rapidly press 5–10 times: every press produces the same immediate response; no timer clears a later press.
  - Activate by keyboard: the action fires once and remains visually stable without a delayed ripple.
  - With reduced motion enabled, press feedback uses existing color/opacity changes and no scale.
  - At 10% playback, transform starts from the current presentation value and settles with the exact `160ms` strong ease-out.
- **Done when**: every pointer press gets immediate, timer-free, retriggerable feedback and no ripple state remains.
