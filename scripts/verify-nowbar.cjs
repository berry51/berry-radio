/**
 * 侧栏播放器布局回归：单行 · 音量滑块与轨道/行严格居中 · 与列表只用发丝线分隔。
 * 用法：先以 CDP 9223 启动 QA 实例，然后
 *   NODE_PATH=<node workspace>/node_modules node scripts/verify-nowbar.cjs
 */
const WebSocket = require("ws");
const fs = require("fs");

async function findPage() {
  for (let i = 0; i < 40; i++) {
    const list = await fetch("http://127.0.0.1:9223/json/list")
      .then((r) => r.json())
      .catch(() => []);
    const page = list.find((t) => t.type === "page" && /index\.html/.test(t.url));
    if (page) return page;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("找不到 Obsidian 库页面（CDP 9223）");
}

(async () => {
  const page = await findPage();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.once("open", r));

  let id = 0;
  const pending = new Map();
  ws.on("message", (m) => {
    const msg = JSON.parse(m);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };
  const shoot = async (clip, file) => {
    const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    console.log("截图:", file);
  };

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 2, mobile: false });

  await evaluate(`(async () => {
    await app.plugins.disablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 600));
    await app.plugins.enablePlugin("berry-radio");
    await new Promise(r => setTimeout(r, 1000));
    const plugin = app.plugins.plugins["berry-radio"];
    await plugin.activateView("sidebar");
    await new Promise(r => setTimeout(r, 1800));
    const split = document.querySelector(".workspace-split.mod-right-split");
    if (split) split.style.width = "300px";
    await new Promise(r => setTimeout(r, 600));
    return "ready";
  })()`);

  const NEAR = `const leaf = app.workspace.getLeavesOfType("berry-radio-view").map(l => l.view.containerEl).find(el => el.closest(".mod-right-split") && el.offsetParent !== null);
    if (!leaf) return { error: "侧栏视图不可见" };
    const now = leaf.querySelector(".br-now");`;

  const measure = (label) => `(() => {
    ${NEAR}
    const row = now.querySelector(".br-now__row");
    const track = now.querySelector(".br-volume__track");
    const thumb = now.querySelector(".br-volume__thumb");
    const play = now.querySelector(".br-controls__btn--play");
    const cs = getComputedStyle(now);
    const cy = (el) => { const r = el.getBoundingClientRect(); return +(r.y + r.height / 2).toFixed(2); };
    const rr = (el) => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    return {
      label: ${JSON.stringify(label)},
      sidebarWidth: +leaf.getBoundingClientRect().width.toFixed(0),
      rows: now.querySelectorAll(".br-now__row").length,
      height: +now.getBoundingClientRect().height.toFixed(1),
      borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join("/"),
      background: cs.backgroundColor,
      thumbMinusTrack: +(cy(thumb) - cy(track)).toFixed(2),
      thumbMinusRow: +(cy(thumb) - cy(row)).toFixed(2),
      playMinusRow: +(cy(play) - cy(row)).toFixed(2),
      thumb: rr(thumb),
      play: rr(play),
      radii: [getComputedStyle(track).borderRadius, getComputedStyle(thumb).borderRadius, getComputedStyle(play).borderRadius].join("/"),
    };
  })()`;

  const empty = await evaluate(measure("空态"));
  const emptyClip = await evaluate(`(() => {
    const leaf = app.workspace.getLeavesOfType("berry-radio-view").map(l => l.view.containerEl).find(el => el.closest(".mod-right-split") && el.offsetParent !== null);
    const r = leaf.querySelector(".br-now").getBoundingClientRect();
    return { x: Math.round(r.x) - 4, y: Math.round(r.y) - 4, width: Math.round(r.width) + 8, height: Math.round(r.height) + 8 };
  })()`);
  await shoot(emptyClip, "/tmp/br-nowbar-empty.png");

  await evaluate(`(async () => {
    const leaf = app.workspace.getLeavesOfType("berry-radio-view").map(l => l.view.containerEl).find(el => el.closest(".mod-right-split") && el.offsetParent !== null);
    leaf.querySelector(".br-row")?.click();
    await new Promise(r => setTimeout(r, 3200));
    window.getSelection()?.removeAllRanges();
    return "playing";
  })()`);

  const playing = await evaluate(measure("播放中"));
  const playingClip = await evaluate(`(() => {
    const leaf = app.workspace.getLeavesOfType("berry-radio-view").map(l => l.view.containerEl).find(el => el.closest(".mod-right-split") && el.offsetParent !== null);
    const now = leaf.querySelector(".br-now");
    const list = leaf.querySelector(".br-list").getBoundingClientRect();
    const r = now.getBoundingClientRect();
    return { x: Math.round(r.x) - 4, y: Math.round(r.y) - 64, width: Math.round(r.width) + 8, height: Math.round(r.height) + 68 };
  })()`);
  await shoot(playingClip, "/tmp/br-nowbar-playing.png");

  const sidebarShot = await evaluate(`(() => {
    const leaf = app.workspace.getLeavesOfType("berry-radio-view").map(l => l.view.containerEl).find(el => el.closest(".mod-right-split") && el.offsetParent !== null);
    const r = leaf.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  })()`);
  await shoot(sidebarShot, "/tmp/br-sidebar.png");

  console.log(JSON.stringify({ empty, playing }, null, 2));

  const bad = [];
  for (const s of [empty, playing]) {
    if (s.error) bad.push(s.error);
    if (s.rows !== 1) bad.push(`${s.label || s.label}: 不是单行（${s.rows}）`);
    if (Math.abs(s.thumbMinusTrack) > 0.5) bad.push(`${s.label}: 滑块与轨道中心偏差 ${s.thumbMinusTrack}px`);
    if (Math.abs(s.thumbMinusRow) > 0.5) bad.push(`${s.label}: 滑块与行中心偏差 ${s.thumbMinusRow}px`);
    if (s.borders !== "1px/0px/0px/0px") bad.push(`${s.label}: 分隔线不是仅顶部发丝线（${s.borders}）`);
    if (s.background !== "rgba(0, 0, 0, 0)" && s.background !== "transparent") bad.push(`${s.label}: 播放器仍有背景色块（${s.background}）`);
    if (s.radii !== "0px/0px/0px") bad.push(`${s.label}: 出现圆角（${s.radii}）`);
  }
  console.log(bad.length === 0 ? "PASS 侧栏播放器：单行 / 居中 / 发丝线分隔 / 无背景块" : `FAIL\n- ${bad.join("\n- ")}`);
  ws.close();
  process.exit(bad.length === 0 ? 0 : 1);
})();
