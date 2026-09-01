// ===== WhatsApp integration (VetsVan) — Meta Cloud API =====
// Configuration comes from DASHBOARD settings stored in the DB (site_settings):
//   whatsapp_token (secret — never returned to the frontend), whatsapp_phone_id,
//   whatsapp_sender, whatsapp_recipient
// Fallback: env vars WHATSAPP_TOKEN / WHATSAPP_PHONE_ID / WHATSAPP_ADMIN_NUMBERS
// The token is ONLY used server-side. Never logged, never sent to clients.

export const WA_SENDER_DISPLAY = '+966920011626';
// Default only; admins can change the recipient from the dashboard settings.
export const WA_DEFAULT_RECIPIENT = '966557236631';
export const WA_DEFAULT_PHONE_ID = '107736745614392'; // phone_number_id of +966920011626 (discovered via Graph API)

export async function getWaConfig(query) {
  const rows = (await query("SELECT key,value FROM site_settings WHERE key IN ('whatsapp_token','whatsapp_phone_id','whatsapp_recipient')")).rows;
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const token = s.whatsapp_token || process.env.WHATSAPP_TOKEN || '';
  const phoneId = s.whatsapp_phone_id || process.env.WHATSAPP_PHONE_ID || WA_DEFAULT_PHONE_ID;
  const recipient = s.whatsapp_recipient || (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',')[0] || WA_DEFAULT_RECIPIENT;
  return { token, phoneId, recipient, configured: !!(token && phoneId) };
}

export function bookingDetailsText(b) {
  const L = [];
  L.push('🔔 حجز جديد — VetsVan');
  L.push('------------------------------');
  L.push(`رقم الحجز: ${b.booking_code}`);
  L.push(`صاحب الحجز: ${b.customer_name || ''}`);
  L.push(`الجوال: ${b.mobile || ''}`);
  if (b.email) L.push(`البريد: ${b.email}`);
  if (b.pet_type) L.push(`نوع الحيوان: ${b.pet_type}`);
  if (b.pet_name) L.push(`اسم الحيوان: ${b.pet_name}`);
  if (b.breed) L.push(`الفصيلة: ${b.breed}`);
  if (b.age) L.push(`العمر: ${b.age}`);
  if (b.gender) L.push(`الجنس: ${b.gender}`);
  const svc = b.service_name_ar || b.service_name;
  if (svc) L.push(`الخدمة: ${svc}${b.service_price != null ? ` — ${b.service_price} ريال` : ''}`);
  if (b.area) L.push(`الحي/المنطقة: ${b.area}`);
  if (b.address) L.push(`العنوان: ${b.address}`);
  if (b.directions) L.push(`تعليمات إضافية: ${b.directions}`);
  if (b.appointment_date) L.push(`تاريخ الحجز: ${b.appointment_date instanceof Date ? b.appointment_date.toISOString().slice(0, 10) : String(b.appointment_date).slice(0, 10)}`);
  if (b.appointment_time) L.push(`الوقت: ${b.appointment_time}`);
  L.push(`حالة الدفع: ${b.payment_status || 'unpaid'}`);
  return L.join('\n');
}

async function sendTo(cfg, number, text) {
  const r = await fetch(`https://graph.facebook.com/v20.0/${cfg.phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: number, type: 'text', text: { body: text } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = d?.error || {};
    const msg = [err.message, err.error_user_msg].filter(Boolean).join(' — ') || ('HTTP ' + r.status);
    throw Object.assign(new Error(msg), { code: err.code, subcode: err.error_subcode });
  }
  return d;
}

// Approved Meta utility template: new_booking_notification (language: English).
// Templates are required for proactive WhatsApp notifications outside the
// customer-service conversation window.
async function sendBookingTemplate(cfg, number, b) {
  const text = value => String(value ?? '').trim() || '—';
  const appointment = [
    b.appointment_date ? String(b.appointment_date).slice(0, 10) : '',
    b.appointment_time || '',
  ].filter(Boolean).join('، ') || '—';
  const address = [b.area, b.address, b.directions].filter(Boolean).join('، ') || '—';
  const service = b.service_name_ar || b.service_name || '—';
  const parameters = [
    b.booking_code, b.customer_name, b.mobile, b.email, service,
    b.pet_type, b.pet_name, appointment, address,
    b.service_price != null ? `${b.service_price}` : '—', b.payment_status,
  ].map(value => ({ type: 'text', text: text(value) }));
  const r = await fetch(`https://graph.facebook.com/v20.0/${cfg.phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: number,
      type: 'template',
      template: {
        name: 'new_booking_notification',
        language: { code: 'en' },
        components: [{ type: 'body', parameters }],
      },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = d?.error || {};
    throw Object.assign(new Error(err.error_user_msg || err.message || ('HTTP ' + r.status)), { code: err.code, subcode: err.error_subcode });
  }
  return d;
}

export async function sendWhatsAppBookingNotification(b, query, onlyNumber) {
  const cfg = await getWaConfig(query);
  if (!cfg.configured) { console.log('WhatsApp not configured — skipping notification for', b.booking_code); return false; }
  const number = onlyNumber || cfg.recipient;
  try {
    await sendBookingTemplate(cfg, number, b);
    console.log('WhatsApp booking template sent to', number, 'for', b.booking_code);
    return true;
  } catch (e) {
    console.error('WhatsApp failed to', number, ':', e.message);
    return false;
  }
}

// Test message used by the dashboard "Send Test Message" button.
export async function sendWhatsAppTest(query) {
  const cfg = await getWaConfig(query);
  if (!cfg.configured) return { ok: false, error: 'Access Token أو Phone Number ID غير مكتملين في الإعدادات' };
  try {
    const d = await sendTo(cfg, cfg.recipient, 'VETS VAN WhatsApp API test message. The WhatsApp integration is working correctly.');
    return { ok: true, message_id: d?.messages?.[0]?.id || null, to: cfg.recipient };
  } catch (e) {
    return { ok: false, error: e.message, code: e.code || null };
  }
}
