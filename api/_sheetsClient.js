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

async function apiCall(pathAndQuery, opts) {
     opts = opts || {};
     const token = await getAccessToken();
     const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + pathAndQuery;
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

async function getValues(range, opts) {
     opts = opts || {};
     const qs = new URLSearchParams({
            valueRenderOption: opts.valueRenderOption || 'UNFORMATTED_VALUE',
            dateTimeRenderOption: opts.dateTimeRenderOption || 'SERIAL_NUMBER'
     });
     const data = await apiCall('/values/' + encodeURIComponent(range) + '?' + qs.toString());
     return (data && data.values) || [];
}

async function batchGetValues(sheetNames, opts) {
     opts = opts || {};
     const qs = new URLSearchParams({
            valueRenderOption: opts.valueRenderOption || 'UNFORMATTED_VALUE',
            dateTimeRenderOption: opts.dateTimeRenderOption || 'SERIAL_NUMBER'
     });
     sheetNames.forEach((n) => qs.append('ranges', "'" + n + "'"));
     const data = await apiCall('/values:batchGet?' + qs.toString());
     return (data && data.valueRanges) || [];
}

async function batchUpdateValues(dataArr) {
     return apiCall('/values:batchUpdate', {
            method: 'POST',
            body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: dataArr })
     });
}

async function getSheetTitles() {
     const data = await apiCall('?fields=' + encodeURIComponent('sheets.properties.title'));
     return ((data && data.sheets) || []).map((s) => s.properties.title);
}

// Trả về map: tên sheet -> mảng 2 chiều (song song values) chứa loại numberFormat ('DATE'/'DATE_TIME'/
// 'TIME'/'NUMBER'/... hoặc null) — dùng để biết ô nào thực sự là ngày/giờ (giống cách Apps Script tự
// trả về đối tượng Date cho các ô định dạng ngày khi đọc bằng getValues()).
async function getNumberFormats(sheetNames) {
     if (!sheetNames.length) return {};
     const qs = new URLSearchParams();
     sheetNames.forEach((n) => qs.append('ranges', "'" + n + "'"));
     qs.append('fields', 'sheets(properties.title,data.rowData.values.effectiveFormat.numberFormat.type)');
     const data = await apiCall('?' + qs.toString());
     const map = {};
     ((data && data.sheets) || []).forEach((s) => {
            const title = s.properties.title;
            const rowData = (s.data && s.data[0] && s.data[0].rowData) || [];
            map[title] = rowData.map((rd) => (rd.values || []).map((v) =>
                     (v.effectiveFormat && v.effectiveFormat.numberFormat && v.effectiveFormat.numberFormat.type) || null));
     });
     return map;
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
            const values = await getValues("'" + MODULE_CONFIG_SHEET_NAME + "'");
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

  const mainValues = await getValues("'" + MAIN_SHEET_NAME + "'");
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
            await batchUpdateValues(updates);
            return { ok: false, error: 'wrong_password' };
     }

  await batchUpdateValues([
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
     const mainValues = await getValues("'" + MAIN_SHEET_NAME + "'");
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

  const mainValues = await getValues("'" + MAIN_SHEET_NAME + "'");
     const found = findUserRow(mainValues, email);
     if (!found) return { ok: false, error: 'account_not_found' };
     const r = found.values;
     const salt = String(r[COL.SALT - 1] || '');
     const hash = String(r[COL.HASH - 1] || '');
     if (hashPassword(oldPassword, salt) !== hash) return { ok: false, error: 'old_password_incorrect' };

  const newSalt = crypto.randomBytes(16).toString('hex');
     const newHash = hashPassword(newPassword, newSalt);
     const sheetName = "'" + MAIN_SHEET_NAME + "'!";
     await batchUpdateValues([
        { range: sheetName + colLetter(COL.SALT) + found.row, values: [[newSalt]] },
        { range: sheetName + colLetter(COL.HASH) + found.row, values: [[newHash]] }
          ]);
     return { ok: true };
}

// ====== XÁC THỰC LẠI PHIÊN SAU 24H BẰNG OTP — port từ Code.gs handleRequestSessionOtp/handleVerifySessionOtp ======
async function handleRequestSessionOtp(body) {
     const email = normEmail(body.email);
     if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };

  const mainValues = await getValues("'" + MAIN_SHEET_NAME + "'");
     const found = findUserRow(mainValues, email);
     // Không tiết lộ tài khoản có tồn tại/active hay không — trả về thông báo giống nhau dù thế nào.
  if (found && found.values[COL.ACTIVE - 1] === true) {
         const otp = String(Math.floor(100000 + Math.random() * 900000));
         const expiry = dateToSheetString(new Date(Date.now() + SESSION_OTP_TTL_MS));
         const sheetName = "'" + MAIN_SHEET_NAME + "'!";
         await batchUpdateValues([
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

  const mainValues = await getValues("'" + MAIN_SHEET_NAME + "'");
     const found = findUserRow(mainValues, email);
     if (!found) return { ok: false, error: 'otp_invalid' };
     const r = found.values;
     const savedOtp = String(r[COL.OTP - 1] || '');
     const otpExpirySerial = r[COL.OTPHETHAN - 1];
     const sheetName = "'" + MAIN_SHEET_NAME + "'!";

  if (!savedOtp) return { ok: false, error: 'otp_expired' };
     const expiryDate = (typeof otpExpirySerial === 'number' && otpExpirySerial > 0) ? serialToDate(otpExpirySerial) : null;
     if (!expiryDate || expiryDate.getTime() < Date.now()) {
            await batchUpdateValues([
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
            await batchUpdateValues(updates);
            return { ok: false, error: 'account_inactive' };
     }
     updates.push({ range: sheetName + colLetter(COL.DANGNHAPGANNHAT) + found.row, values: [[dateToSheetString(new Date())]] });
     await batchUpdateValues(updates);

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
     const mainValues = await getValues("'" + MAIN_SHEET_NAME + "'");
     const found = findUserRow(mainValues, email);
     if (!found || found.values[COL.ACTIVE - 1] !== true) return { ok: false, error: 'account_inactive' };

  const allTitles = await getSheetTitles();
     const existing = DATA_SHEET_NAMES.filter((n) => allTitles.indexOf(n) !== -1);
     const tables = {};
     DATA_SHEET_NAMES.forEach((n) => { if (existing.indexOf(n) === -1) tables[n] = { cols: [], rows: [] }; });

  if (existing.length) {
         const [valueRanges, fmtMap] = await Promise.all([
                  batchGetValues(existing),
                  getNumberFormats(existing)
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

module.exports = {
     SHEET_ID, MAIN_SHEET_NAME, COL,
     getAccessToken, getValues, batchGetValues, batchUpdateValues, getSheetTitles, getNumberFormats,
     normEmail, isValidGhnEmail, hashPassword, makeToken, verifyToken, findUserRow, getPermissions,
     computeModuleAccessForRole, handleLogin, handleValidateSession, handleGetReportData,
     handleChangePassword, handleRequestSessionOtp, handleVerifySessionOtp, sendGmailMessage
};
