/**
 * 0.6.0 真机截图：笔记卡片（compact）/ 空卡片 / 侧栏播放器
 * 先 reload 页面恢复干净状态，避免复用残留视图导致 rect 为空。
 */
const WebSocket = require("ws");
const fs = require("fs");
const PORT = 9223;

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === "page" && /index\.html/.test(t.url));
  if (!page) throw new Error("no vault page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise(r => ws.on("open", r));
  const send = (method, params = {}) => new Promise(res => {
    const mid = ++id; pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval error");
    return r.result?.result?.value;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.reload", { ignoreCache: true });
  await sleep(9000);

  const shot = async (clip, file) => {
    const r = await send("Page.captureScreenshot", {
      format: "png",
      clip: { ...clip, scale: 2 }
    });
    if (!r.result?.data) throw new Error(`${file}: ${JSON.stringify(r.error)}`);
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    console.log(JSON.stringify({ file, bytes: fs.statSync(file).size, ...clip }));
  };

  console.log("① 打开笔记预览 + 侧栏");
  console.log("  ", JSON.stringify(await ev(`(async () => {
    const file = app.vault.getAbstractFileByPath("验收测试.md");
    const visibleCards = () => [...document.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null);

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // 优先复用已经渲染出卡片的 leaf（reload 后 Obsidian 会恢复上次布局）
    let leaf = app.workspace.getLeavesOfType("markdown").find(l => l.view.containerEl.querySelector(".berry-radio"));
    if (!leaf) {
      leaf = app.workspace.getLeavesOfType("markdown")[0] || app.workspace.getLeaf(false);
      await leaf.openFile(file);
      await sleep(4500);
      // 编辑模式不渲染代码块处理器，必须切到预览
      if (leaf.getViewState().state?.mode !== "preview") {
        await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "preview" } });
        await sleep(4000);
      }
    }
    app.workspace.setActiveLeaf(leaf, { focus: true });
    // 目录请求可能还没回来，再给一轮时间
    if (!visibleCards().length) await sleep(4000);

    const p = app.plugins.plugins["berry-radio"];
    await p.activateView("sidebar");
    app.workspace.rightSplit?.expand?.();
    await new Promise(r => setTimeout(r, 2800));
    window.getSelection()?.removeAllRanges();
    return { cards: visibleCards().length, mode: leaf.getViewState().state?.mode, rightW: app.workspace.rightSplit?.collapsed === false };
  })()`)));
  await sleep(1500);

  console.log("①.5 点第一张卡片的播放键，让三处界面进入真实播放态");
  console.log("  ", JSON.stringify(await ev(`(async () => {
    const card = [...document.querySelectorAll(".berry-radio")].find(c => c.offsetParent !== null && c.getAttribute("data-state") !== "empty");
    card?.querySelector(".br-controls__btn--play")?.click();
    await new Promise(r => setTimeout(r, 3000));
    const p = app.plugins.plugins["berry-radio"];
    return { status: p.player?.status ?? "(n/a)", state: card?.getAttribute("data-state") };
  })()`)));
  await sleep(800);

  console.log("② 笔记卡片（两张）");
  const noteClip = await ev(`(() => {
    const cards = [...document.querySelectorAll(".berry-radio")].filter(c => c.offsetParent !== null && c.getAttribute("data-state") !== "empty");
    if (!cards.length) return null;
    const a = cards[0].getBoundingClientRect();
    const b = cards[cards.length - 1].getBoundingClientRect();
    const x = Math.max(0, Math.round(a.x) - 12);
    const y = Math.max(0, Math.round(a.y) - 12);
    return { x, y, width: Math.round(a.width) + 24, height: Math.round(b.bottom - a.y) + 24 };
  })()`);
  if (noteClip && noteClip.height > 20) await shot(noteClip, "/tmp/br-note.png");
  else console.log("note clip invalid:", JSON.stringify(noteClip));

  console.log("③ 空卡片");
  const emptyClip = await ev(`(() => {
    const c = [...document.querySelectorAll('.berry-radio[data-state="empty"]')].find(e => e.offsetParent !== null);
    if (!c) return null;
    c.scrollIntoView({ block: "center" });
    const r = c.getBoundingClientRect();
    return { x: Math.max(0, Math.round(r.x) - 12), y: Math.max(0, Math.round(r.y) - 12), width: Math.round(r.width) + 24, height: Math.round(r.height) + 24 };
  })()`);
  await sleep(700);
  const emptyClip2 = await ev(`(() => {
    const c = [...document.querySelectorAll('.berry-radio[data-state="empty"]')].find(e => e.offsetParent !== null);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.max(0, Math.round(r.x) - 12), y: Math.max(0, Math.round(r.y) - 12), width: Math.round(r.width) + 24, height: Math.round(r.height) + 24 };
  })()`);
  if (emptyClip2 && emptyClip2.height > 20) await shot(emptyClip2, "/tmp/br-empty.png");
  else console.log("empty clip invalid:", JSON.stringify(emptyClip2));

  console.log("④ 侧栏播放器");
  // 可能存在多个 leaf（隐藏空壳 + 真正可见的），必须挑有尺寸的那个
  const sideClip = await ev(`(() => {
    const leaves = app.workspace.getLeavesOfType("berry-radio-view");
    for (const leaf of leaves) {
      if (leaf.view.containerEl.getBoundingClientRect().width < 40) continue;
      const el = leaf.view.containerEl.querySelector(".br-now");
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) continue;
      return { x: Math.max(0, Math.round(r.x) - 10), y: Math.max(0, Math.round(r.y) - 10), width: Math.round(r.width) + 20, height: Math.round(r.height) + 20 };
    }
    return null;
  })()`);
  await sleep(500);
  if (sideClip && sideClip.height > 20) await shot(sideClip, "/tmp/br-sidebar.png");
  else console.log("sidebar clip invalid:", JSON.stringify(sideClip));

  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
