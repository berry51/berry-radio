/**
 * 控制区断言（Obsidian CDP 真机）：
 *   1) 没有上一曲/下一曲按钮
 *   2) 播放键与音量在同一行，且垂直居中对齐
 *   3) 控制区只占一行（高度不超过播放键 + 少量余量）
 *   4) 播放中图标为「停止」，再点一次是真的停止（不是暂停）
 */
const WebSocket = require("ws");
const PORT = 9223;

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === "page" && /index\.html/.test(t.url));
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
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.reload", { ignoreCache: true });
  await new Promise(r => setTimeout(r, 9000));

  console.log("① 控制区结构（笔记卡片 + 侧栏）");
  console.log(JSON.stringify(await ev(`(async () => {
    const file = app.vault.getAbstractFileByPath("验收测试.md");
    const visibleCards = () => [...document.querySelectorAll(".berry-radio")].filter(c => c.getBoundingClientRect().width > 0);
    let leaf = app.workspace.getLeavesOfType("markdown").find(l => l.view.containerEl.querySelector(".berry-radio"));
    if (!leaf) {
      leaf = app.workspace.getLeavesOfType("markdown")[0] || app.workspace.getLeaf(false);
      await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "preview" } });
      await new Promise(r => setTimeout(r, 4000));
    }
    app.workspace.setActiveLeaf(leaf, { focus: true });
    // 预览是虚拟化的：不触发一次滚动，代码块处理器不会渲染出来
    const pv = leaf.view.containerEl.querySelector(".markdown-preview-view");
    if (pv) { pv.scrollTop = 0; pv.dispatchEvent(new Event("scroll")); }
    await new Promise(r => setTimeout(r, 2200));
    await app.plugins.plugins["berry-radio"].activateView("sidebar");
    app.workspace.rightSplit?.expand?.();
    await new Promise(r => setTimeout(r, 2500));

    const probe = root => {
      const transport = root.querySelector(".berry-radio__transport") || root.querySelector(".br-controls");
      if (!transport) return null;
      const btns = [...transport.querySelectorAll("button")];
      const play = transport.querySelector(".br-controls__btn--play");
      const vol = transport.querySelector(".br-volume");
      const t = transport.getBoundingClientRect();
      const p = play?.getBoundingClientRect();
      const v = vol?.getBoundingClientRect();
      return {
        buttons: btns.length,
        skipButtons: transport.querySelectorAll(".br-controls__btn--skip").length,
        sameRow: !!(p && v) && Math.abs((p.y + p.height / 2) - (v.y + v.height / 2)) <= 3,
        volCenterOffset: (p && v) ? Math.round((v.y + v.height / 2) - (p.y + p.height / 2)) : null,
        transportH: Math.round(t.height),
        playH: p ? Math.round(p.height) : null,
        singleRow: !!p && t.height <= p.height + 8,
        cardH: Math.round(root.getBoundingClientRect().height)
      };
    };

    const cards = visibleCards().filter(c => c.getAttribute("data-state") !== "empty");
    const sideLeaf = app.workspace.getLeavesOfType("berry-radio-view").find(l => l.view.containerEl.getBoundingClientRect().width > 40);
    const sideNow = sideLeaf?.view.containerEl.querySelector(".br-now");

    return { cards: cards.map(probe), sidebar: sideNow ? probe(sideNow) : null };
  })()`), null, 1));

  console.log("\n② 播放 → 图标应为「停止」，再点一次应真停止（不是暂停）");
  console.log(JSON.stringify(await ev(`(async () => {
    const card = [...document.querySelectorAll(".berry-radio")].find(c => c.getBoundingClientRect().width > 0 && c.getAttribute("data-state") !== "empty");
    const btn = card.querySelector(".br-controls__btn--play");
    const icon = () => btn.querySelector("svg")?.getAttribute("data-icon") || btn.textContent;
    btn.click();
    await new Promise(r => setTimeout(r, 3200));
    const p = app.plugins.plugins["berry-radio"];
    const playing = { state: card.getAttribute("data-state"), icon: icon(), status: p.player.snapshot().status };
    btn.click();
    await new Promise(r => setTimeout(r, 1200));
    const stopped = { state: card.getAttribute("data-state"), icon: icon(), status: p.player.snapshot().status, station: p.player.snapshot().station?.name ?? null };
    return { playing, stopped };
  })()`), null, 1));

  console.log("\n③ 渲染异常:", errors.length ? JSON.stringify(errors.slice(0, 2)) : "无");
  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
