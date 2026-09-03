// VETS VAN admin enhancements: dedicated booking-source controls.
(() => {
  const token = localStorage.getItem('vv_token');
  if (!token) return;

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        ...(options.headers || {})
      }
    });
    if (response.status === 401) {
      localStorage.removeItem('vv_token');
      location.href = '/admin/login';
      return null;
    }
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Request failed');
    return body;
  };

  function setActive(item) {
    document.querySelectorAll('.side div[data-t], .side div[data-vv-booking-settings]').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
  }

  async function renderBookingSettings(item) {
    setActive(item);
    const root = document.getElementById('main');
    root.innerHTML = '<div class="card"><h3>إعدادات الحجز</h3><p>جارٍ تحميل الإعدادات…</p></div>';

    try {
      const settings = await request('/api/admin/settings');
      const source = settings?.booking_source === 'digitail' ? 'digitail' : 'internal';
      const slug = settings?.digitail_clinic_slug || 'vetsvan-01-5519deb-ryd';

      root.innerHTML = `
        <div class="card">
          <h3 style="margin-top:0">📅 إعدادات نظام الحجز</h3>
          <p style="color:#777;line-height:1.8">اختر النظام الذي يظهر للعميل في صفحة <b>Book Now</b>. النظام الآخر يظل محفوظًا ويمكن الرجوع إليه في أي وقت.</p>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:22px 0">
            <label id="vv_internal_card" style="display:block;border:2px solid ${source === 'internal' ? '#a32890' : '#e5e5e5'};border-radius:14px;padding:18px;cursor:pointer;background:${source === 'internal' ? '#fdf3fb' : '#fff'}">
              <input type="radio" name="vv_booking_source" value="internal" ${source === 'internal' ? 'checked' : ''} style="width:auto;margin-left:8px">
              <b>الفورم الحالي</b>
              <div style="font-size:13px;color:#777;margin-top:8px;line-height:1.7">استخدام نموذج VETS VAN الحالي مع الخدمات والمواعيد والدفع والتكاملات الموجودة.</div>
            </label>

            <label id="vv_digitail_card" style="display:block;border:2px solid ${source === 'digitail' ? '#a32890' : '#e5e5e5'};border-radius:14px;padding:18px;cursor:pointer;background:${source === 'digitail' ? '#fdf3fb' : '#fff'}">
              <input type="radio" name="vv_booking_source" value="digitail" ${source === 'digitail' ? 'checked' : ''} style="width:auto;margin-left:8px">
              <b>Digitail Calendar</b>
              <div style="font-size:13px;color:#777;margin-top:8px;line-height:1.7">إخفاء الفورم الحالي وعرض تقويم Digitail المدمج داخل نفس صفحة الحجز.</div>
            </label>
          </div>

          <div style="border-top:1px solid #eee;padding-top:18px;margin-top:8px">
            <label style="display:block;font-weight:700;margin-bottom:7px">Digitail Clinic Slug</label>
            <input id="vv_digitail_slug" value="${String(slug).replace(/[<>&\"]/g, '')}" placeholder="vetsvan-01-5519deb-ryd" dir="ltr" style="text-align:left">
            <small style="color:#888">يُستخدم فقط عند تفعيل Digitail.</small>
          </div>

          <div style="margin-top:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <button id="vv_save_booking" class="btn">حفظ إعدادات الحجز</button>
            <span id="vv_booking_status" style="font-size:13px"></span>
          </div>
        </div>`;

      const cards = {
        internal: document.getElementById('vv_internal_card'),
        digitail: document.getElementById('vv_digitail_card')
      };
      root.querySelectorAll('input[name="vv_booking_source"]').forEach(radio => {
        radio.addEventListener('change', () => {
          Object.entries(cards).forEach(([key, card]) => {
            const active = key === radio.value;
            card.style.borderColor = active ? '#a32890' : '#e5e5e5';
            card.style.background = active ? '#fdf3fb' : '#fff';
          });
        });
      });

      document.getElementById('vv_save_booking').onclick = async () => {
        const button = document.getElementById('vv_save_booking');
        const status = document.getElementById('vv_booking_status');
        const selected = root.querySelector('input[name="vv_booking_source"]:checked')?.value || 'internal';
        const clinicSlug = document.getElementById('vv_digitail_slug').value.trim() || 'vetsvan-01-5519deb-ryd';
        button.disabled = true;
        button.textContent = 'جارٍ الحفظ…';
        status.textContent = '';
        try {
          await request('/api/admin/settings/booking_source', { method: 'PUT', body: JSON.stringify({ value: selected }) });
          await request('/api/admin/settings/digitail_clinic_slug', { method: 'PUT', body: JSON.stringify({ value: clinicSlug }) });
          status.style.color = '#1a7f37';
          status.textContent = selected === 'digitail' ? '✅ تم تفعيل Digitail' : '✅ تم تفعيل الفورم الحالي';
        } catch (error) {
          status.style.color = '#c00';
          status.textContent = '❌ ' + error.message;
        } finally {
          button.disabled = false;
          button.textContent = 'حفظ إعدادات الحجز';
        }
      };
    } catch (error) {
      root.innerHTML = `<div class="card"><h3>إعدادات الحجز</h3><p style="color:#c00">تعذر تحميل الإعدادات: ${error.message}</p></div>`;
    }
  }

  function installBookingMenu() {
    const sidebar = document.querySelector('.side');
    if (!sidebar || sidebar.querySelector('[data-vv-booking-settings]')) return;
    const item = document.createElement('div');
    item.dataset.vvBookingSettings = '1';
    item.textContent = 'إعدادات الحجز 📅';
    const settingsItem = sidebar.querySelector('[data-t="settings"]');
    sidebar.insertBefore(item, settingsItem || document.getElementById('logout'));
    item.addEventListener('click', () => renderBookingSettings(item));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installBookingMenu, { once: true });
  else installBookingMenu();
})();
