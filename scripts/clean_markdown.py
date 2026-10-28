#!/usr/bin/env python3
"""Phase 2: Clean VLM markdown output — LaTeX whitespace, page headers, footnotes, etc."""
import re, sys

def clean(text):
    fixes = {}

    # 1. Remove digit-spacing in math (1 0 0 -> 100)
    new_text = re.sub(r'(?<=\d)\s+(?=\d)', '', text)

    # 2. Fix LaTeX _{} and ^{} whitespace
    new_text = re.sub(r'([a-zA-Z0-9])\s+([_^])', r'\1\2', new_text)
    new_text = re.sub(r'([_^])\s+\{', r'\1{', new_text)
    new_text = re.sub(r'\{\s+', '{', new_text)
    new_text = re.sub(r'\s+\}', '}', new_text)

    # 3. Fix \<cmd> { -> \<cmd>{ for all LaTeX commands
    new_text = re.sub(r'\\([a-zA-Z]+)\s+\{', r'\\\1{', new_text)
    new_text = re.sub(r'(\\(?:text|mathrm|mathbf|boldsymbol|mathit|mathcal|mathbb)\{[^}]+?)\s{2,}([^}]*\})', lambda m: m.group(1) + ' ' + m.group(2), new_text)

    # 4. Remove footnote superscripts ($^{N}$)
    new_text, n = re.subn(r'\s*\\\$\^\{(\d+)\}\\\$', '', new_text)
    fixes['footnotes_removed'] = n

    # 5. Fix ■ bullets
    new_text = new_text.replace('■', '-')
    fixes['bullets_fixed'] = new_text.count('-') - text.count('-') if '■' in text else 0

    # 6. Remove stray page headers (standalone chapter names as body text)
    page_headers = [
        'Brain Teasers', 'Probability Theory', 'Calculus and Linear Algebra',
        'Stochastic Process and Stochastic Calculus', 'Algorithms and Numerical Methods',
        'Finance', 'Contents',
    ]
    lines = new_text.split('\n')
    result = []
    removed = 0
    for i, line in enumerate(lines):
        s = line.strip()
        if s in page_headers:
            prev = lines[i-1].strip() if i > 0 else ''
            nxt = lines[i+1].strip() if i+1 < len(lines) else ''
            if prev == '' and (nxt == '' or nxt.startswith('#') or nxt.startswith('![')):
                removed += 1
                continue
        # Also remove Chinese page headers
        if s in ['微积分与线性代数', '概率论', '脑筋急转弯', '随机过程与随机微积分', '算法与数值方法', '金融']:
            removed += 1
            continue
        result.append(line)
    fixes['page_headers_removed'] = removed

    # 7. Collapse 3+ blank lines to 2
    final = []
    blank_run = 0
    for line in result:
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
    cleaned, fixes = clean(text)
    with open(path, 'w') as f:
        f.write(cleaned)
    print(f'Cleaned {path}: {fixes}')
