const WebSocket = require("ws");
const fs = require("fs");
const PORT = 9223;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const page = (await res.json()).find(t => t.type === "page" && /index\.html/.test(t.url));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.on("message", raw => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
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

  console.log("空卡片截图");
  const clip = await ev(`(async () => {
    const leaf = app.workspace.getLeavesOfType("markdown")[0];
    const cards = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null);
    const empty = cards.find(c => c.getAttribute("data-state") === "empty");
    empty.scrollIntoView({ block: "center" });
    await new Promise(r => setTimeout(r, 600));
    const r = empty.getBoundingClientRect();
    return { x: Math.round(r.x) - 10, y: Math.round(r.y) - 10, width: Math.round(r.width) + 20, height: Math.round(r.height) + 20 };
  })()`);
  await sleep(500);
  console.log(JSON.stringify(await shot(clip, "/tmp/br-empty.png")));

  console.log("侧栏截图");
  const side = await ev(`(async () => {
    await app.plugins.plugins["berry-radio"].activateView("sidebar");
    await new Promise(r => setTimeout(r, 2000));
    const el = app.workspace.getLeavesOfType("berry-radio-view")[0].view.containerEl;
    const r = el.querySelector(".br-now").getBoundingClientRect();
    return { x: Math.round(r.x) - 8, y: Math.round(r.y) - 8, width: Math.round(r.width) + 16, height: Math.round(r.height) + 16 };
  })()`);
  await sleep(400);
  console.log(JSON.stringify(await shot(side, "/tmp/br-sidebar.png")));

  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
