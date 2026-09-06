from pathlib import Path

p = Path('server/index.js')
s = p.read_text()
start = s.index('// Dedicated indexable booking URLs.')
end = s.index('\nbootstrap().then', start)
route = r'''// Dedicated indexable booking URLs. Reuse the single existing booking UI and logic.
async function renderBookingPage(res, arabic = false) {
  try {
    let html = await fs.readFile(path.join(__dirname, '..', 'index.html'), 'utf8');
    for (const pageId of ['home', 'services', 'about', 'contact']) {
      html = html.replace(new RegExp(`<main id=["']${pageId}["'][^>]*>[\\s\\S]*?<\\/main>`, 'i'), '');
    }
    if (!new RegExp('<base\\s', 'i').test(html)) html = html.replace(/<head>/i, '<head>\n    <base href="/">');
    const title = arabic ? 'احجز طبيب بيطري متنقل في الرياض | VETS VAN' : 'Book a Mobile Vet Visit in Riyadh | VETS VAN';
    const description = arabic ? 'احجز زيارة بيطرية متنقلة من VETS VAN داخل الرياض. يتم تحديث توفر المواعيد ومصدر الحجز مباشرة من العيادة.' : 'Book a VETS VAN mobile veterinary visit in Riyadh. Appointment availability and booking source are managed live by the clinic.';
    const canonical = arabic ? 'https://www.vetsvan.com/ar/book/' : 'https://www.vetsvan.com/book/';
    const enCanonical = 'https://www.vetsvan.com/book/';
    const arCanonical = 'https://www.vetsvan.com/ar/book/';
    html = html.replace(new RegExp('<title>[\\s\\S]*?<\\/title>', 'i'), `<title>${title}</title>`);
    html = html.replace(new RegExp('<meta\\s+name=["\\\']description["\\\'][^>]*>', 'i'), `<meta name="description" content="${description}">`);
    html = html.replace(new RegExp('<link\\s+rel=["\\\']canonical["\\\'][^>]*>', 'i'), `<link rel="canonical" href="${canonical}">\n    <link rel="alternate" hreflang="en" href="${enCanonical}">\n    <link rel="alternate" hreflang="ar" href="${arCanonical}">\n    <link rel="alternate" hreflang="x-default" href="${enCanonical}">`);
    html = html.replace(new RegExp('<meta\\s+property=["\\\']og:title["\\\'][^>]*>', 'i'), `<meta property="og:title" content="${title}">`);
    html = html.replace(new RegExp('<meta\\s+property=["\\\']og:description["\\\'][^>]*>', 'i'), `<meta property="og:description" content="${description}">`);
    html = html.replace(new RegExp('<meta\\s+property=["\\\']og:url["\\\'][^>]*>', 'i'), `<meta property="og:url" content="${canonical}">`);
    html = html.replace(new RegExp('<meta\\s+name=["\\\']twitter:title["\\\'][^>]*>', 'i'), `<meta name="twitter:title" content="${title}">`);
    html = html.replace(new RegExp('<meta\\s+name=["\\\']twitter:description["\\\'][^>]*>', 'i'), `<meta name="twitter:description" content="${description}">`);
    if (arabic) {
      html = html.replace(/<html lang="en" dir="ltr">/i, '<html lang="ar" dir="rtl">');
      html = html.replace('<head>', `<head>\n    <script>try{localStorage.setItem('vv_language','ar')}catch(e){}</script>`);
      html = html.replaceAll('href="/services/', 'href="/ar/services/').replaceAll('href="/about/"', 'href="/ar/about/"').replaceAll('href="/contact/"', 'href="/ar/contact/"').replaceAll('href="/book/"', 'href="/ar/book/"');
      html = html.replace('<a href="/" class="logo">', '<a href="/ar/" class="logo">');
      html = html.replace('<a href="/" class="active-link">', '<a href="/ar/" class="active-link">');
      html = html.replace(new RegExp('<a href="#" onclick="switchLang\\(\\\'en\\\'\\); return false;" class="lang-btn en-btn(?: active)?">EN<\\/a>'), '<a href="/book/" class="lang-btn en-btn">EN</a>');
      html = html.replace(new RegExp('<a href="#" onclick="switchLang\\(\\\'ar\\\'\\); return false;" class="lang-btn ar-btn(?: active)?">AR<\\/a>'), '<a href="/ar/book/" class="lang-btn ar-btn active">AR</a>');
    } else {
      html = html.replace('<head>', `<head>\n    <script>try{localStorage.setItem('vv_language','en')}catch(e){}</script>`);
      html = html.replace(new RegExp('<a href="#" onclick="switchLang\\(\\\'en\\\'\\); return false;" class="lang-btn en-btn(?: active)?">EN<\\/a>'), '<a href="/book/" class="lang-btn en-btn active">EN</a>');
      html = html.replace(new RegExp('<a href="#" onclick="switchLang\\(\\\'ar\\\'\\); return false;" class="lang-btn ar-btn(?: active)?">AR<\\/a>'), '<a href="/ar/book/" class="lang-btn ar-btn">AR</a>');
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(html);
  } catch (error) {
    console.error('book page:', error.message);
    res.status(500).send('Unable to load booking page');
  }
}
app.get(['/book', '/book/'], (_req, res) => renderBookingPage(res, false));
app.get(['/ar/book', '/ar/book/'], (_req, res) => renderBookingPage(res, true));
'''
p.write_text(s[:start] + route + s[end:])
