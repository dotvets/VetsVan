import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { requirePermission, ROLES, normalizeRole } from './rbac.js';
import { paymentConfigured, createInvoice, verifyPayment } from './payments.js';
import { sendPaymentConfirmationEmail, sendBookingNotificationEmail } from './email.js';
import { sendWhatsAppBookingNotification, whatsappConfigured, bookingDetailsText } from './whatsapp.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-render';
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req,res,next)=>req.path.startsWith('/admin')?next():express.static(path.join(__dirname,'..'))(req,res,next));
async function query(text, params = []) { if (!pool) throw new Error('DATABASE_URL is not configured'); return pool.query(text, params); }
async function bootstrap() {
  if (!pool) return;
  await query(`CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, admin_id INT REFERENCES admins(id) ON DELETE SET NULL, action TEXT NOT NULL, resource TEXT, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS services (id SERIAL PRIMARY KEY, name_en TEXT NOT NULL, name_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '', description_ar TEXT NOT NULL DEFAULT '', price NUMERIC(10,2), image_url TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, booking_code TEXT UNIQUE NOT NULL, customer_name TEXT NOT NULL, mobile TEXT NOT NULL, email TEXT, pet_type TEXT, pet_name TEXT, breed TEXT, age TEXT, gender TEXT, service_id INT REFERENCES services(id) ON DELETE SET NULL, area TEXT, address TEXT, directions TEXT, appointment_date DATE, appointment_time TEXT, status TEXT NOT NULL DEFAULT 'new', admin_notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, name TEXT NOT NULL, mobile TEXT, email TEXT, subject TEXT, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unread', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS site_content (id SERIAL PRIMARY KEY, content_key TEXT UNIQUE NOT NULL, value_en TEXT NOT NULL DEFAULT '', value_ar TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
  await query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid', ADD COLUMN IF NOT EXISTS invoice_id TEXT, ADD COLUMN IF NOT EXISTS invoice_url TEXT, ADD COLUMN IF NOT EXISTS payment_id TEXT, ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2), ADD COLUMN IF NOT EXISTS service_price NUMERIC(10,2), ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC(10,2), ADD COLUMN IF NOT EXISTS payment_method TEXT, ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS transaction_date TEXT, ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS confirmation_email_sent BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ`);
  await query(`CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, booking_code TEXT UNIQUE NOT NULL REFERENCES bookings(booking_code) ON DELETE CASCADE, rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5), comment TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS whatsapp_queue (id SERIAL PRIMARY KEY, booking_code TEXT NOT NULL REFERENCES bookings(booking_code) ON DELETE CASCADE, target_number TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ)`);
  const admin = await query('SELECT id FROM admins LIMIT 1');
  if (!admin.rows.length && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) { const hash=await bcrypt.hash(process.env.ADMIN_PASSWORD,12); await query('INSERT INTO admins(name,email,password_hash,role) VALUES($1,$2,$3,$4)',[process.env.ADMIN_NAME||'Admin',process.env.ADMIN_EMAIL.toLowerCase(),hash,'super_admin']); }
}
function auth(req,res,next){const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');try{req.user=jwt.verify(token,JWT_SECRET);next();}catch{res.status(401).json({error:'Unauthorized'});}}
async function audit(req,action,resource,details={}){if(pool&&req.user)await query('INSERT INTO audit_logs(admin_id,action,resource,details) VALUES($1,$2,$3,$4)',[req.user.id,action,resource,JSON.stringify(details)]);}
const protect=p=>[auth,requirePermission(p)];
app.post('/api/auth/login',async(req,res)=>{try{const{email,password}=req.body;if(!email||!password)return res.status(400).json({error:'Email and password are required'});const r=await query('SELECT * FROM admins WHERE LOWER(email)=LOWER($1) AND active=true LIMIT 1',[email]);if(!r.rows.length||!(await bcrypt.compare(password,r.rows[0].password_hash)))return res.status(401).json({error:'Invalid credentials'});const a=r.rows[0];const token=jwt.sign({id:a.id,email:a.email,name:a.name,role:normalizeRole(a.role)},JWT_SECRET,{expiresIn:'12h'});res.json({token,user:{id:a.id,name:a.name,email:a.email,role:normalizeRole(a.role)}});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/health',(_req,res)=>res.json({ok:true,database:!!pool}));
// ===== Reviews: public submit (one per booking) + admin list =====
app.get('/api/reviews/check',async(req,res)=>{try{const code=String(req.query.code||'');if(!code)return res.status(400).json({error:'code required'});const b=await query('SELECT booking_code,customer_name,service_id FROM bookings WHERE booking_code=$1',[code]);if(!b.rows.length)return res.status(404).json({error:'booking not found'});const r=await query('SELECT id FROM reviews WHERE booking_code=$1',[code]);res.json({ok:true,already_reviewed:r.rows.length>0});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/reviews',async(req,res)=>{try{const{booking_code,rating,comment=''}=req.body||{};const rt=Number(rating);if(!booking_code||!(rt>=1&&rt<=5))return res.status(400).json({error:'booking_code and rating (1-5) required'});const b=await query('SELECT booking_code FROM bookings WHERE booking_code=$1',[booking_code]);if(!b.rows.length)return res.status(404).json({error:'booking not found'});await query('INSERT INTO reviews(booking_code,rating,comment) VALUES($1,$2,$3)',[booking_code,rt,String(comment).slice(0,1000)]);res.status(201).json({ok:true});}catch(e){res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'already reviewed':e.message});}});
app.get('/api/admin/reviews',...protect('bookings:read'),async(_req,res)=>{try{res.json((await query('SELECT r.*,b.customer_name,s.name_ar AS service_name_ar,s.name_en AS service_name FROM reviews r LEFT JOIN bookings b ON b.booking_code=r.booking_code LEFT JOIN services s ON s.id=b.service_id ORDER BY r.created_at DESC')).rows);}catch(e){res.status(500).json({error:e.message});}});
// ===== WhatsApp automation (auto | manual | off — setting: whatsapp_auto) =====
const WA_AUTO_NUMBER='966539760530'; // automation target — 966920011626 stays manual in dashboard
async function handleWhatsAppAutomation(b){
  try{
    const sr=await query("SELECT value FROM site_settings WHERE key='whatsapp_auto'");
    const mode=sr.rows.length?sr.rows[0].value:'manual';
    if(mode==='off')return;
    const text=bookingDetailsText(b);
    if(mode==='auto'&&whatsappConfigured()){
      const ok=await sendWhatsAppBookingNotification(b,WA_AUTO_NUMBER);
      if(ok){await query("INSERT INTO whatsapp_queue(booking_code,target_number,message,status,sent_at) VALUES($1,$2,$3,'sent',NOW())",[b.booking_code,WA_AUTO_NUMBER,text]);return;}
    }
    // manual mode (or auto without API credentials): queue for one-click send from dashboard
    await query('INSERT INTO whatsapp_queue(booking_code,target_number,message) VALUES($1,$2,$3)',[b.booking_code,WA_AUTO_NUMBER,text]);
  }catch(e){console.error('WhatsApp automation:',e.message);}
}
// Send payment confirmation email exactly once, when a booking transitions to paid.
async function notifyIfNewlyPaid(bookingCode){
  try{
    const r=await query(`SELECT b.*,s.name_en AS service_name,s.name_ar AS service_name_ar FROM bookings b LEFT JOIN services s ON s.id=b.service_id WHERE b.booking_code=$1 AND b.payment_status='paid' AND b.verification_status='verified' AND b.confirmation_email_sent=false`,[bookingCode]);
    if(!r.rows.length)return;
    const sent=await sendPaymentConfirmationEmail(r.rows[0]);
    if(sent)await query('UPDATE bookings SET confirmation_email_sent=true WHERE booking_code=$1',[bookingCode]);
  }catch(e){console.error('notifyIfNewlyPaid:',e.message);}
}
app.get('/api/admin/me',auth,(req,res)=>res.json({user:req.user,permissions:ROLES[normalizeRole(req.user.role)]||[]}));
app.get('/api/dashboard',...protect('dashboard:read'),async(_req,res)=>{try{const[t,p,c,m,recent]=await Promise.all([query('SELECT COUNT(*)::int AS n FROM bookings'),query("SELECT COUNT(*)::int AS n FROM bookings WHERE status IN ('new','pending')"),query("SELECT COUNT(*)::int AS n FROM bookings WHERE status='completed'"),query("SELECT COUNT(*)::int AS n FROM messages WHERE status='unread'"),query('SELECT b.*,s.name_en AS service_name FROM bookings b LEFT JOIN services s ON s.id=b.service_id ORDER BY b.created_at DESC LIMIT 8')]);res.json({stats:{total:t.rows[0].n,pending:p.rows[0].n,completed:c.rows[0].n,unreadMessages:m.rows[0].n},recent:recent.rows});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/bookings',...protect('bookings:read'),async(req,res)=>{try{const q=String(req.query.search||'').trim(),status=String(req.query.status||'').trim(),p=[],w=[];if(q){p.push(`%${q}%`);w.push(`(b.customer_name ILIKE $${p.length} OR b.pet_name ILIKE $${p.length} OR b.booking_code ILIKE $${p.length})`);}if(status){p.push(status);w.push(`b.status=$${p.length}`);}const sql=`SELECT b.*,s.name_en AS service_name FROM bookings b LEFT JOIN services s ON s.id=b.service_id ${w.length?'WHERE '+w.join(' AND '):''} ORDER BY b.appointment_date DESC NULLS LAST,b.created_at DESC`;res.json((await query(sql,p)).rows);}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/bookings',async(req,res)=>{try{
  const b=req.body, code='VV-'+Date.now().toString().slice(-7);
  // Server-side validation of required fields
  if(!b.customer_name||!String(b.customer_name).trim())return res.status(400).json({error:'الاسم مطلوب'});
  if(!b.mobile||!String(b.mobile).trim())return res.status(400).json({error:'رقم الجوال مطلوب'});
  if(b.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email)))return res.status(400).json({error:'صيغة البريد الإلكتروني غير صحيحة'});
  // Price resolved SERVER-SIDE from services table — frontend amount is never trusted.
  let svc=null, price=null;
  if(b.service_id){ const sr=await query('SELECT * FROM services WHERE id=$1 AND active=true',[b.service_id]); if(sr.rows.length){ svc=sr.rows[0]; price=svc.price!==null?Number(svc.price):null; } }
  const needsPayment = price!==null && price>0 && paymentConfigured();
  const status = needsPayment ? 'pending_payment' : 'new';
  const r=await query(`INSERT INTO bookings(booking_code,customer_name,mobile,email,pet_type,pet_name,breed,age,gender,service_id,area,address,directions,appointment_date,appointment_time,status,service_price,payment_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [code,b.customer_name,b.mobile,b.email||null,b.pet_type||null,b.pet_name||null,b.breed||null,b.age||null,b.gender||null,svc?svc.id:(b.service_id||null),b.area||null,b.address||null,b.directions||null,b.appointment_date||null,b.appointment_time||null,status,price,needsPayment?'pending':'unpaid']);
  const booking=r.rows[0];
  // Notify clinic/admin by email (Reply-To = customer). Failure is logged server-side
  // and never fails the booking or exposes SMTP details to the client.
  const full={...booking,service_name:svc?svc.name_en:null,service_name_ar:svc?svc.name_ar:null};
  const emailSent=await sendBookingNotificationEmail(full);
  // WhatsApp automation pipeline (auto/manual/off — controlled from dashboard settings)
  handleWhatsAppAutomation(full).catch(()=>{});
  if(needsPayment){
    try{
      const inv=await createInvoice({bookingCode:code,customerName:b.customer_name,mobile:b.mobile,email:b.email,amount:price,serviceName:svc?svc.name_en:''});
      await query('UPDATE bookings SET invoice_id=$1,invoice_url=$2,invoice_amount=$3 WHERE id=$4',[inv.invoiceId,inv.invoiceUrl,price,booking.id]);
      return res.status(201).json({...booking,invoice_url:inv.invoiceUrl,invoice_amount:price,requires_payment:true,email_sent:emailSent});
    }catch(e){ await query("UPDATE bookings SET status='new',payment_status='unpaid' WHERE id=$1",[booking.id]); return res.status(201).json({...booking,requires_payment:false,payment_error:String(e.message),email_sent:emailSent}); }
  }
  res.status(201).json({...booking,requires_payment:false,email_sent:emailSent});
}catch(e){res.status(500).json({error:e.message});}});
app.patch('/api/bookings/:id',...protect('bookings:write'),async(req,res)=>{try{const{status,admin_notes}=req.body,r=await query('UPDATE bookings SET status=COALESCE($1,status),admin_notes=COALESCE($2,admin_notes),updated_at=NOW() WHERE id=$3 RETURNING *',[status,admin_notes,req.params.id]);await audit(req,'update','booking',{id:req.params.id,status});res.json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/services',async(_req,res)=>{try{res.json((await query('SELECT * FROM services WHERE active=true ORDER BY sort_order,id')).rows);}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/admin/services',...protect('services:read'),async(_req,res)=>{try{res.json((await query('SELECT * FROM services ORDER BY sort_order,id')).rows);}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/admin/services',...protect('services:write'),async(req,res)=>{try{const x=req.body,r=await query('INSERT INTO services(name_en,name_ar,description_en,description_ar,price,image_url,active,sort_order,price_updated_at) VALUES($1,$2,$3,$4,$5::numeric,$6,$7,$8,CASE WHEN $5 IS NOT NULL THEN NOW() ELSE NULL END) RETURNING *',[x.name_en,x.name_ar||'',x.description_en||'',x.description_ar||'',x.price||null,x.image_url||null,x.active!==false,x.sort_order||0]);await audit(req,'create','service',{id:r.rows[0].id});res.status(201).json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
app.patch('/api/admin/services/:id',...protect('services:write'),async(req,res)=>{try{const x=req.body,r=await query('UPDATE services SET name_en=COALESCE($1,name_en),name_ar=COALESCE($2,name_ar),description_en=COALESCE($3,description_en),description_ar=COALESCE($4,description_ar),price=COALESCE($5,price),price_updated_at=CASE WHEN $5 IS NOT NULL AND $5 IS DISTINCT FROM price THEN NOW() ELSE price_updated_at END,image_url=COALESCE($6,image_url),active=COALESCE($7,active),sort_order=COALESCE($8,sort_order),updated_at=NOW() WHERE id=$9 RETURNING *',[x.name_en,x.name_ar,x.description_en,x.description_ar,x.price,x.image_url,x.active,x.sort_order,req.params.id]);await audit(req,'update','service',{id:req.params.id});res.json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
app.delete('/api/admin/services/:id',...protect('services:write'),async(req,res)=>{try{await query('DELETE FROM services WHERE id=$1',[req.params.id]);await audit(req,'delete','service',{id:req.params.id});res.status(204).end();}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/content',async(_req,res)=>{try{const rows=(await query('SELECT content_key,value_en,value_ar FROM site_content')).rows;res.json(Object.fromEntries(rows.map(x=>[x.content_key,{en:x.value_en,ar:x.value_ar}])));}catch(e){res.status(500).json({error:e.message});}});
app.put('/api/admin/content/:key',...protect('content:write'),async(req,res)=>{try{const{en='',ar=''}=req.body,r=await query('INSERT INTO site_content(content_key,value_en,value_ar) VALUES($1,$2,$3) ON CONFLICT(content_key) DO UPDATE SET value_en=$2,value_ar=$3,updated_at=NOW() RETURNING *',[req.params.key,en,ar]);await audit(req,'update','content',{key:req.params.key});res.json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/admin/messages',...protect('messages:read'),async(_req,res)=>{try{res.json((await query('SELECT * FROM messages ORDER BY created_at DESC')).rows);}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/messages',async(req,res)=>{try{const x=req.body,r=await query('INSERT INTO messages(name,mobile,email,subject,message) VALUES($1,$2,$3,$4,$5) RETURNING id',[x.name,x.mobile||null,x.email||null,x.subject||null,x.message]);res.status(201).json({ok:true,id:r.rows[0].id});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/admin/settings',...protect('settings:read'),async(_req,res)=>{try{const rows=(await query('SELECT key,value FROM site_settings')).rows;res.json(Object.fromEntries(rows.map(x=>[x.key,x.value])));}catch(e){res.status(500).json({error:e.message});}});
app.put('/api/admin/settings/:key',...protect('settings:write'),async(req,res)=>{try{const r=await query('INSERT INTO site_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=NOW() RETURNING *',[req.params.key,String(req.body.value??'')]);await audit(req,'update','setting',{key:req.params.key});res.json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/admin/users',...protect('__super_admin__'),async(_req,res)=>{try{res.json((await query('SELECT id,name,email,role,active,created_at,updated_at FROM admins ORDER BY created_at')).rows.map(x=>({...x,role:normalizeRole(x.role)})));}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/admin/users',...protect('__super_admin__'),async(req,res)=>{try{const{name,email,password,role='viewer',active=true}=req.body;if(!name||!email||!password)return res.status(400).json({error:'Name, email and password are required'});const normalized=normalizeRole(role);if(!ROLES[normalized])return res.status(400).json({error:'Invalid role'});const hash=await bcrypt.hash(password,12),r=await query('INSERT INTO admins(name,email,password_hash,role,active) VALUES($1,LOWER($2),$3,$4,$5) RETURNING id,name,email,role,active,created_at',[name,email,hash,normalized,active]);await audit(req,'create','admin',{id:r.rows[0].id,role:normalized});res.status(201).json(r.rows[0]);}catch(e){res.status(400).json({error:e.code==='23505'?'Email already exists':e.message});}});
app.patch('/api/admin/users/:id',...protect('__super_admin__'),async(req,res)=>{try{if(String(req.params.id)===String(req.user.id)&&req.body.active===false)return res.status(400).json({error:'You cannot disable your own account'});const{name,email,role,active,password}=req.body,normalized=role?normalizeRole(role):null;if(normalized&&!ROLES[normalized])return res.status(400).json({error:'Invalid role'});const hash=password?await bcrypt.hash(password,12):null,r=await query('UPDATE admins SET name=COALESCE($1,name),email=COALESCE(LOWER($2),email),role=COALESCE($3,role),active=COALESCE($4,active),password_hash=COALESCE($5,password_hash),updated_at=NOW() WHERE id=$6 RETURNING id,name,email,role,active,created_at,updated_at',[name,email,normalized,active,hash,req.params.id]);await audit(req,'update','admin',{id:req.params.id,role:normalized});res.json(r.rows[0]);}catch(e){res.status(400).json({error:e.code==='23505'?'Email already exists':e.message});}});
app.delete('/api/admin/users/:id',...protect('__super_admin__'),async(req,res)=>{try{if(String(req.params.id)===String(req.user.id))return res.status(400).json({error:'You cannot delete your own account'});await query('DELETE FROM admins WHERE id=$1',[req.params.id]);await audit(req,'delete','admin',{id:req.params.id});res.status(204).end();}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/admin/audit-logs',...protect('__super_admin__'),async(_req,res)=>{try{res.json((await query('SELECT l.*,a.name AS admin_name,a.email AS admin_email FROM audit_logs l LEFT JOIN admins a ON a.id=l.admin_id ORDER BY l.created_at DESC LIMIT 200')).rows);}catch(e){res.status(500).json({error:e.message});}});
app.get('/admin/login',(_req,res)=>res.sendFile(path.join(__dirname,'..','admin','login.html')));
app.get(['/admin','/admin/'],async(_req,res)=>{try{const file=await fs.readFile(path.join(__dirname,'..','admin','index.html'),'utf8');res.type('html').send(file.replace('</body>','<script src="/admin/rbac-client.js"></script></body>'));}catch(e){res.status(500).send('Admin dashboard unavailable');}});
// ===== MyFatoorah payment integration (VetsVan live token, api-sa) =====
const MF_BASE = process.env.MYFATOORAH_BASE_URL || 'https://api-sa.myfatoorah.com';
async function mfCall(p, body) {
  const r = await fetch(MF_BASE + p, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.MYFATOORAH_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
app.post('/api/payments/initiate', async (req, res) => {
  try {
    if (!process.env.MYFATOORAH_API_KEY) return res.status(503).json({ error: 'payment_not_configured' });
    const { customer_name, mobile, email, amount, service, booking_code } = req.body || {};
    if (!customer_name || !amount || Number(amount) <= 0) return res.status(400).json({ error: 'customer_name and positive amount required' });
    const site = process.env.SITE_URL || 'https://vetsvan.onrender.com';
    const r = await mfCall('/v2/SendPayment', {
      CustomerName: customer_name, NotificationOption: 'LNK', InvoiceValue: Number(amount), DisplayCurrencyIso: 'SAR',
      CustomerEmail: email || undefined, CustomerMobile: mobile || undefined,
      CallBackUrl: site + '/api/payments/callback', ErrorUrl: site + '/api/payments/error',
      Language: 'ar', CustomerReference: booking_code || '', UserDefinedField: service || 'VetsVan Service'
    });
    if (!r.IsSuccess) return res.status(502).json({ error: r.Message || 'myfatoorah_error' });
    if (booking_code && pool) await query("UPDATE bookings SET invoice_id=$1, invoice_url=$2, payment_status='pending', amount=$3 WHERE booking_code=$4", [String(r.Data.InvoiceId), r.Data.InvoiceURL, Number(amount), booking_code]).catch(() => {});
    res.json({ ok: true, invoiceUrl: r.Data.InvoiceURL, invoiceId: r.Data.InvoiceId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/payments/callback', async (req, res) => {
  let ok = false;
  try {
    const pid = String(req.query.paymentId || '');
    if (pid && paymentConfigured() && pool) {
      const v = await verifyPayment(pid);
      if (v.bookingCode) {
        // Amount integrity check: invoice value must match the snapshot price
        const br = await query('SELECT invoice_amount FROM bookings WHERE booking_code=$1', [v.bookingCode]);
        const expected = br.rows.length && br.rows[0].invoice_amount !== null ? Number(br.rows[0].invoice_amount) : null;
        const amountOk = expected === null || Number(v.invoiceValue) === expected;
        const finalStatus = v.verified && amountOk ? 'paid' : (v.status === 'paid' ? 'verification_required' : v.status);
        ok = finalStatus === 'paid';
        await query(`UPDATE bookings SET payment_status=$1, payment_id=$2, payment_method=$3, transaction_date=$4, verification_status=$5, paid_at=$6, status=CASE WHEN $1='paid' AND status='pending_payment' THEN 'confirmed' ELSE status END, updated_at=NOW() WHERE booking_code=$7`,
          [finalStatus, pid, v.paymentMethod, v.transactionDate, v.verified && amountOk ? 'verified' : 'failed', v.verified && amountOk ? new Date().toISOString() : null, v.bookingCode]);
        if (ok) await notifyIfNewlyPaid(v.bookingCode);
      }
    }
  } catch {}
  res.redirect(ok ? '/#payment-success' : '/#payment-failed');
});
app.get('/api/payments/error', async (req, res) => {
  try {
    const pid = String(req.query.paymentId || '');
    if (pid && paymentConfigured() && pool) {
      const v = await verifyPayment(pid);
      if (v.bookingCode) await query("UPDATE bookings SET payment_status=$1, payment_id=$2, verification_status='failed', updated_at=NOW() WHERE booking_code=$3", [v.status === 'paid' ? 'verification_required' : v.status, pid, v.bookingCode]);
    }
  } catch {}
  res.redirect('/#payment-failed');
});
// Webhook: MyFatoorah notifies; we NEVER trust the payload — we re-verify server-side.
app.post('/api/payments/webhook', async (req, res) => {
  res.status(200).json({ received: true });
  try {
    if (!paymentConfigured() || !pool) return;
    const d = req.body && req.body.Data ? req.body.Data : req.body || {};
    const pid = d.PaymentId || (req.body && req.body.paymentId);
    if (!pid) return;
    const v = await verifyPayment(String(pid));
    if (v.bookingCode) {
      const finalStatus = v.verified ? 'paid' : v.status;
      await query(`UPDATE bookings SET payment_status=$1, payment_id=$2, payment_method=$3, transaction_date=$4, verification_status=$5, paid_at=$6, status=CASE WHEN $1='paid' AND status='pending_payment' THEN 'confirmed' ELSE status END, updated_at=NOW() WHERE booking_code=$7`,
        [finalStatus, String(pid), v.paymentMethod, v.transactionDate, v.verified ? 'verified' : 'failed', v.verified ? new Date().toISOString() : null, v.bookingCode]);
      if (v.verified) await notifyIfNewlyPaid(v.bookingCode);
    }
  } catch {}
});
app.get('/api/admin/payments', ...protect('bookings:read'), async (req, res) => {
  try {
    const st = String(req.query.status || '').trim();
    const p = [], w = [];
    if (st) { p.push(st); w.push(`b.payment_status=$${p.length}`); }
    const rows = (await query(`SELECT b.id, b.booking_code, b.customer_name, b.mobile, b.email, b.service_price, b.invoice_amount, b.invoice_id, b.payment_id, b.payment_method, b.payment_status, b.transaction_date, b.verification_status, b.paid_at, b.created_at, s.name_en AS service_name, s.name_ar AS service_name_ar FROM bookings b LEFT JOIN services s ON s.id=b.service_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY b.created_at DESC`, p)).rows;
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ===== WhatsApp queue (dashboard: pending messages, one-click send, mark sent/skip) =====
app.get('/api/admin/whatsapp-queue', ...protect('bookings:read'), async (req, res) => {
  try {
    const st = String(req.query.status || '').trim();
    const rows = st
      ? (await query('SELECT * FROM whatsapp_queue WHERE status=$1 ORDER BY created_at DESC LIMIT 200', [st])).rows
      : (await query('SELECT * FROM whatsapp_queue ORDER BY created_at DESC LIMIT 200')).rows;
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/whatsapp-queue/:id/sent', ...protect('bookings:write'), async (req, res) => {
  try { await query("UPDATE whatsapp_queue SET status='sent', sent_at=NOW() WHERE id=$1", [req.params.id]); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/whatsapp-queue/:id/skip', ...protect('bookings:write'), async (req, res) => {
  try { await query("UPDATE whatsapp_queue SET status='skipped' WHERE id=$1", [req.params.id]); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
// Manual re-verification from dashboard (button) — server-side check with MyFatoorah.
app.post('/api/admin/payments/:bookingCode/verify', ...protect('bookings:write'), async (req, res) => {
  try {
    const br = await query('SELECT payment_id FROM bookings WHERE booking_code=$1', [req.params.bookingCode]);
    if (!br.rows.length || !br.rows[0].payment_id) return res.status(404).json({ error: 'no payment to verify' });
    const v = await verifyPayment(br.rows[0].payment_id);
    const finalStatus = v.verified ? 'paid' : v.status;
    await query(`UPDATE bookings SET payment_status=$1, payment_method=$2, transaction_date=$3, verification_status=$4, paid_at=$5, status=CASE WHEN $1='paid' AND status='pending_payment' THEN 'confirmed' ELSE status END, updated_at=NOW() WHERE booking_code=$6`,
      [finalStatus, v.paymentMethod, v.transactionDate, v.verified ? 'verified' : 'failed', v.verified ? new Date().toISOString() : null, req.params.bookingCode]);
    if (v.verified) await notifyIfNewlyPaid(req.params.bookingCode);
    res.json({ ok: true, status: finalStatus, verification: v.verified ? 'verified' : 'failed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

bootstrap().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`VETS VAN server listening on ${PORT}`))).catch(e=>{console.error(e);process.exit(1);});
