const WebSocket = require("ws");
const PORT = 9223;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    if (r.result?.exceptionDetails) return { __error: (r.result.exceptionDetails.exception?.description || "").slice(0, 300) };
    return r.result?.result?.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");

  console.log("① 重载插件");
  console.log(JSON.stringify(await ev(`(async () => {
    await app.plugins.disablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 400));
    await app.plugins.enablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 1000));
    const p = app.plugins.plugins["berry-radio"];
    return { version: p.manifest.version, layout: p.settings.blockLayout };
  })()`)));

  console.log("\n② 笔记卡片的分类 pill");
  console.log(JSON.stringify(await ev(`(async () => {
    const file = app.vault.getAbstractFileByPath("验收测试.md");
    const leaf = app.workspace.getLeavesOfType("markdown")[0] || app.workspace.getLeaf(true);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "preview" } });
    await new Promise(r => setTimeout(r, 4500));
    const cards = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null);
    return cards.map(c => {
      const cat = c.querySelector(".berry-radio__cat");
      return {
        state: c.getAttribute("data-state"),
        name: c.querySelector(".berry-radio__name")?.textContent,
        category: cat ? cat.textContent : null,
        categoryVisible: cat ? getComputedStyle(cat).display !== "none" : false,
        tags: c.__tags
      };
    });
  })()`), null, 1));

  console.log("\n③ 侧栏分类 chips（应含 音乐/新闻/综合 等）");
  console.log(JSON.stringify(await ev(`(async () => {
    await app.plugins.plugins["berry-radio"].activateView("sidebar");
    await new Promise(r => setTimeout(r, 2500));
    const el = app.workspace.getLeavesOfType("berry-radio-view")[0].view.containerEl;
    const chips = [...el.querySelectorAll(".br-chip")].map(c => c.textContent.trim());
    return { count: chips.length, chips: chips.slice(0, 16) };
  })()`), null, 1));

  console.log("\n④ 点「音乐」分类 → 列表应被该标签过滤（联网校验）");
  console.log(JSON.stringify(await ev(`(async () => {
    const el = app.workspace.getLeavesOfType("berry-radio-view")[0].view.containerEl;
    const chip = [...el.querySelectorAll(".br-chip")].find(c => c.textContent.trim() === "音乐");
    if (!chip) return { ok: false, reason: "no 音乐 chip" };
    chip.click();
    await new Promise(r => setTimeout(r, 3500));
    const rows = el.querySelectorAll(".br-row");
    const firstNames = [...rows].slice(0, 5).map(r => r.querySelector(".br-name")?.textContent);
    return { ok: true, rowCount: rows.length, firstNames };
  })()`), null, 1));

  console.log("\n⑤ 渲染异常:", errors.length ? JSON.stringify(errors.slice(0, 2)) : "无");
  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
