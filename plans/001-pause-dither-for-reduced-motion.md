# 001 — Pause the dashboard dither when motion is unnecessary

- **Status**: DONE
- **Commit**: b28f23d
- **Severity**: HIGH
- **Category**: Performance, accessibility
- **Estimated scope**: 2 files, about 20 lines

## Problem

`src/pages/Dashboard/ProxyControl.tsx:153-180` keeps the WebGL dither moving even when the proxy is stopped, and it never passes the component's existing `disableAnimation` control:

```tsx
// src/pages/Dashboard/ProxyControl.tsx:153-180 — current
const ditherWaveSpeed = running ? 0.4 : 0.08;
const ditherWaveAmp = running ? 0.3 : 0.12;

<Dither
  waveColor={[1, 1, 1]}
  colorNum={4}
  pixelSize={2}
  waveSpeed={ditherWaveSpeed}
  waveFrequency={3}
  waveAmplitude={ditherWaveAmp}
  enableMouseInteraction={running}
  mouseRadius={0.3}
/>
```

`src/components/ui/Dither.tsx:245-267` still registers a `useFrame` callback, while `src/components/ui/Dither.tsx:329-347` leaves the Canvas on its default continuous render loop. Freezing the time uniform alone therefore does not stop continuous GPU work:

```tsx
// src/components/ui/Dither.tsx:245-250,329-347 — current
useFrame(({ clock }) => {
  const u = waveUniformsRef.current;
  if (!disableAnimation) {
    u.time.value = clock.getElapsedTime();
  }
  // ...
});

<Canvas
  className="dither-container"
  camera={{ position: [0, 0, 6] }}
  dpr={1}
  gl={{ antialias: true, alpha: true }}
  style={{ width: '100%', height: '100%' }}
>
```

CSS `prefers-reduced-motion` rules cannot stop this shader clock. The always-visible dashboard therefore continues moving and rendering for users who explicitly requested less motion.

## Target

- Read reduced-motion through Motion's existing `useReducedMotion()` hook in `ProxyControl`.
- Freeze the dither when either the proxy is stopped or reduced motion is active.
- Disable pointer-driven shader changes whenever the dither is frozen.
- Change the Canvas to demand rendering while frozen so it renders the static frame but does not run continuously.

```tsx
// target in ProxyControl.tsx
const shouldReduceMotion = useReducedMotion();
const freezeDither = !running || Boolean(shouldReduceMotion);

<Dither
  // existing visual props stay unchanged
  disableAnimation={freezeDither}
  enableMouseInteraction={running && !shouldReduceMotion}
/>
```

```tsx
// target in Dither.tsx
<Canvas
  frameloop={disableAnimation ? 'demand' : 'always'}
  // retain the existing camera, dpr, gl, className, and style props
>
```

This plan intentionally keeps the current static dither artwork. It changes activity, not the visual design.

## Repo conventions to follow

- The app already depends on `motion` and imports `motion`/`AnimatePresence` from `motion/react` in `src/pages/Dashboard/ProxyControl.tsx:2`; extend that import with `useReducedMotion` rather than adding a hook or dependency.
- `DitherProps.disableAnimation` already exists at `src/components/ui/Dither.tsx:25` and is forwarded to `DitheredWaves`; reuse it.
- `src/components/ui/ReactBits.tsx:235-248` is the local exemplar for responding live to `prefers-reduced-motion` changes.

## Steps

1. In `src/pages/Dashboard/ProxyControl.tsx`, add `useReducedMotion` to the existing `motion/react` import and call it once inside `ProxyControl`.
2. Define `freezeDither = !running || Boolean(shouldReduceMotion)` next to the existing dither speed/amplitude values.
3. Pass `disableAnimation={freezeDither}` and change `enableMouseInteraction` to `running && !shouldReduceMotion`.
4. In `src/components/ui/Dither.tsx`, set Canvas `frameloop` to `'demand'` when `disableAnimation` is true and `'always'` otherwise.
5. Do not remove the `useFrame` callback; it is still needed in the active state and will stop being scheduled by demand mode.

## Boundaries

- Do NOT remove the dither background or change its colors, frequency, amplitude, pixel size, or postprocessing effect.
- Do NOT alter other ProxyControl animations; permanent pulse removal is a separate finding not selected for this plan.
- Do NOT add dependencies or create another reduced-motion hook.
- If the cited props or Canvas structure differ from commit `b28f23d`, STOP and report the drift.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, and `pnpm test`; all must exit successfully.
- **Feel check**: run `pnpm dev`, open the dashboard, and confirm:
  - Running proxy + normal motion: the dither moves and follows the pointer exactly as before.
  - Stopped proxy: the existing static dither remains visible but does not advance.
  - DevTools Rendering → Emulate `prefers-reduced-motion: reduce`: the dither freezes immediately and pointer movement no longer changes it.
  - Switch reduced motion back off while the proxy is running: animation resumes without remounting or flashing.
  - In the Performance panel, record five seconds in stopped/reduced mode and confirm there is no continuous React Three Fiber render loop.
- **Done when**: the dither renders continuously only while the proxy is running and reduced motion is not requested.
