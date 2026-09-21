# 待办清单

> 维护：Agent。最近更新 2026-09-21 晚。
> 已完成的部分见 `README.md`；这份只记**还没做的**。

---

## P0 · 明天第一件：装配台发起会话，串到了当前会话

**现象**：在工作台选好客户 / 主题 / 技能，点 **发送** —— 提示词**落进了当时打开的那条会话**
（就是我们正在对话的那条），而不是新开一条。

**预期**：新开一条会话，提示词发进去；当前会话一个字都不动。

**已经确认的事实**

- 提示词**完整送达**了（我收到的就是 `给 哈尔斯 写。主题：… 怎么写：技能：sora-ranking`）
  → 所以 `PromptRelay` 的 `setDraft + submit` 这条是通的，**问题在"新会话"这一步**

**根因分析**（读完 DSH 源码后的判断）

`packages/client/ui-workspace/src/client/navigation.ts`

- `startSession()`（:154）→ `target = workspaceId ?? currentWorkspaceId ?? recent` → `openWorkspace(target)`
- `connectWorkspace()`（:110）**复用工作区里已有的空白会话**：
  ```ts
  for (const id of sessions.ids) { … if (summary.blank && summary.cwd === workspace.path …) return summary.id }
  ```
  没有空白的才 `sessions.create({ workspaceId })`
- `openSession()`（:134）→ `sessions.open(id)` + `layout.selectPanel(null)`

而我的接力挂件（`agent-config/plugins/workbench-app/lib/client.js` → `PromptRelay`）是：

```js
React.useEffect(function () {
  if (pendingPrompt === null) return
  …actions.setDraft(text); actions.submit()
}, [actions])          // ← 嫌疑在这
```

**判断**：`actions`（`inputActions`）如果在每次渲染时都是新对象，这个 effect 就会**反复重跑**，
于是 `pendingPrompt` 会被**当前还挂着的那个会话**（我们的对话）抢先消费掉 ——
新会话还没 `open` 出来，草稿已经提交进旧会话了。这与"串台"的现象吻合。

**两条待验证 / 待修**

1. 先证实 `inputActions` 的引用是否稳定（不稳 → 就是它）
2. 修法（择一，明天定）：
   - **只在空白会话里消费**：接力挂件用会话标准 props 判断当前会话是不是"没有轮次"的，
     非空白就不消费、留给新会话。最直接，正好对上 `connectWorkspace` 复用空白会话的语义
   - **绑目标会话 id**：`dispatch()` 时记下当时的 sessionId，接力只在 `sessionId !== 记下的那个` 时提交
   - **改成 effect 只跑一次**（deps `[]`）：不解决根因，只把窗口缩小，不推荐单独用

**怎么复现**

1. 打开任意一条**已有内容**的会话（不是空白新会话）
2. 从其它会话切到「工作台」
3. 选客户 → 填主题 → 发送
4. 看消息落在哪条会话里

**排查起点**

- `agent-config/plugins/workbench-app/lib/client.js` → `dispatch()` / `PromptRelay`
- `packages/client/ui-workspace/src/client/navigation.ts:110 / :134 / :154`
- 改 `client.js` 是热替换的，改完刷新即可，不用重启

---

## P1 · 装配台剩下的

- **A3 薄弱问句库**：数据源还没定（不在现在这三个服务里）。有数据源再接，现在只留空表头。
- **A5 附件「选文件」**：现在是禁用状态。要么接上传（DSH 有 `conversation.input.attachments`），要么去掉。
- **A1「＋ 新建客户」**：原型里是"去知识库那边建一个"。现在知识库 MCP 只有读工具
  （`list_clients` / `list_kb_files` / `read_kb_file` / `read_kb`），**没有建客户的接口** → 得先有写工具。
- **产品线 / 期数**：测试版知识库只有「客户 + 文件」两层，没有线和期。
  现在下拉显示「（无产品线）」「（无期数）」。**等知识库那边真有这两层再说**，不要自己造。

## P2 · 会话页与审核栏

- **C 区会话页渲染**：现在只做了底色/宽度皮肤（走 `[data-slot]` + `--dsh-*` 变量）。
  还差的：C1 顶部任务条、C2 思考链、C3 工具链合并、C4 产物卡。
  - C1 需要"这次发起时的预设"，**要先在发起会话时把装配参数存下来**
- **R 区右栏审核**：审核正文 / 检查规则条 / 差分 / 打勾。依赖三样还不存在的后端：
  产物目录约定、硬规则检查脚本、入库工具。**现在做只能是空壳。**
- **入库**：`sora-articles` 已经挂了（`list_articles` / `read_article` / `write_article`），
  但三条规矩要先定死：先写远端拿回执→再动工作区 / 删草稿失败不算入库失败 / 幂等。

## 待办 · 收敛成一份代码（下次重启时做）

现在有**两份一样的工作台插件**：

| 位置 | 作用 |
|---|---|
| `$DSH_HOME/profiles/web/node_modules/dsh-workbench` → `/opt/dsh/projects/DSHplugin/plugins/workbench-app` | **线上正在跑的**（终端里的进程加载的就是它） |
| 本仓库 `agent-config/plugins/workbench-app/` | 发布副本 |

现在两份内容一样，但会漂。**下次重启 DSH 时顺手收敛成一份**（那时改指向不会打断任何东西）：

```sh
ln -sfn <本仓库>/agent-config/plugins/workbench-app "$DSH_HOME/plugins/workbench-app"
ln -sfn "$DSH_HOME/plugins/workbench-app" "$DSH_HOME/profiles/web/node_modules/dsh-workbench"
# 顺带把 profile 的 package.json 里 dsh-workbench 的 file: 路径改成新位置
```

改完 `/opt/dsh/projects/DSHplugin` 那个旧 clone 就可以删了（它只是早期 clone，里面没有独占内容）。

> 为什么不在跑着的时候改：客户端 bundle 的路径是**组合时**解析并缓存的，
> 现在改指向，正在跑的那个进程就看不见新位置的文件了（热替换会失灵），
> 要等一次重启才重新解析。

## 已知的坑（别再踩）

- **宿主代码改了要重启**。所以逻辑全在 `lib/impl.js`（按 mtime 热加载），`lib/index.js` 只剩壳。
  别往壳里写逻辑。
- **`ctx.tools.execute()` 的产物是包着的**：`{ content, structuredContent }`，业务数据在
  `structuredContent` 或 `content` 的 JSON 文本块里 —— 直接用 `result.value` 会认不出来。已在 `impl.js` 里拆。
- **别写指向别人 hash 类名的选择器**（`q6UjTG_root` 这种每次上游重建都变）。
  用 `[data-slot="…"]` + `--dsw-*` / `--dsh-*` 变量，或者自己的 `wb_` 前缀类名。
- **三个外部服务地址随时会变**（Cloudflare 快速通道）。连不上先问地址，别乱排查 —— 见 `README.md`。
