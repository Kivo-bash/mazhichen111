const test = require("node:test");
const assert = require("node:assert/strict");
const Expr = require("../js/expr.js");

const run = (src, vars = {}) => Expr.evaluate(Expr.compile(src).ast, (n) => vars[n]);

test("四则运算与优先级", () => {
  assert.equal(run("1 + 2 * 3"), 7);
  assert.equal(run("(1 + 2) * 3"), 9);
  assert.equal(run("2 ^ 3 ^ 2"), 512);
  assert.equal(run("-2 ^ 2"), -4);
  assert.equal(run("10 % 4"), 2);
  assert.equal(run("6 ÷ 3 × 2"), 4);
});

test("中文变量名与函数", () => {
  assert.equal(run("人数 * 每人预算", { 人数: 4, 每人预算: 120 }), 480);
  assert.equal(run("round(总价 * 折扣, 1)", { 总价: 99, 折扣: 0.85 }), 84.2);
  assert.equal(run("max(a, b, 3)", { a: 1, b: 7 }), 7);
  assert.equal(run("avg(2, 4, 6)"), 4);
  assert.equal(run("if(a > 3, 10, 20)", { a: 5 }), 10);
  assert.equal(run("pi * 2"), Math.PI * 2);
});

test("引用收集", () => {
  assert.deepEqual(Expr.compile("round(a * b + pi, 2) - a").refs, ["a", "b"]);
});

test("错误信息", () => {
  assert.throws(() => Expr.compile("1 +"), /不完整/);
  assert.throws(() => Expr.compile("(1 + 2"), /缺少「\)」/);
  assert.throws(() => Expr.compile("foo(1)"), /没有叫「foo」的函数/);
  assert.throws(() => Expr.compile("1 $ 2"), /无法识别的符号/);
  assert.throws(() => run("x + 1"), /找不到名为「x」/);
});

test("改名只影响变量，不影响函数", () => {
  assert.equal(Expr.renameRef("round(round * 2) + round2", "round", "取整"), "round(取整 * 2) + round2");
});

test("公式排版", () => {
  assert.equal(Expr.pretty("a*b/-c"), "a × b ÷ −c");
  assert.equal(Expr.pretty("round(a*2,1)", (n) => `[${n}]`), "round([a] × 2, 1)");
});
