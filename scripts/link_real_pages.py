from pathlib import Path

p = Path('index.html')
s = p.read_text()

replacements = {
    'href="#" onclick="navTo(\'services\')"': 'href="/services/"',
    'href="#" onclick="navTo(\'about\')"': 'href="/about/"',
    'href="#" onclick="navTo(\'contact\')"': 'href="/contact/"',
}

for old, new in replacements.items():
    if old not in s:
        raise SystemExit(f'Expected navigation pattern not found: {old}')
    s = s.replace(old, new)

p.write_text(s)
