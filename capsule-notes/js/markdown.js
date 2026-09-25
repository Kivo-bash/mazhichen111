/* 轻量 Markdown 渲染器：标题、段落、粗体/斜体/删除线、行内代码、代码块、
 * 引用、有序/无序/任务列表、表格、分割线、链接与图片。所有文本先转义再渲染。 */
(function (root) {
  "use strict";

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function safeUrl(u) {
    u = u.trim();
    return /^(https?:|mailto:|#|\/|\.\/)/i.test(u) ? u.replace(/"/g, "%22") : "#";
  }

  function inline(src) {
    const codes = [];
    let s = src.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0010${codes.length - 1}\u0011`; });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img alt="${a}" src="${safeUrl(u)}">`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener">${t}</a>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\s][^*]*)\*/g, "<em>$1</em>").replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    s = s.replace(/\u0010(\d+)\u0011/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
    return s;
  }

  const RE = {
    fence: /^```/,
    heading: /^(#{1,6})\s+(.*)$/,
    hr: /^\s*([-*_])(\s*\1){2,}\s*$/,
    quote: /^>\s?/,
    list: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
    tableRow: /^\s*\|.*\|\s*$/,
    tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
  };
  const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const startsBlock = (line, next) =>
    RE.fence.test(line) || RE.heading.test(line) || RE.hr.test(line) || RE.quote.test(line) ||
    RE.list.test(line) || (RE.tableRow.test(line) && next !== undefined && RE.tableSep.test(next));

  function render(md) {
    const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      let m;
      if (RE.fence.test(line)) {
        const lang = line.slice(3).trim(), buf = [];
        i++;
        while (i < lines.length && !RE.fence.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${esc(buf.join("\n"))}</code></pre>`);
        continue;
      }
      if ((m = line.match(RE.heading))) {
        const n = m[1].length;
        out.push(`<h${n}>${inline(m[2])}</h${n}>`);
        i++;
        continue;
      }
      if (RE.hr.test(line)) { out.push("<hr>"); i++; continue; }
      if (RE.quote.test(line)) {
        const buf = [];
        while (i < lines.length && RE.quote.test(lines[i])) buf.push(lines[i++].replace(RE.quote, ""));
        out.push(`<blockquote>${render(buf.join("\n"))}</blockquote>`);
        continue;
      }
      if (RE.tableRow.test(line) && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
        const head = splitRow(line);
        const align = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : ""));
        i += 2;
        const rows = [];
        while (i < lines.length && RE.tableRow.test(lines[i])) rows.push(splitRow(lines[i++]));
        const cell = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c)}</${tag}>`;
        out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c, k) => cell("th", c, k)).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${head.map((_, k) => cell("td", r[k] || "", k)).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      if ((m = line.match(RE.list))) {
        const ordered = /\d/.test(m[2]);
        const start = ordered ? parseInt(m[2], 10) : 1;
        const items = [];
        while (i < lines.length) {
          const lm = lines[i].match(RE.list);
          if (lm && /\d/.test(lm[2]) === ordered) { items.push(lm[3]); i++; continue; }
          if (!lm && items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += "\n" + lines[i].trim(); i++; continue; }
          break;
        }
        const lis = items.map((t) => {
          const task = t.match(/^\[([ xX])\]\s+(.*)$/s);
          const body = (task ? task[2] : t).split("\n").map(inline).join("<br>");
          return task
            ? `<li class="task"><span class="box${task[1] === " " ? "" : " done"}" aria-hidden="true"></span>${body}</li>`
            : `<li>${body}</li>`;
        }).join("");
        out.push(ordered ? `<ol${start !== 1 ? ` start="${start}"` : ""}>${lis}</ol>` : `<ul>${lis}</ul>`);
        continue;
      }
      const buf = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !(buf.length && startsBlock(lines[i], lines[i + 1]))) buf.push(lines[i++]);
      out.push(`<p>${buf.map(inline).join("<br>")}</p>`);
    }
    return out.join("\n");
  }

  const api = { render, inline, escape: esc };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MD = api;
})(typeof window !== "undefined" ? window : globalThis);
