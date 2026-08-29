// ===== MyFatoorah Production-Grade Payment Layer (VetsVan) =====
// Rules enforced here:
// - Invoice creation & verification ONLY from backend
// - Price is ALWAYS resolved server-side from the services table (never trusted from frontend)
// - Payment considered paid ONLY after server-side verification with MyFatoorah
// - Webhook supported: on notification we re-verify server-side, never trusting the payload

const MF_BASE = () => process.env.MYFATOORAH_BASE_URL || 'https://api-sa.myfatoorah.com';

async function mfCall(path, body) {
  const r = await fetch(MF_BASE() + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.MYFATOORAH_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

export function paymentConfigured() {
  return !!process.env.MYFATOORAH_API_KEY;
}

export async function createInvoice({ bookingCode, customerName, mobile, email, amount, serviceName }) {
  const site = process.env.SITE_URL || 'https://vetsvan-zji1.onrender.com';
  const r = await mfCall('/v2/SendPayment', {
    CustomerName: customerName,
    NotificationOption: 'LNK',
    InvoiceValue: Number(amount),
    DisplayCurrencyIso: 'SAR',
    CustomerEmail: email || undefined,
    CustomerMobile: mobile || undefined,
    CallBackUrl: site + '/api/payments/callback',
    ErrorUrl: site + '/api/payments/error',
    Language: 'ar',
    CustomerReference: bookingCode,
    // Comment shown on the MyFatoorah invoice: booking link + WhatsApp
    UserDefinedField: `${serviceName || 'VetsVan Service'} | حجز: ${site}/#booking-${bookingCode} | واتساب: https://wa.me/${process.env.WHATSAPP_NUMBER || '966920011626'}`,
  });
  if (!r.IsSuccess) throw new Error(r.Message || 'myfatoorah_error');
  return { invoiceId: String(r.Data.InvoiceId), invoiceUrl: r.Data.InvoiceURL };
}

// Full server-side verification. Returns normalized result.
export async function verifyPayment(paymentId) {
  const r = await mfCall('/v2/getPaymentStatus', { Key: paymentId, KeyType: 'PaymentId' });
  if (!r.IsSuccess) return { verified: false, status: 'unknown', reason: r.Message };
  const d = r.Data;
  const tx = (d.InvoiceTransactions || []).find(t => t.TransactionStatus === 'Succss') || (d.InvoiceTransactions || [])[0] || {};
  const map = { Paid: 'paid', Pending: 'pending', Failed: 'failed', Expired: 'failed', Canceled: 'cancelled' };
  return {
    verified: d.InvoiceStatus === 'Paid',
    status: map[d.InvoiceStatus] || 'verification_required',
    rawStatus: d.InvoiceStatus,
    invoiceId: String(d.InvoiceId),
    bookingCode: d.CustomerReference || '',
    invoiceValue: d.InvoiceValue,
    paymentMethod: tx.PaymentGateway || tx.PaymentMethod || null,
    transactionDate: tx.TransactionDate || null,
    paymentId,
  };
}
