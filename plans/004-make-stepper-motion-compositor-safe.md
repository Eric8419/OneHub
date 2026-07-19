# 004 — Make Stepper motion symmetric and compositor-safe

- **Status**: DONE
- **Commit**: b28f23d
- **Severity**: MEDIUM
- **Category**: Performance, physicality, accessibility
- **Estimated scope**: 2 files, about 60 lines

## Problem

`src/components/ui/Stepper.tsx:169-173` springs the container's `height`, forcing layout on every animation frame:

```tsx
// src/components/ui/Stepper.tsx:169-173 — current
<motion.div
  className={className}
  style={{ position: 'relative', overflow: 'hidden' }}
  animate={{ height: isCompleted ? 0 : parentHeight }}
  transition={{ type: 'spring', duration: 0.4 }}
>
```

`src/components/ui/Stepper.tsx:205-234` uses Motion's `x` shorthand and asymmetric paths. Advancing enters from `-100%` but exits toward `50%`; reversing has the mirrored mismatch:

```tsx
// src/components/ui/Stepper.tsx:205-234 — current
<motion.div
  variants={stepVariants}
  initial="enter"
  animate="center"
  exit="exit"
  transition={{ duration: 0.4 }}
>

const stepVariants = {
  enter: (dir: number) => ({
    x: dir >= 0 ? '-100%' : '100%',
    opacity: 0,
  }),
  center: { x: '0%', opacity: 1 },
  exit: (dir: number) => ({
    x: dir >= 0 ? '50%' : '-50%',
    opacity: 0,
  }),
};
```

The connector also animates layout width in `src/components/ui/Stepper.tsx:286-300`:

```tsx
const lineVariants = {
  incomplete: { width: '0%', backgroundColor: 'transparent' },
  complete: { width: '100%', backgroundColor: 'var(--bg-brand)' },
};
```

The component has no `useReducedMotion` branch, so Add/Edit Provider always performs full-width travel.

## Target

- Stop tweening container height; measure it as today, then commit the resulting height directly.
- Animate only full `transform` strings and opacity.
- For next: old content exits left `-100%`, new content enters from right `100%`.
- For back: old content exits right `100%`, new content enters from left `-100%`.
- Use `250ms` with `cubic-bezier(0.77, 0, 0.175, 1)` for normal on-screen movement.
- Reduced motion uses `opacity` only for `200ms ease`; no horizontal movement or scale.
- Replace connector width animation with `scaleX` from a fixed `width: 100%` and `transform-origin: left`.

```tsx
// target variants
const stepVariants = {
  enter: ({ direction, reduced }: TransitionContext) => ({
    transform: reduced
      ? 'translateX(0%)'
      : `translateX(${direction >= 0 ? '100%' : '-100%'})`,
    opacity: 0,
  }),
  center: { transform: 'translateX(0%)', opacity: 1 },
  exit: ({ direction, reduced }: TransitionContext) => ({
    transform: reduced
      ? 'translateX(0%)'
      : `translateX(${direction >= 0 ? '-100%' : '100%'})`,
    opacity: 0,
  }),
};

const normalTransition = {
  duration: 0.25,
  ease: [0.77, 0, 0.175, 1] as const,
};
const reducedTransition = { duration: 0.2, ease: 'easeOut' as const };
```

```tsx
// target connector
const lineVariants = {
  incomplete: {
    transform: 'scaleX(0)',
    backgroundColor: 'transparent',
  },
  complete: {
    transform: 'scaleX(1)',
    backgroundColor: 'var(--bg-brand)',
  },
};
```

```css
/* target in Stepper.css */
.rb-stepper-connector-inner {
  width: 100%;
  transform-origin: left center;
}
```

## Repo conventions to follow

- Extend the existing `motion/react` import with `useReducedMotion`; do not create another media-query hook.
- The strong movement curve must be exactly `cubic-bezier(0.77, 0, 0.175, 1)`, represented in Motion as `[0.77, 0, 0.175, 1]`.
- `AnimatePresence initial={false} mode="sync"` is appropriate for simultaneous symmetric enter/exit and should remain.
- `src/components/ui/Stepper.css:130-146` already provides an overflow-hidden fixed connector track; reuse it for `scaleX`.

## Steps

1. Import `useReducedMotion` and read it inside `StepContentWrapper` and `StepConnector`, or read it once in `Stepper` and explicitly thread the boolean down. Do not call `matchMedia` manually.
2. Replace the animated container height with a normal `div` or a `motion.div` that receives `height` through `style` only: `height: isCompleted ? 0 : parentHeight`. Remove its spring.
3. Pass `{ direction, reduced: Boolean(shouldReduceMotion) }` as the AnimatePresence/variant custom value.
4. Replace all `x` shorthand values with the exact symmetric full-transform variants above.
5. Apply the normal `250ms` strong ease-in-out transition or the reduced `200ms` opacity-only transition based on `useReducedMotion`.
6. Give the connector inner element fixed `width: 100%` and `transform-origin: left center`; replace animated width with full `transform: scaleX(...)` values.
7. In reduced mode, connector completion may change color over `200ms ease`, but it must not visibly grow across the track.
8. Add focused tests in `src/components/ui/Stepper.test.tsx` covering Next and Back direction and the reduced-motion branch. Mock Motion reduced preference using the project's test environment rather than changing production APIs.

## Boundaries

- Do NOT change step validation, callbacks, labels, form fields, footer navigation, or completion semantics.
- Do NOT animate `height`, `width`, `left`, `right`, `top`, `margin`, or `padding`.
- Do NOT introduce bounce; this is a form workflow, not a momentum gesture.
- Do NOT add dependencies.
- If the direction state or cited variant block differs from commit `b28f23d`, STOP and report the drift.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm format:check`; all must succeed. Run `rg -n "animate=\\{\\{ height|x:|width: '0%'|width: '100%'" src/components/ui/Stepper.tsx` and confirm no animated layout/shorthand matches remain.
- **Feel check**: open Add Provider and Edit Provider:
  - Next sends the old step left and brings the new step from the right along the same path.
  - Back mirrors that path exactly.
  - Rapid Next/Back input never produces a half-distance exit or a jump from the wrong side.
  - At 10% playback, movement lasts `250ms` and both pages remain spatially coherent.
  - With reduced motion enabled, steps crossfade for `200ms` without horizontal travel; connector state remains legible without growing motion.
  - Record a Performance trace and confirm step/connector animations do not continuously invalidate layout.
- **Done when**: Stepper animates only transform/opacity, uses symmetric direction paths, and provides an opacity-only reduced-motion equivalent.
