/* 表达式引擎：把「人数 * 每人预算」这样的公式解析成语法树并求值。
 * 不使用 eval，只认识数字、名称、运算符和白名单里的函数。 */
(function (root) {
  "use strict";

  const FUNCS = {
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt, exp: Math.exp,
    ln: Math.log, sin: Math.sin, cos: Math.cos, tan: Math.tan, pow: Math.pow,
    log: (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b)),
    round: (x, n = 0) => { const k = Math.pow(10, n); return Math.round(Number((x * k).toPrecision(15))) / k; },
    min: (...a) => Math.min(...a),
    max: (...a) => Math.max(...a),
    sum: (...a) => a.reduce((s, v) => s + v, 0),
    avg: (...a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN),
    clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
    if: (c, a, b) => (c ? a : b),
  };
  const CONSTS = { pi: Math.PI, e: Math.E };
  const ID_START = /[\p{L}_]/u;
  const ID_PART = /[\p{L}\p{N}_]/u;

  class ExprError extends Error {
    constructor(message, pos) { super(message); this.pos = pos; }
  }

  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        if (/[eE]/.test(src[j] || "") && /[-+0-9]/.test(src[j + 1] || "")) {
          j++;
          if (/[-+]/.test(src[j])) j++;
          while (/[0-9]/.test(src[j] || "")) j++;
        }
        const text = src.slice(i, j), value = Number(text);
        if (!Number.isFinite(value)) throw new ExprError(`无法识别的数字「${text}」`, i);
        out.push({ type: "num", value, text, pos: i, end: j });
        i = j;
        continue;
      }
      if (ID_START.test(ch)) {
        let j = i + 1;
        while (j < src.length && ID_PART.test(src[j])) j++;
        out.push({ type: "id", value: src.slice(i, j), pos: i, end: j });
        i = j;
        continue;
      }
      const two = src.slice(i, i + 2);
      if ([">=", "<=", "==", "!="].includes(two)) {
        out.push({ type: "op", value: two, pos: i, end: i + 2 });
        i += 2;
        continue;
      }
      const map = { "×": "*", "÷": "/", "（": "(", "）": ")", "，": "," };
      const op = map[ch] || ch;
      if ("+-*/%^(),<>".includes(op)) {
        out.push({ type: "op", value: op, pos: i, end: i + 1 });
        i++;
        continue;
      }
      throw new ExprError(`无法识别的符号「${ch}」`, i);
    }
    return out;
  }

  function parse(src) {
    const toks = tokenize(src);
    let k = 0;
    const peek = () => toks[k];
    const isOp = (v) => peek() && peek().type === "op" && peek().value === v;
    const take = () => toks[k++];
    const expect = (v) => {
      if (!isOp(v)) {
        const t = peek();
        throw new ExprError(t ? `这里应该是「${v}」` : `公式不完整，缺少「${v}」`, t ? t.pos : src.length);
      }
      return take();
    };

    function comparison() {
      let a = additive();
      while (peek() && peek().type === "op" && [">", "<", ">=", "<=", "==", "!="].includes(peek().value)) {
        const op = take().value;
        a = { t: "bin", op, a, b: additive() };
      }
      return a;
    }
    function additive() {
      let a = multiplicative();
      while (isOp("+") || isOp("-")) {
        const op = take().value;
        a = { t: "bin", op, a, b: multiplicative() };
      }
      return a;
    }
    function multiplicative() {
      let a = unary();
      while (isOp("*") || isOp("/") || isOp("%")) {
        const op = take().value;
        a = { t: "bin", op, a, b: unary() };
      }
      return a;
    }
    function unary() {
      if (isOp("-")) { take(); return { t: "neg", a: unary() }; }
      if (isOp("+")) { take(); return unary(); }
      return power();
    }
    function power() {
      const base = primary();
      if (isOp("^")) { take(); return { t: "bin", op: "^", a: base, b: unary() }; }
      return base;
    }
    function primary() {
      const t = peek();
      if (!t) throw new ExprError("公式不完整", src.length);
      if (t.type === "num") { take(); return { t: "num", v: t.value }; }
      if (t.type === "id") {
        take();
        if (isOp("(")) {
          take();
          const fn = t.value.toLowerCase();
          if (!FUNCS[fn]) throw new ExprError(`没有叫「${t.value}」的函数`, t.pos);
          const args = [];
          if (!isOp(")")) {
            args.push(comparison());
            while (isOp(",")) { take(); args.push(comparison()); }
          }
          expect(")");
          return { t: "call", name: fn, args };
        }
        return { t: "var", name: t.value, pos: t.pos };
      }
      if (isOp("(")) {
        take();
        const e = comparison();
        expect(")");
        return e;
      }
      throw new ExprError(`这里不应该出现「${t.value}」`, t.pos);
    }

    if (!toks.length) throw new ExprError("请填写计算公式", 0);
    const ast = comparison();
    if (k < toks.length) throw new ExprError(`这里不应该出现「${toks[k].value}」`, toks[k].pos);
    return ast;
  }

  function collectRefs(ast, set = new Set()) {
    if (ast.t === "var" && !(ast.name in CONSTS)) set.add(ast.name);
    if (ast.a) collectRefs(ast.a, set);
    if (ast.b) collectRefs(ast.b, set);
    if (ast.args) ast.args.forEach((x) => collectRefs(x, set));
    return set;
  }

  function compile(src) {
    const ast = parse(String(src || ""));
    return { ast, refs: [...collectRefs(ast)] };
  }

  /* lookup(name) 返回数字；返回 undefined 表示没有这个名称 */
  function evaluate(ast, lookup) {
    switch (ast.t) {
      case "num": return ast.v;
      case "neg": return -evaluate(ast.a, lookup);
      case "var": {
        const v = lookup ? lookup(ast.name) : undefined;
        if (v !== undefined) return v;
        if (ast.name in CONSTS) return CONSTS[ast.name];
        throw new ExprError(`找不到名为「${ast.name}」的胶囊`, ast.pos);
      }
      case "call": return FUNCS[ast.name](...ast.args.map((x) => evaluate(x, lookup)));
      case "bin": {
        const a = evaluate(ast.a, lookup), b = evaluate(ast.b, lookup);
        switch (ast.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return a / b;
          case "%": return a % b;
          case "^": return Math.pow(a, b);
          case ">": return a > b ? 1 : 0;
          case "<": return a < b ? 1 : 0;
          case ">=": return a >= b ? 1 : 0;
          case "<=": return a <= b ? 1 : 0;
          case "==": return a === b ? 1 : 0;
          case "!=": return a !== b ? 1 : 0;
        }
      }
    }
    throw new ExprError("无法计算", 0);
  }

  /* 胶囊改名时，同步改写公式里对它的引用（函数名不受影响） */
  function renameRef(src, from, to) {
    let toks;
    try { toks = tokenize(src); } catch (e) { return src; }
    let out = src;
    for (let i = toks.length - 1; i >= 0; i--) {
      const t = toks[i], next = toks[i + 1];
      const isCall = next && next.type === "op" && next.value === "(";
      if (t.type === "id" && t.value === from && !isCall) out = out.slice(0, t.pos) + to + out.slice(t.end);
    }
    return out;
  }

  /* 把公式排版成易读的形式；format(name) 可把名称替换成数值 */
  function pretty(src, format) {
    let toks;
    try { toks = tokenize(src); } catch (e) { return src; }
    const shown = { "*": "×", "/": "÷", "-": "−", ">=": "≥", "<=": "≤", "!=": "≠" };
    let s = "";
    toks.forEach((t, i) => {
      const prev = toks[i - 1];
      if (t.type === "num") s += t.text;
      else if (t.type === "id") {
        const next = toks[i + 1];
        const isCall = next && next.type === "op" && next.value === "(";
        s += !isCall && format ? format(t.value) : t.value;
      } else if (t.value === "(" || t.value === ")") s += t.value;
      else if (t.value === ",") s += ", ";
      else {
        const unary = (t.value === "-" || t.value === "+") && (!prev || (prev.type === "op" && prev.value !== ")"));
        s += unary ? shown[t.value] || t.value : ` ${shown[t.value] || t.value} `;
      }
    });
    return s.trim();
  }

  const isReserved = (name) => Object.prototype.hasOwnProperty.call(FUNCS, name.toLowerCase()) || name in CONSTS;

  const api = { tokenize, parse, compile, evaluate, renameRef, pretty, isReserved, FUNCS: Object.keys(FUNCS), ExprError };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Expr = api;
})(typeof window !== "undefined" ? window : globalThis);
