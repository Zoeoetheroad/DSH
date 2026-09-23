# dsh-skill-remote

给 DSH 补一个**远程技能来源**：技能统一放在云端服务里，本地不落任何技能文件。

官方只提供「读本地目录」的 provider（`dsh-skill-filesystem`）。这个插件补上「从远程 HTTP 服务读」，让技能可以集中管理、改完下次调用即生效。

---

## 一、安装

```sh
dsh plugin --profile web add "git+ssh://git@github.com/Zoeoetheroad/DSH.git#path:plugins/dsh-skill-remote"
```

装完**必须重启 DSH**（`dsh web`）。

## 二、配置

在 profile 的 patch 层加一行（**宿主层**，不是 agent preset）：

```yaml
- id: skill-remote
  name: 'dsh-skill-remote'
  config:
    url: 'https://<技能服务地址>'
    token: '<Bearer token>'
    # 下面都是可选项
    # providerName: remote      # 注册到 ctx.skills 的名字
    # rank: 50                  # 越小越优先；本地目录是 100
    # cacheTtlMs: 60000         # 目录缓存时长
    # pollMs: 120000            # 后台轮询间隔；0 = 关闭
    # timeoutMs: 10000          # 单次请求超时
    # resourceToken: '<token>'  # 见第四节「附属文件」
    # modelInvocable: false     # 见第二节之一
```

### modelInvocable（默认 `false`）

**技能目录是否进模型上下文。**

我们的使用模式是「**用户在界面上点选技能**」——选谁由人决定，模型不需要自己挑。
DSH 的行为是：**模型可调用的技能数为 0 时，根本不往上下文里注入技能目录**。
所以默认关掉，省一份常驻上下文，模型也不会被技能清单干扰。

- 关掉之后：模型看不到技能列表，`/技能名` 手势失效
- **界面目录不受影响**：走的是另一个开关 `userInvocable`（本插件恒为 `true`），工作台照常列出全部技能
- 以后要上自动分类器，把它改成 `true` 即可 —— 是可逆开关，不是一次性决定

如果你同时想关掉本地目录发现（让技能只来自远程），在 agent preset 里配：

```yaml
- id: skill-filesystem
  config:
    includeDefaultRoots: false
    customSkillDirs: []
```

`tool-skill` 保留不动。

## 三、服务端接口约定

```
GET {url}/skills                 → [{ name, description, whenToUse? }]
GET {url}/skills/{name}          → SKILL.md 全文（Markdown）
GET {url}/skills/{name}/{path}   → 包内附属文件（references/x.md、prompts/y.md）
GET {url}/health                 → 探活（免鉴权）

鉴权：Authorization: Bearer <token>
```

- 一个技能 = **一个目录**，目录里有 `SKILL.md`（带 YAML frontmatter）+ 任意附属文件
- `name` 必须是 ASCII kebab-case（模型靠它点名技能）
- `description` 的用途取决于调用方式：`modelInvocable: true` 时模型靠它路由；关掉之后它就只是**给界面看的标签**（`whenToUse` 同理，它本来就只喂界面）
- 除 `/health` 外都要带 token；没有 token 返回 `401`

## 四、附属文件（重要）

技能正文里写的是**相对路径**，例如：

```markdown
加载 [`prompts/topic.md`](prompts/topic.md)
详细标准见 [`references/ai-recommendation-chain-standard.md`](references/ai-recommendation-chain-standard.md)
```

`get()` 返回时带上 `resourceBase`：

```js
resourceBase: { kind: 'url', url: '{url}/skills/{name}' }
```

模型用 `resourceBase` 把相对路径拼成完整地址去取 —— 这就是「**渐进式披露**」：主文件常驻、附属文件按需取，避免一次性把整个技能包塞进上下文。

**但这里有鉴权问题**：拼出来的 URL 是公开地址，而服务要求 Bearer token。两种解法：

| 解法 | 怎么做 | 评价 |
|---|---|---|
| **A. 用带 header 的取文件工具** | 由消费端提供一个能带 `Authorization` 的取文件工具 | ✅ 最干净，token 不外泄 |
| **B. 路径带 token** | 服务端支持 `/t/<token>/skills/...`；插件配 `resourceToken`，`resourceBase` 会自动变成带 token 的形式 | ⚠️ 能直接跑通，但 **token 会出现在 URL 里**（可能被代理/日志记录），建议只在内网或测试期用 |

**当前服务端两种都支持。** 默认（不配 `resourceToken`）走 A 的地址形态；配了就走 B。

## 五、行为说明

| 行为 | 说明 |
|---|---|
| **目录缓存** | `list()` 默认 60 秒缓存，正常情况不产生网络请求（实测二次调用 0ms） |
| **正文不缓存** | `get()` 每次实时拉 —— **云端改了，下一次调用就是新的** |
| **自动生效** | 后台每 120 秒轮询目录，**只有内容真的变了才通知刷新**，避免无谓的目录抖动 |
| **云端挂了** | 有缓存就用旧目录并标记「不完整」（消费端保留上一份可用目录）；完全没缓存才报错 |

## 六、卸载

```sh
dsh plugin --profile web remove dsh-skill-remote
```

记得把配置行也删掉。
