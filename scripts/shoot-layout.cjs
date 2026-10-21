const WebSocket = require("ws");
const fs = require("fs");
const PORT = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const page = (await res.json()).find((t) => t.type === "page" && /index\.html/.test(t.url));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((r) => ws.on("open", r));
  const send = (method, params = {}) =>
    new Promise((done) => { const mid = ++id; pending.set(mid, done); ws.send(JSON.stringify({ id: mid, method, params })); });
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) return { __error: (r.result.exceptionDetails.exception?.description || "").slice(0, 300) };
    return r.result?.result?.value;
  };
  const shot = async (clip, file) => {
    const r = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 2 }, captureBeyondViewport: false });
    if (!r.result?.data) return { error: r.error };
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    return { file, bytes: fs.statSync(file).size };
  };
  await send("Page.enable");
  await send("Runtime.enable");

  const applyLayout = (layout) => ev(`(async () => {
    const p = app.plugins.plugins["berry-radio"];
    p.settings.blockLayout = "${layout}";
    if (typeof p.saveSettings === "function") await p.saveSettings();
    else if (typeof p.saveData === "function") await p.saveData(p.settings);
    p.refreshViews();
    await new Promise(r => setTimeout(r, 1400));
    return { layout: p.settings.blockLayout };
  })()`);

  const shootNote = async (file) => {
    const clip = await ev(`(async () => {
      const f = app.vault.getAbstractFileByPath("验收测试.md");
      const leaf = app.workspace.getLeavesOfType("markdown")[0] || app.workspace.getLeaf(true);
      app.workspace.setActiveLeaf(leaf, { focus: true });
      await leaf.setViewState({ type: "markdown", state: { file: f.path, mode: "preview" } });
      await new Promise(r => setTimeout(r, 900));
      if (leaf.view.previewMode && typeof leaf.view.previewMode.rerender === "function") {
        leaf.view.previewMode.rerender(true);
      }
      await new Promise(r => setTimeout(r, 2600));
      const cards = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null);
      cards[0].scrollIntoView({ block: "start" });
      await new Promise(r => setTimeout(r, 700));
      const a = cards[0].getBoundingClientRect();
      const b = cards[1].getBoundingClientRect();
      return {
        x: Math.round(a.x) - 14,
        y: Math.round(a.y) - 14,
        width: Math.round(a.width) + 28,
        height: Math.round(b.y + b.height - a.y) + 28,
        layouts: cards.map(c => c.getAttribute("data-layout")),
        box0: { w: Math.round(a.width), h: Math.round(a.height) }
      };
    })()`);
    await sleep(500);
    const pure = { x: clip.x, y: clip.y, width: clip.width, height: clip.height };
    const out = await shot(pure, file);
    return { ...out, layouts: clip.layouts, box0: clip.box0 };
  };

  console.log("reload plugin");
  console.log(JSON.stringify(await ev(`(async () => {
    await app.plugins.disablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 400));
    await app.plugins.enablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 1200));
    return { version: app.plugins.plugins["berry-radio"].manifest.version, layout: app.plugins.plugins["berry-radio"].settings.blockLayout };
  })()`)));

  console.log("\n→ compact (方向 A)");
  console.log(JSON.stringify(await applyLayout("compact")));
  console.log(JSON.stringify(await shootNote("/tmp/br-compact.png")));

  console.log("\n→ hero");
  console.log(JSON.stringify(await applyLayout("hero")));
  console.log(JSON.stringify(await shootNote("/tmp/br-hero.png")));

  console.log("\n→ restore compact");
  console.log(JSON.stringify(await applyLayout("compact")));

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
