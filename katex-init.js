// KaTeX + pseudocode 初始化（独立文件，避免 Hugo 模板吞掉 $$）
document.addEventListener("DOMContentLoaded", function () {
  // 1. KaTeX
  if (window.renderMathInElement) {
    renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "$", right: "$", display: false }
      ],
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      ignoredClasses: ["pseudocode"],
      throwOnError: false
    });
  }

  // 2. pseudocode.js
  if (window.pseudocode) {
    document.querySelectorAll("pre.pseudocode").forEach(function (el) {
      try {
        pseudocode.renderElement(el, { lineNumber: false });
      } catch (e) {
        console.error("pseudocode error:", e, el);
      }
    });
  }
});
