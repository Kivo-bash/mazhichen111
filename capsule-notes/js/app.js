/* 胶囊笔记：文档管理、编辑器、浏览视图、胶囊设置对话框、浮层与撤销/重做。
 * 界面组件（对话框、抽屉、输入框、单选、滑块、提示）来自 Shoelace。 */
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

  const KIND_ICON = {
    random: '<svg class="k" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" class="fill"/><circle cx="15.5" cy="15.5" r="1.3" class="fill"/></svg>',
    input: '<svg class="k" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5l4 4L9 19H5v-4z"/></svg>',
    formula: "",
  };

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
    closePop();
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
    $("#undo").disabled = !h.past.length && snap(cur()) === h.last;
    $("#redo").disabled = !h.future.length;
  }
  $("#undo").addEventListener("click", undo);
  $("#redo").addEventListener("click", redo);

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

  /* 胶囊内部结构：· 名称  数值 单位 [类型图标] */
  function pillInner(d, c, { showExpr = false } = {}) {
    const r = safeValue(d, c), k = kindKey(c);
    const expr = k === "formula" && showExpr ? `<span class="ex">${esc(Expr.pretty(c.formula))} =</span>` : "";
    const val = r.err ? "!" : numText(c, r.v);
    return { r, k, html: `<span class="lb">${esc(c.name)}</span>${expr}<b class="v">${esc(val)}</b>${c.unit && !r.err ? `<span class="u">${esc(c.unit)}</span>` : ""}${KIND_ICON[k]}` };
  }
  const missingInner = '<span class="lb">已删除</span><b class="v">?</b>';

  /* ================= 背景：按文档生成一张虚化的"照片" ================= */
  const bgCanvas = $("#backdrop");
  function paintBackdrop(seedStr) {
    let seed = 0;
    for (const ch of seedStr) seed = (seed * 31 + ch.codePointAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const W = 192, Hh = 120;
    bgCanvas.width = W; bgCanvas.height = Hh;
    const g = bgCanvas.getContext("2d");
    const base = g.createLinearGradient(0, 0, W, Hh);
    base.addColorStop(0, "#1b1013"); base.addColorStop(.5, "#2a1512"); base.addColorStop(1, "#101418");
    g.fillStyle = base; g.fillRect(0, 0, W, Hh);
    const palette = ["#b3261e", "#7a1a12", "#e0782a", "#f0b050", "#c9502a", "#1f6b72", "#2a4a6a", "#4a2344", "#d8c4a0", "#8a3a1a", "#0f3a3f"];
    for (let i = 0; i < 46; i++) {
      const x = rnd() * W, y = rnd() * Hh, r = 6 + rnd() * 34, col = palette[Math.floor(rnd() * palette.length)];
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const a = .35 + rnd() * .5;
      gr.addColorStop(0, col + Math.round(a * 255).toString(16).padStart(2, "0"));
      gr.addColorStop(1, col + "00");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W, y = rnd() * Hh, r = 1.5 + rnd() * 4;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,230,190,.55)"); gr.addColorStop(1, "rgba(255,230,190,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  /* ================= 模式与整体渲染 ================= */
  const app = $("#app"), view = $("#view"), ed = $("#editor");
  function setMode(m) {
    closePop();
    commitHistory();
    if (m === "view") prune(cur());
    state.mode = m;
    app.dataset.mode = m;
    $$("[data-set-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setMode === m)));
    if (m === "edit") renderEditor(); else renderView();
    H().last = snap(cur());
    persist();
  }
  $$("[data-set-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.setMode)));

  function prune(d) {
    const used = new Set([...d.body.matchAll(TOKEN)].map((m) => m[1]));
    Object.keys(d.capsules).forEach((id) => { if (!used.has(id)) { delete d.capsules[id]; delete d.values[id]; } });
  }

  function renderAll() {
    const d = cur();
    $("#title").value = d.title;
    document.title = `${d.title || "未命名文档"} · 胶囊笔记`;
    paintBackdrop(d.id);
    renderDocList();
    if (state.mode === "edit") renderEditor(); else renderView();
    H();
    renderStatus();
    updateUndoButtons();
  }

  function renderStatus(msg) {
    const d = cur();
    const chars = d.body.replace(TOKEN, "").replace(/[\s#>*_`|~-]/g, "").length;
    const n = new Set([...d.body.matchAll(TOKEN)].map((m) => m[1])).size;
    const saved = msg || (savedAt ? `已保存 ${savedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "自动保存");
    $("#status").textContent = `${chars} 字 · ${n} 个胶囊 · ${saved}`;
  }

  /* ================= 文档抽屉 ================= */
  const drawer = $("#docsDrawer");
  $("#docsBtn").addEventListener("click", () => drawer.show());
  function renderDocList() {
    const docs = [...state.docs].sort((a, b) => b.updated - a.updated);
    $("#docList").innerHTML = docs.map((d) => `
      <div class="doc-item${d.id === state.currentId ? " on" : ""}" data-id="${d.id}">
        <button class="open" type="button"${d.id === state.currentId ? ' aria-current="page"' : ""}>
          <span class="t">${esc(d.title || "未命名文档")}</span>
          <span class="d">${new Date(d.updated).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${Object.keys(d.capsules).length} 个胶囊</span>
        </button>
        ${state.docs.length > 1 ? `<button class="del" type="button" aria-label="删除「${esc(d.title)}」">删除</button>` : ""}
      </div>`).join("");
  }
  $("#docList").addEventListener("click", (e) => {
    const item = e.target.closest(".doc-item");
    if (!item) return;
    const id = item.dataset.id;
    const del = e.target.closest(".del");
    if (del) {
      if (!del.classList.contains("armed")) {
        del.classList.add("armed");
        del.textContent = "确认删除";
        setTimeout(() => { if (del.isConnected) { del.classList.remove("armed"); del.textContent = "删除"; } }, 3000);
        return;
      }
      state.docs = state.docs.filter((d) => d.id !== id);
      hist.delete(id);
      if (state.currentId === id) state.currentId = [...state.docs].sort((a, b) => b.updated - a.updated)[0].id;
      persist();
      renderAll();
      return;
    }
    if (e.target.closest(".open")) {
      commitHistory();
      prune(cur());
      state.currentId = id;
      drawer.hide();
      persist();
      renderAll();
    }
  });
  $("#newDoc").addEventListener("click", () => {
    commitHistory();
    const d = { id: uid("d_"), title: "未命名文档", updated: Date.now(), body: "# 未命名文档\n\n在这里写一句简介。\n\n", capsules: {}, values: {} };
    state.docs.push(d);
    state.currentId = d.id;
    drawer.hide();
    state.mode = "edit";
    app.dataset.mode = "edit";
    $$("[data-set-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setMode === "edit")));
    renderAll();
    persist();
    setTimeout(() => $("#title").select(), 250);
  });
  $("#title").addEventListener("input", (e) => {
    cur().title = e.target.value;
    document.title = `${e.target.value || "未命名文档"} · 胶囊笔记`;
    touch();
    renderDocList();
  });
  $("#title").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); (state.mode === "edit" ? ed : e.target).focus(); } });

  $("#helpBtn").addEventListener("click", () => $("#helpDlg").show());

  /* ================= 浏览视图 ================= */
  function viewPillHTML(d, id) {
    const c = d.capsules[id];
    if (!c) return `<span class="pill err" title="这个胶囊已被删除">${missingInner}</span>`;
    const { r, k, html } = pillInner(d, c, { showExpr: true });
    const shown = r.err ? r.err : fullText(c, r.v);
    const verb = { random: "点击重新抽取", input: "点击填写数值", formula: "点击查看算式" }[k];
    return `<button type="button" class="pill${r.err ? " err" : ""}" data-id="${id}" data-kind="${k}" data-color="${c.color}" aria-label="${esc(c.name)}：${esc(shown)}，${verb}" title="${esc(r.err || `${c.name} · ${kindLabel[k]} · ${verb}`)}">${html}</button>`;
  }
  function renderView() {
    const d = cur();
    const html = MD.render(d.body).replace(TOKEN, (_, id) => viewPillHTML(d, id));
    view.innerHTML = html.trim() ? html : '<p class="empty">这篇文档还是空的，切换到「编辑」开始写吧。</p>';
    view.classList.toggle("show-fx", !!state.showFx);
    const hasRandom = capsOf(d).some((c) => kindKey(c) === "random" && d.body.includes(tok(c.id)));
    $("#rerollAll").disabled = !hasRandom;
  }
  function refreshPills(skip) {
    const d = cur();
    $$(".pill[data-id]", view).forEach((el) => {
      if (el === skip) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = viewPillHTML(d, el.dataset.id);
      const fresh = tmp.firstElementChild;
      el.className = fresh.className;
      el.innerHTML = fresh.innerHTML;
      el.setAttribute("aria-label", fresh.getAttribute("aria-label") || "");
      el.title = fresh.title;
    });
  }
  function roll(el, c) {
    if (reduceMotion) { refreshPills(); return; }
    el.classList.add("rolling");
    const v = el.querySelector(".v"), t0 = performance.now();
    const tick = (now) => {
      if (now - t0 < 420) { v.textContent = numText(c, randomIn(c)); requestAnimationFrame(tick); }
      else { el.classList.remove("rolling"); refreshPills(); }
    };
    requestAnimationFrame(tick);
  }
  view.addEventListener("click", (e) => {
    const el = e.target.closest(".pill[data-id]");
    if (!el) return;
    const d = cur(), c = d.capsules[el.dataset.id];
    if (!c) return;
    const k = kindKey(c);
    if (k === "random") {
      d.values[c.id] = randomIn(c);
      touch();
      roll(el, c);
    } else if (k === "input") openInputPop(el, c);
    else openFormulaPop(el, c);
  });
  $("#rerollAll").addEventListener("click", () => {
    const d = cur();
    capsOf(d).forEach((c) => { if (kindKey(c) === "random") d.values[c.id] = randomIn(c); });
    touch();
    const els = $$('.pill[data-kind="random"]', view);
    if (!els.length || reduceMotion) { refreshPills(); return; }
    els.forEach((el) => roll(el, d.capsules[el.dataset.id]));
  });
  const fxBtn = $("#showFx");
  fxBtn.setAttribute("aria-pressed", String(!!state.showFx));
  fxBtn.addEventListener("click", () => {
    state.showFx = !state.showFx;
    fxBtn.setAttribute("aria-pressed", String(state.showFx));
    view.classList.toggle("show-fx", state.showFx);
    persist();
  });

  /* ================= 浮层（浏览时填写 / 查看算式） ================= */
  const pop = $("#pop");
  let popAnchor = null;
  function placePop(anchor) {
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), innerWidth - w - 16);
    let top = r.bottom + 10;
    if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 10);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }
  function showPop(anchor, html, c) {
    popAnchor = anchor;
    pop.innerHTML = html;
    pop.dataset.color = c.color;
    pop.setAttribute("aria-label", c.name);
    pop.hidden = false;
    placePop(anchor);
  }
  function closePop(restoreFocus) {
    if (pop.hidden) return;
    pop.hidden = true;
    pop.innerHTML = "";
    if (restoreFocus && popAnchor && popAnchor.isConnected) popAnchor.focus();
    popAnchor = null;
  }
  function openInputPop(el, c) {
    const d = cur(), [lo, hi] = bounds(c), dec = decimalsOf(c), step = dec ? Math.pow(10, -dec) : 1;
    const v = valueOf(d, c);
    showPop(el, `
      <div class="pop-h"><span class="dot"></span>${esc(c.name)}<small>${numText(c, lo)} – ${numText(c, hi)}${c.unit ? " " + esc(c.unit) : ""}</small></div>
      <sl-input type="number" id="popNum" inputmode="decimal" min="${lo}" max="${hi}" step="${step}" value="${v}" aria-label="${esc(c.name)}">${c.unit ? `<span slot="suffix">${esc(c.unit)}</span>` : ""}</sl-input>
      <sl-range id="popRange" min="${lo}" max="${hi}" step="${step}" value="${v}" tooltip="none" aria-label="${esc(c.name)} 滑块"></sl-range>
      <p class="note">超出区间的数会自动调整到最近的边界。</p>
      <div class="row"><sl-button size="small" id="popReset">恢复默认</sl-button><sl-button size="small" variant="primary" id="popOk">完成</sl-button></div>`, c);
    const num = $("#popNum"), rng = $("#popRange");
    const apply = (raw, fromRange) => {
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return;
      d.values[c.id] = clampToRange(c, n);
      if (fromRange) num.value = String(d.values[c.id]); else rng.value = d.values[c.id];
      touch();
      refreshPills();
    };
    num.addEventListener("sl-input", () => apply(num.value, false));
    num.addEventListener("sl-change", () => { num.value = String(d.values[c.id]); });
    rng.addEventListener("sl-input", () => apply(rng.value, true));
    num.addEventListener("keydown", (e) => { if (e.key === "Enter") closePop(true); });
    $("#popOk").addEventListener("click", () => closePop(true));
    $("#popReset").addEventListener("click", () => {
      d.values[c.id] = initialValue(c);
      num.value = String(d.values[c.id]);
      rng.value = d.values[c.id];
      touch();
      refreshPills();
    });
    requestAnimationFrame(() => { num.focus(); num.select(); });
  }
  function openFormulaPop(el, c) {
    const d = cur(), r = safeValue(d, c);
    const sub = Expr.pretty(c.formula, (name) => {
      const o = byName(d, name);
      if (!o) return name;
      const rv = safeValue(d, o);
      return rv.err ? "?" : numText(o, rv.v);
    });
    showPop(el, `
      <div class="pop-h"><span class="dot"></span>${esc(c.name)}<small>公式</small></div>
      <div class="calc">
        <div>${esc(c.name)} = ${esc(Expr.pretty(c.formula))}</div>
        <div>= ${esc(sub)}</div>
        <div class="res">= ${r.err ? esc(r.err) : esc(fullText(c, r.v))}</div>
      </div>
      <p class="note">公式里用到的胶囊一变，这里会自动重新计算。</p>
      <div class="row"><sl-button size="small" id="popOk">关闭</sl-button></div>`, c);
    $("#popOk").addEventListener("click", () => closePop(true));
    requestAnimationFrame(() => $("#popOk")?.focus());
  }
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== popAnchor && !popAnchor?.contains(e.target)) closePop();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) closePop(true); });
  addEventListener("resize", () => closePop());
  document.addEventListener("scroll", () => { if (!pop.hidden && popAnchor) placePop(popAnchor); }, true);

  /* ================= 编辑器 ================= */
  ed.contentEditable = "plaintext-only";
  if (ed.contentEditable !== "plaintext-only") ed.contentEditable = "true";
  const tokLen = (el) => el.dataset.id.length + 4;

  function editPill(d, id) {
    const c = d.capsules[id];
    const el = document.createElement("span");
    el.className = "pill";
    el.contentEditable = "false";
    el.dataset.id = id;
    if (!c) {
      el.classList.add("err");
      el.innerHTML = missingInner;
      el.title = "这个胶囊已被删除，可以直接删掉这个占位";
      return el;
    }
    const { r, k, html } = pillInner(d, c);
    el.dataset.color = c.color;
    el.dataset.kind = k;
    if (r.err) el.classList.add("err");
    el.title = `${c.name} · ${kindLabel[k]}${r.err ? " · " + r.err : ""}（点击编辑）`;
    el.innerHTML = html;
    return el;
  }
  function renderEditor() {
    const d = cur(), body = d.body, frag = document.createDocumentFragment();
    let last = 0;
    body.replace(TOKEN, (m, id, off) => {
      if (off > last) frag.append(document.createTextNode(body.slice(last, off)));
      frag.append(editPill(d, id));
      last = off + m.length;
      return m;
    });
    if (last < body.length) frag.append(document.createTextNode(body.slice(last)));
    if (!body || body.endsWith("\n")) { const br = document.createElement("br"); br.className = "tail"; frag.append(br); }
    ed.replaceChildren(frag);
  }
  function serialize() {
    let s = "";
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) s += c.data.replace(/ /g, " ");
        else if (c.nodeType === 1) {
          if (c.classList.contains("pill")) s += tok(c.dataset.id);
          else if (c.tagName === "BR") { if (!c.classList.contains("tail")) s += "\n"; }
          else {
            if (/^(DIV|P)$/.test(c.tagName) && s && !s.endsWith("\n")) s += "\n";
            walk(c);
          }
        }
      }
    };
    walk(ed);
    return s;
  }
  /* 光标位置 <-> 正文字符偏移（胶囊按其占位符长度计算） */
  function offsetOf(node, off) {
    const pill = node.nodeType === 1 ? node.closest?.(".pill") : node.parentElement?.closest(".pill");
    if (pill && ed.contains(pill)) { node = pill.parentNode; off = [...node.childNodes].indexOf(pill) + 1; }
    let pos = 0, found = null;
    const walk = (n) => {
      for (let i = 0; i < n.childNodes.length; i++) {
        if (n === node && i === off) { found = pos; return true; }
        const c = n.childNodes[i];
        if (c === node && c.nodeType === 3) { found = pos + off; return true; }
        if (c.nodeType === 3) pos += c.data.length;
        else if (c.classList?.contains("pill")) pos += tokLen(c);
        else if (c.tagName === "BR") { if (!c.classList.contains("tail")) pos += 1; }
        else if (c.nodeType === 1 && walk(c)) return true;
      }
      if (n === node) { found = pos; return true; }
      return false;
    };
    walk(ed);
    return found ?? pos;
  }
  function pointAt(pos) {
    for (const c of ed.childNodes) {
      if (c.nodeType === 3) { if (pos <= c.data.length) return [c, pos]; pos -= c.data.length; }
      else if (c.classList?.contains("pill")) {
        const L = tokLen(c);
        if (pos < L) return [ed, [...ed.childNodes].indexOf(c) + 1];
        pos -= L;
      }
    }
    const tail = ed.querySelector("br.tail");
    return [ed, tail ? [...ed.childNodes].indexOf(tail) : ed.childNodes.length];
  }
  function getSel() {
    const d = cur(), sel = getSelection();
    if (!sel.rangeCount || !ed.contains(sel.anchorNode)) return [d.body.length, d.body.length];
    const r = sel.getRangeAt(0);
    const a = offsetOf(r.startContainer, r.startOffset), b = offsetOf(r.endContainer, r.endOffset);
    return [Math.min(a, b), Math.max(a, b)];
  }
  function setSel(a, b = a) {
    const r = document.createRange();
    r.setStart(...pointAt(a));
    r.setEnd(...pointAt(b));
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
  function editBody(fn) {
    const d = cur();
    const [a, b] = getSel();
    const r = fn(d.body, a, b);
    if (!r) return;
    d.body = r.body;
    renderEditor();
    ed.focus();
    setSel(r.a, r.b ?? r.a);
    touch();
  }
  const insertText = (text) => editBody((s, a, b) => ({ body: s.slice(0, a) + text + s.slice(b), a: a + text.length }));

  ed.addEventListener("input", (e) => {
    const d = cur();
    d.body = serialize();
    if (!e.isComposing) {
      const messy = ed.querySelector("div, p, br:not(.tail)") || (d.body.endsWith("\n") !== !!ed.querySelector("br.tail"));
      if (messy) { const [a] = getSel(); renderEditor(); setSel(Math.min(a, d.body.length)); }
    }
    touch();
  });
  ed.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      editBody((s, a, b) => {
        const ls = s.lastIndexOf("\n", a - 1) + 1, line = s.slice(ls, a);
        const m = line.match(/^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)\. |> )/);
        if (m && line.trim() === m[0].trim() && a === b) return { body: s.slice(0, ls) + s.slice(a), a: ls };
        let prefix = "";
        if (m) prefix = m[3] ? `${m[1]}${+m[3] + 1}. ` : m[2].includes("[") ? `${m[1]}${m[2][0]} [ ] ` : m[1] + m[2];
        const ins = "\n" + prefix;
        return { body: s.slice(0, a) + ins + s.slice(b), a: a + ins.length };
      });
    } else if (e.key === "Tab") {
      e.preventDefault();
      insertText("  ");
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "b" || e.key === "i")) {
      e.preventDefault();
      mdAction(e.key === "b" ? "bold" : "italic");
    }
  });
  ed.addEventListener("paste", (e) => {
    e.preventDefault();
    insertText((e.clipboardData || window.clipboardData).getData("text/plain").replace(/\r\n?/g, "\n"));
  });
  ed.addEventListener("drop", (e) => e.preventDefault());
  ed.addEventListener("click", (e) => {
    const p = e.target.closest(".pill");
    if (!p) return;
    e.preventDefault();
    const [a] = getSel();
    if (cur().capsules[p.dataset.id]) openDialog(p.dataset.id, { at: a });
  });

  /* 工具栏：mousedown 阻止默认行为，让选区留在编辑器里 */
  $("#toolbar").addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
  function wrap(pre, post, placeholder) {
    editBody((s, a, b) => {
      const inner = s.slice(a, b) || placeholder;
      return { body: s.slice(0, a) + pre + inner + post + s.slice(b), a: a + pre.length, b: a + pre.length + inner.length };
    });
  }
  function linePrefix(prefix, re) {
    editBody((s, a, b) => {
      const ls = s.lastIndexOf("\n", a - 1) + 1;
      const le = s.indexOf("\n", b) === -1 ? s.length : s.indexOf("\n", b);
      const lines = s.slice(ls, le).split("\n");
      const allHave = lines.every((l) => re.test(l));
      let n = 0;
      const next = lines.map((l) => {
        const stripped = l.replace(/^(#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+\. |> )/, "");
        return allHave ? stripped : (typeof prefix === "function" ? prefix(++n) : prefix) + stripped;
      }).join("\n");
      const delta = next.length - (le - ls);
      return { body: s.slice(0, ls) + next + s.slice(le), a: Math.max(ls, a + (lines.length === 1 ? delta : 0)), b: b + delta };
    });
  }
  function mdAction(kind) {
    switch (kind) {
      case "bold": return wrap("**", "**", "粗体文字");
      case "italic": return wrap("*", "*", "斜体文字");
      case "strike": return wrap("~~", "~~", "删除的文字");
      case "code": return wrap("`", "`", "代码");
      case "link": return wrap("[", "](https://)", "链接文字");
      case "h2": return linePrefix("## ", /^## /);
      case "ul": return linePrefix("- ", /^[-*+] (?!\[)/);
      case "ol": return linePrefix((n) => `${n}. `, /^\d+\. /);
      case "task": return linePrefix("- [ ] ", /^[-*+] \[[ xX]\] /);
      case "quote": return linePrefix("> ", /^> /);
      case "hr": return insertText("\n\n---\n\n");
      case "table": return insertText("\n\n| 项目 | 数值 |\n| --- | --- |\n| 示例 | 1 |\n\n");
    }
  }
  $$("[data-md]").forEach((b) => b.addEventListener("click", () => mdAction(b.dataset.md)));
  $("#insertCap").addEventListener("click", () => {
    const [a, b] = getSel();
    openDialog(null, { at: a, end: b });
  });

  /* ================= 胶囊设置对话框（Shoelace） ================= */
  const dlg = $("#capDlg");
  let ctx = null;
  function newCapsule(d) {
    let n = 1;
    while (byName(d, `数值${n}`)) n++;
    return { id: uid("c_"), name: `数值${n}`, kind: "range", source: "random", min: 1, max: 100, decimals: 0, def: null, formula: "", unit: "", color: COLORS[capsOf(d).length % COLORS.length][0] };
  }
  const decOptions = (c) => [0, 1, 2, 3, 4].map((n) => `<sl-option value="${n}">${n} 位</sl-option>`).join("");
  function openDialog(id, opts = {}) {
    const d = cur();
    const base = id ? d.capsules[id] : newCapsule(d);
    const c = JSON.parse(JSON.stringify(base));
    ctx = { c, isNew: !id, at: opts.at ?? d.body.length, end: opts.end ?? opts.at ?? d.body.length, origName: base.name, orig: base };
    const others = capsOf(d).filter((o) => o.id !== c.id);
    const num = (v) => (v === null || v === undefined || v === "" ? "" : v);
    dlg.label = ctx.isNew ? "插入胶囊" : "编辑胶囊";
    dlg.innerHTML = `
      <div class="form" id="capForm">
        <sl-input id="fName" label="名称" help-text="公式里用这个名字引用它，可以用中文" value="${esc(c.name)}" maxlength="24" autocomplete="off"></sl-input>
        <sl-radio-group id="fKind" label="类型" value="${c.kind}">
          <sl-radio-button value="range">区间</sl-radio-button>
          <sl-radio-button value="formula">计算函数</sl-radio-button>
        </sl-radio-group>
        <div id="grpRange" class="form">
          <div class="grid3">
            <sl-input id="fMin" type="number" label="最小值" value="${num(c.min)}" step="any"></sl-input>
            <sl-input id="fMax" type="number" label="最大值" value="${num(c.max)}" step="any"></sl-input>
            <sl-select id="fDecR" label="小数位" value="${decimalsOf(c)}">${decOptions(c)}</sl-select>
          </div>
          <sl-radio-group id="fSource" label="浏览时" value="${c.source === "input" ? "input" : "random"}">
            <sl-radio-button value="random">随机生成</sl-radio-button>
            <sl-radio-button value="input">用户填写</sl-radio-button>
          </sl-radio-group>
          <sl-input id="fDef" type="number" label="默认值" help-text="不填则取最小值" value="${num(c.def)}" step="any" clearable></sl-input>
        </div>
        <div id="grpFormula">
          <sl-textarea id="fFormula" label="计算公式" rows="2" resize="auto" placeholder="例如：液重 / 粉量" value="${esc(c.formula || "")}" spellcheck="false"></sl-textarea>
          ${others.length ? `<div class="chips" aria-label="点击插入其它胶囊的名称">${others.map((o) => `<button type="button" class="pill" data-kind="${kindKey(o)}" data-color="${o.color}" data-ins="${esc(o.name)}"><span class="lb">${esc(o.name)}</span></button>`).join("")}</div>` : '<p class="hint">文档里还没有其它胶囊。先插入几个区间胶囊，再用公式把它们算起来。</p>'}
          <p class="hint">支持 + − × ÷ ^ % 和括号；函数 round(x, 位数)、min、max、sum、avg、abs、sqrt、pow、floor、ceil、if(条件, 是, 否)。</p>
          <div style="max-width:160px;margin-top:14px"><sl-select id="fDecF" label="小数位" value="${decimalsOf(c)}">${decOptions(c)}</sl-select></div>
        </div>
        <sl-input id="fUnit" label="单位" placeholder="例如 g、%、元" value="${esc(c.unit || "")}" maxlength="8"></sl-input>
        <div>
          <span class="label" id="colorLabel">颜色</span>
          <div class="swatches" role="radiogroup" aria-labelledby="colorLabel">${COLORS.map(([k, label]) => `<label data-color="${k}" title="${label}"><input type="radio" name="color" value="${k}"${c.color === k ? " checked" : ""} aria-label="${label}"></label>`).join("")}</div>
        </div>
        <div>
          <span class="label">预览</span>
          <div class="preview" id="preview" aria-live="polite"></div>
        </div>
      </div>
      <div slot="footer" class="dlg-foot">
        ${ctx.isNew ? "" : '<sl-button variant="danger" id="dlgDel">删除</sl-button>'}
        <span class="spacer"></span>
        <sl-button id="dlgCancel">取消</sl-button>
        <sl-button variant="primary" id="dlgSave">${ctx.isNew ? "插入" : "保存"}</sl-button>
      </div>`;
    ["sl-input", "sl-change", "change"].forEach((ev) => dlg.addEventListener(ev, syncForm));
    $("#dlgCancel", dlg).addEventListener("click", () => dlg.hide());
    $("#dlgSave", dlg).addEventListener("click", saveDialog);
    dlg.addEventListener("keydown", onDialogKey);
    $$("[data-ins]", dlg).forEach((b) => b.addEventListener("click", () => {
      const ta = $("#fFormula", dlg), name = b.dataset.ins;
      const native = ta.shadowRoot?.querySelector("textarea");
      const s = native ? native.selectionStart : ta.value.length, e2 = native ? native.selectionEnd : ta.value.length;
      ta.value = ta.value.slice(0, s) + name + ta.value.slice(e2);
      ta.focus();
      requestAnimationFrame(() => ta.setSelectionRange(s + name.length, s + name.length));
      syncForm();
    }));
    const del = $("#dlgDel", dlg);
    if (del) del.addEventListener("click", () => {
      if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "确定删除？"; return; }
      removeCapsule(c.id);
      dlg.hide();
    });
    customElements.whenDefined("sl-input").then(() => {
      syncForm();
      dlg.show();
      setTimeout(() => { const n = $("#fName", dlg); n.focus(); n.select(); }, 60);
    });
  }
  function onDialogKey(e) {
    if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "SL-TEXTAREA" && !$("#dlgSave", dlg).disabled && e.target.closest?.("#capForm")) {
      e.preventDefault();
      saveDialog();
    }
  }
  dlg.addEventListener("sl-after-hide", (e) => {
    if (e.target !== dlg) return;
    ["sl-input", "sl-change", "change"].forEach((ev) => dlg.removeEventListener(ev, syncForm));
    dlg.removeEventListener("keydown", onDialogKey);
    if (state.mode === "edit") ed.focus();
  });
  function readForm() {
    const c = ctx.c, f = (id) => $(id, dlg);
    const numOrNull = (v) => (String(v ?? "").trim() === "" ? null : Number(v));
    c.name = String(f("#fName").value).trim();
    c.kind = f("#fKind").value || "range";
    c.source = f("#fSource").value || "random";
    c.min = numOrNull(f("#fMin").value);
    c.max = numOrNull(f("#fMax").value);
    c.def = numOrNull(f("#fDef").value);
    c.formula = String(f("#fFormula").value).trim();
    c.decimals = +((c.kind === "formula" ? f("#fDecF") : f("#fDecR")).value || 0);
    c.unit = String(f("#fUnit").value).trim();
    c.color = ($('input[name="color"]:checked', dlg) || {}).value || c.color;
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
  /* 在临时副本上试算，对话框里的改动不会提前写入文档 */
  function trialDoc(c) {
    const d = cur();
    const capsules = { ...d.capsules, [c.id]: c };
    if (ctx.origName !== c.name) capsOf(d).forEach((o) => {
      if (o.id !== c.id && o.kind === "formula") capsules[o.id] = { ...o, formula: Expr.renameRef(o.formula, ctx.origName, c.name) };
    });
    return { ...d, capsules, values: { ...d.values, [c.id]: undefined } };
  }
  function syncForm() {
    if (!ctx) return;
    const c = readForm();
    $("#grpRange", dlg).hidden = c.kind !== "range";
    $("#grpFormula", dlg).hidden = c.kind !== "formula";
    $("#fDef", dlg).hidden = c.source !== "input";
    const prev = $("#preview", dlg), save = $("#dlgSave", dlg);
    let err = validate(c), html = "";
    if (!err) {
      const t = trialDoc(c), r = safeValue(t, c);
      if (r.err) err = r.err; else html = pillInner(t, c).html;
    }
    save.disabled = !!err;
    if (err) { prev.innerHTML = `<span class="msg bad">${esc(err)}</span>`; return; }
    const k = kindKey(c);
    const text = { random: "浏览时点一下会在区间内重新抽取", input: "浏览时读者可以点开填写", formula: `= ${Expr.pretty(c.formula)}` }[k];
    prev.innerHTML = `<span class="pill demo" data-kind="${k}" data-color="${c.color}">${html}</span><span class="msg">${esc(text)}</span>`;
  }
  function saveDialog() {
    const c = readForm();
    if (validate(c)) return;
    const d = cur(), old = ctx.orig;
    if (!ctx.isNew && old.name !== c.name) {
      capsOf(d).forEach((o) => { if (o.id !== c.id && o.kind === "formula") o.formula = Expr.renameRef(o.formula, old.name, c.name); });
    }
    if (c.kind === "formula") c.def = null;
    d.capsules[c.id] = c;
    if (c.kind === "formula") delete d.values[c.id];
    else {
      const v = d.values[c.id];
      const changed = ctx.isNew || old.kind !== c.kind || old.source !== c.source || old.min !== c.min || old.max !== c.max || old.decimals !== c.decimals || old.def !== c.def;
      d.values[c.id] = changed || typeof v !== "number" ? initialValue(c) : clampToRange(c, v);
    }
    const isNew = ctx.isNew, at = ctx.at, end = ctx.end;
    ctx = null;
    dlg.hide();
    if (isNew) {
      const t = tok(c.id), a = Math.min(at, d.body.length), b = Math.min(end, d.body.length);
      d.body = d.body.slice(0, a) + t + d.body.slice(b);
      renderEditor();
      ed.focus();
      setSel(a + t.length);
    } else refreshEditorPills();
    touch();
  }
  function refreshEditorPills() {
    const d = cur();
    $$(".pill", ed).forEach((p) => p.replaceWith(editPill(d, p.dataset.id)));
  }
  function removeCapsule(id) {
    const d = cur();
    d.body = d.body.split(tok(id)).join("");
    delete d.capsules[id];
    delete d.values[id];
    ctx = null;
    renderEditor();
    touch();
  }

  /* ================= 卡片反光跟随指针 ================= */
  const card = $(".card");
  document.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  /* ================= 快捷键 & 启动 ================= */
  const inNativeField = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName?.startsWith("SL-"));
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "e") { e.preventDefault(); if (!dlg.open) setMode(state.mode === "edit" ? "view" : "edit"); return; }
    if ((k === "z" || k === "y") && !dlg.open && !inNativeField(document.activeElement)) {
      e.preventDefault();
      if (k === "y" || e.shiftKey) redo(); else undo();
    }
  });
  app.dataset.mode = state.mode;
  $$("[data-set-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setMode === state.mode)));
  renderAll();
  persist();

  window.__capsuleNotes = { state, setMode, openDialog, undo, redo };
})();
