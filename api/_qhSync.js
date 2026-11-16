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
async function handleQhCocau(body) {
  if (qhCocauCache && Date.now() - qhCocauCache.t < 5 * 60 * 1000 && !(body && body.fresh)) return qhCocauCache.res;
  const cc = await getValues(SHEET_ID, "'999_Cocau'!A1:Z3000", { valueRenderOption: 'FORMATTED_VALUE' });
  const head = cc[0] || [], H = head.map(qhNorm);
  const find = (res) => { for (const re of res) { const i = H.findIndex((h) => re.test(h)); if (i >= 0) return i; } return -1; };
  const cBc = find([/^buu cuc moi/, /^ten buu cuc/, /^buu cuc$/, /^buu cuc/, /^chi tiet/]);
  const cMa = find([/^ma buu cuc/, /^ma bc/, /^hub ?code/, /^ma kho/, /^ma$/]);
  const cAm = find([/^chuan am/, /^am moi/, /^am$/, /^am /, /quan ly/]);
  const cTinh = find([/^tinh moi/, /^tinh$/, /^tinh /, /tinh\/thanh/]);
  const rows = [];
  if (cBc >= 0) cc.slice(1).forEach((r) => {
    const bc = String(r[cBc] || '').trim(); if (!bc) return;
    const am = cAm >= 0 ? String(r[cAm] || '').trim() : ''; if (/^loai$/i.test(qhNorm(am))) return;
    rows.push([bc, cMa >= 0 ? String(r[cMa] || '').trim() : '', am, cTinh >= 0 ? String(r[cTinh] || '').trim() : '']);
  });
  const res = { ok: true, cols: head, dung: { bc: head[cBc] || null, ma: head[cMa] || null, am: head[cAm] || null, tinh: head[cTinh] || null }, rows };
  qhCocauCache = { t: Date.now(), res };
  return res;
}

module.exports = { handleQhSaveSid, handleQhAutoSync, handleQhCocau };
