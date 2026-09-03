(() => {
  const DEFAULT_CONFIG = {
    source: 'internal',
    digitail_clinic_slug: 'vetsvan-01-5519deb-ryd'
  };

  async function getBookingConfig() {
    try {
      const r = await fetch('/api/booking-config', { cache: 'no-store' });
      if (!r.ok) throw new Error('booking config unavailable');
      const data = await r.json();
      return {
        source: data.source === 'digitail' ? 'digitail' : 'internal',
        digitail_clinic_slug: data.digitail_clinic_slug || DEFAULT_CONFIG.digitail_clinic_slug
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  function loadDigitailWidget(slug, mount) {
    mount.innerHTML = '<div id="digitail-calendar" style="width:100%;height:600px;min-height:600px;"></div>';

    const old = document.querySelector('script[data-vv-digitail="1"]');
    if (old) old.remove();

    const script = document.createElement('script');
    script.src = 'https://vet.digitail.io/rev1/widgets/public-calendar-widget.js';
    script.async = true;
    script.dataset.clinicSlug = slug;
    script.dataset.embedId = 'digitail-calendar';
    script.dataset.vvDigitail = '1';
    document.body.appendChild(script);
  }

  async function applyBookingSource() {
    const bookingPage = document.getElementById('book');
    if (!bookingPage) return;

    const internalForm = bookingPage.querySelector('.booking-wrapper');
    if (!internalForm) return;

    let externalWrap = document.getElementById('vv-digitail-booking');
    if (!externalWrap) {
      externalWrap = document.createElement('div');
      externalWrap.id = 'vv-digitail-booking';
      externalWrap.className = 'booking-wrapper reveal reveal-delay-1';
      externalWrap.style.display = 'none';
      internalForm.insertAdjacentElement('afterend', externalWrap);
    }

    const config = await getBookingConfig();

    if (config.source === 'digitail') {
      internalForm.style.display = 'none';
      externalWrap.style.display = 'block';
      loadDigitailWidget(config.digitail_clinic_slug, externalWrap);
    } else {
      internalForm.style.display = '';
      externalWrap.style.display = 'none';
      externalWrap.innerHTML = '';
      const old = document.querySelector('script[data-vv-digitail="1"]');
      if (old) old.remove();
    }
  }

  function applyDeepLink() {
    const id = location.hash.replace(/^#/, '');
    if (!['home', 'book', 'services', 'about', 'contact'].includes(id)) return;
    if (typeof window.navTo === 'function') {
      try { window.navTo(id); } catch {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(id)?.classList.add('active');
        window.scrollTo(0, 0);
      }
    }
  }

  function init() {
    applyBookingSource();
    applyDeepLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.addEventListener('hashchange', () => {
    applyBookingSource();
    applyDeepLink();
  });
  window.VetsVanBookingSource = { refresh: applyBookingSource };
})();
