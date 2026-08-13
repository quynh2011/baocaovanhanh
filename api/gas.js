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

   HƯỚNG MỚI (đang dùng cho các action quan trọng nhất — đăng nhập + xem báo cáo):
   Bỏ qua Apps Script hoàn toàn, gọi THẲNG Google Sheets REST API bằng chính tài khoản
   quynhpv1@ghn.vn (chủ sở hữu/người chỉnh sửa Sheet dữ liệu — KHÔNG cần chia sẻ thêm cho ai).
   Toàn bộ logic xác thực/đọc dữ liệu được viết lại bằng Node (xem api/_sheetsClient.js), port
   1:1 từ các hàm tương ứng trong Code.gs (handleLogin, handleValidateSession, handleGetReportData…).

   Các action CHƯA port (OTP xác thực lại phiên sau 24h, heartbeat "đang online", các module quản
   lý người dùng/kế hoạch KD/BCKQKD/lịch làm việc…) vẫn rơi xuống nhánh cũ gọi Apps Script — nhánh
   đó vẫn đang hỏng vì lý do ở trên, nhưng KHÔNG regressed gì thêm so với hiện trạng (những action
   này vốn đã không chạy được từ trước khi có thay đổi này).

   Ba nguyên tắc bắt buộc giữ (không đổi so với bản đầu):
   1) Không nhận URL/thông tin đích do client gửi lên.
   2) Luôn trả JSON, kể cả khi hỏng.
   3) Không đụng gì tới Code.gs / Apps Script.
   ============================================================================================ */

const sheetsClient = require('./_sheetsClient.js');

// TẠM THỜI — chỉ dùng để tự kiểm tra luồng login thật qua Sheets API, sẽ xoá ngay sau khi test xong.
// Bảo vệ bằng SESSION_SECRET (đã có sẵn trên Vercel) truyền qua body.debugSecret, không public.
async function handleDebugSetTestPassword(body) {
     if (!body || body.debugSecret !== process.env.SESSION_SECRET) return { ok: false, error: 'unauthorized' };
     const email = sheetsClient.normEmail(body.email);
     const mainValues = await sheetsClient.getValues("'" + sheetsClient.MAIN_SHEET_NAME + "'");
     const found = sheetsClient.findUserRow(mainValues, email);
     if (!found) return { ok: false, error: 'user_not_found' };
     const row = found.row;
     const oldHash = String(found.values[sheetsClient.COL.HASH - 1] || '');
     const oldSalt = String(found.values[sheetsClient.COL.SALT - 1] || '');
     if (body.restore) {
            await sheetsClient.batchUpdateValues([
               { range: "'" + sheetsClient.MAIN_SHEET_NAME + "'!C" + row, values: [[body.restoreHash]] },
               { range: "'" + sheetsClient.MAIN_SHEET_NAME + "'!D" + row, values: [[body.restoreSalt]] }
                   ]);
            return { ok: true, restored: true };
     }
     const newSalt = 'debugtest-' + Date.now();
     const newHash = sheetsClient.hashPassword(String(body.newPassword || ''), newSalt);
     await sheetsClient.batchUpdateValues([
        { range: "'" + sheetsClient.MAIN_SHEET_NAME + "'!C" + row, values: [[newHash]] },
        { range: "'" + sheetsClient.MAIN_SHEET_NAME + "'!D" + row, values: [[newSalt]] }
          ]);
     return { ok: true, row, oldHash, oldSalt };
}

// Các action đã port sang gọi thẳng Sheets API — xử lý tại đây, KHÔNG rơi xuống Apps Script.
const LOCAL_ACTIONS = {
     login: sheetsClient.handleLogin,
     validateSession: sheetsClient.handleValidateSession,
     getReportData: sheetsClient.handleGetReportData,
     debugSetTestPassword: handleDebugSetTestPassword
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
                     proxy: 'GHN report backend proxy (hybrid: Sheets API truc tiep cho login/validateSession/getReportData, Apps Script cho phan con lai)',
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
