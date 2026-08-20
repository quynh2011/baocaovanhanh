/* ============================================================================================
   ĐỐI SOÁT VẬN TẢI (NCC <-> GHN) — backend riêng cho mục "Đối soát vận tải".
   Dùng lại các hàm cấp thấp (getValues/batchGetValues/batchUpdateValues/putValues/getSheetTitles/
   verifyToken) từ api/_sheetsClient.js — file đó KHÔNG bị sửa gì cả, chỉ import ra dùng, nên không
   có rủi ro ảnh hưởng các tính năng khác (đăng nhập báo cáo vận hành, Kế hoạch KD, BCKQKD…) đang
   chạy ổn định.

   Sheet dữ liệu đối soát ("ĐỐI SOÁT XE TẢI - LDBB") là 1 Google Sheet RIÊNG, khác hẳn sheet báo cáo
   vận hành chính — nhưng cùng tài khoản quynhpv1@ghn.vn sở hữu/chỉnh sửa nên dùng chung access token
   OAuth đã cấu hình sẵn trên Vercel (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN), không cần cấp
   quyền gì thêm. Đăng nhập cũng dùng chung action "login" (cùng tài khoản nhân viên @ghn.vn).

   Đọc valueRenderOption=FORMATTED_VALUE (thay vì UNFORMATTED_VALUE như các action khác) để số/ngày/%
   trả về đúng dạng chuỗi hiển thị giống hệt lúc export CSV thủ công trước đây — toàn bộ logic đối
   soát ở phía trình duyệt (doi_soat_van_tai.js, port từ bản offline đã test khớp 100% với Python)
   được viết dựa trên đúng định dạng chuỗi này.

   ĐỢT 2026-08-20: thêm handleSyncTongHop — tự động điền/cập nhật sheet "Tổng hợp" bằng cách gộp
   dữ liệu từ TẤT CẢ các sheet GHN_* (mỗi NCC 1 sheet), khớp/ghi đè theo "Mã chuyến" (idempotent —
   gọi lại nhiều lần không tạo trùng dòng). Mapping cột (đã đối chiếu số liệu thật khớp 100% với 1
   bản dữ liệu đã export trước đó — xem lịch sử trò chuyện):
     Tổng hợp!A  Tên NCC          <- Main (tra theo Sheet Name GHN)
     Tổng hợp!B  Ngày kết thúc    <- GHN!Ngày kết thúc
     Tổng hợp!C  Biển số xe       <- GHN!Biển số xe
     Tổng hợp!D  Tải trọng        <- GHN!Tải trọng
     Tổng hợp!E  Hình thức tính giá <- GHN!Hình thức tính giá
     Tổng hợp!F  Lộ trình kết thúc  <- GHN!Lộ trình kết thúc
     Tổng hợp!G  Số km            <- GHN!Số km
     Tổng hợp!H  Đơn giá          <- GHN!Đơn giá
     Tổng hợp!I  Phí cầu đường    <- GHN!Phí cầu đường
     Tổng hợp!J  Phí dừng tải     <- GHN!Phí dừng tải
     Tổng hợp!K  Tỉ lệ Ontime     <- GHN!Tỉ lệ Ontime
     Tổng hợp!L  Tổng chi phí (chưa VAT) <- GHN!Số tiền
     Tổng hợp!M  Tổng chi phí (đã VAT)   <- L * 1,08 (tự tính)
     Tổng hợp!N  Mã tuyến         <- GHN!Mã tuyến
     Tổng hợp!O  Mã chuyến        <- GHN!Mã chuyến (KHOÁ để khớp/ghi đè dòng)
     Tổng hợp!P  Ghi chú          <- GHN!Ghi chú
     Tổng hợp!Q  KHO              <- GHN!Cụm Linehaul (cột Z sheet GHN)
     Tổng hợp!R  Loại chuyến      <- GHN!Loại chuyến (cột P sheet GHN)
     Tổng hợp!S  Người Quản lý    <- Main, dòng có cột E = "Người Quản lý", lấy cột F
     Tổng hợp!T  Người Nhập       <- Main, dòng có cột E = "Người Nhập", lấy cột F
     Tổng hợp!U  Loại tuyến       <- GHN!Loại tuyến (cột O sheet GHN)
     Tổng hợp!V  Ngày Bắt Đầu     <- GHN!Ngày bắt đầu (cột AA sheet GHN)
   ============================================================================================ */
const { getValues, batchGetValues, batchUpdateValues, putValues, getSheetTitles, verifyToken } = require('./_sheetsClient.js');

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

// "1.234,56" (kiểu Việt Nam) -> 1234.56 (number). Rỗng/không hợp lệ -> 0.
function parseVNNum(s) {
  if (s === null || s === undefined) return 0;
  s = String(s).trim();
  if (!s) return 0;
  s = s.replace(/./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// number -> chuỗi kiểu Việt Nam (phẩy thập phân), bỏ .00 nếu là số nguyên — giống định dạng đang
// có sẵn trong sheet (vd "397197" / "428972,76").
function formatVNMoney(n) {
  if (!isFinite(n)) return '';
  var rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return rounded.toFixed(2).replace('.', ',');
}

// Dựng 1 dòng cho sheet "Tổng hợp" (22 cột, A..V) từ 1 dòng dữ liệu của sheet GHN_<NCC>.
// idx: map "Tên cột header GHN" -> vị trí (0-based) trong row, dựng sẵn từ header thật của sheet đó
// (không hardcode theo số thứ tự cột, để không vỡ nếu ai đó chèn/xoá cột trong GHN_* sau này).
function buildTongHopRow(tenNCC, idx, row, nguoiQuanLy, nguoiNhap) {
  function g(name) {
    var i = idx[name];
    return (i === undefined || row[i] === undefined) ? '' : row[i];
  }
  var soTien = g('Số tiền');
  var vatVal = parseVNNum(soTien) * 1.08;
  return [
    tenNCC, g('Ngày kết thúc'), g('Biển số xe'), g('Tải trọng'), g('Hình thức tính giá'),
    g('Lộ trình kết thúc'), g('Số km'), g('Đơn giá'), g('Phí cầu đường'), g('Phí dừng tải'),
    g('Tỉ lệ Ontime'), soTien, formatVNMoney(vatVal), g('Mã tuyến'), g('Mã chuyến'),
    g('Ghi chú'), g('Cụm Linehaul'), g('Loại chuyến'), nguoiQuanLy, nguoiNhap,
    g('Loại tuyến'), g('Ngày bắt đầu')
  ];
}

// Gộp dữ liệu từ tất cả sheet GHN_* vào sheet "Tổng hợp", khớp/ghi đè theo Mã chuyến (idempotent).
// Được gọi tự động từ trình duyệt mỗi khi trang Đối soát vận tải tải/làm mới dữ liệu — nên "Tổng
// hợp" luôn theo kịp thay đổi bên các sheet GHN_* mà không cần thao tác tay.
async function handleSyncTongHop(body) {
  const email = verifyToken(body && body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  try {
    const allTitles = await getSheetTitles(RECON_SHEET_ID);
    const ghnTitles = allTitles.filter(function (t) { return t.indexOf('GHN_') === 0; });
    const wanted = ['Main', 'Tổng hợp'].concat(ghnTitles);
    const valueRanges = await batchGetValues(RECON_SHEET_ID, wanted, { valueRenderOption: 'FORMATTED_VALUE' });
    const raw = {};
    wanted.forEach(function (name, i) { raw[name] = (valueRanges[i] && valueRanges[i].values) || []; });

    const mainRows = raw['Main'] || [];
    const mainHeader = mainRows[0] || [];
    const idxTenNCC = mainHeader.indexOf('Tên NCC');
    const idxSheetGhn = mainHeader.indexOf('Sheet Name GHN');
    const ghnSheetToTenNCC = {};
    for (var i = 1; i < mainRows.length; i++) {
      var mr = mainRows[i];
      if (!mr || idxSheetGhn < 0 || !mr[idxSheetGhn]) continue;
      ghnSheetToTenNCC[String(mr[idxSheetGhn]).trim()] = (idxTenNCC >= 0 ? mr[idxTenNCC] : '') || '';
    }
    // Cấu hình "Người Quản lý" / "Người Nhập": nằm ở cột E/F sheet Main, dạng nhãn:giá trị theo dòng
    // (không cố định số thứ tự dòng, chỉ tìm đúng nhãn để không vỡ nếu ai đó chèn thêm dòng khác).
    var nguoiQuanLy = '', nguoiNhap = '';
    mainRows.forEach(function (r) {
      if (!r) return;
      var nhan = String(r[4] || '').trim();
      var giaTri = r[5] || '';
      if (nhan === 'Người Quản lý') nguoiQuanLy = giaTri;
      if (nhan === 'Người Nhập') nguoiNhap = giaTri;
    });

    var desired = [];
    ghnTitles.forEach(function (sheetName) {
      var rows = raw[sheetName] || [];
      if (!rows.length) return;
      var header = rows[0] || [];
      var idx = {};
      header.forEach(function (h, i) { idx[String(h || '').trim()] = i; });
      var tenNCC = ghnSheetToTenNCC[sheetName] || sheetName.replace('GHN_', '');
      for (var r = 1; r < rows.length; r++) {
        var row = rows[r];
        if (!row || !row.length) continue;
        var iMa = idx['Mã chuyến'];
        var maChuyen = iMa !== undefined ? (row[iMa] || '') : '';
        maChuyen = String(maChuyen).trim();
        if (!maChuyen) continue;
        desired.push({ maChuyen: maChuyen, row: buildTongHopRow(tenNCC, idx, row, nguoiQuanLy, nguoiNhap) });
      }
    });

    var tongHopRows = raw['Tổng hợp'] || [];
    var tongHopHeader = tongHopRows[0] || [];
    var colMa = tongHopHeader.findIndex(function (h) { return String(h || '').trim() === 'Mã chuyến'; });
    if (colMa < 0) colMa = 14; // cột O — dự phòng nếu không dò được đúng tên header
    var existingRowByMa = {};
    for (var j = 1; j < tongHopRows.length; j++) {
      var trow = tongHopRows[j];
      var ma = trow && trow[colMa];
      if (ma) existingRowByMa[String(ma).trim()] = j + 1; // số dòng thật trên sheet (1-indexed, j=0 la header)
    }

    var updates = [];
    var newRows = [];
    desired.forEach(function (d) {
      var existingRow = existingRowByMa[d.maChuyen];
      if (existingRow) {
        updates.push({ range: "'Tổng hợp'!A" + existingRow + ':V' + existingRow, values: [d.row] });
      } else {
        newRows.push(d.row);
      }
    });

    if (updates.length) await batchUpdateValues(RECON_SHEET_ID, updates);
    if (newRows.length) {
      var nextRow = tongHopRows.length + 1;
      await putValues(RECON_SHEET_ID, "'Tổng hợp'!A" + nextRow + ':V' + (nextRow + newRows.length - 1), newRows);
    }

    return { ok: true, updated: updates.length, added: newRows.length, total: desired.length };
  } catch (e) {
    return { ok: false, error: 'sync_tonghop_that_bai', detail: String(e && e.message || e) };
  }
}

module.exports = { handleGetReconData, handleSyncTongHop };
