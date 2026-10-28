#!/usr/bin/env python3
"""Phase 2b: Clean EPUB pandoc markdown output — CSS artifacts, empty anchors, fenced divs, copyright pages."""
import re, sys

def clean_epub(text):
    fixes = {}

    # 1. Remove empty anchor spans: []{#text00000.html}
    new_text, n = re.subn(r'\n\[\]\{#text\d+\.html\}\s*\n', '\n', text)
    fixes['empty_anchors_removed'] = n

    # 2. Remove heading CSS class artifacts: {.c01} {.c02} etc.
    new_text = re.sub(r' \{\.(c0\d|kindle-cn-toc-title|kindle-cn-toc-level-\d)\}', '', new_text)

    # 3. Remove empty fenced div blocks: ::: {} through :::
    new_text = re.sub(r'\n::: \{\}\s*\n', '\n', new_text)
    new_text = re.sub(r'\n::: \{[^}]*style[^}]*\}\s*\n', '\n', new_text)

    # 4. Remove long fenced div chains (:::: ....)
    new_text = re.sub(r'\n:{3,}\s*$', '\n', new_text, flags=re.MULTILINE)
    new_text = re.sub(r'\n:{3,} \w+\s*\n', '\n', new_text)
    new_text = re.sub(r'\n:{3,} \{\}\s*\n', '\n', new_text)

    # 5. Remove placeholder images: [图像]{.image .placeholder ...}
    new_text, n2 = re.subn(
        r'\[图像\]\{\.image \.placeholder\s*\n?\s*original-image-src="[^"]*"\s*\n?\s*original-image-title="[^"]*"\}',
        '', new_text
    )
    fixes['placeholder_images_removed'] = n2

    # 6. Remove CIP/copyright blocks
    cip_start = re.search(r'\*\*图书在版编目.*\*\*', new_text)
    if cip_start:
        # Find the end of CIP block (next empty line followed by non-fenced content)
        end = new_text.find('\n\n#', cip_start.start())
        if end == -1:
            end = new_text.find('\n\n::: shuming', cip_start.start())
        if end == -1:
            end = new_text.find('\n\n[]{#', cip_start.start())
        if end != -1:
            new_text = new_text[:cip_start.start()] + new_text[end+2:]
            fixes['cip_removed'] = 1

    # 7. Remove standalone ":::" lines (leftover fenced div markers)
    lines = new_text.split('\n')
    result = []
    removed_divs = 0
    for line in lines:
        s = line.strip()
        # Skip lines that are ONLY fenced div markers
        if re.match(r'^:{3,}\s*(\{\})?\s*$', s):
            removed_divs += 1
            continue
        result.append(line)
    new_text = '\n'.join(result)
    fixes['standalone_fences_removed'] = removed_divs

    # 8. Remove empty SVG blocks
    new_text = re.sub(r'<svg[^>]*>\s*</svg>', '', new_text)

    # 9. Remove pandoc fenced TOC divs: ::: sgc-toc-* → empty
    # These are EPUB table-of-contents markers, useless in MkDocs
    new_text = re.sub(r'\n::: sgc-toc-title\s*\n', '\n', new_text)
    new_text = re.sub(r'\n::: sgc-toc-level-\d\s*\n', '\n', new_text)

    # 10. Remove initial EPUB TOC section (links with #textXXXXX.html anchors)
    # These internal EPUB anchors don't work in MkDocs; we'll rebuild TOC in Phase 5
    new_text = re.sub(r'\n\[与神对话\d\]\(#text\d+\.html\)\s*\n', '\n', new_text)
    new_text = re.sub(r'\n\[与神[为合][友一]\]\(#text\d+\.html\)\s*\n', '\n', new_text)

    # 11. Fix escaped brackets: \[美\] → [美]
    new_text = new_text.replace(r'\ [美]', '[美]')

    # 8. Collapse 3+ blank lines to 2
    final = []
    blank_run = 0
    for line in new_text.split('\n'):
        if line.strip() == '':
            blank_run += 1
            if blank_run <= 2:
                final.append(line)
        else:
            blank_run = 0
            final.append(line)

    return '\n'.join(final), fixes

if __name__ == '__main__':
    path = sys.argv[1]
    with open(path) as f:
        text = f.read()
    cleaned, fixes = clean_epub(text)
    with open(path, 'w') as f:
        f.write(cleaned)
    print(f'Cleaned {path}: {fixes}')
