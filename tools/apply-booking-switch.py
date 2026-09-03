from pathlib import Path

server = Path('server/index.js')
text = server.read_text(encoding='utf-8')
health = "app.get('/api/health',(_req,res)=>res.json({ok:true,database:!!pool}));"
route = """// Public booking UI configuration. Only non-sensitive values are exposed.
app.get('/api/booking-config', async (_req, res) => {
  const fallback = { source: 'internal', digitail_clinic_slug: 'vetsvan-01-5519deb-ryd' };
  res.set('Cache-Control', 'no-store');
  if (!pool) return res.json(fallback);
  try {
    const rows = (await query(\"SELECT key,value FROM site_settings WHERE key IN ('booking_source','digitail_clinic_slug')\")).rows;
    const settings = Object.fromEntries(rows.map(row => [row.key, row.value]));
    res.json({
      source: settings.booking_source === 'digitail' ? 'digitail' : 'internal',
      digitail_clinic_slug: settings.digitail_clinic_slug || fallback.digitail_clinic_slug
    });
  } catch (error) {
    console.error('booking-config:', error.message);
    res.json(fallback);
  }
});"""
if '/api/booking-config' not in text:
    if health not in text:
        raise SystemExit('Could not find health route anchor in server/index.js')
    text = text.replace(health, health + '\n' + route, 1)
    server.write_text(text, encoding='utf-8')

page = Path('index.html')
html = page.read_text(encoding='utf-8')
script = '    <script src="/booking-source.js" defer></script>\n'
if '/booking-source.js' not in html:
    if '</body>' not in html:
        raise SystemExit('Could not find </body> in index.html')
    html = html.replace('</body>', script + '</body>', 1)
    page.write_text(html, encoding='utf-8')
