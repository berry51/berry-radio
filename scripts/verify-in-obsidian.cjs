const WebSocket = require("ws");
const fs = require("fs");
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
  const click = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  const shot = async (clip, file) => {
    const r = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 2 }, captureBeyondViewport: false });
    if (!r.result?.data) return { error: r.error };
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    return { file, bytes: fs.statSync(file).size };
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

  console.log("\n② 打开笔记，检查三张卡片");
  console.log(JSON.stringify(await ev(`(async () => {
    const file = app.vault.getAbstractFileByPath("验收测试.md");
    const leaf = app.workspace.getLeavesOfType("markdown")[0] || app.workspace.getLeaf(true);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "preview" } });
    await new Promise(r => setTimeout(r, 4500));
    const cards = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null);
    return cards.map(c => ({
      state: c.getAttribute("data-state"),
      layout: c.getAttribute("data-layout"),
      name: c.querySelector(".berry-radio__name")?.textContent,
      meta: c.querySelector(".berry-radio__meta")?.textContent,
      art: Math.round(c.querySelector(".br-art")?.getBoundingClientRect().width ?? 0),
      play: Math.round(c.querySelector(".br-controls__btn--play")?.getBoundingClientRect().width ?? 0),
      vol: c.querySelector(".br-volume__pct")?.textContent
    }));
  })()`), null, 1));

  console.log("\n③ 点播放键 → 应开始播放");
  const p1 = await ev(`(() => {
    const leaf = app.workspace.getLeavesOfType("markdown")[0];
    const card = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null)[0];
    card.scrollIntoView({ block: "center" });
    const b = card.querySelector(".br-controls__btn--play").getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  })()`);
  await click(p1.x, p1.y);
  await sleep(6500);
  console.log(JSON.stringify(await ev(`(() => {
    const p = app.plugins.plugins["berry-radio"];
    const leaf = app.workspace.getLeavesOfType("markdown")[0];
    const card = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null)[0];
    return {
      status: p.player.snapshot().status,
      station: p.player.snapshot().station?.name ?? null,
      currentTime: Number(p.player.audio.currentTime.toFixed(2)),
      cardState: card.getAttribute("data-state"),
      pauseIcon: !!card.querySelector(".br-controls__btn--play svg rect")
    };
  })()`), null, 1));

  console.log("\n④ 点卡片空白处 → 应暂停");
  const p2 = await ev(`(() => {
    const leaf = app.workspace.getLeavesOfType("markdown")[0];
    const card = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null)[0];
    const r = card.querySelector(".berry-radio__name").getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  await click(p2.x, p2.y);
  await sleep(1800);
  console.log(JSON.stringify(await ev(`(() => {
    const p = app.plugins.plugins["berry-radio"];
    return { status: p.player.snapshot().status, paused: p.player.audio.paused };
  })()`), null, 1));

  console.log("\n⑤ 截图：笔记 / 空卡片 / 侧栏");
  const noteClip = await ev(`(async () => {
    const leaf = app.workspace.getLeavesOfType("markdown")[0];
    const cards = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null);
    cards[0].scrollIntoView({ block: "start" });
    await new Promise(r => setTimeout(r, 600));
    const a = cards[0].getBoundingClientRect();
    const b = cards[1].getBoundingClientRect();
    return { x: Math.round(a.x) - 12, y: Math.round(a.y) - 12, width: Math.round(a.width) + 24, height: Math.round(b.y + b.height - a.y) + 24 };
  })()`);
  await sleep(600);
  console.log(JSON.stringify(await shot(noteClip, "/tmp/br-note.png")));

  const emptyClip = await ev(`(async () => {
    const leaf = app.workspace.getLeavesOfType("markdown")[0];
    const cards = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null);
    const empty = cards.find(c => c.getAttribute("data-state") === "empty");
    empty.scrollIntoView({ block: "center" });
    await new Promise(r => setTimeout(r, 500));
    const r = empty.getBoundingClientRect();
    return { x: Math.round(r.x) - 12, y: Math.round(r.y) - 12, width: Math.round(r.width) + 24, height: Math.round(r.height) + 24 };
  })()`);
  await sleep(400);
  console.log(JSON.stringify(await shot(emptyClip, "/tmp/br-empty.png")));

  const sideClip = await ev(`(async () => {
    await app.plugins.plugins["berry-radio"].activateView("sidebar");
    await new Promise(r => setTimeout(r, 2200));
    const el = app.workspace.getLeavesOfType("berry-radio-view")[0].view.containerEl;
    const r = el.querySelector(".br-now").getBoundingClientRect();
    return { x: Math.round(r.x) - 8, y: Math.round(r.y) - 8, width: Math.round(r.width) + 16, height: Math.round(r.height) + 16 };
  })()`);
  await sleep(400);
  console.log(JSON.stringify(await shot(sideClip, "/tmp/br-sidebar.png")));

  console.log("\n⑥ 渲染异常:", errors.length ? JSON.stringify(errors.slice(0, 2)) : "无");
  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
