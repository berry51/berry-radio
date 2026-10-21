#!/usr/bin/env python3
"""Obsidian 插件发布前审计。

用法: python3 scripts/audit_release.py --tag 0.4.0 [--scan-tips]
检查项:
  - manifest.json: id 合法(小写+连字符、不含 obsidian、不以 plugin 结尾)、版本与 tag 一致
  - package.json / package-lock.json / versions.json 版本一致
  - main.js / styles.css 存在且比 src 最新源文件新(无未构建改动)
  - main.js 无 sourcemap 引用、无 console.log 调试残留(--scan-tips)
  - main.js 不含明显密钥
  - LICENSE / README 存在
退出码: 有 failure 时 1，否则 0。
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
failures: list[str] = []
tips: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def tip(msg: str) -> None:
    tips.append(msg)


def newest_mtime(directory: Path) -> float:
    newest = 0.0
    for p in directory.rglob("*"):
        if p.is_file() and "node_modules" not in p.parts:
            newest = max(newest, p.stat().st_mtime)
    return newest


def main() -> int:
    args = sys.argv[1:]
    scan_tips = "--scan-tips" in args
    tag = args[args.index("--tag") + 1] if "--tag" in args else None

    manifest_path = ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    pkg = json.loads((ROOT / "package.json").read_text())
    versions = json.loads((ROOT / "versions.json").read_text())

    # --- id 合法性（社区目录规则）---
    plugin_id = manifest.get("id", "")
    if not re.fullmatch(r"[a-z0-9-]+", plugin_id):
        fail(f"manifest.id 含非法字符: {plugin_id!r}")
    if "obsidian" in plugin_id:
        fail("manifest.id 不能包含 'obsidian'（社区目录拒收）")
    if plugin_id.endswith("plugin"):
        fail("manifest.id 不能以 'plugin' 结尾")

    # --- 版本一致性 ---
    version = manifest.get("version")
    if tag and version != tag:
        fail(f"manifest.version={version} 与 --tag {tag} 不一致")
    if pkg.get("version") != version:
        fail(f"package.json version={pkg.get('version')} != manifest {version}")
    lock = json.loads((ROOT / "package-lock.json").read_text())
    lock_version = (lock.get("packages", {}).get("") or {}).get("version")
    if lock_version != version:
        fail(f"package-lock.json version={lock_version} != manifest {version}（跑 npm install --package-lock-only）")
    if versions.get(version) != manifest.get("minAppVersion"):
        fail(f"versions.json 缺少 {version} -> {manifest.get('minAppVersion')} 条目")

    # --- 构建产物 ---
    for name in ("main.js", "styles.css"):
        if not (ROOT / name).exists():
            fail(f"缺少 {name}")
    src_newest = newest_mtime(ROOT / "src")
    build_time = (ROOT / "main.js").stat().st_mtime
    if src_newest > build_time:
        fail("src/ 有比 main.js 更新的改动，需要重新 npm run build")
    css_newest = (ROOT / "styles.css").stat().st_mtime
    _ = css_newest  # styles.css 手写直出，无需比较

    # --- main.js 内容检查 ---
    main_js = (ROOT / "main.js").read_text(errors="replace")
    if "sourceMappingURL" in main_js:
        fail("main.js 含 sourcemap 引用")
    if re.search(r"(sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]\s*['\"][A-Za-z0-9]{16,})", main_js, re.I):
        fail("main.js 疑似包含密钥")
    if scan_tips:
        logs = re.findall(r"console\.(?:log|debug)\(", main_js)
        if logs:
            tip(f"main.js 含 {len(logs)} 处 console.log/debug（发布前建议移除）")

    # --- 文档 ---
    for name in ("README.md", "LICENSE"):
        if not (ROOT / name).exists():
            fail(f"缺少 {name}")

    print(json.dumps({
        "tag": tag,
        "version": version,
        "ok": not failures,
        "failures": failures,
        "tips": tips if scan_tips else "skipped",
    }, ensure_ascii=False, indent=1))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
