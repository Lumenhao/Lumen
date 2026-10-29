import { getJSON } from "./api.js";
import { esc, coverMarkup, stars, toast, initThemeToggle, formatBytes } from "./ui.js";
import { t, has, errText, applyStatic, brand } from "./i18n.js";

const PAGE_SIZE = 24;
const state = { q: "", sort: "recent", tag: "", author: "", series: "", language: "", page: 1 };
let view = localStorage.getItem("xh-view") || "grid";
let facets = null;
let config = null;
let lastTotal = 0;

const $ = (id) => document.getElementById(id);
const langName = (code) => (code && has(`lang.${code}`) ? t(`lang.${code}`) : code);

const brandName = () => brand(config?.site_name);

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
      document.title = location.pathname.startsWith("/book/") ? document.title : brandName();
    }
    $("footMeta").textContent = t("lib.meta", { books: config.library.books, authors: config.library.authors, n: config.library.books });
    if (config.error) toast(errText(config.error, { path: config.error_path || "" }));
  } catch (err) {
    toast(t("lib.offline", { msg: err.message }));
  }
}

async function loadContinue() {
  try {
    const data = await getJSON("/api/reading?limit=8");
    const strip = $("continueStrip");
    renderHeroStats(data.items.length);
    if (!data.items.length) { strip.hidden = true; return; }
    strip.hidden = false;
    $("continueCount").textContent = t("lib.continue_count", { n: data.items.length });
    $("continueRail").innerHTML = data.items.map((b) => {
      const pct = Math.round((b.progress?.percent || 0) * 100);
      return `
        <a class="strip-card" href="/read/${b.id}">
          <span class="mini-cover">${coverMarkup(b)}</span>
          <span class="strip-info">
            <p class="strip-title">${esc(b.title)}</p>
            <span class="strip-meta">${esc(b.authors.join(" / ") || t("common.anonymous"))} · ${pct}%</span>
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
    <div class="hero-stat"><b>${config.library.books}</b><span>${t("lib.stat_books")}</span></div>
    <div class="hero-stat"><b>${config.library.authors}</b><span>${t("lib.stat_authors")}</span></div>
    <div class="hero-stat"><b>${reading}</b><span>${t("lib.stat_reading")}</span></div>`;
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
    $("emptyTitle").textContent = t("lib.load_failed");
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
        ${coverMarkup(b, b.tags[0] || t("common.book"))}
        ${pct ? `<span class="card-progress"><i style="width:${pct}%"></i></span>` : ""}
      </div>
      <div class="card-body">
        <h3 class="card-title">${esc(b.title)}</h3>
        <p class="card-author">${esc(b.authors.join(" / ") || t("common.anonymous"))}</p>
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
    $("emptyTitle").textContent = filtered ? t("lib.empty_title") : t("lib.empty_library_title");
    $("emptyText").textContent = filtered ? t("lib.empty_text") : t("lib.empty_library_text");
    $("emptyReset").hidden = !filtered;
  }

  $("heroSub").textContent = state.q
    ? t("lib.hero_search", { q: state.q, n: data.total })
    : filterCount() ? t("lib.hero_filtered", { n: data.total }) : t("lib.hero_total", { n: data.total });

  renderTagChips();
  renderActiveFilters();
  renderPager(data);
  syncSheet();
}

function renderTagChips() {
  const box = $("tagChips");
  const tags = (facets?.tags || []).slice(0, 12);
  box.innerHTML = [
    `<button class="chip" data-tag="" aria-pressed="${!state.tag}">${t("lib.chip_all")}</button>`,
    ...tags.map((t) => `<button class="chip" data-tag="${esc(t.name)}"
        aria-pressed="${state.tag === t.name}">${esc(t.name)}<span class="count">${t.count}</span></button>`),
  ].join("");
}

function renderActiveFilters() {
  const box = $("activeFilters");
  const entries = [
    ["q", t("lib.active_search", { v: state.q })],
    ["tag", t("lib.active_tag", { v: state.tag })],
    ["author", t("lib.active_author", { v: state.author })],
    ["series", t("lib.active_series", { v: state.series })],
    ["language", t("lib.active_language", { v: langName(state.language) })],
  ].filter(([key]) => state[key]);
  box.hidden = entries.length === 0;
  box.innerHTML = entries.map(([key, label]) => `
    <button class="chip" data-clear="${key}" title="${t("lib.remove")}">
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
    <button data-page="${data.page - 1}" ${data.page === 1 ? "disabled" : ""}>${t("lib.prev_page")}</button>
    ${nums.map((n) => `<button data-page="${n}" aria-current="${n === data.page}">${n}</button>`).join("")}
    <button data-page="${data.page + 1}" ${data.page === data.pages ? "disabled" : ""}>${t("lib.next_page")}</button>`;
}

/* ---------------------------------------------------------------- 筛选面板 */

function syncSheet() {
  const body = $("filterBody");
  if (!facets) { body.innerHTML = `<p style="color:var(--faint)">${t("lib.filter_loading")}</p>`; return; }
  const group = (title, key, items, labelFn) => `
    <div class="filter-group">
      <h3>${title}</h3>
      <div class="chips">
        ${items.slice(0, 60).map((item) => {
          const value = item.name;
          return `<button type="button" class="chip" data-facet="${key}" data-value="${esc(value)}"
            aria-pressed="${state[key] === value}">${esc(labelFn ? labelFn(value) : value)}
            <span class="count">${item.count}</span></button>`;
        }).join("") || `<span style="color:var(--faint);font-size:12px">${t("lib.filter_empty")}</span>`}
      </div>
    </div>`;

  body.innerHTML = [
    group(t("lib.facet_author"), "author", facets.authors),
    group(t("lib.facet_series"), "series", facets.series),
    group(t("lib.facet_tag"), "tag", facets.tags),
    group(t("lib.facet_language"), "language", facets.languages, langName),
  ].join("");
}

/* ---------------------------------------------------------------- 详情 */

async function showBook(id) {
  $("libraryView").hidden = true;
  const box = $("bookView");
  box.hidden = false;
  box.innerHTML = `<div class="detail-inner"><div class="empty"><p>${t("common.opening")}</p></div></div>`;

  try {
    const { book, progress } = await getJSON(`/api/books/${id}`);
    document.title = `${book.title} · ${brandName()}`;
    const pct = Math.round((progress?.percent || 0) * 100);
    const epub = book.formats.includes("epub");
    const pdf = book.formats.includes("pdf");
    const toc = book.toc || [];
    const tocShown = toc.slice(0, 12);
    const files = book.files || [];
    const size = files.reduce((max, f) => Math.max(max, f.size || 0), 0);

    const readHref = epub ? `/read/${book.id}` : pdf
      ? `/api/books/${book.id}/file/pdf?inline=1` : "#";
    const readLabel = epub
      ? (pct ? t("book.continue", { n: pct }) : t("book.start"))
      : pdf ? t("book.open_pdf") : t("book.no_format");

    box.innerHTML = `
      <div class="detail-backdrop" style="background-image:url('/api/books/${book.id}/cover')"></div>
      <div class="detail-inner">
        <a class="detail-back" href="/" data-nav>
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg> ${t("book.back")}
        </a>
        <div class="detail-grid">
          <div class="detail-cover">${coverMarkup(book, book.tags[0] || t("common.book"))}</div>
          <div class="detail-info">
            ${book.series ? `<p class="detail-series">${esc(t("book.series_index", { name: book.series, n: book.series_index }))}</p>` : ""}
            <h1 class="detail-title">${esc(book.title)}</h1>
            <p class="detail-author">${esc(book.authors.join(" / ") || t("common.anonymous"))}</p>
            ${book.rating ? `<div class="detail-rating"><span class="stars">${stars(book.rating)}</span>
              <span>${book.rating} / 5</span></div>` : ""}
            <div class="detail-tags">
              ${book.tags.map((t) => `<a href="/?tag=${encodeURIComponent(t)}" data-nav>${esc(t)}</a>`).join("")}
            </div>
            <p class="detail-desc">${esc(book.description || t("book.no_desc"))}</p>
            ${pct ? `<div class="detail-progress"><span>${esc(t("book.last_read", { n: pct }))}</span>
              <span class="bar"><i style="width:${pct}%"></i></span></div>` : ""}
            <div class="detail-actions">
              <a class="btn primary" href="${readHref}" ${pdf && !epub ? 'target="_blank" rel="noopener"' : ""}
                 ${!epub && !pdf ? 'aria-disabled="true" style="opacity:.5;pointer-events:none"' : ""}>${readLabel}</a>
              ${files.map((f) => `<a class="btn" href="/api/books/${book.id}/file/${f.format}"
                 download>${esc(t("book.download", { fmt: f.format.toUpperCase() }))}</a>`).join("")}
            </div>
            <div class="detail-facts">
              ${book.publisher ? `<span>${t("book.publisher")} <b>${esc(book.publisher)}</b></span>` : ""}
              ${book.pubdate ? `<span>${t("book.pubdate")} <b>${esc(book.pubdate)}</b></span>` : ""}
              ${book.languages.length ? `<span>${t("book.language")} <b>${book.languages.map(langName).join(" / ")}</b></span>` : ""}
              <span>${t("book.formats")} <b>${esc(book.formats.join(" / ").toUpperCase())}</b></span>
              ${size ? `<span>${t("book.size")} <b>${formatBytes(size)}</b></span>` : ""}
              ${book.isbn ? `<span>ISBN <b>${esc(book.isbn)}</b></span>` : ""}
            </div>
            ${toc.length ? `
            <div class="toc-block">
              <h2>${esc(t("book.toc", { n: toc.length }))}</h2>
              <ol class="toc-list" id="tocList">
                ${tocShown.map((t, i) => `<li class="lv${Math.min(t.level || 0, 2)}">
                  <span class="toc-num">${String(i + 1).padStart(2, "0")}</span>
                  <span>${esc(t.title)}</span></li>`).join("")}
              </ol>
              ${toc.length > tocShown.length ? `<button class="toc-more" id="tocMore">${esc(t("book.toc_more", { n: toc.length }))}</button>` : ""}
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
      <a class="detail-back" href="/" data-nav>← ${esc(t("book.back"))}</a>
      <div class="empty"><h2>${esc(t("book.failed"))}</h2><p>${esc(err.message)}</p></div></div>`;
  }
}

function showLibrary() {
  $("bookView").hidden = true;
  $("bookView").innerHTML = "";
  $("libraryView").hidden = false;
  document.title = brandName();
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
  applyStatic(document);
  $("q").value = "";
  await loadConfig();
  loadContinue();
  route();
})();
