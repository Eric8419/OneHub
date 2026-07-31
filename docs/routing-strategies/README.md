# 路由策略说明

Melody Hub 为每个对外暴露的聚合模型提供 19 种路由策略。策略作用于聚合中的
**可用目标**：目标必须启用、权重大于 0、上游健康、协议兼容，并满足请求所需的能力和上下文窗口。

显式 `targets` 是推荐配置方式。旧版只填写逗号分隔 `models` 的聚合仍然兼容，但不会携带每个目标的成本、配额和重置时间；在模型详情页保存一次路由后，旧配置会展开成可编辑的具体目标。

## 快速选择

| 分组 | 策略 | 适合场景 |
|---|---|---|
| 优先与消耗 | [优先级](./priority.md)、[优先用满](./fill-first.md) | 需要明确的主备顺序，或想先消耗高优先级配额 |
| 负载均衡 | [轮询](./round-robin.md)、[加权](./weighted.md)、[二选一](./p2c.md)、[最少使用](./least-used.md) | 分摊请求、按容量或运行历史做均衡 |
| 随机分配 | [随机](./random.md)、[无重复随机](./strict-random.md) | 降低固定顺序带来的偏斜，或按轮次均匀覆盖目标 |
| 成本与配额 | [成本优先](./cost-optimized.md)、[重置感知](./reset-aware.md)、[重置窗口](./reset-window.md)、[最大余量](./headroom.md) | 成本、剩余配额或配额重置时间是主要约束 |
| 智能路由 | [自动优选](./auto.md)、[最近成功路径](./lkgp.md)、[上下文优化](./context-optimized.md)、[缓存优化](./cache-optimized.md) | 综合健康、延迟、上下文和会话亲和性 |
| 多模型编排 | [上下文接力](./context-relay.md)、[多模型融合](./fusion.md)、[顺序流水线](./pipeline.md) | 保持会话亲和，或让多个模型协作完成一次请求 |

## 策略索引

| Key | 中文名称 | 选择方式 |
|---|---|---|
| `priority` | [优先级](./priority.md) | 选择优先级最高的可用目标 |
| `weighted` | [加权](./weighted.md) | 按目标权重随机选择 |
| `round-robin` | [轮询](./round-robin.md) | 按稳定目标顺序循环选择 |
| `context-relay` | [上下文接力](./context-relay.md) | 按请求亲和键保持目标粘性 |
| `fill-first` | [优先用满](./fill-first.md) | 在仍有余量的目标中选择优先级最高者 |
| `p2c` | [二选一负载均衡](./p2c.md) | 抽取两个目标，比较成功率和延迟 |
| `random` | [随机](./random.md) | 在可用目标中均匀随机选择 |
| `least-used` | [最少使用](./least-used.md) | 选择历史路由尝试次数最少的目标 |
| `cost-optimized` | [成本优先](./cost-optimized.md) | 选择每百万 Token 成本最低的目标 |
| `reset-aware` | [重置感知](./reset-aware.md) | 综合余量和距离重置的时间 |
| `reset-window` | [重置窗口](./reset-window.md) | 选择最早重置配额窗口的目标 |
| `headroom` | [最大余量](./headroom.md) | 选择剩余配额比例最高的目标 |
| `strict-random` | [无重复随机](./strict-random.md) | 一轮内每个目标只出现一次 |
| `auto` | [自动优选](./auto.md) | 综合健康、余量、成本、延迟、负载和上下文 |
| `lkgp` | [最近成功路径](./lkgp.md) | 优先使用该聚合最近成功的具体目标 |
| `context-optimized` | [上下文优化](./context-optimized.md) | 选择刚好能容纳请求的最小上下文窗口 |
| `cache-optimized` | [缓存优化](./cache-optimized.md) | 按请求前缀保持目标亲和，提高缓存命中机会 |
| `fusion` | [多模型融合](./fusion.md) | 并行咨询多个目标，再由评审目标整合 |
| `pipeline` | [顺序流水线](./pipeline.md) | 按顺序执行目标并传递上一步结果 |

## 共同规则

### 目标元数据

每个显式目标可以单独设置：

- `priority`：优先级，数值越大越优先。
- `weight`：加权和候选资格使用的相对权重。
- `costPerMillionTokens`：成本提示，单位为每百万 Token。
- `quotaRemaining`：配额余量比例，UI 以 0–100% 编辑，内部保存为 0–1。
- `quotaResetAt`：配额重置时间，保存为 Unix 毫秒时间戳。

成本和配额字段是配置或遥测提示，不会自动替上游供应商查询账单。缺少策略所需元数据时，各策略会按各自文档中的规则回退。

### 故障转移

请求失败后，代理会排除失败的提供商并重新执行路由。轮询使用独立的目标身份顺序，因此失败目标被过滤后不会跳过本应尝试的下一个目标。流式响应一旦开始发送，不能再切换上游。

### 运行时状态

轮询游标、严格随机牌堆、最少使用计数、P2C 成功率和延迟、最近成功路径以及亲和性映射属于运行时状态，应用重启后会重新开始。目标的成本、余量和重置时间属于聚合配置，会写入版本化的 `aggregations.json`。
