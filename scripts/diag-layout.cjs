const WebSocket = require("ws");
const PORT = 9223;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const page = (await res.json()).find(t => t.type === "page" && /index\.html/.test(t.url));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise(r => ws.on("open", r));
  const send = (method, params = {}) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) return { __error: (r.result.exceptionDetails.exception?.description || "").slice(0, 300) };
    return r.result?.result?.value;
  };
  await send("Runtime.enable");

  console.log(JSON.stringify(await ev(`(() => {
    const leaves = app.workspace.getLeavesOfType("markdown");
    return {
      markdownLeaves: leaves.length,
      details: leaves.map(l => {
        const el = l.view.containerEl;
        const r = el.getBoundingClientRect();
        return {
          connected: el.isConnected,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          cards: el.querySelectorAll(".berry-radio").length,
          visible: el.offsetParent !== null,
          mode: l.view.getMode?.()
        };
      }),
      allCards: document.querySelectorAll(".berry-radio").length,
      activeLeafType: app.workspace.activeLeaf?.view?.getViewType?.()
    };
  })()`), null, 1));

  console.log(JSON.stringify(await ev(`(async () => {
    const leaves = app.workspace.getLeavesOfType("markdown");
    const leaf = leaves[0];
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await new Promise(r => setTimeout(r, 800));
    const cards = [...leaf.view.containerEl.querySelectorAll(".berry-radio")];
    return cards.slice(0, 2).map(c => {
      const r = c.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), offsetParent: c.offsetParent?.className ?? null, display: getComputedStyle(c).display };
    });
  })()`), null, 1));

  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
