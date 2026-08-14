/* ============================================================================================
   CLIENT GỌI THẲNG GOOGLE SHEETS API — thay cho gọi qua Apps Script /exec (đường đó bị GHN chặn
   vì deployment "Anyone within GHN" chỉ nhận request có phiên đăng nhập Google thật, một server
   gọi bằng OAuth Bearer token KHÔNG được coi là "đã đăng nhập trong trình duyệt").

   Cách mới: dùng CHÍNH access token của quynhpv1@ghn.vn — chủ sở hữu/người chỉnh sửa Sheet dữ
   liệu — để gọi thẳng Google Sheets REST API (v4). Vì đây là chủ sở hữu Sheet nên KHÔNG cần share
   thêm cho ai/service account nào cả, và vì gọi thẳng Sheets API (không qua Apps Script web app)
   nên hoàn toàn không dính chính sách "Anyone within GHN".

   Refresh token (scope .../auth/spreadsheets) lưu ở biến môi trường Vercel GOOGLE_OAUTH_REFRESH_TOKEN.
   File này KHÔNG bắt đầu bằng chữ, nhưng có prefix "_" nên Vercel không biến nó thành 1 route riêng
   (chỉ dùng làm module dùng chung, require() từ api/gas.js).
   ============================================================================================ */
'use strict';

const crypto = require('crypto');

// ====== CẤU HÌNH (giữ đúng như Code.gs) ======
const SHEET_ID = '1j3KarXqurcP0GxPE3A4qSxVXs2nfkUM87QscsY5_DtU';
// Sheet "Kế hoạch kinh doanh" — dùng chung cho 3 tính năng: Kế hoạch kinh doanh (Kehoach/Ketqua/Tiendo),
// Báo Cáo Kết Quả KD (BCKQKD_*) và Kế hoạch Event (EVENT_*). Cùng chủ sở hữu Google (quynhpv1@ghn.vn) với
// sheet vận hành ở trên nên dùng chung access token, không cần cấu hình OAuth thêm.
const KEHOACH_SHEET_ID = '1HxAQ6aUAqvme6ixsiSr-QmvjSLLBPnl2TQkLadQyjvk';
const KEHOACH_DRIVE_FOLDER_ID = '1fmIbxoMYUzxVobE8aLPDXzohpXlFy45n';
const MAIN_SHEET_NAME = 'Main';
const ALLOWED_EMAIL_DOMAIN = 'ghn.vn';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LEN = 8;
// OTP xác thực lại phiên (sau 24h) — port từ Code.gs. Khác bản gốc (dùng CacheService trong Apps
// Script): ở đây hàm chạy trên Vercel serverless (mỗi lần gọi có thể là 1 tiến trình khác nhau,
// không có bộ nhớ dùng chung đáng tin cậy), nên OTP được lưu tạm ngay trong sheet "Main" (dùng
// chung 2 cột OTP/OTPHetHan với luồng "quên mật khẩu" — cùng ý nghĩa: 1 mã dùng 1 lần, có hạn).
const SESSION_OTP_TTL_MS = 60 * 1000;

const COL_KH = { THOIGIAN: 1, NGUOILAP: 2, NGAYLAP: 3, NGAYTHUCHIEN: 4, NHOMKH: 5, SDT: 6, TENSHOP: 7,
  DIACHI: 8, DOITHU: 9, BANGGIA: 10, CHINHSACH: 11, SANLUONGTHANG: 12, SANLUONGTANGTHEM: 13, KHOILUONG: 14,
  IDKHACHHANG: 15, SANPHAM: 16, NGUYENNHAN: 17, TRANGTHAI: 18 };
const COL_KQ = { THOIGIAN: 1, IDKHACHHANG: 2, TENSHOP: 3, NGAYTIEPCAN: 4, DIACHI: 5, ANHCHECKIN: 6,
  ANHSANPHAM: 7, SANLUONGGUIGHN: 8, BANGGIA: 9, NGAYBATDAULENDON: 10 };
const COL_TD = { THOIGIAN: 1, IDKHACHHANG: 2, SDT: 3, TENSHOP: 4, NGAYGAPKH: 5, DIACHI: 6, ANHCHECKIN: 7,
  ANHSANPHAM: 8, SANPHAM: 9, DOITHU: 10, BANGGIA: 11, CHINHSACH: 12, SANLUONG: 13, KHOILUONG: 14,
  LYDO: 15, DEXUAT: 16 };

const BCKQKD_SHEETS = { CONFIG: 'BCKQKD_Config', PERIODS: 'BCKQKD_Periods', SUBMISSIONS: 'BCKQKD_Submissions', AGGREGATE: 'BCKQKD_Aggregate' };
const EVENT_SHEETS = { CONFIG: 'EVENT_Config', PERIODS: 'EVENT_Periods', SUBMISSIONS: 'EVENT_Submissions' };
const GEMINI_MODEL = 'gemini-2.5-flash';

const DATA_SHEET_NAMES = ['01_Scorecard', '02_OPR', '03_ODR', '04_FD', '05_RotLC',
  '06_BL_LC_36H', '07_GTC', '08_BL_Giao_120H', '09_BL_LC_Tra_48H', '10_BL_Tra_120H',
  '11_KTC_ChoNhap', '12_KTC_NhapXuat', '13_KTC_Ton24H',
  '21_KD_HangNangNhe', '22_KD_HangNang', '23_KD_HangNhe', '24_KD_BanMoi', '24_KD_BanMoiAM',
  '31_FC_Lay', '32_FC_Giao', '33_FC_KTC'];

const COL = { EMAIL: 1, HOTEN: 2, HASH: 3, SALT: 4, ACTIVE: 5, VAITRO: 6, NGAYTAO: 7,
  DANGNHAPGANNHAT: 8, SOLANSAI: 9, KHOADENLUC: 10, OTP: 11, OTPHETHAN: 12, GHICHU: 13,
  QUYEN_TAIHTML: 14, QUYEN_COPY: 15, QUYEN_CHUPMANHINH: 16 };

const ROLE_FIELD = { 'Admin': 'admin', 'Quản lý': 'quanLy', 'Nhân viên xử lý': 'nhanVienXuLy', 'Nhân viên': 'nhanVien' };

const MODULE_DEFS = [
  { id: 'vanhanh', label: 'Vận hành', cap: 'section', chaId: '' },
  { id: 'vh_ngay', label: 'Vận hành › Ngày', cap: 'tab', chaId: 'vanhanh' },
  { id: 'vh_tuan', label: 'Vận hành › Tuần', cap: 'tab', chaId: 'vanhanh' },
  { id: 'vh_thang', label: 'Vận hành › Tháng', cap: 'tab', chaId: 'vanhanh' },
  { id: 'kinhdoanh', label: 'Kinh doanh', cap: 'section', chaId: '' },
  { id: 'kd_ngay', label: 'Kinh doanh › Ngày', cap: 'tab', chaId: 'kinhdoanh' },
  { id: 'kd_tuan', label: 'Kinh doanh › Tuần', cap: 'tab', chaId: 'kinhdoanh' },
  { id: 'kd_thang', label: 'Kinh doanh › Tháng', cap: 'tab', chaId: 'kinhdoanh' },
  { id: 'kd_kehoach', label: 'Kinh doanh › Kế hoạch kinh doanh', cap: 'tab', chaId: 'kinhdoanh' },
  { id: 'kd_kehoach_lap', label: 'Kế hoạch KD › Lập Kế Hoạch', cap: 'subtab', chaId: 'kd_kehoach' },
  { id: 'kd_kehoach_capnhat', label: 'Kế hoạch KD › Cập Nhật Tiến Độ', cap: 'subtab', chaId: 'kd_kehoach' },
  { id: 'kd_kehoach_baocaokh', label: 'Kế hoạch KD › Báo Cáo Kế Hoạch', cap: 'subtab', chaId: 'kd_kehoach' },
  { id: 'kd_kehoach_tongquan', label: 'Kế hoạch KD › Báo Cáo Tổng Quan', cap: 'subtab', chaId: 'kd_kehoach' },
  { id: 'kd_kehoach_kinhdoanh', label: 'Kế hoạch KD › Báo Cáo Kinh Doanh', cap: 'subtab', chaId: 'kd_kehoach' },
  { id: 'kd_kehoach_bieudo', label: 'Kế hoạch KD › Biểu Đồ', cap: 'subtab', chaId: 'kd_kehoach' },
  { id: 'kd_bckqkd', label: 'Kinh doanh › Báo Cáo Kết Quả KD', cap: 'tab', chaId: 'kinhdoanh' },
  { id: 'kd_bckqkd_submit', label: 'BCKQKD › Nộp Báo Cáo', cap: 'subtab', chaId: 'kd_bckqkd' },
  { id: 'kd_bckqkd_aggregate', label: 'BCKQKD › Báo Cáo Tổng Hợp', cap: 'subtab', chaId: 'kd_bckqkd' },
  { id: 'truythu', label: 'Truy thu', cap: 'section', chaId: '' },
  { id: 'capacity', label: 'Capacity', cap: 'section', chaId: '' },
  { id: 'nhansu', label: 'Nhân sự', cap: 'section', chaId: '' },
  { id: 'lichlamviec', label: 'Lịch làm việc', cap: 'section', chaId: '' },
  { id: 'llv_canhbao', label: 'Lịch làm việc › Cảnh báo hạn', cap: 'tab', chaId: 'lichlamviec' },
  { id: 'llv_lichhop', label: 'Lịch làm việc › Lịch họp', cap: 'tab', chaId: 'lichlamviec' },
  { id: 'llv_congviec', label: 'Lịch làm việc › Công việc', cap: 'tab', chaId: 'lichlamviec' },
  { id: 'llv_canhan', label: 'Lịch làm việc › Công việc cá nhân', cap: 'tab', chaId: 'lichlamviec' },
  { id: 'sapramat', label: 'Sắp ra mắt', cap: 'section', chaId: '' }
];
const MODULE_CONFIG_SHEET_NAME = 'CauHinhHangMuc';

// ====== OAUTH: đổi refresh token lấy access token (scope spreadsheets) ======
// Cache theo instance (best-effort — Vercel có thể tái dùng cùng 1 tiến trình giữa các lần gọi
// gần nhau, không đảm bảo, nhưng nếu trúng thì đỡ round-trip). Không cache được thì tự đổi lại.
let _cachedToken = null;
async function getAccessToken() {
  const now = Date.now();
  if (_cachedToken && _cachedToken.exp > now + 30000) return _cachedToken.token;

  const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    const e = new Error('oauth_chua_cau_hinh');
    e.code = 'oauth_chua_cau_hinh';
    throw e;
  }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token'
    })
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || !data.access_token) {
    const e = new Error('doi_access_token_that_bai_' + r.status + '_' + (data && data.error || '?'));
    e.code = 'doi_access_token_that_bai';
    throw e;
  }
  _cachedToken = { token: data.access_token, exp: now + (Number(data.expires_in) || 3600) * 1000 };
  return _cachedToken.token;
}

async function apiCall(spreadsheetId, pathAndQuery, opts) {
  opts = opts || {};
  const token = await getAccessToken();
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + pathAndQuery;
  const headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
  if (opts.body) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, { method: opts.method || 'GET', headers: headers, body: opts.body });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* giữ null */ }
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || text.slice(0, 300);
    const e = new Error('sheets_api_loi_' + r.status + '_' + msg);
    e.status = r.status;
    throw e;
  }
  return data;
}

// ====== GỬI EMAIL (Gmail API) — dùng cho OTP đổi mật khẩu / xác thực lại phiên ======
// Cần refresh token có thêm scope https://www.googleapis.com/auth/gmail.send (cấp thêm sau khi
// phát hiện các luồng OTP chưa hoạt động — xem ghi chú trong api/gas.js). Gửi bằng chính hộp thư
// quynhpv1@ghn.vn, giống hệt MailApp.sendEmail() bên Code.gs cũ.
async function sendGmailMessage(to, subject, bodyText) {
  const token = await getAccessToken();
  const subjectB64 = Buffer.from(subject, 'utf8').toString('base64');
  const raw =
    'To: ' + to + '\r\n' +
    'Subject: =?UTF-8?B?' + subjectB64 + '?=\r\n' +
    'MIME-Version: 1.0\r\n' +
    'Content-Type: text/plain; charset="UTF-8"\r\n' +
    'Content-Transfer-Encoding: 8bit\r\n\r\n' +
    bodyText;
  const rawB64Url = Buffer.from(raw, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: rawB64Url })
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* giữ null */ }
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || text.slice(0, 300);
    const e = new Error('gmail_gui_that_bai_' + r.status + '_' + msg);
    e.status = r.status;
    throw e;
  }
  return data;
}

async function getValues(spreadsheetId, range, opts) {
  opts = opts || {};
  const qs = new URLSearchParams({
    valueRenderOption: opts.valueRenderOption || 'UNFORMATTED_VALUE',
    dateTimeRenderOption: opts.dateTimeRenderOption || 'SERIAL_NUMBER'
  });
  const data = await apiCall(spreadsheetId, '/values/' + encodeURIComponent(range) + '?' + qs.toString());
  return (data && data.values) || [];
}

async function batchGetValues(spreadsheetId, sheetNames, opts) {
  opts = opts || {};
  const qs = new URLSearchParams({
    valueRenderOption: opts.valueRenderOption || 'UNFORMATTED_VALUE',
    dateTimeRenderOption: opts.dateTimeRenderOption || 'SERIAL_NUMBER'
  });
  sheetNames.forEach((n) => qs.append('ranges', "'" + n + "'"));
  const data = await apiCall(spreadsheetId, '/values:batchGet?' + qs.toString());
  return (data && data.valueRanges) || [];
}

async function batchUpdateValues(spreadsheetId, dataArr) {
  return apiCall(spreadsheetId, '/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: dataArr })
  });
}

async function getSheetTitles(spreadsheetId) {
  const data = await apiCall(spreadsheetId, '?fields=' + encodeURIComponent('sheets.properties.title'));
  return ((data && data.sheets) || []).map((s) => s.properties.title);
}

// Trả về map: tên sheet -> mảng 2 chiều (song song values) chứa loại numberFormat ('DATE'/'DATE_TIME'/
// 'TIME'/'NUMBER'/... hoặc null) — dùng để biết ô nào thực sự là ngày/giờ (giống cách Apps Script tự
// trả về đối tượng Date cho các ô định dạng ngày khi đọc bằng getValues()).
async function getNumberFormats(spreadsheetId, sheetNames) {
  if (!sheetNames.length) return {};
  const qs = new URLSearchParams();
  sheetNames.forEach((n) => qs.append('ranges', "'" + n + "'"));
  qs.append('fields', 'sheets(properties.title,data.rowData.values.effectiveFormat.numberFormat.type)');
  const data = await apiCall(spreadsheetId, '?' + qs.toString());
  const map = {};
  ((data && data.sheets) || []).forEach((s) => {
    const title = s.properties.title;
    const rowData = (s.data && s.data[0] && s.data[0].rowData) || [];
    map[title] = rowData.map((rd) => (rd.values || []).map((v) =>
      (v.effectiveFormat && v.effectiveFormat.numberFormat && v.effectiveFormat.numberFormat.type) || null));
  });
  return map;
}

// Thêm 1 dòng vào CUỐI sheet (giống sheet.appendRow() bên Apps Script). range chỉ cần tên sheet, Sheets API
// tự tìm bảng đang có dữ liệu và nối dòng mới ngay bên dưới.
async function appendValues(spreadsheetId, sheetName, rowValues) {
  const qs = new URLSearchParams({ valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' });
  return apiCall(spreadsheetId, '/values/' + encodeURIComponent("'" + sheetName + "'") + ':append?' + qs.toString(), {
    method: 'POST',
    body: JSON.stringify({ values: [rowValues] })
  });
}

// Ghi đè giá trị vào 1 vùng cụ thể (PUT, không phải append) — dùng khi biết chắc vị trí cần ghi.
async function putValues(spreadsheetId, rangeA1, rows) {
  return apiCall(spreadsheetId, '/values/' + encodeURIComponent(rangeA1) + '?valueInputOption=USER_ENTERED', {
    method: 'PUT',
    body: JSON.stringify({ values: rows })
  });
}

// Danh sách sheet kèm sheetId số (cần cho deleteDimension/addSheet) — khác getSheetTitles (chỉ có title).
async function getSheetMeta(spreadsheetId) {
  const data = await apiCall(spreadsheetId, '?fields=' + encodeURIComponent('sheets.properties(sheetId,title)'));
  return ((data && data.sheets) || []).map((s) => ({ sheetId: s.properties.sheetId, title: s.properties.title }));
}

// Tạo sheet mới (nếu chưa có) với header in đậm ở dòng 1 — giống pattern ensureXxxSheet() bên Code.gs.
// Trả về true nếu VỪA tạo mới (để gọi thêm bước ghi dữ liệu mặc định, vd schema_json mặc định).
async function ensureSheetWithHeaders(spreadsheetId, title, headers) {
  const meta = await getSheetMeta(spreadsheetId);
  if (meta.some((s) => s.title === title)) return { created: false };
  await apiCall(spreadsheetId, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: title } } }] })
  });
  if (headers && headers.length) {
    await apiCall(spreadsheetId, '/values/' + encodeURIComponent("'" + title + "'!A1") + '?valueInputOption=USER_ENTERED', {
      method: 'PUT',
      body: JSON.stringify({ values: [headers] })
    });
  }
  return { created: true };
}

// Xoá 1 dòng theo số dòng thật (1-indexed, tính cả header) — cần tra sheetId số trước (deleteDimension chỉ
// nhận sheetId số, không nhận tên).
async function deleteRowByIndex(spreadsheetId, sheetTitle, rowIndex1based) {
  const meta = await getSheetMeta(spreadsheetId);
  const sheet = meta.find((s) => s.title === sheetTitle);
  if (!sheet) throw new Error('sheet_khong_ton_tai_' + sheetTitle);
  return apiCall(spreadsheetId, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId: sheet.sheetId, dimension: 'ROWS', startIndex: rowIndex1based - 1, endIndex: rowIndex1based }
        }
      }]
    })
  });
}

// ====== UPLOAD ẢNH (Drive API) — dùng cho Kế hoạch kinh doanh (ảnh checkin/sản phẩm) ======
// Cần refresh token có thêm scope https://www.googleapis.com/auth/drive.file. Nếu chưa cấp scope này (hoặc
// Drive API chưa bật trên project), hàm trả về '' (giống hệt hành vi try/catch nuốt lỗi của bản Apps Script
// gốc) — không làm hỏng cả request, chỉ ảnh không lưu được.
async function uploadKeHoachImage(dataUrl, filenamePrefix) {
  if (!dataUrl || dataUrl.indexOf('base64,') === -1) return '';
  try {
    const token = await getAccessToken();
    const parts = dataUrl.split(',');
    const mimeMatch = /data:([^;]+);/.exec(parts[0]);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bytes = Buffer.from(parts[1], 'base64');
    const metadata = { name: filenamePrefix + '_' + Date.now() + '.jpg', parents: [KEHOACH_DRIVE_FOLDER_ID] };
    const boundary = 'ghnbound' + Date.now();
    const body = Buffer.concat([
      Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n', 'utf8'),
      Buffer.from('--' + boundary + '\r\nContent-Type: ' + mime + '\r\n\r\n', 'utf8'),
      bytes,
      Buffer.from('\r\n--' + boundary + '--', 'utf8')
    ]);
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    });
    if (!r.ok) return '';
    const data = await r.json();
    if (!data || !data.id) return '';
    // Cho phép "bất kỳ ai có link" xem — giống setSharing(ANYONE_WITH_LINK, VIEW) bên Apps Script gốc.
    await fetch('https://www.googleapis.com/drive/v3/files/' + data.id + '/permissions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    }).catch(() => {});
    return 'https://drive.google.com/file/d/' + data.id + '/view';
  } catch (err) {
    return '';
  }
}

// ====== QUY ĐỔI NGÀY/GIỜ ======
// Sheets lưu ngày dạng "serial number" (số ngày kể từ 1899-12-30, phần thập phân = giờ trong ngày),
// KHÔNG mang theo timezone — cùng 1 chuỗi số dù múi giờ nào. Quy ước cả hệ thống theo giờ Việt Nam
// (UTC+7, không có DST) để khớp với timezone thật của Sheet + thói quen nhập liệu của nhân viên.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
function serialToDate(serial) {
  const shiftedMs = Math.round((serial - 25569) * 86400000); // đọc phần "giờ tường" như thể UTC
  return new Date(shiftedMs - VN_OFFSET_MS);                 // trừ lại độ lệch VN -> thời điểm thật
}
function dateToSheetString(d) {
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return vn.getUTCFullYear() + '-' + pad(vn.getUTCMonth() + 1) + '-' + pad(vn.getUTCDate()) + ' ' +
    pad(vn.getUTCHours()) + ':' + pad(vn.getUTCMinutes()) + ':' + pad(vn.getUTCSeconds());
}

// ====== TIỆN ÍCH ĐÃ CÓ TRONG Code.gs — port 1:1 ======
function normEmail(s) { return String(s || '').trim().toLowerCase(); }
function isValidGhnEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.endsWith('@' + ALLOWED_EMAIL_DOMAIN);
}
function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(password + ':' + salt, 'utf8').digest('hex');
}
function getSessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s) { const e = new Error('SESSION_SECRET_chua_cau_hinh'); e.code = 'SESSION_SECRET_chua_cau_hinh'; throw e; }
  return s;
}
function base64url(input) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeToken(email) {
  const payload = JSON.stringify({ email: email, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS });
  const payloadB64 = base64url(payload);
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payloadB64).digest();
  return payloadB64 + '.' + base64url(sig);
}
function verifyToken(token) {
  if (!token || String(token).indexOf('.') === -1) return null;
  const parts = String(token).split('.');
  const payloadB64 = parts[0], sigB64 = parts[1];
  const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(payloadB64).digest();
  if (sigB64 !== base64url(expectedSig)) return null;
  try {
    const json = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload.email;
  } catch (e) { return null; }
}
function findUserRow(mainValues, email) {
  for (let i = 1; i < mainValues.length; i++) {
    if (normEmail(mainValues[i][COL.EMAIL - 1]) === email) return { row: i + 1, values: mainValues[i] };
  }
  return null;
}
function getPermissions(role, r) {
  if (role === 'Admin') return { taiHtml: true, copy: true, chupManHinh: true };
  return {
    taiHtml: r[COL.QUYEN_TAIHTML - 1] === true,
    copy: r[COL.QUYEN_COPY - 1] === true,
    chupManHinh: r[COL.QUYEN_CHUPMANHINH - 1] === true
  };
}
function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

async function computeModuleAccessForRole(role) {
  const access = {};
  if (role === 'Admin') {
    MODULE_DEFS.forEach((m) => { access[m.id] = true; });
    return access;
  }
  let map = null;
  try {
    const values = await getValues(SHEET_ID, "'" + MODULE_CONFIG_SHEET_NAME + "'");
    map = {};
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (!r[0]) continue;
      map[String(r[0])] = { batTat: r[2] === true, admin: r[3] === true, quanLy: r[4] === true, nhanVienXuLy: r[5] === true, nhanVien: r[6] === true };
    }
  } catch (e) {
    map = null; // sheet "CauHinhHangMuc" chưa tồn tại hoặc lỗi đọc
  }
  const field = ROLE_FIELD[role] || 'nhanVien';
  MODULE_DEFS.forEach((m) => {
    if (map && map[m.id]) access[m.id] = !!(map[m.id].batTat && map[m.id][field]);
    else access[m.id] = true; // chưa có dòng cấu hình -> mặc định hiện, giữ hành vi cũ
  });
  return access;
}

// ====== ĐĂNG NHẬP / PHIÊN ======
async function handleLogin(body) {
  const email = normEmail(body.email);
  const password = String(body.password || '');
  if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };

  const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
  const found = findUserRow(mainValues, email);
  if (!found) return { ok: false, error: 'account_not_found' };
  const r = found.values;

  const lockedSerial = r[COL.KHOADENLUC - 1];
  if (typeof lockedSerial === 'number' && lockedSerial > 0) {
    const lockedUntil = serialToDate(lockedSerial);
    if (lockedUntil.getTime() > Date.now()) {
      return { ok: false, error: 'account_locked', lockedUntil: lockedUntil.getTime() };
    }
  }
  const active = r[COL.ACTIVE - 1] === true;
  if (!active) return { ok: false, error: 'account_inactive' };

  const salt = String(r[COL.SALT - 1] || '');
  const hash = String(r[COL.HASH - 1] || '');
  const ok = hashPassword(password, salt) === hash;

  const sheetName = "'" + MAIN_SHEET_NAME + "'!";
  if (!ok) {
    const fails = Number(r[COL.SOLANSAI - 1] || 0) + 1;
    const updates = [{ range: sheetName + colLetter(COL.SOLANSAI) + found.row, values: [[fails]] }];
    if (fails >= MAX_FAILED_ATTEMPTS) {
      updates.push({ range: sheetName + colLetter(COL.KHOADENLUC) + found.row, values: [[dateToSheetString(new Date(Date.now() + LOCKOUT_MS))]] });
    }
    await batchUpdateValues(SHEET_ID, updates);
    return { ok: false, error: 'wrong_password' };
  }

  await batchUpdateValues(SHEET_ID, [
    { range: sheetName + colLetter(COL.SOLANSAI) + found.row, values: [[0]] },
    { range: sheetName + colLetter(COL.KHOADENLUC) + found.row, values: [['']] },
    { range: sheetName + colLetter(COL.DANGNHAPGANNHAT) + found.row, values: [[dateToSheetString(new Date())]] }
  ]);

  const token = makeToken(email);
  const role = String(r[COL.VAITRO - 1] || '');
  return {
    ok: true, token: token, email: email, name: String(r[COL.HOTEN - 1] || ''), role: role,
    permissions: getPermissions(role, r),
    moduleAccess: await computeModuleAccessForRole(role)
  };
}

async function handleValidateSession(body) {
  const email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
  const found = findUserRow(mainValues, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { ok: false, error: 'account_inactive' };
  const role = String(found.values[COL.VAITRO - 1] || '');
  return {
    ok: true, email: email, name: String(found.values[COL.HOTEN - 1] || ''), role: role,
    permissions: getPermissions(role, found.values),
    moduleAccess: await computeModuleAccessForRole(role)
  };
}

// ====== ĐỔI MẬT KHẨU (KHI ĐÃ ĐĂNG NHẬP) — port từ Code.gs handleChangePassword ======
async function handleChangePassword(body) {
  const email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  const oldPassword = String(body.oldPassword || '');
  const newPassword = String(body.newPassword || '');
  if (newPassword.length < MIN_PASSWORD_LEN) return { ok: false, error: 'password_too_short' };

  const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
  const found = findUserRow(mainValues, email);
  if (!found) return { ok: false, error: 'account_not_found' };
  const r = found.values;
  const salt = String(r[COL.SALT - 1] || '');
  const hash = String(r[COL.HASH - 1] || '');
  if (hashPassword(oldPassword, salt) !== hash) return { ok: false, error: 'old_password_incorrect' };

  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashPassword(newPassword, newSalt);
  const sheetName = "'" + MAIN_SHEET_NAME + "'!";
  await batchUpdateValues(SHEET_ID, [
    { range: sheetName + colLetter(COL.SALT) + found.row, values: [[newSalt]] },
    { range: sheetName + colLetter(COL.HASH) + found.row, values: [[newHash]] }
  ]);
  return { ok: true };
}

// ====== XÁC THỰC LẠI PHIÊN SAU 24H BẰNG OTP — port từ Code.gs handleRequestSessionOtp/handleVerifySessionOtp ======
async function handleRequestSessionOtp(body) {
  const email = normEmail(body.email);
  if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };

  const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
  const found = findUserRow(mainValues, email);
  // Không tiết lộ tài khoản có tồn tại/active hay không — trả về thông báo giống nhau dù thế nào.
  if (found && found.values[COL.ACTIVE - 1] === true) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = dateToSheetString(new Date(Date.now() + SESSION_OTP_TTL_MS));
    const sheetName = "'" + MAIN_SHEET_NAME + "'!";
    await batchUpdateValues(SHEET_ID, [
      { range: sheetName + colLetter(COL.OTP) + found.row, values: [[otp]] },
      { range: sheetName + colLetter(COL.OTPHETHAN) + found.row, values: [[expiry]] }
    ]);
    const name = String(found.values[COL.HOTEN - 1] || '');
    await sendGmailMessage(
      email,
      'Mã xác thực lại phiên đăng nhập — Báo Cáo Vận Hành GHN',
      'Chào ' + name + ',\n\n' +
      'Phiên đăng nhập của bạn trên Báo Cáo Vận Hành Tuần đã quá 24 giờ, cần xác thực lại. Mã xác nhận là: ' + otp + '\n' +
      'Mã CHỈ có hiệu lực trong 60 GIÂY kể từ khi email này được gửi — nếu hết hạn, hãy bấm "Gửi lại mã" trên trang web.\n' +
      'Nếu không phải bạn yêu cầu, hãy bỏ qua email này.\n\n' +
      '— Báo Cáo Vận Hành Tuần GHN'
    );
  }
  return { ok: true, message: 'Nếu email tồn tại và đang hoạt động, mã xác nhận đã được gửi.' };
}

async function handleVerifySessionOtp(body) {
  const email = normEmail(body.email);
  const otp = String(body.otp || '');
  if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };

  const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
  const found = findUserRow(mainValues, email);
  if (!found) return { ok: false, error: 'otp_invalid' };
  const r = found.values;
  const savedOtp = String(r[COL.OTP - 1] || '');
  const otpExpirySerial = r[COL.OTPHETHAN - 1];
  const sheetName = "'" + MAIN_SHEET_NAME + "'!";

  if (!savedOtp) return { ok: false, error: 'otp_expired' };
  const expiryDate = (typeof otpExpirySerial === 'number' && otpExpirySerial > 0) ? serialToDate(otpExpirySerial) : null;
  if (!expiryDate || expiryDate.getTime() < Date.now()) {
    await batchUpdateValues(SHEET_ID, [
      { range: sheetName + colLetter(COL.OTP) + found.row, values: [['']] },
      { range: sheetName + colLetter(COL.OTPHETHAN) + found.row, values: [['']] }
    ]);
    return { ok: false, error: 'otp_expired' };
  }
  if (savedOtp !== otp) return { ok: false, error: 'otp_invalid' };

  // Dùng 1 lần — xoá ngay sau khi xác nhận đúng.
  const updates = [
    { range: sheetName + colLetter(COL.OTP) + found.row, values: [['']] },
    { range: sheetName + colLetter(COL.OTPHETHAN) + found.row, values: [['']] }
  ];
  if (r[COL.ACTIVE - 1] !== true) {
    await batchUpdateValues(SHEET_ID, updates);
    return { ok: false, error: 'account_inactive' };
  }
  updates.push({ range: sheetName + colLetter(COL.DANGNHAPGANNHAT) + found.row, values: [[dateToSheetString(new Date())]] });
  await batchUpdateValues(SHEET_ID, updates);

  const token = makeToken(email);
  const role = String(r[COL.VAITRO - 1] || '');
  return {
    ok: true, token: token, email: email, name: String(r[COL.HOTEN - 1] || ''), role: role,
    permissions: getPermissions(role, r),
    moduleAccess: await computeModuleAccessForRole(role)
  };
}

// ====== DỮ LIỆU BÁO CÁO ======
function buildTableShape(header, dataRows, fmtRows) {
  const cols = header.map((h) => ({ label: (h === null || h === undefined) ? '' : String(h) }));
  const colCount = header.length;
  const rows = dataRows.map((row, ri) => {
    const fmtRow = fmtRows[ri] || [];
    const padded = row.length < colCount ? row.concat(Array(colCount - row.length).fill('')) : row;
    const c = padded.map((v, ci) => {
      if (v === '' || v === null || v === undefined) return null;
      const fmtType = fmtRow[ci];
      if ((fmtType === 'DATE' || fmtType === 'DATE_TIME' || fmtType === 'TIME') && typeof v === 'number') {
        return { v: serialToDate(v).toISOString() };
      }
      return { v: v };
    });
    return { c: c };
  });
  return { cols: cols, rows: rows };
}

async function handleGetReportData(body) {
  const email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
  const found = findUserRow(mainValues, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { ok: false, error: 'account_inactive' };

  const allTitles = await getSheetTitles(SHEET_ID);
  const existing = DATA_SHEET_NAMES.filter((n) => allTitles.indexOf(n) !== -1);
  const tables = {};
  DATA_SHEET_NAMES.forEach((n) => { if (existing.indexOf(n) === -1) tables[n] = { cols: [], rows: [] }; });

  if (existing.length) {
    const [valueRanges, fmtMap] = await Promise.all([
      batchGetValues(SHEET_ID, existing),
      getNumberFormats(SHEET_ID, existing)
    ]);
    existing.forEach((name, idx) => {
      const values = (valueRanges[idx] && valueRanges[idx].values) || [];
      if (!values.length) { tables[name] = { cols: [], rows: [] }; return; }
      const header = values[0];
      const dataRows = values.slice(1);
      const fmtRows = (fmtMap[name] || []).slice(1);
      tables[name] = buildTableShape(header, dataRows, fmtRows);
    });
  }
  return { ok: true, tables: tables };
}

// ================================================================================================
// ====== "CẤU HÌNH" CHO ADMIN — port từ Code.gs requireAdmin/requireActiveUser/isAdminEmail ======
// ================================================================================================
async function requireAdmin(token) {
  const email = verifyToken(token);
  if (!email) return { error: 'session_expired' };
  const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
  const found = findUserRow(mainValues, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { error: 'account_inactive' };
  if (String(found.values[COL.VAITRO - 1] || '') !== 'Admin') return { error: 'forbidden' };
  return { mainValues, found, email };
}

async function requireActiveUser(token) {
  const email = verifyToken(token);
  if (!email) return { error: 'session_expired' };
  const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
  const found = findUserRow(mainValues, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { error: 'account_inactive' };
  return { email, name: String(found.values[COL.HOTEN - 1] || email) };
}

async function isAdminEmail(email) {
  const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
  const found = findUserRow(mainValues, email);
  return !!(found && found.values[COL.ACTIVE - 1] === true && String(found.values[COL.VAITRO - 1] || '') === 'Admin');
}

// ====== "ĐANG ONLINE" (avatar bar hiển thị người đang xem báo cáo) — port từ handleHeartbeat/handleGetOnlineUsers ======
// Bản gốc trên Apps Script dùng CacheService (bộ nhớ tạm, tự hết hạn). Serverless không có bộ nhớ dùng chung
// đáng tin cậy giữa các lần gọi, nên lưu tạm vào 1 sheet riêng (giống cách đã làm với OTP): mỗi người 1 dòng,
// ghi đè cột LastSeenMs mỗi lần heartbeat (25s/lần từ frontend), coi là "rời trang" nếu quá ONLINE_TTL_MS.
const ONLINE_SHEET_NAME = 'OnlineUsers';
const ONLINE_TTL_MS = 90 * 1000;

async function ensureOnlineSheet() {
  await ensureSheetWithHeaders(SHEET_ID, ONLINE_SHEET_NAME, ['Email', 'Name', 'LastSeenMs']);
}

async function handleHeartbeat(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureOnlineSheet();
  const values = await getValues(SHEET_ID, "'" + ONLINE_SHEET_NAME + "'");
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if (normEmail(values[i][0]) === auth.email) { rowIdx = i + 1; break; }
  }
  if (rowIdx === -1) {
    await appendValues(SHEET_ID, ONLINE_SHEET_NAME, [auth.email, auth.name, Date.now()]);
  } else {
    const sheetName = "'" + ONLINE_SHEET_NAME + "'!";
    await batchUpdateValues(SHEET_ID, [{ range: sheetName + 'B' + rowIdx + ':C' + rowIdx, values: [[auth.name, Date.now()]] }]);
  }
  return { ok: true };
}

async function handleGetOnlineUsers(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureOnlineSheet();
  const values = await getValues(SHEET_ID, "'" + ONLINE_SHEET_NAME + "'");
  const now = Date.now();
  const users = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[0]) continue;
    const lastSeen = Number(r[2]) || 0;
    if (now - lastSeen > ONLINE_TTL_MS) continue;
    users.push({ email: normEmail(r[0]), name: String(r[1] || ''), ts: lastSeen });
  }
  users.sort((a, b) => b.ts - a.ts);
  return { ok: true, users: users };
}

// ====== "TỶ LỆ LẤP ĐẦY THÙNG XE" — đọc trực tiếp sheet "60_LapDay", bung chặng + tính tỷ lệ lấp đầy ======
// Sheet nguồn xuất thô từ BI, 25 cột A..Y. Cột E gốc (thiết kế 26 cột đời đầu) đã bị NGƯỜI DÙNG XOÁ khỏi
// sheet thật ngày 2026-08-14 nên mọi cột từ F trở đi lùi lại đúng 1 vị trí so với thiết kế gốc. Mapping
// dưới đây đã đối chiếu TRỰC TIẾP với sheet thật (không suy đoán) — xem chỉ số cột (0-based) cạnh mỗi dòng.
const LAPDAY_SHEET_NAME = '60_LapDay';
const LAPDAY_TUYEN_TANG_CUONG = 'TUYẾN TĂNG CƯỜNG';
const LAPDAY_RE_KHO = /kho\s*chuy[ểe]n\s*ti[ếe]p|kho\s*trung\s*chuy[ểe]n|^\s*KTC\b/i;

// Số kiểu Việt cho các cột đơn lẻ: "1.900" -> 1900 ; "27,58" -> 27.58. Nếu ô đã là number (Sheets API
// trả UNFORMATTED_VALUE) thì dùng thẳng, không suy diễn thêm — chỉ parse text khi thật sự là chuỗi.
function ldVnNum(s) {
  if (typeof s === 'number') return s;
  s = String(s === null || s === undefined ? '' : s).trim().replace('%', '');
  if (!s) return null;
  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
// Số kiểu Mỹ cho các ô "danh sách" (Lộ trình, Quãng đường từng điểm...) — luôn là text thô, dấu . thập phân.
function ldUsNum(s) {
  if (typeof s === 'number') return s;
  s = String(s === null || s === undefined ? '' : s).trim().replace('%', '');
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
// Bung ô dạng "(1) a\n(2) b\n..." thành {1:'a', 2:'b', ...}.
// Cot phan tram DANG SO tu Sheets API tra ve PHAN SO 0..1 (o dinh dang %), khong nhu o chu da co san dau %.
function ldPctFromSheet(v) {
   if (typeof v === 'number') return v * 100;
   return ldVnNum(v);
}
function ldPlist(s) {
  const out = {};
  const re = /\((\d+)\)\s*([^\n]*)/g;
  let m;
  while ((m = re.exec(String(s === null || s === undefined ? '' : s)))) out[Number(m[1])] = m[2].trim();
  return out;
}
function ldSerialToISODate(v) {
     const pad = (n) => String(n).padStart(2, '0');
     if (typeof v === 'number' && v) {
            const d = serialToDate(v);
            const vn = new Date(d.getTime() + VN_OFFSET_MS);
            return vn.getUTCFullYear() + '-' + pad(vn.getUTCMonth() + 1) + '-' + pad(vn.getUTCDate());
     }
     if (typeof v === 'string' && v.trim()) {
            const d = new Date(v.trim());
            if (!isNaN(d.getTime())) return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
     }
     return null;
}

async function handleGetLapDayData(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };

  const values = await getValues(SHEET_ID, "'" + LAPDAY_SHEET_NAME + "'");
  if (!values.length) return { ok: false, error: 'lapday_sheet_rong' };
  const header = values[0];
  const data = values.slice(1);

  // Cờ debug: trả thẳng dòng dữ liệu thô + kiểu dữ liệu từng ô để đối chiếu, không tính toán gì —
  // dùng 1 lần khi triển khai để xác nhận Sheets API trả number hay text cho từng cột, không lưu lại.
  if (body.debug) {
    const r0 = data[0] || [];
    return {
      ok: true, debug: true, soCotHeader: header.length, header: header,
      hangMau: r0, kieuDuLieu: r0.map((v) => typeof v), soDongDuLieu: data.length
    };
  }

  const trips = [];
  let checkKm = 0;

  data.forEach((r) => {
    if (!r || !r.length) return;
    const lo  = ldPlist(r[7]);   // H  Lộ trình
    const km  = ldPlist(r[9]);   // J  Quãng đường từng điểm dừng
    const kgX = ldPlist(r[14]);  // O  Số kg trên xe
    const dnX = ldPlist(r[15]);  // P  Số đơn trên xe
    const kgV = ldPlist(r[16]);  // Q  Số kg vận chuyển
    const dnV = ldPlist(r[17]);  // R  Số đơn vận chuyển
    const fKg = ldPlist(r[18]);  // S  Tỷ lệ lấp đầy tại mỗi điểm (kg)
    const fDn = ldPlist(r[19]);  // T  Tỷ lệ lấp đầy tại mỗi điểm (đơn)
    const n = Object.keys(lo).length;
    if (n < 2) return;

    const depot = (lo[1] || '').trim();
    const legs = [];
    for (let i = 1; i < n; i++) {
      const dest = (lo[i + 1] || '').trim();
      const d = ldUsNum(km[i + 1]) || 0;
      checkKm += d;
      const veKho = !!dest && (dest === depot || LAPDAY_RE_KHO.test(dest));
      legs.push({
        i: i, tu: (lo[i] || '').trim(), den: dest, km: Math.round(d * 10) / 10,
        fk: ldUsNum(fKg[i]), fd: ldUsNum(fDn[i]), kg: ldUsNum(kgX[i]), dn: ldUsNum(dnX[i]),
        r: veKho ? 1 : 0
      });
    }

    const ngay = ldSerialToISODate(r[24]);  // Y  first_check_in: Day
    const tuan = ldSerialToISODate(r[0]);   // A  load_date: Week
    trips.push({
      ng: ngay, tw: tuan, th: (ngay || '').slice(0, 7),
      ncc: String(r[6] || '').trim(),
      tuyen: String(r[2] || '').trim() || LAPDAY_TUYEN_TANG_CUONG,
      ma: String(r[1] || '').trim(),
      bks: String(r[10] || '').trim(),
      loai: String(r[3] || '').trim(),
      batdau: String(r[4] || '').trim(),
      km: ldVnNum(r[8]),    // I  tổng quãng đường
      tt: ldVnNum(r[11]),   // L  tải trọng
      dtc: ldVnNum(r[12]),  // M  số đơn tiêu chuẩn
      ktc: ldVnNum(r[13]),  // N  số kg tiêu chuẩn
      fk: ldPctFromSheet(r[20]),   // U  lấp đầy chuyến (kg)
      fd: ldPctFromSheet(r[21]),   // V  lấp đầy chuyến (đơn)
      vk: ldPctFromSheet(r[22]),   // W  tỷ lệ vận chuyển (kg)
      vd: ldPctFromSheet(r[23]),   // X  tỷ lệ vận chuyển (đơn)
      legs: legs
    });
  });

  const meta = {
    nguon: LAPDAY_SHEET_NAME,
    soChuyen: trips.length,
    soChang: trips.reduce((a, t) => a + t.legs.length, 0),
    ngayMin: trips.reduce((m, t) => (t.ng && (!m || t.ng < m)) ? t.ng : m, null),
    ngayMax: trips.reduce((m, t) => (t.ng && (!m || t.ng > m)) ? t.ng : m, null),
    nccs: [...new Set(trips.map((t) => t.ncc))].sort(),
    tuans: [...new Set(trips.map((t) => t.tw).filter(Boolean))].sort(),
    thangs: [...new Set(trips.map((t) => t.th).filter(Boolean))].sort(),
    tongKmDoiChieu: Math.round(checkKm * 10) / 10
  };
  return { ok: true, meta: meta, trips: trips };
}

// ====== "CẤU HÌNH" > "HẠNG MỤC & PHÂN QUYỀN" — port từ handleGetModuleConfig/handleUpdateModuleConfig ======
async function ensureModuleConfigSheet() {
  const headers = ['ModuleId', 'TenHienThi', 'BatTat', 'QuyenAdmin', 'QuyenQuanLy', 'QuyenNhanVienXuLy', 'QuyenNhanVien'];
  await ensureSheetWithHeaders(SHEET_ID, MODULE_CONFIG_SHEET_NAME, headers);
  const values = await getValues(SHEET_ID, "'" + MODULE_CONFIG_SHEET_NAME + "'");
  const existingIds = new Set();
  for (let i = 1; i < values.length; i++) { if (values[i][0]) existingIds.add(String(values[i][0])); }
  const missing = MODULE_DEFS.filter((m) => !existingIds.has(m.id)).map((m) => [m.id, m.label, true, true, true, true, true]);
  if (missing.length) {
    const startRow = values.length + 1;
    await putValues(SHEET_ID, "'" + MODULE_CONFIG_SHEET_NAME + "'!A" + startRow, missing);
  }
}

async function readModuleConfigMap() {
  const values = await getValues(SHEET_ID, "'" + MODULE_CONFIG_SHEET_NAME + "'");
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[0]) continue;
    map[String(r[0])] = { row: i + 1, batTat: r[2] === true, admin: r[3] === true, quanLy: r[4] === true, nhanVienXuLy: r[5] === true, nhanVien: r[6] === true };
  }
  return map;
}

async function handleGetModuleConfig(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureModuleConfigSheet();
  const map = await readModuleConfigMap();
  const modules = MODULE_DEFS.map((m) => {
    const cfg = map[m.id] || { batTat: true, admin: true, quanLy: true, nhanVienXuLy: true, nhanVien: true };
    return { id: m.id, label: m.label, cap: m.cap, chaId: m.chaId, batTat: cfg.batTat, admin: true, quanLy: cfg.quanLy, nhanVienXuLy: cfg.nhanVienXuLy, nhanVien: cfg.nhanVien };
  });
  return { ok: true, modules: modules };
}

const MODULE_CONFIG_EDITABLE_FIELDS = { batTat: 3, quanLy: 5, nhanVienXuLy: 6, nhanVien: 7 };
async function handleUpdateModuleConfig(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const moduleId = String(body.moduleId || '');
  const field = String(body.field || '');
  const col = MODULE_CONFIG_EDITABLE_FIELDS[field];
  if (!col) return { ok: false, error: 'invalid_field' };
  if (!MODULE_DEFS.some((m) => m.id === moduleId)) return { ok: false, error: 'invalid_module' };
  await ensureModuleConfigSheet();
  const map = await readModuleConfigMap();
  const cfg = map[moduleId];
  if (!cfg) return { ok: false, error: 'invalid_module' };
  const sheetName = "'" + MODULE_CONFIG_SHEET_NAME + "'!";
  await batchUpdateValues(SHEET_ID, [{ range: sheetName + colLetter(col) + cfg.row, values: [[!!body.value]] }]);
  return { ok: true };
}

// ====== "CẤU HÌNH" > "TÀI KHOẢN" — port từ handleGetUserList/handleAddUser/handleUpdateUser/handleDeleteUser/
// handleUpdateUserPermissions/handleAdminResetPassword ======
function generateTempPassword() {
  return crypto.randomBytes(4).toString('hex') + 'Aa1!';
}

function countActiveAdmins(mainValues, excludeRow) {
  let count = 0;
  for (let i = 1; i < mainValues.length; i++) {
    if ((i + 1) === excludeRow) continue;
    const r = mainValues[i];
    if (String(r[COL.VAITRO - 1] || '') === 'Admin' && r[COL.ACTIVE - 1] === true) count++;
  }
  return count;
}

async function handleGetUserList(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const users = [];
  for (let i = 1; i < auth.mainValues.length; i++) {
    const r = auth.mainValues[i];
    const em = normEmail(r[COL.EMAIL - 1]);
    if (!em) continue;
    const role = String(r[COL.VAITRO - 1] || '');
    users.push({ email: em, name: String(r[COL.HOTEN - 1] || ''), role: role, active: r[COL.ACTIVE - 1] === true, permissions: getPermissions(role, r) });
  }
  return { ok: true, users: users };
}

async function handleUpdateUserPermissions(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const targetEmail = normEmail(body.targetEmail);
  if (!targetEmail) return { ok: false, error: 'bad_request' };
  const found = findUserRow(auth.mainValues, targetEmail);
  if (!found) return { ok: false, error: 'account_not_found' };
  const sheetName = "'" + MAIN_SHEET_NAME + "'!";
  await batchUpdateValues(SHEET_ID, [
    { range: sheetName + colLetter(COL.QUYEN_TAIHTML) + found.row, values: [[!!body.taiHtml]] },
    { range: sheetName + colLetter(COL.QUYEN_COPY) + found.row, values: [[!!body.copy]] },
    { range: sheetName + colLetter(COL.QUYEN_CHUPMANHINH) + found.row, values: [[!!body.chupManHinh]] }
  ]);
  return { ok: true, permissions: { taiHtml: !!body.taiHtml, copy: !!body.copy, chupManHinh: !!body.chupManHinh } };
}

async function handleAddUser(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const email = normEmail(body.email);
  const name = String(body.name || '').trim();
  const role = String(body.role || '').trim() || 'Nhân viên';
  if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };
  if (!name) return { ok: false, error: 'bad_request' };
  if (findUserRow(auth.mainValues, email)) return { ok: false, error: 'account_exists' };

  const tempPassword = generateTempPassword();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(tempPassword, salt);
  const row = [email, name, hash, salt, true, role, dateToSheetString(new Date()), '', 0, '', '', '', 'Tạo qua trang Cấu hình', false, false, false];
  await appendValues(SHEET_ID, MAIN_SHEET_NAME, row);

  await sendGmailMessage(
    email,
    'Tài khoản Báo Cáo Vận Hành GHN của bạn',
    'Chào ' + name + ',\n\n' +
    'Tài khoản đăng nhập Báo Cáo Vận Hành Tuần đã được tạo:\n' +
    'Email: ' + email + '\n' +
    'Mật khẩu tạm: ' + tempPassword + '\n\n' +
    'Vui lòng đăng nhập và đổi mật khẩu ngay.\n\n— Báo Cáo Vận Hành Tuần GHN'
  );
  return { ok: true, email: email };
}

async function handleUpdateUser(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const targetEmail = normEmail(body.targetEmail);
  const found = findUserRow(auth.mainValues, targetEmail);
  if (!found) return { ok: false, error: 'account_not_found' };

  const willBeAdmin = body.role !== undefined ? (String(body.role || '').trim() === 'Admin') : (String(found.values[COL.VAITRO - 1] || '') === 'Admin');
  const willBeActive = body.active !== undefined ? !!body.active : (found.values[COL.ACTIVE - 1] === true);
  const wasAdmin = String(found.values[COL.VAITRO - 1] || '') === 'Admin';
  const wasActive = found.values[COL.ACTIVE - 1] === true;
  if (wasAdmin && wasActive && !(willBeAdmin && willBeActive)) {
    if (countActiveAdmins(auth.mainValues, found.row) === 0) return { ok: false, error: 'last_admin' };
  }

  const sheetName = "'" + MAIN_SHEET_NAME + "'!";
  const updates = [];
  if (body.name !== undefined) updates.push({ range: sheetName + colLetter(COL.HOTEN) + found.row, values: [[String(body.name || '').trim()]] });
  if (body.role !== undefined) updates.push({ range: sheetName + colLetter(COL.VAITRO) + found.row, values: [[String(body.role || '').trim()]] });
  if (body.active !== undefined) updates.push({ range: sheetName + colLetter(COL.ACTIVE) + found.row, values: [[!!body.active]] });
  if (updates.length) await batchUpdateValues(SHEET_ID, updates);
  return { ok: true };
}

async function handleDeleteUser(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const targetEmail = normEmail(body.targetEmail);
  if (targetEmail === auth.email) return { ok: false, error: 'cannot_delete_self' };
  const found = findUserRow(auth.mainValues, targetEmail);
  if (!found) return { ok: false, error: 'account_not_found' };
  const wasAdmin = String(found.values[COL.VAITRO - 1] || '') === 'Admin';
  const wasActive = found.values[COL.ACTIVE - 1] === true;
  if (wasAdmin && wasActive && countActiveAdmins(auth.mainValues, found.row) === 0) return { ok: false, error: 'last_admin' };
  await deleteRowByIndex(SHEET_ID, MAIN_SHEET_NAME, found.row);
  return { ok: true };
}

async function handleAdminResetPassword(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const targetEmail = normEmail(body.targetEmail);
  const found = findUserRow(auth.mainValues, targetEmail);
  if (!found) return { ok: false, error: 'account_not_found' };
  const tempPassword = generateTempPassword();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(tempPassword, salt);
  const sheetName = "'" + MAIN_SHEET_NAME + "'!";
  await batchUpdateValues(SHEET_ID, [
    { range: sheetName + colLetter(COL.SALT) + found.row, values: [[salt]] },
    { range: sheetName + colLetter(COL.HASH) + found.row, values: [[hash]] },
    { range: sheetName + colLetter(COL.SOLANSAI) + found.row, values: [[0]] },
    { range: sheetName + colLetter(COL.KHOADENLUC) + found.row, values: [['']] }
  ]);
  const name = String(found.values[COL.HOTEN - 1] || '');
  await sendGmailMessage(
    targetEmail,
    'Mật khẩu mới — Báo Cáo Vận Hành GHN',
    'Chào ' + name + ',\n\n' +
    'Quản trị viên vừa đặt lại mật khẩu cho tài khoản của bạn:\n' +
    'Mật khẩu tạm: ' + tempPassword + '\n\n' +
    'Vui lòng đăng nhập và đổi mật khẩu ngay.\n\n— Báo Cáo Vận Hành Tuần GHN'
  );
  return { ok: true };
}

// ================================================================================================
// ====== KẾ HOẠCH KINH DOANH — port từ handleGetKeHoachData/handleAddKeHoach/handleUpdateKeHoach/
// handleAddKetQua/handleAddTienDo ======
// ================================================================================================
async function sheetToTableShape(spreadsheetId, sheetName) {
  const [values, fmtMap] = await Promise.all([
    getValues(spreadsheetId, "'" + sheetName + "'"),
    getNumberFormats(spreadsheetId, [sheetName])
  ]);
  if (!values.length) return { cols: [], rows: [] };
  const header = values[0];
  const dataRows = values.slice(1);
  const fmtRows = (fmtMap[sheetName] || []).slice(1);
  return buildTableShape(header, dataRows, fmtRows);
}

function buildTableShapeWithRow(header, dataRows, fmtRows) {
  const cols = header.map((h) => ({ label: (h === null || h === undefined) ? '' : String(h) }));
  const colCount = header.length;
  const rows = dataRows.map((row, ri) => {
    const fmtRow = fmtRows[ri] || [];
    const padded = row.length < colCount ? row.concat(Array(colCount - row.length).fill('')) : row;
    const c = padded.map((v, ci) => {
      if (v === '' || v === null || v === undefined) return null;
      const fmtType = fmtRow[ci];
      if ((fmtType === 'DATE' || fmtType === 'DATE_TIME' || fmtType === 'TIME') && typeof v === 'number') {
        return { v: serialToDate(v).toISOString() };
      }
      return { v: v };
    });
    return { row: ri + 2, c: c };
  });
  return { cols: cols, rows: rows };
}

async function sheetToTableShapeWithRow(spreadsheetId, sheetName) {
  const [values, fmtMap] = await Promise.all([
    getValues(spreadsheetId, "'" + sheetName + "'"),
    getNumberFormats(spreadsheetId, [sheetName])
  ]);
  if (!values.length) return { cols: [], rows: [] };
  const header = values[0];
  const dataRows = values.slice(1);
  const fmtRows = (fmtMap[sheetName] || []).slice(1);
  return buildTableShapeWithRow(header, dataRows, fmtRows);
}

function listActiveStaffNames(mainValues) {
  const staff = [];
  for (let i = 1; i < mainValues.length; i++) {
    const r = mainValues[i];
    if (r[COL.ACTIVE - 1] === true) {
      const nm = String(r[COL.HOTEN - 1] || '').trim();
      if (nm) staff.push(nm);
    }
  }
  return staff;
}

async function handleGetKeHoachData(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const [kehoach, ketqua, tiendo] = await Promise.all([
    sheetToTableShapeWithRow(KEHOACH_SHEET_ID, 'Kehoach'),
    sheetToTableShapeWithRow(KEHOACH_SHEET_ID, 'Ketqua'),
    sheetToTableShapeWithRow(KEHOACH_SHEET_ID, 'Tiendo')
  ]);
  let xaphuong = { cols: [], rows: [] };
  try { xaphuong = await sheetToTableShape(KEHOACH_SHEET_ID, 'Xaphuong'); } catch (e) { xaphuong = { cols: [], rows: [] }; }
  let doanhthu = { cols: [], rows: [], error: null };
  try { doanhthu = await sheetToTableShapeWithRow(KEHOACH_SHEET_ID, 'Doanhthu'); } catch (dtErr) { doanhthu = { cols: [], rows: [], error: String(dtErr) }; }
  const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
  const staff = listActiveStaffNames(mainValues);
  return { ok: true, kehoach: kehoach, ketqua: ketqua, tiendo: tiendo, xaphuong: xaphuong, doanhthu: doanhthu, staff: staff };
}

async function handleUpdateKeHoach(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const rowIndex = Number(body.rowIndex);
  if (!rowIndex || rowIndex < 2) return { ok: false, error: 'bad_request' };
  const fieldMap = {
    ngayLapKeHoach: COL_KH.NGAYLAP, ngayThucHien: COL_KH.NGAYTHUCHIEN, nhomKH: COL_KH.NHOMKH,
    sdtKH: COL_KH.SDT, tenShop: COL_KH.TENSHOP, diaChi: COL_KH.DIACHI, donViDoiThu: COL_KH.DOITHU,
    bangGia: COL_KH.BANGGIA, chinhSach: COL_KH.CHINHSACH, sanLuongThang: COL_KH.SANLUONGTHANG,
    sanLuongTangThem: COL_KH.SANLUONGTANGTHEM, khoiLuong: COL_KH.KHOILUONG, idKhachHang: COL_KH.IDKHACHHANG,
    sanPham: COL_KH.SANPHAM, nguyenNhan: COL_KH.NGUYENNHAN, trangThai: COL_KH.TRANGTHAI
  };
  const sheetName = "'Kehoach'!";
  const updates = [];
  Object.keys(fieldMap).forEach((key) => {
    if (body[key] !== undefined) updates.push({ range: sheetName + colLetter(fieldMap[key]) + rowIndex, values: [[body[key]]] });
  });
  if (updates.length) await batchUpdateValues(KEHOACH_SHEET_ID, updates);
  return { ok: true };
}

async function handleAddKeHoach(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const row = [];
  row[COL_KH.THOIGIAN - 1] = dateToSheetString(new Date());
  row[COL_KH.NGUOILAP - 1] = auth.name;
  row[COL_KH.NGAYLAP - 1] = body.ngayLapKeHoach || '';
  row[COL_KH.NGAYTHUCHIEN - 1] = body.ngayThucHien || '';
  row[COL_KH.NHOMKH - 1] = body.nhomKH || '';
  row[COL_KH.SDT - 1] = body.sdtKH || '';
  row[COL_KH.TENSHOP - 1] = body.tenShop || '';
  row[COL_KH.DIACHI - 1] = body.diaChi || '';
  row[COL_KH.DOITHU - 1] = body.donViDoiThu || '';
  row[COL_KH.BANGGIA - 1] = body.bangGia || '';
  row[COL_KH.CHINHSACH - 1] = body.chinhSach || '';
  row[COL_KH.SANLUONGTHANG - 1] = body.sanLuongThang || '';
  row[COL_KH.SANLUONGTANGTHEM - 1] = body.sanLuongTangThem || '';
  row[COL_KH.KHOILUONG - 1] = body.khoiLuong || '';
  row[COL_KH.IDKHACHHANG - 1] = body.idKhachHang || '';
  row[COL_KH.SANPHAM - 1] = body.sanPham || '';
  row[COL_KH.NGUYENNHAN - 1] = body.nguyenNhan || '';
  row[COL_KH.TRANGTHAI - 1] = body.trangThai || '';
  await appendValues(KEHOACH_SHEET_ID, 'Kehoach', row);
  return { ok: true };
}

async function handleAddKetQua(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const row = [];
  row[COL_KQ.THOIGIAN - 1] = dateToSheetString(new Date());
  row[COL_KQ.IDKHACHHANG - 1] = body.idKhachHang || '';
  row[COL_KQ.TENSHOP - 1] = body.tenShop || '';
  row[COL_KQ.NGAYTIEPCAN - 1] = body.ngayTiepCan || '';
  row[COL_KQ.DIACHI - 1] = body.diaChi || '';
  row[COL_KQ.ANHCHECKIN - 1] = await uploadKeHoachImage(body.anhCheckin, 'checkin');
  row[COL_KQ.ANHSANPHAM - 1] = await uploadKeHoachImage(body.anhSanPham, 'sanpham');
  row[COL_KQ.SANLUONGGUIGHN - 1] = body.sanLuongGuiGHN || '';
  row[COL_KQ.BANGGIA - 1] = body.bangGia || '';
  row[COL_KQ.NGAYBATDAULENDON - 1] = body.ngayBatDauLenDon || '';
  await appendValues(KEHOACH_SHEET_ID, 'Ketqua', row);
  return { ok: true };
}

async function handleAddTienDo(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const row = [];
  row[COL_TD.THOIGIAN - 1] = dateToSheetString(new Date());
  row[COL_TD.IDKHACHHANG - 1] = body.idKhachHang || '';
  row[COL_TD.SDT - 1] = body.sdtKH || '';
  row[COL_TD.TENSHOP - 1] = body.tenShop || '';
  row[COL_TD.NGAYGAPKH - 1] = body.ngayGapKH || '';
  row[COL_TD.DIACHI - 1] = body.diaChi || '';
  row[COL_TD.ANHCHECKIN - 1] = await uploadKeHoachImage(body.anhCheckin, 'checkin');
  row[COL_TD.ANHSANPHAM - 1] = await uploadKeHoachImage(body.anhSanPham, 'sanpham');
  row[COL_TD.SANPHAM - 1] = body.sanPham || '';
  row[COL_TD.DOITHU - 1] = body.doiThu || '';
  row[COL_TD.BANGGIA - 1] = body.bangGia || '';
  row[COL_TD.CHINHSACH - 1] = body.chinhSach || '';
  row[COL_TD.SANLUONG - 1] = body.sanLuong || '';
  row[COL_TD.KHOILUONG - 1] = body.khoiLuong || '';
  row[COL_TD.LYDO - 1] = body.lyDo || '';
  row[COL_TD.DEXUAT - 1] = body.deXuat || '';
  await appendValues(KEHOACH_SHEET_ID, 'Tiendo', row);
  return { ok: true };
}

// ================================================================================================
// ====== BÁO CÁO KẾT QUẢ KINH DOANH (BCKQKD) — port từ Code.gs (dòng ~1227-1657) ======
// ================================================================================================
function defaultBCKQKDSchema() {
  return {
    version: 1,
    sections: [
      {
        id: 's1', title: '1. TỔNG QUAN KẾT QUẢ KINH DOANH',
        items: [
          {
            type: 'kpi_table', id: 't11', title: '1.1. Mức độ hoàn thành kế hoạch',
            cols: ['Doanh thu Thực tế', 'Target trong tháng', '% Hoàn thành target', '% Tăng/ giảm so với tuần trước'],
            rows: [
              { id: 'ltc', label: 'Tổng doanh thu LTC', autoActual: 'ltc' },
              { id: 'gttc', label: 'Tổng doanh thu GTTC' },
              { id: 'giucu', label: 'Doanh thu giữ cũ', note: '(Doanh thu KH duy trì/ thăng hạng tháng N so với tháng N-1)', autoActual: 'giucu' },
              { id: 'banmoi', label: 'Doanh thu bán mới', note: '(Doanh thu KH mới trong tháng N)', autoActual: 'banmoi' }
            ]
          },
          { type: 'richtext', id: 'f12_nhandinh', label: '1.2. Kết quả Giữ cũ — Nhận định chung' },
          { type: 'richtext', id: 'f12_soLieu', label: '1.2. Số liệu & Các điểm nổi bật', placeholder: 'Nhóm khách hàng có nguy cơ rời bỏ? Nhóm khách hàng có dấu hiệu giảm doanh thu? Nguyên nhân chính tác động đến kết quả giữ cũ trong tuần?' },
          { type: 'richtext', id: 'f13_nhandinh', label: '1.3. Kết quả Bán mới — Nhận định chung' },
          { type: 'richtext', id: 'f13_soLieu', label: '1.3. Số liệu & Các điểm nổi bật', placeholder: 'Số lượng KH bán mới phát sinh (kèm sản lượng TB)? Khu vực/AM tốt? Khu vực/AM chưa đạt? Vấn đề ảnh hưởng tiến độ? Dự kiến tuần tới?' }
        ]
      },
      {
        id: 's2', title: '2. ĐIỂM NỔI BẬT TRONG TUẦN - Khách hàng nhóm A',
        items: [
          {
            type: 'kpi_table', id: 't2', title: '',
            cols: ['Dữ liệu', 'So sánh tăng/ giảm với tuần trước', 'Ghi chú (nếu có)'],
            rows: [
              { id: 'tongA', label: 'Tổng số lượng KH nhóm A đầu tháng' },
              { id: 'coLenDon', label: 'Số KH có lên đơn đến hiện tại' },
              { id: 'giamHang', label: '1. Số KH A dự kiến giảm hạng' },
              { id: 'nguyCo', label: '2. Số KH A nguy cơ rời bỏ (không có DT LTC đến hiện tại)' },
              { id: 'tiemNang', label: 'Số KH tiềm năng lên hạng A' }
            ]
          },
          { type: 'richtext', id: 'f2_nhandinh', label: 'Nhận định chính', placeholder: 'Tình hình nhóm KH A tại Vùng trong tuần? Các vấn đề mà nhóm KH A đang gặp phải tại Vùng?' },
          { type: 'richtext', id: 'f2_tongquanRoiBo', label: 'CHI TIẾT KH NHÓM A RỜI BỎ — Tổng quan nguyên nhân rời bỏ', placeholder: 'Vấn đề đặc biệt/xuất hiện chung ở nhóm KH rời bỏ trong tuần (nên có tỷ trọng các vấn đề để ưu tiên giải pháp)' },
          {
            type: 'repeatable_table', id: 't2b', title: 'Danh sách khách hàng rời bỏ trong tuần',
            columns: [
              { id: 'clientId', label: 'Client_ID' }, { id: 'tenKH', label: 'Tên KH' }, { id: 'am', label: 'AM phụ trách' },
              { id: 'dtBinhQuan', label: 'Doanh thu bình quân theo tháng' }, { id: 'ngayNgung', label: 'Ngày ngưng lên đơn', type: 'date' },
              { id: 'phanHang', label: 'Phân hạng KH trước khi rời bỏ' }, { id: 'lyDo', label: 'Lý do rời bỏ' }, { id: 'hanhDong', label: 'Hành động/hướng xử lý' }
            ]
          }
        ]
      },
      {
        id: 's3', title: '3. TỔNG HỢP CÁC VẤN ĐỀ - HÀNH ĐỘNG & GIẢI PHÁP',
        items: [
          {
            type: 'repeatable_table', id: 't31', title: '3.1. Các vấn đề chính trong tuần',
            columns: [
              { id: 'nhom', label: 'Nhóm vấn đề chính', type: 'select', options: ['Giữ cũ', 'Bán mới', 'Vận hành', 'Giá', 'CSKH'] },
              { id: 'moTa', label: 'Mô tả vấn đề' }, { id: 'tacDong', label: 'Tác động đến KH' },
              { id: 'uuTien', label: 'Mức độ ưu tiên xử lý', type: 'select', options: ['Cao', 'TB', 'Thấp'] },
              { id: 'tienDo', label: 'Tiến độ xử lý' }
            ]
          },
          {
            type: 'repeatable_table', id: 't32', title: '3.2. Giải pháp & kế hoạch tuần tới',
            columns: [
              { id: 'giaiPhap', label: 'Giải pháp/Kế hoạch' }, { id: 'doiTuong', label: 'Đối tượng' }, { id: 'mucTieu', label: 'Mục tiêu tác động' },
              { id: 'ngayTrienKhai', label: 'Ngày triển khai', type: 'date' }, { id: 'pic', label: 'PIC' }, { id: 'canHoTro', label: 'Cần hỗ trợ' }
            ]
          }
        ]
      }
    ]
  };
}

async function ensureBCKQKDSheets() {
  const cfgRes = await ensureSheetWithHeaders(KEHOACH_SHEET_ID, BCKQKD_SHEETS.CONFIG, ['Key', 'Value']);
  if (cfgRes.created) {
    await putValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.CONFIG + "'!A2", [['schema_json', JSON.stringify(defaultBCKQKDSchema())]]);
  }
  await ensureSheetWithHeaders(KEHOACH_SHEET_ID, BCKQKD_SHEETS.PERIODS, ['PeriodId', 'Label', 'Deadline', 'ReportersJson', 'Status', 'CreatedBy', 'CreatedAt']);
  await ensureSheetWithHeaders(KEHOACH_SHEET_ID, BCKQKD_SHEETS.SUBMISSIONS, ['PeriodId', 'ReporterEmail', 'ReporterName', 'SubmittedAt', 'UpdatedAt', 'AnswersJson', 'Locked']);
  await ensureSheetWithHeaders(KEHOACH_SHEET_ID, BCKQKD_SHEETS.AGGREGATE, ['PeriodId', 'GeneratedAt', 'GeneratedBy', 'ContentJson', 'Model', 'EditedAt', 'EditedBy']);
}

async function readBCKQKDSchema() {
  const values = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.CONFIG + "'");
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === 'schema_json') {
      try { return JSON.parse(values[i][1]); } catch (e) { return defaultBCKQKDSchema(); }
    }
  }
  return defaultBCKQKDSchema();
}

async function readBCKQKDPeriods() {
  const values = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.PERIODS + "'");
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[0]) continue;
    let reporters = [];
    try { reporters = JSON.parse(r[3] || '[]'); } catch (e) {}
    out.push({
      periodId: String(r[0]), label: String(r[1] || ''),
      deadline: (typeof r[2] === 'number' && r[2] > 0) ? serialToDate(r[2]).toISOString() : '',
      reporters: reporters, status: String(r[4] || 'open'),
      createdBy: String(r[5] || ''), createdAt: (typeof r[6] === 'number' && r[6] > 0) ? serialToDate(r[6]).toISOString() : ''
    });
  }
  return out;
}

async function handleGetBCKQKDData(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureBCKQKDSheets();
  const schema = await readBCKQKDSchema();
  const periods = await readBCKQKDPeriods();
  const isAdmin = await isAdminEmail(auth.email);

  const subValues = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.SUBMISSIONS + "'");
  const mySubmissions = {};
  for (let i = 1; i < subValues.length; i++) {
    const r = subValues[i];
    if (normEmail(r[1]) !== auth.email) continue;
    let answers = {};
    try { answers = JSON.parse(r[5] || '{}'); } catch (e) {}
    mySubmissions[String(r[0])] = {
      submittedAt: (typeof r[3] === 'number' && r[3] > 0) ? serialToDate(r[3]).toISOString() : '',
      updatedAt: (typeof r[4] === 'number' && r[4] > 0) ? serialToDate(r[4]).toISOString() : '',
      answers: answers, locked: r[6] === true
    };
  }

  let staff = [];
  if (isAdmin) {
    const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
    for (let j = 1; j < mainValues.length; j++) {
      const mr = mainValues[j];
      if (mr[COL.ACTIVE - 1] === true) staff.push({ email: normEmail(mr[COL.EMAIL - 1]), name: String(mr[COL.HOTEN - 1] || '') });
    }
  }
  return { ok: true, schema: schema, periods: periods, mySubmissions: mySubmissions, isAdmin: isAdmin, staff: staff, myEmail: auth.email, myName: auth.name };
}

async function handleSaveBCKQKDSchema(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureBCKQKDSheets();
  let schema;
  try { schema = JSON.parse(body.schemaJson); } catch (e) { return { ok: false, error: 'bad_schema' }; }
  if (!schema || !Array.isArray(schema.sections)) return { ok: false, error: 'bad_schema' };
  const values = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.CONFIG + "'");
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) { if (values[i][0] === 'schema_json') { rowIdx = i + 1; break; } }
  if (rowIdx === -1) await appendValues(KEHOACH_SHEET_ID, BCKQKD_SHEETS.CONFIG, ['schema_json', JSON.stringify(schema)]);
  else await batchUpdateValues(KEHOACH_SHEET_ID, [{ range: "'" + BCKQKD_SHEETS.CONFIG + "'!B" + rowIdx, values: [[JSON.stringify(schema)]] }]);
  return { ok: true };
}

async function handleSaveBCKQKDPeriod(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureBCKQKDSheets();
  const periodId = String(body.periodId || '').trim() || ('P' + Date.now());
  const label = String(body.label || '').trim();
  if (!label) return { ok: false, error: 'missing_label' };
  const deadline = body.deadline ? dateToSheetString(new Date(body.deadline)) : '';
  const reporters = Array.isArray(body.reporters) ? body.reporters : [];
  const status = String(body.status || 'open');

  const values = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.PERIODS + "'");
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) { if (String(values[i][0]) === periodId) { rowIdx = i + 1; break; } }
  if (rowIdx === -1) {
    await appendValues(KEHOACH_SHEET_ID, BCKQKD_SHEETS.PERIODS, [periodId, label, deadline, JSON.stringify(reporters), status, auth.email, dateToSheetString(new Date())]);
  } else {
    await batchUpdateValues(KEHOACH_SHEET_ID, [{ range: "'" + BCKQKD_SHEETS.PERIODS + "'!B" + rowIdx + ':F' + rowIdx, values: [[label, deadline, JSON.stringify(reporters), status, values[rowIdx - 1][5]]] }]);
  }
  return { ok: true, periodId: periodId };
}

async function handleDeleteBCKQKDPeriod(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureBCKQKDSheets();
  const periodId = String(body.periodId || '');
  const values = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.PERIODS + "'");
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === periodId) { await deleteRowByIndex(KEHOACH_SHEET_ID, BCKQKD_SHEETS.PERIODS, i + 1); break; }
  }
  return { ok: true };
}

async function handleSaveBCKQKDSubmission(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureBCKQKDSheets();
  const periodId = String(body.periodId || '');
  if (!periodId) return { ok: false, error: 'missing_period' };
  const isAdmin = await isAdminEmail(auth.email);
  const periods = await readBCKQKDPeriods();
  const period = periods.filter((p) => p.periodId === periodId)[0];
  if (!period) return { ok: false, error: 'period_not_found' };

  if (!isAdmin) {
    const assigned = period.reporters.some((r) => normEmail(r.email) === auth.email);
    if (!assigned) return { ok: false, error: 'not_assigned' };
    if (period.deadline && new Date(period.deadline).getTime() < Date.now()) return { ok: false, error: 'deadline_passed' };
    if (period.status === 'closed') return { ok: false, error: 'period_closed' };
  }

  const answersJson = JSON.stringify(body.answers || {});
  const values = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.SUBMISSIONS + "'");
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === periodId && normEmail(values[i][1]) === auth.email) { rowIdx = i + 1; break; }
  }
  const nowStr = dateToSheetString(new Date());
  if (rowIdx === -1) {
    await appendValues(KEHOACH_SHEET_ID, BCKQKD_SHEETS.SUBMISSIONS, [periodId, auth.email, auth.name, nowStr, nowStr, answersJson, false]);
  } else {
    await batchUpdateValues(KEHOACH_SHEET_ID, [{ range: "'" + BCKQKD_SHEETS.SUBMISSIONS + "'!E" + rowIdx + ':F' + rowIdx, values: [[nowStr, answersJson]] }]);
  }
  return { ok: true };
}

async function handleGetBCKQKDSubmissionsForPeriod(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureBCKQKDSheets();
  const periodId = String(body.periodId || '');
  const values = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.SUBMISSIONS + "'");
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (String(r[0]) !== periodId) continue;
    let answers = {};
    try { answers = JSON.parse(r[5] || '{}'); } catch (e) {}
    out.push({
      email: normEmail(r[1]), name: String(r[2] || ''),
      submittedAt: (typeof r[3] === 'number' && r[3] > 0) ? serialToDate(r[3]).toISOString() : '',
      updatedAt: (typeof r[4] === 'number' && r[4] > 0) ? serialToDate(r[4]).toISOString() : '',
      answers: answers, locked: r[6] === true
    });
  }
  return { ok: true, submissions: out };
}

function buildBCKQKDAggregatePrompt(schema, period, submissions) {
  return 'Bạn là Trưởng phòng Kinh doanh Vùng, đang tổng hợp báo cáo kết quả kinh doanh hàng tuần từ các bài ' +
    'giải trình do nhiều AM/nhân sự trong Vùng nộp riêng lẻ, để ra 1 BÁO CÁO VÙNG DUY NHẤT, mạch lạc, không ' +
    'trùng lặp, đúng văn phong báo cáo quản trị cấp cao (súc tích, có số liệu, có nhận định, không sáo rỗng).\n\n' +
    'Kỳ báo cáo: "' + period.label + '".\n\n' +
    'Cấu trúc biểu mẫu (JSON mô tả các mục/câu hỏi mà từng người đã trả lời, dùng để bạn hiểu ý nghĩa từng field id):\n' +
    JSON.stringify(schema) + '\n\n' +
    'Danh sách bài nộp của từng người (mỗi answers là object {fieldId: giá trị}, với repeatable_table thì giá trị ' +
    'là mảng các dòng object theo đúng columns đã khai báo trong schema):\n' +
    JSON.stringify(submissions) + '\n\n' +
    'YÊU CẦU QUAN TRỌNG:\n' +
    '- TUYỆT ĐỐI không bịa thêm số liệu/sự kiện ngoài những gì đã có trong dữ liệu submissions ở trên.\n' +
    '- Nếu nhiều người cùng trả lời 1 mục (VD nhận định chung), hãy GỘP Ý, loại trùng lặp, giữ lại ý có giá trị nhất, viết lại mạch lạc thành 1 đoạn duy nhất — không liệt kê nguyên văn từng người.\n' +
    '- Với các bảng lặp (VD danh sách KH rời bỏ, danh sách vấn đề, danh sách giải pháp) hãy GỘP TẤT CẢ dòng từ mọi người nộp vào 1 danh sách chung duy nhất cho mục đó, KHÔNG bỏ sót dòng nào, KHÔNG bịa thêm dòng.\n' +
    '- Nếu 1 mục hoàn toàn không có ai trả lời, để giá trị rỗng ("" hoặc mảng rỗng), không tự suy diễn.\n\n' +
    'Trả về DUY NHẤT 1 JSON object (không markdown, không giải thích thêm) với cấu trúc: ' +
    '{"sections": [{"id": "<đúng id mục trong schema>", "items": [{"id": "<đúng id item trong schema>", ' +
    '"type": "richtext hoặc kpi_table hoặc repeatable_table", ' +
    '"value": "<với richtext: 1 đoạn văn tổng hợp; với kpi_table: object {rowId: {actual,target,pctTarget,pctWow}} giữ nguyên số liệu KPI đã có (lấy từ submission nào có điền, ưu tiên submission mới nhất); với repeatable_table: mảng object các dòng đã gộp>"}]}], ' +
    '"executiveSummary": "3-5 câu tóm tắt điều hành ở đầu báo cáo, nêu bật điểm tốt/điểm cần lưu ý nhất trong kỳ"}';
}

async function handleGenerateBCKQKDAggregate(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: 'ai_not_configured' };
  await ensureBCKQKDSheets();
  const periodId = String(body.periodId || '');
  const periods = await readBCKQKDPeriods();
  const period = periods.filter((p) => p.periodId === periodId)[0];
  if (!period) return { ok: false, error: 'period_not_found' };
  const schema = await readBCKQKDSchema();

  const subValues = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.SUBMISSIONS + "'");
  const submissions = [];
  for (let i = 1; i < subValues.length; i++) {
    const r = subValues[i];
    if (String(r[0]) !== periodId) continue;
    let answers = {};
    try { answers = JSON.parse(r[5] || '{}'); } catch (e) {}
    submissions.push({ name: String(r[2] || ''), email: normEmail(r[1]), answers: answers });
  }
  if (!submissions.length) return { ok: false, error: 'no_submissions' };

  const prompt = buildBCKQKDAggregatePrompt(schema, period, submissions);
  let resp;
  try {
    resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, responseMimeType: 'application/json' }
        })
      }
    );
  } catch (err) { return { ok: false, error: 'ai_network_error', detail: String(err) }; }
  if (resp.status === 429) return { ok: false, error: 'ai_rate_limited' };
  if (resp.status !== 200) {
    const t = await resp.text().catch(() => '');
    return { ok: false, error: 'ai_http_' + resp.status, detail: t.slice(0, 300) };
  }

  let data;
  try { data = await resp.json(); } catch (err) { return { ok: false, error: 'ai_bad_json' }; }
  const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) return { ok: false, error: 'ai_empty_response' };
  const cleaned = String(text).replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  let content;
  try { content = JSON.parse(cleaned); } catch (err) { return { ok: false, error: 'ai_parse_error' }; }

  const now = new Date();
  const nowStr = dateToSheetString(now);
  const aggValues = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.AGGREGATE + "'");
  let rowIdx = -1;
  for (let j = 1; j < aggValues.length; j++) { if (String(aggValues[j][0]) === periodId) { rowIdx = j + 1; break; } }
  if (rowIdx === -1) {
    await appendValues(KEHOACH_SHEET_ID, BCKQKD_SHEETS.AGGREGATE, [periodId, nowStr, auth.email, JSON.stringify(content), GEMINI_MODEL, '', '']);
  } else {
    await batchUpdateValues(KEHOACH_SHEET_ID, [{ range: "'" + BCKQKD_SHEETS.AGGREGATE + "'!B" + rowIdx + ':G' + rowIdx, values: [[nowStr, auth.email, JSON.stringify(content), GEMINI_MODEL, '', '']] }]);
  }

  return { ok: true, content: content, generatedAt: now.toISOString() };
}

async function handleGetBCKQKDAggregate(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureBCKQKDSheets();
  const periodId = String(body.periodId || '');
  const values = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.AGGREGATE + "'");
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === periodId) {
      let content = {};
      try { content = JSON.parse(values[i][3] || '{}'); } catch (e) {}
      const editedAt = (typeof values[i][5] === 'number' && values[i][5] > 0) ? serialToDate(values[i][5]).toISOString() : '';
      const editedBy = values[i][6] || '';
      const generatedAt = (typeof values[i][1] === 'number' && values[i][1] > 0) ? serialToDate(values[i][1]).toISOString() : '';
      return { ok: true, content: content, generatedAt: generatedAt, generatedBy: values[i][2], editedAt: editedAt, editedBy: editedBy };
    }
  }
  return { ok: true, content: null };
}

async function handleUpdateBCKQKDAggregate(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  const periodId = String(body.periodId || '');
  if (!periodId) return { ok: false, error: 'missing_period' };
  const content = body.content;
  if (!content || typeof content !== 'object') return { ok: false, error: 'bad_schema' };
  await ensureBCKQKDSheets();
  const values = await getValues(KEHOACH_SHEET_ID, "'" + BCKQKD_SHEETS.AGGREGATE + "'");
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) { if (String(values[i][0]) === periodId) { rowIdx = i + 1; break; } }
  if (rowIdx === -1) return { ok: false, error: 'aggregate_not_found' };
  const now = new Date();
  await batchUpdateValues(KEHOACH_SHEET_ID, [
    { range: "'" + BCKQKD_SHEETS.AGGREGATE + "'!D" + rowIdx, values: [[JSON.stringify(content)]] },
    { range: "'" + BCKQKD_SHEETS.AGGREGATE + "'!F" + rowIdx + ':G' + rowIdx, values: [[dateToSheetString(now), auth.email]] }
  ]);
  return { ok: true, editedAt: now.toISOString(), editedBy: auth.email };
}

// ================================================================================================
// ====== KẾ HOẠCH EVENT — port từ Code.gs (dòng ~2123-2490) ======
// ================================================================================================
function defaultEventSchema() {
  return {
    version: 1,
    sections: [
      {
        id: 'e1', title: 'I. MỤC TIÊU CỦA VÙNG TRONG KỲ EVENT',
        items: [
          {
            type: 'kpi_table', id: 'et1', title: 'I.1. Chỉ tiêu cam kết',
            cols: ['Mục tiêu kỳ Event', 'Thực tế kỳ Event trước', 'Ghi chú'],
            rows: [
              { id: 'gtc', label: '%GTC — Giao thành công' },
              { id: 'ltc', label: '%LTC — Lấy thành công' },
              { id: 'dilamPTTT', label: '%đi làm NVPTTT' },
              { id: 'clearTon', label: 'Tiến độ clear hàng tồn (giờ)' },
              { id: 'rotLC', label: '%Rớt luân chuyển' }
            ]
          },
          { type: 'richtext', id: 'e1_config', label: 'I.2. Link file config sản lượng/chi phí của Vùng', placeholder: 'Dán link Google Sheet/Drive file config sản lượng & chi phí của Vùng' },
          { type: 'richtext', id: 'e1_nhandinh', label: 'I.3. Nhận định chung về kỳ Event', placeholder: 'Mức độ khó của kỳ này so với kỳ trước? Điểm cần tập trung nhất? Rủi ro lớn nhất đã nhận diện?' }
        ]
      },
      {
        id: 'e2', title: 'II. NĂNG LỰC ĐÁP ỨNG THEO BƯU CỤC (CAP & NHÂN SỰ)',
        items: [
          {
            type: 'repeatable_table', id: 'et2', title: 'II.1. CAP và nhân sự thực tế từng Bưu cục',
            autoFillFrom: 'bc_list',
            columns: [
              { id: 'bc', label: 'Bưu cục' },
              { id: 'tinh', label: 'Tỉnh' },
              { id: 'capLay', label: 'CAP Lấy/ngày (đơn)', type: 'number' },
              { id: 'capGiao', label: 'CAP Giao/ngày (đơn)', type: 'number' },
              { id: 'nvptttHienCo', label: 'NVPTTT hiện có', type: 'number' },
              { id: 'nvptttDinhBien', label: 'NVPTTT định biên', type: 'number' },
              { id: 'nangSuat', label: 'Năng suất TB (đơn/người/ngày)', type: 'number' },
              { id: 'ghichu', label: 'Ghi chú' }
            ]
          }
        ]
      },
      {
        id: 'e3', title: 'III. PHÂN LOẠI NHÓM BƯU CỤC & PHƯƠNG ÁN ỨNG PHÓ',
        items: [
          { type: 'richtext', id: 'e3_tongquan', label: 'III.1. Tổng quan phân nhóm', placeholder: 'Bao nhiêu BC mỗi nhóm? Vấn đề tập trung ở tỉnh/khu vực nào? Nguyên nhân chung?' },
          {
            type: 'repeatable_table', id: 'et3', title: 'III.2. Danh sách Bưu cục theo nhóm (Nhóm 2 & 3 bắt buộc nêu rõ PA A/B)',
            autoFillFrom: 'bc_group_suggest',
            columns: [
              { id: 'bc', label: 'Bưu cục' },
              { id: 'nhom', label: 'Nhóm', type: 'select', options: ['Nhóm 1 - Ổn định', 'Nhóm 2 - Cảnh báo', 'Nhóm 3 - Bất ổn'] },
              { id: 'thucTrang', label: 'Thực trạng rủi ro' },
              { id: 'paA', label: 'Phương án A (chủ động)' },
              { id: 'paB', label: 'Phương án B (khẩn cấp)' },
              { id: 'pic', label: 'PIC' }
            ]
          },
          {
            type: 'repeatable_table', id: 'et3b', title: 'III.3. Tỉnh/Quận/BC trọng điểm cần lưu ý',
            columns: [
              { id: 'khuvuc', label: 'Tỉnh/Quận/BC' },
              { id: 'lydo', label: 'Lý do cần quan tâm' },
              { id: 'phuongAn', label: 'Phương án chuẩn bị' }
            ]
          }
        ]
      },
      {
        id: 'e4', title: 'IV. CHECKLIST CÔNG VIỆC CHUẨN BỊ',
        items: [
          {
            type: 'repeatable_table', id: 'et4', title: 'IV.1. Tình trạng chuẩn bị & chi phí dự kiến',
            defaultRows: [
              { hangmuc: 'Công cụ dụng cụ + kho bãi' },
              { hangmuc: 'Bố trí lịch làm, tăng ca, phụ cấp' },
              { hangmuc: 'Ứng phó tác động ngoài: mất điện' },
              { hangmuc: 'Ứng phó tác động ngoài: lỗi hệ thống/rớt mạng' },
              { hangmuc: 'Ứng phó tác động ngoài: mưa giông kéo dài' }
            ],
            columns: [
              { id: 'hangmuc', label: 'Hạng mục' },
              { id: 'tinhTrang', label: 'Tình trạng hiện tại' },
              { id: 'duPhong', label: 'Phương án dự phòng' },
              { id: 'chiPhi', label: 'Chi phí dự kiến (đ)', type: 'number' }
            ]
          },
          {
            type: 'repeatable_table', id: 'et4b', title: 'IV.2. Chi phí phát sinh dự kiến toàn kỳ',
            defaultRows: [
              { khoanMuc: 'Thuê xe' }, { khoanMuc: 'Máy phát điện' }, { khoanMuc: 'Freelancer' },
              { khoanMuc: 'Thưởng nóng' }, { khoanMuc: 'Phụ cấp tăng ca' }, { khoanMuc: 'Thuê kho tạm' }
            ],
            columns: [
              { id: 'khoanMuc', label: 'Khoản mục' },
              { id: 'soLuong', label: 'Số lượng', type: 'number' },
              { id: 'donGia', label: 'Đơn giá (đ)', type: 'number' },
              { id: 'thanhTien', label: 'Thành tiền (đ)', type: 'number' },
              { id: 'ghichu', label: 'Căn cứ đề xuất' }
            ]
          }
        ]
      },
      {
        id: 'e5', title: 'V. KÊNH BÁO CÁO VẤN ĐỀ (ESCALATION)',
        items: [
          {
            type: 'repeatable_table', id: 'et5', title: 'V.1. Đầu mối phụ trách theo loại vấn đề',
            defaultRows: [
              { loaiVanDe: 'Mất điện tại BC' }, { loaiVanDe: 'Lỗi hệ thống/rớt mạng' },
              { loaiVanDe: 'Quá tải sản lượng vượt CAP' }, { loaiVanDe: 'Thiếu hụt nhân sự nghiêm trọng' },
              { loaiVanDe: 'Phát sinh chi phí ngoài kế hoạch' }
            ],
            columns: [
              { id: 'loaiVanDe', label: 'Loại vấn đề' },
              { id: 'taiBC', label: 'Xử lý tại Bưu cục' },
              { id: 'lenVung', label: 'Báo lên Vùng' },
              { id: 'nguoiPhuTrach', label: 'Người phụ trách' },
              { id: 'sdt', label: 'SĐT' }
            ]
          },
          {
            type: 'repeatable_table', id: 'et5b', title: 'V.2. Đầu mối liên hệ các đơn vị hỗ trợ',
            defaultRows: [
              { donVi: 'Capacity team' }, { donVi: 'Phòng Nhân sự / C&B' }, { donVi: 'Tài chính / Vận hành' },
              { donVi: 'Tech' }, { donVi: 'Network' }
            ],
            columns: [
              { id: 'donVi', label: 'Đơn vị hỗ trợ' },
              { id: 'dauMoi', label: 'Đầu mối tại Vùng' },
              { id: 'sdt', label: 'SĐT/Email' }
            ]
          }
        ]
      },
      {
        id: 'e6', title: 'VI. KẾ HOẠCH VẬN HÀNH KTC, KCT & NGUỒN LỰC VÙNG TỰ QUẢN',
        items: [
          {
            type: 'repeatable_table', id: 'et6', title: 'VI.1. KTC/KCT thuộc Vùng quản lý',
            columns: [
              { id: 'kho', label: 'KTC/KCT' },
              { id: 'nhanSu', label: 'Nhân sự (số lượng & vai trò)' },
              { id: 'nguonBu', label: 'Nguồn bù khi thiếu' },
              { id: 'soXe', label: 'Số xe (tự thuê + điều động)', type: 'number' },
              { id: 'baiDo', label: 'Bãi đỗ/tập kết & sức chứa tối đa' },
              { id: 'quaTai', label: 'Phương án khi bãi quá tải' },
              { id: 'lichLam', label: 'Ca làm việc & người trực từng ca' },
              { id: 'dauMoi', label: 'Đầu mối phụ trách' }
            ]
          },
          {
            type: 'repeatable_table', id: 'et6b', title: 'VI.2. Bưu cục CK (cồng kềnh)',
            columns: [
              { id: 'bc', label: 'Bưu cục CK' },
              { id: 'nhanSuCan', label: 'Nhân sự cần có', type: 'number' },
              { id: 'nguon', label: 'Nguồn tuyển/điều động' },
              { id: 'sanSang', label: 'Thời điểm sẵn sàng', type: 'date' },
              { id: 'soXe', label: 'Số xe cần bố trí', type: 'number' },
              { id: 'nguonXe', label: 'Nguồn xe' },
              { id: 'lichTrinh', label: 'Lịch trình vận hành trong ngày' }
            ]
          }
        ]
      }
    ]
  };
}

async function ensureEventSheets() {
  const cfgRes = await ensureSheetWithHeaders(KEHOACH_SHEET_ID, EVENT_SHEETS.CONFIG, ['Key', 'Value']);
  if (cfgRes.created) {
    await putValues(KEHOACH_SHEET_ID, "'" + EVENT_SHEETS.CONFIG + "'!A2", [['schema_json', JSON.stringify(defaultEventSchema())]]);
  }
  await ensureSheetWithHeaders(KEHOACH_SHEET_ID, EVENT_SHEETS.PERIODS, ['EventId', 'Label', 'StartDate', 'EndDate', 'PeakDate', 'Deadline', 'ReportersJson', 'Status', 'CreatedBy', 'CreatedAt']);
  await ensureSheetWithHeaders(KEHOACH_SHEET_ID, EVENT_SHEETS.SUBMISSIONS, ['EventId', 'ReporterEmail', 'ReporterName', 'SubmittedAt', 'UpdatedAt', 'AnswersJson', 'Locked']);
}

async function readEventSchema() {
  const values = await getValues(KEHOACH_SHEET_ID, "'" + EVENT_SHEETS.CONFIG + "'");
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === 'schema_json') {
      try { return JSON.parse(values[i][1]); } catch (e) { return defaultEventSchema(); }
    }
  }
  return defaultEventSchema();
}

function eventDateStr(v) {
  if (!v) return '';
  if (typeof v === 'number' && v > 0) {
    const d = serialToDate(v);
    const vn = new Date(d.getTime() + VN_OFFSET_MS);
    const pad = (n) => String(n).padStart(2, '0');
    return vn.getUTCFullYear() + '-' + pad(vn.getUTCMonth() + 1) + '-' + pad(vn.getUTCDate());
  }
  return String(v);
}

async function readEventPeriods() {
  const values = await getValues(KEHOACH_SHEET_ID, "'" + EVENT_SHEETS.PERIODS + "'");
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[0]) continue;
    let reporters = [];
    try { reporters = JSON.parse(r[6] || '[]'); } catch (e) {}
    out.push({
      eventId: String(r[0]), label: String(r[1] || ''),
      startDate: eventDateStr(r[2]), endDate: eventDateStr(r[3]), peakDate: eventDateStr(r[4]),
      deadline: (typeof r[5] === 'number' && r[5] > 0) ? serialToDate(r[5]).toISOString() : '',
      reporters: reporters, status: String(r[7] || 'open'),
      createdBy: String(r[8] || ''), createdAt: (typeof r[9] === 'number' && r[9] > 0) ? serialToDate(r[9]).toISOString() : ''
    });
  }
  return out;
}

async function handleGetEventData(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureEventSheets();
  const schema = await readEventSchema();
  const periods = await readEventPeriods();
  const isAdmin = await isAdminEmail(auth.email);

  const subValues = await getValues(KEHOACH_SHEET_ID, "'" + EVENT_SHEETS.SUBMISSIONS + "'");
  const mySubmissions = {};
  for (let i = 1; i < subValues.length; i++) {
    const r = subValues[i];
    if (normEmail(r[1]) !== auth.email) continue;
    let answers = {};
    try { answers = JSON.parse(r[5] || '{}'); } catch (e) {}
    mySubmissions[String(r[0])] = {
      submittedAt: (typeof r[3] === 'number' && r[3] > 0) ? serialToDate(r[3]).toISOString() : '',
      updatedAt: (typeof r[4] === 'number' && r[4] > 0) ? serialToDate(r[4]).toISOString() : '',
      answers: answers, locked: r[6] === true
    };
  }

  let staff = [];
  if (isAdmin) {
    const mainValues = await getValues(SHEET_ID, "'" + MAIN_SHEET_NAME + "'");
    for (let j = 1; j < mainValues.length; j++) {
      const mr = mainValues[j];
      if (mr[COL.ACTIVE - 1] === true) staff.push({ email: normEmail(mr[COL.EMAIL - 1]), name: String(mr[COL.HOTEN - 1] || '') });
    }
  }
  return { ok: true, schema: schema, periods: periods, mySubmissions: mySubmissions, isAdmin: isAdmin, staff: staff, myEmail: auth.email, myName: auth.name };
}

async function handleSaveEventSchema(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureEventSheets();
  let schema;
  try { schema = JSON.parse(body.schemaJson); } catch (e) { return { ok: false, error: 'bad_schema' }; }
  if (!schema || !Array.isArray(schema.sections)) return { ok: false, error: 'bad_schema' };
  const values = await getValues(KEHOACH_SHEET_ID, "'" + EVENT_SHEETS.CONFIG + "'");
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) { if (values[i][0] === 'schema_json') { rowIdx = i + 1; break; } }
  if (rowIdx === -1) await appendValues(KEHOACH_SHEET_ID, EVENT_SHEETS.CONFIG, ['schema_json', JSON.stringify(schema)]);
  else await batchUpdateValues(KEHOACH_SHEET_ID, [{ range: "'" + EVENT_SHEETS.CONFIG + "'!B" + rowIdx, values: [[JSON.stringify(schema)]] }]);
  return { ok: true };
}

async function handleSaveEventPeriod(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureEventSheets();
  const eventId = String(body.eventId || '').trim() || ('EV' + Date.now());
  const label = String(body.label || '').trim();
  if (!label) return { ok: false, error: 'missing_label' };
  const deadline = body.deadline ? dateToSheetString(new Date(body.deadline)) : '';
  const reportersJson = JSON.stringify(Array.isArray(body.reporters) ? body.reporters : []);
  const status = String(body.status || 'open');
  const midRow = [String(body.startDate || ''), String(body.endDate || ''), String(body.peakDate || ''), deadline, reportersJson, status];

  const values = await getValues(KEHOACH_SHEET_ID, "'" + EVENT_SHEETS.PERIODS + "'");
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) { if (String(values[i][0]) === eventId) { rowIdx = i + 1; break; } }
  if (rowIdx === -1) {
    await appendValues(KEHOACH_SHEET_ID, EVENT_SHEETS.PERIODS, [eventId, label].concat(midRow).concat([auth.email, dateToSheetString(new Date())]));
  } else {
    await batchUpdateValues(KEHOACH_SHEET_ID, [{ range: "'" + EVENT_SHEETS.PERIODS + "'!B" + rowIdx + ':H' + rowIdx, values: [[label].concat(midRow)] }]);
  }
  return { ok: true, eventId: eventId };
}

async function handleDeleteEventPeriod(body) {
  const auth = await requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureEventSheets();
  const eventId = String(body.eventId || '');
  const values = await getValues(KEHOACH_SHEET_ID, "'" + EVENT_SHEETS.PERIODS + "'");
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === eventId) { await deleteRowByIndex(KEHOACH_SHEET_ID, EVENT_SHEETS.PERIODS, i + 1); break; }
  }
  return { ok: true };
}

async function handleSaveEventSubmission(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureEventSheets();
  const eventId = String(body.eventId || '');
  if (!eventId) return { ok: false, error: 'missing_period' };

  const isAdmin = await isAdminEmail(auth.email);
  const period = (await readEventPeriods()).filter((p) => p.eventId === eventId)[0];
  if (!period) return { ok: false, error: 'period_not_found' };
  if (!isAdmin) {
    const assigned = period.reporters.some((r) => normEmail(r.email) === auth.email);
    if (!assigned) return { ok: false, error: 'not_assigned' };
    if (period.deadline && new Date(period.deadline).getTime() < Date.now()) return { ok: false, error: 'deadline_passed' };
    if (period.status === 'closed') return { ok: false, error: 'period_closed' };
  }

  const answersJson = JSON.stringify(body.answers || {});
  const values = await getValues(KEHOACH_SHEET_ID, "'" + EVENT_SHEETS.SUBMISSIONS + "'");
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === eventId && normEmail(values[i][1]) === auth.email) { rowIdx = i + 1; break; }
  }
  const nowStr = dateToSheetString(new Date());
  if (rowIdx === -1) {
    await appendValues(KEHOACH_SHEET_ID, EVENT_SHEETS.SUBMISSIONS, [eventId, auth.email, auth.name, nowStr, nowStr, answersJson, false]);
  } else {
    await batchUpdateValues(KEHOACH_SHEET_ID, [{ range: "'" + EVENT_SHEETS.SUBMISSIONS + "'!E" + rowIdx + ':F' + rowIdx, values: [[nowStr, answersJson]] }]);
  }
  return { ok: true };
}

async function handleGetEventSubmissions(body) {
  const auth = await requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  await ensureEventSheets();
  const eventId = String(body.eventId || '');
  const values = await getValues(KEHOACH_SHEET_ID, "'" + EVENT_SHEETS.SUBMISSIONS + "'");
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (String(r[0]) !== eventId) continue;
    let answers = {};
    try { answers = JSON.parse(r[5] || '{}'); } catch (e) {}
    out.push({
      email: normEmail(r[1]), name: String(r[2] || ''),
      submittedAt: (typeof r[3] === 'number' && r[3] > 0) ? serialToDate(r[3]).toISOString() : '',
      updatedAt: (typeof r[4] === 'number' && r[4] > 0) ? serialToDate(r[4]).toISOString() : '',
      answers: answers
    });
  }
  return { ok: true, submissions: out };
}


module.exports = {
  SHEET_ID, KEHOACH_SHEET_ID, MAIN_SHEET_NAME, COL,
  getAccessToken, getValues, batchGetValues, batchUpdateValues, getSheetTitles, getNumberFormats,
  appendValues, getSheetMeta, ensureSheetWithHeaders, deleteRowByIndex, putValues,
  normEmail, isValidGhnEmail, hashPassword, makeToken, verifyToken, findUserRow, getPermissions,
  computeModuleAccessForRole, handleLogin, handleValidateSession, handleGetReportData,
  handleChangePassword, handleRequestSessionOtp, handleVerifySessionOtp, sendGmailMessage,
  handleGetModuleConfig, handleUpdateModuleConfig,
  handleGetUserList, handleUpdateUserPermissions, handleAddUser, handleUpdateUser, handleDeleteUser, handleAdminResetPassword,
  handleGetKeHoachData, handleAddKeHoach, handleUpdateKeHoach, handleAddKetQua, handleAddTienDo,
  handleGetBCKQKDData, handleSaveBCKQKDSchema, handleSaveBCKQKDPeriod, handleDeleteBCKQKDPeriod,
  handleSaveBCKQKDSubmission, handleGetBCKQKDSubmissionsForPeriod, handleGenerateBCKQKDAggregate,
  handleGetBCKQKDAggregate, handleUpdateBCKQKDAggregate,
  handleGetEventData, handleSaveEventSchema, handleSaveEventPeriod, handleDeleteEventPeriod,
  handleSaveEventSubmission, handleGetEventSubmissions,
  handleHeartbeat, handleGetOnlineUsers,
  handleGetLapDayData
};
