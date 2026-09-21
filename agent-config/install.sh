#!/usr/bin/env bash
# agent-config 一键安装：把工作台插件挂进一个 DSH home。
#
#   bash install.sh            # 默认 profile: web
#   bash install.sh tui        # 指定 profile
#
# 幂等：重复跑不会重复加行、不会覆盖已有配置。动作只有四个：
#   1. 把仓库里的插件软链进 $DSH_HOME/plugins/
#   2. 软链进 profile 的 node_modules（Node 解析要用）
#   3. 把依赖写进 profile 的 package.json
#   4. 往 $DSH_HOME/cordis.patch.yml 插一行（已经有一模一样的行就跳过）
#
# 它**不会**碰 MCP / skill-remote 那几行 —— 那些带地址和 token，
# 得你自己填（见 config/cordis.patch.fragment.yml）。
set -euo pipefail

PROFILE="${1:-web}"
HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PKG="$HERE/plugins/workbench-app"

say() { printf '%s\n' "$*"; }

[ -d "$HOME_DIR" ] || { say "✗ 找不到 DSH home：$HOME_DIR（用 DSH_HOME 指定）"; exit 1; }
[ -d "$HOME_DIR/profiles/$PROFILE" ] || { say "✗ 找不到 profile：$HOME_DIR/profiles/$PROFILE"; exit 1; }
[ -f "$PKG/package.json" ] || { say "✗ 找不到插件：$PKG"; exit 1; }

PROFILE_DIR="$HOME_DIR/profiles/$PROFILE"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%S)"

# ── 1) 插件本体 ───────────────────────────────────────────────────────
mkdir -p "$HOME_DIR/plugins"
TARGET="$HOME_DIR/plugins/workbench-app"
if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
  say "· $TARGET 是真实目录，先备份成 $TARGET.bak.$STAMP"
  mv "$TARGET" "$TARGET.bak.$STAMP"
fi
ln -sfn "$PKG" "$TARGET"
say "✓ 插件已链到 $TARGET -> $PKG"

# ── 2) profile 的 node_modules ────────────────────────────────────────
mkdir -p "$PROFILE_DIR/node_modules"
ln -sfn "$TARGET" "$PROFILE_DIR/node_modules/dsh-workbench"
say "✓ profile 解析已链到 $PROFILE_DIR/node_modules/dsh-workbench"

# ── 3) profile 依赖 ───────────────────────────────────────────────────
python3 - "$PROFILE_DIR/package.json" "$TARGET" <<'PY'
import json, sys
path, target = sys.argv[1], sys.argv[2]
try:
    with open(path) as handle:
        data = json.load(handle)
except FileNotFoundError:
    data = {}
deps = data.setdefault("dependencies", {})
want = "file:" + target
if deps.get("dsh-workbench") == want:
    print("· profile 依赖已经是它，跳过")
else:
    deps["dsh-workbench"] = want
    data["dependencies"] = dict(sorted(deps.items()))
    with open(path, "w") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print("✓ profile 依赖已写入 dsh-workbench ->", want)
PY

# ── 4) loader 行（幂等）────────────────────────────────────────────────
PATCH="$HOME_DIR/cordis.patch.yml"
python3 - "$PATCH" "$TARGET" <<'PY'
import os, sys
path, target = sys.argv[1], sys.argv[2]
text = ""
if os.path.exists(path):
    with open(path) as handle:
        text = handle.read()
if "dsh-workbench" in text:
    print("· loader 行已经在了，跳过")
    raise SystemExit(0)
if text.strip() != "":
    backup = path + ".bak." + __import__("time").strftime("%Y-%m-%dT%H-%M-%S", __import__("time").gmtime())
    with open(backup, "w") as handle:
        handle.write(text)
    print("· 原 patch 已备份到", backup)
block = (
    "\n# 工作台（agent-config 安装）\n"
    "- insert:\n"
    "    - id: dsh-workbench\n"
    "      name: dsh-workbench\n"
    "      config:\n"
    "        knowledgeServer: sora-knowledge\n"
    "        libraryServer: sora-articles\n"
    "        clientsTool: list_clients\n"
    "        articlesTool: list_articles\n"
)
with open(path, "a") as handle:
    handle.write(block)
print("✓ loader 行已追加到", path)
PY

say ""
say "装完了。还差两件事："
say "  1. MCP 与 skill-remote 那几行（带地址和 token）——见 config/cordis.patch.fragment.yml，"
say "     或在网页的「设置 → MCP」里加。"
say "  2. **重启一次**让你那边生效：宿主代码要重启才加载。"
say ""
say "重启之后："
say "  · 打开就落在「工作台」（左栏第一行）"
say "  · 改 lib/client.js   → ~500ms 热替换，界面不用重启"
say "  · 改 lib/impl.js     → 下一个请求就是新逻辑，也不用重启"
say "  · 改 lib/index.js    → 要重启（这层壳刻意写到最少）"
