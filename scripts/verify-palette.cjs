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
    if (r.result?.exceptionDetails) return { __error: (r.result.exceptionDetails.exception?.description || "").slice(0, 300) };
    return r.result?.result?.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");

  console.log("① 配色断言：彩虹色相必须消失，强调色必须全局唯一");
  console.log(JSON.stringify(await ev(`(async () => {
    const file = app.vault.getAbstractFileByPath("验收测试.md");
    const leaf = app.workspace.getLeavesOfType("markdown")[0] || app.workspace.getLeaf(true);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "preview" } });
    await new Promise(r => setTimeout(r, 4000));
    await app.plugins.plugins["berry-radio"].activateView("sidebar");
    await new Promise(r => setTimeout(r, 2000));

    const cards = [...leaf.view.containerEl.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null);
    const themeAccent = getComputedStyle(document.body).getPropertyValue("--interactive-accent").trim();
    const nowEl = app.workspace.getLeavesOfType("berry-radio-view")[0].view.containerEl.querySelector(".br-now");

    const artOf = el => {
      const a = el.querySelector(".br-art");
      if (!a) return null;
      const cs = getComputedStyle(a);
      return {
        bg: cs.backgroundImage === "none" ? cs.backgroundColor : "GRADIENT(违规!)",
        shadow: cs.boxShadow
      };
    };

    return {
      themeAccent,
      cards: cards.map(c => {
        const cs = getComputedStyle(c);
        const play = c.querySelector(".br-controls__btn--play");
        return {
          state: c.getAttribute("data-state"),
          name: c.querySelector(".berry-radio__name")?.textContent,
          inlineHue: c.style.getPropertyValue("--br-hue") || "(none)",
          computedHue: cs.getPropertyValue("--br-hue").trim() || "(none)",
          accent: cs.getPropertyValue("--br-accent").trim(),
          beforeBg: getComputedStyle(c, "::before").backgroundImage,
          art: artOf(c),
          playBg: play ? getComputedStyle(play).backgroundColor : null
        };
      }),
      sidebar: {
        inlineHue: nowEl.style.getPropertyValue("--br-hue") || "(none)",
        computedHue: getComputedStyle(nowEl).getPropertyValue("--br-hue").trim() || "(none)",
        accent: getComputedStyle(nowEl).getPropertyValue("--br-accent").trim(),
        beforeBg: getComputedStyle(nowEl, "::before").backgroundImage,
        art: artOf(nowEl)
      }
    };
  })()`), null, 1));

  console.log("\n② 渲染异常:", errors.length ? JSON.stringify(errors.slice(0, 2)) : "无");
  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
