from pathlib import Path
import re

html_files = [Path('index.html')]
html_files += [p for p in Path('.').rglob('*.html') if '.git' not in p.parts]
# de-duplicate while preserving order
seen = set()
html_files = [p for p in html_files if not (str(p) in seen or seen.add(str(p)))]

ACTIVE_SCRIPT = r'''<script id="vv-active-navigation">
(function () {
  function normalizePath(value) {
    try {
      const url = new URL(value, window.location.origin);
      let p = url.pathname || '/';
      if (p !== '/' && !p.endsWith('/')) p += '/';
      return p;
    } catch (_) { return value; }
  }

  function applyActiveNavigation() {
    let current = normalizePath(window.location.pathname);
    document.querySelectorAll('.nav-links > a').forEach(function (link) {
      link.classList.remove('active-link');
      link.removeAttribute('aria-current');
      const href = link.getAttribute('href');
      if (!href || href === '#') return;
      const target = normalizePath(href);
      if (target === current) {
        link.classList.add('active-link');
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyActiveNavigation);
  } else {
    applyActiveNavigation();
  }
  window.addEventListener('popstate', applyActiveNavigation);
})();
</script>'''

changed = []
for p in html_files:
    if not p.exists():
        continue
    s = p.read_text(encoding='utf-8')
    old = s

    # Make every VETS VAN logo reference root-relative at any page depth.
    s = re.sub(r'src=["\'](?:\./|\.\./)*Vets_van_logo_png\.png([?][^"\']*)?["\']',
               lambda m: 'src="/Vets_van_logo_png.png' + (m.group(1) or '') + '"', s)

    # Remove old copy if this script was previously injected.
    s = re.sub(r'\s*<script id="vv-active-navigation">[\s\S]*?</script>\s*', '\n', s, count=1)

    # Only pages with the full site navigation need current-page highlighting.
    if 'class="nav-links"' in s and '</body>' in s:
        s = s.replace('</body>', ACTIVE_SCRIPT + '\n</body>', 1)

    if s != old:
        p.write_text(s, encoding='utf-8')
        changed.append(str(p))

print('Updated:', *changed, sep='\n- ')
