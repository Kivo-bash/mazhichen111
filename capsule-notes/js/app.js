/* 胶囊笔记：文档管理、编辑器、浏览视图、胶囊设置对话框与浮层。 */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = MD.escape;
  const STORE = "capsule-notes:v1";
  const TOKEN = /\{\{(c_[a-z0-9]+)\}\}/g;
  const COLORS = [["coral", "珊瑚"], ["amber", "琥珀"], ["lime", "青柠"], ["teal", "青绿"], ["sky", "天蓝"], ["indigo", "靛蓝"], ["violet", "紫罗兰"], ["rose", "玫瑰"]];
  const NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const uid = (p) => p + Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "x");
  const tok = (id) => `{{${id}}}`;

  const ICON = {
    random: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5.5" cy="5.5" r="1.1" fill="currentColor"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/><circle cx="10.5" cy="10.5" r="1.1" fill="currentColor"/></svg>',
    input: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3-8 8H2.5v-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    formula: '<span class="fx" aria-hidden="true">ƒ</span>',
    missing: '<span aria-hidden="true">?</span>',
  };

  /* ================= 数据 ================= */
  function sampleDoc() {
    return {
      id: "d_sample",
      title: "周末聚餐计划",
      updated: Date.now(),
      body: [
        "# 周末聚餐计划",
        "",
        "这周六约了 {{c_people}} 位朋友来家里吃饭，每人预算 {{c_budget}}，算下来**总预算**是 {{c_total}}。",
        "",
        "> 带铅笔的胶囊可以点开填数；带骰子的胶囊点一下会重新随机；ƒ 胶囊由公式算出，点开能看到算式。",
        "",
        "## 今天的运气",
        "",
        "- 掷骰子决定谁洗碗：{{c_dice}} 点",
        "- 天气预报说气温大约 {{c_temp}}",
        "- 超市会员折扣抽到了 {{c_disc}}，实付只要 {{c_pay}}",
        "",
        "## 采购清单",
        "",
        "| 食材 | 数量 | 备注 |",
        "| --- | --- | --- |",
        "| 牛肉 | {{c_beef}} | 每人约 250 克 |",
        "| 蔬菜 | 3 份 | 随意搭配 |",
        "| 饮料 | 2 箱 | ~~不要可乐~~ 要气泡水 |",
        "",
        "- [x] 订好时间",
        "- [ ] 买食材",
        "",
        "---",
        "",
        "切换到「编辑」，点任意胶囊就能修改它的区间、公式和颜色。公式里可以用 `+ - * / ^`、括号，以及 `round`、`min`、`max`、`sum`、`avg` 等函数。",
        "",
      ].join("\n"),
      capsules: {
        c_people: { id: "c_people", name: "人数", kind: "range", source: "input", min: 2, max: 12, decimals: 0, def: 6, formula: "", unit: "", color: "teal" },
        c_budget: { id: "c_budget", name: "每人预算", kind: "range", source: "input", min: 50, max: 300, decimals: 0, def: 120, formula: "", unit: "元", color: "amber" },
        c_total: { id: "c_total", name: "总预算", kind: "formula", source: "random", min: 0, max: 100, decimals: 0, def: null, formula: "人数 * 每人预算", unit: "元", color: "coral" },
        c_dice: { id: "c_dice", name: "骰子", kind: "range", source: "random", min: 1, max: 6, decimals: 0, def: null, formula: "", unit: "", color: "violet" },
        c_temp: { id: "c_temp", name: "气温", kind: "range", source: "random", min: 18, max: 31, decimals: 0, def: null, formula: "", unit: "°C", color: "sky" },
        c_disc: { id: "c_disc", name: "折扣", kind: "range", source: "random", min: 0.7, max: 0.95, decimals: 2, def: null, formula: "", unit: "", color: "lime" },
        c_pay: { id: "c_pay", name: "实付", kind: "formula", source: "random", min: 0, max: 100, decimals: 0, def: null, formula: "round(总预算 * 折扣)", unit: "元", color: "rose" },
        c_beef: { id: "c_beef", name: "牛肉", kind: "formula", source: "random", min: 0, max: 100, decimals: 2, def: null, formula: "人数 * 0.25", unit: "千克", color: "indigo" },
      },
      values: {},
    };
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (s && Array.isArray(s.docs) && s.docs.length) {
        s.docs.forEach((d) => { d.capsules = d.capsules || {}; d.values = d.values || {}; d.body = d.body || ""; });
        return s;
      }
    } catch (e) { /* 存储不可用时从示例开始 */ }
    const d = sampleDoc();
    return { docs: [d], currentId: d.id, mode: "view", showFx: false };
  }
  const state = load();
  if (!state.docs.some((d) => d.id === state.currentId)) state.currentId = state.docs[0].id;
  const cur = () => state.docs.find((d) => d.id === state.currentId);

  let saveTimer = 0, savedAt = null;
  function touch() {
    const d = cur();
    d.updated = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 350);
    renderStatus("正在保存…");
  }
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); savedAt = new Date(); renderStatus(); }
    catch (e) { renderStatus("无法保存到浏览器存储，刷新后改动会丢失"); }
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
  function fmtNum(c, v) {
    const dec = decimalsOf(c);
    const s = v.toLocaleString("zh-CN", { minimumFractionDigits: c.kind === "formula" ? 0 : dec, maximumFractionDigits: dec });
    if (!c.unit) return s;
    return /^[%‰°]/.test(c.unit) ? s + c.unit : `${s} ${c.unit}`;
  }
  const kindKey = (c) => (c.kind === "formula" ? "formula" : c.source === "input" ? "input" : "random");
  const kindLabel = { random: "随机", input: "填写", formula: "公式" };

  /* ================= 模式与整体渲染 ================= */
  const app = $("#app"), view = $("#view"), ed = $("#editor");
  function setMode(m) {
    closePop();
    if (m === "view") prune(cur());
    state.mode = m;
    app.dataset.mode = m;
    $$("[data-set-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setMode === m)));
    if (m === "edit") { renderEditor(); } else { renderView(); }
    persist();
  }
  $$("[data-set-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.setMode)));

  /* 删除正文里已经不存在的胶囊 */
  function prune(d) {
    const used = new Set([...d.body.matchAll(TOKEN)].map((m) => m[1]));
    Object.keys(d.capsules).forEach((id) => { if (!used.has(id)) { delete d.capsules[id]; delete d.values[id]; } });
  }

  function renderAll() {
    const d = cur();
    $("#title").value = d.title;
    renderDocList();
    if (state.mode === "edit") renderEditor(); else renderView();
    renderStatus();
  }

  function renderStatus(msg) {
    const d = cur();
    const chars = d.body.replace(TOKEN, "").replace(/\s/g, "").length;
    const n = new Set([...d.body.matchAll(TOKEN)].map((m) => m[1])).size;
    const saved = msg || (savedAt ? `已自动保存 ${savedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "改动会自动保存");
    $("#status").textContent = `${chars} 字 · ${n} 个胶囊 · ${saved}`;
  }

  /* ================= 文档列表 ================= */
  function renderDocList() {
    const list = $("#docList");
    const docs = [...state.docs].sort((a, b) => b.updated - a.updated);
    list.innerHTML = docs.map((d) => `
      <div class="doc-item${d.id === state.currentId ? " on" : ""}" data-id="${d.id}">
        <button class="open" type="button"${d.id === state.currentId ? ' aria-current="page"' : ""}>
          <span class="t">${esc(d.title || "未命名文档")}</span>
          <span class="d">${new Date(d.updated).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </button>
        ${state.docs.length > 1 ? `<button class="del" type="button" aria-label="删除「${esc(d.title)}」">删除</button>` : ""}
      </div>`).join("");
  }
  $("#docList").addEventListener("click", (e) => {
    const item = e.target.closest(".doc-item");
    if (!item) return;
    const id = item.dataset.id;
    if (e.target.closest(".del")) {
      const btn = e.target.closest(".del");
      if (!btn.classList.contains("armed")) {
        btn.classList.add("armed");
        btn.textContent = "确认删除";
        setTimeout(() => { if (btn.isConnected) { btn.classList.remove("armed"); btn.textContent = "删除"; } }, 3000);
        return;
      }
      state.docs = state.docs.filter((d) => d.id !== id);
      if (state.currentId === id) state.currentId = [...state.docs].sort((a, b) => b.updated - a.updated)[0].id;
      persist();
      renderAll();
      return;
    }
    if (e.target.closest(".open")) {
      prune(cur());
      state.currentId = id;
      closeSide();
      persist();
      renderAll();
    }
  });
  $("#newDoc").addEventListener("click", () => {
    const d = { id: uid("d_"), title: "未命名文档", updated: Date.now(), body: "# 未命名文档\n\n", capsules: {}, values: {} };
    state.docs.push(d);
    state.currentId = d.id;
    closeSide();
    setMode("edit");
    renderAll();
    $("#title").select();
  });
  $("#title").addEventListener("input", (e) => {
    cur().title = e.target.value;
    touch();
    renderDocList();
  });
  $("#title").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); (state.mode === "edit" ? ed : e.target).focus(); } });
  const closeSide = () => app.classList.remove("side-open");
  $("#menu").addEventListener("click", () => app.classList.add("side-open"));
  $("#scrim").hidden = false;
  $("#scrim").addEventListener("click", closeSide);

  /* ================= 浏览视图 ================= */
  function viewPillHTML(d, id) {
    const c = d.capsules[id];
    if (!c) return `<span class="pill err" title="这个胶囊已被删除">${ICON.missing}<b>已删除</b></span>`;
    const k = kindKey(c), r = safeValue(d, c);
    const shown = r.err ? "出错" : fmtNum(c, r.v);
    const verb = { random: "点击重新随机", input: "点击填写数值", formula: "点击查看算式" }[k];
    const expr = k === "formula" ? `<span class="expr">${esc(Expr.pretty(c.formula))} =</span>` : "";
    return `<button type="button" class="pill${r.err ? " err" : ""}" data-id="${id}" data-kind="${k}" data-color="${c.color}" aria-label="${esc(c.name)}：${esc(shown)}，${verb}" title="${esc(c.name)} · ${kindLabel[k]}">${ICON[k]}${expr}<b>${esc(shown)}</b></button>`;
  }
  function renderView() {
    const d = cur();
    const html = MD.render(d.body).replace(TOKEN, (_, id) => viewPillHTML(d, id));
    view.innerHTML = html.trim() ? html : '<p class="empty">这篇文档还是空的，切换到「编辑」开始写吧。</p>';
    view.classList.toggle("show-fx", !!state.showFx);
    const counts = { random: 0, input: 0, formula: 0 };
    new Set([...d.body.matchAll(TOKEN)].map((m) => m[1])).forEach((id) => { const c = d.capsules[id]; if (c) counts[kindKey(c)]++; });
    $("#summary").textContent = `${counts.random} 个随机 · ${counts.input} 个填写 · ${counts.formula} 个公式`;
    $("#rerollAll").disabled = !counts.random;
    persist();
  }
  /* 只更新胶囊里的数字，不重建整篇文档 */
  function refreshPills(skip) {
    const d = cur();
    $$(".pill[data-id]", view).forEach((el) => {
      if (el === skip) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = viewPillHTML(d, el.dataset.id);
      const fresh = tmp.firstElementChild;
      el.className = fresh.className;
      el.innerHTML = fresh.innerHTML;
      el.setAttribute("aria-label", fresh.getAttribute("aria-label"));
    });
  }
  function roll(el, c) {
    if (reduceMotion) { refreshPills(); return; }
    el.classList.add("rolling");
    const b = el.querySelector("b"), t0 = performance.now();
    const tick = (now) => {
      if (now - t0 < 420) { b.textContent = fmtNum(c, randomIn(c)); requestAnimationFrame(tick); }
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
    capsOf(d).forEach((c) => { if (c.kind === "range" && c.source === "random") d.values[c.id] = randomIn(c); });
    touch();
    const rolling = $$('.pill[data-kind="random"]', view);
    if (!rolling.length || reduceMotion) { refreshPills(); return; }
    rolling.forEach((el) => roll(el, d.capsules[el.dataset.id]));
  });
  $("#showFx").addEventListener("change", (e) => { state.showFx = e.target.checked; view.classList.toggle("show-fx", state.showFx); persist(); });

  /* ================= 浮层（浏览时填写 / 查看算式） ================= */
  const pop = $("#pop");
  let popAnchor = null;
  function placePop(anchor) {
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    let left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), innerWidth - w - 16);
    let top = r.bottom + 8;
    if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 8);
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
    if (restoreFocus && popAnchor && popAnchor.isConnected) popAnchor.focus();
    popAnchor = null;
  }
  function openInputPop(el, c) {
    const d = cur(), [lo, hi] = bounds(c), dec = decimalsOf(c), step = dec ? Math.pow(10, -dec) : 1;
    const v = valueOf(d, c);
    showPop(el, `
      <div class="pop-h"><span class="dot"></span>${esc(c.name)}<small>${fmtNum({ ...c, unit: "" }, lo)} – ${fmtNum({ ...c, unit: "" }, hi)}${c.unit ? " " + esc(c.unit) : ""}</small></div>
      <input type="number" id="popNum" inputmode="decimal" min="${lo}" max="${hi}" step="${step}" value="${v}" aria-label="${esc(c.name)}">
      <input type="range" id="popRange" min="${lo}" max="${hi}" step="${step}" value="${v}" aria-label="${esc(c.name)} 滑块">
      <p class="note" id="popNote">超出区间的数会自动调整到最近的边界。</p>
      <div class="row"><button type="button" class="btn" id="popReset">恢复默认</button><button type="button" class="btn btn-primary" id="popOk">完成</button></div>`, c);
    const num = $("#popNum"), rng = $("#popRange");
    const apply = (raw, fromRange) => {
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return;
      d.values[c.id] = clampToRange(c, n);
      if (fromRange) num.value = d.values[c.id]; else rng.value = d.values[c.id];
      touch();
      refreshPills();
    };
    num.addEventListener("input", () => apply(num.value, false));
    num.addEventListener("change", () => { num.value = d.values[c.id]; });
    rng.addEventListener("input", () => apply(rng.value, true));
    num.addEventListener("keydown", (e) => { if (e.key === "Enter") closePop(true); });
    $("#popOk").addEventListener("click", () => closePop(true));
    $("#popReset").addEventListener("click", () => { d.values[c.id] = initialValue(c); num.value = rng.value = d.values[c.id]; touch(); refreshPills(); });
    num.focus();
    num.select();
  }
  function openFormulaPop(el, c) {
    const d = cur(), r = safeValue(d, c);
    const sub = Expr.pretty(c.formula, (name) => {
      const o = byName(d, name);
      if (!o) return name;
      const rv = safeValue(d, o);
      return rv.err ? "?" : rv.v.toLocaleString("zh-CN", { maximumFractionDigits: decimalsOf(o) });
    });
    showPop(el, `
      <div class="pop-h"><span class="dot"></span>${esc(c.name)}<small>公式</small></div>
      <div class="calc">
        <div>${esc(c.name)} = ${esc(Expr.pretty(c.formula))}</div>
        <div>= ${esc(sub)}</div>
        <div class="res">= ${r.err ? esc(r.err) : esc(fmtNum(c, r.v))}</div>
      </div>
      <p class="note">公式里用到的胶囊变化时，这里会自动重新计算。</p>
      <div class="row"><button type="button" class="btn" id="popOk">关闭</button></div>`, c);
    $("#popOk").addEventListener("click", () => closePop(true));
    $("#popOk").focus();
  }
  document.addEventListener("pointerdown", (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== popAnchor && !popAnchor?.contains(e.target)) closePop(); });
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
      el.innerHTML = `${ICON.missing}<b>已删除</b>`;
      el.title = "这个胶囊已被删除，可以直接删掉这个占位";
      return el;
    }
    const r = safeValue(d, c), k = kindKey(c);
    el.dataset.color = c.color;
    if (r.err) el.classList.add("err");
    el.title = `${c.name} · ${kindLabel[k]}${r.err ? " · " + r.err : ""}（点击编辑）`;
    el.innerHTML = `${ICON[k]}<span class="nm">${esc(c.name)}</span><b>${r.err ? "!" : esc(fmtNum(c, r.v))}</b>`;
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
  /* 光标位置 <-> 正文字符偏移 */
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
  /* 以字符串方式修改正文，然后重建编辑器并恢复选区 */
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
    renderStatus();
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
    renderStatus();
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

  /* 工具栏：mousedown 阻止默认行为，保证选区还留在编辑器里 */
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

  /* ================= 胶囊设置对话框 ================= */
  const dlg = $("#dlg");
  let ctx = null;
  function newCapsule(d) {
    let n = 1;
    while (byName(d, `数值${n}`)) n++;
    return { id: uid("c_"), name: `数值${n}`, kind: "range", source: "random", min: 1, max: 100, decimals: 0, def: null, formula: "", unit: "", color: COLORS[capsOf(d).length % COLORS.length][0] };
  }
  function openDialog(id, opts = {}) {
    const d = cur();
    const base = id ? d.capsules[id] : newCapsule(d);
    const c = JSON.parse(JSON.stringify(base));
    ctx = { c, isNew: !id, at: opts.at ?? d.body.length, end: opts.end ?? opts.at ?? d.body.length, origName: base.name, orig: base };
    const others = capsOf(d).filter((o) => o.id !== c.id);
    const num = (v) => (v === null || v === undefined || v === "" ? "" : v);
    dlg.innerHTML = `
      <form method="dialog" id="capForm" novalidate>
        <div class="dlg-h"><span class="pill" data-color="${c.color}" id="dlgBadge">${ICON[kindKey(c)]}</span><h2 id="dlgTitle">${ctx.isNew ? "插入胶囊" : "编辑胶囊"}</h2></div>
        <div class="dlg-body">
          <label class="field"><span>名称（公式里用这个名字引用它）</span><input type="text" id="fName" value="${esc(c.name)}" autocomplete="off" maxlength="24"></label>
          <fieldset class="field"><legend>类型</legend>
            <div class="choice">
              <label><input type="radio" name="kind" value="range"${c.kind === "range" ? " checked" : ""}><b>区间</b><small>在最小值和最大值之间取数</small></label>
              <label><input type="radio" name="kind" value="formula"${c.kind === "formula" ? " checked" : ""}><b>计算函数</b><small>用其它胶囊算出来</small></label>
            </div>
          </fieldset>
          <div id="grpRange" class="field" style="gap:16px">
            <div class="grid3">
              <label class="field"><span>最小值</span><input type="number" id="fMin" value="${num(c.min)}" step="any"></label>
              <label class="field"><span>最大值</span><input type="number" id="fMax" value="${num(c.max)}" step="any"></label>
              <label class="field"><span>小数位</span><select id="fDecR">${[0, 1, 2, 3, 4].map((n) => `<option${n === decimalsOf(c) ? " selected" : ""}>${n}</option>`).join("")}</select></label>
            </div>
            <fieldset class="field"><legend>浏览时</legend>
              <div class="choice">
                <label><input type="radio" name="source" value="random"${c.source !== "input" ? " checked" : ""}><b>随机生成</b><small>点一下重新随机</small></label>
                <label><input type="radio" name="source" value="input"${c.source === "input" ? " checked" : ""}><b>用户填写</b><small>读者自己输入数值</small></label>
              </div>
            </fieldset>
            <label class="field" id="grpDef"><span>默认值（可不填，默认取最小值）</span><input type="number" id="fDef" value="${num(c.def)}" step="any"></label>
          </div>
          <div id="grpFormula" class="field" style="gap:10px">
            <label class="field"><span>计算公式</span><textarea id="fFormula" rows="2" placeholder="例如：人数 * 每人预算" spellcheck="false">${esc(c.formula || "")}</textarea></label>
            ${others.length ? `<div class="chips" aria-label="点击插入其它胶囊的名称">${others.map((o) => `<button type="button" class="pill" data-color="${o.color}" data-ins="${esc(o.name)}">${esc(o.name)}</button>`).join("")}</div>` : '<p class="hint">文档里还没有其它胶囊。先插入几个区间胶囊，再用公式把它们算起来。</p>'}
            <p class="hint">支持 + − × ÷ ^ % 和括号，函数：round(x, 位数)、min、max、sum、avg、abs、sqrt、pow、floor、ceil、if(条件, 是, 否)。</p>
            <label class="field" style="max-width:140px"><span>小数位</span><select id="fDecF">${[0, 1, 2, 3, 4].map((n) => `<option${n === decimalsOf(c) ? " selected" : ""}>${n}</option>`).join("")}</select></label>
          </div>
          <label class="field"><span>单位（可选）</span><input type="text" id="fUnit" value="${esc(c.unit || "")}" maxlength="8" placeholder="例如：元、%、千克"></label>
          <fieldset class="field"><legend>颜色</legend>
            <div class="swatches">${COLORS.map(([k, label]) => `<label data-color="${k}" title="${label}"><input type="radio" name="color" value="${k}"${c.color === k ? " checked" : ""} aria-label="${label}"></label>`).join("")}</div>
          </fieldset>
          <div class="field"><span>预览</span><div class="preview" id="preview" aria-live="polite"></div></div>
        </div>
        <div class="dlg-f">
          ${ctx.isNew ? "" : '<button type="button" class="btn btn-danger" id="dlgDel">删除</button>'}
          <span class="spacer"></span>
          <button type="button" class="btn" id="dlgCancel">取消</button>
          <button type="submit" class="btn btn-primary" id="dlgSave">${ctx.isNew ? "插入" : "保存"}</button>
        </div>
      </form>`;
    const form = $("#capForm", dlg);
    form.addEventListener("input", syncForm);
    form.addEventListener("change", syncForm);
    form.addEventListener("submit", (e) => { e.preventDefault(); saveDialog(); });
    $("#dlgCancel", dlg).addEventListener("click", () => dlg.close());
    $$("[data-ins]", dlg).forEach((b) => b.addEventListener("click", () => {
      const ta = $("#fFormula", dlg), s = ta.selectionStart, e2 = ta.selectionEnd, name = b.dataset.ins;
      ta.value = ta.value.slice(0, s) + name + ta.value.slice(e2);
      ta.focus();
      ta.setSelectionRange(s + name.length, s + name.length);
      syncForm();
    }));
    const del = $("#dlgDel", dlg);
    if (del) del.addEventListener("click", () => {
      if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "确定删除？"; return; }
      removeCapsule(c.id);
      dlg.close();
    });
    syncForm();
    dlg.showModal();
    const nameInput = $("#fName", dlg);
    nameInput.focus();
    nameInput.select();
  }
  function readForm() {
    const c = ctx.c, f = (id) => $(id, dlg);
    const numOrNull = (v) => (v.trim() === "" ? null : Number(v));
    c.name = f("#fName").value.trim();
    c.kind = $('input[name="kind"]:checked', dlg).value;
    c.source = $('input[name="source"]:checked', dlg).value;
    c.min = numOrNull(f("#fMin").value);
    c.max = numOrNull(f("#fMax").value);
    c.def = numOrNull(f("#fDef").value);
    c.formula = f("#fFormula").value.trim();
    c.decimals = +(c.kind === "formula" ? f("#fDecF") : f("#fDecR")).value;
    c.unit = f("#fUnit").value.trim();
    c.color = $('input[name="color"]:checked', dlg).value;
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
  /* 在一份临时副本上试算，避免对话框里的改动提前写入文档 */
  function trialDoc(c) {
    const d = cur();
    const capsules = { ...d.capsules, [c.id]: c };
    if (ctx.origName !== c.name) capsOf(d).forEach((o) => {
      if (o.id !== c.id && o.kind === "formula") capsules[o.id] = { ...o, formula: Expr.renameRef(o.formula, ctx.origName, c.name) };
    });
    return { ...d, capsules, values: { ...d.values, [c.id]: undefined } };
  }
  function syncForm() {
    const c = readForm();
    $("#grpRange", dlg).hidden = c.kind !== "range";
    $("#grpFormula", dlg).hidden = c.kind !== "formula";
    $("#grpDef", dlg).hidden = c.source !== "input";
    const badge = $("#dlgBadge", dlg);
    badge.dataset.color = c.color;
    badge.innerHTML = ICON[kindKey(c)];
    const prev = $("#preview", dlg), save = $("#dlgSave", dlg);
    let err = validate(c), value = null;
    if (!err) {
      const r = safeValue(trialDoc(c), c);
      if (r.err) err = r.err; else value = r.v;
    }
    save.disabled = !!err;
    if (err) { prev.innerHTML = `<span class="msg bad">${esc(err)}</span>`; return; }
    const k = kindKey(c);
    const text = { random: "浏览时点一下会在区间内重新随机", input: "浏览时读者可以点开填写", formula: `= ${Expr.pretty(c.formula)}` }[k];
    prev.innerHTML = `<span class="pill" data-color="${c.color}">${ICON[k]}<b>${esc(fmtNum(c, value))}</b></span><span class="msg">${esc(text)}</span>`;
  }
  function saveDialog() {
    const c = readForm();
    if (validate(c)) return;
    const d = cur(), old = ctx.orig;
    if (!ctx.isNew && old.name !== c.name) {
      capsOf(d).forEach((o) => { if (o.id !== c.id && o.kind === "formula") o.formula = Expr.renameRef(o.formula, old.name, c.name); });
    }
    if (c.kind === "formula") delete c.def;
    d.capsules[c.id] = c;
    if (c.kind === "formula") delete d.values[c.id];
    else {
      const v = d.values[c.id];
      const changed = ctx.isNew || old.kind !== c.kind || old.source !== c.source || old.min !== c.min || old.max !== c.max || old.decimals !== c.decimals || old.def !== c.def;
      if (changed || typeof v !== "number") d.values[c.id] = initialValue(c);
      else d.values[c.id] = clampToRange(c, v);
    }
    dlg.close();
    if (ctx.isNew) {
      const t = tok(c.id), a = Math.min(ctx.at, d.body.length), b = Math.min(ctx.end, d.body.length);
      d.body = d.body.slice(0, a) + t + d.body.slice(b);
      renderEditor();
      ed.focus();
      setSel(a + t.length);
    } else refreshEditorPills();
    touch();
    renderStatus();
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
    renderEditor();
    touch();
    renderStatus();
  }

  /* ================= 快捷键 & 启动 ================= */
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") { e.preventDefault(); if (!dlg.open) setMode(state.mode === "edit" ? "view" : "edit"); }
  });
  $("#showFx").checked = !!state.showFx;
  app.dataset.mode = state.mode;
  $$("[data-set-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setMode === state.mode)));
  renderAll();

  window.__capsuleNotes = { state, setMode, openDialog };
})();
