// ===== WhatsApp booking notifications (VetsVan) =====
// Meta WhatsApp Cloud API — activates only when env vars are present:
//   WHATSAPP_TOKEN       (Meta System User access token)
//   WHATSAPP_PHONE_ID    (Phone number ID from Meta)
//   WHATSAPP_ADMIN_NUMBERS (comma-separated, e.g. 966539760530,966920011626)
// Optional: WHATSAPP_TEMPLATE (approved template name for business-initiated msgs)
// If not configured: skipped silently (logged). Never fails a booking.

export function whatsappConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_ADMIN_NUMBERS);
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
  if (b.appointment_date) L.push(`تاريخ الحجز: ${String(b.appointment_date).slice(0, 10)}`);
  if (b.appointment_time) L.push(`الوقت: ${b.appointment_time}`);
  L.push(`حالة الدفع: ${b.payment_status || 'unpaid'}`);
  return L.join('\n');
}

async function sendTo(number, payload) {
  const r = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: number, ...payload }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || 'whatsapp_api_error');
  return d;
}

export async function sendWhatsAppBookingNotification(b, onlyNumber) {
  if (!whatsappConfigured()) { console.log('WhatsApp not configured — skipping notification for', b.booking_code); return false; }
  const numbers = onlyNumber ? [onlyNumber] : process.env.WHATSAPP_ADMIN_NUMBERS.split(',').map(s => s.trim()).filter(Boolean);
  const text = bookingDetailsText(b);
  const tpl = process.env.WHATSAPP_TEMPLATE;
  let allOk = true;
  for (const num of numbers) {
    try {
      // Business-initiated messages require an approved template; freeform text
      // only works inside an open 24h customer service window.
      if (tpl) {
        await sendTo(num, { type: 'template', template: { name: tpl, language: { code: 'ar' }, components: [{ type: 'body', parameters: [{ type: 'text', text }] }] } });
      } else {
        await sendTo(num, { type: 'text', text: { body: text } });
      }
      console.log('WhatsApp sent to', num, 'for', b.booking_code);
    } catch (e) {
      console.error('WhatsApp failed to', num, ':', e.message);
      allOk = false;
    }
  }
  return allOk;
}
