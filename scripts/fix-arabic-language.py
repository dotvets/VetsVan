from pathlib import Path
import re

# Fix generated Arabic top-level pages: one Arabic lock only + canonical language switcher.
page_map = {
    'ar/index.html': ('/', '/ar/'),
    'ar/services/index.html': ('/services/', '/ar/services/'),
    'ar/about/index.html': ('/about/', '/ar/about/'),
    'ar/contact/index.html': ('/contact/', '/ar/contact/'),
}
for fp, (en_path, ar_path) in page_map.items():
    p = Path(fp)
    s = p.read_text()
    s = s.replace("<script>try{localStorage.setItem('vv_language','en')}catch(e){}</script>\n", '')
    if "localStorage.setItem('vv_language','ar')" not in s:
        s = s.replace('<head>', "<head>\n<script>try{localStorage.setItem('vv_language','ar')}catch(e){}</script>", 1)
    s = re.sub(r'<a href="[^"]*" class="lang-btn en-btn(?: active)?">EN</a>', f'<a href="{en_path}" class="lang-btn en-btn">EN</a>', s, count=1)
    s = re.sub(r'<a href="[^"]*" class="lang-btn ar-btn(?: active)?">AR</a>', f'<a href="{ar_path}" class="lang-btn ar-btn active">AR</a>', s, count=1)
    p.write_text(s)

# Localize Arabic homepage structured data URL and service names.
p = Path('ar/index.html')
s = p.read_text()
s = s.replace('"url":"https://www.vetsvan.com/"', '"url":"https://www.vetsvan.com/ar/"', 1)
for en, ar in [
    ('Wellness Exams','فحوصات العافية'),('Vaccinations','التطعيمات'),('Diagnostic Lab Tests','التحاليل التشخيصية'),
    ('Dental Care','العناية بالأسنان'),('Diagnostic Imaging','التصوير التشخيصي'),('Health & Travel Certificates','الشهادات الصحية وإجراءات السفر')
]:
    s = s.replace(f'"name":"{en}"', f'"name":"{ar}"', 1)
p.write_text(s)

# Booking route: URL determines language and switcher stays on booking equivalents.
p = Path('server/index.js')
s = p.read_text()
s = s.replace("html = html.replace('<head>', `<head>\\n    <script>try{localStorage.setItem('vv_language','ar')}catch(e){}</script>`);",
              "html = html.replace(\"<script>try{localStorage.setItem('vv_language','en')}catch(e){}</script>\", \"<script>try{localStorage.setItem('vv_language','ar')}catch(e){}</script>\");")
s = s.replace("html = html.replace('<head>', `<head>\\n    <script>try{localStorage.setItem('vv_language','en')}catch(e){}</script>`);",
              "if (!html.includes(\"localStorage.setItem('vv_language','en')\")) html = html.replace('<head>', `<head>\\n    <script>try{localStorage.setItem('vv_language','en')}catch(e){}</script>`);")
# Replace switcher regexes with href-agnostic versions.
s = re.sub(r"html = html\.replace\(new RegExp\('<a href=\"#\" onclick=.*?EN<\\\\/a>'\), '<a href=\"/book/\" class=\"lang-btn en-btn\">EN</a>'\);",
           "html = html.replace(new RegExp('<a href=\"[^\"]*\" class=\"lang-btn en-btn(?: active)?\">EN<\\/a>'), '<a href=\"/book/\" class=\"lang-btn en-btn\">EN</a>');", s)
s = re.sub(r"html = html\.replace\(new RegExp\('<a href=\"#\" onclick=.*?AR<\\\\/a>'\), '<a href=\"/ar/book/\" class=\"lang-btn ar-btn active\">AR</a>'\);",
           "html = html.replace(new RegExp('<a href=\"[^\"]*\" class=\"lang-btn ar-btn(?: active)?\">AR<\\/a>'), '<a href=\"/ar/book/\" class=\"lang-btn ar-btn active\">AR</a>');", s)
# English branch variants.
s = re.sub(r"html = html\.replace\(new RegExp\('<a href=\"#\" onclick=.*?EN<\\\\/a>'\), '<a href=\"/book/\" class=\"lang-btn en-btn active\">EN</a>'\);",
           "html = html.replace(new RegExp('<a href=\"[^\"]*\" class=\"lang-btn en-btn(?: active)?\">EN<\\/a>'), '<a href=\"/book/\" class=\"lang-btn en-btn active\">EN</a>');", s)
s = re.sub(r"html = html\.replace\(new RegExp\('<a href=\"#\" onclick=.*?AR<\\\\/a>'\), '<a href=\"/ar/book/\" class=\"lang-btn ar-btn\">AR</a>'\);",
           "html = html.replace(new RegExp('<a href=\"[^\"]*\" class=\"lang-btn ar-btn(?: active)?\">AR<\\/a>'), '<a href=\"/ar/book/\" class=\"lang-btn ar-btn\">AR</a>');", s)
p.write_text(s)
