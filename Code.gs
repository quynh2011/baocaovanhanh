/**
 * BACKEND XÁC THỰC + PROXY DỮ LIỆU CHO "Báo Cáo Vận Hành Tuần — GHN"
 * -------------------------------------------------------------------
 * File này dán vào Google Apps Script (Extensions > Apps Script) của CHÍNH
 * Google Sheet dữ liệu vận hành. Nó đóng vai trò 1 backend nhỏ, miễn phí:
 *   1) Đăng nhập bằng email @ghn.vn + mật khẩu (mật khẩu lưu dạng hash, không
 *      bao giờ lưu plaintext).
 *   2) Chỉ tài khoản có cột Active = TRUE trong sheet "Main" mới đăng nhập được.
 *   3) Quên mật khẩu: gửi mã OTP 6 số về đúng email @ghn.vn của nhân viên đó,
 *      xác nhận OTP xong thì mật khẩu mới tự cập nhật vào sheet "Main".
 *   4) Đổi mật khẩu khi đã đăng nhập.
 *   5) Proxy toàn bộ 13 sheet dữ liệu vận hành — CHỈ trả dữ liệu khi có
 *      session token hợp lệ. Vì vậy sheet dữ liệu gốc có thể (và nên) được
 *      chuyển về chế độ riêng tư (Restricted), không cần "Anyone with the
 *      link" nữa — người ngoài có link Sheet sẽ không xem được gì cả, bắt
 *      buộc phải đăng nhập qua web.
 *
 * CÁCH TRIỂN KHAI (làm 1 lần):
 *   1. Mở Google Sheet dữ liệu > Extensions > Apps Script.
 *   2. Xoá code mẫu, dán toàn bộ nội dung file này vào.
 *   3. Sửa hằng số ADMIN_EMAIL và ADMIN_NAME bên dưới thành tài khoản quản
 *      trị đầu tiên của bạn (phải là email @ghn.vn).
 *   4. Chọn hàm "setupMainSheet" ở thanh công cụ trên cùng > bấm Run (▶).
 *      Lần đầu Google sẽ hỏi cấp quyền — bấm Cho phép (Allow). Hàm này sẽ:
 *        - Tạo sheet "Main" với đúng cấu trúc cột.
 *        - Tạo 1 tài khoản admin đầu tiên với mật khẩu tạm ngẫu nhiên.
 *        - Gửi email chứa mật khẩu tạm về ADMIN_EMAIL (nhớ đổi mật khẩu
 *          ngay sau khi đăng nhập lần đầu).
 *   5. Deploy > New deployment > chọn loại "Web app":
 *        - Execute as: Me (tài khoản của bạn)
 *        - Who has access: Anyone
 *      Bấm Deploy, copy URL dạng .../macros/s/XXXXXXXX/exec — đây là
 *      APPS_SCRIPT_URL cần dán vào file báo cáo HTML.
 *   6. (Khuyến nghị) Vào Google Sheet > Share > đổi từ "Anyone with the
 *      link" về "Restricted" — vì giờ web đã đọc dữ liệu qua Apps Script
 *      (chạy với quyền của bạn) chứ không cần link public nữa.
 *   7. (Tuỳ chọn) Để bật nhận xét viết bằng AI (Gemini — có hạn mức MIỄN PHÍ, không cần thẻ tín dụng) cho CẢ
 *      2 mục Vận hành lẫn Kinh doanh: vào https://aistudio.google.com > "Get API key" > tạo key mới > copy.
 *      Sau đó trong Apps Script: biểu tượng bánh răng "Project Settings" (bên trái) > mục "Script Properties"
 *      > "Add script property" > Property = GEMINI_API_KEY, Value = key vừa copy > Save. KHÔNG dán key trực
 *      tiếp vào code (để lộ nếu chia sẻ file). Nếu chưa cấu hình bước này, cả 2 mục vẫn hoạt động bình thường
 *      với bản nhận xét cũ (rule-based), chỉ là chưa có bản AI viết văn tự nhiên/chuyên sâu hơn.
 */

// ====== CẤU HÌNH ======
const SHEET_ID = '1j3KarXqurcP0GxPE3A4qSxVXs2nfkUM87QscsY5_DtU';
const MAIN_SHEET_NAME = 'Main';
const ALLOWED_EMAIL_DOMAIN = 'ghn.vn';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;      // token đăng nhập sống 8 tiếng
const OTP_TTL_MS = 10 * 60 * 1000;              // mã OTP quên mật khẩu sống 10 phút
const MAX_FAILED_ATTEMPTS = 5;                  // sai quá 5 lần thì khoá tạm
const LOCKOUT_MS = 15 * 60 * 1000;              // khoá tạm 15 phút
const MIN_PASSWORD_LEN = 8;

// Chỉ dùng khi chạy setupMainSheet() lần đầu — sửa lại trước khi Run.
const ADMIN_EMAIL = 'ten-cua-ban@ghn.vn';
const ADMIN_NAME = 'Quản trị viên';

const DATA_SHEET_NAMES = ['01_Scorecard', '02_OPR', '03_ODR', '04_FD', '05_RotLC',
  '06_BL_LC_36H', '07_GTC', '08_BL_Giao_120H', '09_BL_LC_Tra_48H', '10_BL_Tra_120H',
  '11_KTC_ChoNhap', '12_KTC_NhapXuat', '13_KTC_Ton24H',
  '21_KD_HangNangNhe', '22_KD_HangNang', '23_KD_HangNhe', '24_KD_BanMoi', '24_KD_BanMoiAM'];

// Cột trong sheet "Main" (1-indexed)
const COL = { EMAIL: 1, HOTEN: 2, HASH: 3, SALT: 4, ACTIVE: 5, VAITRO: 6, NGAYTAO: 7,
  DANGNHAPGANNHAT: 8, SOLANSAI: 9, KHOADENLUC: 10, OTP: 11, OTPHETHAN: 12, GHICHU: 13 };
const MAIN_HEADERS = ['Email', 'Họ và tên', 'PasswordHash', 'Salt', 'Active', 'VaiTro',
  'NgayTao', 'DangNhapGanNhat', 'SoLanSaiLienTiep', 'KhoaDenLuc', 'OTP', 'OTPHetHan', 'GhiChu'];

// ====== ĐIỂM VÀO WEB APP ======
function doGet(e) {
  return ContentService.createTextOutput('GHN Report Backend OK').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return jsonOut({ ok: false, error: 'bad_request' }); }
  var action = body.action;
  try {
    if (action === 'login') return jsonOut(handleLogin(body));
    if (action === 'requestPasswordReset') return jsonOut(handleRequestReset(body));
    if (action === 'resetPassword') return jsonOut(handleResetPassword(body));
    if (action === 'changePassword') return jsonOut(handleChangePassword(body));
    if (action === 'getReportData') return jsonOut(handleGetReportData(body));
    if (action === 'validateSession') return jsonOut(handleValidateSession(body));
    if (action === 'heartbeat') return jsonOut(handleHeartbeat(body));
    if (action === 'getOnlineUsers') return jsonOut(handleGetOnlineUsers(body));
    if (action === 'getKDAnalysis') return jsonOut(handleGetKDAnalysis(body));
    if (action === 'getOpsAnalysis') return jsonOut(handleGetOpsAnalysis(body));
    return jsonOut({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonOut({ ok: false, error: 'server_error', detail: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ====== ĐĂNG NHẬP ======
function handleLogin(body) {
  var email = normEmail(body.email);
  var password = String(body.password || '');
  if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found) return { ok: false, error: 'account_not_found' };
  var r = found.values;

  var lockedUntil = r[COL.KHOADENLUC - 1];
  if (lockedUntil && Object.prototype.toString.call(lockedUntil) === '[object Date]' && lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: 'account_locked', lockedUntil: lockedUntil.getTime() };
  }
  var active = r[COL.ACTIVE - 1] === true;
  if (!active) return { ok: false, error: 'account_inactive' };

  var salt = String(r[COL.SALT - 1] || '');
  var hash = String(r[COL.HASH - 1] || '');
  var ok = hashPassword(password, salt) === hash;

  if (!ok) {
    var fails = Number(r[COL.SOLANSAI - 1] || 0) + 1;
    sh.getRange(found.row, COL.SOLANSAI).setValue(fails);
    if (fails >= MAX_FAILED_ATTEMPTS) {
      sh.getRange(found.row, COL.KHOADENLUC).setValue(new Date(Date.now() + LOCKOUT_MS));
    }
    return { ok: false, error: 'wrong_password' };
  }

  sh.getRange(found.row, COL.SOLANSAI).setValue(0);
  sh.getRange(found.row, COL.KHOADENLUC).setValue('');
  sh.getRange(found.row, COL.DANGNHAPGANNHAT).setValue(new Date());

  var token = makeToken(email);
  return { ok: true, token: token, email: email, name: String(r[COL.HOTEN - 1] || ''), role: String(r[COL.VAITRO - 1] || '') };
}

function handleValidateSession(body) {
  var email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { ok: false, error: 'account_inactive' };
  return { ok: true, email: email, name: String(found.values[COL.HOTEN - 1] || ''), role: String(found.values[COL.VAITRO - 1] || '') };
}

// ====== QUÊN MẬT KHẨU (GỬI OTP QUA EMAIL) ======
function handleRequestReset(body) {
  var email = normEmail(body.email);
  if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  // Không tiết lộ tài khoản có tồn tại hay không — luôn trả về thông báo giống nhau.
  if (found && found.values[COL.ACTIVE - 1] === true) {
    var otp = String(Math.floor(100000 + Math.random() * 900000));
    sh.getRange(found.row, COL.OTP).setValue(otp);
    sh.getRange(found.row, COL.OTPHETHAN).setValue(new Date(Date.now() + OTP_TTL_MS));
    var name = String(found.values[COL.HOTEN - 1] || '');
    MailApp.sendEmail({
      to: email,
      subject: 'Mã xác nhận đổi mật khẩu — Báo Cáo Vận Hành GHN',
      body: 'Chào ' + name + ',\n\n' +
        'Mã xác nhận để đặt lại mật khẩu của bạn là: ' + otp + '\n' +
        'Mã có hiệu lực trong 10 phút. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.\n\n' +
        '— Báo Cáo Vận Hành Tuần GHN'
    });
  }
  return { ok: true, message: 'Nếu email tồn tại và đang hoạt động, mã xác nhận đã được gửi.' };
}

function handleResetPassword(body) {
  var email = normEmail(body.email);
  var otp = String(body.otp || '');
  var newPassword = String(body.newPassword || '');
  if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };
  if (newPassword.length < MIN_PASSWORD_LEN) return { ok: false, error: 'password_too_short' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found) return { ok: false, error: 'account_not_found' };
  var r = found.values;
  var savedOtp = String(r[COL.OTP - 1] || '');
  var otpExpiry = r[COL.OTPHETHAN - 1];
  if (!savedOtp || savedOtp !== otp) return { ok: false, error: 'otp_invalid' };
  if (!otpExpiry || Object.prototype.toString.call(otpExpiry) !== '[object Date]' || otpExpiry.getTime() < Date.now()) {
    return { ok: false, error: 'otp_expired' };
  }
  var salt = Utilities.getUuid();
  var hash = hashPassword(newPassword, salt);
  sh.getRange(found.row, COL.SALT).setValue(salt);
  sh.getRange(found.row, COL.HASH).setValue(hash);
  sh.getRange(found.row, COL.OTP).setValue('');
  sh.getRange(found.row, COL.OTPHETHAN).setValue('');
  sh.getRange(found.row, COL.SOLANSAI).setValue(0);
  sh.getRange(found.row, COL.KHOADENLUC).setValue('');
  return { ok: true };
}

// ====== ĐỔI MẬT KHẨU (KHI ĐÃ ĐĂNG NHẬP) ======
function handleChangePassword(body) {
  var email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var oldPassword = String(body.oldPassword || '');
  var newPassword = String(body.newPassword || '');
  if (newPassword.length < MIN_PASSWORD_LEN) return { ok: false, error: 'password_too_short' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found) return { ok: false, error: 'account_not_found' };
  var r = found.values;
  var salt = String(r[COL.SALT - 1] || '');
  var hash = String(r[COL.HASH - 1] || '');
  if (hashPassword(oldPassword, salt) !== hash) return { ok: false, error: 'old_password_incorrect' };
  var newSalt = Utilities.getUuid();
  var newHash = hashPassword(newPassword, newSalt);
  sh.getRange(found.row, COL.SALT).setValue(newSalt);
  sh.getRange(found.row, COL.HASH).setValue(newHash);
  return { ok: true };
}

// ====== PROXY DỮ LIỆU VẬN HÀNH (CHỈ KHI ĐÃ ĐĂNG NHẬP) ======
function handleGetReportData(body) {
  var email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { ok: false, error: 'account_inactive' };

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var tables = {};
  DATA_SHEET_NAMES.forEach(function (name) {
    var s = ss.getSheetByName(name);
    tables[name] = s ? sheetToTableShape(s) : { cols: [], rows: [] };
  });
  return { ok: true, tables: tables };
}

// ====== "AI ĐANG ONLINE" (giống kiểu Google Data Studio) ======
// Dùng CacheService thay vì ghi vào Sheet: rẻ, nhanh, tự hết hạn (TTL), không lo tranh chấp ghi đồng thời
// giữa nhiều người dùng cùng lúc như khi ghi trực tiếp vào 1 dòng Sheet dùng chung.
var ONLINE_TTL_SEC = 90; // không có heartbeat mới trong 90s thì coi như đã rời trang

function handleHeartbeat(body) {
  var email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { ok: false, error: 'account_inactive' };
  var name = String(found.values[COL.HOTEN - 1] || email);
  var cache = CacheService.getScriptCache();
  cache.put('online_' + email, JSON.stringify({ email: email, name: name, ts: Date.now() }), ONLINE_TTL_SEC);
  return { ok: true };
}

function handleGetOnlineUsers(body) {
  var email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var sh = getMainSheet();
  var data = sh.getDataRange().getValues();
  var keys = [];
  for (var i = 1; i < data.length; i++) {
    var e = data[i][COL.EMAIL - 1];
    if (e) keys.push('online_' + String(e).trim().toLowerCase());
  }
  var cache = CacheService.getScriptCache();
  var raw = keys.length ? cache.getAll(keys) : {};
  var users = [];
  Object.keys(raw).forEach(function (k) {
    try { users.push(JSON.parse(raw[k])); } catch (err) { /* bỏ qua entry hỏng */ }
  });
  users.sort(function (a, b) { return b.ts - a.ts; });
  return { ok: true, users: users };
}

// ====== NHẬN XÉT KINH DOANH BẰNG AI (Gemini API — bản miễn phí) ======
// Nguyên tắc quan trọng: AI KHÔNG được tự tính số liệu — toàn bộ số (tổng, %YoY, dự kiến hết kỳ...) đã được
// frontend tính sẵn bằng công thức cũ (đã test kỹ), gửi qua đây dưới dạng JSON. AI chỉ có nhiệm vụ VIẾT VĂN
// từ những số liệu đã chốt sẵn — nhờ vậy không lo AI "bịa" hay tính sai số, chỉ là văn phong tự nhiên/đa dạng
// hơn thay vì template if/else lặp đi lặp lại. Nếu chưa cấu hình API key, hoặc gọi lỗi/hết hạn mức miễn phí,
// trả về ok:false — frontend sẽ tự động giữ nguyên bản nhận xét rule-based cũ, không làm hỏng trải nghiệm.
var GEMINI_MODEL = 'gemini-2.5-flash';
var GEMINI_CACHE_TTL_SEC = 3600; // cache 1 tiếng theo hash số liệu — nhiều người xem cùng số liệu trong ngày
                                   // sẽ không tốn thêm lượt gọi, tiết kiệm hạn mức free tier (10 RPM/250 RPD).

function handleGetKDAnalysis(body) {
  var email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok: false, error: 'ai_not_configured' };
  var blocks = body.blocks;
  if (!blocks || !blocks.length) return { ok: false, error: 'no_data' };

  var cache = CacheService.getScriptCache();
  var cacheKey = 'kdai_' + md5Hex(JSON.stringify(blocks));
  var cached = cache.get(cacheKey);
  if (cached) return { ok: true, analysis: JSON.parse(cached), cached: true };

  var prompt = buildKDAIPrompt(blocks);
  var resp;
  try {
    resp = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey,
      {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75, responseMimeType: 'application/json' }
        })
      }
    );
  } catch (err) {
    return { ok: false, error: 'ai_network_error', detail: String(err) };
  }
  var code = resp.getResponseCode();
  if (code === 429) return { ok: false, error: 'ai_rate_limited' }; // hết hạn mức free tier trong ngày/phút
  if (code !== 200) return { ok: false, error: 'ai_http_' + code, detail: resp.getContentText().slice(0, 300) };

  var data;
  try { data = JSON.parse(resp.getContentText()); } catch (err) { return { ok: false, error: 'ai_bad_json' }; }
  var text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) return { ok: false, error: 'ai_empty_response' };

  var cleaned = String(text).replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  var analysis;
  try { analysis = JSON.parse(cleaned); } catch (err) { return { ok: false, error: 'ai_parse_error' }; }

  cache.put(cacheKey, JSON.stringify(analysis), GEMINI_CACHE_TTL_SEC);
  return { ok: true, analysis: analysis };
}

function buildKDAIPrompt(blocks) {
  return 'Bạn là chuyên gia phân tích dữ liệu vận hành logistics cấp cao. Dưới đây là số liệu ĐÃ ĐƯỢC TÍNH SẴN ' +
    '(tổng, %so với cùng kỳ 2025, xu hướng, dự kiến hết kỳ...) cho ' + blocks.length + ' nhóm hàng — mỗi nhóm có ' +
    'Sản lượng (volume) và Doanh thu (revenue), theo Tuần và theo Tháng:\n\n' + JSON.stringify(blocks) + '\n\n' +
    'QUAN TRỌNG: các số liệu trên đã được tính đúng sẵn — TUYỆT ĐỐI không tự tính lại hay suy ra số khác, chỉ ' +
    'được dùng đúng các số đã cho. Với MỖI nhóm hàng (theo đúng trường "key"), hãy viết bằng tiếng Việt, văn ' +
    'phong chuyên nghiệp của 1 nhà phân tích dữ liệu thực thụ — có chiều sâu, có góc nhìn, KHÔNG lặp khuôn mẫu ' +
    'câu chữ giữa các nhóm hàng khác nhau, có thể chỉ ra mối liên hệ hợp lý giữa Sản lượng và Doanh thu (ví dụ ' +
    'sản lượng giảm ít hơn doanh thu nghĩa là gì), nêu rủi ro/điểm cần lưu ý nếu số liệu cho thấy vậy, nhưng ' +
    'KHÔNG bịa thêm số liệu hay sự kiện ngoài dữ liệu đã cho.\n\n' +
    'Trả về DUY NHẤT 1 JSON array (không markdown, không giải thích thêm), mỗi phần tử có đúng cấu trúc:\n' +
    '{"key": "<đúng bằng key đầu vào>", ' +
    '"overview_vol": ["2-4 câu nhận xét tổng quan Sản lượng (gộp tuần+tháng)"], ' +
    '"overview_rev": ["2-4 câu nhận xét tổng quan Doanh thu (gộp tuần+tháng)"], ' +
    '"weekly_vol": "1 đoạn văn phân tích chi tiết Sản lượng theo Tuần", ' +
    '"weekly_rev": "1 đoạn văn phân tích chi tiết Doanh thu theo Tuần", ' +
    '"monthly_vol": "1 đoạn văn phân tích chi tiết Sản lượng theo Tháng", ' +
    '"monthly_rev": "1 đoạn văn phân tích chi tiết Doanh thu theo Tháng"}';
}

function md5Hex(s) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s);
  return raw.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

// ====== NHẬN XÉT VẬN HÀNH BẰNG AI (Gemini API — cùng cơ chế với getKDAnalysis) ======
// Gộp TOÀN BỘ tổng quan (điểm sáng/cần cải thiện) + chi tiết từng nhóm trong 13 bảng chỉ số vào 1 LỆNH GỌI
// DUY NHẤT (không gọi riêng từng bảng) để không vượt hạn mức free tier (10 lượt/phút, 250 lượt/ngày) — trang
// Vận hành chỉ tải 1 lần/phiên nên tổng cộng mỗi người dùng chỉ tốn tối đa 1-2 lượt gọi (Vận hành + Kinh doanh).
function handleGetOpsAnalysis(body) {
  var email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok: false, error: 'ai_not_configured' };
  var overview = body.overview || { highlights: [], lowlights: [] };
  var groups = body.groups || [];
  var hasOverview = (overview.highlights && overview.highlights.length) || (overview.lowlights && overview.lowlights.length);
  if (!hasOverview && !groups.length) return { ok: false, error: 'no_data' };

  var cache = CacheService.getScriptCache();
  var cacheKey = 'opsai_' + md5Hex(JSON.stringify({ overview: overview, groups: groups }));
  var cached = cache.get(cacheKey);
  if (cached) return { ok: true, analysis: JSON.parse(cached), cached: true };

  var prompt = buildOpsAIPrompt(overview, groups);
  var resp;
  try {
    resp = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey,
      {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75, responseMimeType: 'application/json' }
        })
      }
    );
  } catch (err) {
    return { ok: false, error: 'ai_network_error', detail: String(err) };
  }
  var code = resp.getResponseCode();
  if (code === 429) return { ok: false, error: 'ai_rate_limited' };
  if (code !== 200) return { ok: false, error: 'ai_http_' + code, detail: resp.getContentText().slice(0, 300) };

  var data;
  try { data = JSON.parse(resp.getContentText()); } catch (err) { return { ok: false, error: 'ai_bad_json' }; }
  var text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) return { ok: false, error: 'ai_empty_response' };

  var cleaned = String(text).replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  var analysis;
  try { analysis = JSON.parse(cleaned); } catch (err) { return { ok: false, error: 'ai_parse_error' }; }

  cache.put(cacheKey, JSON.stringify(analysis), GEMINI_CACHE_TTL_SEC);
  return { ok: true, analysis: analysis };
}

function buildOpsAIPrompt(overview, groups) {
  return 'Bạn là chuyên gia phân tích vận hành logistics cấp cao. Dưới đây là số liệu ĐÃ ĐƯỢC TÍNH SẴN (không được tự ' +
    'tính lại) cho báo cáo vận hành tuần, gồm 2 phần:\n\n' +
    '1) TỔNG QUAN — các điểm sáng (đang cải thiện/đạt target tốt) và điểm cần cải thiện (đang xấu đi/chưa đạt target) ' +
    'của từng chỉ số:\n' + JSON.stringify(overview) + '\n\n' +
    '2) CHI TIẾT TỪNG NHÓM trong từng bảng chỉ số (VD từng Vùng/AM/Khách hàng):\n' + JSON.stringify(groups) + '\n\n' +
    'QUAN TRỌNG: các số liệu trên đã tính đúng sẵn — TUYỆT ĐỐI không tự tính lại hay suy ra số liệu khác ngoài các số ' +
    'đã cho. Với MỖI phần tử trong "highlights" và "lowlights" của TỔNG QUAN (dùng đúng "id"), hãy viết LẠI thành 1 câu ' +
    'tiếng Việt tự nhiên, chuyên nghiệp, không lặp khuôn mẫu câu chữ giữa các mục, dựa đúng vào tên chỉ số/giá trị ' +
    'trước-sau/target/xu hướng/đối tượng kém nhất đã cho. Với MỖI phần tử trong CHI TIẾT TỪNG NHÓM (dùng đúng "id"), ' +
    'hãy viết 1-2 câu phân tích chuyên sâu, có góc nhìn quản lý vận hành, nêu rõ ai/nhóm nào đang kéo chỉ số xuống và ' +
    'mức độ nghiêm trọng, xu hướng theo thời gian, gợi ý ngắn gọn cần chú ý gì (nếu số liệu cho thấy vậy) — nhưng KHÔNG ' +
    'bịa thêm số liệu hay nguyên nhân ngoài dữ liệu đã cho.\n\n' +
    'Trả về DUY NHẤT 1 JSON object (không markdown, không giải thích thêm), đúng cấu trúc:\n' +
    '{"overview": {"<id của từng phần tử trong highlights/lowlights>": "<câu văn tương ứng>"}, ' +
    '"groups": {"<id của từng phần tử trong CHI TIẾT TỪNG NHÓM>": "<đoạn phân tích tương ứng>"}}';
}

function sheetToTableShape(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return { cols: [], rows: [] };
  var header = values[0];
  var cols = header.map(function (h) { return { label: (h === null || h === undefined) ? '' : String(h) }; });
  var rows = values.slice(1).map(function (row) {
    return {
      c: row.map(function (v) {
        if (v === '' || v === null || v === undefined) return null;
        if (Object.prototype.toString.call(v) === '[object Date]') return { v: v.toISOString() };
        return { v: v };
      })
    };
  });
  return { cols: cols, rows: rows };
}

// ====== TIỆN ÍCH ======
function getMainSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!sh) throw new Error('Chưa có sheet "Main" — chạy setupMainSheet() trước.');
  return sh;
}

function findUserRow(sh, email) {
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (normEmail(values[i][COL.EMAIL - 1]) === email) return { row: i + 1, values: values[i] };
  }
  return null;
}

function normEmail(s) { return String(s || '').trim().toLowerCase(); }

function isValidGhnEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.endsWith('@' + ALLOWED_EMAIL_DOMAIN);
}

function hashPassword(password, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + ':' + salt);
  return raw.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function getSessionSecret() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('SESSION_SECRET');
  if (!secret) { secret = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SESSION_SECRET', secret); }
  return secret;
}

function base64url(str) {
  return Utilities.base64EncodeWebSafe(str, Utilities.Charset.UTF_8).replace(/=+$/, '');
}
function base64urlDecode(str) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(str)).getDataAsString();
}

function makeToken(email) {
  var payload = JSON.stringify({ email: email, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS });
  var payloadB64 = base64url(payload);
  var sig = Utilities.computeHmacSha256Signature(payloadB64, getSessionSecret());
  var sigB64 = Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
  return payloadB64 + '.' + sigB64;
}

function verifyToken(token) {
  if (!token || token.indexOf('.') === -1) return null;
  var parts = String(token).split('.');
  var payloadB64 = parts[0], sigB64 = parts[1];
  var expectedSig = Utilities.computeHmacSha256Signature(payloadB64, getSessionSecret());
  var expectedSigB64 = Utilities.base64EncodeWebSafe(expectedSig).replace(/=+$/, '');
  if (sigB64 !== expectedSigB64) return null;
  try {
    var payload = JSON.parse(base64urlDecode(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload.email;
  } catch (e) { return null; }
}

// ====== CHẠY 1 LẦN DUY NHẤT ĐỂ KHỞI TẠO ======
function setupMainSheet() {
  if (!isValidGhnEmail(normEmail(ADMIN_EMAIL))) {
    throw new Error('Sửa hằng số ADMIN_EMAIL ở đầu file thành 1 email @ghn.vn hợp lệ trước khi chạy.');
  }
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(MAIN_SHEET_NAME);
  sh.clear();
  sh.getRange(1, 1, 1, MAIN_HEADERS.length).setValues([MAIN_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);

  var email = normEmail(ADMIN_EMAIL);
  var tempPassword = Utilities.getUuid().split('-')[0] + 'Aa1!';
  var salt = Utilities.getUuid();
  var hash = hashPassword(tempPassword, salt);
  var row = [email, ADMIN_NAME, hash, salt, true, 'Admin', new Date(), '', 0, '', '', '', 'Tài khoản khởi tạo tự động'];
  sh.getRange(2, 1, 1, row.length).setValues([row]);

  // Cột Active hiển thị dạng checkbox cho dễ tick/bỏ tick quyền truy cập.
  sh.getRange(2, COL.ACTIVE, 200, 1).insertCheckboxes();
  sh.autoResizeColumns(1, MAIN_HEADERS.length);

  MailApp.sendEmail({
    to: email,
    subject: 'Tài khoản quản trị — Báo Cáo Vận Hành GHN',
    body: 'Chào ' + ADMIN_NAME + ',\n\n' +
      'Tài khoản đăng nhập Báo Cáo Vận Hành Tuần đã được tạo:\n' +
      'Email: ' + email + '\n' +
      'Mật khẩu tạm: ' + tempPassword + '\n\n' +
      'Vui lòng đăng nhập và đổi mật khẩu ngay. Để thêm nhân viên khác, mở sheet "Main", ' +
      'thêm 1 dòng mới (email phải @ghn.vn), tick Active = TRUE, để trống các cột PasswordHash/Salt ' +
      '— nhân viên đó dùng "Quên mật khẩu" ở màn đăng nhập để tự đặt mật khẩu lần đầu.'
  });
  Logger.log('Đã tạo sheet Main + tài khoản admin: ' + email + ' / mật khẩu tạm: ' + tempPassword);
}
