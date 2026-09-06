from pathlib import Path
import re

ROOT = Path('.')
SNAP = 'https://www.snapchat.com/@vetsvan'
TODAY = '2026-09-06'

# Full-layout pages: social footer cleanup + schema social profile.
full_pages = [
    Path('index.html'), Path('about/index.html'), Path('contact/index.html'), Path('services/index.html'),
    Path('ar/index.html'), Path('ar/about/index.html'), Path('ar/contact/index.html'), Path('ar/services/index.html'),
]
for p in full_pages:
    s = p.read_text(encoding='utf-8')
    s = re.sub(r'<a\s+href=["\']#["\']\s+target=["\']_blank["\']\s+aria-label=["\']Snapchat["\']>', f'<a href="{SNAP}" target="_blank" rel="noopener noreferrer" aria-label="Snapchat">', s)
    s = re.sub(r'\s*<a\s+href=["\']#["\']\s+target=["\']_blank["\']\s+aria-label=["\']X["\']>[\s\S]*?</a>', '', s)
    # Add Snapchat to JSON-LD sameAs where that array is present.
    s = s.replace('"sameAs":["https://www.instagram.com/vets_van/","https://www.tiktok.com/@vetsvan"]',
                  '"sameAs":["https://www.instagram.com/vets_van/","https://www.tiktok.com/@vetsvan","https://www.snapchat.com/@vetsvan"]')
    p.write_text(s, encoding='utf-8')

# Dedicated service detail pages: fix markup and complete share metadata.
service_pairs = [
    ('vaccinations', 'Pet Vaccinations in Riyadh | VETS VAN', 'Mobile pet vaccination visits in Riyadh for cats and dogs with VETS VAN.', 'تطعيمات الحيوانات الأليفة في الرياض | VETS VAN', 'زيارات تطعيم منزلية للقطط والكلاب في الرياض مع VETS VAN، مع تقييم بيطري ومراجعة سجل التطعيمات والتوصيات المناسبة.'),
    ('dental-cleaning', 'Pet Dental Cleaning in Riyadh | VETS VAN', 'Professional pet dental cleaning and oral care services in Riyadh with VETS VAN mobile veterinary care.', 'تنظيف أسنان الحيوانات الأليفة في الرياض | VETS VAN', 'خدمات العناية وتنظيف أسنان القطط والكلاب في الرياض مع VETS VAN، مع تقييم بيطري وخطة مناسبة لصحة الفم والأسنان.'),
    ('diagnostic-imaging', 'Veterinary Diagnostic Imaging in Riyadh | VETS VAN', 'Mobile veterinary diagnostic imaging support in Riyadh with VETS VAN.', 'التصوير التشخيصي البيطري في الرياض | VETS VAN', 'خدمات تصوير تشخيصي بيطري متنقلة في الرياض تساعد الطبيب على تقييم الحالة وتحديد الخطوة المناسبة.'),
    ('pet-travel-certificate', 'Pet Travel Certificates in Riyadh | VETS VAN', 'Veterinary health and pet travel certificate support in Riyadh with VETS VAN.', 'شهادات وإجراءات سفر الحيوانات الأليفة في الرياض | VETS VAN', 'دعم الفحوصات البيطرية والشهادات الصحية وإجراءات سفر الحيوانات الأليفة في الرياض مع VETS VAN.'),
]

def ensure_social_meta(html, title, desc, url):
    # Insert before the first JSON-LD script or before </head>.
    tags = (
        f'<meta property="og:type" content="website">'
        f'<meta property="og:site_name" content="VETS VAN">'
        f'<meta property="og:title" content="{title}">'
        f'<meta property="og:description" content="{desc}">'
        f'<meta property="og:url" content="{url}">'
        f'<meta property="og:image" content="https://www.vetsvan.com/clinic-van.webp">'
        f'<meta name="twitter:card" content="summary_large_image">'
        f'<meta name="twitter:title" content="{title}">'
        f'<meta name="twitter:description" content="{desc}">'
        f'<meta name="twitter:image" content="https://www.vetsvan.com/clinic-van.webp">'
    )
    # Remove existing OG/Twitter tags so we end with one complete consistent set.
    html = re.sub(r'<meta\s+(?:property=["\']og:[^"\']+["\']|name=["\']twitter:[^"\']+["\'])\s+content=["\'][^"\']*["\']\s*/?>', '', html, flags=re.I)
    marker = '<script type="application/ld+json">'
    if marker in html:
        html = html.replace(marker, tags + marker, 1)
    else:
        html = html.replace('</head>', tags + '</head>', 1)
    return html

for slug, en_title, en_desc, ar_title, ar_desc in service_pairs:
    en = Path(f'services/{slug}/index.html')
    s = en.read_text(encoding='utf-8')
    s = s.replace('</header></div><main>', '</div></header><main>')
    s = ensure_social_meta(s, en_title, en_desc, f'https://www.vetsvan.com/services/{slug}/')
    en.write_text(s, encoding='utf-8')

    ar = Path(f'ar/services/{slug}/index.html')
    s = ar.read_text(encoding='utf-8')
    s = ensure_social_meta(s, ar_title, ar_desc, f'https://www.vetsvan.com/ar/services/{slug}/')
    ar.write_text(s, encoding='utf-8')

# Keep sitemap dates aligned with this actual content update.
sitemap = Path('sitemap.xml')
s = sitemap.read_text(encoding='utf-8')
s = re.sub(r'<lastmod>\d{4}-\d{2}-\d{2}</lastmod>', f'<lastmod>{TODAY}</lastmod>', s)
sitemap.write_text(s, encoding='utf-8')

# Keep admin out of search indexing.
robots = Path('robots.txt')
r = robots.read_text(encoding='utf-8')
if 'Disallow: /admin/' not in r:
    r = r.replace('Allow: /', 'Allow: /\nDisallow: /admin/')
robots.write_text(r, encoding='utf-8')

login = Path('admin/login.html')
s = login.read_text(encoding='utf-8')
if 'name="robots"' not in s:
    s = s.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow">')
login.write_text(s, encoding='utf-8')

# Security hardening: trust Render's first proxy hop and use Express' parsed client IP.
server = Path('server/index.js')
s = server.read_text(encoding='utf-8')
if "app.set('trust proxy', 1);" not in s:
    s = s.replace("const PORT = process.env.PORT || 5000;", "const PORT = process.env.PORT || 5000;\napp.set('trust proxy', 1);")
s = s.replace("const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').toString().split(',')[0].trim();", "const ip=String(req.ip || req.socket.remoteAddress || 'unknown');")
# Prevent all admin responses from being indexed, including /admin itself.
needle = "app.use((req,res,next)=>req.path.startsWith('/admin')?next():express.static(path.join(__dirname,'..'))(req,res,next));"
replacement = "app.use((req,res,next)=>{ if(req.path.startsWith('/admin')) res.setHeader('X-Robots-Tag','noindex, nofollow'); next(); });\n" + needle
if "X-Robots-Tag','noindex, nofollow" not in s:
    s = s.replace(needle, replacement)
server.write_text(s, encoding='utf-8')
