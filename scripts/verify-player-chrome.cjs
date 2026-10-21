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

  // 重载插件 + 打开侧栏（300px）
  await ev(`(async () => {
    await app.plugins.disablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 600));
    await app.plugins.enablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 1000));
    await app.plugins.plugins["berry-radio"].activateView("sidebar");
    await new Promise(r => setTimeout(r, 1800));
    const split = document.querySelector(".workspace-split.mod-right-split");
    if (split) split.style.width = "300px";
    await new Promise(r => setTimeout(r, 700));
    return "ready";
  })()`);

  const sidebarLeaf = `const sideLeaf = () => app.workspace.getLeavesOfType("berry-radio-view").map(l => l.view.containerEl).find(el => el.closest(".mod-right-split") && el.getBoundingClientRect().width > 40);`;

  // ① 底部空隙：状态栏显示 vs 隐藏
  const gapShown = await ev(`(() => {
    ${sidebarLeaf}
    const leaf = sideLeaf();
    const view = leaf.querySelector(".br-view");
    const now = leaf.querySelector(".br-now");
    const bar = document.querySelector(".status-bar");
    return {
      viewPaddingBottom: getComputedStyle(view).paddingBottom,
      insetVar: view.style.getPropertyValue("--br-status-inset"),
      statusBarH: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
      gapBelowNow: Math.round(leaf.getBoundingClientRect().bottom - now.getBoundingClientRect().bottom),
      statusBarTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
    };
  })()`);

  // 隐藏 Obsidian 状态栏（用户用「视图 → 状态栏」关掉时就是这个状态）
  await ev(`(async () => {
    const bar = document.querySelector(".status-bar");
    bar.style.display = "none";
    window.dispatchEvent(new Event("resize"));
    await new Promise(r => setTimeout(r, 400));
    app.workspace.trigger("layout-change");
    await new Promise(r => setTimeout(r, 600));
    return "hidden";
  })()`);

  const gapHidden = await ev(`(() => {
    ${sidebarLeaf}
    const leaf = sideLeaf();
    const view = leaf.querySelector(".br-view");
    const now = leaf.querySelector(".br-now");
    const bar = document.querySelector(".status-bar");
    return {
      viewPaddingBottom: getComputedStyle(view).paddingBottom,
      insetVar: view.style.getPropertyValue("--br-status-inset"),
      gapBelowNow: Math.round(leaf.getBoundingClientRect().bottom - now.getBoundingClientRect().bottom),
      statusBarVisible: bar ? getComputedStyle(bar).display !== "none" : false,
    };
  })()`);

  const bottomClip = await ev(`(() => {
    ${sidebarLeaf}
    const leaf = sideLeaf();
    const now = leaf.querySelector(".br-now").getBoundingClientRect();
    const b = leaf.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(now.top) - 40, width: Math.round(b.width), height: Math.min(120, Math.round(b.bottom - now.top) + 40) };
  })()`);
  await shot(bottomClip, "/tmp/br-gap-hidden.png");

  // 恢复状态栏
  await ev(`(() => { const bar = document.querySelector(".status-bar"); bar.style.display = ""; window.dispatchEvent(new Event("resize")); app.workspace.trigger("layout-change"); return "back"; })()`);
  await new Promise((r) => setTimeout(r, 700));

  // ② 播放图标：应为 pause
  const icon = await ev(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    ${sidebarLeaf}
    const name = (el) => {
      const svg = el && el.querySelector("svg");
      if (!svg) return null;
      const cls = svg.getAttribute("class") || "";
      const m = cls.match(/lucide-([a-z-]+)/);
      return m ? m[1] : (svg.getAttribute("data-icon") || cls || "unknown");
    };
    // QA 库里状态栏开关默认是关的，先打开才能验证它的图标
    const plugin = app.plugins.plugins["berry-radio"];
    plugin.settings.enableStatusBar = true;
    plugin.statusBar.setEnabled(true);
    const leaf = sideLeaf();
    leaf.querySelector(".br-row")?.click();
    await sleep(4000);
    window.getSelection()?.removeAllRanges();
    return {
      sidebar: name(leaf.querySelector(".br-now .br-controls__btn--play")),
      noteCards: [...document.querySelectorAll(".berry-radio")].filter(c => c.getAttribute("data-state") === "playing").map(c => name(c.querySelector(".br-controls__btn--play"))),
      statusBar: name(document.querySelector(".br-status .br-status__btn")),
    };
  })()`);

  // ③ ribbon 图标 → 应打开独立页面（主区域标签页），而不是右侧栏
  const ribbon = await ev(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // 关掉已有的电台视图，只留空白
    for (const l of app.workspace.getLeavesOfType("berry-radio-view")) l.detach();
    await sleep(900);
    const plugin = app.plugins.plugins["berry-radio"];
    const ribbonEl = plugin.ribbonEl;
    if (!ribbonEl) return { error: "找不到 ribbon 图标" };
    ribbonEl.click();
    await sleep(2200);
    const all = app.workspace.getLeavesOfType("berry-radio-view");
    return {
      count: all.length,
      inSidebar: all.filter(l => l.view.containerEl.closest(".mod-right-split")).length,
      inRoot: all.filter(l => l.view.containerEl.closest(".mod-root")).length,
    };
  })()`);

  const pageClip = await ev(`(() => {
    const l = app.workspace.getLeavesOfType("berry-radio-view").find(x => x.view.containerEl.closest(".mod-root"));
    if (!l) return null;
    const r = l.view.containerEl.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(Math.min(r.height, 620)) };
  })()`);
  if (pageClip) await shot(pageClip, "/tmp/br-page-view.png");

  const out = { gapShown, gapHidden, icon, ribbon };
  console.log(JSON.stringify(out, null, 2));

  const bad = [];
  if (gapShown.insetVar !== `${gapShown.statusBarH}px`) bad.push(`状态栏显示时留位不等于状态栏高度（${gapShown.insetVar} vs ${gapShown.statusBarH}px）`);
  if (gapHidden.insetVar !== "0px") bad.push(`状态栏隐藏后仍留了 ${gapHidden.insetVar}`);
  if (gapHidden.gapBelowNow > 1) bad.push(`状态栏隐藏时底部仍有 ${gapHidden.gapBelowNow}px 空隙`);
  if (icon.sidebar !== "pause") bad.push(`侧栏播放中图标是 ${icon.sidebar}，应为 pause`);
  if (icon.statusBar !== "pause") bad.push(`状态栏图标是 ${icon.statusBar}，应为 pause`);
  if (ribbon.inRoot !== 1) bad.push(`点 ribbon 后没有打开独立页面（inRoot=${ribbon.inRoot}）`);
  if (ribbon.inSidebar !== 0) bad.push(`点 ribbon 后仍开在右侧栏（inSidebar=${ribbon.inSidebar}）`);
  console.log(bad.length === 0 ? "PASS 暂停图标 / ribbon 打开页面 / 底部无空隙" : `FAIL\n- ${bad.join("\n- ")}`);
  ws.close();
  process.exit(bad.length === 0 ? 0 : 1);
})();
