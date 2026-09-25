const test = require("node:test");
const assert = require("node:assert/strict");
const MD = require("../js/markdown.js");

test("标题与行内样式", () => {
  assert.equal(MD.render("# 你好"), "<h1>你好</h1>");
  assert.equal(MD.render("**粗** *斜* ~~删~~ `a<b`"), "<p><strong>粗</strong> <em>斜</em> <del>删</del> <code>a&lt;b</code></p>");
});

test("HTML 会被转义，危险链接被拦下", () => {
  assert.equal(MD.render("<script>x</script>"), "<p>&lt;script&gt;x&lt;/script&gt;</p>");
  assert.match(MD.render("[点我](javascript:alert(1))"), /href="#"/);
  assert.match(MD.render("[官网](https://example.com)"), /href="https:\/\/example.com"/);
});

test("列表、任务列表与引用", () => {
  assert.equal(MD.render("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(MD.render("3. a\n4. b"), '<ol start="3"><li>a</li><li>b</li></ol>');
  assert.match(MD.render("- [x] 完成"), /class="box done"/);
  assert.equal(MD.render("> 引用"), "<blockquote><p>引用</p></blockquote>");
});

test("表格与代码块", () => {
  const t = MD.render("| a | b |\n| --- | ---: |\n| 1 | 2 |");
  assert.match(t, /<th>a<\/th>/);
  assert.match(t, /<td style="text-align:right">2<\/td>/);
  assert.equal(MD.render("```\n<b>\n```"), "<pre><code>&lt;b&gt;</code></pre>");
});

test("胶囊占位符原样保留", () => {
  assert.equal(MD.render("共 {{c_ab12}} 元"), "<p>共 {{c_ab12}} 元</p>");
});
