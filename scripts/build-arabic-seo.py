from pathlib import Path
import re

ROOT = 'https://www.vetsvan.com'

def add_hreflang(html, en_url, ar_url):
    html = re.sub(r'\s*<link rel="alternate" hreflang="(?:en|ar|x-default)"[^>]*>', '', html)
    block = (f'\n<link rel="alternate" hreflang="en" href="{en_url}">'
             f'\n<link rel="alternate" hreflang="ar" href="{ar_url}">'
             f'\n<link rel="alternate" hreflang="x-default" href="{en_url}">')
    m = re.search(r'<link rel="canonical"[^>]*>', html, re.I)
    if not m:
        raise SystemExit(f'Canonical not found for {en_url}')
    return html[:m.end()] + block + html[m.end():]

def set_meta(html, title, desc, canonical):
    html = re.sub(r'<title>[\s\S]*?</title>', f'<title>{title}</title>', html, count=1, flags=re.I)
    html = re.sub(r'<meta\s+name=["\']description["\'][^>]*>', f'<meta name="description" content="{desc}">', html, count=1, flags=re.I)
    html = re.sub(r'<link\s+rel=["\']canonical["\'][^>]*>', f'<link rel="canonical" href="{canonical}">', html, count=1, flags=re.I)
    for prop, value in [('og:title', title), ('og:description', desc), ('og:url', canonical)]:
        pat = rf'<meta\s+property=["\']{re.escape(prop)}["\'][^>]*>'
        if re.search(pat, html, re.I):
            html = re.sub(pat, f'<meta property="{prop}" content="{value}">', html, count=1, flags=re.I)
    for name, value in [('twitter:title', title), ('twitter:description', desc)]:
        pat = rf'<meta\s+name=["\']{re.escape(name)}["\'][^>]*>'
        if re.search(pat, html, re.I):
            html = re.sub(pat, f'<meta name="{name}" content="{value}">', html, count=1, flags=re.I)
    return html

def replace_switcher(html, en_path, ar_path, lang):
    html = re.sub(r'<a href="#" onclick="switchLang\(\'en\'\); return false;" class="lang-btn en-btn(?: active)?">EN</a>',
                  f'<a href="{en_path}" class="lang-btn en-btn{" active" if lang == "en" else ""}">EN</a>', html)
    html = re.sub(r'<a href="#" onclick="switchLang\(\'ar\'\); return false;" class="lang-btn ar-btn(?: active)?">AR</a>',
                  f'<a href="{ar_path}" class="lang-btn ar-btn{" active" if lang == "ar" else ""}">AR</a>', html)
    return html

def lock_lang(html, lang):
    marker = f"<script>try{{localStorage.setItem('vv_language','{lang}')}}catch(e){{}}</script>"
    if marker not in html:
        html = html.replace('<head>', '<head>\n' + marker, 1)
    return html

def arabize_links(html):
    replacements = [
        ('href="/book/"', 'href="/ar/book/"'),
        ('href="/services/', 'href="/ar/services/'),
        ('href="/about/"', 'href="/ar/about/"'),
        ('href="/contact/"', 'href="/ar/contact/"'),
        ("window.location.href='/services/", "window.location.href='/ar/services/"),
        ('href="/"', 'href="/ar/"'),
    ]
    for old, new in replacements:
        html = html.replace(old, new)
    return html

# English top-level pages: canonical language switch + hreflang.
top = {
    'index.html': ('/', '/ar/'),
    'services/index.html': ('/services/', '/ar/services/'),
    'about/index.html': ('/about/', '/ar/about/'),
    'contact/index.html': ('/contact/', '/ar/contact/'),
}
for fp, (en_path, ar_path) in top.items():
    p = Path(fp)
    html = p.read_text()
    html = add_hreflang(html, ROOT + en_path, ROOT + ar_path)
    html = replace_switcher(html, en_path, ar_path, 'en')
    html = lock_lang(html, 'en')
    p.write_text(html)

# Arabic top-level pages generated from the same design/content source.
ar_meta = {
    'ar/index.html': ('index.html', 'عيادة بيطرية متنقلة في الرياض | VETS VAN', 'رعاية بيطرية متنقلة للحيوانات الأليفة في الرياض تشمل الفحوصات والتطعيمات والتشخيص والعناية بالأسنان وخدمات السفر.', '/', '/ar/'),
    'ar/services/index.html': ('services/index.html', 'الخدمات البيطرية المتنقلة في الرياض | VETS VAN', 'استكشف خدمات VETS VAN البيطرية المتنقلة في الرياض، بما في ذلك الفحوصات والتطعيمات والتحاليل والأسنان والتصوير التشخيصي وشهادات السفر.', '/services/', '/ar/services/'),
    'ar/about/index.html': ('about/index.html', 'عن VETS VAN | رعاية بيطرية متنقلة في الرياض', 'تعرف على VETS VAN وعياداتنا البيطرية المتنقلة العاملة بالطاقة الشمسية وشراكاتنا وخبراتنا في تقديم الرعاية للحيوانات الأليفة في الرياض.', '/about/', '/ar/about/'),
    'ar/contact/index.html': ('contact/index.html', 'تواصل مع VETS VAN | طبيب بيطري متنقل في الرياض', 'تواصل مع فريق VETS VAN في الرياض للاستفسار عن الرعاية البيطرية المتنقلة أو المساعدة في الحجز واختيار الخدمة المناسبة.', '/contact/', '/ar/contact/'),
}
for out, (src, title, desc, en_path, ar_path) in ar_meta.items():
    html = Path(src).read_text()
    if out == 'ar/index.html':
        html = re.sub(r'\s*<main id="book" class="page">[\s\S]*?</main>\s*', '\n', html, count=1, flags=re.I)
    html = re.sub(r'<html\s+lang="en"(?:\s+dir="ltr")?>', '<html lang="ar" dir="rtl">', html, count=1, flags=re.I)
    html = set_meta(html, title, desc, ROOT + ar_path)
    html = add_hreflang(html, ROOT + en_path, ROOT + ar_path)
    html = arabize_links(html)
    html = replace_switcher(html, en_path, ar_path, 'ar')
    html = lock_lang(html, 'ar')
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(html)

# Service detail Arabic pages + hreflang/language link on English counterparts.
services = {
    'vaccinations': {
        'en_title': 'Pet Vaccinations in Riyadh | VETS VAN',
        'ar_title': 'تطعيمات الحيوانات الأليفة في الرياض | VETS VAN',
        'desc': 'زيارات تطعيم منزلية للقطط والكلاب في الرياض مع VETS VAN، مع تقييم بيطري ومراجعة سجل التطعيمات والتوصيات المناسبة.',
        'eyebrow': 'رعاية بيطرية متنقلة • الرياض',
        'h1': 'تطعيمات حيوانك الأليف حتى باب البيت.',
        'lead': 'توفر VETS VAN زيارات تطعيم مجدولة للقطط والكلاب في أنحاء الرياض لتسهيل الرعاية الوقائية وتقليل التوتر المرتبط بالذهاب إلى العيادة.',
        'cta': 'احجز زيارة تطعيم',
        'section': 'ما الذي قد تتضمنه الزيارة؟',
        'cards': [('مراجعة الحالة الصحية','يقوم الطبيب البيطري بتقييم الحالة العامة للتأكد من ملاءمة الحيوان للتطعيم أثناء الزيارة.'),('اللقاحات الأساسية والوقائية','تختلف توصيات اللقاحات حسب العمر والتاريخ الصحي ونمط الحياة وتقييم الطبيب البيطري.'),('مراجعة سجل التطعيمات','يفضل تجهيز سجل التطعيمات السابق لمراجعة الجرعات السابقة ومواعيدها.'),('راحة الزيارة المنزلية','تتم الزيارة من خلال خدمة VETS VAN البيطرية المتنقلة داخل الرياض.')]
    },
    'dental-cleaning': {
        'ar_title': 'تنظيف أسنان الحيوانات الأليفة في الرياض | VETS VAN',
        'desc': 'خدمة العناية وتنظيف أسنان الحيوانات الأليفة في الرياض مع VETS VAN، مع تقييم صحة الفم والأسنان وتحديد الخطوة البيطرية المناسبة.',
        'eyebrow': 'العناية بصحة الفم والأسنان • الرياض',
        'h1': 'عناية أفضل بصحة فم وأسنان حيوانك الأليف.',
        'lead': 'تساعد العناية الدورية بالأسنان على اكتشاف مشاكل الفم مبكراً والحفاظ على راحة الحيوان وصحته العامة.',
        'cta': 'احجز خدمة الأسنان',
        'section': 'ما الذي تتم مراجعته؟',
        'cards': [('فحص الفم والأسنان','تقييم حالة الأسنان واللثة ووجود الجير أو علامات الالتهاب.'),('خطة العناية','يحدد الطبيب الخطوة المناسبة حسب حالة الحيوان واحتياجاته.'),('التاريخ الصحي','تتم مراجعة العمر والحالة الصحية وأي معلومات طبية مهمة قبل الإجراء.'),('متابعة ما بعد الخدمة','يتم توضيح إرشادات العناية المنزلية والمتابعة عند الحاجة.')]
    },
    'diagnostic-imaging': {
        'ar_title': 'الأشعة والتصوير التشخيصي للحيوانات في الرياض | VETS VAN',
        'desc': 'خدمات التصوير والتشخيص البيطري للحيوانات الأليفة في الرياض من VETS VAN لدعم تقييم الحالة ووضع الخطة العلاجية المناسبة.',
        'eyebrow': 'التصوير والتشخيص البيطري • الرياض',
        'h1': 'تصوير تشخيصي لدعم تقييم حالة حيوانك الأليف.',
        'lead': 'يساعد التصوير التشخيصي الطبيب البيطري في فهم الحالة بصورة أدق وتحديد الخطوات المناسبة حسب الأعراض والفحص السريري.',
        'cta': 'احجز موعد تشخيص',
        'section': 'كيف تساعد الخدمة؟',
        'cards': [('تقييم الحالة','يتم ربط نتائج التصوير بالأعراض والفحص السريري للحيوان.'),('اختيار الفحص المناسب','نوع التصوير المطلوب يختلف حسب المنطقة والحالة وتوصية الطبيب.'),('دعم التشخيص','تساعد الصور في توجيه التشخيص والخطة العلاجية أو الحاجة إلى فحوص إضافية.'),('الإحالة عند الحاجة','الحالات التي تحتاج تجهيزات أو رعاية متقدمة يمكن إحالتها عبر شبكة الشركاء البيطريين.')]
    },
    'pet-travel-certificate': {
        'ar_title': 'شهادة سفر الحيوانات الأليفة في الرياض | VETS VAN',
        'desc': 'خدمات فحص وشهادات سفر الحيوانات الأليفة في الرياض مع VETS VAN، مع مراجعة المتطلبات الصحية التي تختلف حسب الوجهة وموعد السفر.',
        'eyebrow': 'إجراءات سفر الحيوانات الأليفة • الرياض',
        'h1': 'استعد لسفر حيوانك الأليف بخطوات أوضح.',
        'lead': 'تساعد VETS VAN في الفحص البيطري ومراجعة المتطلبات الصحية المرتبطة بالسفر، مع مراعاة اختلاف المتطلبات حسب الدولة والوجهة وتاريخ الرحلة.',
        'cta': 'احجز موعد إجراءات السفر',
        'section': 'قبل موعد السفر',
        'cards': [('مراجعة الوجهة','تختلف المتطلبات الصحية والوثائق المطلوبة من دولة إلى أخرى.'),('سجل التطعيمات','يجب مراجعة اللقاحات وتواريخها وأي متطلبات مرتبطة بالسفر.'),('الفحص البيطري','قد تتطلب إجراءات السفر فحصاً صحياً قبل إصدار المستندات المطلوبة.'),('التخطيط المبكر','بعض الإجراءات تحتاج وقتاً قبل السفر، لذلك يفضل البدء مبكراً قدر الإمكان.')]
    },
}

# Read English titles/descriptions from existing pages where needed; add alternates and language link.
for slug, data in services.items():
    en_path = f'/services/{slug}/'
    ar_path = f'/ar/services/{slug}/'
    ep = Path(f'services/{slug}/index.html')
    ehtml = ep.read_text()
    ehtml = add_hreflang(ehtml, ROOT + en_path, ROOT + ar_path)
    header_pat = r'(<header class="top"><a href="/"><img class="logo"[^>]*></a>)(<a class="btn" href="/book/">Book Now</a></header>)'
    ehtml = re.sub(header_pat, rf'\1<div style="display:flex;gap:10px;align-items:center"><a href="{ar_path}" style="font-family:Cairo,sans-serif;font-weight:700">العربية</a>\2</div>', ehtml, count=1)
    ep.write_text(ehtml)

    cards = ''.join(f'<div class="mini"><h3>{h}</h3><p>{p}</p></div>' for h,p in data['cards'])
    schema_name = data['ar_title'].split(' | ')[0]
    ahtml = f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{data['ar_title']}</title><meta name="description" content="{data['desc']}"><link rel="canonical" href="{ROOT + ar_path}"><link rel="alternate" hreflang="en" href="{ROOT + en_path}"><link rel="alternate" hreflang="ar" href="{ROOT + ar_path}"><link rel="alternate" hreflang="x-default" href="{ROOT + en_path}"><link rel="icon" href="/Icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/services/service-page.css"><style>body{{font-family:'Cairo',sans-serif;direction:rtl;text-align:right}}</style><meta property="og:type" content="website"><meta property="og:site_name" content="VETS VAN"><meta property="og:title" content="{data['ar_title']}"><meta property="og:description" content="{data['desc']}"><meta property="og:url" content="{ROOT + ar_path}"><meta property="og:image" content="{ROOT}/clinic-van.webp"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">{{"@context":"https://schema.org","@type":"Service","name":"{schema_name}","inLanguage":"ar","provider":{{"@type":"VeterinaryCare","name":"VETS VAN","url":"{ROOT}/ar/"}},"areaServed":"الرياض"}}</script></head><body><div class="wrap"><header class="top"><a href="/ar/"><img class="logo" src="/Vets_van_logo_png.png" alt="VETS VAN"></a><div style="display:flex;gap:10px;align-items:center"><a href="{en_path}" style="font-family:Inter,sans-serif;font-weight:700">EN</a><a class="btn" href="/ar/book/">احجز الآن</a></div></header><main><section class="hero"><div class="eyebrow">{data['eyebrow']}</div><h1>{data['h1']}</h1><p class="lead">{data['lead']}</p><a class="btn" href="/ar/book/">{data['cta']}</a></section><section class="card"><h2>{data['section']}</h2><div class="grid">{cards}</div></section></main><footer class="footer">VETS VAN • الرياض، المملكة العربية السعودية • +966920011626</footer></div></body></html>'''
    ap = Path(f'ar/services/{slug}/index.html')
    ap.parent.mkdir(parents=True, exist_ok=True)
    ap.write_text(ahtml)

# Booking-source supports the Arabic canonical booking path.
bp = Path('booking-source.js')
b = bp.read_text()
b = b.replace("if (cleanPath === '/book') {", "if (['/book', '/ar/book'].includes(cleanPath)) {")
bp.write_text(b)

# Replace booking route with shared English/Arabic renderer.
sp = Path('server/index.js')
sv = sp.read_text()
start = sv.index('// Dedicated indexable booking URL.')
end = sv.index('\nbootstrap().then', start)
new_route = r'''// Dedicated indexable booking URLs. Reuse the single existing booking UI and logic.
async function renderBookingPage(res, arabic = false) {
  try {
    let html = await fs.readFile(path.join(__dirname, '..', 'index.html'), 'utf8');
    for (const pageId of ['home', 'services', 'about', 'contact']) {
      html = html.replace(new RegExp(`<main id=[\\"']${pageId}[\\"'][^>]*>[\\s\\S]*?<\\/main>`, 'i'), '');
    }
    if (!/<base\\s/i.test(html)) html = html.replace(/<head>/i, '<head>\n    <base href="/">');
    const title = arabic ? 'احجز طبيب بيطري متنقل في الرياض | VETS VAN' : 'Book a Mobile Vet Visit in Riyadh | VETS VAN';
    const description = arabic ? 'احجز زيارة بيطرية متنقلة من VETS VAN داخل الرياض. يتم تحديث توفر المواعيد ومصدر الحجز مباشرة من العيادة.' : 'Book a VETS VAN mobile veterinary visit in Riyadh. Appointment availability and booking source are managed live by the clinic.';
    const canonical = arabic ? 'https://www.vetsvan.com/ar/book/' : 'https://www.vetsvan.com/book/';
    const enCanonical = 'https://www.vetsvan.com/book/';
    const arCanonical = 'https://www.vetsvan.com/ar/book/';
    html = html.replace(/<title>[\\s\\S]*?<\\/title>/i, `<title>${title}</title>`);
    html = html.replace(/<meta\\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${description}">`);
    html = html.replace(/<link\\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}">\n    <link rel="alternate" hreflang="en" href="${enCanonical}">\n    <link rel="alternate" hreflang="ar" href="${arCanonical}">\n    <link rel="alternate" hreflang="x-default" href="${enCanonical}">`);
    html = html.replace(/<meta\\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${title}">`);
    html = html.replace(/<meta\\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${description}">`);
    html = html.replace(/<meta\\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${canonical}">`);
    html = html.replace(/<meta\\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${title}">`);
    html = html.replace(/<meta\\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${description}">`);
    if (arabic) {
      html = html.replace(/<html lang="en" dir="ltr">/i, '<html lang="ar" dir="rtl">');
      html = html.replace('<head>', `<head>\n    <script>try{localStorage.setItem('vv_language','ar')}catch(e){}</script>`);
      html = html.replaceAll('href="/services/', 'href="/ar/services/').replaceAll('href="/about/"', 'href="/ar/about/"').replaceAll('href="/contact/"', 'href="/ar/contact/"').replaceAll('href="/book/"', 'href="/ar/book/"');
      html = html.replace('<a href="/" class="logo">', '<a href="/ar/" class="logo">');
      html = html.replace('<a href="/" class="active-link">', '<a href="/ar/" class="active-link">');
      html = html.replace(/<a href="#" onclick="switchLang\\('en'\\); return false;" class="lang-btn en-btn(?: active)?">EN<\\/a>/, '<a href="/book/" class="lang-btn en-btn">EN</a>');
      html = html.replace(/<a href="#" onclick="switchLang\\('ar'\\); return false;" class="lang-btn ar-btn(?: active)?">AR<\\/a>/, '<a href="/ar/book/" class="lang-btn ar-btn active">AR</a>');
    } else {
      html = html.replace('<head>', `<head>\n    <script>try{localStorage.setItem('vv_language','en')}catch(e){}</script>`);
      html = html.replace(/<a href="#" onclick="switchLang\\('en'\\); return false;" class="lang-btn en-btn(?: active)?">EN<\\/a>/, '<a href="/book/" class="lang-btn en-btn active">EN</a>');
      html = html.replace(/<a href="#" onclick="switchLang\\('ar'\\); return false;" class="lang-btn ar-btn(?: active)?">AR<\\/a>/, '<a href="/ar/book/" class="lang-btn ar-btn">AR</a>');
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
sv = sv[:start] + new_route + sv[end:]
sp.write_text(sv)

# Sitemap: append Arabic URLs and refresh current changed dates.
smp = Path('sitemap.xml')
sm = smp.read_text()
ar_urls = ['/ar/','/ar/services/','/ar/about/','/ar/contact/','/ar/book/'] + [f'/ar/services/{s}/' for s in services]
for path in ar_urls:
    url = ROOT + path
    if f'<loc>{url}</loc>' not in sm:
        priority = '1.0' if path == '/ar/' else ('0.9' if path in ['/ar/services/','/ar/book/'] else '0.8')
        entry = f'  <url><loc>{url}</loc><lastmod>2026-09-06</lastmod><changefreq>monthly</changefreq><priority>{priority}</priority></url>\n'
        sm = sm.replace('</urlset>', entry + '</urlset>')
smp.write_text(sm)
