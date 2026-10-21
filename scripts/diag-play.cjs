const WebSocket = require("ws");
const PORT = 9223;

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
  await send("Runtime.enable");

  console.log(JSON.stringify(await ev(`(() => {
    const view = app.workspace.getLeavesOfType("berry-radio-view")[0].view.containerEl;
    const side = view.querySelector(".br-controls__btn--play");
    const cs = getComputedStyle(side);
    const now = view.querySelector(".br-now");
    const leaf = app.workspace.getLeavesOfType("markdown")[0];
    const note = leaf.view.containerEl.querySelector(".berry-radio .br-controls__btn--play");
    const ns = getComputedStyle(note);
    return {
      side: {
        bg: cs.backgroundColor,
        color: cs.color,
        accentVar: getComputedStyle(now).getPropertyValue("--br-accent").trim(),
        accentSoft: getComputedStyle(now).getPropertyValue("--br-accent-soft").trim(),
        cls: side.className,
        disabled: side.disabled
      },
      note: {
        bg: ns.backgroundColor,
        color: ns.color,
        accentVar: getComputedStyle(note.closest(".berry-radio")).getPropertyValue("--br-accent").trim()
      }
    };
  })()`), null, 1));

  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
