# 供应商编辑页重做 & 模型批量参数编辑 设计文档

**日期**: 2026-07-22
**状态**: 待审核

## 概述

本设计包含两个相关改进：

1. **供应商编辑页面重做**：将当前复用新增页面的步骤式向导改为标签页式布局，使编辑操作更直观、高效，支持实时自动保存。
2. **模型批量参数编辑**：在模型详情页增加批量编辑功能，可以统一配置同一对外暴露模型在所有供应商中的能力参数和数值参数。

---

## 第一部分：供应商编辑页面重做

### 1.1 现状问题

当前 `EditProviderPage.tsx` 直接复用了 `AddProviderPage.tsx` 的 Stepper 步骤式布局（4步流程：凭证→模型→测试→完成），存在以下问题：
- 编辑已有供应商时不需要重新走添加流程，步骤式导航增加了不必要的点击
- 修改某个部分需要在步骤间来回切换
- 无法随时测试连接，必须跳到第3步
- 模型编辑区域信息密度低，卡片式布局占用空间大

### 1.2 页面结构

采用**固定头部 + 顶部标签页**布局：

```
┌─────────────────────────────────────────────────────────────────┐
│ ←  [Logo] [供应商名称输入]        ● 已连接  [测试连接] [删除] [保存]│ ← 固定头部
├─────────────────────────────────────────────────────────────────┤
│ [基本信息]  [模型管理]  [模型映射]  [代理设置]                      │ ← 标签页导航
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     当前标签页内容区域                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 固定头部（始终可见）

| 元素 | 说明 |
|------|------|
| 返回按钮 | 返回 `/providers` 供应商列表页 |
| ProviderLogo + 名称输入 | 内联可编辑的供应商名称，直接在头部修改 |
| 连接状态指示 | 绿色圆点=已连接，黄色=未测试/配置中，红色=连接失败；hover显示详情 |
| 测试连接按钮 | 随时可点击，不限于特定标签页；点击后显示loading，结果通过toast和状态点反馈 |
| 删除供应商按钮 | 危险操作，点击弹出 ConfirmDialog 二次确认 |
| 保存状态/按钮 | 修改后400ms自动保存；头部显示"所有更改已保存"/"保存中..."状态；手动保存按钮作为备用 |

#### 标签页定义

| 标签 | 内容 |
|------|------|
| 基本信息 | API Base URL、API Key、协议类型、连接状态信息 |
| 模型管理 | 核心编辑区：拉取模型、手动添加、模型表格、批量操作、行展开编辑别名 |
| 模型映射 | 折叠式模型名映射规则编辑器（保留现有逻辑，优化样式） |
| 代理设置 | 独立代理开关 + 代理URL配置 |

### 1.3 基本信息标签页

字段：
- **API Base URL**：文本输入框，带URL格式验证（http/https开头），下方有帮助文字提示"填写完整Base URL（含版本路径，如/v1）"
- **API Key**：password类型输入框，右侧有显示/隐藏切换按钮（Eye/EyeOff图标）；加载时Key字段显示为空（不回显明文），placeholder为"••••••••••••（已设置）"；用户输入新值或清空后才更新；清空时显示警告提示"原有Key已清空，保存后将使用新值"
- **API 协议类型**：Dropdown选择（OpenAI兼容 / Anthropic / Responses），下方有帮助文字
- **连接状态区域**：显示上次连接测试的时间和结果，以及"测试连接"按钮（与头部按钮联动）

注：提供商名称仅在头部内联编辑，基本信息标签页不重复显示。

### 1.4 模型管理标签页（核心）

#### 布局

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 从接口拉取模型  [OpenAI兼容接口会请求/models...]  [拉取模型] │ │ ← 操作栏
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 手动添加模型: [_______________] [+ 添加]                         │
│                                                                 │
│  远程模型chips区（拉取成功后显示）：                               │
│  [+ gpt-4o] [+ gpt-4o-mini] [✓ claude-3-5-sonnet] ...          │
│                                                      [全部加入] │
│                                                                 │
│  已添加模型 (N个)                          [批量设置能力 ▼]       │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 模型名称           上下文   输出  视觉 思考 强度 工具 JSON  │ │ ← 表头
│  ├───────────────────────────────────────────────────────────┤ │
│  │ gpt-4o             128k   16k    🟢   🟢   🟢   🟢  🟢  🗑️│ │ ← 紧凑行
│  │ claude-3-5-sonnet  200k    8k    🟢   🟢   🔴   🟢  🟢  🗑️│ │
│  │ ▼ gpt-4o-mini      128k   16k    🟢   🔴   🔴   🟢  🟢  🗑️│ │ ← 可展开
│  │   别名: [________]  默认思考强度: [中 ▼]                     │ │ ← 展开区
│  │ ...                                                       │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### 交互细节

- **拉取模型栏**：保留现有设计，灰色背景信息条 + 拉取按钮；拉取中按钮显示loading spinner
- **远程模型chips**：保留现有chips样式，点击单个chip添加，"全部加入"按钮一键添加所有；已添加的chip显示✓和disabled状态
- **手动添加**：输入框 + 添加按钮，Enter键快捷添加
- **模型表格**：
  - 表头行有复选框可多选模型
  - 选中模型后，表头右侧出现"批量设置能力"下拉按钮，点击弹出Popover面板（视觉/思考/工具/JSON四个Switch + "应用"按钮），可批量设置能力
  - 每行包含：
    - 展开箭头 + 模型名称（等宽字体输入框，可编辑）
    - 上下文长度（紧凑数字输入框，单位为tokens；输入框右侧以灰色小字显示格式化的"128k"辅助文字）
    - 最大输出（紧凑数字输入框，单位为tokens）
    - 视觉/思考/强度/工具/JSON（Switch组件，直接在表格中切换）
    - 删除按钮（Trash2图标，点击弹出确认）
  - Switch使用项目已有的Switch组件，不是原生checkbox
  - 思考强度Switch默认disabled，当"思考"开启时才可用
  - 点击展开箭头（或双击行）展开详情行：别名输入框、默认思考强度Dropdown
  - 表格主体区域支持滚动（maxHeight 500px）
- **删除模型**：点击🗑️弹出ConfirmDialog确认；如果删除后该模型在供应商中不再存在（即这是该对外模型的最后一个来源），toast提示"已从该供应商移除模型"；如果该模型同时有alias映射，一并清除

#### 批量设置能力

- 多选模型后点击"批量设置能力"，弹出一个小面板/Popover
- 面板内有视觉/思考/工具/JSON四个Switch
- 设置后点击"应用"，将选中的值应用到所有勾选的模型（未操作的Switch保持各模型原值不变）

### 1.5 模型映射标签页

保留当前 [EditProviderPage.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/pages/Providers/EditProviderPage.tsx) 中的折叠面板设计：
- 折叠面板标题显示"模型映射"和副标题，右侧显示已有规则数量
- 展开后显示规则表格：`[逻辑模型名输入] -> [上游模型名输入] [删除按钮]`
- 底部"添加映射规则"虚线按钮
- 样式与新页面整体风格对齐

### 1.6 代理设置标签页

- 使用独立代理开关（Switch），右侧有说明文字"为该提供商单独配置HTTP/SOCKS代理"
- 开关开启时显示代理URL输入框，placeholder为"http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
- 关闭时输入框隐藏

### 1.7 自动保存机制

复用 [SettingsForm.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/pages/Settings/SettingsForm.tsx) 中的 debounced 自动保存模式：
- 所有表单字段修改后，400ms debounce触发 `scheduleAutoSave()`
- 保存状态：
  - "所有更改已保存"（灰色/绿色文字）
  - "保存中..."（旁边显示spinner）
  - "保存失败，点击重试"（红色，可点击重试）
- 切换标签页时如果有未保存的更改，立即flush保存
- 离开页面前如果有正在进行的保存，等待完成或提示用户
- API Key字段特殊处理：不回显完整Key，显示为空或masked；用户清空后才更新

---

## 第二部分：模型详情页批量参数编辑

### 2.1 现状问题

当前 [ModelDetailPage.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/pages/ModelConfig/ModelDetailPage.tsx) 是只读的，只能查看模型的能力概览和来源映射，无法直接编辑参数。如果同一个模型（如gpt-4o）在多个供应商中都有配置，需要分别进入每个供应商的编辑页修改，效率很低。

### 2.2 页面结构

在现有页面基础上，在"能力概览"卡片和"来源映射"卡片之间新增两个区块：**批量设置区** 和 **各来源参数对比表格**。

```
┌─────────────────────────────────────────────────────────────────┐
│ ← 模型配置                                                       │
├─────────────────────────────────────────────────────────────────┤
│ [🤖] gpt-4o                                     5个来源映射      │ ← 保留
├─────────────────────────────────────────────────────────────────┤
│  能力概览 (视觉/思考/工具/JSON/上下文/输出 卡片)                    │ ← 保留
├─────────────────────────────────────────────────────────────────┤
│  批量参数设置                                                     │ ← 新增
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 视觉[−] 思考[−] 强度[−] 工具[−] JSON[−]                   │ │
│  │ 上下文:[____] 最大输出:[____] 默认强度:[▼]                  │ │
│  │                                          [应用到所有来源]  │ │
│  └───────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  各来源参数编辑                                   [重置修改] [保存]│ ← 新增可编辑表格
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 供应商       视觉 思考 强度 工具 JSON 上下文  输出  别名  │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │ OpenAI        🟢   🟢  🟢   🟢  🟢  128k   16k   -      │ │
│  │ Azure        ➖   🟢  🔴   🟢  ➖    -     -    gpt4    │ │
│  │ 聚合适用于    -    -   -    -   -    -      -     -      │ │ ← 聚合行不可编辑
│  └───────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  来源映射 (只读详情)                                              │ ← 保留
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 批量设置区

- 位置：能力概览卡片下方，有标题"批量参数设置"和说明文字"设置要统一修改的参数，未操作的参数保持各来源原值"
- 包含以下控件：
  - **布尔能力开关**（视觉、思考、强度开关、工具调用、JSON模式）：使用扩展的三态Switch组件
    - 初始状态为indeterminate（半选，显示横线"-"）：不修改此参数
    - 用户点击一次变为checked（开启）：将所有来源设为启用
    - 用户再次点击变为unchecked（关闭）：将所有来源设为禁用
    - 再次点击回到indeterminate
  - **数值输入框**（上下文长度、最大输出tokens）：空值表示不修改，placeholder为"不修改"，填入数字则覆盖所有来源
  - **默认思考强度**（Dropdown）：默认选项为"不修改"，选择低/中/高则覆盖所有来源
- **「应用到所有来源」按钮**：点击后将批量设置区的非空/非indeterminate值应用到下方表格的所有可编辑行，标记修改状态但不立即保存到store
- **说明文字**："仅应用于直接/别名来源，不影响聚合路由"

#### Switch组件扩展

现有 [Switch.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/components/ui/Switch.tsx) 仅支持二态（checked/unchecked），需要扩展支持三态：
- 新增 `indeterminate?: boolean` 属性
- 当 `indeterminate=true` 时，忽略 `checked` 值，按钮显示中间状态（背景为 `var(--bg-overlay-l2)`，thumb居中位置，thumb上显示一个小横线"-"）
- 点击时调用方自行处理状态循环（indeterminate → checked → unchecked → indeterminate）
- 二态使用场景（供应商编辑页表格）保持原有行为不变

### 2.4 各来源参数对比表格

- 位置：批量设置区下方
- 表格列定义：

| 列 | 宽度 | 控件类型 | 说明 |
|----|------|----------|------|
| 供应商 | 自适应 | 文字（ProviderLogo + 名称） | 不可编辑 |
| 视觉 | 60px | Switch | — |
| 思考 | 60px | Switch | — |
| 强度开关 | 60px | Switch | disabled when 思考=off |
| 默认强度 | 80px | Dropdown（低/中/高） | disabled when 强度开关=off |
| 工具 | 60px | Switch | — |
| JSON | 60px | Switch | — |
| 上下文 | 90px | 数字输入 | 紧凑样式 |
| 输出 | 90px | 数字输入 | 紧凑样式 |
| 别名 | 100px | 文本输入 | 紧凑，placeholder"留空使用原名" |
| 移除 | 40px | Trash2按钮 | 二次确认后从该供应商移除模型 |

- **数据分组**：
  - 直接/别名来源放在一起（可编辑）
  - 聚合来源放在分隔线下方，标注"聚合路由"，所有控件disabled，显示"-"
  - 聚合来源不可在此页面编辑（聚合路由在聚合规则中管理）

- **不一致状态（indeterminate/mixed）显示规则**：
  - **注意**：这里的"不一致显示"仅用于页面**初次加载时**展示各来源的实际聚合状态，位于批量设置区而非表格内。表格内每行都是二态Switch，显示该行的真实值。
  - 批量设置区Switch（三态）：当所有可编辑行的值一致时显示checked/unchecked；不一致时显示indeterminate（"-"）
  - 数值输入框：当所有可编辑行的值一致时显示该值；不一致时显示空，placeholder为"多个值"；用户focus并输入时替换为新值
  - Dropdown：当所有可编辑行的值一致时显示该值；不一致时显示空，placeholder为"多个值"
  - 用户修改批量设置区控件后，控件变为确定值（on/off/具体数值），不再显示不一致状态

- **修改标记**：
  - 用户修改了某行/某列的值后，该单元格或该行显示视觉提示（如浅黄色背景、左侧蓝色边框）
  - 表格右上角显示"重置修改"按钮，点击后撤销所有未保存的修改
  - "保存修改"按钮默认disabled，有未保存修改时enabled

- **交互流程**：
  1. 页面加载：从store读取所有包含该模型的供应商，构建表格初始数据
  2. 用户可直接在表格中修改任意单元格
  3. 用户可在批量设置区设置值后点击"应用到所有来源"，批量填充表格
  4. 混合操作（批量+单条微调）都支持
  5. 点击"保存修改"：遍历所有修改项，逐个更新对应供应商的对应模型参数
  6. 保存成功后清除修改标记，刷新能力概览和来源映射只读视图

### 2.5 数据保存逻辑

```typescript
// 本地修改状态
type PendingEdits = Map<string, Partial<Model>>; // key: providerId, value: model patch

// 保存时
async function saveEdits() {
  for (const [providerId, patch] of pendingEdits) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) continue;
    const updatedModels = provider.models.map(m =>
      m.name === decodedName || m.alias === decodedName
        ? { ...m, ...patch }
        : m
    );
    await updateProvider(providerId, { models: updatedModels });
  }
  pendingEdits.clear();
  toast('模型参数已更新', 'success');
}
```

- 需要通过provider model的id还是name来匹配？由于对外暴露名是model name/alias，匹配逻辑：
  - 找到provider中 `model.name === decodedName` 或 `model.alias === decodedName` 的模型
  - 应用patch
- 如果某供应商同时有name和alias都匹配（不太可能但可能），以name为准
- 批量修改时不修改model.name和model.alias字段（按需求确认结果：仅编辑能力参数和数值参数）
- 从供应商移除模型（点击🗑️按钮）：从该provider的models数组中移除该model，并清除alias（如果alias匹配）

### 2.6 只读来源映射区保留

现有的只读来源映射卡片（DirectDetailRow/AggregationDetailRow）保留在页面底部，用于展示完整的映射详情（包括箭头、tags等可视化信息），与上方的可编辑表格形成互补。

---

## 第三部分：技术实现

### 3.1 新增/修改文件

| 文件 | 操作 | 说明 |
|------|------|------|
| [src/pages/Providers/EditProviderPage.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/pages/Providers/EditProviderPage.tsx) | 重写 | 新的标签页式布局 |
| `src/pages/Providers/tabs/ProviderBasicTab.tsx` | 新增 | 基本信息标签页 |
| `src/pages/Providers/tabs/ProviderModelsTab.tsx` | 新增 | 模型管理标签页 |
| `src/pages/Providers/tabs/ProviderMappingsTab.tsx` | 新增 | 模型映射标签页 |
| `src/pages/Providers/tabs/ProviderProxyTab.tsx` | 新增 | 代理设置标签页 |
| `src/pages/Providers/ModelEditTableRow.tsx` | 新增 | 模型表格行组件（可复用） |
| [src/pages/ModelConfig/ModelDetailPage.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/pages/ModelConfig/ModelDetailPage.tsx) | 修改 | 添加批量编辑区域和可编辑表格 |
| `src/pages/ModelConfig/ModelBulkEditPanel.tsx` | 新增 | 批量设置区组件 |
| `src/pages/ModelConfig/ModelSourcesTable.tsx` | 新增 | 各来源参数对比表格组件 |

### 3.2 组件复用与扩展

- **Tabs 组件**：使用项目已有的 [Tabs.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/components/ui/Tabs.tsx)
- **Switch 组件**：扩展现有 [Switch.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/components/ui/Switch.tsx) 支持 `indeterminate` 三态（详见2.3节），原有二态用法保持向后兼容
- **Dropdown 组件**：使用项目已有的 [Dropdown.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/components/ui/Dropdown.tsx)
- **Button 组件**：使用升级后的 [Button.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/components/ui/Button.tsx)
- **ConfirmDialog**：使用项目已有的 [ConfirmDialog.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/components/ui/ConfirmDialog.tsx)
- **Card**：使用项目已有的 [Card.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/components/ui/Card.tsx)
- **Toast**：使用项目已有的 [Toast.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/components/ui/Toast.tsx)
- **ProviderLogo**：使用项目已有的 [ProviderLogo.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/components/ui/ProviderLogo.tsx)
- **样式**：复用现有的 `inputBaseStyle`、`btnStyle`、CSS变量

### 3.3 Store 变更

`useProviderStore` 已有 `updateProvider(providerId, patch)` 方法，支持更新models数组，无需新增store方法。批量保存时循环调用即可。

### 3.4 不影响的范围

- [AddProviderPage.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/pages/Providers/AddProviderPage.tsx)：新增供应商页面保持步骤式向导不变（添加新提供商时引导流程是合适的）
- [ModelInventory.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/pages/ModelConfig/ModelInventory.tsx)：模型列表卡片视图保持不变
- [ProviderForm.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/pages/Providers/ProviderForm.tsx)：保留，AddProviderPage仍可使用，或后续可重构
- [ProviderDetailPage.tsx](file:///Users/lhy/Project/Client/MelodyHub/src/pages/Providers/ProviderDetailPage.tsx)：供应商详情页（只读）保持不变或可后续替换为直接跳转到编辑页
- 后端Rust代码：无需修改，纯前端UI改进

### 3.5 自动保存实现模式

参考 SettingsForm 的实现：

```typescript
const [dirty, setDirty] = useState(false);
const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

const scheduleAutoSave = useCallback(() => {
  setDirty(true);
  if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
  autoSaveTimer.current = setTimeout(doAutoSave, 400);
}, [/* deps */]);

const doAutoSave = useCallback(async () => {
  // 调用 updateProvider 保存
  setDirty(false);
}, [/* deps */]);
```

---

## 验收标准

### 供应商编辑页
1. 点击供应商列表中的编辑按钮进入新的标签页式编辑页面
2. 四个标签页可以自由切换，不需要按顺序
3. 头部的测试连接按钮在任何标签页都可以使用
4. 模型管理使用表格视图，可以直接在表格中切换能力开关
5. 模型行可以展开编辑别名和默认思考强度
6. 可以多选模型并批量设置能力
7. 所有修改400ms后自动保存，头部有保存状态提示
8. API Key显示为密码，支持显示/隐藏切换
9. 删除供应商有二次确认

### 模型批量编辑
1. 进入模型详情页可以看到"批量参数设置"区域
2. 可以看到各来源的参数对比表格，每行一个供应商，显示该模型在该供应商的配置
3. 表格中每行使用二态Switch，直接显示该行的真实值
4. 批量设置区在各来源值不一致时显示indeterminate（"-"）或"多个值"状态
5. 可以直接在表格中修改单个供应商的参数
6. 可以使用批量设置区一键应用参数到所有来源（三态Switch循环：不修改→开启→关闭）
7. 修改后有视觉标记（未保存状态），"保存修改"按钮启用
8. 点击保存后修改持久化到所有相关供应商
9. 聚合来源在表格中分隔显示且不可编辑
10. 保存后能力概览卡片更新为最新的聚合状态
