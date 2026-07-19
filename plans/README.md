# MelodyHub animation improvement plans

All plans were authored against commit `b28f23d`. They are implementation specifications only; the audit did not modify application source code.

| Plan | Title | Severity | Status | Dependencies |
| --- | --- | --- | --- | --- |
| [001](001-pause-dither-for-reduced-motion.md) | Pause the dashboard dither when motion is unnecessary | HIGH | DONE | None |
| [003](003-remove-header-route-animation.md) | Remove the repeated route-title entrance animation | MEDIUM | DONE | None |
| [004](004-make-stepper-motion-compositor-safe.md) | Make Stepper motion symmetric and compositor-safe | MEDIUM | DONE | None |
| [005](005-make-button-press-feedback-retriggerable.md) | Make button press feedback immediate and retriggerable | MEDIUM | DONE | None |
| [006](006-animate-toast-lifecycle.md) | Give Toasts a symmetric, interruptible lifecycle | MEDIUM | DONE | None |
| [002](002-replace-global-reduced-motion-kill-switch.md) | Replace the global reduced-motion kill switch with gentle fallbacks | MEDIUM | DONE | 001, 003, 004, 005, 006 |
| [007](007-repair-transition-token-consumers.md) | 修复动画变量的无效调用 | HIGH | DONE | None |
| [008](008-make-menus-origin-aware-and-input-aware.md) | 让菜单从触发器展开并尊重键盘操作 | MEDIUM | DONE | 007 |
| [009](009-give-confirm-dialog-an-exit-transition.md) | 为确认对话框补齐可中断的退出过渡 | MEDIUM | DONE | 007 |

## Recommended execution order

1. **001** — fixes the only continuous GPU animation and gives the Canvas a real reduced-motion state.
2. **003** — removes high-frequency route-title movement before the global fallback changes.
3. **004** — supplies Stepper's component-level reduced branch and removes layout animation.
4. **005** — replaces timer/keyframe press feedback and defines its reduced alternative.
5. **006** — adds the Toast lifecycle together with its opacity-only reduced alternative.
6. **002** — run last. It removes the universal `0.001ms` rule only after the selected moving components have explicit reduced-motion behavior.
7. **007** — repair invalid transition-token consumers before enabling or reviewing any additional menu/dialog motion.
8. **008** — replace menu keyframes and center-origin motion after the token repair.
9. **009** — add the React Aria dialog exit lifecycle after the token repair; it may run in parallel with 008.

Plans 001, 003, 004, 005, and 006 are otherwise independent and may be implemented in parallel. Plan 002 must be reviewed against their merged result; do not execute it early.

Plans 008 and 009 both depend on 007. After 007 completes, 008 and 009 are independent and may be implemented in parallel.

## Execution protocol

- Before starting a plan, compare its cited excerpts with the current code. If they have drifted from commit `b28f23d`, stop and refresh the plan rather than improvising.
- Keep each plan in a separate commit when practical so motion regressions can be isolated.
- Run every command in each plan's Verification section.
- Review motion at normal speed and 10% playback, then repeat with `prefers-reduced-motion: reduce` enabled.
- Mark a row `IN PROGRESS`, `DONE`, or `BLOCKED` only after the corresponding source work has actually reached that state.
