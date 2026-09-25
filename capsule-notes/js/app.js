/* 胶囊笔记：文档管理、编辑器、浏览视图、胶囊设置对话框、浮层与撤销/重做。
 * 界面组件来自 Framework7（iOS 主题）：侧边面板、导航栏、工具栏、气泡、对话框、步进器、滑块、提示。 */
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
    random: '<i class="f7-icons k" aria-hidden="true">shuffle</i>',
    input: '<i class="f7-icons k" aria-hidden="true">pencil</i>',
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

  /* 胶囊内部结构：· 名称  数值 单位 [类型图标] */
  function pillInner(d, c, { showExpr = false } = {}) {
    const r = safeValue(d, c), k = kindKey(c);
    const expr = k === "formula" && showExpr ? `<span class="ex">${esc(Expr.pretty(c.formula))} =</span>` : "";
    const val = r.err ? "!" : numText(c, r.v);
    return { r, k, html: `<span class="lb">${esc(c.name)}</span>${expr}<b class="v">${esc(val)}</b>${c.unit && !r.err ? `<span class="u">${esc(c.unit)}</span>` : ""}${KIND_ICON[k]}` };
  }
  const missingInner = '<span class="lb">已删除</span><b class="v">?</b>';

  /* ================= Framework7 应用 ================= */
  const f7 = new Framework7({
    el: "#app",
    theme: "ios",
    darkMode: false,
    colors: { primary: "#007aff" },
    popover: { backdrop: false, closeByOutsideClick: true, closeOnEscape: false },
    toast: { closeTimeout: 1300, position: "center" },
    dialog: { buttonOk: "好", buttonCancel: "取消" },
  });
  const WIDE = 960;
  const panel = f7.panel.create({ el: "#sidebar", visibleBreakpoint: WIDE, swipe: true });
  const toast = (text) => f7.toast.create({ text, destroyOnClose: true }).open();

  /* ================= 模式与整体渲染 ================= */
  const app = $("#app"), view = $("#view"), ed = $("#editor");
  function syncModeUI() {
    app.dataset.mode = state.mode;
    $$("[data-set-mode]").forEach((b) => b.classList.toggle("button-active", b.dataset.setMode === state.mode));
  }
  function setMode(m) {
    closeCurrent();
    commitHistory();
    if (m === "view") prune(cur());
    state.mode = m;
    syncModeUI();
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
    $("#docTitle").textContent = d.title || "未命名文档";
    document.title = `${d.title || "未命名文档"} · 胶囊笔记`;
    renderDocList();
    if (state.mode === "edit") renderEditor(); else renderView();
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

  /* ================= 侧边栏 ================= */
  const isWide = () => innerWidth >= WIDE;
  $("#sidebarBtn").addEventListener("click", () => {
    if (isWide()) panel.toggleVisibleBreakpoint();
    else if (panel.opened) panel.close(); else panel.open();
  });
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
  function deleteDoc(id) {
    state.docs = state.docs.filter((d) => d.id !== id);
    hist.delete(id);
    if (state.currentId === id) state.currentId = [...state.docs].sort((a, b) => b.updated - a.updated)[0].id;
    persist();
    renderAll();
    toast("已删除文档");
  }
  function openDoc(id) {
    if (narrowClose()) { /* 窄屏上选中后收起侧边栏 */ }
    if (id === state.currentId) return;
    closeCurrent();
    commitHistory();
    prune(cur());
    state.currentId = id;
    persist();
    renderAll();
    $("#scroller").scrollTop = 0;
  }
  const narrowClose = () => { if (!isWide() && panel.opened) { panel.close(); return true; } return false; };
  const docListEl = $("#docList");
  docListEl.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li || e.target.closest(".swipeout-actions-right")) return;
    if (li.classList.contains("swipeout-opened")) return;
    openDoc(li.dataset.id);
  });
  docListEl.addEventListener("keydown", (e) => {
    const li = e.target.closest("li[data-id]");
    if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDoc(li.dataset.id); }
  });
  docListEl.addEventListener("swipeout:deleted", (e) => {
    const li = e.target.closest("li[data-id]");
    if (li) deleteDoc(li.dataset.id);
  });
  docListEl.addEventListener("contextmenu", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li || state.docs.length < 2) return;
    e.preventDefault();
    const d = state.docs.find((x) => x.id === li.dataset.id);
    f7.dialog.confirm(`「${esc(d.title || "未命名文档")}」会被删除，且无法恢复。`, "删除文档？", () => deleteDoc(d.id));
  });
  $("#newDoc").addEventListener("click", () => {
    closeCurrent();
    commitHistory();
    const d = { id: uid("d_"), title: "未命名文档", updated: Date.now(), body: "# 未命名文档\n\n在这里写一句简介。\n\n", capsules: {}, values: {} };
    state.docs.push(d);
    state.currentId = d.id;
    $("#search").value = "";
    narrowClose();
    state.mode = "edit";
    syncModeUI();
    renderAll();
    persist();
    renameDoc();
  });
  function renameDoc() {
    const d = cur();
    f7.dialog.prompt("", "给文档起个名字", (v) => {
      v = String(v).trim();
      if (!v || v === d.title) return;
      d.title = v;
      touch();
      renderAll();
    }, null, d.title);
  }
  $("#titleBtn").addEventListener("click", renameDoc);

  /* 使用说明：Framework7 popup */
  $("#helpBtn").addEventListener("click", () => {
    closeCurrent();
    f7.popup.create({
      destroyOnClose: true,
      content: `<div class="popup"><div class="page">
        <div class="navbar"><div class="navbar-bg"></div><div class="navbar-inner"><div class="title">使用说明</div><div class="right"><a class="link popup-close">完成</a></div></div></div>
        <div class="page-content"><div class="help-content">
          <p>文档用 Markdown 书写，文中的<b>胶囊</b>是会变化的数字。</p>
          <dl>
            <dt><span class="pill demo" data-kind="random" data-color="violet"><span class="lb">随机</span><b class="v">7</b></span></dt>
            <dd>在区间内随机取数。点一下重新抽取；底部的 <i class="f7-icons" style="font-size:16px">shuffle</i> 会让全部随机胶囊一起重抽。</dd>
            <dt><span class="pill demo" data-kind="input" data-color="sky"><span class="lb">填写</span><b class="v">36.0</b><span class="u">g</span></span></dt>
            <dd>由读者自己填。点开后输入数字或拖动滑块，超出区间会自动调整到边界。</dd>
            <dt><span class="pill demo" data-kind="formula" data-color="rose"><span class="lb">公式</span><b class="v">19.0</b><span class="u">%</span></span></dt>
            <dd>用其它胶囊的名字写公式，例如 <code>液重 * 浓度 / 粉量</code>。虚线框表示它是算出来的，点开能看到代入后的算式。</dd>
          </dl>
          <p>切到「编辑」后，把光标放在想要的位置点「插入胶囊」；点击已有胶囊会弹出设置气泡，改动即时生效，按 Esc 或「取消」撤回。点顶部的标题可以重命名文档；在侧边栏向左滑动或右键可以删除文档。</p>
          <p class="keys"><kbd>⌘E</kbd> 切换模式　<kbd>⌘Z</kbd> 撤销　<kbd>⇧⌘Z</kbd> 重做　<kbd>⌘B</kbd> <kbd>⌘I</kbd> 粗体、斜体</p>
        </div></div></div></div>`,
    }).open();
  });

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
    $("#rerollAll").classList.toggle("disabled", !hasRandom);
  }
  function syncPill(el, fresh) {
    const open = el.classList.contains("open");
    el.className = fresh.className + (open ? " open" : "");
    el.innerHTML = fresh.innerHTML;
    el.title = fresh.title;
    if (fresh.dataset.color) el.dataset.color = fresh.dataset.color; else delete el.dataset.color;
    if (fresh.dataset.kind) el.dataset.kind = fresh.dataset.kind; else delete el.dataset.kind;
    const al = fresh.getAttribute("aria-label");
    if (al) el.setAttribute("aria-label", al);
  }
  function refreshPills() {
    const d = cur(), tmp = document.createElement("div");
    $$(".pill[data-id]", view).forEach((el) => {
      tmp.innerHTML = viewPillHTML(d, el.dataset.id);
      syncPill(el, tmp.firstElementChild);
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
    if (current && current.anchor === el) { closeCurrent(); return; }
    if (k === "random") {
      closeCurrent();
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
  $("#undo").addEventListener("click", () => { undo(); toast("已撤销"); });
  $("#redo").addEventListener("click", () => { redo(); toast("已重做"); });

  function openInputPop(el, c) {
    const d = cur(), [lo, hi] = bounds(c), dec = decimalsOf(c), step = dec ? Math.pow(10, -dec) : 1;
    const v = valueOf(d, c);
    const { root } = openPop(el, `
      <div class="pop-head"><span class="dot"></span>${esc(c.name)}<small>${numText(c, lo)} – ${numText(c, hi)}${c.unit ? " " + esc(c.unit) : ""}</small></div>
      <div class="val-body">
        <div class="val-row"><input class="num-input" type="number" id="popNum" inputmode="decimal" value="${v.toFixed(dec)}" step="${step}" min="${lo}" max="${hi}" aria-label="${esc(c.name)}">${c.unit ? `<span class="unit">${esc(c.unit)}</span>` : ""}</div>
        <div class="range-slider" id="popRange"></div>
      </div>
      <p class="note">超出区间的数会自动调整到最近的边界。</p>
      <div class="pop-foot"><button class="button button-round" type="button" id="popReset">恢复默认</button><span class="spacer"></span><button class="button button-fill button-round" type="button" id="popOk">完成</button></div>`,
      "val-pop");
    const num = $("#popNum", root);
    let syncing = false;
    const range = f7.range.create({
      el: $("#popRange", root), min: lo, max: hi, step, value: v, label: false,
      on: { change(r, val) { if (syncing) return; apply(val, true); } },
    });
    function apply(raw, fromRange) {
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return;
      d.values[c.id] = clampToRange(c, n);
      if (fromRange) num.value = d.values[c.id].toFixed(dec);
      else { syncing = true; range.setValue(d.values[c.id]); syncing = false; }
      touch();
      refreshPills();
    }
    num.addEventListener("input", () => apply(num.value, false));
    num.addEventListener("change", () => { num.value = d.values[c.id].toFixed(dec); });
    num.addEventListener("keydown", (e) => { if (e.key === "Enter") closeCurrent(); });
    $("#popOk", root).addEventListener("click", () => closeCurrent());
    $("#popReset", root).addEventListener("click", () => { apply(String(initialValue({ ...c, source: "input" })), false); num.value = d.values[c.id].toFixed(dec); });
    setTimeout(() => { num.focus(); num.select(); }, 60);
  }
  function openFormulaPop(el, c) {
    const d = cur(), r = safeValue(d, c);
    const sub = Expr.pretty(c.formula, (name) => {
      const o = byName(d, name);
      if (!o) return name;
      const rv = safeValue(d, o);
      return rv.err ? "?" : numText(o, rv.v);
    });
    openPop(el, `
      <div class="pop-head"><span class="dot"></span>${esc(c.name)}<small>公式</small></div>
      <div class="calc">
        <div>${esc(c.name)} = ${esc(Expr.pretty(c.formula))}</div>
        <div>= ${esc(sub)}</div>
        <div class="res">= ${r.err ? esc(r.err) : esc(fullText(c, r.v))}</div>
      </div>
      <p class="note">公式里用到的胶囊一变，这里会自动重新计算。</p>`, "val-pop");
  }

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
    if (current && current.anchor === p) return;
    if (cur().capsules[p.dataset.id]) openInspector(p.dataset.id);
  });

  /* 工具栏：mousedown 阻止默认行为，让选区留在编辑器里 */
  $("#formatbar").addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
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

  /* ================= 胶囊检查器（编辑模式的气泡，改动即时生效） ================= */
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
    const anchor = ed.querySelector(`.pill[data-id="${id}"]`);
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
        ${others.length ? `<div class="chips" aria-label="点击插入其它胶囊的名称">${others.map((o) => `<button type="button" class="pill" data-kind="${kindKey(o)}" data-color="${o.color}" data-ins="${esc(o.name)}"><span class="lb">${esc(o.name)}</span></button>`).join("")}</div>` : ""}
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
      if (state.mode === "edit") renderEditor();
      return;
    }
    if (reason === "delete") {
      d.body = d.body.split(tok(me.id)).join("");
      delete d.capsules[me.id];
      delete d.values[me.id];
      if (state.mode === "edit") renderEditor();
      touch();
      toast("已删除胶囊");
      return;
    }
    if (snap(d) !== me.snapshot) touch();
  }
  function refreshEditorPills() {
    const d = cur();
    $$(".pill", ed).forEach((p) => syncPill(p, editPill(d, p.dataset.id)));
  }

  /* 插入胶囊：先放进正文作为气泡的锚点；取消会整个撤回 */
  $("#insertCap").addEventListener("mousedown", (e) => e.preventDefault());
  $("#insertCap").addEventListener("click", () => {
    if (state.mode !== "edit") return;
    closeCurrent();
    const d = cur(), before = snap(d);
    const [a, b] = getSel();
    const c = newCapsule(d);
    d.capsules[c.id] = c;
    d.values[c.id] = initialValue(c);
    const t = tok(c.id);
    d.body = d.body.slice(0, a) + t + d.body.slice(b);
    renderEditor();
    setSel(a + t.length);
    openInspector(c.id, { isNew: true, snapshot: before });
  });

  /* ================= 快捷键 & 启动 ================= */
  const inField = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "e") { e.preventDefault(); setMode(state.mode === "edit" ? "view" : "edit"); return; }
    if ((k === "z" || k === "y") && !current && !inField(document.activeElement)) {
      e.preventDefault();
      if (k === "y" || e.shiftKey) { redo(); toast("已重做"); } else { undo(); toast("已撤销"); }
    }
  });
  syncModeUI();
  renderAll();
  persist();

  window.__capsuleNotes = { state, setMode, openInspector, undo, redo, f7 };
})();
