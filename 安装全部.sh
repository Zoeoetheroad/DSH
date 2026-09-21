#!/usr/bin/env bash
# 安装本仓库里的全部 DSH 插件。
#
# 两种用法都对：
#   1) 直接跑（从 GitHub 拉，不需要先 clone）
#        bash 安装全部.sh
#   2) 已经 clone 了本仓库，就地跑（改完立刻能装，不用先 push）
#        bash 安装全部.sh
#
# 第一个参数可指定 profile，默认 web：  bash 安装全部.sh tui
set -euo pipefail

PROFILE="${1:-web}"
REPO="${DSH_PLUGIN_REPO:-git+ssh://git@github.com/Zoeoetheroad/DSH.git}"

if ! command -v dsh >/dev/null 2>&1; then
  echo "找不到 dsh 命令。请先确认 DSH 已安装、dsh 在 PATH 里。"
  exit 1
fi

# 在带 .git 的本仓库根目录里就地跑 → 用本地路径；否则从 GitHub 拉。
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$HERE/plugins" ] && git -C "$HERE" rev-parse --git-dir >/dev/null 2>&1; then
  echo "==> 来源：本地仓库目录 $HERE"
  FROM_LOCAL=1
else
  echo "==> 来源：GitHub $REPO"
  FROM_LOCAL=0
fi

echo
echo "==> 安装插件（profile: ${PROFILE}）"
for dir in "$HERE"/plugins/*/; do
  [ -f "$dir/package.json" ] || continue
  name=$(basename "$dir")
  echo "--- $name"
  if [ "$FROM_LOCAL" = "1" ]; then
    dsh plugin --profile "$PROFILE" add "$dir"
  else
    dsh plugin --profile "$PROFILE" add "${REPO}#path:plugins/${name}"
  fi
done

echo
echo "==> 安装第三方依赖（侧边栏毛玻璃需要它）"
dsh plugin --profile "$PROFILE" add deepseek-harness-background || true

echo
echo "==> 完成。重启 DSH：dsh web"
echo "    重启后：设置里会多出 MCP 页。"
echo "    想开侧边栏毛玻璃：设置 -> 通用设置 -> 自定义背景 -> 传一张壁纸（壁纸关着就不生效）。"
