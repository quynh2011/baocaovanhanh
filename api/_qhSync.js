// ====== [TNT] - QUY HOẠCH: MÁY CHỦ WEB TỰ ĐỒNG BỘ BẢN ĐỒ TỪ quyhoachbuucuc.info (2026-11-16) ======
// Làm đúng việc Tampermonkey Modul 6 (tryLiveSync_) làm khi mở modul, nhưng chạy trên máy chủ web:
//   tải 6 file bằng phiên đăng nhập quyhoachbuucuc (cookie sid) → đọc backup Drive (GAS_TUYEN_GIAO) → GỘP THEO VÙNG
//   bằng CHÍNH hàm regionMergeData_ của userscript (api/_qhMerge.js, do quyhoach/build.py sinh) → ghi ngược Drive (syncData).
// Cookie sid do Tampermonkey tự chép lên (action qhSaveSid, mỗi lần mở modul) — máy chủ kiểm tra cookie tải được hubs.json
// thật rồi mới lưu. Cookie nằm ở sheet "CauHinhQuyHoach" (A = khoá, B = giá trị), KHÔNG bao giờ trả ra trình duyệt.
const { SHEET_ID, getValues, putValues, ensureSheetWithHeaders, requireActiveUser } = require('./_sheetsClient.js');
const { regionMergeData_ } = require('./_qhMerge.js');

const QH_BASE = 'https://www.quyhoachbuucuc.info';
const QH_GAS = 'https://script.google.com/macros/s/AKfycbx7-gr0yl5Ps9Pn_Ax0nedYCuN3-B9skJ1aSq36ntkltDl_w4SCO86fFnzcYOHQCeb5/exec';
const QH_CFG_SHEET = 'CauHinhQuyHoach';
const QH_SYNC_EVERY_MS = 3 * 3600 * 1000;   // dữ liệu Drive cũ hơn 3 giờ thì tự tải lại
const QH_LOCK_MS = 3 * 60 * 1000;           // đang có lượt chạy trong 3 phút thì không chạy chồng
const QH_FILES = { wardsNew: 'wards_new.geojson', wardsOld: 'wards.geojson', hubs: 'hubs.json', wards: 'wards.json', centroids: 'ward_centroids.json', rezone: 'rezone.json' };

async function readCfg() {
  try {
    const v = await getValues(SHEET_ID, "'" + QH_CFG_SHEET + "'!A1:B30");
    const kv = {};
    (v || []).forEach((r) => { if (r && r[0]) kv[String(r[0]).trim()] = r[1] == null ? '' : String(r[1]); });
    return kv;
  } catch (e) { return {}; }
}
async function writeCfg(patch) {
  await ensureSheetWithHeaders(SHEET_ID, QH_CFG_SHEET, null);
  const kv = Object.assign(await readCfg(), patch);
  const keys = ['cookie', 'cookieLuc', 'cookieBoi', 'dongBoLuc', 'thuLuc', 'ketQua'];
  Object.keys(kv).forEach((k) => { if (keys.indexOf(k) === -1) keys.push(k); });
  await putValues(SHEET_ID, "'" + QH_CFG_SHEET + "'!A1", keys.map((k) => [k, kv[k] == null ? '' : String(kv[k])]));
}

function withTimeout(ms) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); return { signal: ac.signal, done: () => clearTimeout(t) }; }

async function qhGet(path, cookie) {
  const to = withTimeout(25000);
  try {
    const r = await fetch(QH_BASE + '/api/' + path, {
      headers: {
        Cookie: cookie, Accept: 'application/json, text/plain, */*',
        Referer: QH_BASE + '/web/index.html',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
      },
      redirect: 'manual', signal: to.signal
    });
    const txt = await r.text();
    if (r.status !== 200) return { err: 'http_' + r.status };
    try { return { data: JSON.parse(txt) }; } catch (e) { return { err: 'khong_phai_json' }; }
  } catch (e) { return { err: 'loi_mang_' + (e && e.name === 'AbortError' ? 'het_gio' : String(e && e.message || e)) }; }
  finally { to.done(); }
}

async function gasGet(action) {
  const to = withTimeout(25000);
  try {
    const r = await fetch(QH_GAS + '?action=' + encodeURIComponent(action), { signal: to.signal });
    return await r.json();
  } finally { to.done(); }
}
async function gasPost(body) {
  const to = withTimeout(40000);
  try {
    const r = await fetch(QH_GAS, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: to.signal });
    const t = await r.text();
    try { return JSON.parse(t); } catch (e) { return { ok: false, errors: ['GAS trả về không phải JSON (HTTP ' + r.status + ')'] }; }
  } finally { to.done(); }
}

// Đọc backup Drive giống fetchBackupData_ của userscript
async function fetchBackup() {
  const meta = await gasGet('getMeta');
  if (!meta || !meta.ok || !meta.hasHubs || !meta.hasWards || !meta.hasWardsOldGeoJson) return null;
  const g = async (a) => { try { const r = await gasGet(a); return r && r.ok ? r.data : null; } catch (e) { return null; } };
  const [wardsOld, wardsNew, hubs, wards, centroids, rezone] = await Promise.all([
    g('getWardsOldGeoJson'), meta.hasWardsGeoJson ? g('getWardsGeoJson') : null, g('getHubs'), g('getWards'),
    g('getWardCentroids'), meta.hasRezone ? g('getRezone') : null]);
  if (!Array.isArray(hubs) || !Array.isArray(wards)) return null;
  return { wardsOld, wardsNew, hubs, wards, centroids: centroids || {}, rezone };
}

function normCookie(c) {
  c = String(c || '').trim();
  if (!c || c.length > 6000 || /[\r\n]/.test(c)) return '';
  if (!/=/.test(c)) c = 'sid=' + c;
  return c;
}

// Tampermonkey gửi cookie phiên quyhoachbuucuc lên (không cần đăng nhập web — cookie chỉ được lưu khi tải được hubs.json thật).
async function handleQhSaveSid(body) {
  const cookie = normCookie(body && body.cookie);
  if (!cookie) return { ok: false, error: 'thieu_cookie' };
  const t = await qhGet('hubs.json', cookie);
  if (t.err || !Array.isArray(t.data) || !t.data.length || !t.data[0].hub_code) {
    return { ok: false, error: 'cookie_khong_dung_duoc', detail: t.err || 'hubs_rong' };
  }
  const regions = Array.from(new Set(t.data.map((h) => String(h.region || '')).filter(Boolean)));
  await writeCfg({ cookie: cookie, cookieLuc: new Date().toISOString(), cookieBoi: String((body && body.by) || '').slice(0, 120) });
  return { ok: true, hubs: t.data.length, regions: regions };
}

// Web gọi mỗi khi mở tab Quy hoạch: Drive cũ hơn 3 giờ (hoặc force của Admin) → máy chủ tự tải + gộp + ghi Drive.
async function handleQhAutoSync(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const cfg = await readCfg();
  const now = Date.now();
  const last = Date.parse(cfg.dongBoLuc || '') || 0;
  const tried = Date.parse(cfg.thuLuc || '') || 0;
  const info = { dongBoLuc: cfg.dongBoLuc || '', cookieLuc: cfg.cookieLuc || '', ketQua: cfg.ketQua || '' };
  if (!cfg.cookie) return Object.assign({ ok: false, error: 'chua_co_cookie' }, info);
  if (!body.force && now - last < QH_SYNC_EVERY_MS) return Object.assign({ ok: true, skipped: 'moi_dong_bo' }, info);
  if (now - tried < QH_LOCK_MS) return Object.assign({ ok: true, skipped: 'dang_chay' }, info);
  await writeCfg({ thuLuc: new Date(now).toISOString() });

  const keys = Object.keys(QH_FILES);
  const got = await Promise.all(keys.map((k) => qhGet(QH_FILES[k], cfg.cookie)));
  const live = {};
  keys.forEach((k, i) => { live[k] = got[i].data || null; });
  const bad = keys.filter((k, i) => k !== 'rezone' && got[i].err);
  if (bad.length || !Array.isArray(live.hubs) || !live.wardsOld || !Array.isArray(live.wardsOld.features)) {
    const why = bad.map((k) => QH_FILES[k] + ':' + got[keys.indexOf(k)].err).join(', ') || 'du_lieu_khong_hop_le';
    const expired = got.some((x) => /http_(30\d|401|403)|khong_phai_json/.test(x.err || ''));
    await writeCfg({ ketQua: (expired ? 'cookie_het_han' : 'loi_tai') + ' ' + why });
    return Object.assign({ ok: false, error: expired ? 'cookie_het_han' : 'loi_tai', detail: why }, info);
  }
  if (live.wardsNew && !Array.isArray(live.wardsNew.features)) live.wardsNew = null;
  if (live.rezone && !Array.isArray(live.rezone.new_wards)) live.rezone = null;

  const backup = await fetchBackup().catch(() => null);
  const m = regionMergeData_(live, backup);
  const payload = {
    syncedBy: 'Máy chủ web báo cáo tự đồng bộ — mở bởi ' + auth.name + ' (' + auth.email + ') — gộp vùng: ' + m.regions.join(', '),
    wardsGeoJson: JSON.stringify(m.wardsNew), wardsOldGeoJson: JSON.stringify(m.wardsOld),
    hubs: JSON.stringify(m.hubs), wards: JSON.stringify(m.wards), wardCentroids: JSON.stringify(m.centroids)
  };
  if (m.rezone) payload.rezone = JSON.stringify(m.rezone);
  const res = await gasPost(Object.assign({ action: 'syncData' }, payload));
  if (!res || !res.ok) {
    const why = (res && res.errors && res.errors.join(' | ')) || 'ghi_drive_loi';
    await writeCfg({ ketQua: 'loi_ghi_drive ' + why });
    return Object.assign({ ok: false, error: 'loi_ghi_drive', detail: why }, info);
  }
  const at = new Date().toISOString();
  await writeCfg({ dongBoLuc: at, ketQua: 'ok ' + m.hubs.length + ' BC · ' + m.wards.length + ' xã/phường · vùng ' + m.regions.join(', ') });
  return { ok: true, synced: true, dongBoLuc: at, hubs: m.hubs.length, wards: m.wards.length, regions: m.regions, liveRegions: Array.from(new Set((live.hubs || []).map((h) => h.region).filter(Boolean))) };
}

// Cơ cấu bưu cục (sheet 999_Cocau) cho lớp Tỉnh / AM của bản đồ quy hoạch — dùng chung cho web + Tampermonkey (không cần đăng nhập web,
// chỉ trả tên BC / mã BC / AM / Tỉnh, không trả cột khác). Cột dò theo TÊN.
const qhNorm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
let qhCocauCache = null;
async function qhCocauCheck(rows) {
  // Bảng thô: hàng 1 = tiêu đề; cột A "Cấp quản lý" (AM theo hệ thống), cột B "Chi tiết" (bưu cục), cột "Chuẩn ngày".
  // AM của mỗi BC lấy theo NGÀY MỚI NHẤT (BC đổi AM thì lấy AM hiện tại).
  const v = await getValues(SHEET_ID, "'200_1_GTCTOTAL'!A1:Z40000", { valueRenderOption: 'UNFORMATTED_VALUE' });
  const H = (v[0] || []).map(qhNorm);
  const fi = (re, d) => { const i = H.findIndex((h) => re.test(h)); return i >= 0 ? i : d; };
  const cA = fi(/^cap quan ly/, 0), cB = fi(/^chi tiet/, 1), cD = fi(/^chuan ngay/, -1);
  const sys = {};
  (v || []).slice(1).forEach((r) => {
    const a = String(r[cA] == null ? '' : r[cA]).trim(), b = String(r[cB] == null ? '' : r[cB]).trim();
    if (!b || /^(grand total|tong)/.test(qhNorm(b))) return;
    const d = cD >= 0 ? (+r[cD] || 0) : 0;
    const k = qhNorm(b);
    if (!sys[k] || d >= sys[k].d) sys[k] = { bc: b, am: a || (sys[k] && sys[k].am) || '', d };
  });
  const cc = {};
  rows.forEach((r) => { cc[qhNorm(r[0])] = { bc: r[0], am: r[2], id: r[4] }; });
  const amKey = (s) => qhNorm(s).replace(/^\d+\s*-\s*/, '').replace(/^am\s+/, '');
  const sameAm = (sysAm, c) => { const a = qhNorm(sysAm); if (!a) return true; if (c.id && a.indexOf(qhNorm(c.id)) >= 0) return true; const n = amKey(c.am); return !!n && (amKey(sysAm) === n || a.indexOf(n) >= 0); };
  const thieu = [], lechAm = [], du = [];
  Object.keys(sys).forEach((k) => { const s = sys[k], c = cc[k]; if (!c) thieu.push({ bc: s.bc, amHt: s.am }); else if (!sameAm(s.am, c)) lechAm.push({ bc: s.bc, amCc: (c.id ? c.id + ' - ' : '') + c.am, amHt: s.am }); });
  Object.keys(cc).forEach((k) => { if (!sys[k]) du.push({ bc: cc[k].bc, amCc: (cc[k].id ? cc[k].id + ' - ' : '') + cc[k].am }); });
  return { soHt: Object.keys(sys).length, soCc: rows.length, thieu, lechAm, du };
}
async function handleQhCocau(body) {
  if (qhCocauCache && Date.now() - qhCocauCache.t < 5 * 60 * 1000 && !(body && body.fresh)) return qhCocauCache.res;
  const cc = await getValues(SHEET_ID, "'999_Cocau'!A1:Z3000", { valueRenderOption: 'FORMATTED_VALUE' });
  const head = cc[0] || [], H = head.map(qhNorm);
  const find = (res) => { for (const re of res) { const i = H.findIndex((h) => re.test(h)); if (i >= 0) return i; } return -1; };
  const cBc = find([/^buu cuc moi/, /^ten buu cuc/, /^buu cuc$/, /^buu cuc/, /^chi tiet/]);
  const cMa = find([/^ma buu cuc/, /^ma bc/, /^hub ?code/, /^ma kho/, /^ma$/]);
  const cAm = find([/^chuan am/, /^am moi/, /^am$/, /^am /, /quan ly/]);
  const cTinh = find([/^tinh moi/, /^tinh$/, /^tinh /, /tinh\/thanh/]);
  const cId = find([/^id am/, /^ma am/, /^msnv am/]);
  const rows = [];
  if (cBc >= 0) cc.slice(1).forEach((r) => {
    const bc = String(r[cBc] || '').trim(); if (!bc) return;
    const am = cAm >= 0 ? String(r[cAm] || '').trim() : ''; if (/^loai$/i.test(qhNorm(am))) return;
    rows.push([bc, cMa >= 0 ? String(r[cMa] || '').trim() : '', am, cTinh >= 0 ? String(r[cTinh] || '').trim() : '', cId >= 0 ? String(r[cId] || '').trim() : '']);
  });
  // So cơ cấu (sheet tự cập nhật tay) với cơ cấu theo HỆ THỐNG công ty = bảng GTC tổng (cột A = cấp quản lý/AM hệ thống, cột B = bưu cục)
  let kiemTra = null;
  try { kiemTra = await qhCocauCheck(rows); } catch (e) { kiemTra = { loi: String(e && e.message || e) }; }
  const res = { ok: true, cols: head, dung: { bc: head[cBc] || null, ma: head[cMa] || null, am: head[cAm] || null, tinh: head[cTinh] || null, idAm: head[cId] || null }, rows, kiemTra };
  qhCocauCache = { t: Date.now(), res };
  return res;
}

// ====== BẢN NHÁP QUY HOẠCH (2026-11-16) — gộp xã/phường/bưu cục thành quy hoạch mới, lưu CHUNG ở sheet "QuyHoachNhap" ======
// Ai cũng (đã đăng nhập) XEM được; chỉ Admin + Quản lý được tạo/sửa/xoá.
//   - Web báo cáo: body.token = phiên web (vai trò Admin / Quản lý theo sheet Main).
//   - Tampermonkey: body.ghnToken = token GHN đang đăng nhập nhanh.ghn.vn → máy chủ hỏi GHN /my-profile lấy ssoId
//     → hỏi quyền Modul 6 (GAS getPermission: ADMIN / QUAN_LY / NHAN_VIEN). Token GHN chỉ dùng để xác thực, KHÔNG lưu.
// Cột: A ID · B Tên · C Ghi chú · D Người tạo · E Mã người tạo · F Tạo lúc · G Sửa lúc · H Người sửa · I Xoá · J.. Dữ liệu (JSON, cắt 45.000 ký tự/ô)
const QHD_SHEET = 'QuyHoachNhap';
const QHD_HEAD = ['ID', 'Tên bản nháp', 'Ghi chú', 'Người tạo', 'Mã người tạo', 'Tạo lúc', 'Sửa lúc', 'Người sửa', 'Xoá', 'Dữ liệu'];
const QHD_CHUNK = 45000;
const qhdAuthCache = {};
function qhdHash(t) { return require('crypto').createHash('sha256').update(String(t)).digest('hex'); }
async function qhdAuth(body) {
  body = body || {};
  if (body.token) {
    const a = await requireActiveUser(body.token);
    if (a.error) return { error: a.error };
    return { who: a.name || a.email, id: a.email, canEdit: a.role === 'Admin' || a.role === 'Quản lý', isAdmin: a.role === 'Admin' };
  }
  if (body.ghnToken) {
    const k = qhdHash(body.ghnToken);
    const c = qhdAuthCache[k];
    if (c && Date.now() - c.t < 10 * 60 * 1000) return c.v;
    const to = withTimeout(15000);
    let prof;
    try {
      const r = await fetch('https://nhanh-api.ghn.vn/api/lastmile/user/my-profile', {
        method: 'POST', signal: to.signal,
        headers: { accept: 'application/json, text/plain, */*', authorization: 'Bearer ' + body.ghnToken, 'content-type': 'application/json', origin: 'https://nhanh.ghn.vn', referer: 'https://nhanh.ghn.vn/' },
        body: '{}'
      });
      if (r.status === 401 || r.status === 403) return { error: 'ghn_token_het_han' };
      const j = await r.json();
      const u = j && j.data && j.data.userInfo;
      if (!u || !u.ssoId) return { error: 'ghn_khong_xac_thuc' };
      prof = { ssoId: String(u.ssoId).trim(), name: (u.profile && u.profile.fullname) || '' };
    } catch (e) { return { error: 'ghn_loi_mang' }; } finally { to.done(); }
    let perm = null;
    const tp = withTimeout(25000);
    try {
      const r = await fetch(QH_GAS + '?action=getPermission&ssoId=' + encodeURIComponent(prof.ssoId), { signal: tp.signal });
      perm = await r.json();
    } catch (e) { perm = null; } finally { tp.done(); }
    if (!perm || !perm.ok || !perm.found) return { error: 'khong_co_quyen' };
    const role = String(perm.role || '').toUpperCase();
    const v = { who: prof.name || prof.ssoId, id: 'GHN ' + prof.ssoId, canEdit: role === 'ADMIN' || role === 'QUAN_LY', isAdmin: role === 'ADMIN' };
    qhdAuthCache[k] = { t: Date.now(), v };
    return v;
  }
  return { error: 'session_expired' };
}
function qhdColA1(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
const qhdTxt = (s, n) => String(s == null ? '' : s).replace(/^[=+\-@]+/, '').slice(0, n || 200);
async function qhdRead() {
  await ensureSheetWithHeaders(SHEET_ID, QHD_SHEET, QHD_HEAD);
  return (await getValues(SHEET_ID, "'" + QHD_SHEET + "'!A1:T2000", { valueRenderOption: 'FORMATTED_VALUE' })) || [];
}
function qhdRow(r) {
  let data = null;
  try { data = JSON.parse(r.slice(9).map((x) => (x == null ? '' : String(x).replace(/^~/, ''))).join('')); } catch (e) { data = null; }
  return { id: String(r[0] || ''), ten: r[1] || '', ghiChu: r[2] || '', nguoiTao: r[3] || '', maNguoiTao: r[4] || '', taoLuc: r[5] || '', suaLuc: r[6] || '', nguoiSua: r[7] || '', data };
}
async function handleQhDraftList(body) {
  const au = await qhdAuth(body);
  if (au.error) return { ok: false, error: au.error };
  const v = await qhdRead();
  const drafts = v.slice(1).filter((r) => r && r[0] && String(r[8] || '') !== '1').map(qhdRow).filter((d) => d.data);
  return { ok: true, drafts, canEdit: au.canEdit, isAdmin: au.isAdmin, who: au.who, me: au.id };
}
async function handleQhDraftSave(body) {
  const au = await qhdAuth(body);
  if (au.error) return { ok: false, error: au.error };
  if (!au.canEdit) return { ok: false, error: 'khong_co_quyen_sua' };
  const d = (body && body.draft) || {};
  if (!d.data || typeof d.data !== 'object') return { ok: false, error: 'thieu_du_lieu' };
  const json = JSON.stringify(d.data);
  if (json.length > QHD_CHUNK * 10) return { ok: false, error: 'du_lieu_qua_lon' };
  // mỗi ô có tiền tố "~" để Google Sheet không hiểu nhầm thành số / công thức
  const chunks = []; for (let i = 0; i < json.length; i += QHD_CHUNK) chunks.push('~' + json.slice(i, i + QHD_CHUNK));
  while (chunks.length < 10) chunks.push('');
  const v = await qhdRead();
  const now = new Date().toISOString();
  let rowIdx = -1, cur = null;
  if (d.id) { rowIdx = v.findIndex((r, i) => i > 0 && r && String(r[0]) === String(d.id)); if (rowIdx < 0) return { ok: false, error: 'khong_tim_thay_ban_nhap' }; cur = v[rowIdx]; }
  if (cur && d.suaLuc && String(cur[6] || '') && String(cur[6]) !== String(d.suaLuc)) return { ok: false, error: 'ban_nhap_da_bi_sua', nguoiSua: cur[7] || '', suaLuc: cur[6] || '' };
  const id = cur ? String(cur[0]) : 'QH' + Date.now().toString(36).toUpperCase();
  const row = [id, qhdTxt(d.ten, 120) || 'Bản nháp', qhdTxt(d.ghiChu, 1000), cur ? cur[3] : au.who, cur ? cur[4] : au.id, cur ? cur[5] : now, now, au.who, ''].concat(chunks);
  const r1 = rowIdx > 0 ? rowIdx + 1 : v.length + 1;
  await putValues(SHEET_ID, "'" + QHD_SHEET + "'!A" + r1 + ':' + qhdColA1(row.length - 1) + r1, [row.map((x) => (x == null ? '' : String(x)))]);
  return { ok: true, id, suaLuc: now };
}
async function handleQhDraftDelete(body) {
  const au = await qhdAuth(body);
  if (au.error) return { ok: false, error: au.error };
  if (!au.canEdit) return { ok: false, error: 'khong_co_quyen_sua' };
  const v = await qhdRead();
  const idx = v.findIndex((r, i) => i > 0 && r && String(r[0]) === String(body && body.id));
  if (idx < 0) return { ok: false, error: 'khong_tim_thay_ban_nhap' };
  if (!au.isAdmin && String(v[idx][4] || '') !== au.id) return { ok: false, error: 'chi_nguoi_tao_hoac_admin_duoc_xoa' };
  await putValues(SHEET_ID, "'" + QHD_SHEET + "'!G" + (idx + 1) + ':I' + (idx + 1), [[new Date().toISOString(), au.who, '1']]);
  return { ok: true };
}

module.exports = { handleQhSaveSid, handleQhAutoSync, handleQhCocau, handleQhDraftList, handleQhDraftSave, handleQhDraftDelete };
