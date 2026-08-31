// ===== Bevatel WhatsApp booking notifications (VetsVan) =====
// Provider config from Backend ENV only (never frontend/git):
//   BEVATEL_API_TOKEN, BEVATEL_ACCOUNT_ID, BEVATEL_INBOX_ID, BEVATEL_API_URL, BEVATEL_SENDER_NUMBER
// Editable from dashboard (DB site_settings): bevatel_recipient, bevatel_template, bevatel_enabled,
//   wa_notify_new / wa_notify_confirmed / wa_notify_cancelled / wa_notify_rescheduled / wa_notify_payment

const DEFAULT_TEMPLATE = `📢 حجز جديد

تم استلام حجز جديد من الموقع.

👤 بيانات العميل
الاسم: {{customerName}}
رقم الجوال: {{customerPhone}}
البريد الإلكتروني: {{customerEmail}}

📋 بيانات الحجز
رقم الحجز: {{bookingId}}
الخدمة: {{service}}
الفرع: {{branch}}
التاريخ: {{date}}
الوقت: {{time}}

🐾 بيانات الحيوان
الاسم: {{petName}}
النوع: {{petType}}

💰 المبلغ
{{amount}} SAR

💳 حالة الدفع:
{{paymentStatus}}

📝 ملاحظات:
{{notes}}

🔗 تفاصيل الحجز:
{{bookingUrl}}`;

export function bevatelConfigured() {
  return !!(process.env.BEVATEL_API_TOKEN && process.env.BEVATEL_ACCOUNT_ID && process.env.BEVATEL_INBOX_ID);
}

export function bookingVars(b) {
  const site = (process.env.SITE_URL || 'https://www.vetsvan.com').replace(/\/$/, '');
  return {
    customerName: b.customer_name || '',
    customerPhone: b.mobile || '',
    customerEmail: b.email || '—',
    bookingId: b.booking_code || '',
    service: b.service_name_ar || b.service_name || '—',
    branch: b.area || '—',
    date: b.appointment_date ? (b.appointment_date instanceof Date ? b.appointment_date.toISOString().slice(0, 10) : String(b.appointment_date).slice(0, 10)) : '—',
    time: b.appointment_time || '—',
    petName: b.pet_name || '—',
    petType: b.pet_type || '—',
    amount: b.service_price != null ? String(b.service_price) : '—',
    paymentStatus: b.payment_status || 'unpaid',
    notes: b.directions || b.notes || '—',
    bookingUrl: site + '/admin',
  };
}

export function renderTemplate(tpl, vars) {
  return String(tpl || DEFAULT_TEMPLATE).replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '—');
}

export async function getBevatelSettings(query) {
  const rows = (await query("SELECT key,value FROM site_settings WHERE key LIKE 'bevatel_%' OR key LIKE 'wa_notify_%'")).rows;
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    enabled: (s.bevatel_enabled ?? 'on') === 'on',
    // The clinic booking-notification line. The dashboard value stays available
    // for an intentional override, while this is the safe production default.
    recipient: s.bevatel_recipient || process.env.BEVATEL_RECIPIENT_NUMBER || '+966557236631',
    template: s.bevatel_template || DEFAULT_TEMPLATE,
    toggles: {
      new: (s.wa_notify_new ?? '1') === '1',
      confirmed: (s.wa_notify_confirmed ?? '1') === '1',
      cancelled: (s.wa_notify_cancelled ?? '1') === '1',
      rescheduled: (s.wa_notify_rescheduled ?? '1') === '1',
      payment: (s.wa_notify_payment ?? '1') === '1',
    },
  };
}

const BEV_BASE = () => `https://chat.bevatel.com/api/v1/accounts/${process.env.BEVATEL_ACCOUNT_ID}`;
const BEV_HEADERS = () => ({ 'api_access_token': process.env.BEVATEL_API_TOKEN, 'Content-Type': 'application/json' });
const INBOX = () => Number(process.env.BEVATEL_INBOX_ID);

async function bevFetch(path, body) {
  const r = await fetch(BEV_BASE() + path, { method: body ? 'POST' : 'GET', headers: BEV_HEADERS(), body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error('Bevatel HTTP ' + r.status + ': ' + text.slice(0, 200));
  return text;
}

// Chatwoot-style flow: contact → contact_inbox (source_id) → conversation → outgoing message.
async function bevatelSend(recipient, content) {
  const phone = recipient.startsWith('+') ? recipient : '+' + recipient;
  // 1) contact
  let contactId = null;
  try {
    const c = JSON.parse(await bevFetch('/contacts', { phone_number: phone, name: 'VetsVan Notifications' }));
    contactId = c?.payload?.contact?.id || c?.id;
  } catch (e) {
    if (!/already been taken/.test(e.message)) throw e;
  }
  if (!contactId) {
    const s = JSON.parse(await bevFetch('/contacts/search?q=' + encodeURIComponent(phone)));
    contactId = s?.payload?.[0]?.id;
  }
  if (!contactId) throw new Error('Bevatel: contact not found/created');
  // 2) contact_inbox → source_id
  const ci = JSON.parse(await bevFetch(`/contacts/${contactId}/contact_inboxes`, { inbox_id: INBOX() }));
  const sourceId = ci?.source_id || ci?.payload?.source_id;
  if (!sourceId) throw new Error('Bevatel: no source_id for inbox ' + INBOX());
  // 3) conversation
  const conv = JSON.parse(await bevFetch('/conversations', { inbox_id: INBOX(), source_id: sourceId }));
  const convId = conv?.id;
  if (!convId) throw new Error('Bevatel: conversation not created');
  // 4) outgoing message (sent FROM the inbox's WhatsApp number)
  const m = JSON.parse(await bevFetch(`/conversations/${convId}/messages`, { content, message_type: 'outgoing' }));
  if (m?.error) throw new Error('Bevatel: ' + m.error);
  return m;
}

// Core pipeline: dedupe (bookingId + type) → render → send with up to 3 attempts → log.
// NEVER throws — booking flow must not be affected by WhatsApp failures.
export async function notifyWhatsApp(query, booking, type) {
  try {
    const cfg = await getBevatelSettings(query);
    if (!cfg.enabled || !cfg.toggles[type]) return;
    if (!bevatelConfigured()) { console.error('Bevatel env vars missing — notification skipped'); return; }
    const dedupeKey = `${booking.booking_code}-${type.toUpperCase()}`;
    const message = renderTemplate(cfg.template, bookingVars(booking));
    const ins = await query(
      "INSERT INTO whatsapp_logs(booking_code,recipient,message_type,message,status,dedupe_key) VALUES($1,$2,$3,$4,'pending',$5) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id",
      [booking.booking_code, cfg.recipient, type, message, dedupeKey]);
    if (!ins.rows.length) return; // duplicate protection: same event never sent twice
    const logId = ins.rows[0].id;
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await bevatelSend(cfg.recipient, message);
        await query("UPDATE whatsapp_logs SET status='sent', attempts=$1, sent_at=NOW(), error=NULL WHERE id=$2", [attempt, logId]);
        console.log(`Bevatel WhatsApp sent [${type}] for`, booking.booking_code);
        return;
      } catch (e) {
        lastErr = e.message;
        console.error(`Bevatel attempt ${attempt} failed [${type}]:`, e.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
    await query("UPDATE whatsapp_logs SET status='failed', attempts=3, error=$1 WHERE id=$2", [lastErr, logId]);
  } catch (e) { console.error('notifyWhatsApp pipeline error:', e.message); }
}

// Manual retry from dashboard — bypasses dedupe by reusing the existing log row.
export async function retryWhatsApp(query, logId) {
  const r = await query('SELECT * FROM whatsapp_logs WHERE id=$1', [logId]);
  if (!r.rows.length) return { ok: false, error: 'not found' };
  const log = r.rows[0];
  await query("UPDATE whatsapp_logs SET status='pending', error=NULL WHERE id=$1", [logId]);
  try {
    await bevatelSend(log.recipient, log.message);
    await query("UPDATE whatsapp_logs SET status='sent', attempts=attempts+1, sent_at=NOW() WHERE id=$1", [logId]);
    return { ok: true };
  } catch (e) {
    await query('UPDATE whatsapp_logs SET attempts=attempts+1, error=$1 WHERE id=$2', [e.message, logId]);
    await query("UPDATE whatsapp_logs SET status='failed' WHERE id=$1", [logId]);
    return { ok: false, error: e.message };
  }
}

export { DEFAULT_TEMPLATE };
