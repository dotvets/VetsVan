from pathlib import Path
p=Path('admin/index.html')
s=p.read_text()
menu='  <div data-t="booking-settings">إعدادات الحجز 📅</div>\n'
anchor='  <div data-t="settings">الإعدادات</div>\n'
if menu not in s:
    if anchor not in s: raise SystemExit('settings menu anchor not found')
    s=s.replace(anchor, menu+anchor, 1)
block=r'''
  if (t === 'booking-settings') {
    const settings = await api('/api/admin/settings');
    const source = settings.booking_source === 'digitail' ? 'digitail' : 'internal';
    const slug = settings.digitail_clinic_slug || 'vetsvan-01-5519deb-ryd';
    main.innerHTML = `<div class="card">
      <h3 style="margin-top:0">📅 إعدادات نظام الحجز</h3>
      <p style="color:#777">اختر النظام الذي يظهر للعميل في صفحة Book Now.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:20px 0">
        <label style="border:2px solid ${source==='internal'?'#a32890':'#e5e5e5'};border-radius:12px;padding:16px;cursor:pointer">
          <input type="radio" name="booking_source" value="internal" ${source==='internal'?'checked':''} style="width:auto"> <b>الفورم الحالي</b>
          <div style="font-size:13px;color:#777;margin-top:7px">نموذج VETS VAN الحالي مع الدفع والتكاملات الموجودة.</div>
        </label>
        <label style="border:2px solid ${source==='digitail'?'#a32890':'#e5e5e5'};border-radius:12px;padding:16px;cursor:pointer">
          <input type="radio" name="booking_source" value="digitail" ${source==='digitail'?'checked':''} style="width:auto"> <b>Digitail Calendar</b>
          <div style="font-size:13px;color:#777;margin-top:7px">عرض تقويم Digitail بدل الفورم الحالي.</div>
        </label>
      </div>
      <label><b>Digitail Clinic Slug</b></label>
      <input id="digitail_slug" dir="ltr" value="${esc(slug)}">
      <button class="btn" id="save_booking_settings">حفظ إعدادات الحجز</button>
      <span id="booking_settings_status" style="margin-right:10px"></span>
    </div>`;
    document.getElementById('save_booking_settings').onclick = async () => {
      const b=document.getElementById('save_booking_settings');
      const st=document.getElementById('booking_settings_status');
      const selected=main.querySelector('input[name="booking_source"]:checked')?.value || 'internal';
      const clinicSlug=document.getElementById('digitail_slug').value.trim() || 'vetsvan-01-5519deb-ryd';
      b.disabled=true; b.textContent='جارٍ الحفظ…'; st.textContent='';
      try {
        await api('/api/admin/settings/booking_source',{method:'PUT',body:JSON.stringify({value:selected})});
        await api('/api/admin/settings/digitail_clinic_slug',{method:'PUT',body:JSON.stringify({value:clinicSlug})});
        st.style.color='#1a7f37'; st.textContent=selected==='digitail'?'✅ تم تفعيل Digitail':'✅ تم تفعيل الفورم الحالي';
      } catch(e) { st.style.color='#c00'; st.textContent='❌ تعذر الحفظ'; }
      finally { b.disabled=false; b.textContent='حفظ إعدادات الحجز'; }
    };
  }
'''
marker="  if (t === 'settings') {"
if "if (t === 'booking-settings')" not in s:
    if marker not in s: raise SystemExit('settings show block anchor not found')
    s=s.replace(marker, block+'\n'+marker, 1)
p.write_text(s)
