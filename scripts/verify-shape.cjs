/**
 * 形状一致性 + 配色一致性 真机断言（Obsidian CDP）
 *   - SHAPE CONSISTENCY LOCK: 插件作用域内所有元素 border-radius 必须为 0px
 *   - COLOR CONSISTENCY LOCK: 强调色全局唯一，且等于品牌色 #d86d43
 *   - 不得出现径向渐变光晕、纯黑投影
 */
const WebSocket = require("ws");
const PORT = 9223;

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const page = (await res.json()).find(t => t.type === "page" && /index\.html/.test(t.url));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") errors.push((m.params.exceptionDetails.text || "").slice(0, 160));
  });
  await new Promise(r => ws.on("open", r));
  const send = (method, params = {}) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) return { __error: (r.result.exceptionDetails.exception?.description || "").slice(0, 400) };
    return r.result?.result?.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");

  console.log("① 形状一致性 + 配色一致性");
  console.log(JSON.stringify(await ev(`(async () => {
    const file = app.vault.getAbstractFileByPath("验收测试.md");
    const leaf = app.workspace.getLeavesOfType("markdown")[0] || app.workspace.getLeaf(true);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "preview" } });
    await new Promise(r => setTimeout(r, 4000));
    await app.plugins.plugins["berry-radio"].activateView("sidebar");
    await new Promise(r => setTimeout(r, 2000));

    const roots = [
      ...[...document.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null),
      ...[...document.querySelectorAll(".br-now")].filter(c => c.offsetParent !== null),
      ...[...document.querySelectorAll(".br-view")].filter(c => c.offsetParent !== null)
    ];

    // 扫描插件作用域内每一个元素（含伪元素无法枚举，仅元素）
    const radiusViolations = [];
    const glowViolations = [];
    const blackShadow = [];
    let scanned = 0;

    for (const root of roots) {
      const els = [root, ...root.querySelectorAll("*")];
      for (const el of els) {
        scanned++;
        const cs = getComputedStyle(el);
        const tag = el.className && typeof el.className === "string" ? el.className.split(" ")[0] : el.tagName;
        if (cs.borderRadius && cs.borderRadius !== "0px" && cs.borderRadius !== "0%") {
          radiusViolations.push({ el: tag, radius: cs.borderRadius });
        }
        if (/radial-gradient/.test(cs.backgroundImage || "")) {
          glowViolations.push({ el: tag, bg: (cs.backgroundImage || "").slice(0, 70) });
        }
        const sh = cs.boxShadow || "";
        if (/rgba?\\(0,\\s*0,\\s*0/.test(sh)) {
          blackShadow.push({ el: tag, shadow: sh.slice(0, 70) });
        }
      }
    }

    // 强调色取样点
    const accentSamples = [];
    for (const root of roots) {
      const cs = getComputedStyle(root);
      accentSamples.push(cs.getPropertyValue("--br-accent").trim());
    }
    const playBtn = document.querySelector(".berry-radio .br-controls__btn--play");
    const chipOn = document.querySelector(".br-chip.is-on");

    return {
      scannedElements: scanned,
      roots: roots.length,
      radiusViolations: radiusViolations.slice(0, 8),
      radiusViolationCount: radiusViolations.length,
      glowViolations: glowViolations.slice(0, 5),
      blackShadow: blackShadow.slice(0, 5),
      accentTokens: [...new Set(accentSamples)],
      playBtnBg: playBtn ? getComputedStyle(playBtn).backgroundColor : null,
      playBtnRadius: playBtn ? getComputedStyle(playBtn).borderRadius : null,
      chipOnBg: chipOn ? getComputedStyle(chipOn).backgroundColor : null,
      chipOnColor: chipOn ? getComputedStyle(chipOn).color : null,
      chipOnRadius: chipOn ? getComputedStyle(chipOn).borderRadius : null,
      layout: document.querySelector(".berry-radio")?.getAttribute("data-layout")
    };
  })()`), null, 1));

  console.log("\n② 渲染异常:", errors.length ? JSON.stringify(errors.slice(0, 2)) : "无");
  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
