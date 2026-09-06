from pathlib import Path
from PIL import Image

root = Path('.')
exclude = {'Vets_van_logo_png.png', 'Icon.png'}
converted = []

for src in list(root.glob('*.jpg')) + list(root.glob('*.jpeg')) + list(root.glob('*.png')):
    if src.name in exclude or src.stat().st_size < 150_000:
        continue
    try:
        with Image.open(src) as im:
            dst = src.with_suffix('.webp')
            save_kwargs = {'format': 'WEBP', 'method': 6}
            if im.mode in ('RGBA', 'LA') or ('transparency' in im.info):
                save_kwargs.update({'lossless': True})
            else:
                if im.mode not in ('RGB', 'L'):
                    im = im.convert('RGB')
                save_kwargs.update({'quality': 88})
            im.save(dst, **save_kwargs)
        if dst.stat().st_size >= src.stat().st_size:
            dst.unlink()
            continue
        converted.append((src.name, dst.name, src.stat().st_size, dst.stat().st_size))
    except Exception as e:
        print(f'skip {src}: {e}')

html_files = [Path('index.html'), Path('about/index.html'), Path('services/index.html'), Path('contact/index.html')]
html_files += list(Path('services').glob('*/index.html'))
for p in html_files:
    if not p.exists():
        continue
    text = p.read_text()
    for old, new, _, _ in converted:
        text = text.replace(f'src="/{old}"', f'src="/{new}"')
        text = text.replace(f'src="{old}"', f'src="/{new}"')
        text = text.replace(f'url(/{old})', f'url(/{new})')
        text = text.replace(f'url({old})', f'url(/{new})')
    p.write_text(text)

if not converted:
    raise SystemExit('No beneficial image conversions were produced')

print('Converted images:')
for old, new, before, after in converted:
    saved = 100 * (before - after) / before
    print(f'{old} -> {new}: {before} -> {after} bytes ({saved:.1f}% smaller)')
