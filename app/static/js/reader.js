import { getJSON, postJSON, patchJSON, del } from "./api.js";
import { esc, toast } from "./ui.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const BOOK_ID = Number(location.pathname.split("/").filter(Boolean).pop());
const PREFS_KEY = "xh-reader";

const COLORS = {
  yellow: "#f0d274",
  green: "#a9d8a0",
  blue: "#9ec7f2",
  pink: "#f0a8c0",
};

const THEMES = {
  paper: { bg: "#f5efe4", fg: "#2b2721", accent: "#9a7b3f", scheme: "light" },
  white: { bg: "#fdfdfb", fg: "#1f2023", accent: "#8a6d34", scheme: "light" },
  green: { bg: "#eaf1e4", fg: "#26301f", accent: "#6f6a35", scheme: "light" },
  night: { bg: "#15171b", fg: "#d8d5cd", accent: "#c9a96e", scheme: "dark" },
};

const FONTS = {
  serif: `"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", STSong, SimSun, serif`,
  sans: `"Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif`,
};

const DEFAULTS = {
  theme: "paper",
  font: "serif",
  size: 18,
  line: 180,
  pad: 48,
  align: "justify",
  flow: "paginated",
  spread: "none",
};

const ICON = {
  jump: `<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"></path></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"></path></svg>`,
};

const els = {
  reader: $("#reader"),
  backBtn: $("#backBtn"),
  bookTitle: $("#bookTitle"),
  chapterTitle: $("#chapterTitle"),
  bookmarkBtn: $("#bookmarkBtn"),
  settingsBtn: $("#settingsBtn"),
  stage: $("#stage"),
  viewer: $("#viewer"),
  loading: $("#loading"),
  loadingText: $("#loadingText"),
  hint: $("#hint"),
  prevBtn: $("#prevBtn"),
  nextBtn: $("#nextBtn"),
  slider: $("#slider"),
  percent: $("#percent"),
  side: $("#side"),
  sideClose: $("#sideClose"),
  tocList: $("#tocList"),
  noteList: $("#noteList"),
  markList: $("#markList"),
  noteCount: $("#noteCount"),
  searchForm: $("#searchForm"),
  searchInput: $("#searchInput"),
  searchMeta: $("#searchMeta"),
  searchResults: $("#searchResults"),
  settings: $("#settings"),
  settingsClose: $("#settingsClose"),
  flowSeg: $("#flowSeg"),
  themeSwatches: $("#themeSwatches"),
  fontSeg: $("#fontSeg"),
  sizeRange: $("#sizeRange"),
  sizeLabel: $("#sizeLabel"),
  lineRange: $("#lineRange"),
  lineLabel: $("#lineLabel"),
  padRange: $("#padRange"),
  padLabel: $("#padLabel"),
  alignSeg: $("#alignSeg"),
  scrim: $("#scrim"),
  selBar: $("#selBar"),
  noteDialog: $("#noteDialog"),
  ndTitle: $("#ndTitle"),
  ndQuote: $("#ndQuote"),
  ndText: $("#ndText"),
  ndCancel: $("#ndCancel"),
  ndSave: $("#ndSave"),
  ndDelete: $("#ndDelete"),
};

const state = {
  meta: null,
  sessionProgress: null,
  epub: null,
  rendition: null,
  current: null,
  toc: [],
  annotations: [],
  bookmarks: [],
  searchIndex: null,
  searchHits: [],
  searching: false,
  locationsReady: false,
  locationsFailed: false,
  ready: false,
  dragging: false,
  saveTimer: null,
  repagTimer: null,
  selTimer: null,
  chapterTitle: "",
  pendingSelection: null,
  editing: null,
  dialogColor: null,
  lastColor: "yellow",
  prefs: loadPrefs(),
};

// ---------------------------------------------------------------- 偏好

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    const prefs = { ...DEFAULTS, ...raw };
    if (!THEMES[prefs.theme]) prefs.theme = DEFAULTS.theme;
    if (!FONTS[prefs.font]) prefs.font = DEFAULTS.font;
    return prefs;
  } catch {
    return { ...DEFAULTS };
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
  } catch { /* 隐私模式 */ }
}

function buildCss() {
  const p = state.prefs;
  const t = THEMES[p.theme] || THEMES.paper;
  const family = FONTS[p.font] || FONTS.serif;
  const lh = (p.line / 100).toFixed(2);
  return `
html { background: ${t.bg} !important; color-scheme: ${t.scheme}; }
body { background: ${t.bg} !important; color: ${t.fg} !important; margin: 0 !important; padding: 0 !important;
  font-family: ${family} !important; font-size: ${p.size}px !important; line-height: ${lh} !important;
  text-align: ${p.align} !important; -webkit-font-smoothing: antialiased; }
p, div, li, dd, dt, td, th, blockquote, span, em, strong, b, i, u, small { color: inherit !important; }
p, li, blockquote, dd { line-height: ${lh} !important; }
p { margin: .2em 0 .9em !important; text-align: ${p.align} !important; }
h1, h2, h3, h4, h5, h6 { font-family: ${family} !important; line-height: 1.35 !important; text-align: left !important;
  color: ${t.fg} !important; margin: 1.15em 0 .55em !important; }
h1 { font-size: 1.55em !important; }
h2 { font-size: 1.32em !important; }
h3 { font-size: 1.16em !important; }
a { color: ${t.accent} !important; }
blockquote { border-left: 3px solid ${t.accent}66 !important; padding-left: 1em !important; }
code, pre, kbd, samp { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  font-size: .9em !important; line-height: 1.6 !important; }
pre { white-space: pre-wrap !important; }
hr { border: 0 !important; border-top: 1px solid ${t.fg}33 !important; margin: 1.6em 0 !important; }
img, svg, video { max-width: 100%; }
sup, sub { line-height: 0 !important; font-size: .72em !important; }
::selection { background: ${t.accent}55; }
`;
}

function refreshReaderCss() {
  if (!state.rendition) return;
  const css = buildCss();
  state.rendition.getContents().forEach((contents) => {
    try { contents.addStylesheetCss(css, "xh-type"); } catch { /* view 已卸载 */ }
  });
}

function applyPad() {
  const pad = state.prefs.pad;
  els.reader.style.setProperty("--pad-x", `min(${pad}px, 6vw)`);
  els.reader.style.setProperty("--pad-y", `min(${Math.round(pad * 0.72)}px, 7vh)`);
}

function highlightStyles(color) {
  const night = state.prefs.theme === "night";
  return {
    fill: COLORS[color] || COLORS.yellow,
    "fill-opacity": night ? "0.24" : "0.4",
    "mix-blend-mode": night ? "normal" : "multiply",
  };
}

// ---------------------------------------------------------------- 启动

async function boot() {
  bindUI();
  syncPrefsUI();
  els.slider.disabled = true;

  if (!Number.isFinite(BOOK_ID) || BOOK_ID <= 0) {
    location.replace("/");
    return;
  }
  els.backBtn.href = `/book/${BOOK_ID}`;

  try {
    const session = await getJSON(`/api/books/${BOOK_ID}/session`);
    state.meta = session.book;
    state.annotations = session.annotations || [];
    state.bookmarks = session.bookmarks || [];
    state.sessionProgress = session.progress;
  } catch (err) {
    fail(`打不开这本书：${err.message}`);
    return;
  }

  els.bookTitle.textContent = state.meta.title;
  document.title = `${state.meta.title} · 星皓书房`;
  updateNoteCount();
  renderNotes();
  renderMarks();

  const epubFile = (state.meta.files || []).find((f) => f.format === "epub");
  if (!epubFile) {
    fail("这本书没有 EPUB 格式，无法在线阅读。回到书籍页可以下载其他格式。");
    return;
  }
  await openBook();
}

async function openBook() {
  els.loadingText.textContent = "正在解析书页…";
  const Epub = window.ePub;
  if (!Epub) {
    fail("阅读器脚本未能加载，请刷新页面重试。");
    return;
  }

  let buffer = null;
  try {
    const res = await fetch(`/api/books/${BOOK_ID}/file/epub`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    buffer = await res.arrayBuffer();
  } catch (err) {
    fail(`下载 EPUB 失败：${err.message}`);
    return;
  }

  const epub = Epub(buffer);
  state.epub = epub;
  try {
    await epub.ready;
  } catch (err) {
    fail(`EPUB 解析失败：${err?.message || "文件可能已损坏"}`);
    return;
  }

  const rendition = epub.renderTo(els.viewer, {
    width: "100%",
    height: "100%",
    flow: state.prefs.flow,
    spread: state.prefs.spread,
    allowScriptedContent: false,
  });
  state.rendition = rendition;

  rendition.hooks.content.register((contents) => {
    if (contents && typeof contents.addStylesheetCss === "function") {
      contents.addStylesheetCss(buildCss(), "xh-type");
    }
  });
  rendition.on("rendered", (section, view) => {
    if (!view || !view.contents) return;
    bindContents(view.contents);
    hideLoading();
  });
  rendition.on("relocated", onRelocated);
  rendition.on("selected", onSelected);

  buildToc();

  const startCfi = state.sessionProgress?.cfi;
  try {
    await rendition.display(startCfi || undefined);
    alignAfterRender(startCfi);
  } catch {
    toast("上次的阅读位置已失效，从头开始");
    try {
      await rendition.display();
    } catch (err) {
      fail(`这本书无法显示：${err.message}`);
      return;
    }
  }

  hideLoading();
  state.annotations.forEach(addHighlight);
  state.ready = true;
  showHintOnce();
  initLocations();
}

function fail(message) {
  els.loading.hidden = false;
  els.loading.querySelector(".spinner")?.remove();
  const line = els.loading.querySelector("p");
  if (line) {
    line.innerHTML = `${esc(message)}<br><a class="ghost-btn" href="/book/${BOOK_ID}" style="margin-top:10px">返回书籍页</a>`;
  }
}

let loadingHidden = false;
function hideLoading() {
  if (loadingHidden) return;
  loadingHidden = true;
  els.loading.hidden = true;
}

function showHintOnce() {
  if (localStorage.getItem("xh-hint")) return;
  localStorage.setItem("xh-hint", "1");
  els.hint.hidden = false;
  setTimeout(() => { els.hint.hidden = true; }, 6000);
}

// ---------------------------------------------------------------- 进度

function currentPercent() {
  const loc = state.current;
  const epub = state.epub;
  if (!loc || !epub) return 0;
  if (state.locationsReady) {
    const pct = epub.locations.percentageFromCfi(loc.start.cfi);
    if (typeof pct === "number" && !Number.isNaN(pct)) return Math.min(1, Math.max(0, pct));
  }
  const total = epub.spine.spineItems.length || 1;
  return Math.min(1, Math.max(0, ((loc.start.index || 0) + 0.5) / total));
}

function onRelocated(loc) {
  state.current = loc;
  const contents = currentContents(loc.start.cfi);
  const chapter = chapterAtLocation(loc, contents);
  state.chapterTitle = chapter.title;
  els.chapterTitle.textContent = chapter.title;
  updateProgressUI();
  syncBookmarkBtn();
  markTocActive(loc.start.index, chapter.href);
  queueSave();
}

function currentContents(cfi) {
  const list = state.rendition ? state.rendition.getContents() : [];
  for (const contents of list) {
    try {
      if (contents.range(cfi)) return contents;
    } catch { /* 不在这个视图 */ }
  }
  return list[0] || null;
}

function updateProgressUI() {
  const pct = currentPercent();
  if (!state.dragging) els.slider.value = String(Math.round(pct * 1000));
  els.percent.textContent = state.locationsReady || state.locationsFailed
    ? `${(pct * 100).toFixed(1)}%`
    : "…";
}

function queueSave(delay = 1000) {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => flushProgress(), delay);
}

async function flushProgress() {
  clearTimeout(state.saveTimer);
  const loc = state.current;
  if (!loc || !state.ready) return;
  const body = {
    cfi: loc.start.cfi,
    percent: currentPercent(),
    page: loc.start.displayed?.page ?? null,
  };
  try {
    await postJSON(`/api/books/${BOOK_ID}/progress`, body);
  } catch { /* 离线时静默失败 */ }
}

function beaconProgress() {
  const loc = state.current;
  if (!loc || !state.ready) return;
  const body = JSON.stringify({ cfi: loc.start.cfi, percent: currentPercent() });
  try {
    navigator.sendBeacon(`/api/books/${BOOK_ID}/progress`,
      new Blob([body], { type: "application/json" }));
  } catch { /* ignore */ }
}

async function initLocations() {
  try {
    if (!state.epub.locations.length()) await state.epub.locations.generate(1800);
    state.locationsReady = true;
    els.slider.disabled = false;
  } catch {
    // 超大书生成失败时退回章节比例，阅读本身不受影响
    state.locationsFailed = true;
  }
  updateProgressUI();
  if (state.locationsReady) queueSave(0);
}

// ---------------------------------------------------------------- 目录与章节

function indexOfHref(href) {
  if (!href) return 0;
  const clean = String(href).split("#")[0];
  const item = state.epub.spine.get(clean) || state.epub.spine.get(href);
  return item ? item.index : 0;
}

function buildToc() {
  const raw = (state.epub.navigation && state.epub.navigation.toc) || [];
  const flat = [];
  const walk = (items, level) => {
    items.forEach((item) => {
      const title = (item.label || "").trim() || "未命名章节";
      flat.push({ title, href: item.href, level, index: indexOfHref(item.href) });
      if (item.subitems && item.subitems.length) walk(item.subitems, Math.min(level + 1, 3));
    });
  };
  walk(raw, 0);
  if (!flat.length) {
    state.epub.spine.spineItems.forEach((item, i) => {
      flat.push({ title: `第 ${i + 1} 节`, href: item.href, level: 0, index: i });
    });
  }
  state.toc = flat;
  renderToc();
}

function renderToc() {
  if (!state.toc.length) {
    els.tocList.innerHTML = `<li class="pane-empty">这本书没有目录</li>`;
    return;
  }
  els.tocList.innerHTML = state.toc.map((item) => `
    <li class="lv${item.level}">
      <button type="button" data-href="${esc(item.href || "")}" data-index="${item.index}">${esc(item.title)}</button>
    </li>`).join("");
}

function sectionTitle(index) {
  let previous = "";
  for (const item of state.toc) {
    if (item.index < index) previous = item.title;
    else if (item.index === index) return item.title;
    else break;
  }
  return previous || state.meta?.title || "";
}

// 同一节里常有多个目录项（用 #锚点 区分），按锚点位置判断当前属于哪一项
function chapterAtLocation(loc, contents) {
  const index = loc.start.index;
  let previous = "";
  const candidates = [];
  for (const item of state.toc) {
    if (item.index < index) previous = item.title;
    else if (item.index === index) candidates.push(item);
    else break;
  }
  if (!candidates.length) {
    const title = previous || state.meta?.title || "";
    return { title, href: "" };
  }
  if (candidates.length === 1 || !contents) return candidates[0];

  // 以“本页末尾”为界：当页开头章节的标题常落在页首之上，用页尾判断更符合用户感知
  let range = null;
  try { range = contents.range(loc.end?.cfi || loc.start.cfi); } catch { /* ignore */ }
  if (!range) return candidates[0];

  const doc = contents.document;
  let chosen = candidates[0];
  for (const item of candidates) {
    const id = decodeURIComponent(String(item.href).split("#")[1] || "");
    if (!id) continue;
    let mark = null;
    try {
      mark = doc.getElementById(id) || doc.querySelector(`[id="${CSS.escape(id)}"]`);
    } catch { /* ignore */ }
    if (!mark) continue;
    try {
      const before = mark.contains(range.startContainer)
        || (mark.compareDocumentPosition(range.startContainer) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (before) chosen = item;
    } catch { /* ignore */ }
  }
  return chosen;
}

function markTocActive(index, href) {
  let active = null;
  $$("#tocList button").forEach((btn) => {
    btn.classList.remove("active");
    if (href && btn.dataset.href === href) active = btn;
    else if (!href && Number(btn.dataset.index) <= index) active = btn;
  });
  if (!active) return;
  active.classList.add("active");
  const onTocTab = els.side.querySelector('[data-tab="toc"]')?.getAttribute("aria-selected") === "true";
  if (els.reader.classList.contains("side-open") && onTocTab) {
    active.scrollIntoView({ block: "nearest" });
  }
}

// epub.js 在注入自定义排版之前测量目标位置，整节首次渲染时会偏出一两页；
// 等样式生效后再按目标重新对齐一次。
let alignTimer = 0;

function alignAfterRender(target, delay = 90) {
  if (!target || !state.rendition) return;
  clearTimeout(alignTimer);
  alignTimer = setTimeout(() => {
    const manager = state.rendition?.manager;
    const views = manager?.views?.all?.() || [];
    for (const view of views) {
      if (!view.displayed) continue;
      let rect = null;
      try { rect = view.locationOf(target); } catch { continue; }
      if (!rect || (!rect.left && !rect.top)) continue;
      try {
        manager.moveTo(rect, manager.layout?.width || 0);
        state.rendition.reportLocation();
      } catch { /* ignore */ }
      break;
    }
  }, delay);
}

async function goHref(href) {
  if (!state.rendition) return;
  try {
    await state.rendition.display(href);
    alignAfterRender(href);
  } catch {
    const item = state.epub.spine.get(String(href).split("#")[0]);
    if (item) await state.rendition.display(item.href);
    else toast("找不到这一节");
  }
}

// ---------------------------------------------------------------- 划线 / 笔记

function addHighlight(annotation) {
  if (!state.rendition || !annotation?.cfi) return;
  try {
    state.rendition.annotations.highlight(
      annotation.cfi,
      { id: annotation.id },
      () => openNoteEditor(annotation),
      `xh-${annotation.id}`,
      highlightStyles(annotation.color),
    );
  } catch { /* CFI 失效时忽略 */ }
}

function removeHighlight(annotation) {
  if (!state.rendition || !annotation?.cfi) return;
  try { state.rendition.annotations.remove(annotation.cfi, "highlight"); } catch { /* ignore */ }
}

function refreshHighlights() {
  if (!state.rendition) return;
  state.annotations.forEach(removeHighlight);
  state.annotations.forEach(addHighlight);
}

function onSelected(cfiRange, contents) {
  clearTimeout(state.selTimer);
  state.selTimer = setTimeout(() => {
    let text = "";
    try { text = (contents?.window?.getSelection()?.toString() || "").trim(); } catch { /* ignore */ }
    if (!text) {
      hideSelBar();
      return;
    }
    state.pendingSelection = { cfi: cfiRange, text: text.slice(0, 1000), contents };
    positionSelBar(contents, cfiRange);
  }, 90);
}

function positionSelBar(contents, cfiRange) {
  let range = null;
  let frame = null;
  try {
    range = contents.range(cfiRange);
    frame = contents.document.defaultView.frameElement;
  } catch { /* ignore */ }
  if (!range || !frame) return;
  const rect = range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return;
  const fr = frame.getBoundingClientRect();
  const margin = Math.min(150, window.innerWidth / 2);
  const x = Math.min(Math.max(fr.left + rect.left + rect.width / 2, margin), window.innerWidth - margin);
  const y = Math.max(fr.top + rect.top - 4, 64);
  els.selBar.style.left = `${x}px`;
  els.selBar.style.top = `${y}px`;
  els.selBar.hidden = false;
}

function hideSelBar() {
  els.selBar.hidden = true;
  state.pendingSelection = null;
}

function clearSelection(contents) {
  try { contents?.window?.getSelection()?.removeAllRanges(); } catch { /* ignore */ }
}

async function createHighlight(color) {
  const sel = state.pendingSelection;
  if (!sel) return;
  state.lastColor = color;
  hideSelBar();
  const payload = {
    cfi: sel.cfi,
    quote: sel.text,
    note: "",
    color,
    chapter: state.chapterTitle || "",
    percent: currentPercent(),
    type: "highlight",
  };
  try {
    const { annotation } = await postJSON(`/api/books/${BOOK_ID}/annotations`, payload);
    state.annotations.push(annotation);
    addHighlight(annotation);
    updateNoteCount();
    renderNotes();
    clearSelection(sel.contents);
    toast(`已划线 · ${labelOfColor(color)}`);
  } catch (err) {
    toast(`保存失败：${err.message}`);
  }
}

function labelOfColor(color) {
  return { yellow: "黄", green: "绿", blue: "蓝", pink: "粉" }[color] || "黄";
}

function openNoteEditor(annotation) {
  state.editing = annotation;
  els.ndTitle.textContent = "编辑笔记";
  els.ndQuote.textContent = annotation.quote || "";
  els.ndText.value = annotation.note || "";
  els.ndDelete.hidden = false;
  showDialog();
}

function openNewNote() {
  const sel = state.pendingSelection;
  if (!sel) {
    toast("请先选中正文");
    return;
  }
  state.editing = null;
  state.dialogColor = state.lastColor || "yellow";
  els.ndTitle.textContent = "添加笔记";
  els.ndQuote.textContent = sel.text;
  els.ndText.value = "";
  els.ndDelete.hidden = true;
  hideSelBarKeepSelection();
  showDialog();
}

function hideSelBarKeepSelection() {
  els.selBar.hidden = true;
}

function showDialog() {
  els.noteDialog.hidden = false;
  setTimeout(() => els.ndText.focus(), 60);
}

function closeDialog() {
  els.noteDialog.hidden = true;
  state.editing = null;
  state.dialogColor = null;
  state.pendingSelection = null;
}

async function saveDialog() {
  const note = els.ndText.value.trim();
  if (state.editing) {
    const target = state.editing;
    try {
      const { annotation } = await patchJSON(`/api/annotations/${target.id}`, { note });
      Object.assign(target, annotation);
      renderNotes();
      closeDialog();
      toast(note ? "笔记已保存" : "已清空笔记");
    } catch (err) {
      toast(`保存失败：${err.message}`);
    }
    return;
  }

  const sel = state.pendingSelection;
  if (!sel) {
    closeDialog();
    return;
  }
  const payload = {
    cfi: sel.cfi,
    quote: sel.text,
    note,
    color: state.dialogColor || "yellow",
    chapter: state.chapterTitle || "",
    percent: currentPercent(),
    type: "highlight",
  };
  try {
    const { annotation } = await postJSON(`/api/books/${BOOK_ID}/annotations`, payload);
    state.annotations.push(annotation);
    addHighlight(annotation);
    updateNoteCount();
    renderNotes();
    clearSelection(sel.contents);
    closeDialog();
    toast("笔记已保存");
  } catch (err) {
    toast(`保存失败：${err.message}`);
  }
}

async function removeAnnotation(annotation) {
  if (!annotation) return;
  try {
    await del(`/api/annotations/${annotation.id}`);
    removeHighlight(annotation);
    state.annotations = state.annotations.filter((a) => a.id !== annotation.id);
    updateNoteCount();
    renderNotes();
    if (state.editing?.id === annotation.id) closeDialog();
    toast("已删除");
  } catch (err) {
    toast(`删除失败：${err.message}`);
  }
}

function renderNotes() {
  const items = [...state.annotations].sort((a, b) => (a.percent || 0) - (b.percent || 0));
  if (!items.length) {
    els.noteList.innerHTML = `<p class="pane-empty">还没有笔记。<br>选中正文即可划线、写笔记。</p>`;
    return;
  }
  els.noteList.innerHTML = items.map((a) => {
    const color = COLORS[a.color] ? a.color : "yellow";
    const percent = `${Math.round((a.percent || 0) * 1000) / 10}%`;
    return `
      <article class="note-card" data-id="${a.id}" style="--nc:${COLORS[color]}">
        <p class="note-quote">${esc(a.quote)}</p>
        ${a.note ? `<p class="note-text">${esc(a.note)}</p>` : ""}
        <div class="note-meta">
          <span>${esc(a.chapter || "未标注章节")} · ${percent}</span>
          <span class="acts">
            <button type="button" data-act="jump" title="跳转">${ICON.jump}</button>
            <button type="button" data-act="edit" title="编辑">${ICON.edit}</button>
            <button type="button" data-act="del" title="删除">${ICON.trash}</button>
          </span>
        </div>
      </article>`;
  }).join("");
}

function updateNoteCount() {
  els.noteCount.hidden = state.annotations.length === 0;
}

function renderMarks() {
  const items = [...state.bookmarks].sort((a, b) => (a.percent || 0) - (b.percent || 0));
  if (!items.length) {
    els.markList.innerHTML = `<p class="pane-empty">还没有书签。<br>点右上角书签按钮记下当前位置。</p>`;
    return;
  }
  els.markList.innerHTML = items.map((b) => `
    <article class="note-card" data-id="${b.id}" style="--nc:var(--gold)">
      <p class="note-quote">${esc(b.label || "书签")}</p>
      <div class="note-meta">
        <span>${Math.round((b.percent || 0) * 1000) / 10}%</span>
        <span class="acts">
          <button type="button" data-act="jump" title="跳转">${ICON.jump}</button>
          <button type="button" data-act="del" title="删除">${ICON.trash}</button>
        </span>
      </div>
    </article>`).join("");
}

async function toggleBookmark() {
  const loc = state.current;
  if (!loc) return;
  const cfi = loc.start.cfi;
  const existing = state.bookmarks.find((b) => b.cfi === cfi);
  try {
    if (existing) {
      await del(`/api/bookmarks/${existing.id}`);
      state.bookmarks = state.bookmarks.filter((b) => b.id !== existing.id);
      toast("已移除书签");
    } else {
      const { bookmark } = await postJSON(`/api/books/${BOOK_ID}/bookmarks`, {
        cfi,
        label: state.chapterTitle || state.meta.title,
        percent: currentPercent(),
      });
      state.bookmarks.push(bookmark);
      toast("已添加书签");
    }
    renderMarks();
    syncBookmarkBtn();
  } catch (err) {
    toast(`操作失败：${err.message}`);
  }
}

function syncBookmarkBtn() {
  const cfi = state.current?.start?.cfi;
  const on = Boolean(cfi && state.bookmarks.some((b) => b.cfi === cfi));
  els.bookmarkBtn.setAttribute("aria-pressed", String(on));
  els.bookmarkBtn.title = on ? "移除书签" : "添加书签";
}

async function jumpTo(cfi) {
  if (!state.rendition || !cfi) return;
  closeSide();
  try {
    await state.rendition.display(cfi);
    alignAfterRender(cfi);
  } catch {
    toast("找不到这个位置");
  }
}

// ---------------------------------------------------------------- 全文搜索

function mapText(doc) {
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let text = "";
  let node;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue;
    if (!value) continue;
    nodes.push({ node, start: text.length, len: value.length });
    text += value;
  }
  return { text, nodes };
}

async function ensureSearchIndex(onProgress) {
  if (state.searchIndex) return state.searchIndex;
  const items = state.epub.spine.spineItems;
  const index = [];
  for (let i = 0; i < items.length; i++) {
    onProgress?.(i, items.length);
    const section = items[i];
    try {
      await section.load(state.epub.load.bind(state.epub));
      const doc = section.document;
      if (doc) {
        const { text, nodes } = mapText(doc);
        if (text.trim()) {
          // 一节里常有多个章节，记下每个目录锚点所在的字符位置，命中时才能标对章节
          const anchors = [];
          for (const item of state.toc) {
            if (item.index !== section.index) continue;
            const id = decodeURIComponent(String(item.href).split("#")[1] || "");
            const mark = id ? doc.getElementById(id) : null;
            if (!mark) continue;
            const node = nodes.find((n) => mark.contains(n.node));
            if (node) anchors.push({ title: item.title, at: node.start });
          }
          index.push({ index: section.index, title: sectionTitle(section.index), text, anchors });
        }
      }
      section.unload();
    } catch { /* 单节损坏不影响整本搜索 */ }
    if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
  }
  state.searchIndex = index;
  return index;
}

let searchSeq = 0;

async function runSearch(raw) {
  const q = String(raw || "").trim();
  const my = ++searchSeq;
  if (!q) {
    els.searchMeta.textContent = "输入关键词开始搜索";
    els.searchResults.innerHTML = "";
    return;
  }
  if (state.searching) return;
  state.searching = true;
  els.searchMeta.textContent = "正在建立全文索引…";
  try {
    const index = await ensureSearchIndex((i, n) => {
      if (my === searchSeq) els.searchMeta.textContent = `正在建立索引 ${i + 1} / ${n}`;
    });
    if (my !== searchSeq) return;
    const needle = q.toLowerCase();
    const hits = [];
    for (const entry of index) {
      if (hits.length >= 60) break;
      const hay = entry.text.toLowerCase();
      let from = 0;
      while (hits.length < 60) {
        const at = hay.indexOf(needle, from);
        if (at < 0) break;
        hits.push({ entry, at, length: q.length, needle: q, chapter: chapterAtOffset(entry, at) });
        from = at + Math.max(1, needle.length);
      }
    }
    if (my !== searchSeq) return;
    state.searchHits = hits;
    renderSearchResults(hits, q);
  } catch (err) {
    els.searchMeta.textContent = `搜索失败：${err.message}`;
  } finally {
    state.searching = false;
    // 建索引期间用户可能又改了关键词，这里补跑最新一次
    const latest = els.searchInput.value.trim();
    if (latest && latest !== q) runSearch(latest);
  }
}

function chapterAtOffset(entry, at) {
  let title = entry.title;
  for (const anchor of entry.anchors || []) {
    if (anchor.at <= at) title = anchor.title;
  }
  return title;
}

function renderSearchResults(hits, q) {
  if (!hits.length) {
    els.searchMeta.textContent = `没有找到「${q}」`;
    els.searchResults.innerHTML = "";
    return;
  }
  els.searchMeta.textContent = `找到 ${hits.length} 处${hits.length >= 60 ? "（仅显示前 60 处）" : ""}`;
  els.searchResults.innerHTML = hits.map((hit, i) => {
    const text = hit.entry.text;
    const start = Math.max(0, hit.at - 46);
    const end = Math.min(text.length, hit.at + hit.length + 70);
    const snippet = `${start > 0 ? "…" : ""}${esc(text.slice(start, hit.at))}<mark>${esc(text.slice(hit.at, hit.at + hit.length))}</mark>${esc(text.slice(hit.at + hit.length, end))}${end < text.length ? "…" : ""}`;
    return `<button type="button" class="search-hit" data-i="${i}">
      <span class="hit-chapter">${esc(hit.chapter || hit.entry.title)}</span>
      <span class="hit-text">${snippet}</span>
    </button>`;
  }).join("");
}

async function jumpToHit(hit) {
  closeSide();
  try {
    const section = state.epub.spine.spineItems[hit.entry.index];
    if (!section) return;
    await section.load(state.epub.load.bind(state.epub));
    const doc = section.document;
    if (!doc) return;
    const { text, nodes } = mapText(doc);
    let at = hit.at;
    if (text.slice(at, at + hit.length).toLowerCase() !== hit.needle.toLowerCase()) {
      at = text.toLowerCase().indexOf(hit.needle.toLowerCase());
    }
    if (at < 0 || !nodes.length) {
      section.unload();
      toast("这段文字已变化，无法定位");
      return;
    }
    const target = nodes.find((n) => at >= n.start && at < n.start + n.len) || nodes[nodes.length - 1];
    const range = doc.createRange();
    range.setStart(target.node, Math.max(0, at - target.start));
    range.setEnd(target.node, Math.min(target.len, at - target.start + hit.length));
    const cfi = section.cfiFromRange(range);
    section.unload();
    await state.rendition.display(cfi);
    alignAfterRender(cfi);
    flashMatch(cfi);
  } catch (err) {
    toast(`定位失败：${err.message}`);
  }
}

function flashMatch(cfi) {
  if (!cfi || state.annotations.some((a) => a.cfi === cfi)) return;
  try {
    state.rendition.annotations.highlight(cfi, { temp: true }, null, "xh-flash",
      { fill: "#e6b64a", "fill-opacity": "0.45" });
    setTimeout(() => {
      try { state.rendition.annotations.remove(cfi, "highlight"); } catch { /* ignore */ }
    }, 2800);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------- 面板与设置

function bindContents(contents) {
  const doc = contents?.document;
  if (!doc || doc.__xhBound) return;
  doc.__xhBound = true;
  doc.addEventListener("keydown", handleKey);
  doc.addEventListener("mousedown", () => {
    els.selBar.hidden = true;
    state.pendingSelection = null;
  }, true);

  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  doc.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    t0 = Date.now();
  }, { passive: true });
  doc.addEventListener("touchend", (e) => {
    if (state.prefs.flow !== "paginated" || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Date.now() - t0 > 700) return;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) state.rendition?.next();
    else state.rendition?.prev();
  }, { passive: true });
}

function openPanel(tab) {
  closeSettings();
  els.reader.classList.add("side-open");
  els.side.setAttribute("aria-hidden", "false");
  els.scrim.hidden = false;
  switchTab(tab);
  if (tab === "search") setTimeout(() => els.searchInput.focus(), 180);
}

function closeSide() {
  els.reader.classList.remove("side-open");
  els.side.setAttribute("aria-hidden", "true");
  if (!els.reader.classList.contains("settings-open")) els.scrim.hidden = true;
}

function openSettings() {
  closeSide();
  els.reader.classList.add("settings-open");
  els.settings.setAttribute("aria-hidden", "false");
  els.scrim.hidden = false;
}

function closeSettings() {
  els.reader.classList.remove("settings-open");
  els.settings.setAttribute("aria-hidden", "true");
  if (!els.reader.classList.contains("side-open")) els.scrim.hidden = true;
}

function switchTab(tab) {
  $$(".side-tabs button").forEach((btn) => {
    btn.setAttribute("aria-selected", String(btn.dataset.tab === tab));
  });
  $$(".pane").forEach((pane) => { pane.hidden = pane.dataset.pane !== tab; });
  if (tab === "toc") markTocActive(state.current?.start?.index ?? 0);
  if (tab === "search") {
    els.searchMeta.textContent = state.searchHits.length
      ? `找到 ${state.searchHits.length} 处`
      : "输入关键词开始搜索";
  }
}

function closeAll() {
  if (!els.noteDialog.hidden) { closeDialog(); return; }
  if (!els.selBar.hidden) { hideSelBar(); return; }
  if (els.reader.classList.contains("side-open")) { closeSide(); return; }
  if (els.reader.classList.contains("settings-open")) { closeSettings(); return; }
}

function syncPrefsUI() {
  const p = state.prefs;
  els.reader.dataset.readerTheme = p.theme;
  $$("#themeSwatches button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === p.theme)));
  $$("#flowSeg button").forEach((b) => b.setAttribute("aria-pressed",
    String(b.dataset.flow === p.flow && b.dataset.spread === p.spread)));
  $$("#fontSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.font === p.font)));
  $$("#alignSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.align === p.align)));
  els.sizeRange.value = String(p.size);
  els.sizeLabel.textContent = String(p.size);
  els.lineRange.value = String(p.line);
  els.lineLabel.textContent = String(p.line / 100);
  els.padRange.value = String(p.pad);
  els.padLabel.textContent = String(p.pad);
  applyPad();
}

function repaginate(delay = 320) {
  clearTimeout(state.repagTimer);
  state.repagTimer = setTimeout(async () => {
    if (!state.rendition) return;
    const cfi = state.current?.start?.cfi;
    try {
      if (cfi) await state.rendition.display(cfi);
      else await state.rendition.display();
      alignAfterRender(cfi);
    } catch { /* ignore */ }
  }, delay);
}

async function applyLayout() {
  if (!state.rendition) return;
  const cfi = state.current?.start?.cfi;
  try {
    state.rendition.flow(state.prefs.flow);
    state.rendition.spread(state.prefs.spread);
    if (cfi) {
      await state.rendition.display(cfi);
      alignAfterRender(cfi);
    }
  } catch {
    toast("切换布局失败");
  }
}

function handleKey(e) {
  if (e.defaultPrevented) return;
  const target = e.target;
  const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "k") {
    e.preventDefault();
    openPanel("search");
    return;
  }
  if (e.key === "Escape") {
    closeAll();
    return;
  }
  if (typing) return;
  if (e.key === "ArrowRight" || e.key === "PageDown") {
    e.preventDefault();
    state.rendition?.next();
  } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
    e.preventDefault();
    state.rendition?.prev();
  } else if (e.key === " " && state.prefs.flow === "paginated") {
    e.preventDefault();
    state.rendition?.next();
  }
}

// ---------------------------------------------------------------- 事件

function bindUI() {
  document.addEventListener("keydown", handleKey);

  $$("[data-panel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.panel;
      if (els.reader.classList.contains("side-open") && els.side.querySelector(`[data-tab="${tab}"]`)?.getAttribute("aria-selected") === "true") {
        closeSide();
      } else {
        openPanel(tab);
      }
    });
  });
  $$(".side-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  els.sideClose.addEventListener("click", closeSide);
  els.settingsBtn.addEventListener("click", () => {
    if (els.reader.classList.contains("settings-open")) closeSettings();
    else openSettings();
  });
  els.settingsClose.addEventListener("click", closeSettings);
  els.scrim.addEventListener("click", closeAll);

  els.prevBtn.addEventListener("click", () => state.rendition?.prev());
  els.nextBtn.addEventListener("click", () => state.rendition?.next());

  els.slider.addEventListener("pointerdown", () => { state.dragging = true; });
  window.addEventListener("pointerup", () => { state.dragging = false; });
  els.slider.addEventListener("input", () => {
    els.percent.textContent = `${(Number(els.slider.value) / 10).toFixed(1)}%`;
  });
  els.slider.addEventListener("change", async () => {
    state.dragging = false;
    if (!state.locationsReady) {
      toast("位置索引还在生成，稍等一下");
      updateProgressUI();
      return;
    }
    const cfi = state.epub?.locations.cfiFromPercentage(Number(els.slider.value) / 1000);
    if (cfi) {
      try {
        await state.rendition.display(cfi);
        alignAfterRender(cfi);
      } catch { /* ignore */ }
    }
  });

  els.bookmarkBtn.addEventListener("click", toggleBookmark);

  els.tocList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-href]");
    if (!btn) return;
    closeSide();
    goHref(btn.dataset.href);
  });

  els.noteList.addEventListener("click", async (e) => {
    const card = e.target.closest(".note-card");
    if (!card) return;
    const item = state.annotations.find((a) => a.id === Number(card.dataset.id));
    if (!item) return;
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "del") await removeAnnotation(item);
    else if (act === "edit") openNoteEditor(item);
    else jumpTo(item.cfi);
  });

  els.markList.addEventListener("click", async (e) => {
    const card = e.target.closest(".note-card");
    if (!card) return;
    const id = Number(card.dataset.id);
    const item = state.bookmarks.find((b) => b.id === id);
    if (!item) return;
    if (e.target.closest("[data-act]")?.dataset.act === "del") {
      try {
        await del(`/api/bookmarks/${item.id}`);
        state.bookmarks = state.bookmarks.filter((b) => b.id !== item.id);
        renderMarks();
        syncBookmarkBtn();
        toast("已移除书签");
      } catch (err) {
        toast(`删除失败：${err.message}`);
      }
      return;
    }
    jumpTo(item.cfi);
  });

  $$("#selBar .sw").forEach((btn) => {
    btn.addEventListener("click", () => createHighlight(btn.dataset.color));
  });
  $$("#selBar [data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      if (action === "note") {
        openNewNote();
        return;
      }
      const sel = state.pendingSelection;
      if (!sel) return;
      try {
        await navigator.clipboard.writeText(sel.text);
        toast("已复制");
      } catch {
        toast("复制失败，请手动选择复制");
      }
      hideSelBar();
      clearSelection(sel.contents);
    });
  });
  els.selBar.addEventListener("mousedown", (e) => e.preventDefault());
  els.selBar.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });

  els.ndCancel.addEventListener("click", closeDialog);
  els.ndSave.addEventListener("click", saveDialog);
  els.ndDelete.addEventListener("click", () => removeAnnotation(state.editing));
  els.noteDialog.addEventListener("mousedown", (e) => {
    if (e.target === els.noteDialog) closeDialog();
  });

  els.searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch(els.searchInput.value);
  });
  let searchTimer = null;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const value = els.searchInput.value.trim();
    if (!value) {
      runSearch("");
      return;
    }
    if (value.length < 2) return;
    searchTimer = setTimeout(() => runSearch(value), 320);
  });
  els.searchResults.addEventListener("click", (e) => {
    const btn = e.target.closest(".search-hit");
    if (!btn) return;
    const hit = state.searchHits[Number(btn.dataset.i)];
    if (hit) jumpToHit(hit);
  });

  $$("#themeSwatches button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.prefs.theme = btn.dataset.theme;
      syncPrefsUI();
      savePrefs();
      refreshReaderCss();
      refreshHighlights();
    });
  });

  $$("#flowSeg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.prefs.flow = btn.dataset.flow;
      state.prefs.spread = btn.dataset.spread;
      syncPrefsUI();
      savePrefs();
      applyLayout();
    });
  });

  $$("#fontSeg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.prefs.font = btn.dataset.font;
      syncPrefsUI();
      savePrefs();
      refreshReaderCss();
      repaginate(120);
    });
  });

  $$("#alignSeg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.prefs.align = btn.dataset.align;
      syncPrefsUI();
      savePrefs();
      refreshReaderCss();
    });
  });

  els.sizeRange.addEventListener("input", () => {
    state.prefs.size = Number(els.sizeRange.value);
    els.sizeLabel.textContent = String(state.prefs.size);
    savePrefs();
    refreshReaderCss();
    repaginate();
  });
  els.lineRange.addEventListener("input", () => {
    state.prefs.line = Number(els.lineRange.value);
    els.lineLabel.textContent = String(state.prefs.line / 100);
    savePrefs();
    refreshReaderCss();
    repaginate();
  });
  els.padRange.addEventListener("input", () => {
    state.prefs.pad = Number(els.padRange.value);
    els.padLabel.textContent = String(state.prefs.pad);
    savePrefs();
    applyPad();
    repaginate();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushProgress();
  });
  window.addEventListener("pagehide", beaconProgress);
}

boot().catch((err) => {
  fail(`阅读器初始化失败：${err.message}`);
});
