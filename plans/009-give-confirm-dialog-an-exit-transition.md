# 009 — 为确认对话框补齐可中断的退出过渡

- **Status**: DONE
- **Commit**: b28f23d
- **Severity**: MEDIUM
- **Category**: Interruptibility, spatial consistency
- **Estimated scope**: 3 files, about 70 lines including tests

## Problem

`ConfirmDialog` 由 `isOpen` 控制生命周期，但只声明进入关键帧：

```tsx
// src/components/ui/ConfirmDialog.tsx:26-55 — current
<ModalOverlay
  className="ds-confirm-overlay"
  isOpen={open}
  style={{
    background: 'var(--bg-overlay-l4)',
    animation: 'fadeIn var(--transition-fast, 0.12s) ease',
  }}
>
  <Modal
    className="ds-confirm-dialog"
    style={{
      // ...
      animation: 'scaleIn var(--transition-normal, 0.2s) ease',
    }}
  >
```

关闭时没有 exit 状态，组件会直接消失；关键帧也无法在快速打开/关闭时从当前视觉状态反向。

## Target

使用 React Aria Components 已提供的 `[data-entering]` 和 `[data-exiting]` 生命周期属性，不增加本地 mounted 状态或定时器。

```css
/* target */
.ds-confirm-overlay {
  opacity: 1;
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.ds-confirm-overlay[data-entering],
.ds-confirm-overlay[data-exiting] {
  opacity: 0;
}

.ds-confirm-overlay[data-exiting] {
  transition-duration: 160ms;
}

.ds-confirm-dialog {
  opacity: 1;
  transform: scale(1);
  transform-origin: center;
  transition:
    opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.ds-confirm-dialog[data-entering],
.ds-confirm-dialog[data-exiting] {
  opacity: 0;
  transform: scale(0.95);
}

.ds-confirm-dialog[data-exiting] {
  transition-duration: 160ms;
}
```

- 进入：`200ms cubic-bezier(0.23, 1, 0.32, 1)`。
- 退出：更快的 `160ms cubic-bezier(0.23, 1, 0.32, 1)`。
- Modal 保持中心原点；它不是锚定弹层。
- 减少动态效果：overlay 和 dialog 仅执行 `opacity 200ms ease`，dialog 不缩放。

## Repo conventions to follow

- 复用现有 `.ds-confirm-overlay` 和 `.ds-confirm-dialog` 类，不新增动画库。
- `src/components/ui/Toast.tsx:71-79` 是项目中已实现对称进入/退出和 reduced-motion 分支的生命周期参考。
- 保留 React Aria 的 `ModalOverlay`、`Modal`、`Dialog` 结构和焦点管理。

## Steps

1. 从 `ConfirmDialog.tsx` 的 overlay 和 modal inline style 中删除两个 `animation` 声明。
2. 在 `src/index.css` 加入上面的精确 base、entering、exiting 样式。
3. 删除只在 ConfirmDialog 使用且确认无其他调用的旧 `fadeIn`/`scaleIn` keyframe；如果仍有其他调用则保留定义，只移除本组件引用。
4. 更新 `prefers-reduced-motion`：`.ds-confirm-overlay` 和 `.ds-confirm-dialog` 使用 `opacity 200ms ease`；dialog 的 entering/exiting transform 必须为 `none`。
5. 新增 `src/components/ui/ConfirmDialog.test.tsx`，覆盖打开、取消、Escape/overlay dismissal、退出期间仍挂载、transition 完成后卸载，以及 reduced-motion 无 scale。
6. 快速把 `open` 从 true→false→true，确认 React Aria 能从当前 transition 状态反向，不会闪烁或重复挂载焦点目标。

## Boundaries

- Do NOT change dialog dimensions, copy, colors, shadow, buttons, autofocus rules, dismissal semantics, or z-index.
- Do NOT add timers, manual mounted state, AnimatePresence, or new dependencies.
- Do NOT move the modal transform origin away from center.
- Do NOT use keyframes or `scale(0)`.
- Plan 007 must be applied first; if the transition-token cleanup has not landed, STOP.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm format:check`; all must succeed.
- Run `rg -n "animation:.*(fadeIn|scaleIn)" src/components/ui/ConfirmDialog.tsx` and expect no matches.
- **Feel check**:
  - Open a normal and danger confirmation dialog: overlay fades and centered panel scales from `0.95` over `200ms`.
  - Cancel, confirm, press Escape, and click the overlay: every dismissal uses the same `160ms` exit.
  - Reopen during exit: the transition reverses from its current state without snapping.
  - At 10% playback, overlay/panel opacity stay synchronized and the modal remains centered.
  - With reduced motion enabled, both layers fade for `200ms` with no scale movement.
- **Done when**: every confirmation dialog has a symmetric lifecycle, faster exit, interruptible reversal, and opacity-only reduced-motion behavior.
