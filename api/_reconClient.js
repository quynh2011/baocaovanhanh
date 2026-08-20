/* ============================================================================================
   ĐỐI SOÁT VẬN TẢI (NCC <-> GHN) — backend riêng cho mục "Đối soát vận tải".
   Đọc dữ liệu thô từ các sheet GHN_* + Main + Tổng hợp trong file Google Sheet đối soát, và
   ghi ngược kết quả tổng hợp (khớp theo "Mã chuyến") vào sheet "Tổng hợp".
   ĐỢT 2026-08-20: thêm handleSyncTongHop — tự động điền/cập nhật sheet "Tổng hợp" bằng cách gộp
   dữ liệu từ TẤT CẢ các sheet GHN_* (mỗi NCC 1 sheet), khớp/ghi đè theo "Mã chuyến" (idempotent).
   ============================================================================================ */
const { getValues, batchGetValues, batchUpdateValues, putValues, getSheetTitles, verifyToken } = require('./_sheetsClient.js');

const RECON_SHEET_ID = '1cuj2EuZfuglithQCCknx1tMl6Uwl14GtWnPBlDSLv8Y';

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

function parseVNNum(s) {
  if (s === null || s === undefined) return 0;
  s = String(s).trim();
  if (!s) return 0;
  s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function formatVNMoney(n) {
  if (!isFinite(n)) return '';
  var rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return rounded.toFixed(2).replace('.', ',');
}

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
    if (colMa < 0) colMa = 14;
    var existingRowByMa = {};
    for (var j = 1; j < tongHopRows.length; j++) {
      var trow = tongHopRows[j];
      var ma = trow && trow[colMa];
      if (ma) existingRowByMa[String(ma).trim()] = j + 1;
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
