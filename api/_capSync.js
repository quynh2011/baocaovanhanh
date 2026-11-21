// ====== CAPACITY · TẮT TUYẾN SHOPEE (2026-11-21) ======
// Dữ liệu từ capacity.ghn.vn (/vung/api/v1/tat-tuyen/dang-tat?kenh=shopee) nằm sau phiên SSO của người dùng.
// Máy chủ web KHÔNG giữ phiên đó: nút dấu trang "Gửi Capacity về báo cáo TNT" chạy NGAY trên trang capacity.ghn.vn
// (cùng tên miền → dùng phiên sẵn có của trình duyệt), lấy bảng tắt tuyến, CHỈ giữ dòng vùng TNT rồi chuyển về tab web
// báo cáo (postMessage / #capData=). Web (đã đăng nhập) gọi capSave để lưu BẢN CHỤP vào sheet "CapacityTatTuyen"
// → mọi người mở tab Capacity đều thấy bản chụp mới nhất (capGet). Không có cookie/token nào rời trình duyệt.
const { SHEET_ID, getValues, putValues, ensureSheetWithHeaders, requireActiveUser } = require('./_sheetsClient.js');

const CAP_SHEET = 'CapacityTatTuyen';
const CAP_CHUNK = 45000;   // mỗi ô ≤ 50.000 ký tự
const CAP_MAX_CHUNKS = 40;

async function capRead() {
  try {
    const v = await getValues(SHEET_ID, "'" + CAP_SHEET + "'!A1:B60", { valueRenderOption: 'FORMATTED_VALUE' });
    const kv = {}, parts = [];
    (v || []).forEach((r) => {
      if (!r || !r[0]) return;
      const k = String(r[0]).trim(), val = r[1] == null ? '' : String(r[1]);
      const m = /^json(\d+)$/.exec(k);
      if (m) parts[+m[1]] = val.replace(/^~/, ''); else kv[k] = val;
    });
    return { kv, json: parts.join('') };
  } catch (e) { return { kv: {}, json: '' }; }
}

// Kiểm tra gói dữ liệu đúng hình dạng (chỉ nhận số/chữ cần thiết, không nhận gì lạ)
function capClean(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.rows)) return null;
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
  const txt = (x, n) => String(x == null ? '' : x).replace(/^[=+\-@]+/, '').slice(0, n || 120);
  const g = (o) => (o && typeof o === 'object' ? { tu: num(o.tu), mau: num(o.mau), so_ngay: num(o.so_ngay) } : null);
  const rows = d.rows.slice(0, 2000).map((r) => ({
    dong_id: txt(r.dong_id, 40), tinh_ten: txt(r.tinh_ten), phuong_ten: txt(r.phuong_ten), bc_chinh_ten: txt(r.bc_chinh_ten),
    vat: !!r.vat, vung: txt(r.vung, 10), nguon_tat: txt(r.nguon_tat, 40), trang_thai: txt(r.trang_thai, 40),
    ngay_tat: txt(r.ngay_tat, 10), ngay_mo: txt(r.ngay_mo, 10), muc: num(r.muc), nhan: r.nhan == null ? null : txt(r.nhan, 40),
    co: Array.isArray(r.co) ? r.co.slice(0, 10).map((x) => txt(x, 40)) : [],
    gtc_truoc: g(r.gtc_truoc), gtc_nay: g(r.gtc_nay), gtc_tuan: Array.isArray(r.gtc_tuan) ? r.gtc_tuan.slice(0, 12).map(g) : [],
    ton_truoc: num(r.ton_truoc), ton_nay: num(r.ton_nay), cap: num(r.cap), don_truoc: num(r.don_truoc), don_nay: num(r.don_nay)
  }));
  const lop = d.lop && typeof d.lop === 'object' ? { ngay_cham: txt(d.lop.ngay_cham, 10), ban_ngay: txt(d.lop.ban_ngay, 10), sinh_luc: num(d.lop.sinh_luc) } : null;
  const dem = d.dem && typeof d.dem === 'object' ? { dot_id_mo: txt(d.dem.dot_id_mo, 20) } : null;
  let tts = null;
  if (d.tts && typeof d.tts === 'object' && Array.isArray(d.tts.rows)) {
    tts = {
      ban_ngay: txt(d.tts.ban_ngay, 10), sinh_luc: num(d.tts.sinh_luc),
      rows: d.tts.rows.slice(0, 2000).map((r) => ({
        dong_id: txt(r.dong_id, 40), vung: txt(r.vung, 10), tinh_ten: txt(r.tinh_ten), phuong_ten: txt(r.phuong_ten), bc_chinh_ten: txt(r.bc_chinh_ten),
        bc_ten: Array.isArray(r.bc_ten) ? r.bc_ten.slice(0, 10).map((x) => txt(x)) : [], vat: !!r.vat, muc: num(r.muc),
        ngay_tat: r.ngay_tat ? txt(r.ngay_tat, 10) : null, dot: txt(r.dot, 80), nhom: txt(r.nhom, 40), ly_do: txt(r.ly_do, 200), ghi_chu: txt(r.ghi_chu, 200),
        don_truoc: num(r.don_truoc), don_truoc_ky: txt(r.don_truoc_ky, 30)
      })),
      mo_lai: Array.isArray(d.tts.mo_lai) ? d.tts.mo_lai.slice(0, 1000).map((r) => ({ dong_id: txt(r.dong_id, 40), vung: txt(r.vung, 10), tinh_ten: txt(r.tinh_ten), phuong_ten: txt(r.phuong_ten), bc_chinh_ten: txt(r.bc_chinh_ten), ngay_tat: txt(r.ngay_tat, 10), mo_ngay: txt(r.mo_ngay, 10) })) : []
    };
  }
  let tonghop = null;
  const G = d.tonghop;
  if (G && typeof G === 'object' && Array.isArray(G.hang)) {
    const k3 = (o) => (o && typeof o === 'object' ? { tat_han: num(o.tat_han) || 0, giam: num(o.giam) || 0, giam_muc: o.giam_muc && typeof o.giam_muc === 'object' ? Object.fromEntries(Object.keys(o.giam_muc).slice(0, 10).map((m) => [txt(m, 10), num(o.giam_muc[m]) || 0])) : {} } : { tat_han: 0, giam: 0, giam_muc: {} });
    tonghop = {
      kenh: Array.isArray(G.kenh) ? G.kenh.slice(0, 10).map((k) => ({ ma: txt(k.ma, 10), co_nguon: !!k.co_nguon, ban_ngay: k.ban_ngay ? txt(k.ban_ngay, 10) : null, sinh_luc: num(k.sinh_luc) })) : [],
      hang: G.hang.slice(0, 50).map((x) => ({ vung: txt(x.vung, 10), sp: k3(x.sp), tts: k3(x.tts), tong: k3(x.tong) })),
      tong: G.tong ? { sp: k3(G.tong.sp), tts: k3(G.tong.tts), tong: k3(G.tong.tong) } : null
    };
  }
  return { v: 2, kenh: txt(d.kenh || 'shopee', 20), vung: txt(d.vung || 'TNT', 10), at: num(d.at) || Date.now(), lop, dem, rows, tts, tonghop };
}

async function handleCapSave(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const data = capClean(body && body.data);
  if (!data) return { ok: false, error: 'du_lieu_khong_dung' };
  const json = JSON.stringify(data);
  const chunks = [];
  for (let i = 0; i < json.length; i += CAP_CHUNK) chunks.push('~' + json.slice(i, i + CAP_CHUNK));
  if (chunks.length > CAP_MAX_CHUNKS) return { ok: false, error: 'du_lieu_qua_lon' };
  await ensureSheetWithHeaders(SHEET_ID, CAP_SHEET, null);
  const luc = new Date().toISOString();
  const rows = [['luc', luc], ['boi', auth.name || auth.email], ['soDong', String(data.rows.length)]];
  for (let i = 0; i < CAP_MAX_CHUNKS; i++) rows.push(['json' + i, chunks[i] || '']);
  await putValues(SHEET_ID, "'" + CAP_SHEET + "'!A1", rows);
  return { ok: true, luc, boi: auth.name || auth.email, soDong: data.rows.length };
}

async function handleCapGet(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const r = await capRead();
  let data = null;
  try { data = r.json ? JSON.parse(r.json) : null; } catch (e) { data = null; }
  return { ok: true, luc: r.kv.luc || '', boi: r.kv.boi || '', data };
}

module.exports = { handleCapSave, handleCapGet, capClean };
