from pathlib import Path
import re

root = Path('.')
server = root / 'server' / 'index.js'
booking = root / 'booking-source.js'
sitemap = root / 'sitemap.xml'
index = root / 'index.html'
standalone = [root/'services'/'index.html', root/'about'/'index.html', root/'contact'/'index.html']

# 1) Server-render /book/ from the SAME index.html, only overriding SEO metadata.
s = server.read_text()
marker = "bootstrap().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`VETS VAN server listening on ${PORT}`))).catch(e=>{console.error(e);process.exit(1);});"
route = r'''// Dedicated indexable booking URL. Reuses the single existing booking UI and logic.
app.get(['/book', '/book/'], async (_req, res) => {
  try {
    let html = await fs.readFile(path.join(__dirname, '..', 'index.html'), 'utf8');
    const title = 'Book a Mobile Vet Visit in Riyadh | VETS VAN';
    const description = 'Book a VETS VAN mobile veterinary visit in Riyadh. Appointment availability and booking source are managed live by the clinic.';
    const canonical = 'https://www.vetsvan.com/book/';
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
    html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${description}">`);
    html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}">`);
    html = html.replace(/<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${title}">`);
    html = html.replace(/<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${description}">`);
    html = html.replace(/<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${canonical}">`);
    html = html.replace(/<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${title}">`);
    html = html.replace(/<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${description}">`);
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(html);
  } catch (error) {
    console.error('book page:', error.message);
    res.status(500).send('Unable to load booking page');
  }
});

'''
if "app.get(['/book', '/book/']" not in s:
    if marker not in s:
        raise SystemExit('server bootstrap marker not found')
    s = s.replace(marker, route + marker, 1)
server.write_text(s)

# 2) Make booking-source understand /book/ directly without changing its config logic.
b = booking.read_text()
old = """  function applyDeepLink() {\n    const id = location.hash.replace(/^#/, '');\n    if (!['home', 'book', 'services', 'about', 'contact'].includes(id)) return;\n    if (typeof window.navTo === 'function') {\n      try { window.navTo(id); } catch {\n        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));\n        document.getElementById(id)?.classList.add('active');\n        window.scrollTo(0, 0);\n      }\n    }\n  }\n"""
new = """  function applyDeepLink() {\n    const cleanPath = location.pathname.replace(/\\/+$/, '') || '/';\n    const pathPage = cleanPath === '/book' ? 'book' : '';\n    const hashPage = location.hash.replace(/^#/, '');\n    const id = pathPage || hashPage;\n    if (!['home', 'book', 'services', 'about', 'contact'].includes(id)) return;\n    if (typeof window.navTo === 'function') {\n      try { window.navTo(id, false); } catch {\n        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));\n        document.getElementById(id)?.classList.add('active');\n        window.scrollTo(0, 0);\n      }\n    }\n  }\n"""
if old not in b:
    raise SystemExit('booking deep-link block not found')
b = b.replace(old, new, 1)
booking.write_text(b)

# 3) Expose /book/ as the canonical booking destination in visible links.
for p in [index] + standalone:
    if not p.exists():
        continue
    text = p.read_text()
    text = text.replace('href="/#book"', 'href="/book/"')
    text = text.replace("href='#book'", "href='/book/'")
    # Header anchors on the SPA home can safely navigate to the real URL now.
    text = text.replace('href="#" onclick="navTo(\'book\')"', 'href="/book/"')
    p.write_text(text)

# 4) Sitemap: preserve all current URLs, add /book/ once.
sm = sitemap.read_text()
if 'https://www.vetsvan.com/book/' not in sm:
    block = '''  <url>\n    <loc>https://www.vetsvan.com/book/</loc>\n    <lastmod>2026-09-03</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n'''
    sm = sm.replace('</urlset>', block + '</urlset>')
sitemap.write_text(sm)
