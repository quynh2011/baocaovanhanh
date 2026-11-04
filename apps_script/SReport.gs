/**
 * [S]-Report — tự lấy "Siêu báo cáo" (file bao-cao-bc-TNT-YYYY-MM-DD.html) từ Google Drive vào Google Sheet này,
 * để web baocaovanhanh.vercel.app (nút [S]-Report) đọc qua Sheets API.
 *
 * Gắn vào Google Sheet: "[S]-Report — Dữ liệu Siêu báo cáo"
 *   https://docs.google.com/spreadsheets/d/1He6ycTpoJMFr1fHGMEYuV0YmyH_Y5Id_3BfeBw7BQoU/edit
 * Chạy dưới tài khoản quynhpv1@ghn.vn (tài khoản thấy được folder Drive nguồn).
 *
 * CÀI ĐẶT (1 lần): Tiện ích mở rộng > Apps Script > dán file này > Lưu > chọn hàm caiDat > Chạy > Cho phép.
 *   caiDat() tạo trigger chạy MỖI GIỜ + lấy dữ liệu ngay lần đầu.
 *
 * QUY TẮC CHỌN FILE: lấy file có ngày (trong tên) MỚI NHẤT nhưng NHỎ HƠN hôm nay (giờ VN).
 *   Ví dụ hôm nay 04/11 → lấy file 2026-11-03. Nếu chưa có file nào < hôm nay thì lấy file mới nhất.
 *   File không đổi (cùng ID + cùng giờ sửa) thì bỏ qua, không ghi lại.
 *
 * LƯU TRỮ: sheet SR_Html cột A = nội dung HTML cắt thành từng đoạn 40.000 ký tự (mỗi ô Sheets tối đa 50.000),
 *   mỗi đoạn có tiền tố "~" (tránh Sheets hiểu nhầm đoạn bắt đầu bằng "=" là công thức). SR_Meta = thông tin file.
 *   SR_Log = nhật ký mỗi lần cập nhật.
 */
var SR_FOLDER_ID = '1PY10hBt2V93tfUPPNyNPg4h-e8JDBPB_';
var SR_NAME_RE = /bao-cao-bc-.*?(\d{4}-\d{2}-\d{2})\.html$/i;
var SR_CHUNK = 40000;
var SR_TZ = 'Asia/Ho_Chi_Minh';

function caiDat() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'capNhatSReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('capNhatSReport').timeBased().everyHours(1).create();
  capNhatSReport(true);
}

function capNhatSReport(force) {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById('1He6ycTpoJMFr1fHGMEYuV0YmyH_Y5Id_3BfeBw7BQoU');
  var meta = layHoacTaoSheet_(ss, 'SR_Meta');
  var html = layHoacTaoSheet_(ss, 'SR_Html');
  var log = layHoacTaoSheet_(ss, 'SR_Log');
  if (log.getLastRow() === 0) log.appendRow(['Thời gian', 'File', 'Ngày file', 'Số đoạn', 'Ký tự', 'Kết quả']);
  var now = new Date();
  try {
    var today = Utilities.formatDate(now, SR_TZ, 'yyyy-MM-dd');
    var files = DriveApp.getFolderById(SR_FOLDER_ID).getFiles();
    var best = null, newest = null;
    while (files.hasNext()) {
      var f = files.next();
      var m = f.getName().match(SR_NAME_RE);
      if (!m || f.isTrashed()) continue;
      var item = { f: f, d: m[1] };
      if (!newest || item.d > newest.d) newest = item;
      if (item.d < today && (!best || item.d > best.d)) best = item;
    }
    var pick = best || newest;
    if (!pick) throw new Error('Không thấy file bao-cao-bc-*.html nào trong folder');
    var cur = docMeta_(meta);
    var modified = pick.f.getLastUpdated().getTime();
    if (force !== true && cur.fileId === pick.f.getId() && Number(cur.fileModifiedMs) === modified) return; // không đổi

    var text = pick.f.getBlob().getDataAsString('UTF-8');
    var chunks = [];
    for (var i = 0; i < text.length; i += SR_CHUNK) chunks.push(['~' + text.substr(i, SR_CHUNK)]);

    html.clearContents();
    html.getRange(1, 1, Math.max(chunks.length, 1), 1).setNumberFormat('@');
    for (var s = 0; s < chunks.length; s += 20) {
      var part = chunks.slice(s, s + 20);
      html.getRange(s + 1, 1, part.length, 1).setValues(part);
      SpreadsheetApp.flush();
    }
    var rows = [
      ['fileName', pick.f.getName()],
      ['fileId', pick.f.getId()],
      ['fileDate', pick.d],
      ['fileModified', Utilities.formatDate(new Date(modified), SR_TZ, 'yyyy-MM-dd HH:mm:ss')],
      ['fileModifiedMs', String(modified)],
      ['chars', String(text.length)],
      ['chunks', String(chunks.length)],
      ['chunkSize', String(SR_CHUNK)],
      ['updatedAt', Utilities.formatDate(now, SR_TZ, 'yyyy-MM-dd HH:mm:ss')],
      ['status', 'OK']
    ];
    meta.clearContents();
    meta.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
    log.appendRow([Utilities.formatDate(now, SR_TZ, 'yyyy-MM-dd HH:mm:ss'), pick.f.getName(), pick.d, chunks.length, text.length, 'OK']);
  } catch (e) {
    var cur2 = docMeta_(meta);
    var rows2 = Object.keys(cur2).map(function (k) { return [k, cur2[k]]; }).filter(function (r) { return r[0] !== 'status' && r[0] !== 'lastError'; });
    rows2.push(['status', 'LỖI']);
    rows2.push(['lastError', Utilities.formatDate(now, SR_TZ, 'yyyy-MM-dd HH:mm:ss') + ' — ' + e.message]);
    meta.clearContents();
    meta.getRange(1, 1, rows2.length, 2).setNumberFormat('@').setValues(rows2);
    log.appendRow([Utilities.formatDate(now, SR_TZ, 'yyyy-MM-dd HH:mm:ss'), '', '', '', '', 'LỖI: ' + e.message]);
  }
}

function docMeta_(sh) {
  var o = {};
  if (sh.getLastRow() === 0) return o;
  sh.getRange(1, 1, sh.getLastRow(), 2).getValues().forEach(function (r) { if (r[0]) o[String(r[0])] = String(r[1]); });
  return o;
}

function layHoacTaoSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
