// ===== Email notifications (VetsVan) =====
// Microsoft 365 SMTP via env ONLY: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// SMTP_SECURE, SMTP_TLS, NOTIFY_EMAIL
// Credentials are NEVER hard-coded, NEVER sent to the frontend.
// If SMTP is not configured or sending fails: error is logged server-side only.

import nodemailer from 'nodemailer';

export function emailConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporter() {
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure, // false for 587 (STARTTLS), true for 465
    requireTLS: String(process.env.SMTP_TLS || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const site = () => (process.env.SITE_URL || 'https://vetsvan-zji1.onrender.com').replace(/\/$/, '');
const waNum = () => process.env.WHATSAPP_NUMBER || '966920011626';
const from = () => `"VetsVan" <${process.env.SMTP_USER}>`;

async function deliver(mailOptions, tag) {
  try {
    await transporter().sendMail(mailOptions);
    console.log(`Email sent [${tag}] to`, mailOptions.to);
    return true;
  } catch (e) {
    // Log error WITHOUT credentials; never expose SMTP data
    console.error(`Email failed [${tag}]:`, e.message);
    return false;
  }
}

function detailsTable(rows) {
  return `<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden">
    ${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#777;width:40%">${k}</td><td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:bold;color:#222">${esc(v)}</td></tr>`).join('')}
  </table>`;
}

// 1) Clinic/admin notification when a new booking is submitted.
//    Reply-To = customer email so the clinic replies directly to the customer.
export async function sendBookingNotificationEmail(b) {
  if (!emailConfigured()) { console.log('SMTP not configured — skipping booking notification for', b.booking_code); return false; }
  const to = process.env.NOTIFY_EMAIL || process.env.SMTP_USER;
  const html = `
  <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:560px;margin:auto;background:#f7f5fb;padding:24px;border-radius:12px">
    <h2 style="color:#5b3fa8;margin:0 0 8px">🔔 حجز جديد — VetsVan</h2>
    <p style="color:#444">تم استلام حجز جديد من نموذج الموقع. التفاصيل:</p>
    ${detailsTable([
      ['رقم الحجز', b.booking_code],
      ['اسم العميل', b.customer_name],
      ['الجوال', b.mobile],
      ['البريد', b.email],
      ['الخدمة', b.service_name_ar || b.service_name],
      ['نوع الحيوان', b.pet_type],
      ['اسم الحيوان', b.pet_name],
      ['الموعد', (b.appointment_date ? String(b.appointment_date).slice(0, 10) : '') + ' ' + (b.appointment_time || '')],
      ['المنطقة / العنوان', [b.area, b.address, b.directions].filter(Boolean).join(' — ')],
      ['السعر', b.service_price != null ? `${b.service_price} ريال` : null],
      ['حالة الدفع', b.payment_status],
    ])}
    <p style="color:#999;font-size:12px">للرد على العميل مباشرة اضغط "رد" — الرد سيذهب إلى بريده تلقائيًا.</p>
  </div>`;
  return deliver({
    from: from(),
    to,
    replyTo: b.email || undefined,
    subject: `حجز جديد ${b.booking_code} — ${b.customer_name}`,
    html,
  }, 'booking-notification');
}

// 2) Payment confirmation to the customer (booking + payment details + review/WhatsApp links).
export async function sendPaymentConfirmationEmail(b) {
  if (!emailConfigured()) { console.log('SMTP not configured — skipping payment email for', b.booking_code); return false; }
  if (!b.email) { console.log('No customer email — skipping payment email for', b.booking_code); return false; }
  const reviewUrl = `${site()}/review.html?code=${encodeURIComponent(b.booking_code)}`;
  const waUrl = `https://wa.me/${waNum()}?text=${encodeURIComponent('مرحبًا، بخصوص حجزي ' + b.booking_code)}`;
  const html = `
  <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:560px;margin:auto;background:#f7f5fb;padding:24px;border-radius:12px">
    <h2 style="color:#5b3fa8;margin:0 0 8px">VetsVan — تأكيد الدفع والحجز</h2>
    <p style="color:#444">عزيزنا ${esc(b.customer_name)}، تم استلام دفعتك بنجاح وتأكيد حجزك. تفاصيل الحجز:</p>
    ${detailsTable([
      ['رقم الحجز', b.booking_code],
      ['الخدمة', b.service_name_ar || b.service_name || '—'],
      ['تاريخ الموعد', b.appointment_date ? String(b.appointment_date).slice(0, 10) : '—'],
      ['الوقت', b.appointment_time || '—'],
      ['المنطقة / العنوان', [b.area, b.address].filter(Boolean).join(' — ') || '—'],
      ['المبلغ المدفوع', b.invoice_amount != null ? `${b.invoice_amount} ريال سعودي` : '—'],
      ['طريقة الدفع', b.payment_method || '—'],
      ['رقم عملية الدفع', b.payment_id || '—'],
      ['حالة الدفع', 'تم الدفع بنجاح ✅'],
    ])}
    <div style="text-align:center;margin:22px 0">
      <a href="${waUrl}" style="background:#25d366;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">تواصل معنا واتساب</a>
      &nbsp;
      <a href="${reviewUrl}" style="background:#5b3fa8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">قيّم تجربتك ⭐</a>
    </div>
    <p style="color:#999;font-size:12px">بعد انتهاء الخدمة يسعدنا تقييمك عبر الرابط أعلاه — رأيك يهمنا.<br>VetsVan — العيادة البيطرية المتنقلة | ${site()}</p>
  </div>`;
  return deliver({
    from: from(),
    to: b.email,
    subject: `تأكيد الدفع والحجز ${b.booking_code} — VetsVan`,
    html,
  }, 'payment-confirmation');
}
