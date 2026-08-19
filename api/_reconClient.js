/* ============================================================================================
   ĐỐI SOÁT VẬN TẢI (NCC <-> GHN) — backend riêng cho mục "Đối soát vận tải".
   Dùng lại các hàm cấp thấp (getValues/batchGetValues/putValues/getSheetTitles/verifyToken) từ
   api/_sheetsClient.js — file đó KHÔNG bị sửa gì cả, chỉ import ra dùng, nên không có rủi ro ảnh
   hưởng các tính năng khác (đăng nhập báo cáo vận hành, Kế hoạch KD, BCKQKD…) đang chạy ổn định.

   Sheet dữ liệu đối soát ("ĐỐI SOÁT XE TẢI - LDBB") là 1 Google Sheet RIÊNG, khác hẳn sheet báo cáo
   vận hành chính — nhưng cùng tài khoản quynhpv1@ghn.vn sở hữu/chỉnh sửa nên dùng chung access token
   OAuth đã cấu hình sẵn trên Vercel (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN), không cần cấp
   quyền gì thêm. Đăng nhập cũng dùng chung action "login" (cùng tài khoản nhân viên @ghn.vn).

   Đọc valueRenderOption=FORMATTED_VALUE (thay vì UNFORMATTED_VALUE như các action khác) để số/ngày/%
   trả về đúng dạng chuỗi hiển thị giống hệt lúc export CSV thủ công trước đây — toàn bộ logic đối
   soát ở phía trình duyệt (doi_soat_van_tai.js, port từ bản offline đã test khớp 100% với Python)
   được viết dựa trên đúng định dạng chuỗi này.

   Ghi lại sheet "Tổng hợp": CHƯA làm ở bản đầu tiên này (chỉ mới đọc + đối soát trực tiếp trên web).
   Ghi đè dữ liệu tổng hợp tự động là thao tác rủi ro cao hơn (đụng vào sheet gốc dùng cho các mục
   đích khác), nên để làm riêng ở đợt sau sau khi thống nhất rõ cách ghi (đè toàn bộ hay chỉ cập nhật
   theo Mã chuyến).
   ============================================================================================ */
const { getValues, batchGetValues, getSheetTitles, verifyToken } = require('./_sheetsClient.js');

const RECON_SHEET_ID = '1cuj2EuZfuglithQCCknx1tMl6Uwl14GtWnPBlDSLv8Y';

// Đọc TOÀN BỘ các sheet trong file đối soát (Main, Setting, Tổng hợp, NCC_*, GHN_*…), trả về đúng
// định dạng { tenSheet: mảng 2 chiều } mà logic đối soát ở phía trình duyệt đang cần.
async function handleGetReconData(body) {
  const email = verifyToken(body && body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  try {
    const titles = await getSheetTitles(RECON_SHEET_ID);
    const valueRanges = await batchGetValues(RECON_SHEET_ID, titles, { valueRenderOption: 'FORMATTED_VALUE' });
    const raw = {};
    titles.forEach((name, i) => { raw[name] = (valueRanges[i] && valueRanges[i].values) || []; });
    return { ok: true, raw: raw };
  } catch (e) {
    return { ok: false, error: 'doc_sheet_that_bai', detail: String(e && e.message || e) };
  }
}

module.exports = { handleGetReconData };
