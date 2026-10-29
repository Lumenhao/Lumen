import { t } from "./i18n.js";

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);
}

export function hash8(text) {
  let h = 0;
  for (const ch of String(text || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 8;
}

export function stars(rating) {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export function initial(title) {
  return String(title || "").trim().slice(0, 1) || "·";
}

export function formatBytes(size) {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function fallbackCover(book, kicker = t("common.book")) {
  return `
    <div class="cover-fallback cf-${hash8(book.title)}">
      <span class="cover-kicker">${esc(kicker)}</span>
      <span class="cover-name">${esc(book.title)}</span>
      <span class="cover-sign">星皓书房</span>
    </div>`;
}

export function coverMarkup(book, kicker = t("common.book")) {
  if (!book.has_cover) return fallbackCover(book, kicker);
  return `
    ${fallbackCover(book, kicker)}
    <img src="/api/books/${book.id}/cover" alt="" loading="lazy"
         style="position:absolute;inset:0;z-index:1" onerror="this.remove()">`;
}

let toastTimer = null;

export function toast(message) {
  const host = document.getElementById("toastHost");
  if (!host) return;
  host.textContent = "";
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  host.appendChild(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 2400);
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("xh-theme", theme);
}

export function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}
