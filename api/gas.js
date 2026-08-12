/* ============================================================================================
   PROXY BACKEND — Vercel Serverless Function
   Đường đi:  trình duyệt  ->  https://baocaovanhanh.vercel.app/api/gas  ->  Apps Script /exec
   ============================================================================================
   LÝ DO TỒN TẠI (đọc kỹ trước khi sửa hoặc xoá):

   Trước đây trình duyệt gọi THẲNG script.google.com. Cách đó phụ thuộc vào việc TỪNG MÁY nhân
   viên phải tự ra được Google. Khi phòng IT chặn script.google.com ở tầng mạng, request bị nuốt
   im lặng (treo vô hạn, không lỗi không phản hồi) và trình duyệt cuối cùng ném "Failed to fetch"
   — toàn bộ web chết, dù backend vẫn chạy tốt.

   Hàm này chạy trên máy chủ Vercel đặt ngoài mạng công ty, nên nó gọi Apps Script được bình
   thường. Trình duyệt chỉ còn nói chuyện với chính domain đang mở => firewall không có gì để chặn,
   và vì cùng origin nên CORS cũng biến mất hoàn toàn.

   Ba nguyên tắc bắt buộc giữ:
   1) URL Apps Script CHỈ nằm ở phía máy chủ. Không nhận URL đích do client gửi lên — nếu nhận,
      endpoint này thành open proxy, ai cũng mượn máy chủ để gọi đi nơi khác.
   2) Luôn trả JSON, kể cả khi hỏng. Frontend chỉ hiểu JSON; trả HTML lỗi sẽ khiến nó báo
      "Failed to fetch" mơ hồ đúng như lỗi cũ, mất luôn khả năng chẩn đoán.
   3) Không đụng gì tới Code.gs. Apps Script hoàn toàn không biết có lớp trung gian này.
   ============================================================================================
   GHI CHÚ BỔ SUNG (đợt chuyển Apps Script sang tài khoản Workspace công ty):

   Deployment mới chạy dưới tài khoản @ghn.vn (Google Workspace). IT khoá 2 lớp:
   - Sheet dữ liệu KHÔNG cho chia sẻ ra tài khoản Gmail cá nhân.
   - Web app deploy từ tài khoản Workspace chỉ có 2 lựa chọn "Ai có quyền truy cập":
     "Chỉ mình tôi" hoặc "Bất kỳ ai trong GHN" — không có "Bất kỳ ai" (public).
   Máy chủ Vercel gọi vào là một request ẩn danh (không có phiên đăng nhập Google), nên nếu
   không làm gì thêm, Google sẽ chặn/redirect sang trang đăng nhập — đúng kiểu lỗi
   "apps_script_khong_tra_json" từng gặp.

   Cách xử lý: proxy tự "đăng nhập" bằng tài khoản quynhpv1@ghn.vn qua OAuth (refresh token lưu
   trong biến môi trường), đính kèm Authorization: Bearer <access_token> khi gọi GAS_URL. Nếu
   3 biến GOOGLE_OAUTH_* chưa được set thì bỏ qua bước này, giữ hành vi cũ (gọi không kèm token)
   — không phá web nếu OAuth có vấn đề.
   ============================================================================================ */

// Ưu tiên biến môi trường trên Vercel (Settings -> Environment Variables -> GAS_URL) để có thể
// đổi/thu hồi link mà không phải sửa code. Mặc định trỏ vào deployment mới (tài khoản công ty).
const GAS_URL = process.env.GAS_URL ||
     'https://script.google.com/a/macros/ghn.vn/s/AKfycbwCvB4V_7kstxSnM9rPB8AkBePFA4biqcYnPA8T2cOqs4R_snmhe57kD_SRF1HAvTM/exec';

// Cắt sớm hơn giới hạn của Vercel (60s) để còn kịp trả thông báo lỗi tử tế thay vì bị giết ngang.
const TIMEOUT_MS = 55000;

/* Đổi refresh token lấy access token mới. Không cache giữa các lần gọi (mỗi lần Vercel có thể
   là 1 instance khác nhau) — chấp nhận tốn thêm 1 round-trip để đổi lấy đơn giản & chắc chắn.
   Trả về null nếu chưa cấu hình OAuth hoặc đổi token thất bại — gọi nơi dùng phải tự lùi về
   hành vi không kèm token, KHÔNG được ném lỗi làm sập cả request. */
async function layAccessToken() {
     const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
     const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
     const REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
     if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) return null;

  try {
         const r = await fetch('https://oauth2.googleapis.com/token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                             client_id: CLIENT_ID,
                             client_secret: CLIENT_SECRET,
                             refresh_token: REFRESH_TOKEN,
                             grant_type: 'refresh_token'
                  })
         });
         if (!r.ok) return null;
         const data = await r.json();
         return data.access_token || null;
  } catch (e) {
         return null;
  }
}

/* Lấy body thô. Vercel tự parse sẵn req.body theo Content-Type:
     - 'text/plain'        -> chuỗi
     - 'application/json'  -> object
   Nhưng không phải lúc nào cũng có (ví dụ body rỗng hoặc Content-Type lạ), nên vẫn phải có
   nhánh đọc thẳng từ stream, nếu không sẽ mất dữ liệu một cách âm thầm. */
function docBody(req) {
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

     // Kiểm tra nhanh bằng trình duyệt: mở /api/gas thấy JSON là proxy sống.
     if (req.method === 'GET') {
            const coCauHinhOAuth = !!(process.env.GOOGLE_OAUTH_CLIENT_ID &&
                                            process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
            res.status(200).json({
                     ok: true,
                     proxy: 'GHN report backend proxy',
                     dichDen: GAS_URL.replace(/\/s\/[^/]+\//, '/s/***/'),   // che bớt id, không in nguyên link
                     nguonUrl: process.env.GAS_URL ? 'bien moi truong' : 'mac dinh trong code',
                     oauth: coCauHinhOAuth ? 'da cau hinh' : 'chua cau hinh (goi khong kem token)',
                     thoiGian: new Date().toISOString()
            });
            return;
     }

     if (req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST');
            res.status(405).json({ ok: false, error: 'method_not_allowed' });
            return;
     }

     let body;
     try {
            body = await docBody(req);
     } catch (e) {
            res.status(400).json({ ok: false, error: 'khong_doc_duoc_body', chiTiet: String(e && e.message) });
            return;
     }

     const ac = new AbortController();
     const hetGio = setTimeout(() => ac.abort(), TIMEOUT_MS);
     const t0 = Date.now();

     try {
            // Deployment mới (tài khoản Workspace) chỉ nhận request có Google xác định được danh tính
       // người gọi khi "Ai có quyền truy cập" = "Bất kỳ ai trong GHN". Đính Bearer token của chính
       // quynhpv1@ghn.vn (nếu đã cấu hình) để Google coi request này là người trong công ty gọi vào.
       const accessToken = await layAccessToken();
            const headers = { 'Content-Type': 'text/plain;charset=utf-8' };
            if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;

       // Apps Script /exec trả 302 sang script.googleusercontent.com — fetch tự đi theo redirect.
       // Giữ nguyên Content-Type text/plain giống hệt cách frontend vẫn gửi, để doPost không đổi hành vi.
       const r = await fetch(GAS_URL, {
                method: 'POST',
                headers: headers,
                body: body,
                redirect: 'follow',
                signal: ac.signal
       });

       const text = await r.text();

       // Apps Script khi lỗi cú pháp / mất quyền sẽ trả về TRANG HTML chứ không phải JSON.
       // Bắt trường hợp này và nói thẳng nguyên nhân, thay vì để frontend nhận rác rồi báo lỗi vô nghĩa.
       let duLieu;
            try {
                     duLieu = JSON.parse(text);
            } catch (e) {
                     res.status(502).json({
                                ok: false,
                                error: 'apps_script_khong_tra_json',
                                thongDiep: 'Apps Script trả về nội dung không phải JSON. Thường do project lỗi cú pháp, ' +
                                                      'deployment chưa cập nhật phiên bản mới, hoặc quyền truy cập không phải "Anyone".',
                                httpStatus: r.status,
                                trichDan: text.slice(0, 400),
                                ms: Date.now() - t0
                     });
                     return;
            }

       res.status(r.status).json(duLieu);
     } catch (e) {
            const boHuy = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
            res.status(boHuy ? 504 : 502).json({
                     ok: false,
                     error: boHuy ? 'apps_script_qua_han' : 'khong_goi_duoc_apps_script',
                     thongDiep: boHuy
                       ? 'Apps Script không phản hồi trong ' + (TIMEOUT_MS / 1000) + ' giây.'
                                : 'Máy chủ trung gian không gọi được Apps Script: ' + String(e && e.message),
                     ms: Date.now() - t0
            });
     } finally {
            clearTimeout(hetGio);
     }
};
