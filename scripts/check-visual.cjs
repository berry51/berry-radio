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
    await new Promise(r => setTimeout(r, 350));
    await app.plugins.enablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 900));
    return app.plugins.plugins["berry-radio"].manifest.version;
  })()`)));

  console.log("② 三张卡片的状态与尺寸");
  console.log(JSON.stringify(await ev(`(async () => {
    const file = app.vault.getAbstractFileByPath("验收测试.md");
    const leaf = app.workspace.getLeavesOfType("markdown")[0] || app.workspace.getLeaf(true);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "preview" } });
    await new Promise(r => setTimeout(r, 4500));
    const cards = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null);
    return cards.map(c => {
      const r = c.getBoundingClientRect();
      const play = c.querySelector(".br-controls__btn--play");
      const skip = c.querySelector(".br-controls__btn--skip");
      return {
        state: c.getAttribute("data-state"),
        size: { w: Math.round(r.width), h: Math.round(r.height) },
        playBg: play ? getComputedStyle(play).backgroundColor : null,
        playW: play ? Math.round(play.getBoundingClientRect().width) : 0,
        skipBorder: skip ? getComputedStyle(skip).borderTopWidth + " " + getComputedStyle(skip).borderTopColor : null,
        volFill: c.querySelector(".br-volume")?.style.getPropertyValue("--br-vol"),
        emptyText: c.querySelector(".berry-radio__empty-text")?.textContent ?? null,
        actionText: c.querySelector(".berry-radio__action")?.textContent ?? null
      };
    });
  })()`), null, 1));

  console.log("③ 笔记整屏截图");
  const clip = await ev(`(() => {
    const leaf = app.workspace.getLeavesOfType("markdown")[0];
    const view = leaf.view.containerEl.querySelector(".markdown-preview-view") || leaf.view.containerEl;
    const cards = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null);
    cards[0].scrollIntoView({ block: "start" });
    const r = view.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  })()`);
  await sleep(800);
  console.log(JSON.stringify(await shot(clip, "/tmp/br-note.png")));

  console.log("④ 侧栏播放器截图");
  const side = await ev(`(async () => {
    await app.plugins.plugins["berry-radio"].activateView("sidebar");
    await new Promise(r => setTimeout(r, 2200));
    const el = app.workspace.getLeavesOfType("berry-radio-view")[0].view.containerEl;
    const r = el.querySelector(".br-now").getBoundingClientRect();
    return { x: Math.round(r.x) - 8, y: Math.round(r.y) - 8, width: Math.round(r.width) + 16, height: Math.round(r.height) + 16 };
  })()`);
  await sleep(500);
  console.log(JSON.stringify(await shot(side, "/tmp/br-sidebar.png")));

  console.log("⑤ 异常:", errors.length ? JSON.stringify(errors.slice(0, 2)) : "无");
  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
