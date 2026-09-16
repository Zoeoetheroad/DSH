#!/usr/bin/env bash
# 把本仓库里的所有插件装到 DSH 的 web profile。
set -euo pipefail
PROFILE="${1:-web}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if ! command -v dsh >/dev/null 2>&1; then
  echo "找不到 dsh 命令，请先确认 DSH 已安装、dsh 在 PATH 里。"
  exit 1
fi

echo "==> 安装本地插件（profile: $PROFILE）"
for dir in "$HERE"/plugins/*/; do
  [ -f "$dir/package.json" ] || continue
  name=$(basename "$dir")
  echo "--- $name"
  dsh plugin --profile "$PROFILE" add "$dir"
done

echo
echo "==> 安装第三方依赖（侧边栏毛玻璃需要它）"
dsh plugin --profile "$PROFILE" add deepseek-harness-background || true

echo
echo "==> 完成。重启 DSH：dsh web"
echo "    重启后：设置 里会多出 MCP 页；想开侧边栏毛玻璃，去 设置 -> 通用设置 -> 自定义背景 传一张壁纸。"
