import Fuse from '{{ "fuse.min.mjs" | relURL }}'

{{ $searchDataFile := printf "%s.search-data.json" .Language.Name }}
{{ $searchData := resources.Get "search-data.json" | resources.ExecuteAsTemplate $searchDataFile . | resources.Minify | resources.Fingerprint }}
{{ $searchConfig := i18n "bookSearchConfig" | default "{}" }}

(function () {
  const searchDataURL = '{{ partial "docs/links/resource-precache" $searchData }}';
  const indexConfig = Object.assign({{ $searchConfig }}, {
    includeScore: true,
    includeMatches: true,
    useExtendedSearch: true,
    fieldNormWeight: 1.5,
    threshold: 0.2,
    ignoreLocation: true,
    keys: [
      { name: 'title', weight: 0.7 },
      { name: 'content', weight: 0.3 }
    ]
  });

  const input = document.querySelector('#book-search-input');
  const results = document.querySelector('#book-search-results');
  if (!input) return;

  input.addEventListener('focus', init);
  input.addEventListener('keyup', search);
  document.addEventListener('keydown', focusOnKeyDown);

  function focusOnKeyDown(event) {
    if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault(); input.focus(); return;
    }
    if (input === document.activeElement) return;
    if (event.target.value !== undefined) return;
    if (event.key === '/') { event.preventDefault(); input.focus(); }
  }

  function init() {
    input.removeEventListener('focus', init);
    input.required = true;
    fetch(searchDataURL)
      .then(pages => pages.json())
      .then(pages => { window.bookSearchIndex = new Fuse(pages, indexConfig); })
      .then(() => input.required = false)
      .then(search);
  }

  function search() {
    while (results.firstChild) results.removeChild(results.firstChild);
    if (!input.value) return;

    const searchHits = window.bookSearchIndex.search(input.value).slice(0, 10);
    searchHits.forEach(function (page) {
      const li = element('<li><a href></a><small></small><p></p></li>');
      const a = li.querySelector('a'), small = li.querySelector('small'), p = li.querySelector('p');
      a.href = page.item.href;
      a.innerHTML = highlightTitle(page);
      small.textContent = page.item.section;
      p.innerHTML = highlightContent(page);
      results.appendChild(li);
    });
  }

  function highlightTitle(page) {
    var title = page.item.title || '';
    var m = findMatches(page, 'title');
    if (!m.length) return esc(title);
    return applyMarks(title, m);
  }

  function highlightContent(page) {
    var content = page.item.content || '';
    var m = findMatches(page, 'content');
    if (!m.length) return esc(content.substring(0, 100)) + '…';
    // Expand snippet ~3-5 words around first match (Chinese: ~10 chars)
    var first = m[0], radius = 10;
    var start = Math.max(0, first[0] - radius);
    var end = Math.min(content.length, first[1] + radius);
    var snippet = (start > 0 ? '…' : '') + content.substring(start, end) + (end < content.length ? '…' : '');
    // Shift match indices to snippet coordinates
    var shifted = m.map(function (idx) {
      return [idx[0] - start, idx[1] - start];
    }).filter(function (idx) { return idx[0] >= 0 && idx[1] <= snippet.length; });
    return applyMarks(snippet, shifted);
  }

  function findMatches(page, key) {
    var matches = page.matches || [];
    for (var i = 0; i < matches.length; i++) {
      if (matches[i].key === key) return matches[i].indices || [];
    }
    return [];
  }

  function applyMarks(text, indices) {
    var out = '', pos = 0;
    for (var i = 0; i < indices.length; i++) {
      var s = Math.max(pos, indices[i][0]), e = indices[i][1];
      if (s > pos) out += esc(text.substring(pos, s));
      out += '<span class="search-match">' + esc(text.substring(s, e)) + '</span>';
      pos = e;
    }
    if (pos < text.length) out += esc(text.substring(pos));
    return out;
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function element(content) {
    const div = document.createElement('div');
    div.innerHTML = content;
    return div.firstChild;
  }
})();
