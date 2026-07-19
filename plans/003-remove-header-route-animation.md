# 003 — Remove the repeated route-title entrance animation

- **Status**: DONE
- **Commit**: b28f23d
- **Severity**: MEDIUM
- **Category**: Purpose and frequency
- **Estimated scope**: 1 file, about 10 lines removed

## Problem

Every route title change increments a key and deliberately remounts the heading in `src/components/shell/Header.tsx:19-24`:

```tsx
// src/components/shell/Header.tsx:19-24 — current
const [titleKey, setTitleKey] = useState(0);

// Trigger title animation on title change
useEffect(() => {
  setTitleKey((k) => k + 1);
}, [title]);
```

The remounted title then plays a `320ms` translate/scale/blur entrance on every core navigation in `src/components/shell/Header.tsx:78-94`:

```tsx
// src/components/shell/Header.tsx:78-94 — current
{/* Page title with blur-in animation */}
<h1
  key={titleKey}
  className="ds-shell__page-title"
  // ...
  style={{
    // ...
    animation: 'rbEnter 320ms var(--ease-out-expo) both',
    flex: 1,
  }}
>
```

Sidebar navigation is a frequent functional action. Replaying an entrance longer than the standard `300ms` UI budget makes route changes feel staged and adds blur work without improving orientation.

## Target

Render the title directly with no remount and no entrance animation:

```tsx
// target
{/* Page title */}
<h1
  className="ds-shell__page-title"
  data-tauri-drag-region
  style={{
    // retain every typography/layout property
    flex: 1,
    minWidth: 0,
    WebkitUserSelect: 'none',
  }}
>
  {title}
</h1>
```

The heading should update on the same React commit as the route. No crossfade, translate, scale, blur, keyframe, or timer replaces the removed effect.

## Repo conventions to follow

- Keep the existing platform typography, truncation, drag-region behavior, and layout styles untouched.
- High-frequency navigation is intentionally immediate. This plan does not introduce a replacement token.
- `useEffect` remains required by the menu outside-click and Escape handlers later in the same file; do not remove it from the React import.

## Steps

1. Remove `titleKey` state and the title-change effect from `Header.tsx`.
2. Remove `key={titleKey}` from the `<h1>`.
3. Change the comment from “Page title with blur-in animation” to “Page title”.
4. Remove only the `animation` style declaration; preserve every other heading style.
5. Do not delete the shared `rbEnter` keyframe because `AnimatedContent` still uses it elsewhere.

## Boundaries

- Do NOT add a page-level route transition or animate `<Outlet>`.
- Do NOT alter sidebar active-state color transitions.
- Do NOT change header dimensions, typography, menu behavior, or window controls.
- Do NOT remove `rbEnter` from `src/index.css`.
- If the title no longer uses `titleKey` or `rbEnter` at commit `b28f23d`, STOP and report the drift.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, and `pnpm test`; all must exit successfully. Run `rg -n "titleKey|Page title with blur|animation: 'rbEnter" src/components/shell/Header.tsx` and expect no matches.
- **Feel check**: run the app and switch rapidly among Dashboard, Providers, Models, and Settings:
  - The title changes immediately without vertical travel, scaling, blur, or flash.
  - The heading remains aligned and truncated exactly as before.
  - The avatar menu, drag region, and platform window controls still work.
  - At 10% DevTools animation playback speed, route changes create no header-title animation.
- **Done when**: route title changes are immediate and the title node is no longer deliberately remounted.
