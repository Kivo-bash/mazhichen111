/* 胶囊笔记：像备忘录一样直接在排好版的文档上编辑（保存为 Markdown），
 * 文中的数字胶囊可以就地输入、拖动、重抽；界面是 iOS 26 式的液态玻璃（按元素尺寸生成透镜折射）。
 * 气泡、对话框、弹窗、提示、步进器、滑块、侧边面板来自 Framework7。 */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = MD.escape;
  const STORE = "capsule-notes:v2";
  const OLD_STORE = "capsule-notes:v1";
  const TOKEN = /\{\{(c_[a-z0-9]+)\}\}/g;
  const COLORS = [["amber", "琥珀"], ["sky", "天蓝"], ["violet", "紫罗兰"], ["teal", "青绿"], ["coral", "珊瑚"], ["lime", "青柠"], ["rose", "玫瑰"], ["indigo", "靛蓝"]];
  const NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const uid = (p) => p + Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "x").padEnd(6, "0");
  const tok = (id) => `{{${id}}}`;

  /* ================= 示例文档 ================= */
  const range = (id, name, source, min, max, decimals, def, unit, color) => ({ id, name, kind: "range", source, min, max, decimals, def, formula: "", unit, color });
  const formula = (id, name, f, decimals, unit, color) => ({ id, name, kind: "formula", source: "random", min: 0, max: 100, decimals, def: null, formula: f, unit, color });
  function sampleDocs() {
    const coffee = {
      id: "d_coffee", title: "浓缩咖啡配方校准", updated: Date.now(),
      body: [
        "# 浓缩咖啡配方校准",
        "",
        "调整粉量、液重与萃取时间，观察粉液比与萃取率如何随之变化。",
        "",
        "## 配方参数",
        "",
        "下面每一项都设定了一个合理区间。带铅笔的胶囊可以填入你实际称量的数字；带骰子的胶囊点一下，会在区间内重新抽取一个值。",
        "",
        "{{c_dose}} {{c_yield}} {{c_tds}} {{c_time}}",
        "",
        "## 由此推导",
        "",
        "{{c_ratio}} {{c_flow}} {{c_ey}} {{c_ok}}",
        "",
        "> 萃取率落在 18% 到 22% 之间时，酸甜的平衡通常最容易被感知。判断为 1 表示落在这个区间里。",
        "",
      ].join("\n"),
      capsules: {
        c_dose: range("c_dose", "粉量", "input", 16, 20, 1, 18, "g", "amber"),
        c_yield: range("c_yield", "液重", "input", 30, 45, 1, 36, "g", "sky"),
        c_tds: range("c_tds", "浓度", "random", 8, 12, 1, null, "%", "violet"),
        c_time: range("c_time", "萃取时间", "random", 22, 34, 0, null, "s", "teal"),
        c_ratio: formula("c_ratio", "粉液比", "液重 / 粉量", 1, ":1", "coral"),
        c_flow: formula("c_flow", "出液流速", "液重 / 萃取时间", 2, "g/s", "lime"),
        c_ey: formula("c_ey", "萃取率", "液重 * 浓度 / 粉量", 1, "%", "rose"),
        c_ok: formula("c_ok", "判断", "if(萃取率 >= 18, if(萃取率 <= 22, 1, 0), 0)", 0, "", "indigo"),
      },
      values: { c_tds: 9.5, c_time: 28 },
    };
    const dinner = {
      id: "d_dinner", title: "周末聚餐计划", updated: Date.now() - 60000,
      body: [
        "# 周末聚餐计划",
        "",
        "约朋友来家里吃饭，先把人数和预算定下来。",
        "",
        "这周六约了 {{c_people}} 位朋友，每人预算 {{c_budget}}，总预算就是 {{c_total}}。",
        "",
        "## 今天的运气",
        "",
        "- 掷骰子决定谁洗碗：{{c_dice}}",
        "- 超市会员折扣抽到了 {{c_disc}}，实付只要 {{c_pay}}",
        "",
        "## 采购清单",
        "",
        "| 食材 | 数量 | 备注 |",
        "| --- | --- | --- |",
        "| 牛肉 | {{c_beef}} | 每人约 250 克 |",
        "| 蔬菜 | 3 份 | 随意搭配 |",
        "",
        "- [x] 订好时间",
        "- [ ] 买食材",
        "",
      ].join("\n"),
      capsules: {
        c_people: range("c_people", "人数", "input", 2, 12, 0, 6, "位", "teal"),
        c_budget: range("c_budget", "每人预算", "input", 50, 300, 0, 120, "元", "amber"),
        c_total: formula("c_total", "总预算", "人数 * 每人预算", 0, "元", "coral"),
        c_dice: range("c_dice", "骰子", "random", 1, 6, 0, null, "点", "violet"),
        c_disc: range("c_disc", "折扣", "random", 0.7, 0.95, 2, null, "", "lime"),
        c_pay: formula("c_pay", "实付", "round(总预算 * 折扣)", 0, "元", "rose"),
        c_beef: formula("c_beef", "牛肉", "人数 * 0.25", 2, "kg", "sky"),
      },
      values: {},
    };
    return [coffee, dinner];
  }

  /* ================= 存储 ================= */
  function load() {
    for (const key of [STORE, OLD_STORE]) {
      try {
        const s = JSON.parse(localStorage.getItem(key));
        if (s && Array.isArray(s.docs) && s.docs.length) {
          s.docs.forEach((d) => { d.capsules = d.capsules || {}; d.values = d.values || {}; d.body = d.body || ""; d.title = d.title || "未命名文档"; });
          return s;
        }
      } catch (e) { /* 存储不可用时从示例开始 */ }
    }
    const docs = sampleDocs();
    return { docs, currentId: docs[0].id, mode: "view", showFx: false };
  }
  const state = load();
  if (!state.docs.some((d) => d.id === state.currentId)) state.currentId = state.docs[0].id;
  const cur = () => state.docs.find((d) => d.id === state.currentId);

  let saveTimer = 0, savedAt = null;
  function touch() {
    cur().updated = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 350);
    scheduleHistory();
    renderStatus("正在保存…");
  }
  function persist() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(STORE, JSON.stringify(state)); savedAt = new Date(); renderStatus(); }
    catch (e) { renderStatus("无法保存到浏览器存储，刷新后改动会丢失"); }
  }

  /* ================= 撤销 / 重做 ================= */
  const hist = new Map();
  const snap = (d) => JSON.stringify({ title: d.title, body: d.body, capsules: d.capsules, values: d.values });
  function H() {
    const d = cur();
    if (!hist.has(d.id)) hist.set(d.id, { past: [], future: [], last: snap(d) });
    return hist.get(d.id);
  }
  let histTimer = 0;
  function scheduleHistory() { clearTimeout(histTimer); histTimer = setTimeout(commitHistory, 450); }
  function commitHistory() {
    clearTimeout(histTimer);
    const h = H(), s = snap(cur());
    if (s !== h.last) {
      h.past.push(h.last);
      if (h.past.length > 200) h.past.shift();
      h.last = s;
      h.future = [];
    }
    updateUndoButtons();
  }
  function restore(s) {
    const d = cur();
    Object.assign(d, JSON.parse(s));
    d.updated = Date.now();
    closeCurrent();
    renderAll();
    H().last = snap(d);
    persist();
    updateUndoButtons();
  }
  function undo() {
    commitHistory();
    const h = H();
    if (!h.past.length) return;
    h.future.push(h.last);
    restore(h.past.pop());
  }
  function redo() {
    commitHistory();
    const h = H();
    if (!h.future.length) return;
    h.past.push(h.last);
    restore(h.future.pop());
  }
  function updateUndoButtons() {
    const h = H();
    $("#undo").classList.toggle("disabled", !h.past.length && snap(cur()) === h.last);
    $("#redo").classList.toggle("disabled", !h.future.length);
  }


  /* ================= 胶囊求值 ================= */
  const capsOf = (d) => Object.values(d.capsules);
  const byName = (d, name) => capsOf(d).find((c) => c.name === name);
  const decimalsOf = (c) => clampInt(c.decimals, 0, 6);
  function clampInt(v, lo, hi) { v = Math.round(+v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo; }
  function roundTo(v, dec) { const k = Math.pow(10, dec); return Math.round(Number((v * k).toPrecision(15))) / k; }
  function bounds(c) { const a = +c.min, b = +c.max; return [Math.min(a, b), Math.max(a, b)]; }
  function randomIn(c) {
    const [lo, hi] = bounds(c), k = Math.pow(10, decimalsOf(c));
    const steps = Math.round((hi - lo) * k);
    return roundTo(lo + Math.floor(Math.random() * (steps + 1)) / k, decimalsOf(c));
  }
  function clampToRange(c, v) { const [lo, hi] = bounds(c); return roundTo(Math.min(hi, Math.max(lo, v)), decimalsOf(c)); }
  function initialValue(c) {
    if (c.source === "random") return randomIn(c);
    const [lo] = bounds(c);
    return clampToRange(c, typeof c.def === "number" && Number.isFinite(c.def) ? c.def : lo);
  }
  function valueOf(d, c, stack = new Set()) {
    if (c.kind === "formula") {
      if (stack.has(c.id)) throw new Error("公式出现了循环引用");
      stack.add(c.id);
      try {
        const { ast } = Expr.compile(c.formula);
        const v = Expr.evaluate(ast, (name) => { const o = byName(d, name); return o ? valueOf(d, o, stack) : undefined; });
        if (!Number.isFinite(v)) throw new Error("结果不是有效的数字（可能除以了 0）");
        return v;
      } finally { stack.delete(c.id); }
    }
    let v = d.values[c.id];
    if (typeof v !== "number" || !Number.isFinite(v)) { v = initialValue(c); d.values[c.id] = v; }
    return v;
  }
  function safeValue(d, c) { try { return { v: valueOf(d, c) }; } catch (e) { return { err: e.message }; } }
  /* 区间胶囊固定小数位（18.0）；公式胶囊按设定位数显示 */
  const numText = (c, v) => v.toLocaleString("zh-CN", { minimumFractionDigits: decimalsOf(c), maximumFractionDigits: decimalsOf(c), useGrouping: Math.abs(v) >= 10000 });
  const fullText = (c, v) => numText(c, v) + (c.unit ? (/^[%‰°:]/.test(c.unit) ? "" : " ") + c.unit : "");
  const kindKey = (c) => (c.kind === "formula" ? "formula" : c.source === "input" ? "input" : "random");
  const kindLabel = { random: "随机", input: "填写", formula: "公式" };

  /* 标题单独存放：正文开头如果是「# 标题」就去掉，避免和大标题重复 */
  function stripTitleLine(d) {
    const m = d.body.match(/^\s*# (.+)\n*/);
    if (m) { if (!d.title || d.title === "未命名文档") d.title = m[1].trim(); d.body = d.body.slice(m[0].length); }
  }
  state.docs.forEach(stripTitleLine);

  /* 胶囊的 HTML：· 名称  数值/输入框  单位  [设置]；在可编辑正文里整体不可编辑 */
  const HINT = { random: "点一下重新抽取", input: "直接输入数字，或按住左右拖动调整", formula: "由公式算出，悬停查看算式" };
  function pillHTML(d, id) {
    const c = d.capsules[id];
    if (!c) return `<span class="pill err" contenteditable="false" data-id="${id}" title="这个胶囊已被删除，可以直接删掉"><span class="lb">已删除</span><b class="v">?</b></span>`;
    const r = safeValue(d, c), k = kindKey(c);
    const val = r.err ? "!" : numText(c, r.v);
    const ex = k === "formula" ? `<span class="ex">${esc(Expr.pretty(c.formula))} =</span>` : "";
    const main = k === "input" && !r.err
      ? `<input class="pv" type="text" inputmode="decimal" value="${esc(r.v.toFixed(decimalsOf(c)))}" size="${Math.max(2, val.length)}" aria-label="${esc(c.name)}" spellcheck="false" autocomplete="off">`
      : `<b class="v">${esc(val)}</b>`;
    const unit = c.unit && !r.err ? `<span class="u">${esc(c.unit)}</span>` : "";
    return `<span class="pill${r.err ? " err" : ""}" contenteditable="false" data-id="${id}" data-kind="${k}" data-color="${c.color}" title="${esc(c.name)} · ${esc(r.err || HINT[k])}">`
      + `<span class="lb">${esc(c.name)}</span>${ex}${main}${unit}`
      + `<button class="cfg" type="button" tabindex="-1" aria-label="设置「${esc(c.name)}」" title="设置"><i class="f7-icons">slider_horizontal_3</i></button></span>`;
  }
  /* 设置气泡里的预览用：只要内容，不要外壳 */
  function pillInner(d, c) {
    const r = safeValue(d, c), k = kindKey(c);
    return { r, k, html: `<span class="lb">${esc(c.name)}</span><b class="v">${esc(r.err ? "!" : numText(c, r.v))}</b>${c.unit && !r.err ? `<span class="u">${esc(c.unit)}</span>` : ""}` };
  }

  /* ================= Framework7 ================= */
  const f7 = new Framework7({
    el: "#app",
    theme: "ios",
    darkMode: false,
    colors: { primary: "#ff3b30" },
    popover: { backdrop: false, closeByOutsideClick: true, closeOnEscape: false },
    toast: { closeTimeout: 1300, position: "center" },
    dialog: { buttonOk: "好", buttonCancel: "取消" },
  });
  const toast = (text) => f7.toast.create({ text, destroyOnClose: true }).open();

  /* ================= 液态玻璃：按元素尺寸生成透镜位移图 =================
   * 苹果的液态玻璃是一块透镜：中间几乎完全透明、不模糊，只有靠近边缘的一圈会把背后的内容折弯。
   * 这里为每块玻璃生成一张位移图：中心为零，越靠近圆角矩形的边缘位移越大（凸透镜的弧面曲线），
   * 交给 SVG feDisplacementMap 作为 backdrop-filter 使用（Chromium 内核支持）；其它浏览器退回普通磨砂。 */
  const Lens = (() => {
    const NS = "http://www.w3.org/2000/svg";
    const defs = $("#lensDefs");
    const ok = !reduceMotion && !!navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand)) && CSS.supports("backdrop-filter", "blur(1px)");
    if (ok) document.documentElement.classList.add("lens-on");
    let n = 0;
    function mapURL(w, h, r, bezel) {
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const g = cv.getContext("2d"), img = g.createImageData(w, h), D = img.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const px = x + 0.5, py = y + 0.5;
          const qx = Math.min(Math.max(px, r), w - r), qy = Math.min(Math.max(py, r), h - r);
          let nx = px - qx, ny = py - qy, dist;
          const len = Math.hypot(nx, ny);
          if (len > 0) { dist = r - len; nx /= len; ny /= len; }
          else {
            const dl = px, dr = w - px, dt = py, db = h - py;
            dist = Math.min(dl, dr, dt, db);
            if (dist === dl) { nx = -1; ny = 0; } else if (dist === dr) { nx = 1; ny = 0; } else if (dist === dt) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
          }
          let dx = 0, dy = 0;
          if (dist >= 0 && dist < bezel) {
            const t = 1 - dist / bezel;
            const m = 1 - Math.sqrt(Math.max(0, 1 - t * t));
            dx = -nx * m; dy = -ny * m;
          }
          const i = (y * w + x) * 4;
          D[i] = 128 + dx * 127; D[i + 1] = 128 + dy * 127; D[i + 2] = 128; D[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return cv.toDataURL();
    }
    function attach(el, { bezel = 20, scale = 44, blur = 0.6, sat = 1.9 } = {}) {
      if (!ok || !el) return;
      const id = `lens-${++n}`;
      const f = document.createElementNS(NS, "filter");
      f.setAttribute("id", id);
      f.setAttribute("x", "0"); f.setAttribute("y", "0"); f.setAttribute("width", "100%"); f.setAttribute("height", "100%");
      f.setAttribute("color-interpolation-filters", "sRGB");
      const im = document.createElementNS(NS, "feImage");
      im.setAttribute("x", "0"); im.setAttribute("y", "0"); im.setAttribute("preserveAspectRatio", "none"); im.setAttribute("result", "map");
      const dm = document.createElementNS(NS, "feDisplacementMap");
      dm.setAttribute("in", "SourceGraphic"); dm.setAttribute("in2", "map"); dm.setAttribute("scale", String(scale));
      dm.setAttribute("xChannelSelector", "R"); dm.setAttribute("yChannelSelector", "G");
      f.append(im, dm);
      defs.append(f);
      let lastKey = "";
      const update = () => {
        const rect = el.getBoundingClientRect();
        const w = Math.round(rect.width), h = Math.round(rect.height);
        if (!w || !h) return;
        const cs = getComputedStyle(el);
        const rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
        const key = `${w}x${h}x${rad}`;
        if (key === lastKey) return;
        lastKey = key;
        im.setAttribute("width", w); im.setAttribute("height", h);
        im.setAttribute("href", mapURL(w, h, rad, Math.min(bezel, Math.max(rad, 8))));
        const bf = `url(#${id}) blur(${blur}px) saturate(${sat}) brightness(1.04)`;
        el.style.backdropFilter = bf;
        el.style.webkitBackdropFilter = bf;
      };
      new ResizeObserver(update).observe(el);
      update();
      el.classList.add("lens");
    }
    return { attach, ok };
  })();

  /* ================= 整体渲染 ================= */
  const app = $("#app"), docEl = $("#doc"), titleEl = $("#docTitle");
  function prune(d) {
    const used = new Set([...d.body.matchAll(TOKEN)].map((m) => m[1]));
    Object.keys(d.capsules).forEach((id) => { if (!used.has(id)) { delete d.capsules[id]; delete d.values[id]; } });
  }
  function renderAll() {
    const d = cur();
    if (document.activeElement !== titleEl) titleEl.textContent = d.title || "";
    document.title = `${d.title || "未命名文档"} · 胶囊笔记`;
    renderDocList();
    renderDoc();
    H();
    renderStatus();
    updateUndoButtons();
  }
  function renderStatus(msg) {
    const d = cur();
    const n = new Set([...d.body.matchAll(TOKEN)].map((m) => m[1])).size;
    const saved = msg || (savedAt ? `已保存 ${savedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "自动保存");
    $("#status").textContent = `${n} 个胶囊 · ${saved}`;
  }

  /* 标题：直接在大标题上改 */
  titleEl.addEventListener("input", () => {
    cur().title = titleEl.textContent.replace(/\s+/g, " ").trim();
    document.title = `${cur().title || "未命名文档"} · 胶囊笔记`;
    touch();
    renderDocList();
  });
  titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); docEl.focus(); placeCaret(docEl.firstElementChild || docEl, true); }
  });
  titleEl.addEventListener("blur", () => { if (!cur().title) { cur().title = "未命名文档"; titleEl.textContent = cur().title; renderDocList(); touch(); } });

  /* ================= 侧边栏（Framework7 浮动面板，宽屏常驻） ================= */
  const WIDE = 960;
  const isWide = () => innerWidth >= WIDE;
  const panel = f7.panel.create({ el: "#sidebar", visibleBreakpoint: WIDE, swipe: true });
  /* 面板停靠在左侧时，正文和底部悬浮区一起右移，靠左对齐 */
  function syncSide() { app.dataset.side = panel.el.classList.contains("panel-in-breakpoint") ? "docked" : "float"; }
  panel.on("breakpoint", syncSide);
  addEventListener("resize", () => setTimeout(syncSide, 0));
  syncSide();
  $("#sidebarBtn").addEventListener("click", () => {
    if (isWide()) { panel.toggleVisibleBreakpoint(); setTimeout(syncSide, 0); }
    else if (panel.opened) panel.close(); else panel.open();
  });
  const narrowClose = () => { if (!isWide() && panel.opened) panel.close(); };

  function renderDocList() {
    const q = $("#search").value.trim().toLowerCase();
    const docs = [...state.docs].sort((a, b) => b.updated - a.updated)
      .filter((d) => !q || (d.title + "\n" + d.body.replace(TOKEN, (_, id) => d.capsules[id]?.name || "")).toLowerCase().includes(q));
    $("#docCount").textContent = state.docs.length;
    const canDelete = state.docs.length > 1;
    $("#docList ul").innerHTML = docs.length ? docs.map((d) => `
      <li class="${canDelete ? "swipeout " : ""}${d.id === state.currentId ? "on" : ""}" data-id="${d.id}">
        ${canDelete ? '<div class="swipeout-content">' : ""}
        <div class="item-content" role="button" tabindex="0"${d.id === state.currentId ? ' aria-current="page"' : ""}>
          <div class="item-media"><i class="f7-icons">doc_text</i></div>
          <div class="item-inner"><div class="item-title">${esc(d.title || "未命名文档")}
            <div class="item-footer">${new Date(d.updated).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${Object.keys(d.capsules).length} 个胶囊</div></div></div>
        </div>
        ${canDelete ? `</div><div class="swipeout-actions-right"><a class="swipeout-delete" data-confirm="「${esc(d.title || "未命名文档")}」会被删除，且无法恢复。" data-confirm-title="删除文档？">删除</a></div>` : ""}
      </li>`).join("") : '<li class="empty">没有匹配的文档</li>';
  }
  $("#search").addEventListener("input", renderDocList);
  $("#searchForm .input-clear-button").addEventListener("click", () => { $("#search").value = ""; renderDocList(); });
  function openDoc(id) {
    narrowClose();
    if (id === state.currentId) return;
    closeCurrent();
    commitHistory();
    prune(cur());
    state.currentId = id;
    persist();
    renderAll();
    $("#scroller").scrollTop = 0;
  }
  function newDoc() {
    closeCurrent();
    commitHistory();
    const d = { id: uid("d_"), title: "未命名文档", updated: Date.now(), body: "# 未命名文档\n\n在这里写一句简介。\n\n", capsules: {}, values: {} };
    state.docs.push(d);
    state.currentId = d.id;
    $("#search").value = "";
    narrowClose();
    renderAll();
    persist();
    titleEl.focus();
    placeCaret(titleEl);
    document.execCommand("selectAll");
  }
  function renameDoc(d = cur()) {
    f7.dialog.prompt("", "给文档起个名字", (v) => {
      v = String(v).trim();
      if (!v || v === d.title) return;
      d.title = v;
      d.updated = Date.now();
      if (d === cur()) touch(); else persist();
      renderAll();
    }, null, d.title);
  }
  function removeDoc(id) {
    state.docs = state.docs.filter((x) => x.id !== id);
    hist.delete(id);
    if (state.currentId === id) state.currentId = [...state.docs].sort((a, b) => b.updated - a.updated)[0].id;
    persist();
    renderAll();
    toast("已删除");
  }
  function deleteDoc(d) {
    if (state.docs.length < 2) { toast("至少要保留一篇文档"); return; }
    f7.dialog.confirm(`「${esc(d.title || "未命名文档")}」会被删除，且无法恢复。`, "删除文档？", () => removeDoc(d.id));
  }
  function docActions(d) {
    f7.dialog.create({
      title: esc(d.title || "未命名文档"),
      verticalButtons: true,
      buttons: [{ text: "重命名" }, { text: "删除文档", color: "red" }, { text: "取消", bold: true }],
      onClick(dialog, i) { if (i === 0) renameDoc(d); else if (i === 1) deleteDoc(d); },
      destroyOnClose: true,
    }).open();
  }
  const docListEl = $("#docList");
  docListEl.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li || e.target.closest(".swipeout-actions-right") || li.classList.contains("swipeout-opened")) return;
    openDoc(li.dataset.id);
  });
  docListEl.addEventListener("keydown", (e) => {
    const li = e.target.closest("li[data-id]");
    if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDoc(li.dataset.id); }
  });
  docListEl.addEventListener("swipeout:deleted", (e) => {
    const li = e.target.closest("li[data-id]");
    if (li) removeDoc(li.dataset.id);
  });
  docListEl.addEventListener("contextmenu", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    e.preventDefault();
    docActions(state.docs.find((x) => x.id === li.dataset.id));
  });
  $("#newDoc").addEventListener("click", newDoc);
  /* ================= 气泡（Framework7 popover） ================= */
  let current = null; // { anchor, popover, cancel }
  function openPop(anchor, html, cls, onClosed) {
    closeCurrent();
    const entry = { anchor, cancel: false };
    const p = f7.popover.create({
      targetEl: anchor,
      content: `<div class="popover ${cls}"${anchor.dataset.color ? ` data-color="${anchor.dataset.color}"` : ""}><div class="popover-inner">${html}</div></div>`,
      backdrop: false,
      closeByOutsideClick: true,
      on: {
        close() { anchor.classList.remove("open"); },
        closed() { if (current === entry) current = null; if (onClosed) onClosed(entry); const el = p.el; p.destroy(); if (el && el.parentNode) el.parentNode.removeChild(el); },
      },
    });
    entry.popover = p;
    current = entry;
    anchor.classList.add("open");
    p.open();
    return { entry, root: p.el };
  }
  function closeCurrent(cancel = false) {
    if (!current) return;
    const c = current;
    c.cancel = cancel;
    current = null;
    c.popover.close(false);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current) { e.preventDefault(); const a = current.anchor; closeCurrent(true); if (a.focus) a.focus(); }
  });

  /* ================= 正文：渲染 ↔ Markdown ================= */
  const BLOCK = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|HR)$/;
  function renderDoc() {
    const d = cur();
    hideTip();
    const html = MD.render(d.body).replace(TOKEN, (_, id) => pillHTML(d, id));
    docEl.innerHTML = html.trim() ? html : "<p><br></p>";
    $$(".box", docEl).forEach((b) => b.setAttribute("contenteditable", "false"));
    ensureTail();
    docEl.classList.toggle("show-fx", !!state.showFx);
  }
  /* 末尾保证有一个空段落，方便在表格、列表之后继续写 */
  function ensureTail() {
    const last = docEl.lastElementChild;
    if (!last || !/^(P|H[1-6])$/.test(last.tagName)) docEl.insertAdjacentHTML("beforeend", "<p><br></p>");
  }
  const wrapMark = (m, s) => { const a = s.match(/^\s*/)[0], b = s.match(/\s*$/)[0]; return s.trim() ? a + m + s.trim() + m + b : s; };
  function inline(n) { let s = ""; for (const c of n.childNodes) s += inl(c); return s; }
  function inl(c) {
    if (c.nodeType === 3) return c.data.replace(/ /g, " ").replace(/​/g, "");
    if (c.nodeType !== 1) return "";
    if (c.classList.contains("pill")) return tok(c.dataset.id);
    if (c.classList.contains("box")) return "";
    const t = c.tagName;
    if (t === "BR") return "\n";
    if (t === "CODE") return c.textContent ? "`" + c.textContent + "`" : "";
    const inner = inline(c);
    if (t === "B" || t === "STRONG") return wrapMark("**", inner);
    if (t === "I" || t === "EM") return wrapMark("*", inner);
    if (t === "S" || t === "STRIKE" || t === "DEL") return wrapMark("~~", inner);
    if (t === "A") return inner.trim() ? `[${inner}](${c.getAttribute("href") || ""})` : inner;
    const fw = c.style && c.style.fontWeight;
    if (fw && (fw === "bold" || +fw >= 600)) return wrapMark("**", inner);
    if (c.style && c.style.fontStyle === "italic") return wrapMark("*", inner);
    return inner;
  }
  const cleanLine = (s) => s.replace(/[ \t]+\n/g, "\n").replace(/\n+$/, "").replace(/^\n+/, "");
  function listMd(list) {
    const lines = [];
    let i = +(list.getAttribute("start") || 1);
    for (const li of list.children) {
      if (li.tagName !== "LI") continue;
      let text = "";
      for (const c of li.childNodes) if (!(c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName))) text += c.nodeType === 1 && BLOCK.test(c.tagName) ? inline(c) + "\n" : inl(c);
      text = cleanLine(text).replace(/\n/g, "\n  ");
      const box = li.querySelector(":scope > .box");
      const prefix = list.tagName === "OL" ? `${i++}. ` : li.classList.contains("task") ? `- [${box && box.classList.contains("done") ? "x" : " "}] ` : "- ";
      lines.push(prefix + text);
      for (const sub of li.querySelectorAll(":scope > ul, :scope > ol")) lines.push(listMd(sub));
    }
    return lines.join("\n");
  }
  function tableMd(table) {
    const rows = [...table.rows];
    if (!rows.length) return "";
    const cell = (td) => cleanLine(inline(td)).replace(/\n/g, " ").replace(/\|/g, "\\|").trim() || " ";
    const head = [...rows[0].cells];
    const sep = head.map((th) => { const a = th.style.textAlign; return a === "center" ? ":---:" : a === "right" ? "---:" : "---"; });
    const out = [`| ${head.map(cell).join(" | ")} |`, `| ${sep.join(" | ")} |`];
    for (const r of rows.slice(1)) out.push(`| ${head.map((_, k) => (r.cells[k] ? cell(r.cells[k]) : " ")).join(" | ")} |`);
    return out.join("\n");
  }
  function blocksOf(root) {
    const out = [];
    let buf = "";
    const flush = () => { const t = cleanLine(buf); if (t.trim()) out.push(t); buf = ""; };
    for (const n of root.childNodes) {
      if (n.nodeType === 3 || (n.nodeType === 1 && !BLOCK.test(n.tagName) && !n.classList.contains("table-wrap"))) { buf += inl(n); continue; }
      if (n.nodeType !== 1) continue;
      flush();
      const t = n.tagName;
      if (/^H[1-6]$/.test(t)) { const s = cleanLine(inline(n)).replace(/\n/g, " ").trim(); if (s) out.push(`${"#".repeat(Math.max(2, +t[1]))} ${s}`); }
      else if (t === "P" && n.querySelector(":scope > ul, :scope > ol, :scope > blockquote, :scope > pre, :scope > hr, :scope > h1, :scope > h2, :scope > h3, :scope > div, :scope > table")) out.push(...blocksOf(n));
      else if (t === "P") { const s = cleanLine(inline(n)); if (s.trim()) out.push(s); }
      else if (t === "UL" || t === "OL") { const s = listMd(n); if (s.trim()) out.push(s); }
      else if (t === "BLOCKQUOTE") { const s = blocksOf(n).join("\n\n"); if (s.trim()) out.push(s.split("\n").map((l) => (l ? "> " + l : ">")).join("\n")); }
      else if (t === "PRE") out.push("```\n" + n.textContent.replace(/\n$/, "") + "\n```");
      else if (t === "HR") out.push("---");
      else if (t === "TABLE") out.push(tableMd(n));
      else if (n.classList.contains("table-wrap")) { const tb = n.querySelector("table"); if (tb) out.push(tableMd(tb)); }
      else out.push(...blocksOf(n));
    }
    flush();
    return out;
  }
  const serializeDoc = () => { const b = blocksOf(docEl).join("\n\n"); return b ? b + "\n" : ""; };
  function syncBody() {
    const d = cur(), b = serializeDoc();
    if (b !== d.body) { d.body = b; touch(); }
  }

  /* ================= 正文编辑 ================= */
  try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* 旧浏览器忽略 */ }
  let lastRange = null;
  document.addEventListener("selectionchange", () => {
    const s = getSelection();
    if (s.rangeCount && docEl.contains(s.anchorNode) && !s.anchorNode.parentElement?.closest?.(".pill")) lastRange = s.getRangeAt(0).cloneRange();
  });
  function placeCaret(el, atStart = false) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(atStart);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  /* 执行格式命令前，把选区还给正文 */
  function withSel(fn) {
    closeCurrent();
    docEl.focus({ preventScroll: true });
    const s = getSelection();
    if (lastRange && docEl.contains(lastRange.startContainer)) { s.removeAllRanges(); s.addRange(lastRange); }
    else if (!s.rangeCount || !docEl.contains(s.anchorNode)) placeCaret(docEl.lastElementChild || docEl);
    fn();
    normalizeTasks();
    ensureTail();
    syncBody();
  }
  const blockAt = (node) => { let n = node.nodeType === 1 ? node : node.parentElement; while (n && n !== docEl && !(n.parentElement === docEl || n.tagName === "LI")) n = n.parentElement; return n === docEl ? null : n; };
  const liAt = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest("li");
  function makeTask(li) {
    if (!li) return;
    li.classList.add("task");
    if (!li.querySelector(":scope > .box")) li.insertAdjacentHTML("afterbegin", '<span class="box" contenteditable="false"></span>');
  }
  /* 浏览器有时会把列表、引用等块塞进 <p> 里（非法嵌套），把它们拆出来 */
  function normalizeBlocks() {
    for (const p of $$("p", docEl)) {
      if (!p.querySelector(":scope > ul, :scope > ol, :scope > blockquote, :scope > pre, :scope > hr, :scope > h1, :scope > h2, :scope > h3, :scope > div, :scope > table")) continue;
      const s = getSelection(), r = s.rangeCount ? s.getRangeAt(0) : null;
      const kids = [...p.childNodes].filter((c) => !(c.nodeType === 1 && c.tagName === "BR" && p.childNodes.length > 1));
      p.replaceWith(...kids);
      if (r) { try { s.removeAllRanges(); s.addRange(r); } catch (e) { /* 选区失效时忽略 */ } }
    }
  }
  /* 清单里按回车生成的新条目也要带上复选框 */
  function normalizeTasks() {
    normalizeBlocks();
    for (const li of $$("li", docEl)) {
      if (li.classList.contains("task")) makeTask(li);
      else if (li.previousElementSibling?.classList.contains("task") && !li.textContent.trim() && !li.querySelector(".pill")) makeTask(li);
    }
  }
  /* Markdown 快捷方式：行首输入「## 」「- 」「1. 」「> 」「[] 」「--- 」后自动转换 */
  function applyInputRule() {
    const s = getSelection();
    if (!s.rangeCount || !s.isCollapsed) return false;
    const r = s.getRangeAt(0), block = blockAt(r.startContainer);
    if (!block || !/^(P|DIV)$/.test(block.tagName)) return false;
    const pre = document.createRange();
    pre.setStart(block, 0);
    pre.setEnd(r.startContainer, r.startOffset);
    const text = pre.toString().replace(/ /g, " ");
    let act = null;
    if (/^#{1,2} $/.test(text)) act = () => document.execCommand("formatBlock", false, "h2");
    else if (/^### $/.test(text)) act = () => document.execCommand("formatBlock", false, "h3");
    else if (/^[-*] $/.test(text)) act = () => document.execCommand("insertUnorderedList");
    else if (/^1[.)] $/.test(text)) act = () => document.execCommand("insertOrderedList");
    else if (/^> $/.test(text)) act = () => document.execCommand("formatBlock", false, "blockquote");
    else if (/^\[ ?\] $/.test(text)) act = () => { document.execCommand("insertUnorderedList"); makeTask(liAt(getSelection().anchorNode)); };
    else if (/^(---|\*\*\*) $/.test(text)) act = () => document.execCommand("insertHTML", false, "<hr><p><br></p>");
    if (!act) return false;
    s.removeAllRanges();
    s.addRange(pre);
    document.execCommand("delete");
    act();
    return true;
  }
  docEl.addEventListener("input", (e) => {
    if (e.target.classList?.contains("pv")) { onPillInput(e.target); return; }
    if (e.target !== docEl) return;
    if (e.inputType === "insertText" && e.data === " ") applyInputRule();
    normalizeTasks();
    syncBody();
  });
  docEl.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });
  docEl.addEventListener("drop", (e) => e.preventDefault());
  docEl.addEventListener("keydown", (e) => {
    if (e.target !== docEl) return;
    if (e.key === "Tab") { e.preventDefault(); document.execCommand(e.shiftKey ? "outdent" : "indent"); syncBody(); }
  });
  /* 勾选清单 */
  docEl.addEventListener("click", (e) => {
    const box = e.target.closest(".box");
    if (!box) return;
    box.classList.toggle("done");
    syncBody();
  });

  function formatCmd(cmd) {
    withSel(() => {
      const s = getSelection(), node = s.anchorNode;
      const inBlock = (tag) => { let n = node && (node.nodeType === 1 ? node : node.parentElement); while (n && n !== docEl) { if (n.tagName === tag) return n; n = n.parentElement; } return null; };
      switch (cmd) {
        case "bold": document.execCommand("bold"); break;
        case "italic": document.execCommand("italic"); break;
        case "strike": document.execCommand("strikeThrough"); break;
        case "code": { const t = s.toString() || "代码"; document.execCommand("insertHTML", false, `<code>${esc(t)}</code>`); break; }
        case "h2": document.execCommand("formatBlock", false, inBlock("H2") ? "p" : "h2"); break;
        case "h3": document.execCommand("formatBlock", false, inBlock("H3") ? "p" : "h3"); break;
        case "p": document.execCommand("formatBlock", false, "p"); break;
        case "quote": document.execCommand("formatBlock", false, inBlock("BLOCKQUOTE") ? "p" : "blockquote"); break;
        case "ul": { const li = liAt(node); if (li && li.classList.contains("task")) { li.classList.remove("task"); li.querySelector(":scope > .box")?.remove(); } else document.execCommand("insertUnorderedList"); break; }
        case "ol": document.execCommand("insertOrderedList"); break;
        case "task": {
          let li = liAt(node);
          if (li && li.classList.contains("task")) { document.execCommand("insertUnorderedList"); break; }
          if (!li || li.parentElement.tagName !== "UL") { document.execCommand("insertUnorderedList"); li = liAt(getSelection().anchorNode); }
          makeTask(li);
          break;
        }
        case "table": document.execCommand("insertHTML", false, '<div class="table-wrap"><table><thead><tr><th>项目</th><th>数值</th></tr></thead><tbody><tr><td>示例</td><td>1</td></tr></tbody></table></div><p><br></p>'); break;
        case "hr": document.execCommand("insertHTML", false, "<hr><p><br></p>"); break;
      }
    });
  }
  function addLink() {
    const saved = lastRange && lastRange.cloneRange();
    f7.dialog.prompt("", "链接地址", (url) => {
      url = String(url).trim();
      if (!url) return;
      if (!/^(https?:|mailto:|#|\/)/i.test(url)) url = "https://" + url;
      lastRange = saved;
      withSel(() => {
        if (getSelection().isCollapsed) document.execCommand("insertHTML", false, `<a href="${esc(url)}">${esc(url)}</a>`);
        else document.execCommand("createLink", false, url);
      });
    }, null, "https://");
  }

  /* ================= 胶囊：就地输入、拖动、重抽、查看算式 ================= */
  function syncPill(el, fresh) {
    const open = el.classList.contains("open");
    el.className = fresh.className + (open ? " open" : "");
    el.innerHTML = fresh.innerHTML;
    el.title = fresh.title;
    for (const k of ["color", "kind"]) { if (fresh.dataset[k]) el.dataset[k] = fresh.dataset[k]; else delete el.dataset[k]; }
  }
  /* 数值变了以后只刷新胶囊本身；正在输入的那一个不动 */
  function refreshPills() {
    const d = cur(), tmp = document.createElement("div");
    for (const el of $$(".pill[data-id]", docEl)) {
      if (el.contains(document.activeElement) && document.activeElement.classList.contains("pv")) continue;
      tmp.innerHTML = pillHTML(d, el.dataset.id);
      syncPill(el, tmp.firstElementChild);
    }
    if (tipFor) showTip(tipFor);
  }
  const stepOf = (c) => (decimalsOf(c) ? Math.pow(10, -decimalsOf(c)) : 1);
  function setValue(c, v, { quiet = false } = {}) {
    const d = cur();
    d.values[c.id] = clampToRange(c, v);
    if (!quiet) touch();
    refreshPills();
    return d.values[c.id];
  }
  function onPillInput(inp) {
    const pill = inp.closest(".pill"), c = cur().capsules[pill.dataset.id];
    inp.size = Math.max(2, inp.value.length);
    const n = parseFloat(inp.value);
    if (c && Number.isFinite(n)) setValue(c, n);
  }
  docEl.addEventListener("focusout", (e) => {
    if (!e.target.classList?.contains("pv")) return;
    const pill = e.target.closest(".pill"), c = cur().capsules[pill.dataset.id];
    if (c) { e.target.value = cur().values[c.id].toFixed(decimalsOf(c)); e.target.size = Math.max(2, e.target.value.length); }
    refreshPills();
  });
  docEl.addEventListener("keydown", (e) => {
    if (!e.target.classList?.contains("pv")) return;
    const pill = e.target.closest(".pill"), c = cur().capsules[pill.dataset.id];
    if (!c) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const v = setValue(c, cur().values[c.id] + (e.key === "ArrowUp" ? 1 : -1) * stepOf(c) * (e.shiftKey ? 10 : 1));
      e.target.value = v.toFixed(decimalsOf(c));
    } else if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.target.blur(); }
  });
  function roll(el, c) {
    if (reduceMotion) { refreshPills(); return; }
    el.classList.add("rolling");
    const v = el.querySelector(".v"), t0 = performance.now();
    const tick = (now) => {
      if (now - t0 < 420 && v) { v.textContent = numText(c, randomIn(c)); requestAnimationFrame(tick); }
      else { el.classList.remove("rolling"); refreshPills(); }
    };
    requestAnimationFrame(tick);
  }
  /* 拖动：填写类胶囊按住左右拖，每 8px 一步，按住 Shift 十倍 */
  let drag = null, longPress = 0, suppressClick = false;
  docEl.addEventListener("pointerdown", (e) => {
    const pill = e.target.closest(".pill[data-id]");
    if (!pill || e.target.closest(".pv") || e.target.closest(".cfg")) return;
    e.preventDefault(); // 不要把光标放进胶囊里
    const c = cur().capsules[pill.dataset.id];
    if (!c) return;
    clearTimeout(longPress);
    if (e.pointerType !== "mouse") longPress = setTimeout(() => { suppressClick = true; drag = null; openInspector(c.id); }, 520);
    if (kindKey(c) === "input") {
      drag = { pill, c, x: e.clientX, v: cur().values[c.id], moved: false, id: e.pointerId };
      pill.setPointerCapture(e.pointerId);
    }
  });
  docEl.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return;
    if (!drag.moved) { drag.moved = true; clearTimeout(longPress); drag.pill.classList.add("scrubbing"); hideTip(); }
    const v = setValue(drag.c, drag.v + Math.round(dx / 8) * stepOf(drag.c) * (e.shiftKey ? 10 : 1), { quiet: true });
    const inp = drag.pill.querySelector(".pv");
    if (inp) { inp.value = v.toFixed(decimalsOf(drag.c)); inp.size = Math.max(2, inp.value.length); }
  });
  const endDrag = (e) => {
    clearTimeout(longPress);
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d0 = drag;
    drag = null;
    d0.pill.classList.remove("scrubbing");
    if (d0.moved) { suppressClick = true; touch(); }
  };
  docEl.addEventListener("pointerup", endDrag);
  docEl.addEventListener("pointercancel", endDrag);
  docEl.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill[data-id]");
    if (!pill) return;
    if (suppressClick) { suppressClick = false; return; }
    const c = cur().capsules[pill.dataset.id];
    if (!c) return;
    if (e.target.closest(".cfg")) { e.preventDefault(); openInspector(c.id); return; }
    const k = kindKey(c);
    if (k === "random") { cur().values[c.id] = randomIn(c); touch(); roll(pill, c); }
    else if (k === "input") { const inp = pill.querySelector(".pv"); if (inp && e.target !== inp) { inp.focus(); inp.select(); } }
    else if (tipFor === pill) hideTip(); else showTip(pill);
  });
  docEl.addEventListener("contextmenu", (e) => {
    const pill = e.target.closest(".pill[data-id]");
    if (!pill || !cur().capsules[pill.dataset.id]) return;
    e.preventDefault();
    openInspector(pill.dataset.id);
  });
  /* 公式胶囊的算式提示 */
  const tip = $("#tip");
  let tipFor = null;
  function showTip(pill) {
    const d = cur(), c = d.capsules[pill.dataset.id];
    if (!c || kindKey(c) !== "formula" || !pill.isConnected) { hideTip(); return; }
    const r = safeValue(d, c);
    const sub = Expr.pretty(c.formula, (name) => { const o = byName(d, name); if (!o) return name; const rv = safeValue(d, o); return rv.err ? "?" : numText(o, rv.v); });
    tip.innerHTML = `<div class="t-name"><span class="dot" data-color="${c.color}"></span>${esc(c.name)}</div><div>= ${esc(Expr.pretty(c.formula))}</div><div>= ${esc(sub)}</div><div class="t-res">= ${esc(r.err || fullText(c, r.v))}</div>`;
    tip.hidden = false;
    tipFor = pill;
    const pr = pill.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, pr.left + pr.width / 2 - w / 2))}px`;
    tip.style.top = `${pr.top - h - 10 > 70 ? pr.top - h - 10 : pr.bottom + 10}px`;
  }
  function hideTip() { if (tip) { tip.hidden = true; } tipFor = null; }
  docEl.addEventListener("mouseover", (e) => {
    const pill = e.target.closest('.pill[data-kind="formula"]');
    if (pill && pill !== tipFor) showTip(pill);
  });
  docEl.addEventListener("mouseout", (e) => {
    const pill = e.target.closest('.pill[data-kind="formula"]');
    if (pill && !pill.contains(e.relatedTarget)) hideTip();
  });
  $("#scroller").addEventListener("scroll", hideTip, { passive: true });

  /* ================= 顶部与底部的玻璃按钮 ================= */
  for (const b of $$(".bottombar button, .topbar button")) b.addEventListener("mousedown", (e) => e.preventDefault());
  $$(".bottombar [data-cmd]").forEach((b) => b.addEventListener("click", () => formatCmd(b.dataset.cmd)));
  $("#undo").addEventListener("click", () => { undo(); toast("已撤销"); });
  $("#redo").addEventListener("click", () => { redo(); toast("已重做"); });

  const ICON = (n) => `<i class="f7-icons">${n}</i>`;
  /* 「Aa」文字格式面板 */
  $("#fmtBtn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (current && current.anchor === btn) { closeCurrent(); return; }
    const { root } = openPop(btn, `
      <div class="fmt-pop">
        <div class="fmt-title">文字格式</div>
        <div class="fmt-row styles">
          <button type="button" data-cmd="h2"><span style="font-size:20px;font-weight:800">标题</span></button>
          <button type="button" data-cmd="h3"><span style="font-size:16px;font-weight:700">小标题</span></button>
          <button type="button" data-cmd="p"><span>正文</span></button>
        </div>
        <div class="fmt-row">
          <button type="button" data-cmd="bold" aria-label="粗体"><b>B</b></button>
          <button type="button" data-cmd="italic" aria-label="斜体"><i style="font-family:serif">I</i></button>
          <button type="button" data-cmd="strike" aria-label="删除线"><s>S</s></button>
          <button type="button" data-cmd="code" aria-label="行内代码">${ICON("chevron_left_slash_chevron_right")}</button>
          <button type="button" data-cmd="link" aria-label="链接">${ICON("link")}</button>
        </div>
        <div class="fmt-row">
          <button type="button" data-cmd="ul" aria-label="项目符号列表">${ICON("list_bullet")}</button>
          <button type="button" data-cmd="ol" aria-label="编号列表">${ICON("list_number")}</button>
          <button type="button" data-cmd="task" aria-label="清单">${ICON("checkmark_circle")}</button>
          <button type="button" data-cmd="quote" aria-label="引用">${ICON("text_quote")}</button>
          <button type="button" data-cmd="hr" aria-label="分割线">${ICON("minus")}</button>
        </div>
      </div>`, "fmt-popover");
    root.addEventListener("mousedown", (ev) => ev.preventDefault());
    $$("[data-cmd]", root).forEach((b) => b.addEventListener("click", () => {
      const cmd = b.dataset.cmd;
      if (cmd === "link") { closeCurrent(); addLink(); return; }
      formatCmd(cmd);
    }));
  });

  /* 「⋯」更多菜单：每一项都写清楚做什么 */
  function rerollAll() {
    const d = cur();
    capsOf(d).forEach((c) => { if (kindKey(c) === "random") d.values[c.id] = randomIn(c); });
    touch();
    const els = $$('.pill[data-kind="random"]', docEl);
    if (!els.length || reduceMotion) { refreshPills(); return; }
    els.forEach((el) => roll(el, d.capsules[el.dataset.id]));
  }
  $("#moreBtn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (current && current.anchor === btn) { closeCurrent(); return; }
    const d = cur();
    const hasRandom = capsOf(d).some((c) => kindKey(c) === "random" && d.body.includes(tok(c.id)));
    const item = (act, icon, label, extra = "") => `<button type="button" class="menu-item${extra}" data-act="${act}">${ICON(icon)}<span>${label}</span></button>`;
    const { root } = openPop(btn, `
      <div class="menu">
        ${item("reroll", "shuffle", "全部重新随机", hasRandom ? "" : " disabled")}
        ${item("fx", "function", "在胶囊里显示算式", state.showFx ? " checked" : "")}
        <div class="menu-sep"></div>
        ${item("new", "square_pencil", "新建文档")}
        ${item("help", "question_circle", "使用说明")}
        <div class="menu-sep"></div>
        ${item("delete", "trash", "删除这篇文档", " danger")}
      </div>`, "menu-popover");
    root.addEventListener("click", (ev) => {
      const it = ev.target.closest("[data-act]");
      if (!it || it.classList.contains("disabled")) return;
      closeCurrent();
      const act = it.dataset.act;
      if (act === "reroll") rerollAll();
      else if (act === "fx") { state.showFx = !state.showFx; docEl.classList.toggle("show-fx", state.showFx); persist(); toast(state.showFx ? "胶囊里显示算式" : "胶囊里只显示结果"); }
      else if (act === "new") newDoc();
      else if (act === "help") openHelp();
      else if (act === "delete") deleteDoc(cur());
    });
  });

  /* 使用说明：Framework7 popup */
  function openHelp() {
    f7.popup.create({
      destroyOnClose: true,
      content: `<div class="popup"><div class="page">
        <div class="navbar"><div class="navbar-bg"></div><div class="navbar-inner"><div class="title">使用说明</div><div class="right"><a class="link popup-close">完成</a></div></div></div>
        <div class="page-content"><div class="help-content">
          <p>像备忘录一样，直接在文档上写就行。行首输入 <code>## </code> 变成标题，<code>- </code> 变成列表，<code>[] </code> 变成清单，<code>&gt; </code> 变成引用。</p>
          <p>文中的<b>胶囊</b>是会变化的数字：</p>
          <dl>
            <dt><span class="pill demo" data-kind="input" data-color="sky"><span class="lb">液重</span><b class="v">36.0</b><span class="u">g</span></span></dt>
            <dd>填写：点数字直接输入，或按住胶囊左右拖动；方向键 ↑↓ 微调。</dd>
            <dt><span class="pill demo" data-kind="random" data-color="violet"><span class="lb">骰子</span><b class="v">5</b></span></dt>
            <dd>随机：点一下重新抽取。「⋯」菜单里可以全部一起重抽。</dd>
            <dt><span class="pill demo" data-kind="formula" data-color="rose"><span class="lb">萃取率</span><b class="v">19.0</b><span class="u">%</span></span></dt>
            <dd>公式：由其它胶囊算出，悬停或点一下看算式。</dd>
          </dl>
          <p>点底部的「＋ 胶囊」在光标处插入。想改胶囊的名称、区间、公式或颜色：鼠标移到胶囊上点右上角的小按钮，或者右键 / 长按胶囊。</p>
          <p class="keys"><kbd>⌘Z</kbd> 撤销　<kbd>⇧⌘Z</kbd> 重做　<kbd>⌘B</kbd> <kbd>⌘I</kbd> 粗体、斜体</p>
        </div></div></div></div>`,
    }).open();
  }

  /* ================= 胶囊设置气泡（改动即时生效，取消可撤回） ================= */
  let ctx = null;
  function newCapsule(d) {
    let n = 1;
    while (byName(d, `数值${n}`)) n++;
    return { id: uid("c_"), name: `数值${n}`, kind: "range", source: "random", min: 1, max: 100, decimals: 0, def: null, formula: "", unit: "", color: COLORS[capsOf(d).length % COLORS.length][0] };
  }
  const seg = (key, options, value) => `<div class="segmented segmented-strong" data-seg="${key}" role="radiogroup">${options.map(([v, label]) =>
    `<button type="button" class="button${v === value ? " button-active" : ""}" data-v="${v}" role="radio" aria-checked="${v === value}">${label}</button>`).join("")}<span class="segmented-highlight"></span></div>`;
  const row = (title, control, cls = "") => `<li class="item-content ${cls}"><div class="item-inner"><div class="item-title">${title}</div><div class="item-after">${control}</div></div></li>`;
  function openInspector(id, { isNew = false, snapshot = null } = {}) {
    const d = cur();
    const anchor = docEl.querySelector(`.pill[data-id="${id}"]`);
    const c = d.capsules[id];
    if (!anchor || !c) return;
    const me = { id, isNew, snapshot: snapshot || snap(d), appliedName: c.name, root: null, decStepper: null };
    ctx = me;
    const others = capsOf(d).filter((o) => o.id !== c.id);
    const num = (v) => (v === null || v === undefined || v === "" ? "" : v);
    const { root } = openPop(anchor, `
      <div class="pop-head"><span class="dot"></span><span>${isNew ? "新胶囊" : "胶囊设置"}</span><small id="fKindLabel"></small></div>
      <div class="list list-strong-ios list-dividers-ios cap-form" id="capForm"><ul>
        <li class="item-content item-input"><div class="item-inner"><div class="item-title item-label">名称</div><div class="item-input-wrap"><input type="text" id="fName" value="${esc(c.name)}" maxlength="24" autocomplete="off" spellcheck="false"></div></div></li>
        ${row("类型", seg("kind", [["range", "区间"], ["formula", "计算函数"]], c.kind))}
        ${row("区间", `<div class="pair"><input class="num-input" type="number" id="fMin" value="${num(c.min)}" step="any" aria-label="最小值"><span>–</span><input class="num-input" type="number" id="fMax" value="${num(c.max)}" step="any" aria-label="最大值"></div>`, "gR")}
        ${row("浏览时", seg("source", [["random", "随机生成"], ["input", "用户填写"]], c.source === "input" ? "input" : "random"), "gR")}
        ${row("默认值", `<input class="num-input" type="number" id="fDef" value="${num(c.def)}" step="any" placeholder="最小值" aria-label="默认值">`, "gR gD")}
        <li class="item-content item-input gF"><div class="item-inner"><div class="item-title item-label">公式</div><div class="item-input-wrap"><textarea class="formula resizable" id="fFormula" placeholder="例如：液重 / 粉量" spellcheck="false">${esc(c.formula || "")}</textarea></div></div></li>
        ${row("小数位", `<div class="stepper stepper-small stepper-raised" id="fDec"><div class="stepper-button-minus"></div><div class="stepper-input-wrap"><input type="text" value="${decimalsOf(c)}" readonly aria-label="小数位"></div><div class="stepper-button-plus"></div></div>`)}
        <li class="item-content item-input"><div class="item-inner"><div class="item-title item-label">单位</div><div class="item-input-wrap"><input type="text" id="fUnit" value="${esc(c.unit || "")}" maxlength="8" placeholder="例如 g、%、元"></div></div></li>
        ${row("颜色", `<div class="colors" role="radiogroup" aria-label="颜色">${COLORS.map(([k, label]) => `<label data-color="${k}" title="${label}"><input type="radio" name="color" value="${k}"${c.color === k ? " checked" : ""} aria-label="${label}"></label>`).join("")}</div>`)}
      </ul></div>
      <div class="gF">
        ${others.length ? `<div class="chips-mini" aria-label="点击插入其它胶囊的名称">${others.map((o) => `<button type="button" class="pill" data-kind="${kindKey(o)}" data-color="${o.color}" data-ins="${esc(o.name)}"><span class="lb">${esc(o.name)}</span></button>`).join("")}</div>` : ""}
        <p class="hint">支持 + − × ÷ ^ % 和括号；round(x, 位数)、min、max、sum、avg、abs、sqrt、if(条件, 是, 否)</p>
      </div>
      <div class="preview" id="preview" aria-live="polite"></div>
      <div class="pop-foot">
        ${isNew ? "" : '<button class="button danger" type="button" id="fDel">删除</button>'}
        <span class="spacer"></span>
        <button class="button button-tonal button-round" type="button" id="fCancel">取消</button>
        <button class="button button-fill button-round" type="button" id="fDone">完成</button>
      </div>`, "cap-pop", (entry) => onInspectorClose(me, entry.cancel ? "cancel" : me.reason || "commit"));
    me.root = root;
    me.decStepper = f7.stepper.create({ el: $("#fDec", root), min: 0, max: 4, step: 1, value: decimalsOf(c), on: { change() { onFormChange(); } } });
    root.addEventListener("input", onFormChange);
    root.addEventListener("change", onFormChange);
    $$("[data-seg] .button", root).forEach((b) => b.addEventListener("click", () => {
      $$(".button", b.parentElement).forEach((x) => { x.classList.toggle("button-active", x === b); x.setAttribute("aria-checked", String(x === b)); });
      onFormChange();
    }));
    root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); closeCurrent(); } });
    $("#fCancel", root).addEventListener("click", () => closeCurrent(true));
    $("#fDone", root).addEventListener("click", () => closeCurrent());
    $$("[data-ins]", root).forEach((b) => b.addEventListener("click", () => {
      const ta = $("#fFormula", root), s = ta.selectionStart, e2 = ta.selectionEnd, name = b.dataset.ins;
      ta.value = ta.value.slice(0, s) + name + ta.value.slice(e2);
      ta.focus();
      ta.setSelectionRange(s + name.length, s + name.length);
      onFormChange();
    }));
    const del = $("#fDel", root);
    if (del) del.addEventListener("click", () => {
      if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "确定删除？"; return; }
      me.reason = "delete";
      closeCurrent();
    });
    onFormChange();
    setTimeout(() => { const n = $("#fName", root); n.focus(); n.select(); }, 80);
  }
  function readForm() {
    const root = ctx.root, d = cur(), c = { ...d.capsules[ctx.id] }, f = (id) => $(id, root);
    const numOrNull = (v) => (String(v ?? "").trim() === "" ? null : Number(v));
    const segVal = (k) => ($(`[data-seg="${k}"] .button-active`, root) || {}).dataset?.v;
    c.name = f("#fName").value.trim();
    c.kind = segVal("kind") || "range";
    c.source = segVal("source") || "random";
    c.min = numOrNull(f("#fMin").value);
    c.max = numOrNull(f("#fMax").value);
    c.def = c.kind === "formula" ? null : numOrNull(f("#fDef").value);
    c.formula = f("#fFormula").value.trim();
    c.decimals = ctx.decStepper ? ctx.decStepper.getValue() : decimalsOf(c);
    c.unit = f("#fUnit").value.trim();
    c.color = ($('input[name="color"]:checked', root) || {}).value || c.color;
    return c;
  }
  function validate(c) {
    const d = cur();
    if (!c.name) return "请填写名称";
    if (!NAME_RE.test(c.name)) return "名称只能包含文字、数字和下划线，并且不能以数字开头";
    if (Expr.isReserved(c.name)) return `「${c.name}」是内置函数或常量的名字，请换一个`;
    if (capsOf(d).some((o) => o.id !== c.id && o.name === c.name)) return `已经有叫「${c.name}」的胶囊了`;
    if (c.kind === "range") {
      if (c.min === null || !Number.isFinite(c.min)) return "请填写最小值";
      if (c.max === null || !Number.isFinite(c.max)) return "请填写最大值";
      if (c.min > c.max) return "最小值不能大于最大值";
      if (c.source === "input" && c.def !== null && (c.def < c.min || c.def > c.max)) return "默认值要在最小值和最大值之间";
      return null;
    }
    try { Expr.compile(c.formula); } catch (e) { return e.message; }
    return null;
  }
  /* 先在副本上试算：只有能算出结果的设置才写入文档 */
  function trialDoc(c) {
    const d = cur();
    const capsules = { ...d.capsules, [c.id]: c };
    if (ctx.appliedName !== c.name) capsOf(d).forEach((o) => {
      if (o.id !== c.id && o.kind === "formula") capsules[o.id] = { ...o, formula: Expr.renameRef(o.formula, ctx.appliedName, c.name) };
    });
    return { ...d, capsules, values: { ...d.values, [c.id]: undefined } };
  }
  function onFormChange() {
    if (!ctx || !ctx.root) return;
    const root = ctx.root, c = readForm(), k = kindKey(c);
    $$(".gR", root).forEach((el) => { el.hidden = c.kind !== "range"; });
    $$(".gF", root).forEach((el) => { el.hidden = c.kind !== "formula"; });
    if (c.kind === "range") $$(".gD", root).forEach((el) => { el.hidden = c.source !== "input"; });
    root.dataset.color = c.color;
    $("#fKindLabel", root).textContent = kindLabel[k];
    const prev = $("#preview", root);
    let err = validate(c);
    if (!err) { const r = safeValue(trialDoc(c), c); if (r.err) err = r.err; }
    if (err) prev.innerHTML = `<span class="msg bad">${esc(err)}</span>`;
    else {
      applyCapsule(c);
      const text = { random: "浏览时点一下会在区间内重新抽取", input: "浏览时读者可以点开填写", formula: `= ${Expr.pretty(c.formula)}` }[k];
      prev.innerHTML = `<span class="pill demo" data-kind="${k}" data-color="${c.color}">${pillInner(cur(), cur().capsules[c.id]).html}</span><span class="msg">${esc(text)}</span>`;
    }
    if (current && current.popover) current.popover.resize();
  }
  function applyCapsule(c) {
    const d = cur(), prev = d.capsules[c.id];
    if (c.name !== ctx.appliedName) {
      capsOf(d).forEach((o) => { if (o.id !== c.id && o.kind === "formula") o.formula = Expr.renameRef(o.formula, ctx.appliedName, c.name); });
      ctx.appliedName = c.name;
    }
    d.capsules[c.id] = c;
    if (c.kind === "formula") delete d.values[c.id];
    else {
      const v = d.values[c.id];
      const changed = prev.kind !== c.kind || prev.source !== c.source || prev.min !== c.min || prev.max !== c.max || prev.decimals !== c.decimals || prev.def !== c.def;
      d.values[c.id] = changed || typeof v !== "number" ? initialValue(c) : clampToRange(c, v);
    }
    refreshEditorPills();
  }
  function onInspectorClose(me, reason) {
    if (ctx === me) ctx = null;
    if (me.decStepper) { me.decStepper.destroy(); me.decStepper = null; }
    const d = cur();
    if (reason === "cancel") {
      Object.assign(d, JSON.parse(me.snapshot));
      renderDoc();
      return;
    }
    if (reason === "delete") {
      d.body = d.body.split(tok(me.id)).join("");
      delete d.capsules[me.id];
      delete d.values[me.id];
      renderDoc();
      touch();
      toast("已删除胶囊");
      return;
    }
    if (snap(d) !== me.snapshot) touch();
  }
  function refreshEditorPills() {
    const d = cur();
    refreshPills();
  }

  /* 插入胶囊：先放进正文作为设置气泡的锚点；取消会整个撤回 */
  $("#addCap").addEventListener("mousedown", (e) => e.preventDefault());
  $("#addCap").addEventListener("click", () => {
    closeCurrent();
    const d = cur(), before = snap(d);
    const c = newCapsule(d);
    d.capsules[c.id] = c;
    d.values[c.id] = initialValue(c);
    withSel(() => document.execCommand("insertHTML", false, pillHTML(d, c.id) + " "));
    openInspector(c.id, { isNew: true, snapshot: before });
  });

  /* ================= 快捷键 & 启动 ================= */
  const inField = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if ((k === "z" || k === "y") && !current && !inField(document.activeElement)) {
      e.preventDefault();
      if (k === "y" || e.shiftKey) { redo(); toast("已重做"); } else { undo(); toast("已撤销"); }
    }
  });
  renderAll();
  persist();
  /* 给玻璃按上透镜：顶部按钮组、底部工具条、侧边栏 */
  $$(".topbar .glass").forEach((el) => Lens.attach(el, { bezel: 16, scale: 36, blur: 10, sat: 1.8 }));
  Lens.attach($("#bottombar"), { bezel: 22, scale: 46, blur: 10, sat: 1.8 });
  Lens.attach(panel.el, { bezel: 30, scale: 54, blur: 12, sat: 1.8 });

  window.__capsuleNotes = { state, openInspector, undo, redo, f7, serializeDoc };
})();
