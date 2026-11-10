#!/bin/bash
# 双击即可：在仓库根目录起本地静态服务并打开发布后台。
# 首次使用如提示「无法打开」，在 Finder 里右键 → 打开。
cd "$(dirname "$0")/.." || exit 1
PORT=8080
echo "大樊摄影站 · 本地服务"
echo "仓库目录：$(pwd)"
echo "发布后台：http://127.0.0.1:${PORT}/tools/admin.html"
echo "关闭此窗口即停止服务。"
(sleep 1 && open "http://127.0.0.1:${PORT}/tools/admin.html") &
python3 -m http.server ${PORT} --bind 127.0.0.1
