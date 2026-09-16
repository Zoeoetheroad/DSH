# dsh-plugins

我自己的 DSH 插件，一个目录一个插件。

## 装其中一个

```sh
dsh plugin --profile web add "git+<这个仓库的地址>#path:plugins/<插件目录名>"
```

例：

```sh
dsh plugin --profile web add "git+git@github.com:你的账号/dsh-plugins.git#path:plugins/mcp-manager"
```

装完**重启 DSH**（`dsh web`）。

## 全装（推荐给同事）

```sh
git clone <这个仓库的地址> ~/dsh-plugins
bash ~/dsh-plugins/安装全部.sh
```

## 插件列表

| 目录 | 作用 | 依赖 |
|---|---|---|
| `plugins/mcp-manager` | 设置里的 MCP 管理页：增/删 MCP 服务器 | 无（自带 js-yaml） |
| `plugins/sidebar-glass` | 侧边栏毛玻璃 + 工作区行底色/标题加粗居中 | **需要 `deepseek-harness-background` 并开启壁纸** |

## 新增一个插件

```sh
mkdir plugins/新插件名 && cd plugins/新插件名
# 写 package.json（必须有 dsh.client.platform = "web"）和 lib/client.js
```

然后 `git add . && git commit -m "加个新插件" && git push`。
同事重跑 `安装全部.sh` 就有了。
