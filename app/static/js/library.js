import { getJSON } from "./api.js";
import { esc, coverMarkup, stars, toast, initThemeToggle, formatBytes } from "./ui.js";

const PAGE_SIZE = 24;
const state = { q: "", sort: "recent", tag: "", author: "", series: "", language: "", page: 1 };
let view = localStorage.getItem("xh-view") || "grid";
let facets = null;
let config = null;
let lastTotal = 0;

const $ = (id) => document.getElementById(id);
const LANG = { eng: "英文", zho: "中文", chi: "中文", jpn: "日文", fra: "法文", deu: "德文", ger: "德文", rus: "俄文" };

history.scrollRestoration = "manual";
initThemeToggle();

/* ---------------------------------------------------------------- URL 状态 */

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = p.get("q") || "";
  state.sort = p.get("sort") || "recent";
  state.tag = p.get("tag") || "";
  state.author = p.get("author") || "";
  state.series = p.get("series") || "";
  state.language = p.get("language") || "";
  state.page = Math.max(1, parseInt(p.get("page") || "1", 10) || 1);
}

function writeUrl(push = true) {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.sort !== "recent") p.set("sort", state.sort);
  for (const key of ["tag", "author", "series", "language"]) {
    if (state[key]) p.set(key, state[key]);
  }
  if (state.page > 1) p.set("page", String(state.page));
  const qs = p.toString();
  const url = qs ? `/?${qs}` : "/";
  if (push) history.pushState({}, "", url);
  else history.replaceState({}, "", url);
}

function filterCount() {
  return ["tag", "author", "series", "language"].filter((k) => state[k]).length;
}

/* ---------------------------------------------------------------- 数据 */

async function loadConfig() {
  try {
    config = await getJSON("/api/config");
    if (config.site_name) {
      $("siteName").textContent = config.site_name;
      document.title = location.pathname.startsWith("/book/") ? document.title : config.site_name;
    }
    $("footMeta").textContent = `${config.library.books} 本藏书 · ${config.library.authors} 位作者`;
    if (config.error) toast(config.error);
  } catch (err) {
    toast(`无法连接后端：${err.message}`);
  }
}

async function loadContinue() {
  try {
    const data = await getJSON("/api/reading?limit=8");
    const strip = $("continueStrip");
    renderHeroStats(data.items.length);
    if (!data.items.length) { strip.hidden = true; return; }
    strip.hidden = false;
    $("continueCount").textContent = `${data.items.length} 本在读`;
    $("continueRail").innerHTML = data.items.map((b) => {
      const pct = Math.round((b.progress?.percent || 0) * 100);
      return `
        <a class="strip-card" href="/read/${b.id}">
          <span class="mini-cover">${coverMarkup(b)}</span>
          <span class="strip-info">
            <p class="strip-title">${esc(b.title)}</p>
            <span class="strip-meta">${esc(b.authors.join(" / ") || "佚名")} · ${pct}%</span>
            <span class="strip-bar"><i style="width:${pct}%"></i></span>
          </span>
        </a>`;
    }).join("");
  } catch { /* 非关键路径 */ }
}

function renderHeroStats(reading) {
  const stats = $("heroStats");
  if (!stats || !config) return;
  stats.innerHTML = `
    <div class="hero-stat"><b>${config.library.books}</b><span>藏书</span></div>
    <div class="hero-stat"><b>${config.library.authors}</b><span>作者</span></div>
    <div class="hero-stat"><b>${reading}</b><span>在读</span></div>`;
}

async function load({ keepScroll = false } = {}) {
  const grid = $("grid");
  grid.setAttribute("aria-busy", "true");

  const p = new URLSearchParams({
    q: state.q, sort: state.sort, tag: state.tag, author: state.author,
    series: state.series, language: state.language,
    page: String(state.page), page_size: String(PAGE_SIZE),
  });

  try {
    const data = await getJSON(`/api/library?${p}`);
    lastTotal = data.total;
    if (data.facets) facets = data.facets;
    render(data);
  } catch (err) {
    grid.innerHTML = "";
    $("empty").hidden = false;
    $("emptyTitle").textContent = "书架打不开";
    $("emptyText").textContent = err.message;
    $("emptyReset").hidden = true;
    $("pager").hidden = true;
  } finally {
    grid.removeAttribute("aria-busy");
    if (!keepScroll) window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
}

/* ---------------------------------------------------------------- 渲染 */

function cardHTML(b) {
  const pct = Math.round((b.progress?.percent || 0) * 100);
  const tags = view === "list"
    ? `<div class="list-tags">${b.tags.slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join("")}</div>`
    : "";
  return `
    <a class="card" href="/book/${b.id}">
      <div class="card-cover">
        ${coverMarkup(b, b.tags[0] || "藏书")}
        ${pct ? `<span class="card-progress"><i style="width:${pct}%"></i></span>` : ""}
      </div>
      <div class="card-body">
        <h3 class="card-title">${esc(b.title)}</h3>
        <p class="card-author">${esc(b.authors.join(" / ") || "佚名")}</p>
        <div class="card-foot">
          ${b.rating ? `<span class="card-stars">${stars(b.rating)}</span>` : ""}
          <span>${esc(b.formats.join(" ").toUpperCase())}</span>
        </div>
      </div>
      ${tags}
    </a>`;
}

function render(data) {
  const grid = $("grid");
  grid.className = `grid ${view}`;
  grid.innerHTML = data.items.map(cardHTML).join("");
  $("viewToggle").setAttribute("aria-pressed", view === "list");

  const hasResults = data.items.length > 0;
  $("empty").hidden = hasResults;
  if (!hasResults) {
    const filtered = state.q || filterCount();
    $("emptyTitle").textContent = filtered ? "没有找到书" : "书架是空的";
    $("emptyText").textContent = filtered
      ? "换个关键词，或清除筛选条件试试。"
      : "把书放进 Calibre 书库，刷新页面即可看到。";
    $("emptyReset").hidden = !filtered;
  }

  $("heroSub").textContent = state.q
    ? `“${state.q}” 的搜索结果 · ${data.total} 本`
    : filterCount() ? `筛选后 ${data.total} 本` : `${data.total} 本藏书`;

  renderTagChips();
  renderActiveFilters();
  renderPager(data);
  syncSheet();
}

function renderTagChips() {
  const box = $("tagChips");
  const tags = (facets?.tags || []).slice(0, 12);
  box.innerHTML = [
    `<button class="chip" data-tag="" aria-pressed="${!state.tag}">全部</button>`,
    ...tags.map((t) => `<button class="chip" data-tag="${esc(t.name)}"
        aria-pressed="${state.tag === t.name}">${esc(t.name)}<span class="count">${t.count}</span></button>`),
  ].join("");
}

function renderActiveFilters() {
  const box = $("activeFilters");
  const entries = [
    ["q", `搜索：${state.q}`],
    ["tag", `标签：${state.tag}`],
    ["author", `作者：${state.author}`],
    ["series", `系列：${state.series}`],
    ["language", `语言：${LANG[state.language] || state.language}`],
  ].filter(([key]) => state[key]);
  box.hidden = entries.length === 0;
  box.innerHTML = entries.map(([key, label]) => `
    <button class="chip" data-clear="${key}" title="移除">
      ${esc(label)}
      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"></path></svg>
    </button>`).join("");
  const count = filterCount();
  $("filterCount").hidden = count === 0;
  $("filterCount").textContent = String(count);
  $("filterBtn").setAttribute("aria-pressed", count > 0);
}

function renderPager(data) {
  const pager = $("pager");
  if (data.pages <= 1) { pager.hidden = true; return; }
  pager.hidden = false;
  const windowStart = Math.max(1, Math.min(data.page - 2, data.pages - 4));
  const nums = [];
  for (let i = windowStart; i <= Math.min(data.pages, windowStart + 4); i += 1) nums.push(i);
  pager.innerHTML = `
    <button data-page="${data.page - 1}" ${data.page === 1 ? "disabled" : ""}>上一页</button>
    ${nums.map((n) => `<button data-page="${n}" aria-current="${n === data.page}">${n}</button>`).join("")}
    <button data-page="${data.page + 1}" ${data.page === data.pages ? "disabled" : ""}>下一页</button>`;
}

/* ---------------------------------------------------------------- 筛选面板 */

function syncSheet() {
  const body = $("filterBody");
  if (!facets) { body.innerHTML = `<p style="color:var(--faint)">正在读取筛选项…</p>`; return; }
  const group = (title, key, items, labelFn) => `
    <div class="filter-group">
      <h3>${title}</h3>
      <div class="chips">
        ${items.slice(0, 60).map((item) => {
          const value = item.name;
          return `<button type="button" class="chip" data-facet="${key}" data-value="${esc(value)}"
            aria-pressed="${state[key] === value}">${esc(labelFn ? labelFn(value) : value)}
            <span class="count">${item.count}</span></button>`;
        }).join("") || `<span style="color:var(--faint);font-size:12px">暂无</span>`}
      </div>
    </div>`;

  body.innerHTML = [
    group("作者", "author", facets.authors),
    group("系列", "series", facets.series),
    group("标签", "tag", facets.tags),
    group("语言", "language", facets.languages, (v) => LANG[v] || v),
  ].join("");
}

/* ---------------------------------------------------------------- 详情 */

async function showBook(id) {
  $("libraryView").hidden = true;
  const box = $("bookView");
  box.hidden = false;
  box.innerHTML = `<div class="detail-inner"><div class="empty"><p>正在打开…</p></div></div>`;

  try {
    const { book, progress } = await getJSON(`/api/books/${id}`);
    document.title = `${book.title} · ${config?.site_name || "星皓书房"}`;
    const pct = Math.round((progress?.percent || 0) * 100);
    const epub = book.formats.includes("epub");
    const pdf = book.formats.includes("pdf");
    const toc = book.toc || [];
    const tocShown = toc.slice(0, 12);
    const files = book.files || [];
    const size = files.reduce((max, f) => Math.max(max, f.size || 0), 0);

    const readHref = epub ? `/read/${book.id}` : pdf
      ? `/api/books/${book.id}/file/pdf?inline=1` : "#";
    const readLabel = epub ? (pct ? `继续阅读 · ${pct}%` : "开始阅读") : pdf ? "打开 PDF" : "暂无可读格式";

    box.innerHTML = `
      <div class="detail-backdrop" style="background-image:url('/api/books/${book.id}/cover')"></div>
      <div class="detail-inner">
        <a class="detail-back" href="/" data-nav>
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg> 书架
        </a>
        <div class="detail-grid">
          <div class="detail-cover">${coverMarkup(book, book.tags[0] || "藏书")}</div>
          <div class="detail-info">
            ${book.series ? `<p class="detail-series">${esc(book.series)} · 第 ${book.series_index} 部</p>` : ""}
            <h1 class="detail-title">${esc(book.title)}</h1>
            <p class="detail-author">${esc(book.authors.join(" / ") || "佚名")}</p>
            ${book.rating ? `<div class="detail-rating"><span class="stars">${stars(book.rating)}</span>
              <span>${book.rating} / 5</span></div>` : ""}
            <div class="detail-tags">
              ${book.tags.map((t) => `<a href="/?tag=${encodeURIComponent(t)}" data-nav>${esc(t)}</a>`).join("")}
            </div>
            <p class="detail-desc">${esc(book.description || "暂无简介。可以在 Calibre 里补充简介后刷新。")}</p>
            ${pct ? `<div class="detail-progress"><span>上次读到 ${pct}%</span>
              <span class="bar"><i style="width:${pct}%"></i></span></div>` : ""}
            <div class="detail-actions">
              <a class="btn primary" href="${readHref}" ${pdf && !epub ? 'target="_blank" rel="noopener"' : ""}
                 ${!epub && !pdf ? 'aria-disabled="true" style="opacity:.5;pointer-events:none"' : ""}>${readLabel}</a>
              ${files.map((f) => `<a class="btn" href="/api/books/${book.id}/file/${f.format}"
                 download>下载 ${f.format.toUpperCase()}</a>`).join("")}
            </div>
            <div class="detail-facts">
              ${book.publisher ? `<span>出版 <b>${esc(book.publisher)}</b></span>` : ""}
              ${book.pubdate ? `<span>日期 <b>${esc(book.pubdate)}</b></span>` : ""}
              ${book.languages.length ? `<span>语言 <b>${book.languages.map((l) => LANG[l] || l).join(" / ")}</b></span>` : ""}
              <span>格式 <b>${esc(book.formats.join(" / ").toUpperCase())}</b></span>
              ${size ? `<span>大小 <b>${formatBytes(size)}</b></span>` : ""}
              ${book.isbn ? `<span>ISBN <b>${esc(book.isbn)}</b></span>` : ""}
            </div>
            ${toc.length ? `
            <div class="toc-block">
              <h2>目录 · ${toc.length} 节</h2>
              <ol class="toc-list" id="tocList">
                ${tocShown.map((t, i) => `<li class="lv${Math.min(t.level || 0, 2)}">
                  <span class="toc-num">${String(i + 1).padStart(2, "0")}</span>
                  <span>${esc(t.title)}</span></li>`).join("")}
              </ol>
              ${toc.length > tocShown.length ? `<button class="toc-more" id="tocMore">展开全部 ${toc.length} 节</button>` : ""}
            </div>` : ""}
          </div>
        </div>
      </div>`;

    window.scrollTo(0, 0);

    $("tocMore")?.addEventListener("click", (e) => {
      e.currentTarget.remove();
      $("tocList").innerHTML = toc.map((t, i) => `<li class="lv${Math.min(t.level || 0, 2)}">
        <span class="toc-num">${String(i + 1).padStart(2, "0")}</span>
        <span>${esc(t.title)}</span></li>`).join("");
    });
  } catch (err) {
    box.innerHTML = `<div class="detail-inner">
      <a class="detail-back" href="/" data-nav>← 书架</a>
      <div class="empty"><h2>打不开这本书</h2><p>${esc(err.message)}</p></div></div>`;
  }
}

function showLibrary() {
  $("bookView").hidden = true;
  $("bookView").innerHTML = "";
  $("libraryView").hidden = false;
  document.title = config?.site_name || "星皓书房";
}

/* ---------------------------------------------------------------- 交互 */

let searchTimer = null;
$("q").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const value = e.target.value;
  searchTimer = setTimeout(() => {
    state.q = value.trim();
    state.page = 1;
    writeUrl();
    load();
  }, 260);
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("q").focus();
    $("q").select();
  }
  if (e.key === "Escape" && document.activeElement === $("q")) {
    $("q").blur();
  }
});

$("sort").addEventListener("change", (e) => {
  state.sort = e.target.value;
  state.page = 1;
  writeUrl();
  load();
});

$("tagChips").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tag]");
  if (!btn) return;
  state.tag = btn.dataset.tag;
  state.page = 1;
  writeUrl();
  load();
});

$("activeFilters").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-clear]");
  if (!btn) return;
  const key = btn.dataset.clear;
  state[key] = "";
  state.page = 1;
  writeUrl();
  load();
});

$("viewToggle").addEventListener("click", () => {
  view = view === "grid" ? "list" : "grid";
  localStorage.setItem("xh-view", view);
  load({ keepScroll: true });
});

$("pager").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-page]");
  if (!btn || btn.disabled) return;
  state.page = parseInt(btn.dataset.page, 10);
  writeUrl();
  load();
});

$("emptyReset").addEventListener("click", () => {
  Object.assign(state, { q: "", tag: "", author: "", series: "", language: "", page: 1 });
  $("q").value = "";
  writeUrl();
  load();
});

$("filterBtn").addEventListener("click", () => {
  syncSheet();
  $("filterSheet").showModal();
});

$("filterSheet").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-facet]");
  if (!chip) return;
  const key = chip.dataset.facet;
  const value = chip.dataset.value;
  state[key] = state[key] === value ? "" : value;
  state.page = 1;
  writeUrl();
  load({ keepScroll: true });
});

$("filterSheet").addEventListener("close", () => {
  if ($("filterSheet").returnValue === "clear") {
    state.tag = state.author = state.series = state.language = "";
    state.page = 1;
    writeUrl();
    load({ keepScroll: true });
  }
});

/* ---------------------------------------------------------------- 路由 */

function route() {
  const match = location.pathname.match(/^\/book\/(\d+)/);
  if (match) {
    showBook(parseInt(match[1], 10));
    return;
  }
  showLibrary();
  readUrl();
  $("q").value = state.q;
  $("sort").value = state.sort;
  load();
  const scroll = history.state?.scroll;
  if (typeof scroll === "number") {
    requestAnimationFrame(() => window.scrollTo(0, scroll));
  }
}

document.addEventListener("click", (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const a = e.target.closest("a");
  if (!a) return;
  const href = a.getAttribute("href");
  if (!href || !href.startsWith("/") || href.startsWith("/api") || href.startsWith("/static")
      || href === "/favicon.svg" || a.target === "_blank") return;
  if (a.hasAttribute("download")) return;
  e.preventDefault();

  if (href.startsWith("/book/")) {
    history.replaceState({ ...history.state, scroll: window.scrollY }, "");
    history.pushState({}, "", href);
    showBook(parseInt(href.split("/").pop(), 10));
  } else if (href === "/" || href.startsWith("/?")) {
    history.pushState({}, "", href);
    showLibrary();
    readUrl();
    $("q").value = state.q;
    $("sort").value = state.sort;
    load();
  } else {
    location.href = href;
  }
});

window.addEventListener("popstate", route);

// 先建立骨架，再取数据
(async function boot() {
  $("q").value = "";
  await loadConfig();
  loadContinue();
  route();
})();
