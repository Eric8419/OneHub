# 008 — 让菜单从触发器展开并尊重键盘操作

- **Status**: DONE
- **Commit**: b28f23d
- **Severity**: MEDIUM
- **Category**: Physicality, purpose, interruptibility
- **Estimated scope**: 3 files, about 100 lines plus focused tests

## Problem

通用下拉框可通过键盘打开：

```tsx
// src/components/ui/Dropdown.tsx:142-148 — current
if (!open) {
  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    setOpen(true);
  }
  return;
}
```

弹层却无条件使用中心原点关键帧：

```tsx
// src/components/ui/Dropdown.tsx:315-339 — current
{open && popupRect && createPortal(
  <div
    className="ds-dropdown__popup"
    style={{
      position: 'fixed',
      top: popupRect.top,
      left: popupRect.left,
      animation: 'dsDropdownIn var(--transition-fast) ease',
    }}
  >
```

```css
/* src/index.css:697-701 — current */
@keyframes dsDropdownIn {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

Header 菜单同样允许 Enter/Space 打开，但没有触发器原点，并且键盘与指针共用位移动画：

```tsx
// src/components/shell/Header.tsx:104-160 — current
onClick={() => setMenuOpen(!menuOpen)}
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    setMenuOpen(!menuOpen);
  }
}}
// ...
transform: menuOpen ? 'translateY(0)' : 'translateY(-4px)',
transition: 'opacity var(--transition-fast, 0.12s) ease, transform var(--transition-fast, 0.12s) ease',
```

## Target

- 指针打开时，下拉框从触发器的 `top left` 展开；Header 菜单从头像的 `top right` 展开。
- Enter、Space、ArrowDown 打开以及 Escape 关闭必须立即完成，不播放位移或缩放。
- 指针打开/关闭使用 CSS transition，可从当前值反向，而不是重启 keyframe。
- 下拉框进入和退出都使用 `160ms cubic-bezier(0.23, 1, 0.32, 1)`。
- 隐藏状态使用 `translateY(-4px) scale(0.97)` 和 `opacity: 0`，绝不使用 `scale(0)`。
- 减少动态效果时只保留 `200ms ease` 透明度变化，不产生位移或缩放。

```css
/* target CSS */
.ds-dropdown__popup {
  opacity: 1;
  transform: translateY(0) scale(1);
  transform-origin: top left;
}

.ds-dropdown__popup[data-motion="true"] {
  transition:
    opacity 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.ds-dropdown__popup[data-open="false"] {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
  pointer-events: none;
}

@starting-style {
  .ds-dropdown__popup[data-motion="true"][data-open="true"] {
    opacity: 0;
    transform: translateY(-4px) scale(0.97);
  }
}
```

## Repo conventions to follow

- 使用 `src/index.css:49` 已有的强 ease-out 性格，但目标曲线必须严格采用审计值 `cubic-bezier(0.23, 1, 0.32, 1)`。
- 下拉框继续使用现有 portal、定位计算、筛选、列表语义和键盘导航。
- Header 菜单已经常驻 DOM，可直接通过 CSS transition 反向，不要增加动画库。

## Steps

1. 在 `Dropdown.tsx` 增加独立的 `renderPopup` 与 `motionEnabled` 状态；`open` 表示视觉开闭，`renderPopup` 负责让退出过渡完成后再卸载。
2. 将所有打开路径收敛到一个 helper：指针点击传入 `true`，Enter/Space/ArrowDown 传入 `false`。键盘路径不得继承上一次指针打开的 motion 状态。
3. 将所有关闭路径收敛到一个 helper：Escape 传入 `false`；指针选择、触发器点击和外部指针关闭传入 `true`。无动画关闭应立即清理 portal；动画关闭应等待自身 `opacity` transition end。
4. 定位 effect 在 `renderPopup` 为真时维持 portal 的位置；退出结束后再设置 `renderPopup=false` 和 `popupRect=null`。
5. Portal 条件改为 `renderPopup && popupRect`，添加 `data-open={open}`、`data-motion={motionEnabled}` 和严格限定在当前元素 `opacity` 属性上的 `onTransitionEnd` 清理。
6. 删除 `dsDropdownIn` keyframe 和 inline `animation`；加入上面的目标 CSS。
7. Header 增加 `menuMotionEnabled`。指针点击先设为 `true`；Enter/Space/Escape 先设为 `false`。
8. Header 菜单设置 `transformOrigin: 'top right'`；指针隐藏态为 `translateY(-4px) scale(0.97)`，键盘路径的 transition 为 `none`。
9. 扩展 `prefers-reduced-motion`：下拉框和 Header 菜单不得位移或缩放，只允许 `opacity 200ms ease`。
10. 新增聚焦测试，覆盖指针打开有 motion、键盘打开无 motion、Escape 无 motion、快速反向不会提前卸载、transition end 后清理 portal，以及两个菜单的 transform origin。

## Boundaries

- Do NOT change option filtering, selection, focus, aria roles, portal z-index, popup geometry, or copy.
- Do NOT add Motion/Framer Motion to these menus.
- Do NOT use timers to guess transition completion.
- Do NOT animate keyboard-initiated open or close.
- Do NOT use keyframes or `scale(0)`.
- Plan 007 must be applied first; if transition tokens still produce duplicate easing functions, STOP.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm format:check`; all must succeed.
- Run `rg -n "dsDropdownIn|animation:.*Dropdown" src` and expect no matches.
- **Feel check**:
  - Click both menus: each grows subtly from its trigger in `160ms`.
  - Press Enter/Space/ArrowDown: content appears immediately with no movement.
  - Press Escape: content closes immediately and focus behavior remains unchanged.
  - Click rapidly during an in-progress transition: motion reverses from the current visual state without restarting.
  - At 10% playback, hidden scale is exactly `0.97`; the Header origin is top-right and Dropdown origin is top-left.
  - With reduced motion enabled, only opacity changes for `200ms`.
- **Done when**: pointer motion is origin-aware and interruptible, while every keyboard path remains instant.
