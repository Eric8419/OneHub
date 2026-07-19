# 007 — 修复动画变量的无效调用

- **Status**: DONE
- **Commit**: b28f23d
- **Severity**: HIGH
- **Category**: Cohesion, easing
- **Estimated scope**: 18 files, mechanical transition-string cleanup

## Problem

`src/index.css:46-48` 把时长和缓动定义在同一个复合变量中：

```css
/* src/index.css:46-48 — current */
--transition-fast: 0.12s ease;
--transition-normal: 0.2s ease;
--transition-slow: 0.3s ease;
```

但是调用方又在变量后追加 `ease`。例如：

```css
/* src/index.css:319 — current */
transition: background var(--transition-normal, 0.2s) ease, color var(--transition-normal, 0.2s) ease;
```

```tsx
// src/components/shell/Header.tsx:160 — current
transition: 'opacity var(--transition-fast, 0.12s) ease, transform var(--transition-fast, 0.12s) ease',
```

```tsx
// src/components/ui/Dropdown.tsx:338 — current
animation: 'dsDropdownIn var(--transition-fast) ease',
```

变量替换后会得到 `opacity 0.12s ease ease`，浏览器会丢弃整条无效声明。当前受影响的位置如下：

- `src/index.css:319`
- `src/components/shell/Header.tsx:124,160,181,216`
- `src/components/shell/Sidebar.tsx:258`
- `src/components/ui/ConfirmDialog.tsx:39,54,105,133`
- `src/components/ui/Dropdown.tsx:338`
- `src/components/ui/Stepper.css:48-49,71-72`
- `src/pages/Dashboard/ModelDonutChart.tsx:175,187,196,224`
- `src/pages/Dashboard/ProxyControl.tsx:470,575`
- `src/pages/Dashboard/RecentRequests.tsx:140,180,197,213`
- `src/pages/Dashboard/TimeRangeTabs.tsx:50`
- `src/pages/ModelConfig/AggregationTable.tsx:94,146,158,170,181`
- `src/pages/ModelConfig/ModelInventory.tsx:340`
- `src/pages/ModelConfig/QuickAddPanel.tsx:84,109,147`
- `src/pages/Providers/AddProviderPage.tsx:118,408`
- `src/pages/Providers/EditProviderPage.tsx:59,341`
- `src/pages/Providers/ProviderCard.tsx:89,109,119,150,171,192,213,272,354,363,378`
- `src/pages/Providers/ProviderDetailPage.tsx:115`
- `src/pages/Providers/ProviderForm.tsx:133,161`

## Target

保留现有复合变量及其现有消费者，只修复重复缓动。使用以下精确转换：

```text
var(--transition-fast, 0.12s) ease   -> var(--transition-fast, 0.12s ease)
var(--transition-normal, 0.2s) ease -> var(--transition-normal, 0.2s ease)
var(--transition-slow, 0.3s) ease   -> var(--transition-slow, 0.3s ease)
var(--transition-fast) ease         -> var(--transition-fast)
var(--transition-normal) ease       -> var(--transition-normal)
var(--transition-slow) ease         -> var(--transition-slow)
```

目标示例：

```css
transition: background var(--transition-normal, 0.2s ease), color var(--transition-normal, 0.2s ease);
```

```tsx
transition: 'opacity var(--transition-fast, 0.12s ease), transform var(--transition-fast, 0.12s ease)',
```

```tsx
animation: 'dsDropdownIn var(--transition-fast)',
```

## Repo conventions to follow

- `src/components/ui/Button.tsx:63` 已正确直接使用复合变量：`background var(--transition-fast)`。
- `src/index.css:448-452` 已正确直接使用复合变量：`transform var(--transition-normal)`。
- 本计划不重命名变量，也不把变量拆分为时长和曲线两个新系统。

## Steps

1. 在上面列出的 18 个文件中应用六条精确字符串转换。
2. 保持 `src/index.css:46-48` 的变量值不变。
3. 重新搜索所有 `--transition-fast/normal/slow` 调用，逐条确认每个属性只解析出一个 timing function。
4. 不顺手改变持续时间、属性列表、动画关键帧或视觉样式。

## Boundaries

- Do NOT change `--transition-fast`, `--transition-normal`, or `--transition-slow` definitions.
- Do NOT fix the existing `transition: all` in `QuickAddPanel.tsx`; that is a separate performance finding.
- Do NOT change animation durations or introduce new easing tokens.
- Do NOT alter markup, component behavior, or dependencies.
- If the listed token definitions differ from commit `b28f23d`, STOP and report the drift.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm format:check`; all must succeed.
- Run `rg -n "var\\(--transition-(fast|normal|slow),?[^)]*\\) ease" src` and expect no matches.
- Run `rg -n "--transition-(fast|normal|slow)" src/index.css` and confirm the three original composite values remain unchanged.
- **Feel check**: hover buttons, sidebar items, table rows, provider-card actions, and dashboard pagination; color/background feedback should now transition rather than snap.
- In DevTools, inspect representative computed `transition` values and confirm the duration is `0.12s` or `0.2s`, not `0s`.
- Toggle `prefers-reduced-motion`; component-specific reduced rules must still win where present.
- **Done when**: no consumer produces a duplicate timing function and previously invalid transitions parse successfully.
