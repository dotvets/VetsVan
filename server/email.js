// ===== Email notifications (VetsVan) =====
// Uses Gmail SMTP via env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// If SMTP is not configured, emails are skipped silently (logged only).

import nodemailer from 'nodemailer';

export function emailConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_PORT || '465') === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendPaymentConfirmationEmail(b) {
  if (!emailConfigured()) { console.log('SMTP not configured — skipping payment email for', b.booking_code); return false; }
  if (!b.email) { console.log('No customer email — skipping payment email for', b.booking_code); return false; }
  const site = (process.env.SITE_URL || 'https://vetsvan-zji1.onrender.com').replace(/\/$/, '');
  const wa = process.env.WHATSAPP_NUMBER || '966920011626';
  const reviewUrl = `${site}/review.html?code=${encodeURIComponent(b.booking_code)}`;
  const waUrl = `https://wa.me/${wa}?text=${encodeURIComponent('مرحبًا، بخصوص حجزي ' + b.booking_code)}`;
  const rows = [
    ['رقم الحجز', b.booking_code],
    ['الخدمة', b.service_name_ar || b.service_name || '—'],
    ['تاريخ الموعد', b.appointment_date ? String(b.appointment_date).slice(0, 10) : '—'],
    ['الوقت', b.appointment_time || '—'],
    ['المنطقة / العنوان', [b.area, b.address].filter(Boolean).join(' — ') || '—'],
    ['المبلغ المدفوع', b.invoice_amount != null ? `${b.invoice_amount} ريال سعودي` : '—'],
    ['طريقة الدفع', b.payment_method || '—'],
    ['رقم عملية الدفع', b.payment_id || '—'],
    ['حالة الدفع', 'تم الدفع بنجاح ✅'],
  ];
  const html = `
  <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:560px;margin:auto;background:#f7f5fb;padding:24px;border-radius:12px">
    <h2 style="color:#5b3fa8;margin:0 0 8px">VetsVan — تأكيد الدفع والحجز</h2>
    <p style="color:#444">عزيزنا ${esc(b.customer_name)}، تم استلام دفعتك بنجاح وتأكيد حجزك. تفاصيل الحجز:</p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden">
      ${rows.map(([k, v]) => `<tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#777;width:40%">${k}</td><td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:bold;color:#222">${esc(v)}</td></tr>`).join('')}
    </table>
    <div style="text-align:center;margin:22px 0">
      <a href="${waUrl}" style="background:#25d366;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">تواصل معنا واتساب</a>
      &nbsp;
      <a href="${reviewUrl}" style="background:#5b3fa8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">قيّم تجربتك ⭐</a>
    </div>
    <p style="color:#999;font-size:12px">بعد انتهاء الخدمة يسعدنا تقييمك عبر الرابط أعلاه — رأيك يهمنا.<br>VetsVan — العيادة البيطرية المتنقلة | ${site}</p>
  </div>`;
  try {
    await transporter().sendMail({
      from: `"VetsVan" <${process.env.SMTP_USER}>`,
      to: b.email,
      subject: `تأكيد الدفع والحجز ${b.booking_code} — VetsVan`,
      html,
    });
    console.log('Payment confirmation email sent to', b.email, 'for', b.booking_code);
    return true;
  } catch (e) {
    console.error('Email send failed:', e.message);
    return false;
  }
}
