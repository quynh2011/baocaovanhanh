/* ============================================================================================
   PROXY BACKEND — Vercel Serverless Function
   Đường đi:  trình duyệt  ->  https://baocaovanhanh.vercel.app/api/gas  ->  (hybrid, xem dưới)
   ============================================================================================
   LỊCH SỬ (đọc để hiểu vì sao file này có 2 đường xử lý song song):

   Bản đầu tiên proxy 100% sang Apps Script /exec. Khi Apps Script chuyển sang chạy dưới tài khoản
   Workspace công ty (@ghn.vn), deployment chỉ cho 2 lựa chọn "Ai có quyền truy cập": "Chỉ mình tôi"
   hoặc "Bất kỳ ai trong GHN" — không còn "Bất kỳ ai" (public). "Anyone within GHN" kiểm tra danh
   tính kiểu PHIÊN ĐĂNG NHẬP GOOGLE THẬT trong trình duyệt, KHÔNG chấp nhận access_token/id_token
   OAuth gọi server-to-server (đã test thật, luôn trả 401/redirect login) — nên proxy gọi thẳng
   Apps Script kiểu cũ bị bế tắc hoàn toàn, không có cách nào vượt qua từ phía server.

   HƯỚNG MỚI (đang dùng cho các action quan trọng nhất — đăng nhập, xem báo cáo, đổi mật khẩu,
   xác thực lại phiên bằng OTP):
   Bỏ qua Apps Script hoàn toàn, gọi THẲNG Google Sheets REST API bằng chính tài khoản
   quynhpv1@ghn.vn (chủ sở hữu/người chỉnh sửa Sheet dữ liệu — KHÔNG cần chia sẻ thêm cho ai).
   Toàn bộ logic xác thực/đọc dữ liệu được viết lại bằng Node (xem api/_sheetsClient.js), port
   1:1 từ các hàm tương ứng trong Code.gs (handleLogin, handleValidateSession, handleGetReportData,
   handleChangePassword, handleRequestSessionOtp, handleVerifySessionOtp…).

   Email OTP (xác thực lại phiên sau 24h) được gửi bằng Gmail API (không phải MailApp — không chạy
   được ngoài Apps Script), dùng chính access token của quynhpv1@ghn.vn — refresh token đã được cấp
   thêm scope gmail.send ngày 2026-08-13 (trước đó chỉ có scope spreadsheets, đây là lý do OTP xác
   thực lại phiên không gửi được mail dù logic đã đúng). OTP được lưu tạm trong 2 cột OTP/OTPHetHan
   của sheet "Main" (không dùng CacheService vì serverless không có bộ nhớ dùng chung đáng tin cậy
   giữa các lần gọi).

   NGÀY 2026-08-13 (đợt 2): port thêm toàn bộ "Cấu hình" (Tài khoản + Hạng mục & Phân quyền), "Kế hoạch
   kinh doanh" (Kehoach/Ketqua/Tiendo, đọc từ spreadsheet KEHOACH_SHEET_ID riêng, ảnh checkin/sản phẩm
   upload qua Drive API), "Báo Cáo Kết Quả Kinh Doanh" (BCKQKD_*, kể cả tổng hợp bằng Gemini AI nếu có
   biến môi trường GEMINI_API_KEY) và "Kế hoạch Event" (EVENT_*) — toàn bộ các mục Admin từng báo lỗi
   "Apps Script trả về nội dung không phải JSON" nay gọi thẳng Sheets API giống hệt cách login/OTP đã làm.

   NGÀY 2026-08-13 (đợt 3): port thêm "đang online" (heartbeat/getOnlineUsers) — avatar bar hiển thị
   người đang xem báo cáo. Bản gốc dùng CacheService (Apps Script), ở đây lưu tạm vào 1 sheet riêng
   "OnlineUsers" (giống cách OTP đã làm), xem chi tiết trong api/_sheetsClient.js.

   Các action CÒN CHƯA port (quên mật khẩu qua OTP, "Lịch làm việc" — công việc/lịch họp) vẫn rơi
   xuống nhánh cũ gọi Apps Script — nhánh đó vẫn đang hỏng vì lý do ở trên, nhưng KHÔNG regressed gì
   thêm so với hiện trạng (những action này vốn đã không chạy được từ trước khi có thay đổi này).

   Ba nguyên tắc bắt buộc giữ (không đổi so với bản đầu):
   1) Không nhận URL/thông tin đích do client gửi lên.
   2) Luôn trả JSON, kể cả khi hỏng.
   3) Không đụng gì tới Code.gs / Apps Script.
   ============================================================================================ */

const sheetsClient = require('./_sheetsClient.js');

// Các action đã port sang gọi thẳng Sheets API — xử lý tại đây, KHÔNG rơi xuống Apps Script.
const LOCAL_ACTIONS = {
  login: sheetsClient.handleLogin,
  validateSession: sheetsClient.handleValidateSession,
  getReportData: sheetsClient.handleGetReportData,
  changePassword: sheetsClient.handleChangePassword,
  requestSessionOtp: sheetsClient.handleRequestSessionOtp,
  verifySessionOtp: sheetsClient.handleVerifySessionOtp,
  // "Cấu hình" > "Hạng mục & Phân quyền"
  getModuleConfig: sheetsClient.handleGetModuleConfig,
  updateModuleConfig: sheetsClient.handleUpdateModuleConfig,
  // "Cấu hình" > "Tài khoản"
  getUserList: sheetsClient.handleGetUserList,
  updateUserPermissions: sheetsClient.handleUpdateUserPermissions,
  addUser: sheetsClient.handleAddUser,
  updateUser: sheetsClient.handleUpdateUser,
  deleteUser: sheetsClient.handleDeleteUser,
  adminResetPassword: sheetsClient.handleAdminResetPassword,
  // Kế hoạch kinh doanh
  getKeHoachData: sheetsClient.handleGetKeHoachData,
  addKeHoach: sheetsClient.handleAddKeHoach,
  updateKeHoach: sheetsClient.handleUpdateKeHoach,
  addKetQua: sheetsClient.handleAddKetQua,
  addTienDo: sheetsClient.handleAddTienDo,
  // Báo Cáo Kết Quả Kinh Doanh (BCKQKD)
  getBCKQKDData: sheetsClient.handleGetBCKQKDData,
  saveBCKQKDSchema: sheetsClient.handleSaveBCKQKDSchema,
  saveBCKQKDPeriod: sheetsClient.handleSaveBCKQKDPeriod,
  deleteBCKQKDPeriod: sheetsClient.handleDeleteBCKQKDPeriod,
  saveBCKQKDSubmission: sheetsClient.handleSaveBCKQKDSubmission,
  getBCKQKDSubmissionsForPeriod: sheetsClient.handleGetBCKQKDSubmissionsForPeriod,
  generateBCKQKDAggregate: sheetsClient.handleGenerateBCKQKDAggregate,
  getBCKQKDAggregate: sheetsClient.handleGetBCKQKDAggregate,
  updateBCKQKDAggregate: sheetsClient.handleUpdateBCKQKDAggregate,
  // Kế hoạch Event
  getEventData: sheetsClient.handleGetEventData,
  saveEventSchema: sheetsClient.handleSaveEventSchema,
  saveEventPeriod: sheetsClient.handleSaveEventPeriod,
  deleteEventPeriod: sheetsClient.handleDeleteEventPeriod,
  saveEventSubmission: sheetsClient.handleSaveEventSubmission,
  getEventSubmissions: sheetsClient.handleGetEventSubmissions,
  // "Đang online" (avatar bar người đang xem báo cáo)
  heartbeat: sheetsClient.handleHeartbeat,
  getOnlineUsers: sheetsClient.handleGetOnlineUsers,
     getLapDayData: sheetsClient.handleGetLapDayData
};

// ================= NHÁNH CŨ: proxy sang Apps Script (giữ nguyên, dùng cho action chưa port) =================
const GAS_URL = process.env.GAS_URL ||
  'https://script.google.com/a/macros/ghn.vn/s/AKfycbwCvB4V_7kstxSnM9rPB8AkBePFA4biqcYnPA8T2cOqs4R_snmhe57kD_SRF1HAvTM/exec';

const TIMEOUT_MS = 55000;

async function layAccessTokenChoAppsScript() {
  const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) return { token: null, loi: 'chua_cau_hinh' };
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token'
      })
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) return { token: null, loi: 'doi_token_that_bai_' + r.status + '_' + (data && data.error || '?') };
    if (!data || (!data.access_token && !data.id_token)) return { token: null, loi: 'khong_co_token_trong_phan_hoi' };
    return { token: data.id_token || data.access_token, loaiToken: data.id_token ? 'id_token' : 'access_token', loi: null, scope: data.scope || null };
  } catch (e) {
    return { token: null, loi: 'ngoai_le_' + String(e && e.message) };
  }
}

async function forwardToAppsScript(rawBody) {
  const ac = new AbortController();
  const hetGio = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const oauthKq = await layAccessTokenChoAppsScript();
    const accessToken = oauthKq.token;
    const headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;

    const r = await fetch(GAS_URL, { method: 'POST', headers: headers, body: rawBody, redirect: 'follow', signal: ac.signal });
    const text = await r.text();
    let duLieu;
    try {
      duLieu = JSON.parse(text);
    } catch (e) {
      return {
        status: 502,
        json: {
          ok: false, error: 'apps_script_khong_tra_json',
          thongDiep: 'Apps Script trả về nội dung không phải JSON. Action này chưa được chuyển sang gọi thẳng Sheets API nên vẫn phụ thuộc Apps Script (đang bị GHN chặn ở tầng "Anyone within GHN"). Đây KHÔNG phải lỗi của phần đăng nhập/xem báo cáo.',
          httpStatus: r.status, trichDan: text.slice(0, 1500), coBearer: !!accessToken,
          doDaiToken: accessToken ? accessToken.length : 0, loaiToken: oauthKq.loaiToken || null,
          oauthLoi: oauthKq.loi, oauthScope: oauthKq.scope || null, ms: Date.now() - t0
        }
      };
    }
    return { status: r.status, json: duLieu };
  } catch (e) {
    const boHuy = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return {
      status: boHuy ? 504 : 502,
      json: {
        ok: false, error: boHuy ? 'apps_script_qua_han' : 'khong_goi_duoc_apps_script',
        thongDiep: boHuy ? 'Apps Script không phản hồi trong ' + (TIMEOUT_MS / 1000) + ' giây.'
          : 'Máy chủ trung gian không gọi được Apps Script: ' + String(e && e.message),
        ms: Date.now() - t0
      }
    };
  } finally {
    clearTimeout(hetGio);
  }
}

/* Lấy body thô/parse JSON — Vercel tự parse sẵn theo Content-Type nhưng không phải lúc nào cũng có. */
function docBodyRaw(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (req.body && typeof req.body === 'object') return Promise.resolve(JSON.stringify(req.body));
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; });
    req.on('end', () => resolve(s));
    req.on('error', () => resolve(''));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const coCauHinhOAuth = !!(process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
    res.status(200).json({
      ok: true,
      proxy: 'GHN report backend proxy (hybrid: Sheets API truc tiep cho login/OTP/doi mat khau/bao cao van hanh/Cau hinh/Ke hoach KD/BCKQKD/Ke hoach Event/dang online, Apps Script cho phan con lai: quen mat khau, Lich lam viec)',
      oauth: coCauHinhOAuth ? 'da cau hinh' : 'chua cau hinh',
      sessionSecret: !!process.env.SESSION_SECRET ? 'da cau hinh' : 'chua cau hinh',
      thoiGian: new Date().toISOString()
    });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  let rawBody;
  try {
    rawBody = await docBodyRaw(req);
  } catch (e) {
    res.status(400).json({ ok: false, error: 'khong_doc_duoc_body', chiTiet: String(e && e.message) });
    return;
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    res.status(200).json({ ok: false, error: 'bad_request' });
    return;
  }

  const action = body && body.action;
  const localHandler = action && LOCAL_ACTIONS[action];

  if (localHandler) {
    try {
      const ketQua = await localHandler(body);
      res.status(200).json(ketQua);
    } catch (e) {
      res.status(200).json({ ok: false, error: 'server_error', detail: String(e && e.message || e) });
    }
    return;
  }

  // Action chưa port -> giữ hành vi cũ (proxy sang Apps Script, hiện vẫn đang hỏng, không regressed).
  const ketQua = await forwardToAppsScript(rawBody);
  res.status(ketQua.status).json(ketQua.json);
};
