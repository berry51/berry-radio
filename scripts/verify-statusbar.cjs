/**
 * 状态栏行为回归：
 * 1. 设置里开启后常驻显示（没有电台在播也在，停止后也不消失）
 * 2. 台名可点，弹出切台菜单（最近收听 / 收藏 / 搜索电台 / 打开面板）
 * 3. 播放键：播放中=停止；停止后再按=重播刚才那台
 * 4. 全程不切换当前笔记（activeLeaf 始终是原笔记）
 */
const WebSocket = require("ws");
const fs = require("fs");

const findPage = async () => {
  for (let i = 0; i < 40; i++) {
    const list = await fetch("http://127.0.0.1:9223/json/list").then((r) => r.json()).catch(() => []);
    const page = list.find((t) => t.type === "page" && /index\.html/.test(t.url));
    if (page) return page;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("找不到 Obsidian 库页面（CDP 9223）");
};

(async () => {
  const page = await findPage();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.once("open", r));
  let id = 0;
  const pending = new Map();
  ws.on("message", (m) => {
    const msg = JSON.parse(m);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };
  const shot = async (clip, file) => {
    const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 2 } } : {}) });
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    console.log("截图:", file);
  };
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 2, mobile: false });

  // 重载插件 + 打开侧栏 + 打开笔记
  await ev(`(async () => {
    await app.plugins.disablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 600));
    await app.plugins.enablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 1000));
    const plugin = app.plugins.plugins["berry-radio"];
    plugin.settings.enableStatusBar = true;
    plugin.statusBar.setEnabled(true);
    await plugin.activateView("sidebar");
    await new Promise(r => setTimeout(r, 1500));
    const file = app.vault.getAbstractFileByPath("验收测试.md");
    const leaf = app.workspace.getLeaf("tab");
    await leaf.openFile(file);
    await new Promise(r => setTimeout(r, 1500));
    await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "preview" } });
    await new Promise(r => setTimeout(r, 2000));
    const pv = leaf.view.containerEl.querySelector(".markdown-preview-view");
    if (pv) { pv.scrollTop = 0; pv.dispatchEvent(new Event("scroll")); }
    await new Promise(r => setTimeout(r, 1500));
    app.workspace.setActiveLeaf(leaf, { focus: true });
    return "ready";
  })()`);

  const SB = `const sbItem = () => document.querySelector(".status-bar-item.plugin-berry-radio");
    const sb = () => sbItem()?.querySelector(".br-status");`;

  // ① 空闲时常驻
  const idle = await ev(`(() => {
    ${SB}
    const el = sb();
    const item = sbItem();
    return {
      visible: !!el && getComputedStyle(el).display !== "none",
      hostVisible: !!item && getComputedStyle(item).display !== "none",
      text: el?.querySelector(".br-status__text")?.textContent,
      isIdle: el?.classList.contains("is-idle"),
      buttons: el ? el.querySelectorAll("button").length : 0,
    };
  })()`);

  // ② 播放中 → 停止 → 仍常驻
  const afterPlay = await ev(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    ${SB}
    const plugin = app.plugins.plugins["berry-radio"];
    const side = app.workspace.getLeavesOfType("berry-radio-view").map(l => l.view.containerEl).find(el => el.closest(".mod-right-split") && el.getBoundingClientRect().width > 40);
    side.querySelector(".br-row")?.click();
    await sleep(4000);
    const el = sb();
    const name = el?.querySelector(".br-status__text")?.textContent;
    const icon = el?.querySelector("button svg")?.getAttribute("class") || "";
    // 点播放键 = 停止
    el?.querySelector("button")?.click();
    await sleep(1500);
    const after = sb();
    return {
      name,
      icon,
      stillVisible: !!after && getComputedStyle(after).display !== "none",
      textAfterStop: after?.querySelector(".br-status__text")?.textContent,
      hostVisibleAfterStop: getComputedStyle(sbItem()).display !== "none",
      playerStation: plugin.player.snapshot().station,
      playerStatus: plugin.player.snapshot().status,
    };
  })()`);

  // ③ 停止后再按播放键 = 重播刚才那台
  const replay = await ev(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    ${SB}
    sb()?.querySelector("button")?.click();
    await sleep(4500);
    const plugin = app.plugins.plugins["berry-radio"];
    return {
      status: plugin.player.snapshot().status,
      station: plugin.player.snapshot().station?.name ?? null,
      text: sb()?.querySelector(".br-status__text")?.textContent,
    };
  })()`);

  // ④ 台名点击 → 切台菜单（且当前笔记不被切走）
  const menu = await ev(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    ${SB}
    const before = app.workspace.activeLeaf?.view?.file?.path ?? null;
    const text = sb()?.querySelector(".br-status__text");
    const r = text.getBoundingClientRect();
    text.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.x + 5, clientY: r.y + 5 }));
    await sleep(1200);
    const menuEl = document.querySelector(".br-menu");
    const items = menuEl ? [...menuEl.querySelectorAll(".br-menu__item")].map(i => i.textContent.trim()) : [];
    const headings = menuEl ? [...menuEl.querySelectorAll(".br-menu__heading")].map(i => i.textContent.trim()) : [];
    const after = app.workspace.activeLeaf?.view?.file?.path ?? null;
    return { menuOpen: !!menuEl, items, headings, noteBefore: before, noteAfter: after, noteKept: before === after };
  })()`);

  await shot(null, "/tmp/br-statusbar-menu.png").catch(() => {});

  // 关闭菜单
  await ev(`(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); return 1; })()`);
  await new Promise((r) => setTimeout(r, 600));

  // ⑤ 状态栏截图（只截状态栏区域）
  const sbClip = await ev(`(() => {
    const item = document.querySelector(".status-bar-item.plugin-berry-radio");
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: Math.round(r.x) - 8, y: Math.round(r.y) - 8, width: Math.round(r.width) + 16, height: Math.round(r.height) + 16 };
  })()`);
  if (sbClip) await shot(sbClip, "/tmp/br-statusbar.png");

  const out = { idle, afterPlay, replay, menu };
  console.log(JSON.stringify(out, null, 2));

  const bad = [];
  if (!idle.visible || !idle.hostVisible) bad.push("空闲时状态栏没有常驻显示");
  if (idle.text !== "选择电台") bad.push(`空闲时台名文案是「${idle.text}」，应为「选择电台」`);
  if (idle.buttons !== 2) bad.push(`状态栏按钮数 ${idle.buttons}，应为 2（播放 + 切台）`);
  if (!afterPlay.stillVisible || !afterPlay.hostVisibleAfterStop) bad.push("停止后状态栏消失了");
  if (afterPlay.playerStatus !== "idle") bad.push(`点播放键后状态是 ${afterPlay.playerStatus}，应为 idle`);
  if (!afterPlay.textAfterStop) bad.push("停止后台名丢失");
  if (replay.status !== "playing") bad.push(`停止后再按播放键状态是 ${replay.status}，应重新播放`);
  if (!menu.menuOpen) bad.push("点台名没有弹出切台菜单");
  if (!menu.headings.includes("最近收听")) bad.push("菜单缺少「最近收听」分组");
  if (!menu.items.some((t) => t.includes("搜索电台"))) bad.push("菜单缺少「搜索电台」");
  if (!menu.items.some((t) => t.includes("CNR-1"))) bad.push("菜单里没有最近收听的电台");
  if (!menu.noteKept) bad.push(`打开菜单时当前笔记被切走（${menu.noteBefore} → ${menu.noteAfter}）`);
  console.log(bad.length === 0 ? "PASS 状态栏常驻 / 可切台 / 停止不消失 / 不离开笔记" : `FAIL\n- ${bad.join("\n- ")}`);
  ws.close();
  process.exit(bad.length === 0 ? 0 : 1);
})();
