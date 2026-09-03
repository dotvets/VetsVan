from pathlib import Path
import re

root = Path('index.html').read_text()
style = re.search(r'<style>(.*?)</style>', root, re.S).group(1)
header = re.search(r'(<header.*?</header>)', root, re.S).group(1)
footer = re.search(r'(<footer.*?</footer>)', root, re.S).group(1)

pages = {
    'services': {
        'title': 'Mobile Veterinary Services in Riyadh | VETS VAN',
        'desc': 'Explore VETS VAN mobile veterinary services in Riyadh, including wellness exams, vaccinations, lab tests, dental care, imaging and travel certificates.',
        'canonical': 'https://www.vetsvan.com/services/',
    },
    'about': {
        'title': 'About VETS VAN | Mobile Veterinary Care in Riyadh',
        'desc': 'Learn about VETS VAN, our solar-powered mobile veterinary clinics, veterinary partnerships and expert care across Riyadh.',
        'canonical': 'https://www.vetsvan.com/about/',
    },
    'contact': {
        'title': 'Contact VETS VAN | Mobile Vet Riyadh',
        'desc': 'Contact VETS VAN in Riyadh for mobile veterinary care, booking assistance and pet care enquiries.',
        'canonical': 'https://www.vetsvan.com/contact/',
    },
}

# Convert SPA-only nav actions to real URLs while preserving exact classes and markup.
def real_nav(html):
    replacements = {
        "href=\"#\" onclick=\"navTo('home')\"": 'href=\"/\"',
        "href=\"#\" onclick=\"navTo('services')\"": 'href=\"/services/\"',
        "href=\"#\" onclick=\"navTo('about')\"": 'href=\"/about/\"',
        "href=\"#\" onclick=\"navTo('contact')\"": 'href=\"/contact/\"',
        "href=\"#\" onclick=\"navTo('book')\"": 'href=\"/#book\"',
    }
    for a,b in replacements.items():
        html = html.replace(a,b)
    return html

header2 = real_nav(header)
footer2 = real_nav(footer)

# Keep language switcher behavior, but do not include SPA navigation code.
lang_js = '''
<script>
function applyLanguage(lang, persist=true){
  const safe = lang === 'ar' ? 'ar' : 'en';
  document.documentElement.lang=safe;
  document.documentElement.dir=safe==='ar'?'rtl':'ltr';
  document.querySelectorAll('.lang-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.'+safe+'-btn').forEach(b=>b.classList.add('active'));
  if(persist){try{localStorage.setItem('vv_language',safe)}catch(_){}}
}
function switchLang(lang){applyLanguage(lang,true)}
document.addEventListener('DOMContentLoaded',()=>{
  let saved='en'; try{saved=localStorage.getItem('vv_language')||'en'}catch(_){}
  applyLanguage(saved==='ar'?'ar':'en',false);
  document.querySelectorAll('.reveal').forEach(el=>el.classList.add('active'));
});
function toggleMenu(){document.getElementById('navLinks')?.classList.toggle('show')}
</script>
'''

for pid, meta in pages.items():
    # Extract the exact old page main from the source homepage.
    m = re.search(rf'(<main id=\"{pid}\" class=\"page\">.*?</main>)', root, re.S)
    if not m:
        raise SystemExit(f'Could not find {pid} main')
    main = real_nav(m.group(1))
    # Force standalone page visible while retaining all original page styling.
    main = main.replace(f'<main id=\"{pid}\" class=\"page\">', f'<main id=\"{pid}\" class=\"page active\">', 1)
    # Fix any root-relative asset references that are already fine; preserve original content.
    doc = f'''<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{meta['title']}</title>
<meta name="description" content="{meta['desc']}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="{meta['canonical']}">
<link rel="icon" type="image/png" href="/Icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>{style}\n.page{{display:none}} .page.active{{display:block}}</style>
</head>
<body>
{header2}
{main}
{footer2}
{lang_js}
</body>
</html>'''
    Path(pid, 'index.html').write_text(doc)

print('restored standalone pages from original site sections')
