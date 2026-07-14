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
// Sheet "DBB KẾ HOẠCH KINH DOANH" — dữ liệu cho mục "Kế hoạch kinh doanh" trong menu Kinh doanh. Sheet này
// thuộc cùng chủ sở hữu Google với sheet vận hành ở trên nên backend đọc/ghi trực tiếp bằng openById, không
// cần chia sẻ public riêng. Đăng nhập/phân quyền dùng CHUNG hệ thống tài khoản "Main" phía trên — sheet
// "Caidat" (tài khoản riêng) và hệ thống đăng nhập gốc của công cụ CRM cũ KHÔNG còn được dùng nữa.
const KEHOACH_SHEET_ID = '1HxAQ6aUAqvme6ixsiSr-QmvjSLLBPnl2TQkLadQyjvk';
const KEHOACH_DRIVE_FOLDER_ID = '1fmIbxoMYUzxVobE8aLPDXzohpXlFy45n';
const COL_KH = { THOIGIAN: 1, NGUOILAP: 2, NGAYLAP: 3, NGAYTHUCHIEN: 4, NHOMKH: 5, SDT: 6, TENSHOP: 7,
  DIACHI: 8, DOITHU: 9, BANGGIA: 10, CHINHSACH: 11, SANLUONGTHANG: 12, SANLUONGTANGTHEM: 13, KHOILUONG: 14,
  IDKHACHHANG: 15, SANPHAM: 16, NGUYENNHAN: 17, TRANGTHAI: 18 };
const COL_KQ = { THOIGIAN: 1, IDKHACHHANG: 2, TENSHOP: 3, NGAYTIEPCAN: 4, DIACHI: 5, ANHCHECKIN: 6,
  ANHSANPHAM: 7, SANLUONGGUIGHN: 8, BANGGIA: 9, NGAYBATDAULENDON: 10 };
const COL_TD = { THOIGIAN: 1, IDKHACHHANG: 2, SDT: 3, TENSHOP: 4, NGAYGAPKH: 5, DIACHI: 6, ANHCHECKIN: 7,
  ANHSANPHAM: 8, SANPHAM: 9, DOITHU: 10, BANGGIA: 11, CHINHSACH: 12, SANLUONG: 13, KHOILUONG: 14,
  LYDO: 15, DEXUAT: 16 };
const MAIN_SHEET_NAME = 'Main';
const ALLOWED_EMAIL_DOMAIN = 'ghn.vn';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;     // token đăng nhập sống 24 tiếng (hết hạn thì bắt buộc xác thực lại
                                                 // bằng OTP gửi về mail @ghn — không cho đăng nhập được mãi mãi).
const OTP_TTL_MS = 10 * 60 * 1000;              // mã OTP quên mật khẩu sống 10 phút
const SESSION_OTP_TTL_MS = 60 * 1000;           // mã OTP xác thực lại phiên (sau 24h) chỉ sống 60 GIÂY — ngắn hơn
                                                 // hẳn OTP quên mật khẩu vì mục đích khác nhau (xác nhận vẫn còn
                                                 // quyền truy cập hộp mail công ty, không phải để đặt lại mật khẩu).
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
  DANGNHAPGANNHAT: 8, SOLANSAI: 9, KHOADENLUC: 10, OTP: 11, OTPHETHAN: 12, GHICHU: 13,
  QUYEN_TAIHTML: 14, QUYEN_COPY: 15, QUYEN_CHUPMANHINH: 16 };
const MAIN_HEADERS = ['Email', 'Họ và tên', 'PasswordHash', 'Salt', 'Active', 'VaiTro',
  'NgayTao', 'DangNhapGanNhat', 'SoLanSaiLienTiep', 'KhoaDenLuc', 'OTP', 'OTPHetHan', 'GhiChu',
  'QuyenTaiHTML', 'QuyenCopyDuLieu', 'QuyenChupManHinh'];
// 3 cột quyền trên CHỈ áp dụng cho tài khoản KHÔNG phải Admin — Admin (cột VaiTro) luôn có toàn quyền mặc định,
// không cần tick (xem getPermissions()). Admin bật/tắt các quyền này cho từng nhân viên qua trang "Cấu hình"
// trong web (không cần vào thẳng Google Sheet).

// ====== 4 CẤP QUYỀN (cột VaiTro sheet Main nhận 1 trong 4 giá trị này — 'Admin' luôn có toàn quyền, không
// phụ thuộc ma trận hạng mục bên dưới) ======
const ROLES = ['Admin', 'Quản lý', 'Nhân viên xử lý', 'Nhân viên'];
const ROLE_FIELD = { 'Admin': 'admin', 'Quản lý': 'quanLy', 'Nhân viên xử lý': 'nhanVienXuLy', 'Nhân viên': 'nhanVien' };

// ====== DANH MỤC HẠNG MỤC (menu/tab) TOÀN WEB — nguồn dữ liệu gốc cố định trong code, chỉ 2 cột BatTat +
// 4 cột quyền (theo ModuleId) là được Admin chỉnh qua trang "Cấu hình" > "Hạng mục & Phân quyền" (lưu ở sheet
// "CauHinhHangMuc"). "cap" dùng để canh lề/nhóm hiển thị trong bảng cấu hình (section > tab > subtab).
// "chaId" = hạng mục cha trực tiếp (rỗng nếu là section gốc) — CHỈ dùng để hiển thị phân cấp, KHÔNG tự động suy
// luận ẩn/hiện (mỗi hạng mục có cờ BatTat + quyền riêng, độc lập — nếu ẩn hạng mục cha thì FE tự ẩn luôn nút cha
// trên menu, các hạng mục con dù đang bật vẫn không hiển thị được vì nút cha đã biến mất, không cần logic suy diễn
// phức tạp ở backend).
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
// Danh sách hạng mục web dùng làm "Hạng mục" gắn cho từng công việc trong "Lịch làm việc" — CHỈ lấy các mục
// cấp section (trừ chính "Lịch làm việc"), theo đúng lựa chọn của user: dùng lại hạng mục web hiện có thay vì
// tạo danh sách riêng, để đồng bộ với hệ thống phân quyền hạng mục đã có.
function getTaskCategoryOptions() {
  return MODULE_DEFS.filter(function (m) { return m.cap === 'section' && m.id !== 'lichlamviec'; })
    .map(function (m) { return { id: m.id, label: m.label }; });
}
const MODULE_CONFIG_SHEET_NAME = 'CauHinhHangMuc';
const MODULE_CONFIG_HEADERS = ['ModuleId', 'TenHienThi', 'BatTat', 'QuyenAdmin', 'QuyenQuanLy', 'QuyenNhanVienXuLy', 'QuyenNhanVien'];

// Tạo sheet "CauHinhHangMuc" nếu chưa có, mặc định TẤT CẢ hạng mục Bật + cả 4 quyền đều được xem — tức là
// giữ NGUYÊN hành vi hiện tại (mọi tài khoản đã đăng nhập đều thấy mọi mục) cho tới khi Admin chủ động vào
// "Cấu hình" > "Hạng mục & Phân quyền" để ẩn bớt/giới hạn theo quyền. Nếu về sau MODULE_DEFS có thêm hạng mục
// mới (code cập nhật) mà sheet cũ chưa có dòng tương ứng, hàm này tự thêm dòng còn thiếu (mặc định Bật + đủ
// quyền) — không cần Admin tự tạo lại từ đầu mỗi lần code có tính năng mới.
function ensureModuleConfigSheet(ss) {
  var sh = ss.getSheetByName(MODULE_CONFIG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(MODULE_CONFIG_SHEET_NAME);
    sh.getRange(1, 1, 1, MODULE_CONFIG_HEADERS.length).setValues([MODULE_CONFIG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var values = sh.getDataRange().getValues();
  var existingIds = {};
  for (var i = 1; i < values.length; i++) { if (values[i][0]) existingIds[String(values[i][0])] = true; }
  var missingRows = [];
  MODULE_DEFS.forEach(function (m) {
    if (!existingIds[m.id]) missingRows.push([m.id, m.label, true, true, true, true, true]);
  });
  if (missingRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, missingRows.length, MODULE_CONFIG_HEADERS.length).setValues(missingRows);
  }
  var lastRow = Math.max(sh.getLastRow(), 2);
  sh.getRange(2, 3, Math.max(lastRow - 1, 30), 5).insertCheckboxes();
  return sh;
}

// Đọc toàn bộ bảng cấu hình hạng mục, trả về map moduleId -> { batTat, admin, quanLy, nhanVienXuLy, nhanVien }.
function readModuleConfigMap(sh) {
  var values = sh.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    map[String(r[0])] = {
      row: i + 1, batTat: r[2] === true, admin: r[3] === true,
      quanLy: r[4] === true, nhanVienXuLy: r[5] === true, nhanVien: r[6] === true
    };
  }
  return map;
}

// Tính sẵn "hạng mục nào user với role X được thấy" — dùng để nhúng thẳng vào response login/validateSession,
// tránh mỗi user phải gọi thêm 1 API riêng chỉ để biết ẩn/hiện menu nào. Admin luôn thấy hết (bypass), giống hệt
// quy ước "Admin luôn có toàn quyền mặc định" đã áp dụng cho 3 quyền tải HTML/copy/chụp màn hình phía trên.
function computeModuleAccessForRole(role) {
  var access = {};
  if (role === 'Admin') {
    MODULE_DEFS.forEach(function (m) { access[m.id] = true; });
    return access;
  }
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureModuleConfigSheet(ss);
  var map = readModuleConfigMap(sh);
  var field = ROLE_FIELD[role] || 'nhanVien';
  MODULE_DEFS.forEach(function (m) {
    var cfg = map[m.id];
    access[m.id] = !!(cfg && cfg.batTat && cfg[field]);
  });
  return access;
}

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
    if (action === 'requestSessionOtp') return jsonOut(handleRequestSessionOtp(body));
    if (action === 'verifySessionOtp') return jsonOut(handleVerifySessionOtp(body));
    if (action === 'getUserList') return jsonOut(handleGetUserList(body));
    if (action === 'updateUserPermissions') return jsonOut(handleUpdateUserPermissions(body));
    if (action === 'addUser') return jsonOut(handleAddUser(body));
    if (action === 'updateUser') return jsonOut(handleUpdateUser(body));
    if (action === 'deleteUser') return jsonOut(handleDeleteUser(body));
    if (action === 'adminResetPassword') return jsonOut(handleAdminResetPassword(body));
    if (action === 'getKeHoachData') return jsonOut(handleGetKeHoachData(body));
    if (action === 'addKeHoach') return jsonOut(handleAddKeHoach(body));
    if (action === 'updateKeHoach') return jsonOut(handleUpdateKeHoach(body));
    if (action === 'addKetQua') return jsonOut(handleAddKetQua(body));
    if (action === 'addTienDo') return jsonOut(handleAddTienDo(body));
    if (action === 'getBCKQKDData') return jsonOut(handleGetBCKQKDData(body));
    if (action === 'saveBCKQKDSchema') return jsonOut(handleSaveBCKQKDSchema(body));
    if (action === 'saveBCKQKDPeriod') return jsonOut(handleSaveBCKQKDPeriod(body));
    if (action === 'deleteBCKQKDPeriod') return jsonOut(handleDeleteBCKQKDPeriod(body));
    if (action === 'saveBCKQKDSubmission') return jsonOut(handleSaveBCKQKDSubmission(body));
    if (action === 'getBCKQKDSubmissionsForPeriod') return jsonOut(handleGetBCKQKDSubmissionsForPeriod(body));
    if (action === 'generateBCKQKDAggregate') return jsonOut(handleGenerateBCKQKDAggregate(body));
    if (action === 'getBCKQKDAggregate') return jsonOut(handleGetBCKQKDAggregate(body));
    if (action === 'updateBCKQKDAggregate') return jsonOut(handleUpdateBCKQKDAggregate(body));
    if (action === 'getModuleConfig') return jsonOut(handleGetModuleConfig(body));
    if (action === 'updateModuleConfig') return jsonOut(handleUpdateModuleConfig(body));
    if (action === 'getAssignableUsers') return jsonOut(handleGetAssignableUsers(body));
    if (action === 'getTasks') return jsonOut(handleGetTasks(body));
    if (action === 'createTask') return jsonOut(handleCreateTask(body));
    if (action === 'updateTask') return jsonOut(handleUpdateTask(body));
    if (action === 'updateTaskStatus') return jsonOut(handleUpdateTaskStatus(body));
    if (action === 'deleteTask') return jsonOut(handleDeleteTask(body));
    if (action === 'getCalendarConfigs') return jsonOut(handleGetCalendarConfigs(body));
    if (action === 'saveCalendarConfig') return jsonOut(handleSaveCalendarConfig(body));
    if (action === 'deleteCalendarConfig') return jsonOut(handleDeleteCalendarConfig(body));
    if (action === 'getCalendarEvents') return jsonOut(handleGetCalendarEvents(body));
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
  var role = String(r[COL.VAITRO - 1] || '');
  return { ok: true, token: token, email: email, name: String(r[COL.HOTEN - 1] || ''), role: role, permissions: getPermissions(role, r), moduleAccess: computeModuleAccessForRole(role) };
}

function handleValidateSession(body) {
  var email = verifyToken(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { ok: false, error: 'account_inactive' };
  var role = String(found.values[COL.VAITRO - 1] || '');
  return { ok: true, email: email, name: String(found.values[COL.HOTEN - 1] || ''), role: role, permissions: getPermissions(role, found.values), moduleAccess: computeModuleAccessForRole(role) };
}

// ====== PHÂN QUYỀN (tải HTML / copy dữ liệu / chụp màn hình) — chỉ áp dụng cho non-Admin ======
// Admin luôn có toàn quyền mặc định (không cần tick cột nào) — 3 cột QuyenTaiHTML/QuyenCopyDuLieu/
// QuyenChupManHinh trong sheet "Main" chỉ có ý nghĩa với tài khoản KHÔNG phải Admin, do Admin tự cấp
// qua trang "Cấu hình" trong web.
function getPermissions(role, r) {
  if (role === 'Admin') return { taiHtml: true, copy: true, chupManHinh: true };
  return {
    taiHtml: r[COL.QUYEN_TAIHTML - 1] === true,
    copy: r[COL.QUYEN_COPY - 1] === true,
    chupManHinh: r[COL.QUYEN_CHUPMANHINH - 1] === true
  };
}

// ====== XÁC THỰC LẠI PHIÊN SAU 24H BẰNG OTP (không bắt gõ lại mật khẩu) ======
// Khác với OTP "quên mật khẩu" (sống 10 phút, lưu trong sheet) — OTP xác thực lại phiên chỉ sống 60 GIÂY và
// lưu trong CacheService (không ghi vào Sheet, tự hết hạn, không tốn quota ghi). Mục đích: sau 24h, thay vì bắt
// nhân viên gõ lại mật khẩu (hoặc để họ đăng nhập vĩnh viễn), bắt buộc họ chứng minh vẫn còn quyền truy cập hộp
// mail @ghn.vn của chính mình bằng cách nhập đúng mã vừa gửi, trong đúng 60 giây.
function handleRequestSessionOtp(body) {
  var email = normEmail(body.email);
  if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  // Không tiết lộ tài khoản có tồn tại/active hay không — trả về thông báo giống nhau (giống requestPasswordReset).
  if (found && found.values[COL.ACTIVE - 1] === true) {
    var otp = String(Math.floor(100000 + Math.random() * 900000));
    var cache = CacheService.getScriptCache();
    cache.put('sessionotp_' + email, JSON.stringify({ otp: otp, createdAt: Date.now() }), 90); // đệm 90s, hiệu lực thật chỉ 60s (kiểm tra bên dưới)
    var name = String(found.values[COL.HOTEN - 1] || '');
    MailApp.sendEmail({
      to: email,
      subject: 'Mã xác thực lại phiên đăng nhập — Báo Cáo Vận Hành GHN',
      body: 'Chào ' + name + ',\n\n' +
        'Phiên đăng nhập của bạn trên Báo Cáo Vận Hành Tuần đã quá 24 giờ, cần xác thực lại. Mã xác nhận là: ' + otp + '\n' +
        'Mã CHỈ có hiệu lực trong 60 GIÂY kể từ khi email này được gửi — nếu hết hạn, hãy bấm "Gửi lại mã" trên trang web.\n' +
        'Nếu không phải bạn yêu cầu, hãy bỏ qua email này.\n\n' +
        '— Báo Cáo Vận Hành Tuần GHN'
    });
  }
  return { ok: true, message: 'Nếu email tồn tại và đang hoạt động, mã xác nhận đã được gửi.' };
}

function handleVerifySessionOtp(body) {
  var email = normEmail(body.email);
  var otp = String(body.otp || '');
  if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };
  var cache = CacheService.getScriptCache();
  var raw = cache.get('sessionotp_' + email);
  if (!raw) return { ok: false, error: 'otp_expired' };
  var saved;
  try { saved = JSON.parse(raw); } catch (e) { return { ok: false, error: 'otp_expired' }; }
  if (Date.now() - saved.createdAt > SESSION_OTP_TTL_MS) {
    cache.remove('sessionotp_' + email);
    return { ok: false, error: 'otp_expired' };
  }
  if (!saved.otp || saved.otp !== otp) return { ok: false, error: 'otp_invalid' };
  cache.remove('sessionotp_' + email); // dùng 1 lần

  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { ok: false, error: 'account_inactive' };
  var r = found.values;
  sh.getRange(found.row, COL.DANGNHAPGANNHAT).setValue(new Date());
  var token = makeToken(email);
  var role = String(r[COL.VAITRO - 1] || '');
  return { ok: true, token: token, email: email, name: String(r[COL.HOTEN - 1] || ''), role: role, permissions: getPermissions(role, r), moduleAccess: computeModuleAccessForRole(role) };
}

// ====== TRANG "CẤU HÌNH" CHO ADMIN — quản lý quyền tải HTML / copy dữ liệu / chụp màn hình từng nhân viên ======
function requireAdmin(token) {
  var email = verifyToken(token);
  if (!email) return { error: 'session_expired' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { error: 'account_inactive' };
  if (String(found.values[COL.VAITRO - 1] || '') !== 'Admin') return { error: 'forbidden' };
  return { sh: sh, email: email };
}

// ====== "CẤU HÌNH" > "HẠNG MỤC & PHÂN QUYỀN" (Admin bật/tắt + gán 4 quyền cho từng hạng mục menu/tab) ======
function handleGetModuleConfig(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureModuleConfigSheet(ss);
  var map = readModuleConfigMap(sh);
  var modules = MODULE_DEFS.map(function (m) {
    var cfg = map[m.id] || { batTat: true, admin: true, quanLy: true, nhanVienXuLy: true, nhanVien: true };
    return {
      id: m.id, label: m.label, cap: m.cap, chaId: m.chaId,
      batTat: cfg.batTat, admin: true, // cột Admin luôn true, chỉ hiển thị tham khảo, không cho tick tắt
      quanLy: cfg.quanLy, nhanVienXuLy: cfg.nhanVienXuLy, nhanVien: cfg.nhanVien
    };
  });
  return { ok: true, modules: modules };
}

var MODULE_CONFIG_EDITABLE_FIELDS = { batTat: 3, quanLy: 5, nhanVienXuLy: 6, nhanVien: 7 };
function handleUpdateModuleConfig(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var moduleId = String(body.moduleId || '');
  var field = String(body.field || '');
  var col = MODULE_CONFIG_EDITABLE_FIELDS[field];
  if (!col) return { ok: false, error: 'invalid_field' };
  if (!MODULE_DEFS.some(function (m) { return m.id === moduleId; })) return { ok: false, error: 'invalid_module' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureModuleConfigSheet(ss);
  var values = sh.getDataRange().getValues();
  var row = -1;
  for (var i = 1; i < values.length; i++) { if (String(values[i][0]) === moduleId) { row = i + 1; break; } }
  if (row === -1) return { ok: false, error: 'invalid_module' };
  sh.getRange(row, col).setValue(!!body.value);
  return { ok: true };
}

function handleGetUserList(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var values = auth.sh.getDataRange().getValues();
  var users = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var em = normEmail(r[COL.EMAIL - 1]);
    if (!em) continue;
    var role = String(r[COL.VAITRO - 1] || '');
    users.push({
      email: em,
      name: String(r[COL.HOTEN - 1] || ''),
      role: role,
      active: r[COL.ACTIVE - 1] === true,
      permissions: getPermissions(role, r)
    });
  }
  return { ok: true, users: users };
}

function handleUpdateUserPermissions(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var targetEmail = normEmail(body.targetEmail);
  if (!targetEmail) return { ok: false, error: 'bad_request' };
  var found = findUserRow(auth.sh, targetEmail);
  if (!found) return { ok: false, error: 'account_not_found' };
  // Admin luôn toàn quyền mặc định — ghi cột quyền cho 1 tài khoản Admin cũng không có tác dụng gì (xem
  // getPermissions), nhưng vẫn cho phép ghi để tránh lỗi UI, không cần chặn riêng.
  auth.sh.getRange(found.row, COL.QUYEN_TAIHTML).setValue(!!body.taiHtml);
  auth.sh.getRange(found.row, COL.QUYEN_COPY).setValue(!!body.copy);
  auth.sh.getRange(found.row, COL.QUYEN_CHUPMANHINH).setValue(!!body.chupManHinh);
  return { ok: true, permissions: { taiHtml: !!body.taiHtml, copy: !!body.copy, chupManHinh: !!body.chupManHinh } };
}

// ====== ADMIN: THÊM / SỬA / XOÁ / ĐẶT LẠI MẬT KHẨU TÀI KHOẢN NHÂN VIÊN — TOÀN BỘ QUA WEB ======
// Trước đây muốn thêm nhân viên mới phải tự vào Google Sheet "Main" thêm dòng thủ công — nay Admin làm
// hết trên trang "Cấu hình" của web, không cần đụng vào Sheet nữa (Sheet chỉ còn là nơi LƯU dữ liệu).
function generateTempPassword() {
  return Utilities.getUuid().split('-')[0] + 'Aa1!';
}

// Đếm số tài khoản Admin đang Active — dùng để chặn thao tác khiến hệ thống mất hết Admin (khoá chính mình
// ra ngoài vĩnh viễn). excludeRow (1-indexed, tính cả header) là dòng đang được sửa/xoá, không tính vào số đếm.
function countActiveAdmins(sh, excludeRow) {
  var values = sh.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < values.length; i++) {
    if ((i + 1) === excludeRow) continue;
    var r = values[i];
    if (String(r[COL.VAITRO - 1] || '') === 'Admin' && r[COL.ACTIVE - 1] === true) count++;
  }
  return count;
}

function handleAddUser(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var email = normEmail(body.email);
  var name = String(body.name || '').trim();
  var role = String(body.role || '').trim() || 'Nhân viên';
  if (!isValidGhnEmail(email)) return { ok: false, error: 'invalid_email_domain' };
  if (!name) return { ok: false, error: 'bad_request' };
  if (findUserRow(auth.sh, email)) return { ok: false, error: 'account_exists' };

  var tempPassword = generateTempPassword();
  var salt = Utilities.getUuid();
  var hash = hashPassword(tempPassword, salt);
  var row = [email, name, hash, salt, true, role, new Date(), '', 0, '', '', '', 'Tạo qua trang Cấu hình', false, false, false];
  auth.sh.appendRow(row);
  var newRow = auth.sh.getLastRow();
  // appendRow không tự có định dạng checkbox như các dòng khởi tạo sẵn — set riêng cho đúng dòng mới này.
  auth.sh.getRange(newRow, COL.ACTIVE, 1, 1).insertCheckboxes();
  auth.sh.getRange(newRow, COL.QUYEN_TAIHTML, 1, 3).insertCheckboxes();

  MailApp.sendEmail({
    to: email,
    subject: 'Tài khoản Báo Cáo Vận Hành GHN của bạn',
    body: 'Chào ' + name + ',\n\n' +
      'Tài khoản đăng nhập Báo Cáo Vận Hành Tuần đã được tạo:\n' +
      'Email: ' + email + '\n' +
      'Mật khẩu tạm: ' + tempPassword + '\n\n' +
      'Vui lòng đăng nhập và đổi mật khẩu ngay.\n\n— Báo Cáo Vận Hành Tuần GHN'
  });
  return { ok: true, email: email };
}

function handleUpdateUser(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var targetEmail = normEmail(body.targetEmail);
  var found = findUserRow(auth.sh, targetEmail);
  if (!found) return { ok: false, error: 'account_not_found' };

  var willBeAdmin = body.role !== undefined ? (String(body.role || '').trim() === 'Admin') : (String(found.values[COL.VAITRO - 1] || '') === 'Admin');
  var willBeActive = body.active !== undefined ? !!body.active : (found.values[COL.ACTIVE - 1] === true);
  var wasAdmin = String(found.values[COL.VAITRO - 1] || '') === 'Admin';
  var wasActive = found.values[COL.ACTIVE - 1] === true;
  // Nếu tài khoản NÀY đang là Admin+Active mà sau khi sửa sẽ không còn là Admin+Active nữa — chặn nếu đây là
  // Admin active cuối cùng của hệ thống (tránh tự khoá tất cả Admin ra ngoài vĩnh viễn).
  if (wasAdmin && wasActive && !(willBeAdmin && willBeActive)) {
    if (countActiveAdmins(auth.sh, found.row) === 0) return { ok: false, error: 'last_admin' };
  }

  if (body.name !== undefined) auth.sh.getRange(found.row, COL.HOTEN).setValue(String(body.name || '').trim());
  if (body.role !== undefined) auth.sh.getRange(found.row, COL.VAITRO).setValue(String(body.role || '').trim());
  if (body.active !== undefined) auth.sh.getRange(found.row, COL.ACTIVE).setValue(!!body.active);
  return { ok: true };
}

function handleDeleteUser(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var targetEmail = normEmail(body.targetEmail);
  if (targetEmail === auth.email) return { ok: false, error: 'cannot_delete_self' };
  var found = findUserRow(auth.sh, targetEmail);
  if (!found) return { ok: false, error: 'account_not_found' };
  var wasAdmin = String(found.values[COL.VAITRO - 1] || '') === 'Admin';
  var wasActive = found.values[COL.ACTIVE - 1] === true;
  if (wasAdmin && wasActive && countActiveAdmins(auth.sh, found.row) === 0) return { ok: false, error: 'last_admin' };
  auth.sh.deleteRow(found.row);
  return { ok: true };
}

function handleAdminResetPassword(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var targetEmail = normEmail(body.targetEmail);
  var found = findUserRow(auth.sh, targetEmail);
  if (!found) return { ok: false, error: 'account_not_found' };
  var tempPassword = generateTempPassword();
  var salt = Utilities.getUuid();
  var hash = hashPassword(tempPassword, salt);
  auth.sh.getRange(found.row, COL.SALT).setValue(salt);
  auth.sh.getRange(found.row, COL.HASH).setValue(hash);
  auth.sh.getRange(found.row, COL.SOLANSAI).setValue(0);
  auth.sh.getRange(found.row, COL.KHOADENLUC).setValue('');
  var name = String(found.values[COL.HOTEN - 1] || '');
  MailApp.sendEmail({
    to: targetEmail,
    subject: 'Mật khẩu mới — Báo Cáo Vận Hành GHN',
    body: 'Chào ' + name + ',\n\n' +
      'Quản trị viên vừa đặt lại mật khẩu cho tài khoản của bạn:\n' +
      'Mật khẩu tạm: ' + tempPassword + '\n\n' +
      'Vui lòng đăng nhập và đổi mật khẩu ngay.\n\n— Báo Cáo Vận Hành Tuần GHN'
  });
  return { ok: true };
}

// ====== KẾ HOẠCH KINH DOANH (Kế hoạch / Kết quả / Tiến độ) — dùng chung đăng nhập với web chính ======
// Bất kỳ tài khoản Active nào (không riêng Admin) đều dùng được mục này — giống cách công cụ CRM gốc cho
// phép mọi nhân viên tự nhập kế hoạch/tiến độ của mình, Admin chỉ khác ở việc còn thấy trang Cấu hình.
function requireActiveUser(token) {
  var email = verifyToken(token);
  if (!email) return { error: 'session_expired' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { error: 'account_inactive' };
  return { email: email, name: String(found.values[COL.HOTEN - 1] || email) };
}

// Giống requireActiveUser nhưng có thêm "role" — dùng cho các API cần biết cấp quyền (Admin/Quản lý/Nhân viên xử
// lý/Nhân viên) để quyết định hành vi, ví dụ: mục "Lịch làm việc" (giao việc, quản lý lịch chia sẻ chung...).
function requireActiveUserFull(token) {
  var email = verifyToken(token);
  if (!email) return { error: 'session_expired' };
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  if (!found || found.values[COL.ACTIVE - 1] !== true) return { error: 'account_inactive' };
  return { email: email, name: String(found.values[COL.HOTEN - 1] || email), role: String(found.values[COL.VAITRO - 1] || '') };
}

function getKeHoachSpreadsheet() {
  return SpreadsheetApp.openById(KEHOACH_SHEET_ID);
}

function handleGetKeHoachData(body) {
  var auth = requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = getKeHoachSpreadsheet();
  // 3 sheet nghiệp vụ chính — kèm rowIndex thật trên Sheet cho từng dòng, để có thể tra cứu/sửa/xem lịch sử
  // chính xác 1 dòng cụ thể ở phía client (tìm kiếm, cập nhật tiến độ, sửa kế hoạch, báo cáo, biểu đồ đều xử lý
  // ở phía client trên bộ dữ liệu đã tải 1 lần này — không cần thêm round-trip cho mỗi thao tác lọc/tìm/xem).
  var kehoach = sheetToTableShapeWithRow(ss.getSheetByName('Kehoach'));
  var ketqua = sheetToTableShapeWithRow(ss.getSheetByName('Ketqua'));
  var tiendo = sheetToTableShapeWithRow(ss.getSheetByName('Tiendo'));
  // Xaphuong dùng làm nguồn Tỉnh/Huyện/Xã cho ô địa chỉ — cache 6 tiếng vì danh sách hành chính gần như
  // không đổi, tránh đọc lại ~900 dòng mỗi lần mở trang.
  var cache = CacheService.getScriptCache();
  var xaphuongCached = cache.get('xaphuong_v1');
  var xaphuong;
  if (xaphuongCached) {
    xaphuong = JSON.parse(xaphuongCached);
  } else {
    xaphuong = sheetToTableShape(ss.getSheetByName('Xaphuong'));
    cache.put('xaphuong_v1', JSON.stringify(xaphuong), 21600);
  }
  // Sheet "Doanhthu" (Báo Cáo Kinh Doanh) là 1 QUERY(IMPORTRANGE(...)) trỏ ra 1 Sheet ngoài — có thể đang lỗi
  // #REF nếu quyền truy cập nguồn ngoài đó bị mất, nên đọc kiểu best-effort, không để lỗi này làm hỏng cả API.
  var doanhthu = { cols: [], rows: [], error: null };
  try {
    var dtSheet = ss.getSheetByName('Doanhthu');
    if (dtSheet) doanhthu = sheetToTableShapeWithRow(dtSheet);
  } catch (dtErr) {
    doanhthu = { cols: [], rows: [], error: String(dtErr) };
  }
  // Danh sách nhân viên đang Active — dùng cho dropdown "Người lập" trong bộ lọc báo cáo/biểu đồ (nhân sự dùng
  // chung tài khoản với web chính, không còn sheet "Nhansu" riêng của công cụ cũ nữa).
  var staff = listActiveStaffNames(getMainSheet());
  return { ok: true, kehoach: kehoach, ketqua: ketqua, tiendo: tiendo, xaphuong: xaphuong, doanhthu: doanhthu, staff: staff };
}

function listActiveStaffNames(sh) {
  var values = sh.getDataRange().getValues();
  var staff = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (r[COL.ACTIVE - 1] === true) {
      var nm = String(r[COL.HOTEN - 1] || '').trim();
      if (nm) staff.push(nm);
    }
  }
  return staff;
}

// Sửa 1 kế hoạch đã lập trước đó (giống nút "Chỉnh sửa Kế hoạch" trong công cụ gốc) — xác định đúng dòng bằng
// rowIndex thật (trả về sẵn từ handleGetKeHoachData/sheetToTableShapeWithRow), CHỈ ghi đè các trường nghiệp vụ
// được gửi lên, KHÔNG đụng tới Thời gian lập/Người lập gốc (giữ nguyên dấu vết ai đã tạo kế hoạch, lúc nào).
function handleUpdateKeHoach(body) {
  var auth = requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var rowIndex = Number(body.rowIndex);
  if (!rowIndex || rowIndex < 2) return { ok: false, error: 'bad_request' };
  var sh = getKeHoachSpreadsheet().getSheetByName('Kehoach');
  if (rowIndex > sh.getLastRow()) return { ok: false, error: 'not_found' };
  var fieldMap = {
    ngayLapKeHoach: COL_KH.NGAYLAP, ngayThucHien: COL_KH.NGAYTHUCHIEN, nhomKH: COL_KH.NHOMKH,
    sdtKH: COL_KH.SDT, tenShop: COL_KH.TENSHOP, diaChi: COL_KH.DIACHI, donViDoiThu: COL_KH.DOITHU,
    bangGia: COL_KH.BANGGIA, chinhSach: COL_KH.CHINHSACH, sanLuongThang: COL_KH.SANLUONGTHANG,
    sanLuongTangThem: COL_KH.SANLUONGTANGTHEM, khoiLuong: COL_KH.KHOILUONG, idKhachHang: COL_KH.IDKHACHHANG,
    sanPham: COL_KH.SANPHAM, nguyenNhan: COL_KH.NGUYENNHAN, trangThai: COL_KH.TRANGTHAI
  };
  Object.keys(fieldMap).forEach(function (key) {
    if (body[key] !== undefined) sh.getRange(rowIndex, fieldMap[key]).setValue(body[key]);
  });
  return { ok: true };
}

function uploadKeHoachImage(dataUrl, filenamePrefix) {
  if (!dataUrl || dataUrl.indexOf('base64,') === -1) return '';
  try {
    var parts = dataUrl.split(',');
    var meta = parts[0]; // vd: data:image/jpeg;base64
    var mimeMatch = /data:([^;]+);/.exec(meta);
    var mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    var bytes = Utilities.base64Decode(parts[1]);
    var blob = Utilities.newBlob(bytes, mime, filenamePrefix + '_' + Date.now() + '.jpg');
    var folder = DriveApp.getFolderById(KEHOACH_DRIVE_FOLDER_ID);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    return '';
  }
}

function handleAddKeHoach(body) {
  var auth = requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var sh = getKeHoachSpreadsheet().getSheetByName('Kehoach');
  var row = [];
  row[COL_KH.THOIGIAN - 1] = new Date();
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
  sh.appendRow(row);
  return { ok: true };
}

function handleAddKetQua(body) {
  var auth = requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var sh = getKeHoachSpreadsheet().getSheetByName('Ketqua');
  var row = [];
  row[COL_KQ.THOIGIAN - 1] = new Date();
  row[COL_KQ.IDKHACHHANG - 1] = body.idKhachHang || '';
  row[COL_KQ.TENSHOP - 1] = body.tenShop || '';
  row[COL_KQ.NGAYTIEPCAN - 1] = body.ngayTiepCan || '';
  row[COL_KQ.DIACHI - 1] = body.diaChi || '';
  row[COL_KQ.ANHCHECKIN - 1] = uploadKeHoachImage(body.anhCheckin, 'checkin');
  row[COL_KQ.ANHSANPHAM - 1] = uploadKeHoachImage(body.anhSanPham, 'sanpham');
  row[COL_KQ.SANLUONGGUIGHN - 1] = body.sanLuongGuiGHN || '';
  row[COL_KQ.BANGGIA - 1] = body.bangGia || '';
  row[COL_KQ.NGAYBATDAULENDON - 1] = body.ngayBatDauLenDon || '';
  sh.appendRow(row);
  return { ok: true };
}

function handleAddTienDo(body) {
  var auth = requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var sh = getKeHoachSpreadsheet().getSheetByName('Tiendo');
  var row = [];
  row[COL_TD.THOIGIAN - 1] = new Date();
  row[COL_TD.IDKHACHHANG - 1] = body.idKhachHang || '';
  row[COL_TD.SDT - 1] = body.sdtKH || '';
  row[COL_TD.TENSHOP - 1] = body.tenShop || '';
  row[COL_TD.NGAYGAPKH - 1] = body.ngayGapKH || '';
  row[COL_TD.DIACHI - 1] = body.diaChi || '';
  row[COL_TD.ANHCHECKIN - 1] = uploadKeHoachImage(body.anhCheckin, 'checkin');
  row[COL_TD.ANHSANPHAM - 1] = uploadKeHoachImage(body.anhSanPham, 'sanpham');
  row[COL_TD.SANPHAM - 1] = body.sanPham || '';
  row[COL_TD.DOITHU - 1] = body.doiThu || '';
  row[COL_TD.BANGGIA - 1] = body.bangGia || '';
  row[COL_TD.CHINHSACH - 1] = body.chinhSach || '';
  row[COL_TD.SANLUONG - 1] = body.sanLuong || '';
  row[COL_TD.KHOILUONG - 1] = body.khoiLuong || '';
  row[COL_TD.LYDO - 1] = body.lyDo || '';
  row[COL_TD.DEXUAT - 1] = body.deXuat || '';
  sh.appendRow(row);
  return { ok: true };
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

// Giống sheetToTableShape nhưng kèm thêm "row" = số dòng thật trên Sheet (1-indexed, tính cả header) cho từng
// dòng dữ liệu — dùng cho các sheet cần tra cứu/sửa lại chính xác 1 dòng cụ thể sau này (Kehoach/Ketqua/Tiendo).
function sheetToTableShapeWithRow(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return { cols: [], rows: [] };
  var header = values[0];
  var cols = header.map(function (h) { return { label: (h === null || h === undefined) ? '' : String(h) }; });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    rows.push({
      row: i + 1,
      c: row.map(function (v) {
        if (v === '' || v === null || v === undefined) return null;
        if (Object.prototype.toString.call(v) === '[object Date]') return { v: v.toISOString() };
        return { v: v };
      })
    });
  }
  return { cols: cols, rows: rows };
}

// ====== TIỆN ÍCH ======
function getMainSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!sh) throw new Error('Chưa có sheet "Main" — chạy setupMainSheet() trước.');
  ensurePermissionColumns(sh);
  return sh;
}

// Tự "vá" thêm 3 cột quyền (QuyenTaiHTML/QuyenCopyDuLieu/QuyenChupManHinh) vào sheet "Main" đã có sẵn từ trước
// (khi tính năng phân quyền này chưa tồn tại) — không cần người dùng tự vào Apps Script chạy lại setupMainSheet
// (việc đó sẽ xoá sạch dữ liệu tài khoản hiện có). Chỉ đọc tiêu đề cột 14 để kiểm tra, cực rẻ, không tốn quota
// nếu đã có sẵn (trường hợp phổ biến sau lần đầu chạy).
function ensurePermissionColumns(sh) {
  var header14 = sh.getRange(1, COL.QUYEN_TAIHTML).getValue();
  if (header14 === MAIN_HEADERS[COL.QUYEN_TAIHTML - 1]) return; // đã có sẵn, không cần làm gì thêm
  sh.getRange(1, COL.QUYEN_TAIHTML, 1, 3).setValues([[
    MAIN_HEADERS[COL.QUYEN_TAIHTML - 1], MAIN_HEADERS[COL.QUYEN_COPY - 1], MAIN_HEADERS[COL.QUYEN_CHUPMANHINH - 1]
  ]]).setFontWeight('bold');
  var lastRow = Math.max(sh.getLastRow(), 2);
  sh.getRange(2, COL.QUYEN_TAIHTML, Math.max(lastRow - 1, 200), 3).insertCheckboxes();
  sh.autoResizeColumns(COL.QUYEN_TAIHTML, 3);
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

// ================= BÁO CÁO KẾT QUẢ KINH DOANH =================
// Form động (schema do Admin thiết kế/mở rộng) — nhiều AM/nhân sự cùng nộp giải trình riêng cho 1 kỳ (theo
// Tuần), Admin đặt deadline chỉnh sửa + gán ai phải báo cáo, sau đó AI (Gemini, cùng cơ chế với getKDAnalysis)
// gộp toàn bộ các bài nộp thành 1 báo cáo Vùng duy nhất đúng cấu trúc file mẫu "DBB - REPORT KINH DOANH".
// 4 sheet dùng chung 1 spreadsheet với Kehoach/Ketqua/Tiendo/Doanhthu (cùng domain "Kinh doanh").
var BCKQKD_SHEETS = { CONFIG: 'BCKQKD_Config', PERIODS: 'BCKQKD_Periods', SUBMISSIONS: 'BCKQKD_Submissions', AGGREGATE: 'BCKQKD_Aggregate' };

function getBCKQKDSpreadsheet() { return getKeHoachSpreadsheet(); }

// Cấu trúc mặc định khớp với file mẫu gốc: 3 mục lớn, có bảng KPI (auto-fill được vài dòng từ dữ liệu Kinh
// doanh đã có sẵn trong web — xem cột "autoActual"), bảng lặp (thêm/xoá dòng được), và các ô giải trình tự do.
// Admin có thể sửa/thêm mục/bảng/ô qua màn "Thiết kế Form" — toàn bộ lưu dạng 1 JSON duy nhất ở sheet Config
// để mở rộng biểu mẫu không cần đụng schema cứng của Sheet.
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

function ensureBCKQKDSheets(ss) {
  var cfgSh = ss.getSheetByName(BCKQKD_SHEETS.CONFIG);
  if (!cfgSh) {
    cfgSh = ss.insertSheet(BCKQKD_SHEETS.CONFIG);
    cfgSh.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]).setFontWeight('bold');
    cfgSh.getRange(2, 1, 1, 2).setValues([['schema_json', JSON.stringify(defaultBCKQKDSchema())]]);
  }
  var periodsSh = ss.getSheetByName(BCKQKD_SHEETS.PERIODS);
  if (!periodsSh) {
    periodsSh = ss.insertSheet(BCKQKD_SHEETS.PERIODS);
    periodsSh.getRange(1, 1, 1, 7).setValues([['PeriodId', 'Label', 'Deadline', 'ReportersJson', 'Status', 'CreatedBy', 'CreatedAt']]).setFontWeight('bold');
  }
  var subSh = ss.getSheetByName(BCKQKD_SHEETS.SUBMISSIONS);
  if (!subSh) {
    subSh = ss.insertSheet(BCKQKD_SHEETS.SUBMISSIONS);
    subSh.getRange(1, 1, 1, 7).setValues([['PeriodId', 'ReporterEmail', 'ReporterName', 'SubmittedAt', 'UpdatedAt', 'AnswersJson', 'Locked']]).setFontWeight('bold');
  }
  var aggSh = ss.getSheetByName(BCKQKD_SHEETS.AGGREGATE);
  if (!aggSh) {
    aggSh = ss.insertSheet(BCKQKD_SHEETS.AGGREGATE);
    aggSh.getRange(1, 1, 1, 7).setValues([['PeriodId', 'GeneratedAt', 'GeneratedBy', 'ContentJson', 'Model', 'EditedAt', 'EditedBy']]).setFontWeight('bold');
  } else if (aggSh.getLastColumn() < 7) {
    // migrate sheet cũ (tạo trước khi có tính năng Admin sửa tay báo cáo tổng hợp) — thêm 2 cột EditedAt/EditedBy
    // vào cuối, không đụng tới dữ liệu 5 cột đã có.
    aggSh.getRange(1, 6, 1, 2).setValues([['EditedAt', 'EditedBy']]).setFontWeight('bold');
  }
  return { cfgSh: cfgSh, periodsSh: periodsSh, subSh: subSh, aggSh: aggSh };
}

function readBCKQKDSchema(cfgSh) {
  var values = cfgSh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === 'schema_json') {
      try { return JSON.parse(values[i][1]); } catch (e) { return defaultBCKQKDSchema(); }
    }
  }
  return defaultBCKQKDSchema();
}

function readBCKQKDPeriods(periodsSh) {
  var values = periodsSh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    var reporters = [];
    try { reporters = JSON.parse(r[3] || '[]'); } catch (e) {}
    out.push({
      periodId: String(r[0]), label: String(r[1] || ''),
      deadline: r[2] ? new Date(r[2]).toISOString() : '',
      reporters: reporters, status: String(r[4] || 'open'),
      createdBy: String(r[5] || ''), createdAt: r[6] ? new Date(r[6]).toISOString() : ''
    });
  }
  return out;
}

function isAdminEmail(email) {
  var sh = getMainSheet();
  var found = findUserRow(sh, email);
  return !!(found && found.values[COL.ACTIVE - 1] === true && String(found.values[COL.VAITRO - 1] || '') === 'Admin');
}

// ---------- 1 lần tải toàn bộ những gì màn hình cần: schema + danh sách kỳ + bài nộp của chính mình + có phải
// Admin không + danh sách nhân viên active (để Admin gán reporter khi tạo/sửa kỳ báo cáo) ----------
function handleGetBCKQKDData(body) {
  var auth = requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = getBCKQKDSpreadsheet();
  var sheets = ensureBCKQKDSheets(ss);
  var schema = readBCKQKDSchema(sheets.cfgSh);
  var periods = readBCKQKDPeriods(sheets.periodsSh);
  var isAdmin = isAdminEmail(auth.email);

  var subValues = sheets.subSh.getDataRange().getValues();
  var mySubmissions = {};
  for (var i = 1; i < subValues.length; i++) {
    var r = subValues[i];
    if (normEmail(r[1]) !== auth.email) continue;
    var answers = {};
    try { answers = JSON.parse(r[5] || '{}'); } catch (e) {}
    mySubmissions[String(r[0])] = {
      submittedAt: r[3] ? new Date(r[3]).toISOString() : '', updatedAt: r[4] ? new Date(r[4]).toISOString() : '',
      answers: answers, locked: r[6] === true
    };
  }

  var staff = [];
  if (isAdmin) {
    var mainValues = getMainSheet().getDataRange().getValues();
    for (var j = 1; j < mainValues.length; j++) {
      var mr = mainValues[j];
      if (mr[COL.ACTIVE - 1] === true) {
        staff.push({ email: normEmail(mr[COL.EMAIL - 1]), name: String(mr[COL.HOTEN - 1] || '') });
      }
    }
  }
  return { ok: true, schema: schema, periods: periods, mySubmissions: mySubmissions, isAdmin: isAdmin, staff: staff, myEmail: auth.email, myName: auth.name };
}

function handleSaveBCKQKDSchema(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = getBCKQKDSpreadsheet();
  var sheets = ensureBCKQKDSheets(ss);
  var schema;
  try { schema = JSON.parse(body.schemaJson); } catch (e) { return { ok: false, error: 'bad_schema' }; }
  if (!schema || !Array.isArray(schema.sections)) return { ok: false, error: 'bad_schema' };
  var values = sheets.cfgSh.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < values.length; i++) { if (values[i][0] === 'schema_json') { rowIdx = i + 1; break; } }
  if (rowIdx === -1) { sheets.cfgSh.appendRow(['schema_json', JSON.stringify(schema)]); }
  else { sheets.cfgSh.getRange(rowIdx, 2).setValue(JSON.stringify(schema)); }
  return { ok: true };
}

// Tạo mới hoặc cập nhật 1 kỳ báo cáo (theo Tuần) — Admin đặt nhãn, hạn chỉnh sửa (deadline) và danh sách người
// phải nộp giải trình (reporters). periodId rỗng = tạo mới (tự sinh theo thời gian).
function handleSaveBCKQKDPeriod(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = getBCKQKDSpreadsheet();
  var sheets = ensureBCKQKDSheets(ss);
  var periodId = String(body.periodId || '').trim() || ('P' + Date.now());
  var label = String(body.label || '').trim();
  if (!label) return { ok: false, error: 'missing_label' };
  var deadline = body.deadline ? new Date(body.deadline) : '';
  var reporters = Array.isArray(body.reporters) ? body.reporters : [];
  var status = String(body.status || 'open');

  var values = sheets.periodsSh.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < values.length; i++) { if (String(values[i][0]) === periodId) { rowIdx = i + 1; break; } }
  if (rowIdx === -1) {
    sheets.periodsSh.appendRow([periodId, label, deadline, JSON.stringify(reporters), status, auth.email, new Date()]);
  } else {
    sheets.periodsSh.getRange(rowIdx, 2, 1, 5).setValues([[label, deadline, JSON.stringify(reporters), status, values[rowIdx - 1][5]]]);
  }
  return { ok: true, periodId: periodId };
}

function handleDeleteBCKQKDPeriod(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = getBCKQKDSpreadsheet();
  var sheets = ensureBCKQKDSheets(ss);
  var periodId = String(body.periodId || '');
  var values = sheets.periodsSh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === periodId) { sheets.periodsSh.deleteRow(i + 1); break; }
  }
  return { ok: true };
}

// AM/người dùng lưu (thêm mới hoặc sửa) bài giải trình của MÌNH cho 1 kỳ — chỉ được phép nếu: (a) nằm trong
// danh sách reporters được Admin gán cho kỳ đó, và (b) chưa quá deadline. Admin luôn được phép sửa (kể cả sau
// deadline, kể cả không nằm trong danh sách reporters) để xử lý ngoại lệ.
function handleSaveBCKQKDSubmission(body) {
  var auth = requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = getBCKQKDSpreadsheet();
  var sheets = ensureBCKQKDSheets(ss);
  var periodId = String(body.periodId || '');
  if (!periodId) return { ok: false, error: 'missing_period' };

  var isAdmin = isAdminEmail(auth.email);
  var periods = readBCKQKDPeriods(sheets.periodsSh);
  var period = periods.filter(function (p) { return p.periodId === periodId; })[0];
  if (!period) return { ok: false, error: 'period_not_found' };

  if (!isAdmin) {
    var assigned = period.reporters.some(function (r) { return normEmail(r.email) === auth.email; });
    if (!assigned) return { ok: false, error: 'not_assigned' };
    if (period.deadline && new Date(period.deadline).getTime() < Date.now()) return { ok: false, error: 'deadline_passed' };
    if (period.status === 'closed') return { ok: false, error: 'period_closed' };
  }

  var answersJson = JSON.stringify(body.answers || {});
  var values = sheets.subSh.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === periodId && normEmail(values[i][1]) === auth.email) { rowIdx = i + 1; break; }
  }
  var now = new Date();
  if (rowIdx === -1) {
    sheets.subSh.appendRow([periodId, auth.email, auth.name, now, now, answersJson, false]);
  } else {
    sheets.subSh.getRange(rowIdx, 5, 1, 2).setValues([[now, answersJson]]);
  }
  return { ok: true };
}

// Admin xem TOÀN BỘ bài nộp của 1 kỳ (để rà soát trước khi bấm AI tổng hợp).
function handleGetBCKQKDSubmissionsForPeriod(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = getBCKQKDSpreadsheet();
  var sheets = ensureBCKQKDSheets(ss);
  var periodId = String(body.periodId || '');
  var values = sheets.subSh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[0]) !== periodId) continue;
    var answers = {};
    try { answers = JSON.parse(r[5] || '{}'); } catch (e) {}
    out.push({
      email: normEmail(r[1]), name: String(r[2] || ''),
      submittedAt: r[3] ? new Date(r[3]).toISOString() : '', updatedAt: r[4] ? new Date(r[4]).toISOString() : '',
      answers: answers, locked: r[6] === true
    });
  }
  return { ok: true, submissions: out };
}

// ---------- AI (Gemini, cùng cơ chế với getKDAnalysis) tổng hợp toàn bộ giải trình của các reporter trong 1
// kỳ thành 1 báo cáo Vùng hoàn chỉnh, đúng cấu trúc schema hiện hành ----------
function handleGenerateBCKQKDAggregate(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok: false, error: 'ai_not_configured' };
  var ss = getBCKQKDSpreadsheet();
  var sheets = ensureBCKQKDSheets(ss);
  var periodId = String(body.periodId || '');
  var periods = readBCKQKDPeriods(sheets.periodsSh);
  var period = periods.filter(function (p) { return p.periodId === periodId; })[0];
  if (!period) return { ok: false, error: 'period_not_found' };
  var schema = readBCKQKDSchema(sheets.cfgSh);

  var subValues = sheets.subSh.getDataRange().getValues();
  var submissions = [];
  for (var i = 1; i < subValues.length; i++) {
    var r = subValues[i];
    if (String(r[0]) !== periodId) continue;
    var answers = {};
    try { answers = JSON.parse(r[5] || '{}'); } catch (e) {}
    submissions.push({ name: String(r[2] || ''), email: normEmail(r[1]), answers: answers });
  }
  if (!submissions.length) return { ok: false, error: 'no_submissions' };

  var prompt = buildBCKQKDAggregatePrompt(schema, period, submissions);
  var resp;
  try {
    resp = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey,
      {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, responseMimeType: 'application/json' }
        })
      }
    );
  } catch (err) { return { ok: false, error: 'ai_network_error', detail: String(err) }; }
  var code = resp.getResponseCode();
  if (code === 429) return { ok: false, error: 'ai_rate_limited' };
  if (code !== 200) return { ok: false, error: 'ai_http_' + code, detail: resp.getContentText().slice(0, 300) };

  var data;
  try { data = JSON.parse(resp.getContentText()); } catch (err) { return { ok: false, error: 'ai_bad_json' }; }
  var text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) return { ok: false, error: 'ai_empty_response' };
  var cleaned = String(text).replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  var content;
  try { content = JSON.parse(cleaned); } catch (err) { return { ok: false, error: 'ai_parse_error' }; }

  var now = new Date();
  var aggValues = sheets.aggSh.getDataRange().getValues();
  var rowIdx = -1;
  for (var j = 1; j < aggValues.length; j++) { if (String(aggValues[j][0]) === periodId) { rowIdx = j + 1; break; } }
  // Tổng hợp lại bằng AI luôn GHI ĐÈ toàn bộ, kể cả nếu trước đó Admin đã chỉnh tay — vì vậy phải xoá luôn
  // EditedAt/EditedBy (cột 6-7) của bản chỉnh tay cũ, nếu không phần "đã chỉnh sửa bởi..." sẽ hiện sai (gắn
  // nhầm vào nội dung AI vừa tạo lại, dù nội dung đó chưa hề được Admin sửa tay lần nào).
  if (rowIdx === -1) { sheets.aggSh.appendRow([periodId, now, auth.email, JSON.stringify(content), GEMINI_MODEL, '', '']); }
  else { sheets.aggSh.getRange(rowIdx, 2, 1, 6).setValues([[now, auth.email, JSON.stringify(content), GEMINI_MODEL, '', '']]); }

  return { ok: true, content: content, generatedAt: now.toISOString() };
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

function handleGetBCKQKDAggregate(body) {
  var auth = requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = getBCKQKDSpreadsheet();
  var sheets = ensureBCKQKDSheets(ss);
  var periodId = String(body.periodId || '');
  var values = sheets.aggSh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === periodId) {
      var content = {};
      try { content = JSON.parse(values[i][3] || '{}'); } catch (e) {}
      // cột 6-7 (EditedAt/EditedBy) chỉ có giá trị nếu Admin từng bấm "Lưu" sau khi sửa tay — sheet cũ tạo
      // trước tính năng này (hoặc bản ghi chưa từng bị sửa tay) sẽ rỗng, undefined nếu thiếu hẳn cột.
      var editedAt = values[i][5] ? new Date(values[i][5]).toISOString() : '';
      var editedBy = values[i][6] || '';
      return {
        ok: true, content: content,
        generatedAt: values[i][1] ? new Date(values[i][1]).toISOString() : '', generatedBy: values[i][2],
        editedAt: editedAt, editedBy: editedBy
      };
    }
  }
  return { ok: true, content: null };
}

// Admin sửa tay trực tiếp trên báo cáo tổng hợp AI đã tạo (VD: AI gộp ý chưa chuẩn, số liệu cần đính chính) —
// ghi đè ContentJson, giữ nguyên GeneratedAt/GeneratedBy/Model gốc (để vẫn biết bản AI gốc tạo lúc nào, ai bấm),
// chỉ cập nhật thêm EditedAt/EditedBy để phân biệt "đây là bản đã qua tay Admin chỉnh sửa".
function handleUpdateBCKQKDAggregate(body) {
  var auth = requireAdmin(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var periodId = String(body.periodId || '');
  if (!periodId) return { ok: false, error: 'missing_period' };
  var content = body.content;
  if (!content || typeof content !== 'object') return { ok: false, error: 'bad_schema' };
  var ss = getBCKQKDSpreadsheet();
  var sheets = ensureBCKQKDSheets(ss);
  var values = sheets.aggSh.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < values.length; i++) { if (String(values[i][0]) === periodId) { rowIdx = i + 1; break; } }
  if (rowIdx === -1) return { ok: false, error: 'aggregate_not_found' };
  var now = new Date();
  sheets.aggSh.getRange(rowIdx, 4, 1, 1).setValue(JSON.stringify(content));
  sheets.aggSh.getRange(rowIdx, 6, 1, 2).setValues([[now, auth.email]]);
  return { ok: true, editedAt: now.toISOString(), editedBy: auth.email };
}

// ================================================================================================
// ====== LỊCH LÀM VIỆC — (1) Công việc/giao việc + cảnh báo hạn, (2) Lịch họp (đọc từ link iCal) ======
// Dùng CHUNG hệ thống đăng nhập/phân quyền "Main" — hiển thị/ẩn 4 tab con qua MODULE_DEFS
// (llv_canhbao/llv_lichhop/llv_congviec/llv_canhan) như mọi hạng mục khác, Admin cấu hình ở trang
// "Cấu hình" > "Hạng mục & Phân quyền" y hệt các mục còn lại — KHÔNG cần thêm cơ chế phân quyền riêng.
// ================================================================================================
const CONGVIEC_SHEET_NAME = 'CongViec';
const CONGVIEC_HEADERS = ['Id', 'TieuDe', 'MoTa', 'HangMuc', 'MucDoUuTien', 'NguoiGiaoEmail', 'NguoiGiaoTen',
  'NguoiThucHienEmail', 'NguoiThucHienTen', 'NgayTao', 'HanChot', 'TrangThai', 'LaCaNhan', 'NgayHoanThanh', 'LichSuJson'];
const TASK_STATUSES = ['Chưa bắt đầu', 'Đang thực hiện', 'Chờ duyệt', 'Hoàn thành'];
const TASK_PRIORITIES = ['Cao', 'Trung bình', 'Thấp'];

function ensureCongViecSheet(ss) {
  var sh = ss.getSheetByName(CONGVIEC_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONGVIEC_SHEET_NAME);
    sh.getRange(1, 1, 1, CONGVIEC_HEADERS.length).setValues([CONGVIEC_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function taskRowToObj(r) {
  var lichSu = [];
  try { lichSu = JSON.parse(r[14] || '[]'); } catch (e) {}
  return {
    id: String(r[0] || ''), tieuDe: String(r[1] || ''), moTa: String(r[2] || ''), hangMuc: String(r[3] || ''),
    mucDoUuTien: String(r[4] || 'Trung bình'),
    nguoiGiaoEmail: String(r[5] || ''), nguoiGiaoTen: String(r[6] || ''),
    nguoiThucHienEmail: String(r[7] || ''), nguoiThucHienTen: String(r[8] || ''),
    ngayTao: r[9] ? new Date(r[9]).toISOString() : '',
    hanChot: r[10] ? new Date(r[10]).toISOString() : '',
    trangThai: String(r[11] || 'Chưa bắt đầu'),
    laCaNhan: r[12] === true,
    ngayHoanThanh: r[13] ? new Date(r[13]).toISOString() : '',
    lichSu: lichSu
  };
}

// Ai được XEM danh sách "Công việc" nhóm (không tính việc cá nhân): Admin/Quản lý thấy TOÀN BỘ (cần cái nhìn
// tổng thể để điều phối); Nhân viên xử lý/Nhân viên chỉ thấy việc mình được giao HOẶC việc do chính mình tạo/giao.
function canSeeAllTeamTasks(role) { return role === 'Admin' || role === 'Quản lý'; }
// Ai được GIAO việc cho NGƯỜI KHÁC (nguoiThucHien khác chính mình): chỉ Admin/Quản lý — theo đúng lựa chọn của user.
function canAssignOthers(role) { return role === 'Admin' || role === 'Quản lý'; }

function handleGetAssignableUsers(body) {
  var auth = requireActiveUser(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var sh = getMainSheet();
  var values = sh.getDataRange().getValues();
  var users = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var em = normEmail(r[COL.EMAIL - 1]);
    if (!em || r[COL.ACTIVE - 1] !== true) continue;
    users.push({ email: em, name: String(r[COL.HOTEN - 1] || em), role: String(r[COL.VAITRO - 1] || '') });
  }
  return { ok: true, users: users, categories: getTaskCategoryOptions(), statuses: TASK_STATUSES, priorities: TASK_PRIORITIES };
}

function handleGetTasks(body) {
  var auth = requireActiveUserFull(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureCongViecSheet(ss);
  var values = sh.getDataRange().getValues();
  var seeAll = canSeeAllTeamTasks(auth.role);
  var tasks = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    var isPersonal = r[12] === true;
    var thucHien = normEmail(r[7]);
    var giao = normEmail(r[5]);
    if (isPersonal) {
      // Việc cá nhân: CHỈ chủ sở hữu + Admin xem được (Admin toàn quyền mặc định, giống mọi mục khác trong hệ thống).
      if (thucHien !== auth.email && auth.role !== 'Admin') continue;
    } else {
      if (!seeAll && thucHien !== auth.email && giao !== auth.email) continue;
    }
    tasks.push(taskRowToObj(r));
  }
  return { ok: true, tasks: tasks, myEmail: auth.email, myRole: auth.role, canAssignOthers: canAssignOthers(auth.role),
    categories: getTaskCategoryOptions(), statuses: TASK_STATUSES, priorities: TASK_PRIORITIES };
}

function handleCreateTask(body) {
  var auth = requireActiveUserFull(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var tieuDe = String(body.tieuDe || '').trim();
  if (!tieuDe) return { ok: false, error: 'missing_title' };
  var laCaNhan = !!body.laCaNhan;
  var hanChot = body.hanChot ? new Date(body.hanChot) : null;
  if (hanChot && isNaN(hanChot.getTime())) return { ok: false, error: 'bad_deadline' };
  var mucDoUuTien = TASK_PRIORITIES.indexOf(body.mucDoUuTien) !== -1 ? body.mucDoUuTien : 'Trung bình';
  var hangMuc = String(body.hangMuc || '');
  if (hangMuc && !getTaskCategoryOptions().some(function (c) { return c.id === hangMuc; })) return { ok: false, error: 'bad_category' };

  var nguoiThucHienEmail, nguoiThucHienTen;
  if (laCaNhan) {
    // Việc cá nhân: luôn tự giao cho chính mình, bỏ qua nguoiThucHienEmail gửi lên (nếu có) để tránh nhầm lẫn.
    nguoiThucHienEmail = auth.email; nguoiThucHienTen = auth.name;
  } else {
    nguoiThucHienEmail = normEmail(body.nguoiThucHienEmail) || auth.email;
    if (nguoiThucHienEmail !== auth.email && !canAssignOthers(auth.role)) {
      return { ok: false, error: 'forbidden_assign' }; // Nhân viên xử lý/Nhân viên chỉ được tạo việc cho chính mình
    }
    if (nguoiThucHienEmail === auth.email) {
      nguoiThucHienTen = auth.name;
    } else {
      var targetFound = findUserRow(getMainSheet(), nguoiThucHienEmail);
      if (!targetFound || targetFound.values[COL.ACTIVE - 1] !== true) return { ok: false, error: 'assignee_not_found' };
      nguoiThucHienTen = String(targetFound.values[COL.HOTEN - 1] || nguoiThucHienEmail);
    }
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureCongViecSheet(ss);
  var id = Utilities.getUuid();
  var now = new Date();
  var lichSu = [{ at: now.toISOString(), by: auth.email, action: 'tao', note: '' }];
  sh.appendRow([id, tieuDe, String(body.moTa || ''), hangMuc, mucDoUuTien, auth.email, auth.name,
    nguoiThucHienEmail, nguoiThucHienTen, now, hanChot || '', 'Chưa bắt đầu', laCaNhan, '', JSON.stringify(lichSu)]);
  return { ok: true, id: id };
}

// Tìm dòng theo Id, trả về {row, values} hoặc null.
function findTaskRow(sh, id) {
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) { if (String(values[i][0]) === id) return { row: i + 1, values: values[i] }; }
  return null;
}

// Có quyền SỬA/XOÁ 1 công việc cụ thể không: Admin/Quản lý luôn được; người tạo (NguoiGiaoEmail) được; chủ việc
// cá nhân được sửa/xoá chính việc của mình. Nhân viên xử lý/Nhân viên KHÔNG được sửa việc do người khác giao.
function canEditTask(auth, r) {
  if (auth.role === 'Admin' || auth.role === 'Quản lý') return true;
  if (normEmail(r[5]) === auth.email) return true; // người tạo/giao việc
  if (r[12] === true && normEmail(r[7]) === auth.email) return true; // chủ việc cá nhân
  return false;
}

function handleUpdateTask(body) {
  var auth = requireActiveUserFull(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureCongViecSheet(ss);
  var found = findTaskRow(sh, String(body.id || ''));
  if (!found) return { ok: false, error: 'task_not_found' };
  var r = found.values;
  if (!canEditTask(auth, r)) return { ok: false, error: 'forbidden' };

  if (body.tieuDe !== undefined) {
    var tieuDe = String(body.tieuDe || '').trim();
    if (!tieuDe) return { ok: false, error: 'missing_title' };
    sh.getRange(found.row, 2).setValue(tieuDe);
  }
  if (body.moTa !== undefined) sh.getRange(found.row, 3).setValue(String(body.moTa || ''));
  if (body.hangMuc !== undefined) {
    var hangMuc = String(body.hangMuc || '');
    if (hangMuc && !getTaskCategoryOptions().some(function (c) { return c.id === hangMuc; })) return { ok: false, error: 'bad_category' };
    sh.getRange(found.row, 4).setValue(hangMuc);
  }
  if (body.mucDoUuTien !== undefined && TASK_PRIORITIES.indexOf(body.mucDoUuTien) !== -1) sh.getRange(found.row, 5).setValue(body.mucDoUuTien);
  if (body.hanChot !== undefined) {
    var hanChot = body.hanChot ? new Date(body.hanChot) : '';
    if (hanChot && isNaN(hanChot.getTime())) return { ok: false, error: 'bad_deadline' };
    sh.getRange(found.row, 11).setValue(hanChot);
  }
  // Chỉ Admin/Quản lý được đổi người thực hiện (tránh Nhân viên tự chuyển việc/né việc cho người khác).
  if (body.nguoiThucHienEmail !== undefined && r[12] !== true) {
    if (!canAssignOthers(auth.role)) return { ok: false, error: 'forbidden_assign' };
    var newAssignee = normEmail(body.nguoiThucHienEmail);
    var targetFound = findUserRow(getMainSheet(), newAssignee);
    if (!targetFound || targetFound.values[COL.ACTIVE - 1] !== true) return { ok: false, error: 'assignee_not_found' };
    sh.getRange(found.row, 8, 1, 2).setValues([[newAssignee, String(targetFound.values[COL.HOTEN - 1] || newAssignee)]]);
  }
  return { ok: true };
}

function handleUpdateTaskStatus(body) {
  var auth = requireActiveUserFull(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var trangThai = String(body.trangThai || '');
  if (TASK_STATUSES.indexOf(trangThai) === -1) return { ok: false, error: 'bad_status' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureCongViecSheet(ss);
  var found = findTaskRow(sh, String(body.id || ''));
  if (!found) return { ok: false, error: 'task_not_found' };
  var r = found.values;
  // Người được cập nhật tiến độ: người thực hiện, người giao, Admin/Quản lý.
  var canUpdate = canEditTask(auth, r) || normEmail(r[7]) === auth.email;
  if (!canUpdate) return { ok: false, error: 'forbidden' };

  var now = new Date();
  var lichSu = [];
  try { lichSu = JSON.parse(r[14] || '[]'); } catch (e) {}
  lichSu.push({ at: now.toISOString(), by: auth.email, action: 'trangthai', note: String(body.ghiChu || ''), tu: r[11], den: trangThai });
  sh.getRange(found.row, 12).setValue(trangThai);
  sh.getRange(found.row, 14).setValue(trangThai === 'Hoàn thành' ? now : '');
  sh.getRange(found.row, 15).setValue(JSON.stringify(lichSu));
  return { ok: true };
}

function handleDeleteTask(body) {
  var auth = requireActiveUserFull(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureCongViecSheet(ss);
  var found = findTaskRow(sh, String(body.id || ''));
  if (!found) return { ok: false, error: 'task_not_found' };
  if (!canEditTask(auth, found.values)) return { ok: false, error: 'forbidden' };
  sh.deleteRow(found.row);
  return { ok: true };
}

// ====== LỊCH HỌP — mỗi user dán link iCal (.ics) công khai của Google Calendar (Cài đặt lịch > "Địa chỉ bí
// mật dạng iCal" hoặc lịch Public), backend đọc/parse trực tiếp, KHÔNG cần OAuth (theo đúng lựa chọn của user).
const CAUHINH_LICH_SHEET_NAME = 'CauHinhLich';
const CAUHINH_LICH_HEADERS = ['Id', 'Email', 'TenLich', 'ICalUrl', 'KichHoat', 'ChiaSeChung', 'NgayThem'];

function ensureCauHinhLichSheet(ss) {
  var sh = ss.getSheetByName(CAUHINH_LICH_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CAUHINH_LICH_SHEET_NAME);
    sh.getRange(1, 1, 1, CAUHINH_LICH_HEADERS.length).setValues([CAUHINH_LICH_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function handleGetCalendarConfigs(body) {
  var auth = requireActiveUserFull(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureCauHinhLichSheet(ss);
  var values = sh.getDataRange().getValues();
  var isAdmin = auth.role === 'Admin';
  var calendars = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    var owner = normEmail(r[1]);
    var chiaSe = r[5] === true;
    if (!isAdmin && owner !== auth.email && !chiaSe) continue; // riêng tư của người khác thì không thấy
    calendars.push({
      id: String(r[0]), email: owner, tenLich: String(r[2] || ''),
      // Chỉ trả link iCal đầy đủ cho đúng chủ sở hữu hoặc Admin — người khác chỉ cần biết lịch chia sẻ TỒN TẠI
      // để tick xem sự kiện, không cần thấy nguyên link (link iCal thường coi là bí mật, lộ ra là người khác
      // đọc được lịch gốc trực tiếp trên Google Calendar).
      icalUrl: (isAdmin || owner === auth.email) ? String(r[3] || '') : '',
      kichHoat: r[4] === true, chiaSeChung: chiaSe, laCuaToi: owner === auth.email
    });
  }
  return { ok: true, calendars: calendars };
}

function handleSaveCalendarConfig(body) {
  var auth = requireActiveUserFull(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var icalUrl = String(body.icalUrl || '').trim();
  var tenLich = String(body.tenLich || '').trim() || 'Lịch của tôi';
  if (!/^https?:\/\//i.test(icalUrl)) return { ok: false, error: 'bad_url' };
  var chiaSeChung = !!body.chiaSeChung;
  // Chỉ Admin/Quản lý được đánh dấu "chia sẻ chung" (mọi người đều thấy sự kiện) — Nhân viên xử lý/Nhân viên
  // chỉ tạo được lịch riêng của mình (chỉ họ + Admin thấy), tránh loạn lịch chung do ai cũng thêm được.
  if (chiaSeChung && !canAssignOthers(auth.role)) chiaSeChung = false;

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureCauHinhLichSheet(ss);
  var id = String(body.id || '');
  if (id) {
    var values = sh.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < values.length; i++) { if (String(values[i][0]) === id) { rowIdx = i + 1; break; } }
    if (rowIdx === -1) return { ok: false, error: 'calendar_not_found' };
    var ownerEmail = normEmail(values[rowIdx - 1][1]);
    if (ownerEmail !== auth.email && auth.role !== 'Admin') return { ok: false, error: 'forbidden' };
    sh.getRange(rowIdx, 3, 1, 4).setValues([[tenLich, icalUrl, body.kichHoat !== false, chiaSeChung]]);
    invalidateCalendarCache();
    return { ok: true, id: id };
  }
  var newId = Utilities.getUuid();
  sh.appendRow([newId, auth.email, tenLich, icalUrl, true, chiaSeChung, new Date()]);
  invalidateCalendarCache();
  return { ok: true, id: newId };
}

function handleDeleteCalendarConfig(body) {
  var auth = requireActiveUserFull(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureCauHinhLichSheet(ss);
  var values = sh.getDataRange().getValues();
  var rowIdx = -1, ownerEmail = '';
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(body.id || '')) { rowIdx = i + 1; ownerEmail = normEmail(values[i][1]); break; }
  }
  if (rowIdx === -1) return { ok: false, error: 'calendar_not_found' };
  if (ownerEmail !== auth.email && auth.role !== 'Admin') return { ok: false, error: 'forbidden' };
  sh.deleteRow(rowIdx);
  invalidateCalendarCache();
  return { ok: true };
}

// Cache tổng hợp sự kiện lịch họp 5 phút (tương tự cơ chế cache Gemini/Xaphuong đã dùng trong file này) — vì
// UrlFetchApp đọc iCal của nhiều người có thể chậm nếu gọi lại mỗi lần mở trang. Dùng 1 cache key CHUNG (không
// theo từng email) vì danh sách lịch chia sẻ chung ảnh hưởng tới nhiều người — join bảng quyền xem lại ở bước
// lọc kết quả (KHÔNG cache riêng theo từng user) để tránh cache bùng nổ theo số lượng nhân viên.
function invalidateCalendarCache() { CacheService.getScriptCache().remove('calevents_all_v1'); }

function handleGetCalendarEvents(body) {
  var auth = requireActiveUserFull(body.token);
  if (auth.error) return { ok: false, error: auth.error };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureCauHinhLichSheet(ss);
  var values = sh.getDataRange().getValues();
  var cache = CacheService.getScriptCache();
  var allEventsByCalId = {};
  var cached = cache.get('calevents_all_v1');
  if (cached) {
    try { allEventsByCalId = JSON.parse(cached); } catch (e) { allEventsByCalId = {}; }
  }
  var needCache = false;
  var rangeStart = new Date();
  var rangeEnd = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // cửa sổ 60 ngày tới

  var visibleCalendars = [];
  var isAdmin = auth.role === 'Admin';
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0] || r[4] !== true) continue; // bỏ qua lịch đã tắt (KichHoat=false)
    var owner = normEmail(r[1]);
    var chiaSe = r[5] === true;
    if (!isAdmin && owner !== auth.email && !chiaSe) continue;
    visibleCalendars.push({ id: String(r[0]), email: owner, tenLich: String(r[2] || ''), url: String(r[3] || '') });
  }

  var events = [];
  visibleCalendars.forEach(function (cal) {
    var raw = allEventsByCalId[cal.id];
    if (!raw) {
      needCache = true;
      try {
        var resp = UrlFetchApp.fetch(cal.url, { muteHttpExceptions: true, followRedirects: true });
        if (resp.getResponseCode() === 200) {
          var parsed = parseICS(resp.getContentText());
          raw = expandICSEvents(parsed, rangeStart, rangeEnd);
        } else { raw = []; }
      } catch (e) { raw = []; }
      allEventsByCalId[cal.id] = raw;
    }
    raw.forEach(function (ev) {
      events.push(Object.assign({}, ev, { calendarId: cal.id, calendarName: cal.tenLich, calendarOwner: cal.email }));
    });
  });

  if (needCache) cache.put('calevents_all_v1', JSON.stringify(allEventsByCalId), 300);
  events.sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
  return { ok: true, events: events };
}

// ---- Parser iCal (.ics) tối giản — đủ dùng cho lịch họp Google Calendar: unfold dòng gấp theo RFC5545, tách
// từng VEVENT, đọc SUMMARY/DTSTART/DTEND/LOCATION/RRULE. KHÔNG hỗ trợ đầy đủ chuẩn iCal (VD EXDATE, múi giờ
// phức tạp...) — đủ tốt cho nhu cầu xem lịch họp sắp tới, không phải app lịch đầy đủ tính năng.
function unfoldICSLines(text) {
  var rawLines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  var lines = [];
  rawLines.forEach(function (line) {
    if ((line[0] === ' ' || line[0] === '\t') && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  });
  return lines;
}
function parseICSDate(raw) {
  // raw dạng "20260720T090000Z" (UTC), "20260720T090000" (giờ địa phương/floating) hoặc "20260720" (cả ngày).
  var s = String(raw || '').trim();
  var m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  var y = +m[1], mo = +m[2] - 1, d = +m[3];
  if (!m[4]) return { date: new Date(y, mo, d), allDay: true };
  var hh = +m[4], mi = +m[5], ss = +m[6];
  if (m[7] === 'Z') return { date: new Date(Date.UTC(y, mo, d, hh, mi, ss)), allDay: false };
  return { date: new Date(y, mo, d, hh, mi, ss), allDay: false }; // floating/TZID: coi như giờ địa phương script
}
function parseICSPropLine(line) {
  var colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  var left = line.slice(0, colonIdx);
  var value = line.slice(colonIdx + 1);
  var semiIdx = left.indexOf(';');
  var name = (semiIdx === -1 ? left : left.slice(0, semiIdx)).toUpperCase();
  return { name: name, value: value };
}
function parseICS(text) {
  var lines = unfoldICSLines(text);
  var events = [];
  var cur = null;
  lines.forEach(function (line) {
    var trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') { cur = { summary: '', location: '', description: '', dtstart: '', dtend: '', rrule: '', allDay: false }; return; }
    if (trimmed === 'END:VEVENT') { if (cur) events.push(cur); cur = null; return; }
    if (!cur) return;
    var prop = parseICSPropLine(trimmed);
    if (!prop) return;
    if (prop.name === 'SUMMARY') cur.summary = prop.value.replace(/\\,/g, ',').replace(/\\n/gi, ' ');
    else if (prop.name === 'LOCATION') cur.location = prop.value.replace(/\\,/g, ',');
    else if (prop.name === 'DESCRIPTION') cur.description = prop.value.replace(/\\n/gi, ' ').replace(/\\,/g, ',');
    else if (prop.name === 'DTSTART') cur.dtstart = prop.value;
    else if (prop.name === 'DTEND') cur.dtend = prop.value;
    else if (prop.name === 'RRULE') cur.rrule = prop.value;
  });
  return events;
}
// Khai triển sự kiện lặp lại (RRULE) trong khoảng [rangeStart, rangeEnd] — chỉ hỗ trợ FREQ=DAILY/WEEKLY/MONTHLY
// kèm INTERVAL/COUNT/UNTIL cơ bản, giới hạn tối đa 300 lần lặp/sự kiện để tránh vòng lặp vô hạn.
function expandICSEvents(rawEvents, rangeStart, rangeEnd) {
  var out = [];
  rawEvents.forEach(function (ev) {
    var st = parseICSDate(ev.dtstart);
    if (!st) return;
    var en = parseICSDate(ev.dtend);
    var durationMs = en ? (en.date.getTime() - st.date.getTime()) : (60 * 60 * 1000);
    if (!ev.rrule) {
      if (st.date >= rangeStart && st.date <= rangeEnd) {
        out.push({ title: ev.summary, start: st.date.toISOString(), end: new Date(st.date.getTime() + durationMs).toISOString(), allDay: st.allDay, location: ev.location });
      }
      return;
    }
    var parts = {};
    ev.rrule.split(';').forEach(function (p) { var kv = p.split('='); if (kv.length === 2) parts[kv[0].toUpperCase()] = kv[1]; });
    var freq = parts.FREQ; var interval = parseInt(parts.INTERVAL || '1', 10) || 1;
    var count = parts.COUNT ? parseInt(parts.COUNT, 10) : null;
    var until = parts.UNTIL ? (parseICSDate(parts.UNTIL) || {}).date : null;
    if (!freq) return;
    var occ = new Date(st.date.getTime());
    var n = 0;
    while (occ <= rangeEnd && n < 300) {
      if (count !== null && n >= count) break;
      if (until && occ > until) break;
      if (occ >= rangeStart) {
        out.push({ title: ev.summary, start: occ.toISOString(), end: new Date(occ.getTime() + durationMs).toISOString(), allDay: st.allDay, location: ev.location });
      }
      if (freq === 'DAILY') occ = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate() + interval, occ.getHours(), occ.getMinutes(), occ.getSeconds());
      else if (freq === 'WEEKLY') occ = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate() + 7 * interval, occ.getHours(), occ.getMinutes(), occ.getSeconds());
      else if (freq === 'MONTHLY') occ = new Date(occ.getFullYear(), occ.getMonth() + interval, occ.getDate(), occ.getHours(), occ.getMinutes(), occ.getSeconds());
      else break; // FREQ khác (YEARLY, hiếm gặp cho lịch họp) — bỏ qua, không khai triển
      n++;
    }
  });
  return out;
}
