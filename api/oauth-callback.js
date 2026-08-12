/* ============================================================================================
   OAuth callback — DÙNG MỘT LẦN để lấy refresh token cho api/gas.js
   ============================================================================================
   Mục đích: sau khi quynhpv1@ghn.vn bấm "Cho phép" trên màn hình đồng ý của Google, Google sẽ
   chuyển hướng về đây kèm ?code=... . File này đổi code đó lấy refresh_token, rồi CHỈ HIỂN THỊ
   ra màn hình (không tự lưu, không log ra đâu khác) để dán tay vào Vercel Environment Variables
   (GOOGLE_OAUTH_REFRESH_TOKEN). Sau khi đã lấy được và lưu xong, có thể xoá endpoint này.

   Cần 2 biến môi trường đã set sẵn trước khi dùng:
     GOOGLE_OAUTH_CLIENT_ID
     GOOGLE_OAUTH_CLIENT_SECRET
   Redirect URI đăng ký trên Google Cloud Console phải khớp CHÍNH XÁC với REDIRECT_URI bên dưới.
   ============================================================================================ */

const REDIRECT_URI = 'https://baocaovanhanh.vercel.app/api/oauth-callback';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).send('Chưa cấu hình GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET trên Vercel.');
    return;
  }

  const url = new URL(req.url, 'https://' + (req.headers.host || 'baocaovanhanh.vercel.app'));
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');

  if (err) {
    res.status(400).send('Google báo lỗi khi cấp quyền: ' + err);
    return;
  }

  if (!code) {
    res.status(400).send('Thiếu tham số code. Truy cập link này thường phải đi qua màn hình đồng ý của Google trước.');
    return;
  }

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

  const data = await r.json();

  if (!r.ok || !data.refresh_token) {
    res.status(502).send(
      '<pre>Đổi code lấy token thất bại hoặc Google không trả refresh_token (thường do đã đăng nhập app này ' +
      'trước đó — cần vào https://myaccount.google.com/permissions, gỡ quyền của app "GHN Bao Cao Van Hanh Proxy" ' +
      'rồi thử lại từ đầu).\n\n' + JSON.stringify(data, null, 2) + '</pre>'
      );
    return;
  }

  res.status(200).send(
    '<pre>' +
    'LẤY REFRESH TOKEN THÀNH CÔNG.\n\n' +
    'Dán giá trị dưới đây vào Vercel > Settings > Environment Variables > GOOGLE_OAUTH_REFRESH_TOKEN\n' +
    '(rồi Redeploy để có hiệu lực). Trang này không tự lưu gì cả — đóng tab là mất, phải dán ngay.\n\n' +
    'refresh_token:\n' + data.refresh_token + '\n\n' +
    '(access_token vừa cấp, chỉ dùng để kiểm tra nhanh nếu cần, sẽ hết hạn sau ít phút):\n' +
    (data.access_token || '(không có)') +
    '</pre>'
    );
  } catch (e) {
    res.status(500).send('Lỗi khi gọi Google: ' + String(e && e.message));
  }
};
