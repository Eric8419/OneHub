# 006 — Give Toasts a symmetric, interruptible lifecycle

- **Status**: DONE
- **Commit**: b28f23d
- **Severity**: MEDIUM
- **Category**: Missed opportunity, spatial consistency
- **Estimated scope**: 2 files, about 80 lines including tests

## Problem

`src/components/ui/Toast.tsx:15-20` removes notifications directly from state after three seconds:

```tsx
// src/components/ui/Toast.tsx:15-20 — current
export function toast(message: string, type: ToastType = 'info') {
  const id = ++_toastId;
  _setToasts?.(prev => [...prev, { id, message, type }]);
  setTimeout(() => {
    _setToasts?.(prev => prev.filter(t => t.id !== id));
  }, 3000);
}
```

The container returns `null` while empty and maps plain divs when populated at `src/components/ui/Toast.tsx:23-65`:

```tsx
// src/components/ui/Toast.tsx:23-65 — current
if (toasts.length === 0) return null;

return (
  <div style={{ position: 'fixed', bottom: 24, right: 24 }}>
    {toasts.map(t => (
      <div key={t.id} className="ds-notif ds-notif--simple">
        {/* message and close button */}
      </div>
    ))}
  </div>
);
```

New status feedback teleports into the bottom-right corner and disappears with no spatial bridge. This is occasional, causal feedback, so a short symmetric entrance/exit improves comprehension without slowing work.

## Target

Keep `ToastContainer` mounted, wrap items in `AnimatePresence`, and make each item a `motion.div`. Enter and exit along the same bottom-edge path:

```tsx
// target motion values
const normalInitial = {
  opacity: 0,
  transform: 'translateY(100%) scale(0.97)',
};
const settled = {
  opacity: 1,
  transform: 'translateY(0%) scale(1)',
};
const normalExit = normalInitial;
const reducedHidden = {
  opacity: 0,
  transform: 'translateY(0%) scale(1)',
};
const toastTransition = {
  duration: 0.2,
  ease: [0.23, 1, 0.32, 1] as const,
};
```

```tsx
// target structure
const shouldReduceMotion = useReducedMotion();

<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  style={{
    // retain current fixed layout
    pointerEvents: 'none',
  }}
>
  <AnimatePresence initial={false}>
    {toasts.map(t => (
      <motion.div
        key={t.id}
        initial={shouldReduceMotion ? reducedHidden : normalInitial}
        animate={settled}
        exit={shouldReduceMotion ? reducedHidden : normalExit}
        transition={toastTransition}
        style={{ pointerEvents: 'auto', /* retain current visuals */ }}
      >
        {/* retain message and close button */}
      </motion.div>
    ))}
  </AnimatePresence>
</div>
```

The state-removal timer remains `3000ms`; AnimatePresence owns the subsequent `200ms` visual exit. Manual close follows the same exit path. Multiple toasts remain independently keyed and can enter/exit concurrently without `mode="wait"`.

## Repo conventions to follow

- The project already uses `motion/react`; import `motion`, `AnimatePresence`, and `useReducedMotion` from it.
- Use full `transform` strings rather than Motion `x`/`y`/`scale` shorthands.
- Entrance/exit uses the audit-prescribed strong ease-out exactly: `cubic-bezier(0.23, 1, 0.32, 1)`, represented as `[0.23, 1, 0.32, 1]`.
- Use `scale(0.97)`, never `scale(0)`.
- Reduced motion keeps the same `200ms` opacity transition but removes translation and scaling.

## Steps

1. Import `motion`, `AnimatePresence`, and `useReducedMotion` in `Toast.tsx`.
2. Remove the early `return null`; the lightweight fixed container must remain mounted so `AnimatePresence initial={false}` can animate the first toast added later.
3. Read `useReducedMotion()` once inside `ToastContainer` and define the exact normal/reduced motion objects above outside render or as stable constants.
4. Add `pointerEvents: 'none'` to the container and `pointerEvents: 'auto'` to each toast so the empty mounted container cannot intercept input.
5. Wrap the map in `<AnimatePresence initial={false}>` with no `mode="wait"`.
6. Convert each toast item to `motion.div` and apply the exact initial/animate/exit/transition values above. Preserve all existing colors, spacing, typography, shadow, role, live-region attributes, and close behavior.
7. Add `aria-label="关闭通知"` to the close button while touching the element so the test and assistive technology can identify it.
8. Add `src/components/ui/Toast.test.tsx` with fake timers covering: toast appears after calling `toast`, automatic removal begins after `3000ms` and completes after the exit, manual close uses the same lifecycle, two rapid toasts remain independently keyed, and reduced motion uses no translated/scaled hidden state.

## Boundaries

- Do NOT change toast duration, copy, colors, placement, z-index, stacking direction, minimum width, or live-region semantics.
- Do NOT add bounce, drag-to-dismiss, sound, or haptics.
- Do NOT use `mode="wait"`; toasts must not block one another.
- Do NOT animate height, margin, bottom, or right.
- Do NOT add dependencies.
- If the global `_setToasts` API or container structure differs from commit `b28f23d`, STOP and report the drift.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm format:check`; all must exit successfully. The new Toast tests must pass with deterministic fake timers.
- **Feel check**:
  - Trigger success, info, and error toasts: each enters from its own bottom edge and settles in `200ms`.
  - Trigger several toasts rapidly: each appears immediately; no toast waits for another's exit.
  - Let one auto-dismiss and manually close another: both leave along the same path used to enter.
  - At 10% playback, confirm the hidden scale is `0.97`, the toast never appears from zero, and removal does not snap.
  - Toggle reduced motion: toasts fade for `200ms` without translation or scaling, while close interaction still works.
  - Click through empty space around toasts and confirm the mounted container does not block the dashboard.
- **Done when**: automatic and manual Toast lifecycles are symmetric, concurrent, compositor-friendly, and reduced-motion aware.
