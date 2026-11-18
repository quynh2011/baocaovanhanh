// ==UserScript==
// @name         Modul 6 - Tuyến Giao (bản đồ ranh giới phường + sản lượng BC)
// @namespace    http://tampermonkey.net/
// @version      1.7.47
// @description  Bản đồ ranh giới xã/phường CŨ + MỚI (sau sáp nhập 2025), tô màu theo bưu cục / theo sản lượng, ranh giới lãnh thổ bưu cục, nhãn tên bật/tắt, panel thông tin cố định góc bản đồ, bấm phường MỚI xem gộp dữ liệu phường cũ, tab Theo Nhân Viên lấy sản lượng trực tiếp từ GHN (lọc ngày/bưu cục/nhân viên/nhóm khách hàng, tìm bưu cục, nút Dừng), chấm cảnh báo nhân viên nhấp nháy trên bản đồ (quá tải lấy/giao, không đủ đơn — tính trên TỔNG đơn giao cả tuyến), tự động tải trực tiếp từ quyhoachbuucuc.info có dự phòng offline, phân quyền 3 cấp ADMIN/Quản lý/Nhân viên xử lý theo bưu cục — modul HOÀN TOÀN ĐỘC LẬP, chưa gộp vào Báo cáo GTC.
// @author       Enhanced Team
// @match        https://nhanh.ghn.vn/lastmile*
// @match        https://www.quyhoachbuucuc.info/*
// @grant        GM_xmlhttpRequest
// @grant        GM_cookie
// @connect      www.quyhoachbuucuc.info
// @connect      baocaovanhanh.vercel.app
// @connect      router.project-osrm.org
// @require      https://cdn.jsdelivr.net/npm/maplibre-gl@5.3.0/dist/maplibre-gl.js
// @require      https://cdn.jsdelivr.net/npm/@turf/turf@6.5.0/turf.min.js
// ==/UserScript==
//
// ========================= CHANGELOG (BẢN TEST — CHƯA PUSH GIT) =========================
// v1.7.44 — Tên khu vực AM trên bản đồ: chữ đen, bỏ chữ "AM" (chỉ còn họ tên + số BC).
// v1.7.43 — "Xem theo: AM": tô màu xã/phường theo AM quản lý (mỗi AM 1 màu), viền đậm + tên AM từng khu vực ("AM … · n BC"), bảng khu vực có chấm màu AM → chọn 1 tỉnh là thấy ngay khu vực của từng AM.
// v1.7.42 — 3 ô lọc Tỉnh / AM / Bưu cục hiện NGAY khi mở (trước phải chờ tải xong dữ liệu mới có ô → chỉ thấy vạch trống + dấu ✕); nút ✕ ghi rõ "✕ Bỏ lọc".
// v1.7.41 — Lọc Tỉnh / AM / Bưu cục CHỌN NHIỀU (kiểu [S]-Report): ô hiện "☑ Tất cả N …", bấm ra danh sách tick + ô tìm (không dấu), Chọn tất cả / Bỏ chọn tất cả / Áp dụng (n), "chỉ … này". state.qhTinh/qhAm/qhBc thành MẢNG (rỗng = tất cả).
// v1.7.40 — FIX nút "✖ Bỏ chọn": trước chỉ reset lớp hiển thị nên đang lọc Tỉnh/AM/Bưu cục bấm vào không thấy gì thay đổi. Nay xoá cả lọc Tỉnh/AM/BC, ô tìm, xã/phường đang chọn trong bản nháp rồi đưa bản đồ về toàn vùng.
// v1.7.39 — Nhãn kiểm tra cơ cấu ("Đã xác thực" / "N thay đổi cơ cấu") chuyển lên hàng tab cạnh "Theo Nhân Viên".
// v1.7.38 — Nút "📝 Bản nháp quy hoạch" tô màu cam nổi bật (đang xem nháp: tím).
// v1.7.37 — Mọi thông báo / xác nhận dùng popup riêng (`qhDialog_`/`qhAlert_`/`qhConfirm_`, thay alert/confirm của trình duyệt). Bản nháp: nút "＋ AM mới" (`qhdNewAm_`) nhập ID + Họ tên AM chưa có trong cơ cấu → "ID - Họ tên" (trùng ID thì dùng AM có sẵn).
// v1.7.36 — Bản nháp: mở 1 bản nháp là CẢ BẢN ĐỒ + bộ lọc Tỉnh / AM / Bưu cục + ô tìm + bảng khu vực + viền chạy theo bản nháp (qhOrgV_/qhdBuildOrg_; BC mới có trong danh sách, BC bị gộp hết thì biến mất); nút — thu nhỏ bảng nháp để xem cả vùng, nút trên thanh công cụ ghi "Đang xem nháp: …".
// v1.7.35 — Bản nháp: chọn AM ngay khi tạo bưu cục mới (ô #qhd-newam, để trống = AM nhiều đơn nhất) + đổi AM ở danh sách BC mới (data-nham).
// v1.7.34 — BẢN NHÁP QUY HOẠCH (nút "📝 Bản nháp" trên thanh công cụ, chạy cả Tampermonkey + web): thử gộp mà KHÔNG
//     đụng quy hoạch thật — (1) gộp các bưu cục cho 1 AM / quy hoạch mới, (2) gộp thêm xã/phường vào 1 bưu cục có sẵn,
//     (3) gộp xã/phường của nhiều bưu cục thành 1 bưu cục mới. Bấm bản đồ chọn xã/phường (bấm chấm BC = cả BC), tô màu theo
//     bản nháp, viền đỏ đứt = xã/phường đổi BC, viền tím = ranh giới AM mới. Bảng so sánh trước → sau theo BC và AM: số xã/
//     phường, diện tích, giao/lấy, nhân sự hiện có, định biên cần (đơn giao ÷ 70 xã / 90 phường), thiếu/thừa, khoảng cách tới
//     BC. Lưu CHUNG lên sheet của web báo cáo (qhDraftList/qhDraftSave/qhDraftDelete) — ai cũng xem, Admin + Quản lý mới sửa
//     (Tampermonkey xác thực bằng token GHN → quyền ADMIN/QUAN_LY của modul). Hàm tiền tố qhd*.
// v1.7.33 — KIỂM TRA CƠ CẤU: so cơ cấu bưu cục (sheet tự cập nhật tay) với cơ cấu HỆ THỐNG (bảng GTC tổng, AM ngày mới nhất)
//   → nhãn cạnh ô lọc: tick xanh "Đã xác thực" hoặc tam giác vàng "N thay đổi cơ cấu — bấm xem" (BC mới chưa có trong cơ cấu,
//   BC đổi AM). Thêm ô TÌM NHANH gõ tên tỉnh / AM / mã AM / bưu cục.
// v1.7.32 — LỚP TỈNH / AM / BƯU CỤC (trước chỉ có trên web báo cáo) đưa vào chính modul: chọn Tỉnh / AM / Bưu cục → bản đồ
//   làm nổi khu vực quản lý (xã/phường do các BC đó giao), mờ phần còn lại, viền cam cả khu vực + viền từng BC, bảng BC.
//   AM / Tỉnh lấy theo CƠ CẤU BƯU CỤC của web báo cáo (action qhCocau: Mã BC = hub_code, AM ghi "ID - Họ tên").
// v1.7.31 — v1.7.30 báo "khong_co_cookie": GM_cookie.list({url}) trả rỗng → thử lần lượt nhiều cách lọc (url, domain có/không www,
//   lấy hết rồi lọc theo tên miền) + đọc document.cookie khi đang ở trang quyhoachbuucuc.info; chẩn đoán ghi rõ đã thử gì.
// v1.7.30 — SỬA v1.7.29 báo "the URL needs to be included by the scripts @include or @match tag": GM_cookie chỉ đọc được
//   cookie của trang có trong @match → thêm @match www.quyhoachbuucuc.info (trên trang đó script KHÔNG chạy gì, thoát ngay).
// v1.7.29 — WEB BÁO CÁO TỰ ĐỒNG BỘ: mỗi lần tải trực tiếp thành công, gửi phiên đăng nhập quyhoachbuucuc.info
//   (cookie, đọc bằng GM_cookie) lên máy chủ web báo cáo (action qhSaveSid, tối đa 1 lần/2 giờ) để máy chủ tự tải
//   + gộp vùng + ghi Drive giống hệt bản này, kể cả khi không ai mở Tampermonkey. Máy chủ chỉ lưu khi phiên tải được dữ liệu thật.
// v1.7.28 — NHIỀU VÙNG: trước đây mỗi lần tự đồng bộ (mở modul) GHI ĐÈ toàn bộ backup Drive bằng đúng vùng tài khoản
//   đang xem trên quyhoachbuucuc.info → vùng khác (vd TNT) bị xoá. Nay tải trực tiếp xong thì đọc thêm backup Drive,
//   GỘP theo vùng (regionMergeData_: vùng vừa tải trực tiếp thay mới, các vùng khác trong backup giữ nguyên) rồi mới
//   hiển thị + ghi ngược lên Drive → bản đồ và Drive luôn đủ mọi vùng.
// v1.7.27 — NGUYÊN NHÂN ĐÃ XÁC NHẬN (phản hồi API get-trip-items thật 16/11): GHN che senderContact/receiverContact
//  (chỉ còn tên/SĐT "*******"), vị trí nằm ở pickInfo / deliverInfo / returnInfo (wardName, districtName,
//  cityName, lat, lng; không có wardCode). locFromItem_ đọc thẳng đúng khối theo loại đơn PICK/DELIVER/RETURN.
// v1.7.26 — Chẩn đoán thật (THN Phan Đình Phùng 15/11): 2334 đơn giao KHÔNG khớp, mã/tên xã/địa chỉ đều RỖNG,
//  có "GPS" nhưng không nằm trong ranh giới nào → thêm locFromItem_ (dò toàn bộ đơn tìm toạ độ/mã/tên xã/địa chỉ ở
//  field khác) + vnLatLng_ (bỏ toạ độ 0/ngoài VN, tự đảo lat/lng ngược); chẩn đoán in mẫu toạ độ + log 1 đơn raw.
// v1.7.25 — thêm dòng 🔎 Chẩn đoán (staffDotDiagText_) đầu dòng trạng thái tab Theo Nhân Viên: số đơn giao
//  khớp phường bằng cách nào / không khớp, có GPS bao nhiêu, số chấm, chấm bị ẩn do lọc, mẫu mã/tên xã/địa chỉ.
// v1.7.24 — SỬA LỖI tải sản lượng xong "0 chấm nhân viên đã đặt lên bản đồ … N (nhân viên,ngày) không
//  xác định được xã/phường ổn định": GHN nay trả mã xã/phường MỚI (sau sáp nhập) — khác hệ mã phường CŨ
//  của bản đồ → không tra được ranh giới/tâm phường → không đặt chấm. Thêm resolveOldWardCode_(): quy mỗi
//  đơn về phường CŨ theo mã cũ → toạ độ GPS nằm trong ranh giới nào → tên xã/phường GHN trả → mã mới qua
//  rezone → địa chỉ text. Dùng ở computeStaffWardAssignments_, computeWardStaffBreakdown_, resolveRowWardCode_.
// v1.7.23 (2 việc, phản hồi kèm 2 ảnh chụp NGAY SAU v1.7.22 — popup bưu cục (THN) Phú Bình 2 +
// bảng thô "Theo Nhân Viên" ngày 16/8, đúng 2 tính năng vừa thêm ở v1.7.22):
//  1) Khối giải thích cách tính Định biên trong popup bưu cục (⚙️ Tỷ lệ gán cấp bưu cục.../📊 Đơn
//     Giao (theo sheet Performance...)/📦 Đơn tồn CHƯA gán tài xế/⚠️ chưa phân bổ được...) — trước
//     đây LUÔN hiện đầy đủ ngay dưới "Hiện có/Định biên cần/Thiếu", chiếm nhiều diện tích panel,
//     đẩy bảng "Theo từng xã/phường" xuống xa, phải cuộn mới thấy. Phản hồi thật: "phần này cho
//     vào 1 dấu + ai thích xem thì ấn, không thì mặc định ẩn, để phần diện tích không chèn vào
//     bảng định biên". FIX: gói khối này trong 1 nút "🔍 Xem chi tiết cách tính Định biên", MẶC
//     ĐỊNH ẨN — bấm vào mới xổ ra (bấm lại thì thu gọn lại, đổi thành "🔽 Ẩn chi tiết..."). Wiring
//     ở wireHubStaffingTable_ (gọi ngay sau showInfoPanel_(hubPopupHtml_(...)) — TÁCH RIÊNG khỏi
//     phần wiring bảng "Theo từng xã/phường" bên dưới (return sớm nếu KHÔNG có bảng xã/phường, VD
//     bưu cục chưa ghi nhận đơn Giao TC đã gán nào) để nút "+" vẫn hoạt động đúng trong trường hợp
//     đó — đã test riêng kịch bản này. Test: /tmp/test_backlog_toggle.js (nút tồn tại khi có nội
//     dung, mặc định ẩn, bấm xổ ra/ẩn lại đúng đảo chiều, bảng xã/phường vẫn wiring bình thường,
//     và nút "+" vẫn hoạt động khi popup KHÔNG có bảng xã/phường).
//  2) Bảng thô "Theo Nhân Viên": BỎ HẲN 3 cột "Volume (BC)/% Gán (BC)/% GTC (BC)" mới thêm ở
//     v1.7.22 (lặp lại Y HỆT trên MỌI dòng nhân viên cùng bưu cục/ngày — trông thừa/rối). Phản hồi
//     thật: "3 cột cuối không ai để vậy => di dời chỉ số bưu cục lên hàng bên trên chỗ: Tổng đơn
//     giao:.... đơn · 11 nhân viên, % gán, % GTC. còn cái số 1409 là mày đang gom cả đơn lấy vào
//     à? => số này ko cần. vì tao xem số tổng trong bảng rồi". FIX: (a) bảng trở lại ĐÚNG 11 cột
//     như trước v1.7.22 (bỏ 3 cột, colspan hàng chi tiết trở lại 11, hàng TỔNG bỏ luôn ghi chú
//     "không cộng dồn" gắn với 3 cột đó); (b) dòng tóm tắt phía trên bảng (trước đây "Tổng: X đơn"
//     — gộp CHUNG Lấy/Giao/Trả, đúng như người dùng chỉ ra là "gom cả đơn lấy vào", dễ hiểu lầm)
//     đổi thành "Tổng đơn giao: X đơn" (CHỈ Giao TC + Giao thất bại — số Lấy/Trả/Tổng gộp đã có
//     sẵn & tách rõ ràng ở hàng TỔNG cuối bảng, không cần lặp ở dòng tóm tắt nữa); (c) gộp thêm
//     Volume/% Gán/% GTC vào NGAY dòng tóm tắt đó thay cho 3 cột đã bỏ — nhưng CHỈ hiện khi TOÀN
//     BỘ dữ liệu đang xem (agg) cùng chung ĐÚNG 1 (bưu cục, ngày) và khớp được Performance, vì mỗi
//     (bưu cục, ngày) có Volume/% Gán/% GTC RIÊNG — trải nhiều bưu cục/ngày khác nhau thì KHÔNG
//     thể gộp thành 1 số chung hợp lý (sẽ phải chọn hiện số của combo nào, dễ gây hiểu lầm là số
//     áp dụng cho TẤT CẢ) — trường hợp đó ẩn hẳn phần Performance ở dòng tóm tắt, muốn xem RIÊNG
//     từng bưu cục thì mở popup bưu cục đó trên bản đồ (mục 1 ở trên). LƯU Ý MỞ: nếu người dùng
//     muốn xem Volume/% Gán/% GTC của TỪNG combo khi khoảng đang xem trải nhiều bưu cục/ngày, cần
//     thiết kế thêm (VD 1 dòng tóm tắt phụ theo từng bưu cục/ngày, hoặc mở lại dạng cột nhưng gộp
//     dòng — CHƯA làm ở bản này, cần hỏi lại nếu người dùng cần). Test: /tmp/test_staff_table_
//     total_perf.js viết lại hoàn toàn cho v1.7.23 (bảng đúng 11 cột, colspan=11, hàng TỔNG hết
//     ghi chú "không cộng dồn", dòng tóm tắt hiện đúng "Tổng đơn giao" + Volume/%Gán/%GTC khi CHỈ
//     1 combo, ẩn hẳn phần Performance khi có ≥2 combo khác nhau, hàng TỔNG vẫn cộng đủ khi bị
//     MAX_ROWS cắt hiển thị).
//  Đã chạy lại TOÀN BỘ bộ test hiện có (33/33 file, trừ 1 file test_v16b.js đã biết là cũ/lỗi
//  thời từ trước) — PASS hết, không phát hiện hồi quy.
//
// v1.7.22 (2 việc, phản hồi kèm 4 ảnh chụp — popup bưu cục (THN) Phú Bình 2, bảng "Theo từng
// xã/phường", bảng thô "Theo Nhân Viên" ngày 16/8 — sau khi chấp nhận v1.7.21 "ok tạm thời vậy"):
//  1) "Hiện có" (Định biên) giờ SO ĐÚNG NGÀY ĐANG XEM với NGÀY NGHỈ của từng nhân viên, KHÔNG còn
//     chỉ dựa vào TRẠNG THÁI HIỆN TẠI (tại thời điểm đồng bộ sheet HRM gần nhất). LỖI THẬT trước
//     đây: computeHubStaffingStats_ dùng resolveHrmDisplay_(driverId).isInactive — hàm này CHỈ biết
//     trạng thái HRM HIỆN TẠI, không biết NGÀY đang xem dữ liệu là ngày nào — nên 1 nhân viên ĐÃ
//     nghỉ việc ở thời điểm HIỆN TẠI bị loại khỏi "Hiện có" của MỌI ngày trong quá khứ đang xem,
//     kể cả những ngày họ THẬT SỰ vẫn còn đi làm (trước ngày nghỉ). Phản hồi thật: "định biên này
//     => số lượng nhân sự có cần phải so Ngày đang xem dữ liệu và Ngày nghỉ của nhân viên => để
//     hiển thị cho đúng ví dụ tao đang xem ngày 15/8 => nếu nhân viên có ngày nghỉ sau ngày đang
//     xem thì người đó vẫn được tính là nhân viên đi làm chứ? còn nhân viên mà nghỉ trước ngày đang
//     xem thì mới không tính là nhân viên hiện có". FIX: thêm hàm MỚI isHrmInactiveOnDate_(driverId,
//     tripDateStr) — so sánh tripDateStr (ngày của DÒNG ĐƠN/lãnh thổ cụ thể đang xét) với
//     rec.ngayNghiViec (cột "Ngày nghỉ việc" sheet HRM): ngày đang xem SAU ngày nghỉ (tripDate >
//     leaveDate) -> LOẠI (đã nghỉ thật lúc đó); ngày đang xem TRƯỚC HOẶC ĐÚNG ngày nghỉ -> KHÔNG
//     loại (vẫn đang đi làm — ĐÚNG NGÀY NGHỈ được coi là ngày làm việc cuối, vẫn tính "có đi làm"
//     ngày đó — lựa chọn AN TOÀN theo hướng không loại nhầm cho trường hợp trùng ngày, không được
//     người dùng nói rõ, cần xác nhận lại nếu muốn đổi). Nếu KHÔNG tra được HRM, hoặc trạng thái
//     HIỆN TẠI là ACTIVE, hoặc thiếu ngày nghỉ/ngày lỗi -> giữ AN TOÀN theo hành vi CŨ (không đủ dữ
//     liệu để "cứu" theo ngày thì không đoán mò). Hàm này CHỈ thay cho 2 chỗ tính "Hiện có" trong
//     computeHubStaffingStats_ (wardHeadcount theo xã/phường + workingStaffKeys/hubHeadcountWorking
//     cấp bưu cục) — resolveHrmDisplay_() (hiển thị chung: popup chấm/tên trên bản đồ, cột "Trạng
//     thái NV" ở bảng Theo Nhân Viên...) GIỮ NGUYÊN, vẫn dùng trạng thái HIỆN TẠI như cũ (KHÔNG gắn
//     với 1 ngày cụ thể nên không áp dụng được cách so sánh này). LƯU Ý MỞ: cùng kiểu lỗi ngày-
//     không-nhận-biết này CÓ THỂ cũng ảnh hưởng tới việc TÔ XÁM chấm/tên nhân viên trên bản đồ và
//     bộ lọc trạng thái làm việc trên bản đồ (đều đang dùng trạng thái HIỆN TẠI, chưa so theo ngày)
//     — CHƯA sửa 2 chỗ đó ở bản này (ngoài phạm vi "Định biên" được yêu cầu), cần hỏi lại người dùng
//     có muốn áp dụng luôn hay không. Test: /tmp/test_hrm_date_aware.js (test trực tiếp
//     isHrmInactiveOnDate_ với đủ 5 trường hợp — nghỉ SAU/TRƯỚC/ĐÚNG ngày đang xem, không rõ ngày
//     nghỉ, không tra được HRM — + test qua computeHubStaffingStats_ thật), cùng 5 file test cũ có
//     đụng computeHubStaffingStats_ (test_dinhbien_divisor/test_hub_staffing/
//     test_hub_staffing_table/test_performance_backlog/test_ward_dv_share) đã thêm
//     isHrmInactiveOnDate_ vào danh sách hàm trích xuất để không bị lỗi thiếu hàm — toàn bộ vẫn PASS
//     (không hồi quy, vì HRM mock trong các test đó không có ngayNghiViec -> tự rơi về đúng hành vi
//     cũ "không rõ ngày nghỉ -> loại").
//  2) Bảng thô "Theo Nhân Viên" (tab "🚚 Theo Nhân Viên"): thêm HÀNG TỔNG ở cuối bảng + 3 CỘT THAM
//     KHẢO lấy từ sheet "Performance". Phản hồi thật (ảnh số 2): "thêm số tổng vào ngoài ra map
//     thêm chỉ số ở sheet performance vào về Volume, % Gán, % GTC để làm cơ sở bổ sung tiếp các
//     nhận định sau này". (a) HÀNG TỔNG (tfoot, viền trên đậm, nền xám nhạt) cộng dồn Lấy TC/Lấy
//     thất bại/Giao TC/Giao thất bại/Trả hàng/Tổng — LUÔN tính từ TOÀN BỘ `agg` (mọi dòng ngày×bưu
//     cục×nhân viên sau lọc), KHÔNG CHỈ phần `shown` bị giới hạn hiển thị MAX_ROWS=500 dòng đầu, để
//     không báo tổng THIẾU khi khoảng ngày/bưu cục đang xem ra nhiều hơn 500 dòng (đã test riêng
//     bằng kịch bản 502 dòng, hàng TỔNG vẫn cộng đủ dù bảng chỉ hiển thị 500 dòng đầu). (b) 3 CỘT
//     MỚI "Volume (BC)"/"% Gán (BC)"/"% GTC (BC)" thêm vào cuối mỗi dòng — số liệu CẤP BƯU CỤC/NGÀY
//     (không phải riêng nhân viên đó) lấy từ state.performanceRows (đã tải sẵn từ sheet Performance,
//     dùng CHUNG hạ tầng với computeHubStaffingStats_ — không cần đổi backend GAS_TUYEN_GIAO.gs vì
//     pctGan/pctGtc đã được đọc sẵn từ sheet nhưng trước đây chưa dùng tới ở bảng này), khớp qua
//     (hubCode suy từ tên bưu cục qua performanceHubCode_/state.hubNameToCode, ngày) — hiện "—" khi
//     không khớp được (sheet Performance chưa có dòng cho đúng bưu cục/ngày đó, hoặc tên bưu cục
//     trong sheet không khớp được mã nào, giống cách computeHubStaffingStats_ đã xử lý), KHÔNG đoán
//     mò. Vì là số liệu cấp bưu cục/ngày, mọi dòng nhân viên CÙNG 1 bưu cục/ngày sẽ hiện CÙNG 1 giá
//     trị (có chủ đích, để đối chiếu trực tiếp ngay trên bảng) — và ở HÀNG TỔNG, 3 cột này KHÔNG
//     được cộng dồn (cộng lại sẽ đếm trùng nhiều lần cùng 1 giá trị), thay bằng ghi chú "(không cộng
//     dồn — số liệu cấp bưu cục/ngày)". colspan hàng chi tiết xã/phường (nút "+") đổi từ 11 -> 14
//     cho khớp số cột mới. Test MỚI: /tmp/test_staff_table_total_perf.js (jsdom thật — header đủ 14
//     cột, dòng khớp Performance hiện đúng số, dòng không khớp hiện "—", colspan=14, hàng TỔNG cộng
//     đúng từ toàn bộ agg kể cả khi bị MAX_ROWS cắt hiển thị, 3 cột Performance ở hàng TỔNG có ghi
//     chú không cộng dồn).
//  Đã chạy lại TOÀN BỘ bộ test hiện có (32/32 file, trừ 1 file test_v16b.js đã biết là cũ/lỗi thời
//  từ trước) — PASS hết, không phát hiện hồi quy.
//
// v1.7.21 (sửa NGAY sau v1.7.20 — phản hồi kèm popup THẬT sau khi dùng v1.7.20 + 1 ảnh chụp bảng
// tính tay CỦA CHÍNH người dùng, chỉ thẳng công thức ĐÚNG nên dùng):
//  1) LỖI THẬT: v1.7.20 sửa QUÁ TAY — để giải quyết việc nền "đã gán sống" có thể đếm thiếu, bản
//     đó bỏ HẲN việc dùng "đã gán sống, biết CHÍNH XÁC xã/phường" cho những ngày có Performance,
//     thay bằng phân bổ TOÀN BỘ Volume qua tỷ trọng dv — nhưng làm vậy có nghĩa NHỮNG xã/phường ĐÃ
//     BIẾT RÕ số liệu thật (từ dữ liệu tuyến giao) cũng bị GHI ĐÈ bằng số "đoán" theo tỷ trọng dv,
//     mất độ chính xác đáng lẽ đã có. Hệ quả: khoảng ngày đang xem gồm 2 ngày (1 ngày có Performance
//     15/8, 1 ngày không) — cột "TB Lấy/Giao" (trung bình/ngày, cộng dồn CẢ 2 ngày rồi chia 2) ra
//     84/791, người dùng đọc thấy 791 không khớp trực quan với Volume=1448 của riêng ngày 15/8 (dù
//     thực ra 791 = TB/ngày, không sai về mặt số học — nhưng người dùng chỉ ra ĐÚNG vấn đề gốc rễ
//     hơn: bản v1.7.20 KHÔNG nên bỏ dữ liệu tuyến giao ĐÃ CÓ). Phản hồi thật, kèm ảnh chụp bảng
//     tính tay CỦA CHÍNH người dùng (cột: Tổng đơn cần giao [đã gán sống theo từng xã], tổng đơn
//     theo file json [dv], tỷ trọng, Số đơn chưa được gán, số đơn để tính định biên = 2 cột đầu
//     cộng lại, TỔNG khớp đúng 1.448): "mày phải lôi cái đám đã gán trong chuyến ra theo từng xã
//     phường đã gán, số còn lại chưa gán = 1448 đơn (tổng đơn cần giao trong ngày ở sheet
//     performance) - đi số đã gán thực tế (ví dụ đc 771 đơn) thì cố còn lại là chưa gán = 677 đơn
//     chưa gán => mày * với tỷ trọng từng xã phường (đã có đơn ở file json) => số đơn chưa gán mỗi
//     xã phường => lấy số đơn này + số đơn đã gán = tổng đơn của xã phường đó => nếu kết quả sản
//     lượng đơn này < số đơn ở file Json => định biên có thể = 0, nhưng nếu > hơn file json thì
//     định biên phải > 0."
//     SỬA: quay lại GIỮ NGUYÊN "đã gán sống, biết CHÍNH XÁC xã/phường" (wardGiaoTotal tính từ
//     resolveRowWardCode_, KHÔNG còn loại bỏ ngày có Performance như v1.7.20) làm NỀN cho MỌI
//     ngày — CHỈ phân bổ theo tỷ trọng phần "GAP" (performanceGapAmount = Volume - coveredLiveTotal,
//     xem comment đầy đủ ở computeHubStaffingStats_) rồi CỘNG THÊM vào nền đó (không ghi đè). Khác
//     1 điểm quan trọng so với công thức v1.7.17-19 (từng dùng Volume - Đơn gán THEO SHEET làm số
//     cần phân bổ): GAP ở đây dùng ĐÚNG con số coveredLiveTotal (tổng đã gán sống suy ra được xã/
//     phường TỪ CHÍNH dữ liệu tuyến giao đang có, không phải cột Đơn gán của sheet) — nhờ vậy GAP
//     tự động "hấp thụ" luôn cả phần đơn đã gán thật theo sheet nhưng resolveRowWardCode_/
//     matchAddressToWard_ không suy ra được xã/phường cụ thể (đúng lỗi gốc rễ v1.7.20 từng cố sửa
//     nhưng sửa sai cách) — ví dụ thật minh hoạ 2 cách tính KHÁC NHAU: Volume=1448, Đơn gán(sheet)
//     =771 -> GAP kiểu v1.7.17-19 = 677; nhưng nếu coveredLiveTotal (đã gán sống suy ra được xã/
//     phường) chỉ = 719 (52 đơn "đã gán" theo sheet không suy ra được xã/phường) -> GAP kiểu
//     v1.7.21 = 1448-719 = 729 — vẫn phân bổ HẾT để tổng khớp đúng Volume, nhưng KHÔNG xã/phường
//     nào có dữ liệu thật bị ghi đè mất chính xác. Đổi tên field trả về: bỏ
//     performanceVolumeGiaoCount (v1.7.20), thêm performanceCoveredLiveGiaoCount (đã gán sống,
//     biết chính xác xã/phường) + performanceGapGiaoCount (phần còn lại, đã phân bổ theo tỷ trọng)
//     — 2 số này cộng lại = tổng đã dùng làm Định biên. performanceBacklogInfo (Volume-Đơn gán
//     sheet, thuần tham khảo, từ v1.7.20) giữ nguyên, chỉ còn hiển thị PHỤ (có thể khác
//     performanceGapGiaoCount, đã ghi rõ lý do trong popup). Popup dòng "📊" viết lại tách rõ 2
//     thành phần (đã biết chính xác / còn lại đã phân bổ) thay vì gộp chung 1 số như v1.7.20.
//     Test SỬA: /tmp/test_performance_backlog.js (5 kịch bản A-E — kịch bản (A) giờ giaoTotal quay
//     lại ĐÚNG "đã gán sống + gap theo tỷ trọng" như trước v1.7.20, vì trong dữ liệu test "sạch"
//     này coveredLiveTotal khớp đúng donGan sheet nên số không đổi so với v1.7.19; kịch bản (B) —
//     ĐÂY LÀ kịch bản chứng minh rõ nhất khác biệt v1.7.20 vs v1.7.21: dữ liệu tuyến giao "biến
//     mất" hoàn toàn cho ngày 08-25 dù sheet xác nhận đã gán 40 đơn — v1.7.20 (trust toàn bộ Volume
//     qua dv, bỏ hẳn đã gán sống) sẽ ra kết quả KHÁC bài test này ở CHI TIẾT phân bổ dù tổng vẫn
//     đúng 130; v1.7.21 giữ đúng 40 đã gán sống (ngày 08-24) + phân bổ gap=90 cho ngày 08-25, tổng
//     vẫn 130); /tmp/test_ward_dv_share.js kịch bản (A) — quay lại đúng công thức "đã gán sống +
//     gap theo tỷ trọng dv" (W1=30+gap*25%, W2=0+gap*75%), SỐ giống hệt v1.7.19 gốc (55/75) vì dữ
//     liệu test đã gán sống khớp đúng donGan sheet (không có phần "đã gán nhưng không suy ra được
//     xã/phường" trong kịch bản test này); /tmp/test_dinhbien_divisor.js, test_hub_staffing_table.js
//     đổi tên field trong assertion cho khớp. Đã chạy lại TOÀN BỘ 31 file test (trừ 1 file nợ kỹ
//     thuật cũ) — KHÔNG có hồi quy.
//     LƯU Ý CHƯA GIẢI QUYẾT/CẦN NGƯỜI DÙNG XÁC NHẬN: (a) cột "TB Lấy/Giao" vẫn là TRUNG BÌNH cộng
//     dồn CẢ khoảng ngày đang xem chia cho dayCount (hành vi có từ trước v1.7.17, KHÔNG đổi ở bản
//     này) — nếu khoảng ngày đang xem gồm nhiều ngày, số hiển thị SẼ KHÔNG bằng thẳng Volume của
//     riêng 1 ngày cụ thể (đây có thể là 1 phần lý do gây hiểu lầm "sai" ở phản hồi vừa rồi, dù bản
//     thân phép tính trung bình không sai) — CHƯA rõ người dùng có muốn xem THÊM 1 chế độ "chỉ đúng
//     1 ngày" tách riêng hay không, cần hỏi lại nếu vẫn thấy khó đối chiếu; (b) vẫn còn nguyên lưu ý
//     CHU KỲ THAM CHIẾU của "dv" (wards.json) chưa xác nhận từ v1.7.19.
// v1.7.20 (1 lỗi tiếp — phản hồi kèm 2 ảnh: bảng xã/phường Phú Bình 2 SAU v1.7.19 + ảnh chụp
// TRỰC TIẾP dòng dữ liệu sheet Performance ngày 15/8/2026):
//  1) LỖI THẬT: v1.7.19 đã sửa ĐÚNG chiều tỷ trọng (dùng dv thay vì đơn đã gán sống) nhưng vẫn
//     còn 1 lỗ hổng ở lớp KHÁC: công thức CŨ (v1.7.17-19) LUÔN cộng "đơn Giao ĐÃ GÁN sống, suy ra
//     xã/phường cụ thể qua resolveRowWardCode_" LÀM NỀN, rồi mới CỘNG THÊM riêng phần backlog
//     (Volume-Đơn gán) theo tỷ trọng dv lên trên nền đó. Nếu chính cái NỀN "đã gán sống" đó tự nó
//     ĐẾM THIẾU (nhiều đơn ĐÃ gán thật theo sheet Performance — cột Đơn gán — không suy ra được
//     xã/phường cụ thể qua resolveRowWardCode_/matchAddressToWard_, ví dụ do chuyến/địa chỉ không
//     khớp được với dữ liệu quy hoạch) thì TỔNG cuối cùng vẫn THẤP hơn Volume thật — không phải vì
//     backlog tính sai, mà vì chính phần "đã gán" (đầu vào) đã bị đếm thiếu từ trước khi cộng
//     backlog vào. Phản hồi thật, kèm số liệu CỤ THỂ từ sheet Performance ngày 15/8: Volume=1448,
//     %Gán=53,25%, Đơn gán=771 — nhưng tool tính ra tổng chỉ dừng ở khoảng 771: "ví dụ 15/8 mày
//     tính ra có 771 đơn định biên? trong khi tổng tồn là 1448 đơn? vậy 677 đơn nữa đâu? có phải
//     không tính vào không đó, nó phải ra đc là 1448 đơn chứ?" — VÀ hàng loạt xã CÓ dv thật trong
//     wards.json (Úc Kỳ, Thanh Ninh, Tân Hòa, Lương Phú, Tân Thành) vẫn ra TB Giao/ngày CHỈ 20,3-
//     48,3, thấp hơn hẳn "60-70 đơn/ngày" mà người dùng nắm chắc theo thực tế địa bàn: "mấy thằng
//     này vẫn ra định biên = 0? trong khi như tao tính thì mỗi xã này vẫn cần 1 người, và sản
//     lượng của nó 1 ngày vẫn từ 60-70 đơn (cả mới và tồn = số đơn cần giao trong ngày) mà mày
//     tính ra ít hơn nhiều." — cả 2 phản hồi CÙNG GIẢI THÍCH được bởi 1 nguyên nhân gốc duy nhất:
//     nền "đã gán sống" bị đếm thiếu kéo theo CẢ tổng bưu cục LẪN phần chia cho từng xã/phường (kể
//     cả xã có dv cao) đều thấp hơn thực tế, dù tỷ trọng CHIA đã đúng từ v1.7.19.
//     SỬA: cho những NGÀY sheet Performance ĐÃ có dữ liệu, bỏ hẳn việc dùng "đã gán sống, suy ra
//     xã/phường cụ thể" làm NỀN — TRUST HẲN cột Volume (số CẤP BƯU CỤC người dùng tự nhập trực
//     tiếp vào sheet, không phụ thuộc độ chính xác của resolveRowWardCode_/matchAddressToWard_)
//     làm TỔNG DUY NHẤT của những ngày đó, rồi phân bổ TOÀN BỘ Volume (không riêng phần backlog
//     như trước) xuống xã/phường theo ĐÚNG tỷ trọng wardShareBase (dv/wards.json, đã sửa ở
//     v1.7.19) — xem comment v1.7.20 đầy đủ ở wardGiaoTotal/computeHubStaffingStats_. Những NGÀY
//     Performance KHÔNG có dữ liệu vẫn giữ NGUYÊN hành vi cũ (đã gán sống theo xã/phường cụ thể +
//     dự phòng trip-level) — không có nguồn nào đáng tin hơn cho riêng những ngày đó. Đổi tên field
//     trả về performanceBacklogGiaoCount -> performanceVolumeGiaoCount (ý nghĩa mới: TOÀN BỘ Volume
//     đã phân bổ, không riêng backlog) + thêm field MỚI performanceBacklogInfo (Volume-Đơn gán,
//     THUẦN THAM KHẢO hiển thị ở popup, không còn dùng để tính lượng phân bổ) — popup dòng "📊"
//     viết lại cho đúng ý nghĩa mới (không còn nói "đơn tồn CHƯA GÁN" mà nói "Tổng đơn Giao CẦN
//     GIAO", kèm ghi chú phụ số đơn đang thực sự tồn nếu > 0).
//     Test MỚI/SỬA: /tmp/test_performance_backlog.js (5 kịch bản A-E cập nhật số mong đợi theo
//     công thức mới — kịch bản B (hub-wide fallback) là kịch bản LỘ RÕ NHẤT lỗi cũ: trước đây tổng
//     chỉ ra 90 (40 đã gán ngày 1 + 50 backlog ngày 2, THIẾU 40 đơn đã gán "vô hình" của ngày 2 mà
//     dữ liệu tuyến giao không suy ra được xã/phường), SAU sửa ra ĐÚNG 130 = đúng tổng Volume 2
//     ngày 40+90); /tmp/test_ward_dv_share.js kịch bản (A) cập nhật số mong đợi — xã có dv CAO hơn
//     (W2, dv=90 so với W1 dv=30) giờ nhận ĐÚNG 75% của TOÀN BỘ Volume=200 (=150 đơn) thay vì chỉ
//     75% của backlog=100 (=75 đơn, con số CŨ vẫn thấp hơn thực tế đúng kiểu lỗi người dùng chỉ
//     ra); /tmp/test_dinhbien_divisor.js, /tmp/test_hub_staffing_table.js: đổi tên field trong
//     assertion cho khớp (performanceBacklogGiaoCount -> performanceVolumeGiaoCount), số không đổi
//     (2 test này dùng dữ liệu "đã gán sống" khớp CHÍNH XÁC với Đơn gán nên không lộ lỗi cũ). Đã
//     chạy lại TOÀN BỘ 31 file test (trừ 1 file nợ kỹ thuật cũ, không liên quan) — KHÔNG có hồi quy.
//     LƯU Ý CHƯA GIẢI QUYẾT/CẦN NGƯỜI DÙNG XÁC NHẬN: (a) giả định cốt lõi của bản sửa này là "cột
//     Volume của sheet Performance LUÔN đáng tin hơn dữ liệu tuyến giao GHN suy ra xã/phường cụ
//     thể" — đúng theo mọi phản hồi thật từ đầu tới giờ (Volume là số người dùng TỰ NHẬP, tin cậy
//     cấp bưu cục), nhưng CHƯA đo được CHÍNH XÁC % đơn "đã gán" mà resolveRowWardCode_/
//     matchAddressToWard_ suy ra xã/phường thất bại trong dữ liệu thật (chỉ suy luận gián tiếp từ 2
//     phản hồi trên, chưa có con số đo trực tiếp) — nếu tỷ lệ thất bại đó thực ra KHÔNG lớn như suy
//     đoán thì phần "677 đơn thiếu" có thể còn do nguyên nhân khác (VD khoảng ngày đang xem trong
//     ảnh popup không chỉ đúng 1 ngày 15/8 mà rộng hơn, làm loãng số liệu) — CẦN người dùng xác
//     nhận lại số liệu Định biên/xã-phường của bưu cục Phú Bình 2 sau bản sửa này để chốt hẳn; (b)
//     "dv" (wards.json) vẫn còn nguyên lưu ý CHU KỲ THAM CHIẾU chưa xác nhận từ v1.7.19 (mục a bên
//     dưới, chưa đổi).
// v1.7.19 (1 lỗi — phản hồi kèm 2 ảnh chụp popup THẬT của bưu cục (THN) Phú Bình 2 SAU KHI đã
// dùng thử v1.7.18, phát hiện NGAY tiếp 1 lỗi tương tự vẫn còn sót lại):
//  1) LỖI THẬT: v1.7.18 đổi tỷ trọng phân bổ backlog sang dùng đơn ĐÃ GÁN CỘNG DỒN CẢ khoảng
//     ngày đang xem (thay vì theo từng ngày) — có vẻ đúng hướng, NHƯNG vẫn còn 1 lỗ hổng giống
//     hệt bản chất: nếu 1 xã/phường bị bỏ dispatch HOÀN TOÀN suốt CẢ khoảng ngày đang xem (thiếu
//     người kinh niên, không phải chỉ đúng 1 ngày), tỷ trọng đó VẪN = 0 -> vẫn không nhận được
//     phần backlog nào -> Định biên vẫn = 0 -> hiện "✓ Đủ" trong khi Hiện có cũng = 0 (hoàn toàn
//     không ai phục vụ xã đó) — vòng lặp tự tham chiếu y hệt lỗi gốc rễ ban đầu (v1.7.16/17),
//     chỉ khác quy mô ("cả khoảng ngày" thay vì "1 ngày"). Phản hồi thật kèm ví dụ CỤ THỂ chỉ
//     thẳng vào bảng popup thật: "Xã Lương Phú 0/6,3 ... Xã Tân Hòa 0/0,9 ... Xã Tân Thành 4,5/0
//     ... như này là sai mẹ rồi? mấy xã này ngày nào chẳng vài chục đơn mà mày tính ra vài đơn..?
//     trong khi người đi làm đéo có (= 0 vì thiếu nhân sự) mà vẫn tính đủ" + gợi ý ĐÚNG hướng sửa:
//     "mày đã tham khảo số đơn giao ở từng xã phường trong dữ liệu Json chưa? để tính tỷ trọng
//     tổng đơn cần giao của bưu cục ngày hôm đó".
//     ĐÃ TÌM RA: modul đã có sẵn 1 nguồn dữ liệu ĐỘC LẬP, đúng ý người dùng — cột "dv" (đơn Giao)
//     trong /api/wards.json (quyhoachbuucuc.info), đã dùng hiển thị ở popup xã/phường từ trước
//     ("📦 Giao: X đơn" — wardPopupHtml_) nhưng CHƯA TỪNG được đưa vào computeHubStaffingStats_.
//     Đây là dữ liệu THAM KHẢO TĨNH cho từng xã/phường, HOÀN TOÀN ĐỘC LẬP với dữ liệu chuyến đang
//     tải của khoảng ngày đang xem — nên KHÔNG bị "mù" với xã/phường đang bị bỏ dispatch, khác
//     hẳn nhược điểm cố hữu của việc dùng đơn ĐÃ GÁN SỐNG làm tỷ trọng (dù đã gộp cả khoảng ngày
//     ở v1.7.18 hay không).
//     SỬA: wardShareBase (tỷ trọng phân bổ backlog) giờ ưu tiên dùng "dv" — CHỈ tính xã/phường có
//     dv > 0 (loại dv=0/thiếu dữ liệu ra khỏi mẫu số, vì dv=0 do THIẾU dữ liệu khác bản chất với
//     "tỷ trọng thật = 0", không nên cho ăn 0% oan uổng) — CHỈ fallback về tỷ trọng đơn ĐÃ GÁN
//     sống (cách tính v1.7.18) khi TOÀN BỘ xã/phường bưu cục đó đều không có dv (VD wards.json
//     lỗi/chưa tải) — còn hơn không có tỷ trọng nào. State MỚI: không có, tái dùng thẳng
//     state.wardsByCode[...].dv đã tồn tại sẵn. Trả thêm field MỚI wardShareIsFromDv (true = đang
//     dùng dv, khuyến nghị; false = đang fallback, vẫn còn nhược điểm cũ) để hubPopupHtml_ ghi rõ
//     NGUỒN đang dùng trong dòng minh bạch "📊 Đơn Giao tồn CHƯA GÁN...". Dòng cảnh báo đỏ
//     "CHƯA phân bổ được" giờ CHỈ xảy ra khi CẢ 2 nguồn tỷ trọng đều trống (không có dv LẪN không
//     có đơn đã gán nào) — hiếm hơn hẳn trước (v1.7.18 chỉ dựa 1 nguồn duy nhất).
//     Test MỚI: /tmp/test_ward_dv_share.js (3 kịch bản — xã bị bỏ dispatch hoàn toàn cả khoảng
//     ngày nhưng có dv thật VẪN nhận đúng phần backlog theo tỷ trọng dv, Định biên > 0 và hiện
//     đúng "Thiếu" thay vì "Đủ" oan; fallback đúng về tỷ trọng đơn đã gán khi không có dv nào;
//     popup hiện đúng ghi chú nguồn tỷ trọng đang dùng). Đã chạy lại TOÀN BỘ 31 file test (trừ 1
//     file nợ kỹ thuật cũ, không liên quan) — KHÔNG có hồi quy, các test v1.7.17/18 cũ (không set
//     dv trong mock state) tự động rơi về fallback, xác nhận hành vi fallback khớp đúng v1.7.18.
//     LƯU Ý CHƯA GIẢI QUYẾT/CẦN NGƯỜI DÙNG XÁC NHẬN: (a) chưa rõ chính xác "dv" trong wards.json
//     là con số THEO CHU KỲ nào (tổng cả tháng? trung bình/ngày? snapshot gần nhất?) — hiện CHỈ
//     dùng để tính TỶ TRỌNG (chia %) giữa các xã/phường trong CÙNG 1 bưu cục, không dùng trực tiếp
//     làm số tuyệt đối, nên sai lệch về đơn vị/chu kỳ sẽ tự triệt tiêu khi chia tỷ lệ — NHƯNG nếu
//     dv của các xã/phường được đo ở CÁC THỜI ĐIỂM/CHU KỲ khác nhau (không đồng nhất), tỷ trọng
//     vẫn có thể lệch; (b) dv là dữ liệu do quyhoachbuucuc.info tự duy trì, module không kiểm soát
//     được độ mới/độ chính xác — nếu dv sai/lỗi thời cho 1 xã/phường cụ thể, tỷ trọng xã đó cũng
//     sẽ sai theo (không có cách nào modul tự phát hiện được điều này).
// v1.7.18 (1 việc — phản hồi NGAY SAU khi dùng thử v1.7.17 với dữ liệu thật bưu cục (THN) Phú
// Bình 2, qua 1 chuỗi trao đổi nhiều bước để tìm ĐÚNG công thức, không đoán 1 lần rồi thôi):
//  1) LỖI THẬT: v1.7.17 cộng THẲNG 100% đơn tồn (Performance: Volume - Đơn gán) vào công thức
//     Định biên ở mức ỔN ĐỊNH (yellowMin: 70 Xã / 90 Phường) — với Phú Bình 2 (Volume=1942/ngày,
//     tồn=1114) ra Định biên=26, trong khi người dùng tự tính chỉ cần ~12 là đủ, và khẳng định
//     "mày tính định biên ra tận 26 người là sai hoàn toàn". Đã trao đổi qua NHIỀU bước để tìm
//     đúng nguyên nhân (không sửa bừa 1 lần vì đây là số DÙNG ĐỂ TUYỂN DỤNG — "vô cùng quan
//     trọng"):
//     BƯỚC 1 (phản hồi thật): "1- nếu căn cứ vào lượng đơn gán hôm nay để tính tỷ trọng => thì
//     không đúng vì nếu tuyến đó hôm nay không có người đi giao => làm gì có đơn nào được gán =>
//     tỷ trọng rất thấp, trong khi đơn tồn thì còn nhiều. 2- thử dùng dữ liệu đang lấy được là
//     sản lượng đơn của từng xã phường => để tính tỷ trọng trong bưu cục => rồi từ đó tính định
//     biên". ĐÃ SỬA: v1.7.17 chia backlog theo tỷ trọng đơn ĐÃ GÁN CỦA TỪNG NGÀY riêng lẻ (dayMap)
//     — SAI như phản hồi chỉ ra, vì 1 ngày không dispatch được ai (đúng lúc thiếu người nhất) thì
//     tỷ trọng ngày đó gần như 0, "phạt" oan đúng xã/phường đang cần backlog nhất. v1.7.18: LUÔN
//     dùng tỷ trọng đơn ĐÃ GÁN CỘNG DỒN CẢ KHOẢNG NGÀY đang xem (wardShareBase, 1 lần duy nhất
//     cho toàn bộ backlog Performance của khoảng ngày đó) — không còn khái niệm "theo từng ngày"
//     hay "tầng dự phòng" nữa, đơn giản hoá đáng kể so với v1.7.17.
//     BƯỚC 2 — Tự đề xuất "Định biên chỉ tính đơn ĐÃ GÁN, bỏ hẳn tồn" (khớp con số ~12 của Phú
//     Bình 2 THUẦN TUÝ VỀ MẶT SỐ HỌC) rồi ĐƯỢC người dùng phản biện đúng bằng 1 câu hỏi sắc:
//     "nào cần hỏi gì cứ hỏi nhé... nếu mà bưu cục này tổng đơn cần giao 1900 đơn nhưng chỉ có 2
//     người đi làm? gán được 200 đơn thì định biên mày tính 2 người à?" — ĐÚNG, đề xuất đó SAI:
//     "đã gán" tự nó bị NĂNG LỰC HIỆN CÓ giới hạn ngược lại (bưu cục càng thiếu người → càng gán
//     được ít → Định biên tính ra càng THẤP → càng "chứng minh" đủ người dù thực tế thiếu trầm
//     trọng) — vòng lặp tự tham chiếu, đã RÚT LẠI đề xuất này, không dùng.
//     BƯỚC 3 (phản hồi thật, chốt công thức): "khi mà bưu cục tỷ lệ gán chỉ đc 80% thì còn tồn
//     20% => 20% đó cần phải tăng thêm vào năng lực gán cho các nhân viên => ví dụ thay vì chỉ ổn
//     định ở mức 70 đơn thì họ phải gán lên 84-90 đơn vì hàng còn mà? nhưng theo nghề này, tối đa
//     gán thành phố (tuyến phường) chỉ đc 150 đơn, xã/thị trấn ở huyện thì cũng chỉ 120 đơn là cao
//     lắm rồi." + xác nhận thêm cột Volume (Performance) LÀ SỐ TỒN CỘNG DỒN qua các ngày, không
//     phải hàng mới về thuần tuý của riêng 1 ngày: "đây là số tồn cả ngày hôm trước không giao đc
//     => tồn sang hôm sau thành số giao hôm sau, chứ bản chất hàng mới về không phải là 1942 đâu".
//     CÔNG THỨC MỚI (đúng cả 2 bài học ở BƯỚC 2 và BƯỚC 3): đơn tồn VẪN được cộng vào giaoTotal
//     (KHÔNG bỏ — tránh lặp lại sai lầm BƯỚC 2), NHƯNG chia cho divisor "ĐẨY LÊN" theo tỷ lệ gán
//     cấp bưu cục thay vì chia thẳng ở mức ổn định: effectiveDivisor = min(mức tối đa ngành, mức
//     ổn định / tỷ lệ gán) — tỷ lệ gán = Đơn gán / Volume, cộng dồn mọi ngày CÓ Performance trong
//     khoảng đang xem. THRESHOLDS_ thêm field MỚI dinhBienMax (giaoXa=120, giaoPhuong=150, ĐÚNG
//     số người dùng cung cấp — TÁCH RIÊNG khỏi field "red" cũ, vì "red" dùng cho chấm cảnh báo
//     quá tải của TỪNG nhân viên trên bản đồ, mục đích khác, không đổi hành vi đó). Ví dụ Phú
//     Bình 2 (tỷ lệ gán ~42.7%): 70/0.427=164.1 → bị CHẶN TRẦN ở 120 (không phải 164) → Định biên
//     ước tính giảm từ 26 xuống còn khoảng ~16-17 (không phải giảm thẳng xuống 12 như ước tính tay
//     ban đầu của người dùng — vì Volume=1942/ngày ĐÃ được xác nhận là số tồn cộng dồn thật, cần
//     người thật để giải quyết, chỉ là không được tính ở mức "ổn định" 70/người mà phải tính ở
//     mức năng lực đã "đẩy" lên gần mức tối đa cho phép). Số liệu thật đầy đủ sẽ hiện ra ngay khi
//     mở lại popup bưu cục này.
//     Popup bưu cục: thêm dòng minh bạch MỚI "⚙️ Tỷ lệ gán cấp bưu cục (sheet Performance): X% —
//     ... mức năng lực/người/ngày dùng để tính Định biên đã được ĐẨY LÊN: Xã/Thị trấn: 70 → Y đơn/
//     người/ngày · Phường: 90 → Z đơn/người/ngày (đã chặn trần theo mức tối đa ngành)" — CHỈ hiện
//     khi divisor thật sự bị đẩy (tỷ lệ gán < 100%), để người xem hiểu NGAY vì sao Định biên không
//     còn ra số "khủng" như trước dù vẫn cộng đủ đơn tồn. Tooltip cột "Định biên" trong bảng cũng
//     cập nhật lại theo đúng công thức mới.
//     Test MỚI: /tmp/test_dinhbien_divisor.js (6 kịch bản — divisor đẩy đúng theo tỷ lệ gán 80%
//     khớp ví dụ mẫu "84-90"; chặn trần đúng ở mức tối đa khi tỷ lệ gán rất thấp; Phường dùng đúng
//     cặp ngưỡng riêng 90/150; không có Performance thì giữ nguyên mức ổn định như v1.7.16; tỷ lệ
//     gán 100% thì không đẩy; popup hiện đúng dòng minh bạch mới) + xác nhận THRESHOLDS_.dinhBienMax
//     đúng 120/150. Đã chạy lại TOÀN BỘ 30 file test (trừ 1 file nợ kỹ thuật cũ, không liên quan) —
//     KHÔNG có hồi quy.
//     LƯU Ý CHƯA GIẢI QUYẾT/CẦN NGƯỜI DÙNG XÁC NHẬN THÊM: (a) mức tối đa 120/150 lấy ĐÚNG theo số
//     người dùng cung cấp — nếu thực tế theo vùng/mùa vụ khác nhau, có thể cần tham số hoá thêm
//     sau này; (b) tỷ lệ gán hiện tính CHUNG cho CẢ bưu cục (sheet Performance không có cột xã/
//     phường) rồi áp DÙNG CHUNG 1 mức đẩy cho MỌI xã/phường của bưu cục đó — nếu về sau có dữ liệu
//     tỷ lệ gán RIÊNG từng xã/phường, có thể tính chính xác hơn nữa; (c) con số cuối cùng cho Phú
//     Bình 2 sau khi sửa là bao nhiêu cần xem lại TRỰC TIẾP trên popup thật (ước tính ~16-17 ở
//     trên chỉ tính tay gần đúng từ số liệu ảnh chụp, CHƯA chạy qua đúng thuật toán với dữ liệu
//     ward-by-ward thật).
// v1.7.17 (1 việc lớn — phản hồi kèm 2 ảnh chụp Google Sheet tab "Performance" mới, NGAY SAU khi
// dùng thử v1.7.16, tiếp nối đúng LƯU Ý CHƯA GIẢI QUYẾT ở cuối mục 2 của v1.7.16):
//  1) v1.7.16 chỉ bắt được backlog kiểu "chuyến ĐÃ tạo nhưng driverId rỗng" (qua search-trip) —
//     LƯU Ý đã ghi rõ: nếu còn dạng "đơn CHƯA TỪNG vào chuyến nào cả" thì fetchStaffVolumeRows_
//     không có cách nào biết tới. Phản hồi thật xác nhận đúng vậy và cung cấp NGUỒN MỚI: sheet
//     "Performance" (người dùng tự quản lý, cột B=tên bưu cục, C=ngày, D=Volume (tổng SL cần giao
//     ngày đó), E/F=2 loại % (đã giải thích rõ khác nhau ở phản hồi — F = GTC/Volume, còn "%GTC"
//     cũ của modul = GTC/Đơn-đã-gán, khác mẫu số), I=Area Manager, J=Đơn đã gán, K=Đơn đã giao) —
//     "Volume - Đơn gán" ở CẤP BƯU CỤC/NGÀY là số CHÍNH XÁC hơn hẳn (bắt được CẢ đơn chưa từng
//     vào chuyến), NHƯNG sheet không có cột xã/phường — phản hồi thật: "chỗ này nó chỉ tới bưu cục
//     thôi vậy mày cần máy học, tính toán theo tỷ trọng đơn của xã phường => rồi tính được". Đã
//     làm ĐẦY ĐỦ, cả backend lẫn frontend:
//     BACKEND (GAS_TUYEN_GIAO.gs — backend RIÊNG của modul này, KHÔNG đụng GAS_BAOCAO_GTC.gs):
//     thêm SHEET_NAME_PERFORMANCE='Performance' (sheet NGƯỜI DÙNG tự tạo/quản lý, module KHÔNG tự
//     tạo qua setupSheets() — CHỈ ĐỌC, không bao giờ ghi), readPerformanceRows_()/getPerformance_()
//     đọc cột A:K (chỉ lấy các cột cần: B/C/D/E/F/G/H/I/J/K), action=getPerformance mới ở router.
//     ĐÒI HỎI: (a) phải có sheet tên ĐÚNG "Performance" trong CÙNG spreadsheet với các tab khác
//     (SyncLog/HRM/PhanQuyen/Config); (b) PHẢI deploy lại Web App (Manage deployments > New
//     version) thì action=getPerformance mới hoạt động — xem chi tiết hướng dẫn nâng cấp ngay đầu
//     file .gs.
//     FRONTEND: loadPerformanceData_(fromDate, toDate) — tải SONG SONG (Promise.all, không làm
//     chậm) cùng lúc với fetchStaffVolumeRows_ mỗi khi bấm "Tải sản lượng" ở tab Theo Nhân Viên,
//     lỗi tự nuốt bên trong (sheet chưa tồn tại/chưa deploy lại thì module vẫn chạy bình thường,
//     tự rơi về phương án dự phòng trip-level cũ của v1.7.16 — KHÔNG BAO GIỜ chặn/lỗi cả modul vì
//     thiếu sheet phụ này, đúng pattern đã dùng cho HRM từ v1.7.5). Khớp bưu cục qua TÊN (cột B
//     sheet không có mã hub_code) bằng state.hubNameToCode (xây trong buildLookups_, từ đúng field
//     h.name — đã xác nhận qua code là CHÍNH XÁC chuỗi hiển thị ở tiêu đề popup bưu cục) qua hàm
//     performanceHubCode_() — tên KHÔNG khớp được (gõ sai/khác định dạng) thì dòng đó bị BỎ QUA
//     hoàn toàn (không đoán mò gán nhầm bưu cục khác), và được cảnh báo ngay ở dòng trạng thái sau
//     khi tải xong + console.warn liệt kê tên bị lỗi.
//     THUẬT TOÁN PHÂN BỔ ("máy học tỷ trọng" theo đúng yêu cầu) — computeHubStaffingStats_ viết
//     lại đáng kể: với MỖI (bưu cục, ngày) mà sheet Performance CÓ dữ liệu, backlog = max(0,
//     Volume - Đơn gán); nếu backlog > 0 thì phân bổ xuống từng xã/phường theo ĐÚNG tỷ trọng đơn
//     Giao ĐÃ GÁN của CHÍNH NGÀY ĐÓ (backlog * tỷ_trọng_xã_ngày_đó) — tỷ trọng có thể đổi theo
//     ngày nên KHÔNG dùng 1 tỷ trọng cố định cho cả khoảng xem. 2 TẦNG DỰ PHÒNG khi thiếu dữ liệu
//     để "học": (a) nếu 1 ngày CỤ THỂ có backlog Performance nhưng NGÀY ĐÓ lại không có 1 đơn đã
//     gán nào (bưu cục hôm đó không dispatch được ai) — fallback dùng tỷ trọng xã/phường của CẢ
//     KHOẢNG NGÀY đang xem thay vì bỏ sót; (b) nếu bưu cục HOÀN TOÀN không có dữ liệu xã/phường
//     nào trong suốt cả khoảng ngày đang xem (chưa từng tải dữ liệu tuyến giao xã/phường nào cho
//     bưu cục đó) — KHÔNG đoán mò gán vào xã/phường bất kỳ (đoán sai còn nguy hiểm hơn không đoán),
//     số này được giữ riêng ở performanceUnallocatedGiaoCount và KHÔNG cộng vào hubDinhBien, báo
//     rõ bằng cảnh báo ĐỎ ở popup kèm hướng dẫn khắc phục (tải dữ liệu tuyến giao cho bưu cục đó).
//     ƯU TIÊN NGUỒN — sheet Performance (đáng tin hơn) LUÔN ưu tiên hơn suy luận trip-level
//     (v1.7.16) cho CÙNG 1 (bưu cục, ngày) — dứt khoát KHÔNG BAO GIỜ cộng cả 2 nguồn cho cùng 1
//     ngày (tránh đếm trùng): ngày nào Performance CÓ dữ liệu thì DÙNG Performance, trip-level của
//     đúng ngày đó bị bỏ qua có chủ đích (dù vẫn có thể có dữ liệu) — CHỈ những ngày Performance
//     KHÔNG có dữ liệu mới rơi về trip-level như hành vi v1.7.16 nguyên bản (không đổi cho các
//     ngày đó). Trả về object của computeHubStaffingStats_ được TÁCH RÕ theo nguồn: field cũ
//     "unassignedGiaoCount" (v1.7.16) đã được THAY bằng 3 field riêng — performanceBacklogGiaoCount
//     (đã phân bổ được, từ Performance, gồm cả qua fallback tỷ trọng cả khoảng ngày),
//     performanceUnallocatedGiaoCount (từ Performance nhưng KHÔNG phân bổ được), và
//     tripLevelBacklogGiaoCount (từ dự phòng trip-level, chỉ những ngày Performance thiếu dữ
//     liệu) + performanceDayCoveredCount (bao nhiêu/tổng ngày có Performance) — popup bưu cục hiện
//     ĐẾN 4 dòng minh bạch riêng biệt tuỳ tình huống thực tế (Performance đã phân bổ / trip-level
//     dự phòng / Lấy tồn / KHÔNG phân bổ được — cảnh báo đỏ), không gộp chung 1 dòng mơ hồ như
//     trước. Đơn Lấy (không có cột trong Performance) vẫn CHỈ dùng trip-level như v1.7.16, không
//     đổi. "Hiện có"/bảng Theo Nhân Viên/chấm bản đồ hoàn toàn KHÔNG bị đụng tới (chỉ tử số Định
//     biên/TB Lấy-Giao bị ảnh hưởng, đúng phạm vi yêu cầu).
//     Test: /tmp/test_performance_backlog.js (MỚI, 5 kịch bản test độc lập — (A) phân bổ đúng theo
//     tỷ trọng CÙNG NGÀY; (B) fallback tỷ trọng CẢ khoảng ngày khi 1 ngày cụ thể thiếu đơn đã gán;
//     (C) bưu cục hoàn toàn chưa có dữ liệu xã/phường -> báo performanceUnallocatedGiaoCount,
//     KHÔNG đoán mò; (D) tên bưu cục sai/không khớp -> dòng đó bị bỏ qua, không ảnh hưởng bưu cục
//     khác; (E) không đếm trùng — ngày có Performance thì bỏ qua trip-level CÙNG NGÀY, ngày thiếu
//     Performance vẫn rơi về trip-level) + cập nhật /tmp/test_hub_staffing_table.js mục 6 (đổi
//     sang field mới tripLevelBacklogGiaoCount, đúng hành vi khi sheet Performance rỗng) +
//     /tmp/test_hub_staffing.js (thêm 2 hàm phụ thuộc mới vào danh sách trích xuất). ĐÃ chạy lại
//     TOÀN BỘ 29 file test (trừ 1 file nợ kỹ thuật CŨ có từ trước, không liên quan phiên bản này,
//     xem ghi chú riêng) — KHÔNG có hồi quy nào.
//     LƯU Ý CHƯA GIẢI QUYẾT/CẦN NGƯỜI DÙNG XÁC NHẬN: (a) thuật toán phân bổ dựa trên GIẢ ĐỊNH tỷ
//     trọng đơn "chưa gán" giữa các xã/phường trong 1 bưu cục TƯƠNG TỰ tỷ trọng đơn "đã gán" —
//     đây là ước lượng HỢP LÝ NHẤT có thể với dữ liệu hiện có (sheet Performance không có cột xã/
//     phường), nhưng vẫn LÀ ước lượng, không phải số đo trực tiếp — nếu có cách nào chính xác hơn
//     (VD người dùng có thêm nguồn dữ liệu khác), cần trao đổi thêm; (b) Định biên giờ có thể là
//     SỐ THẬP PHÂN trước khi làm tròn (do phân bổ theo tỷ trọng) — đã dùng Math.round nhất quán ở
//     mọi nơi hiển thị, không ảnh hưởng cách đọc số cuối cùng.
// v1.7.16 (2 việc — phản hồi kèm 2 ảnh chụp popup bưu cục (THN) Phú Bình 2, NGAY SAU khi dùng
// thử v1.7.15):
//  1) LỖI THẬT: "phần bảng không hiển thị hết nè => thiết kế lại để có thể xem được hết thông
//     tin" — popup #ghn-tg-info-panel TRƯỚC ĐÂY luôn cố định 300px trong khi bảng "Theo từng xã/
//     phường" có tới 6 cột (min-width 480px) — CHẮC CHẮN tràn ngang, phải tự cuộn ngang bên
//     trong panel mới xem hết (người dùng không nhận ra có thể cuộn, tưởng bảng "mất" dữ liệu).
//     SỬA 2 THAY ĐỔI CỘNG HƯỞNG: (a) thêm tham số `wide` cho showInfoPanel_(html, wide) — bật
//     class '.ghn-tg-info-panel--wide' (rộng 460px thay vì 300px), CHỈ truyền true ở đúng 1 nơi
//     mở popup bưu cục (showInfoPanel_(hubPopupHtml_(...), true) trong initMap_) — mọi popup
//     khác (xã/phường, chấm nhân viên...) không đổi, vẫn 300px như cũ; (b) GỘP cột "Thiếu" vào
//     "Kết luận" (VD "❌ Thiếu 2" thay vì 2 cột riêng), giảm bảng còn 5 cột (min-width 480px ->
//     400px) — với panel 460px (trừ padding) đủ chỗ hiện TRỌN bảng trong đa số trường hợp, không
//     cần cuộn ngang nữa (tên xã/phường bất thường dài vẫn có thể cần cuộn — giữ overflow-x:auto
//     làm phương án dự phòng cuối, KHÔNG xoá khả năng cuộn). Test mới: /tmp/test_info_panel_wide.js
//     (showInfoPanel_ toggle đúng class theo tham số wide, tự tắt khi mở popup khác, nguồn xác
//     nhận CHỈ popup bưu cục truyền wide=true) + cập nhật /tmp/test_hub_staffing_table.js (bảng
//     giờ đúng 5 cột, hàng tổng dùng đúng "❌ Thiếu N" gộp).
//  2) LỖI THẬT (phát hiện qua câu hỏi phản hồi): "hiện tại định biên mày đang chỉ cộng các đơn
//     có trong chuyến đi tuy nhiên bưu cục còn đơn chưa gán được vì thiếu nhân sự đó => định
//     biên sẽ sai vì còn lượng đơn tồn chưa gán". ĐÚNG: fetchStaffVolumeRows_ tìm chuyến
//     (tripCode) qua search-trip rồi tra trip-detail lấy driverId — TRƯỚC ĐÂY nếu driverId RỖNG
//     (chuyến CHƯA được gán cho tài xế nào — thường xảy ra ĐÚNG LÚC bưu cục thiếu người, không
//     đủ tài xế để nhận hết chuyến) thì `return;` BỎ QUA HẲN toàn bộ đơn của chuyến đó khỏi MỌI
//     thống kê — đúng cho các thống kê GẮN VỚI 1 NHÂN VIÊN cụ thể (bảng Theo Nhân Viên, chấm/
//     tuyến giao trên bản đồ, "Hiện có") vì không có driverId thì không thể vẽ/gán cho ai — NHƯNG
//     SAI khi dùng làm tử số "Định biên" (computeHubStaffingStats_), vì Định biên phải phản ánh
//     ĐÚNG tổng khối lượng đơn CẦN GIAO, không phải chỉ phần đã có người nhận — nghịch lý: bưu
//     cục càng thiếu người thì càng nhiều đơn "chưa gán", mà công thức cũ lại ÂM THẦM bỏ sót
//     đúng phần đó, khiến Định biên bị tính THẤP hơn thực tế (che giấu chính mức độ thiếu hụt cần
//     đo). SỬA: fetchStaffVolumeRows_ giờ trả về { rows, unassignedRows } thay vì 1 mảng — chuyến
//     driverId rỗng KHÔNG bị bỏ qua nữa, items vẫn được thu thập vào "unassignedRows" RIÊNG
//     (driverId/staffKey=null, wardCode/type/tripDate lấy y hệt cách làm với rows bình thường vì
//     get-trip-items không phụ thuộc đã gán tài xế hay chưa). state MỚI:
//     staffUnassignedRawRows (song song staffRawRows, cập nhật cùng lúc ở loadStaffVolume_).
//     computeHubStaffingStats_ CHỈ cộng unassignedRows vào ĐÚNG 2 chỗ: tử số wardGiaoTotal/
//     wardPickTotal (dùng cho Định biên VÀ cột "TB Lấy/Giao") và dayCount (nếu 1 ngày CHỈ có đơn
//     chưa gán, trước đây ngày đó bị loại khỏi mẫu số hoàn toàn, làm TB/ngày bị tính cao giả tạo)
//     — "Hiện có"/bảng Theo Nhân Viên/chấm bản đồ vẫn CHỈ đọc "rows" như cũ, KHÔNG đổi hành vi
//     (đơn chưa gán không "thuộc về" ai để vẽ chấm/tính Hiện có). Thêm 1 dòng minh bạch mới ở
//     popup bưu cục ("📦 Đơn tồn CHƯA GÁN tài xế: N Giao / M Lấy — đã cộng vào Định biên") và ghi
//     luôn số này vào dòng trạng thái sau khi tải xong dữ liệu (tab Theo Nhân Viên), CHỈ hiện khi
//     có ít nhất 1 đơn loại này. Test mới: /tmp/test_fetch_unassigned_rows.js (fetchStaffVolumeRows_
//     tách ĐÚNG rows/unassignedRows theo driverId, kể cả nhánh dừng sớm nút "⏹ Dừng" vẫn trả
//     đúng shape) + thêm mục 6 vào /tmp/test_hub_staffing_table.js (đơn chưa gán cộng đúng vào
//     Định biên/TB Lấy-Giao/dayCount, KHÔNG đụng "Hiện có", popup hiện đúng số liệu minh bạch).
//     LƯU Ý CHƯA GIẢI QUYẾT: đây là "chuyến đã tạo nhưng chưa gán tài xế" (search-trip vẫn tìm
//     thấy tripCode) — nếu GHN còn 1 dạng "đơn CHƯA từng vào chuyến nào cả" (chưa tới bước tạo
//     chuyến) thì fetchStaffVolumeRows_ hiện KHÔNG có cách nào biết tới (search-trip không trả
//     về những đơn đó) — nếu người dùng xác nhận vẫn còn dạng đơn này, cần API/nguồn dữ liệu khác
//     mới xử lý được, ngoài phạm vi sửa lần này.
// v1.7.15 (1 việc — phản hồi kèm 2 ảnh chụp nút "✖ Bỏ chọn" trên thanh công cụ, NGAY SAU khi
// dùng thử v1.7.14, trong lúc đang làm việc):
//  1) LỖI THẬT: "chức năng của chữ bỏ chọn này đang không hoạt động đúng mục đích => nếu bấm vào
//     bỏ chọn thì mọi hạng mục, lớp hiển thị ,... phải về như ban đầu cấu hình mặc định" — nút
//     "✖ Bỏ chọn" trước đây chỉ gọi clearSelection_() (xoá xã/phường/bưu cục/tuyến giao ĐANG
//     CHỌN + đóng panel thông tin), KHÔNG hề đụng tới cấu hình HIỂN THỊ đang bật (vùng đang xem,
//     chế độ tô màu, các checkbox lớp/ranh giới, bộ lọc trạng thái làm việc...) — đúng như người
//     dùng phản ánh, bấm "Bỏ chọn" chỉ bỏ chọn 1 đối tượng chứ không đưa cả bản đồ về mặc định
//     gốc. SỬA TẬN GỐC: KHÔNG sửa trực tiếp clearSelection_() — vì hàm này còn được gọi ở 3 nơi
//     khác tần suất cao/ngầm định (bấm khoảng trống bản đồ, bấm nút × đóng panel thông tin, và
//     NGAY SAU khi tải lại dữ liệu trong loadAndRenderMap_()) — nếu để cả 3 chỗ đó VÔ TÌNH xoá
//     sạch cấu hình hiển thị người dùng đang bật thì sẽ gây khó chịu hơn (đặc biệt là sau mỗi lần
//     tải lại dữ liệu, bản đồ sẽ tự ý tắt hết các lớp đang xem — chắc chắn không phải điều người
//     dùng muốn). Tách thành 2 hàm riêng: clearSelection_() giữ NGUYÊN hành vi cũ (chỉ xoá lựa
//     chọn/đóng panel), và resetToDefaultDisplay_() MỚI — gọi clearSelection_() rồi
//     Object.assign(state, defaultMapConfig_()) để đưa TOÀN BỘ cấu hình hiển thị (vùng đang xem,
//     chế độ tô màu, chấm+ranh giới tuyến giao, tên nhân viên + bộ lọc trạng thái, ranh giới xã
//     phường mới, vùng bao tuyến giao...) về đúng giá trị mặc định gốc lúc mới mở modul, đồng bộ
//     lại UI (2 dropdown + toàn bộ checkbox liên quan) rồi vẽ lại bản đồ ngay lập tức. Chỉ riêng
//     nút "✖ Bỏ chọn" trên thanh công cụ được đổi sang gọi resetToDefaultDisplay_() — 3 nơi gọi
//     clearSelection_() còn lại (bấm trống bản đồ, nút × đóng panel, sau khi tải lại dữ liệu) giữ
//     nguyên như cũ, không bị ảnh hưởng. defaultMapConfig_() là 1 hàm (factory) trả về object MỚI
//     mỗi lần gọi — không dùng chung 1 hằng số — để tránh lỗi tinh vi: nếu dùng chung 1 object,
//     staffStatusFilter lồng bên trong sẽ bị CHIA SẺ tham chiếu, và các lần bấm tick/bỏ tick sau
//     đó sẽ VÔ TÌNH sửa luôn "giá trị mặc định" dùng cho lần bấm "Bỏ chọn" tiếp theo. Test mới:
//     /tmp/test_reset_default_display.js (4 phần — defaultMapConfig_() đúng 10 trường mặc định
//     gốc + không chia sẻ tham chiếu giữa các lần gọi; clearSelection_() xác nhận KHÔNG đụng cấu
//     hình hiển thị (an toàn cho bấm trống bản đồ/đóng panel/tải lại dữ liệu); resetToDefaultDisplay_()
//     xác nhận reset đủ cấu hình + đồng bộ UI + gọi lại toàn bộ 8 hàm applyXxx_ để vẽ lại bản đồ;
//     và kiểm tra bằng regex trên mã nguồn thật xác nhận CHỈ nút "Bỏ chọn" đổi sang hàm mới, 3 nơi
//     còn lại vẫn dùng clearSelection_() như cũ) — dựng bằng cách trích hàm thật + jsdom, không
//     hardcode lại logic.
// v1.7.14 (2 việc — phản hồi kèm 4 ảnh chụp: bộ lọc "Lọc trạng thái làm việc" lồng dưới "Hiện tên
// nhân viên", và danh sách "Theo từng xã/phường" trong popup bưu cục, NGAY SAU khi dùng thử
// v1.7.13):
//  1) ĐIỀU CHỈNH LẠI theo yêu cầu: "đưa phần bộ lọc trạng thái LÀM VIỆC áp dụng cho cả hạng mục
//     của Tuyến giao nhân viên thay vì đang chỉ lọc ở phần mỗi tên. mặc định tick vào phần ĐANG
//     LÀM VIỆC" — bản v1.7.13 chỉ áp bộ lọc 4 trạng thái (Đang làm việc/Nghỉ việc/Tạm Nghỉ/Hỗ
//     trợ-Điều chuyển) cho riêng lớp NHÃN TÊN ('staff-territory-label-text'), còn chấm + ranh
//     giới tuyến giao của những nhân viên bị lọc vẫn hiện nguyên trên bản đồ — không đúng ý muốn
//     "lọc cả hạng mục Tuyến giao nhân viên". SỬA: đổi tên state.staffLabelStatusFilter thành
//     state.staffStatusFilter (dùng CHUNG cho cả nhóm, không riêng nhãn tên nữa), đổi mặc định từ
//     "cả 4 nhóm đều tick" sang CHỈ "Đang làm việc" tick sẵn — 3 nhóm còn lại mặc định TẮT (khác
//     hẳn v1.7.13). Bộ lọc giờ áp dụng cho ĐỦ 6 lớp MapLibre thuộc "Tuyến giao nhân viên": chấm
//     lõi + chấm viền cảnh báo (staff-dot-core/-ring), đường viền tuyến giao chính/phụ
//     (staff-territory-line-primary/-secondary), lớp bắt sự kiện bấm chọn (staff-territory-
//     hitline), và nhãn tên (staff-territory-label-text) — thông qua staffLayerFilterWithStatus_()
//     kết hợp filter GỐC của từng lớp (VD isPrimary/ringType) với filter trạng thái bằng
//     ['all', filterGốc, filterTrạngThái] để KHÔNG đè mất filter gốc đang có. CỐ Ý KHÔNG áp bộ lọc
//     này cho lớp highlight khi bấm chọn thủ công (staff-territory-selected-line) và lớp vùng bao
//     (staff-territory-hull-fill/-line) — bấm chọn 1 tuyến giao cụ thể vẫn phải thấy được dù
//     người đó đang bị lọc ẩn khỏi hiển thị chung, tránh vô lý "bấm chọn được nhưng không hiện gì
//     cả". Khối chọn 4 checkbox trạng thái cũng dời từ dưới "🏷️ Hiện tên nhân viên" lên ngay dưới
//     tiêu đề nhóm "Tuyến giao nhân viên" — đúng vị trí phản ánh "cả hạng mục" chứ không riêng
//     mục con nào. Test viết lại hoàn toàn: /tmp/test_staff_status_filter.js (xác nhận đúng 6 lớp
//     bị lọc, 3 lớp highlight/hull KHÔNG bị lọc, mặc định chỉ "Đang làm việc" được phép, filter
//     kết hợp đúng ['all', gốc, trạngThái], applyStaffStatusFilter_() gọi map.setFilter() đúng 6
//     lần với đúng nội dung, DOM 4 checkbox mặc định đúng vị trí + đúng trạng thái tick).
//  2) THIẾT KẾ LẠI theo yêu cầu: "ảnh số 2 phần định biên đang thiết kế chưa đẹp... cho vào thành
//     1 cái bảng gồm các cột Xã phường/TB Lấy/Giao (tính trung bình theo ngày)/SL NV hiện có/Định
//     biên/Thiếu/Kết luận (Thiếu/Đủ) và có 1 hàng tổng bên dưới... phần nào Thiếu tô đỏ, Đủ thì tô
//     xanh, kỹ thuật lọc/sắp xếp được trong chính bảng này" — phần "Theo từng xã/phường" trong
//     popup bưu cục trước đây là 1 danh sách <div> liệt kê, đổi hẳn thành bảng HTML thật
//     (<table id="ghn-tg-ward-staffing-table">) đủ 6 cột đúng yêu cầu, có <tfoot> hàng TỔNG dùng
//     TRỰC TIẾP số liệu tổng cấp bưu cục (hubHeadcountWorking/hubDinhBien/hubThieu) — KHÔNG cộng
//     dồn lại từ các số đã làm tròn theo từng xã/phường (tránh sai số cộng dồn). Mỗi hàng tô màu
//     theo class (đỏ khi Thiếu>0, xanh khi Đủ) qua CSS .ghn-tg-ward-row--shortage/--ok. Thêm cột
//     "TB Lấy/Giao" (trung bình đơn LẤY + GIAO mỗi ngày) — trước đây computeHubStaffingStats_ chỉ
//     gộp đơn GIAO theo xã/phường (từ receiverContact.wardCode), lần này gộp THÊM đơn LẤY theo xã/
//     phường (từ senderContact.wardCode, cũng do GHN trả trực tiếp — dùng logic dự phòng khớp địa
//     chỉ text y hệt đơn giao khi thiếu wardCode). Có ô tìm kiếm lọc theo tên xã/phường
//     (#ghn-tg-ward-table-search) và bấm tiêu đề cột để sắp xếp tăng/giảm dần (số) hoặc theo bảng
//     chữ cái (tên xã/phường) — cài đặt trong wireHubStaffingTable_() mới, thuần DOM không cần
//     thư viện ngoài. Test mới: /tmp/test_hub_staffing_table.js (số liệu wardStats mới đúng, cấu
//     trúc bảng đủ 6 cột + hàng tổng, tô màu đúng theo Thiếu/Đủ kể cả tên xã/phường có ký tự đặc
//     biệt, hàng tổng dùng đúng số liệu cấp bưu cục thật chứ không cộng lại số đã làm tròn, lọc
//     theo ô tìm kiếm và sắp xếp theo cột đều đúng) — dựng bằng jsdom thật, mô phỏng sự kiện
//     input/click y như người dùng thao tác trên trình duyệt thật.
// v1.7.13 (5 việc — phản hồi kèm 3 ảnh chụp NGAY SAU khi dùng thử v1.7.12, xác nhận 3/4 việc
// của bản đó VẪN CHƯA ĐỦ, cộng 1 yêu cầu mới):
//  1) LỖI THẬT (v1.7.12 CHƯA ĐỦ): "chỉ khi nào tao không tick lớp chấm + ranh giới tuyến giao
//     thì mới hiện viền xã phường" — nghĩa là 2 lớp 'staff-territory-line-primary'/'-secondary'
//     (viền tuyến giao của MỌI nhân viên đang hiện cùng lúc) dù đã làm nhạt ở v1.7.12 (giảm
//     opacity/độ dày) VẪN đè lên đúng lớp viền hành chính 'wards-line', vì ĐƯỢC VẼ SAU (nằm
//     TRÊN trong ngăn xếp render — map.addLayer không truyền beforeId thì luôn xếp trên cùng
//     tại thời điểm add). Giảm độ mờ không giải quyết được gốc vấn đề — hàng chục viền chồng
//     lên 1 đường mảnh vẫn át hẳn nó. SỬA TẬN GỐC (đổi Z-ORDER thay vì chỉ đổi màu/độ mờ): 2 lớp
//     này giờ được chèn bằng map.addLayer(layer, 'wards-line') — tham số beforeId khiến chúng
//     LUÔN nằm NGAY DƯỚI 'wards-line', nên viền hành chính xã/phường giờ LUÔN vẽ đè lên trên,
//     rõ nét mặc định — không cần tắt hẳn checkbox "chấm - ranh giới" mới thấy được viền xã/
//     phường nữa. Lớp highlight khi bấm chọn ('staff-territory-selected-line', add SAU
//     'wards-line') vẫn nằm trên cùng nên vẫn nổi bật đúng như v1.7.12. Đã viết test mới
//     (/tmp/test_staff_map_highlight.js, mục C) trích ĐÚNG lời gọi map.addLayer từ file thật,
//     xác nhận có tham số beforeId='wards-line' — không thể tự kiểm chứng bằng mắt (không có
//     WebGL renderer thật trong môi trường này) nên đây là cách kiểm chứng tốt nhất có thể.
//  2) "bỏ tắt mặc định phần hiện ranh giới xã phường mới ... hiện tại thấy mặc định tick thì
//     phải": state.showNewBoundary mặc định TRUE (checkbox HTML #ghn-tg-newboundary-checkbox
//     cũng có sẵn thuộc tính "checked") — SỬA: đổi cả 2 chỗ về mặc định TẮT (false / bỏ
//     "checked") — dùng thì tự tick vào sau, không còn tự động rối bản đồ ngay từ đầu nữa. Test
//     mới ở mục D cùng file trên.
//  3) LỖI THẬT (v1.7.12 SỬA SAI HƯỚNG): "phần layer tên nhân viên viết sao xuống dòng, yêu cầu
//     là 1 dòng mà" — người dùng xác nhận tên VẪN xuống dòng dù v1.7.12 đã đổi 'text-max-width'
//     của lớp 'staff-territory-label-text' về 0 (tưởng đây là giá trị đặc biệt "tắt hẳn wrap").
//     KIỂM TRA LẠI kỹ thuật ngắt dòng MapLibre/Mapbox GL: 0 KHÔNG tắt wrap — thuật toán coi đó
//     là "độ rộng tối đa = 0 em" nên ngắt dòng SỚM HƠN (gần như tại MỌI khoảng trắng), tức bản
//     v1.7.12 vô tình làm ĐÚNG NGƯỢC LẠI ý muốn (không phải "không sửa được", mà là "sửa sai
//     hướng"). SỬA ĐÚNG: đổi 'text-max-width' thành 40 (em, một số RẤT LỚN, đủ chứa tên người
//     Việt dài nhất + hậu tố trạng thái) — đây là cách chuẩn để "vô hiệu hoá" wrap trong thực tế
//     vì bản thân style-spec của MapLibre/Mapbox không có giá trị nào nghĩa đen là "tắt hẳn".
//     Test cập nhật lại đúng giá trị mong đợi (40, không phải 0) ở /tmp/test_staff_map_highlight.js.
//  4) YÊU CẦU MỚI — ĐỐI CHIẾU Mã nhân viên với ID bưu cục cho "Hiện có": ví dụ thật cụ thể "Vi
//     Trường An" thuộc biên chế bưu cục 23021000 - (THN) Phú Bình 1 (theo sheet HRM, cột
//     buuCuc) nhưng ĐI HỖ TRỢ TẠM THỜI bưu cục 22410000 - (THN) Phú Bình 2 (có dữ liệu tuyến
//     giao dưới bưu cục đó) — bản v1.7.10 CHỈ xét "có dữ liệu tuyến giao dưới bưu cục này" nên
//     đếm NHẦM Vi Trường An là nhân sự CƠ HỮU của Phú Bình 2, trong khi thực chất KHÔNG PHẢI.
//     SỬA: "Hiện có" (computeHubStaffingStats_, cả cấp bưu cục hubHeadcountWorking LẪN cấp xã/
//     phường wardHeadcount) giờ phải thoả CẢ 3 điều kiện — (a) có dữ liệu tuyến giao dưới bưu
//     cục ĐANG XEM trong khoảng ngày đang xem (giữ nguyên yêu cầu "đang đi làm" v1.7.10) — (b)
//     KHÔNG phải đã nghỉ việc/tạm nghỉ theo HRM (giữ nguyên, "nhân viên hiện có phải là nhân
//     viên còn đang làm việc") — (c) MỚI: mã bưu cục "nhà" theo HRM (cột buuCuc, tách bằng
//     hrmHomeHubCode_(), cùng cách tách "hub_code - hub_name" đã dùng ở hubHeadcountRoster) phải
//     TRÙNG với bưu cục đang xem (hàm belongsToThisHub_() mới trong computeHubStaffingStats_) —
//     KHÔNG tra được HRM cho driverId đó thì vẫn giữ tính như cũ (không đủ căn cứ để loại, tránh
//     đếm thiếu khi thiếu dữ liệu). LƯU Ý: giaoTotal (khối lượng công việc THẬT của xã/phường,
//     dùng làm tử số định biên) VẪN cộng đủ đơn của người đi hỗ trợ — chỉ "Hiện có" (đếm nhân sự
//     CƠ HỮU) là bị loại, không phải khối lượng công việc "biến mất". Đã thêm kịch bản 4 vào
//     /tmp/test_hub_staffing.js mô phỏng ĐÚNG ví dụ "Vi Trường An" (trip data dưới bưu cục A,
//     buuCuc trỏ về bưu cục B) — xác nhận B không đếm sai, và bưu cục B (nhà thật) cũng KHÔNG tự
//     nhiên có "Hiện có" chỉ vì buuCuc khớp (vẫn cần dữ liệu tuyến giao thật ở đó, đúng nguyên
//     tắc v1.7.10).
//  5) YÊU CẦU MỚI (bổ sung ngay sau, cùng luồng góp ý) — bộ lọc TÊN nhân viên hiện trên bản đồ
//     theo "trạng thái làm việc": thêm 4 checkbox mới (mặc định tick sẵn cả 4, không đổi hành vi
//     cũ cho tới khi người dùng tự bỏ tick) lồng dưới checkbox "🏷️ Hiện tên nhân viên" — "Đang
//     làm việc" / "Nghỉ việc" / "Tạm Nghỉ" / "Hỗ trợ/Điều chuyển" (nhóm MỚI, DÙNG CHUNG đúng 1
//     định nghĩa với việc (4) ở trên — nhân viên có dữ liệu chuyến ở bưu cục đang xem nhưng
//     buuCuc theo HRM là bưu cục KHÁC, xem staffWorkStatusCategory_()). Lớp
//     'staff-territory-label-text' giờ có thêm filter theo state.staffLabelStatusFilter (áp qua
//     staffLabelStatusFilterExpression_/applyStaffLabelStatusFilter_, cập nhật ngay khi tick/bỏ
//     tick từng ô — không cần bấm gì thêm). Popup chấm nhân viên cũng thêm 1 dòng cam nổi bật
//     "🔀 Đi hỗ trợ — thuộc biên chế bưu cục X" khi rơi vào nhóm "Hỗ trợ/Điều chuyển", để người
//     xem hiểu ngay vì sao người này không tính vào "Hiện có" của bưu cục đang xem. Test mới:
//     /tmp/test_staff_status_filter.js (phân loại đúng 4 nhóm, filter MapLibre dựng đúng theo
//     checkbox, DOM đủ 4 checkbox lồng đúng chỗ mặc định tick, wireMapControls_ gắn đúng sự
//     kiện) — dựng bằng jsdom thật + trích hàm thật từ file, không hardcode lại logic.
// v1.7.12 (4 việc — phản hồi kèm 7 ảnh chụp: gợi ý lịch sử Chrome đè lên ô tìm bưu cục, tên
// nhân viên xuống dòng, popup Nhân sự/Định biên bưu cục, bản đồ tổng quan rối, popup + bản đồ
// zoom gần "Dương Văn Anh" không/có hiện viền tuyến giao):
//  1) LỖI THẬT: ô tìm kiếm "Bưu cục"/"Nhân viên" bị Chrome tự hiện dropdown gợi ý từ LỊCH SỬ
//     đã gõ trước đó (ảnh chụp "phú"/"phú bình"), ĐÈ LÊN danh sách bưu cục thật bên dưới —
//     "LIÊN tục có phần gợi ý... gây cản trở cho việc tìm kiếm". SỬA: thêm autocomplete="off"
//     cho cả 2 input (chuẩn HTML, input text thường KHÔNG có thuộc tính này thì Chrome mặc
//     định BẬT gợi ý lịch sử, không riêng gì form đăng nhập).
//  2) LỖI THẬT: tên nhân viên dài (VD "Nguyễn Thành Vinh (Nghỉ việc)") vẫn tự XUỐNG DÒNG giữa
//     chừng dù v1.7.6 đã đổi khoảng trắng NỐI hậu tố "(Nghỉ việc)"/"(Tạm nghỉ)" sang khoảng
//     trắng không ngắt dòng (U+00A0) — vì khoảng trắng NỘI BỘ giữa các từ trong chính TÊN (VD
//     giữa "Thành" và "Vinh") vẫn là khoảng trắng thường, và 'text-max-width' cũ (12 em) vẫn
//     ép ngắt dòng tại đó khi tên dài vượt quá. Yêu cầu rõ: "tên nhân viên để kéo dài ra, đừng
//     xuống dòng, cả phần (nghỉ việc) cũng nằm 1 hàng luôn". SỬA TẬN GỐC: đổi hẳn
//     'text-max-width' của lớp 'staff-territory-label-text' về 0 (giá trị đặc biệt của
//     MapLibre/Mapbox GL tắt HẲN wrap) — CHỈ layer này, không đụng nhãn phường/bưu cục khác.
//  3) LỖI THẬT ĐỊNH BIÊN TÍNH SAI (phản hồi trực tiếp): bản v1.7.9 lấy tử số công thức định
//     biên là "Giao TC" (chỉ đơn giao THÀNH CÔNG) — SAI, vì định biên phải phản ánh khối
//     lượng công việc CẦN LÀM, không phải phần đã xong. Người dùng xác nhận: "Định biên = tổng
//     lượng đơn CẦN GIAO của bưu cục ngày hôm đó / định mức ổn định... chứ không phải đơn GTC.
//     Nếu nhiều ngày: Định biên = tổng đơn cần giao các ngày đó / số ngày / số đơn ở mức ổn
//     định". SỬA: tử số đổi sang TỔNG MỌI đơn Giao (mọi dòng type==='DELIVER', KHÔNG lọc
//     isSucceeded — gồm cả thành công/thất bại/đang xử lý) — khớp ĐÚNG tiền lệ 'dayTotalGiao'/
//     giaoStatus_() đã dùng cho toàn bộ modul từ v1.7.2 ("phải tính là tổng đơn Giao hàng
//     trong chuyến chứ không phải chỉ tính đơn GTC"). Mẫu số ("mức ổn định" = 70/xã, 90/phường)
//     GIỮ NGUYÊN, không đổi (đã xác nhận đúng ở v1.7.9). Đã viết lại /tmp/test_hub_staffing.js
//     với kịch bản CÓ CẢ đơn thất bại/đang xử lý, tính tay bằng CẢ 2 công thức (cũ và mới) để
//     chứng minh chúng THỰC SỰ ra kết quả khác nhau (VD 1 xã: công thức mới round(210/70)=3,
//     công thức cũ (chỉ đếm thành công) sẽ SAI ra round(150/70)=2) — không phải trùng hợp cùng
//     ra 1 số che giấu lỗi không bắt được.
//  4) LỖI THẬT + YÊU CẦU KỸ THUẬT: viền tuyến giao KHÔNG LUÔN hiện khi bấm chọn 1 nhân viên
//     (ảnh chụp "ảnh 5" — bấm "Dương Văn Anh" không ra viền nào cả) dù "ảnh 6" cho thấy viền
//     ĐÁNG LẼ phải hiện — nguyên nhân: highlight khi bấm chọn TRƯỚC ĐÂY chỉ có qua lớp
//     'staff-territory-hull-fill/-line' (hình múi GPS mờ), mà lớp đó bị khoá sau checkbox
//     riêng "🗺️ Vùng giao thực tế (GPS)" (mặc định TẮT) — bấm chọn mà chưa bật sẵn checkbox
//     đó thì không thấy gì. Yêu cầu rõ: "KHI BẤM VÀO ĐỐI TƯỢNG NÀO THÌ PHẢI HIỂN THỊ/LÀM BẬT
//     LÊN ĐƯỢC RANH GIỚI/ĐƯỜNG VIỀN của mỗi đối tượng được chọn" — không phụ thuộc checkbox
//     nào khác. SỬA: thêm HẲN 1 lớp highlight MỚI 'staff-territory-selected-line' (viền vàng
//     #ffd600 dày 6px, LUÔN nổi rõ) — cùng nguyên lý với 3 lớp highlight có sẵn cho xã/phường/
//     lãnh thổ bưu cục ('wards-selected-line'/'wards-hub-highlight-line'/
//     'wards-new-selected-line') — filter theo 'territoryKey', cập nhật ngay trong
//     selectStaffTerritory_() KHÔNG qua checkbox "Vùng giao thực tế (GPS)" nữa — chỉ gắn theo
//     checkbox "chấm - ranh giới" (showStaffDots, nhất quán, không để viền mồ côi khi tắt hẳn
//     lớp chấm). ĐỒNG THỜI giảm nhạt mặc định 2 lớp viền tuyến giao vẽ cho MỌI nhân viên cùng
//     lúc (staff-territory-line-primary: 4px/0.9 -> 3px/0.75; -secondary: 2.2px/0.75 ->
//     1.6px/0.5) — phản hồi "nhiều lớp chồng lên quá" (viền tuyến giao vẽ ĐÈ trực tiếp lên
//     đúng đường viền hành chính xã/phường cho MỌI người cùng lúc, nuốt mất viền gốc) — làm
//     nền dịu bớt để viền highlight mới (đậm, nổi bật) tương phản rõ hẳn khi bấm chọn 1 người.
//     Đã viết /tmp/test_staff_map_highlight.js: (A) trích đúng đoạn định nghĩa lớp nhãn nhân
//     viên trong initMap_, xác nhận text-max-width:0 CHỈ ở lớp đó (đối chứng 3 lớp nhãn khác
//     vẫn giữ nguyên 12, không bị đụng nhầm); (B) chạy selectStaffTerritory_()/
//     applyStaffHullVisibility_()/applyStaffDotVisibility_() với 1 "map" giả lập (ghi lại mọi
//     lời gọi setFilter/setLayoutProperty), xác nhận highlight LUÔN cập nhật đúng dù
//     showStaffHull đang bật/tắt, bỏ chọn đưa filter về NO_MATCH_TOKEN, và tắt "chấm - ranh
//     giới" cũng ẩn theo lớp highlight (không mồ côi). Toàn bộ 15 file test hiện có (kể cả 12
//     file trước đó) đều PASS, không có hồi quy. LƯU Ý TRUNG THỰC: phần 4 là thay đổi paint/
//     layer MapLibre — chỉ kiểm chứng được LOGIC (đúng lớp/đúng filter/đúng thuộc tính) bằng
//     Node, KHÔNG tự chạy được trình render WebGL thật trong môi trường này để xem trực quan
//     — đề nghị người dùng xem lại trên trình duyệt thật và phản hồi nếu độ đậm/nhạt cần chỉnh
//     thêm.
// v1.7.11 (GOM GỌN bộ lọc tab "Theo Nhân Viên" — phản hồi kèm 2 ảnh chụp panel bộ lọc bưu cục
// tràn hết chiều ngang cửa sổ: "các phần tuỳ chọn ở mục nhân viên -> tối ưu lại diện tích,
// gom lên phía bên trên để dành diện tích cho mục quan trọng về năng suất, nhìn thiếu chuyên
// nghiệp quá... chọn bưu cục mà còn tràn viền, cái đó đâu cần chiếm hết cả chiều ngang đâu"):
//  1) LỖI THẬT (nguyên nhân trực tiếp gây "tràn viền" trong ảnh chụp): combobox "Bưu cục" từ
//     v1.7.6 ép trigger 'width:100%' để khớp chiều ngang khối chứa nó lúc đó — nhưng khối
//     chứa giờ là CẢ CHIỀU NGANG cửa sổ modul, nên panel xổ-xuống (rộng bằng đúng trigger —
//     xem ghnTgPositionPanel_) bị kéo theo RỘNG HẾT CẢ MÀN HÌNH dù nội dung bên trong (ô tìm
//     kiếm + danh sách bưu cục) không cần rộng vậy. Đây là LỖI KHÁC HẲN lỗi "bị cắt" đã sửa ở
//     v1.7.8 (2 lỗi dễ nhầm là 1) — SỬA: bỏ hẳn 'width:100%'/'max-width:none' khỏi trigger +
//     panel, để nhận lại đúng kích thước gọn mặc định của .ghn-tg-combo-trigger (min 170px/
//     max 260px) — Y HỆT combobox "Nhân viên" bên cạnh, không còn override riêng.
//  2) GOM TOÀN BỘ bộ lọc (Từ ngày/Đến ngày/Tải sản lượng/Dừng, Bưu cục, 🔄 làm mới danh sách
//     bưu cục, Nhân viên, Nhóm khách hàng) — trước đây trải ra 2 hàng + 1 dòng tiêu đề "Bưu
//     cục (chọn ít nhất 1):" + 1 dòng RIÊNG cho nút "🔄 Làm mới danh sách bưu cục" (4 dòng
//     LUÔN CHIẾM CHỖ trước khi thấy dữ liệu năng suất) — thành ĐÚNG 1 THANH CÔNG CỤ cố định
//     phía trên (#ghn-tg-staff-controls, tự xuống dòng nếu cửa sổ hẹp), DÙNG CHUNG đúng bộ
//     CSS macOS-style đã có sẵn cho thanh công cụ tab "Bản Đồ" (#ghn-tg-map-controls,
//     .ghn-tg-controls-sep) thay vì tạo bộ riêng — 2 tab giờ nhất quán 1 phong cách. Nút "🔄
//     Làm mới danh sách bưu cục" thu gọn thành icon (chữ đầy đủ chuyển sang tooltip/title,
//     class .ghn-tg-icon-btn mới) nằm ngay trong thanh công cụ, không còn chiếm dòng riêng.
//     Nội dung bên dưới (trạng thái tải/tổng hợp/bảng năng suất theo nhân viên) tách thành
//     khối cuộn riêng '.ghn-tg-staff-content' (flex:1) — nhường tối đa diện tích cho đúng
//     phần người dùng gọi là "mục quan trọng về năng suất".
//  Đã viết /tmp/test_staff_toolbar.js (jsdom thật, cùng kỹ thuật test_dropdown_portal.js):
//  kiểm tra cấu trúc DOM (1 thanh công cụ cố định + 1 khối cuộn riêng), CSS thật (flex-shrink:
//  0 của thanh công cụ, flex:1/overflow-y:auto của khối cuộn), ĐẶC BIỆT so sánh computed style
//  của trigger "Bưu cục" với trigger "Nhân viên" (đối chứng, chưa từng lỗi) để xác nhận 2 cái
//  giờ CÙNG kích thước — không chỉ xoá style mà vô tình vẫn lệch vì lý do khác — và xác nhận
//  bố cục 2 hàng/dòng tiêu đề cũ đã bị BỎ HẲN (không phải chỉ ẩn). Toàn bộ 14 file test hiện
//  có (kể cả 13 file trước đó) đều PASS, không có hồi quy.
// v1.7.10 (SỬA LỖI THẬT người dùng phát hiện ngay sau khi dùng v1.7.9 — phản hồi: "Hiện có =
// Nhân sự hiện đang có đi làm"):
//  LỖI: bản v1.7.9 tính "Hiện có" bằng 2 NGUỒN KHÁC NHAU cho 2 cấp — cấp xã/phường đếm ĐÚNG
//  từ dữ liệu tuyến giao thật (ai thực tế có đơn), nhưng cấp BƯU CỤC lại đếm SAI từ trạng
//  thái "ACTIVE" tĩnh trong sheet HRM (danh sách ĐĂNG KÝ trên giấy tờ) — 2 khái niệm khác
//  hẳn nhau: 1 người có thể đang "ACTIVE" trên sheet HRM nhưng mới tuyển chưa từng chạy
//  tuyến ngày nào, hoặc đã chuyển bưu cục khác mà sheet chưa cập nhật kịp -> KHÔNG PHẢI
//  "đang đi làm" đúng nghĩa người dùng yêu cầu.
//  SỬA: computeHubStaffingStats_() giờ tính "Hiện có" cấp bưu cục THỐNG NHẤT cùng 1 nguồn với
//  cấp xã/phường — đếm nhân viên (loại người đã nghỉ việc/tạm nghỉ, tra qua sheet HRM bằng
//  driverId) THỰC TẾ có ít nhất 1 dòng đơn (Lấy hoặc Giao) thuộc bưu cục này trong khoảng
//  ngày đang xem (field mới hubHeadcountWorking) — RỘNG hơn cấp xã/phường vì không đòi hỏi
//  phải đạt ngưỡng 15%/xác định được xã-phường CHÍNH. Con số ĐĂNG KÝ theo sheet HRM (field
//  hubHeadcountRoster, tên cũ hubHeadcountFromHrm) VẪN GIỮ LẠI làm tham khảo phụ — chỉ hiện
//  khi CHƯA có dữ liệu tuyến giao (không có cách nào khác để biết ai đang đi làm lúc đó), và
//  ghi rõ trong popup đây KHÔNG PHẢI số đang đi làm thật, tránh lặp lại đúng lỗi vừa sửa.
//  Đã cập nhật /tmp/test_hub_staffing.js: thêm kịch bản driverId ACTIVE-trên-sheet-nhưng-
//  chưa-từng-có-đơn (phải bị loại khỏi Hiện có) VÀ driverId đã-nghỉ-việc-nhưng-vẫn-có-đơn-
//  hôm-đó (phải bị loại khỏi Hiện có dù đơn đó vẫn cộng vào tổng sản lượng/Định biên của xã/
//  phường — khối lượng công việc đã phát sinh không đổi chỉ vì người đó sau này nghỉ việc) —
//  cả 2 kịch bản đều cho kết quả ĐÚNG với công thức mới. Toàn bộ 13 file test hiện có PASS.
// v1.7.9 (bổ sung khối "Nhân sự"/"Định biên" vào popup bưu cục — phản hồi kèm ảnh chụp popup
// "🏢 (THN) Phú Bình 1"):
//  1) THÊM dòng "🏘️ Tổng xã/phường phụ trách: N" (làm rõ nghĩa của n_wards đã có sẵn, đặt
//     ngay dưới khối Tổng Lấy/Tổng Giao theo đúng yêu cầu).
//  2) THÊM dòng "🚚 Tổng GTC / LTC" (Giao thành công / Lấy thành công) — gộp CẢ khoảng ngày
//     đang tải ở tab "Theo Nhân Viên" cho đúng bưu cục này; nếu khoảng ngày đang xem >1 ngày,
//     hiện THÊM trung bình/ngày bên cạnh (VD "TB 480 GTC / 15 LTC mỗi ngày, gộp 2 ngày").
//     Dữ liệu lấy TRỰC TIẾP từ state.staffRawRows (SỐNG, đổi theo khoảng ngày/bưu cục đang
//     tải) — KHÁC HẲN 2 dòng Tổng Lấy/Tổng Giao phía trên (lấy TĨNH từ hubs.json, không đổi
//     theo ngày) — nếu tab "Theo Nhân Viên" CHƯA từng tải dữ liệu cho bưu cục này, hiện đúng 1
//     dòng ghi chú hướng dẫn thay vì giả vờ hiện số 0 (dễ hiểu lầm "bưu cục không có việc").
//  3) THÊM khối "👥 Nhân sự" — Hiện có / Định biên cần / Thiếu — CẢ cấp bưu cục lẫn TỪNG
//     xã/phường bưu cục đó phụ trách, số "Thiếu" > 0 bôi ĐỎ đậm, = 0 hiện "✓ Đủ định biên"
//     màu xanh — thiết kế lại thành khung tóm tắt nền xám nhẹ (cấp bưu cục) + danh sách
//     zebra-stripe từng dòng 1 xã/phường (cấp xã/phường) để dễ dò mắt khi bưu cục có nhiều
//     xã/phường, tránh đúng lỗi "rối" người dùng đã cảnh báo trước. Công thức Định biên: đã
//     hỏi lại người dùng rõ ràng, được xác nhận "không lấy điểm giữa, mà điểm tiệm cận trên,
//     ví dụ xã 40-70 thì lấy 70, phường 50-90 thì lấy 90" — TÁI DÙNG đúng
//     THRESHOLDS_.giaoXa.yellowMin (70) / THRESHOLDS_.giaoPhuong.yellowMin (90) đã có sẵn cho
//     cả modul làm "mức ổn định"/người/ngày; Định biên = ROUND(tổng Giao TC xã đó / số ngày /
//     mức ổn định), LUÔN là số nguyên đúng yêu cầu. GIẢ ĐỊNH (CHƯA hỏi lại lần 2 — nêu rõ ở
//     đây để dễ sửa nếu không đúng ý): cơ sở đơn CHỈ tính Giao TC, KHÔNG gộp thêm Lấy TC.
//     "Hiện có" DÙNG 2 NGUỒN KHÁC NHAU (đã caveat rõ trong changelog, không giấu): cấp bưu
//     cục đếm theo sheet "HRM" (cột "Bưu cục" khớp mã, trạng thái ACTIVE — có sẵn dù CHƯA tải
//     dữ liệu tuyến giao); cấp xã/phường suy ra từ chính dữ liệu tuyến giao đang tải (đếm
//     nhân viên có xã/phường CHÍNH = xã/phường đó, dùng ĐÚNG pipeline computeStaffTerritories_
//     đã dùng để đặt chấm trên bản đồ — nên luôn khớp số chấm hiện có) — 2 con số này có thể
//     KHÔNG cộng khớp tuyệt đối vì khác nguồn, không che giấu sự khác biệt này.
//     KỸ THUẬT (tránh 1 lỗi tưởng-đúng): KHÔNG dùng lại computeStaffWardAssignments_() để
//     cộng "tổng đơn của xã/phường" — hàm đó CHỈ trả xã/phường đạt ngưỡng ≥15% tổng đơn/ngày
//     của 1 nhân viên (dùng để CHỌN tuyến giao chính/phụ đặt chấm trên bản đồ), dùng lại sẽ BỎ
//     SÓT mọi đơn ở xã/phường <15% share, làm SAI THẤP sản lượng thật của xã/phường đó — viết
//     hàm MỚI computeHubStaffingStats_() cộng dồn TRỰC TIẾP mọi đơn Giao TC theo xã/phường,
//     không lọc ngưỡng, riêng cho mục đích tính định biên này.
//     Đã kiểm chứng bằng Node test (/tmp/test_hub_staffing.js, trích hàm thật từ file, không
//     hardcode lại công thức): (a) 1 ngày — 1 xã 210 đơn/1 người → định biên 3, thiếu 2 (bôi
//     đỏ); 1 phường 270 đơn/3 người → định biên 3, thiếu 0 (đủ định biên); (b) gộp 2 ngày —
//     tổng/trung bình GTC-LTC đúng gấp đôi/giữ nguyên trung bình, ĐỊNH BIÊN TỪNG XÃ/PHƯỜNG
//     KHÔNG bị nhân đôi giả tạo (so theo trung bình/ngày, đúng quy ước đã có từ v1.7.4); (c)
//     bưu cục CHƯA từng tải dữ liệu tuyến giao — hasTripData=false, không suy diễn số liệu
//     giả. Toàn bộ 13 file test hiện có (kể cả 2 file mới v1.7.6/v1.7.8) vẫn PASS, không có
//     hồi quy.
// v1.7.8 (4 việc — phản hồi trải nghiệm sau khi dùng v1.7.7, kèm 4 ảnh chụp: cửa sổ modul
// đầy đủ, màn hình "Đang kiểm tra quyền truy cập", panel bộ lọc bưu cục bị cắt, bản đồ zoom
// rộng bị rối nhãn):
//  1) TỐI ƯU KHÔNG GIAN BẢN ĐỒ (phản hồi "khoảng không gian cho hiển thị bản đồ khá là ít"):
//     thanh điều khiển trước đây LUÔN HIỆN 2 hàng (hàng điều khiển 8 checkbox trải ngang, có
//     lúc tràn xuống dòng 2-3 khi cửa sổ hẹp + hàng chú thích dài dằng dặc bên dưới) chiếm
//     mất một phần đáng kể chiều cao dành cho bản đồ. Gộp lại còn ĐÚNG 1 HÀNG THẤP GỌN kiểu
//     thanh công cụ macOS: 8 checkbox ranh giới/nhãn/tuyến giao gộp vào 1 nút xổ-xuống "🗂️
//     Lớp hiển thị" (checklist chỉ hiện khi bấm mở), toàn bộ chú giải màu sắc gộp vào 1 nút
//     "ℹ️ Chú thích" (popup chỉ hiện khi bấm mở, nội dung/giải thích từng mục GIỮ NGUYÊN như
//     cũ) — xem buildMapPanel_.
//  2) POPUP "🔒 Đang kiểm tra quyền truy cập..." GIỮA MÀN HÌNH (phản hồi "thiếu chuyên
//     nghiệp" khi trước đây chỉ là dòng chữ nằm im trong khung cửa sổ modul): dùng lại đúng
//     bố cục overlay-giữa-màn-hình đã có sẵn cho popup "🔐 Quản Trị Phân Quyền"
//     (position:fixed;inset:0, appendChild thẳng vào <body>, có spinner xoay) — xem
//     openWindow_, dọn overlay này ở CẢ 2 đường ra (xác thực xong HOẶC bấm Đóng trong lúc
//     đang chờ).
//  3) LỖI THẬT (ảnh chụp: nút "Xoá đã chọn"/"Xong" trong panel "Bưu cục" bị cắt mất, "như
//     đang bị ẩn dưới 1 layer"): panel combobox vốn 'position:absolute' nên bị GIỚI HẠN bởi
//     khối cha bọc ngoài (div nội dung tab "Theo Nhân Viên", có 'overflow-y:auto' để cuộn cả
//     tab) — phần panel tràn ra ngoài ranh giới khối cha bị CẮT MẤT dù toạ độ vẫn đúng. SỬA
//     TẬN GỐC bằng kỹ thuật "portal" DÙNG CHUNG cho MỌI panel xổ-xuống trong modul (Lớp hiển
//     thị/Chú thích/Nhân viên/Bưu cục, không riêng gì combobox vừa báo lỗi — tránh lặp lại ở
//     chỗ khác): khi mở, panel được chuyển thành con TRỰC TIẾP của <body> với
//     'position:fixed', toạ độ tính lại bằng JS theo đúng vị trí nút bấm trên MÀN HÌNH THẬT
//     (getBoundingClientRect, tự lật lên trên nếu tràn xuống dưới màn hình) — thoát HẲN mọi
//     vùng overflow của bất kỳ khối cha nào — xem ghnTgRegisterDropdown_/ghnTgPositionPanel_/
//     ghnTgEnsurePortal_. Cư xử thêm kiểu menu thanh công cụ macOS: mở panel nào thì panel
//     KHÁC đang mở tự đóng lại. Đã kiểm chứng bằng test Node dùng jsdom THẬT (không mock DOM
//     tay) — test_dropdown_portal.js — xác nhận panel thoát khỏi khối cha overflow:hidden,
//     computed position:fixed đúng từ CSS thật, toggle/đóng-lẫn-nhau/click-ngoài/click-trong
//     panel đều đúng, và mở-lại-modul-nhiều-lần không bị lẫn panel "mồ côi" cũ trùng id (dọn
//     bằng ghnTgCleanupPortaledDropdowns_ lúc bấm Đóng).
//  4) GIỚI HẠN ZOOM cho 4 lớp nhãn (phản hồi "màn hình bản đồ zoom to lên nhìn rối quá... zoom
//     to hiển thị tên tỉnh, zoom dần vào thì tên bưu cục..., nhãn không được chèn lên nhau"):
//     trước đây nhãn phường/bưu cục/nhân viên LUÔN vẽ ở MỌI mức zoom hễ checkbox tương ứng
//     bật — xem ở mức zoom TOÀN VÙNG (nhiều tỉnh, như ảnh chụp) thì hàng chục/hàng trăm nhãn
//     cùng lọt vào khung hình vẫn rối dù MapLibre đã tự né chữ chồng nhau (mỗi ô chỉ hiện 1
//     tên, phần còn lại ẩn LOẠN XẠ không theo quy luật). SỬA bằng 'minzoom' trên từng lớp
//     symbol — chữ tên PHƯỜNG (771 phường, minzoom 11 — chỉ vẽ khi đã zoom tới mức quận/
//     huyện/cụm phường) muộn hơn chữ tên BƯU CỤC/NHÂN VIÊN (59 bưu cục — ít hơn nhiều,
//     minzoom 8 — hiện sớm hơn từ mức tỉnh/nhóm huyện trở lên); nền bản đồ gốc (OpenFreeMap)
//     đã tự có sẵn tên tỉnh/thành phố ở mức zoom thấp nên không cần tự vẽ thêm lớp tên tỉnh
//     riêng. Zoom càng gần thì càng nhiều lớp nhãn "mở khoá" dần theo đúng logic người dùng
//     đề xuất, không còn chồng chữ khi mở modul ở mức zoom rộng mặc định.
// v1.7.7 (sửa TIẾP nhãn tên nhân viên trên bản đồ — phản hồi ngay sau v1.7.6, kèm ảnh chụp
// 3 chấm nhân viên đứng sát nhau: "Nguyễn Văn Chung"/"Lê Đình Chung"/... (Nghỉ việc) hiện chữ
// chồng đè lên nhau đọc không nổi, "phần nhãn này nó đang rối hết với nhau"):
//  1) NGUYÊN NHÂN GỐC: bản v1.7.4 sửa lỗi "tên nhân viên KHÔNG HIỆN gần nhãn tên phường" bằng
//     cách bật 'text-allow-overlap'+'text-ignore-placement' = true cho lớp 'staff-territory-
//     label-text' — nhưng cách đó khiến lớp này bỏ qua MỌI va chạm, KỂ CẢ va chạm với CHÍNH
//     NÓ (nhiều chấm nhân viên đứng sát nhau) — nên khi 3+ chấm gần nhau, MapLibre cưỡng ép
//     hiện HẾT chữ chồng lên nhau, không còn phân biệt được nhãn nào của ai.
//  2) SỬA ĐÚNG GỐC (khác cách chữa cháy tạm ở v1.7.4): đổi lớp 'staff-territory-label-text' về
//     lại va chạm MẶC ĐỊNH (allow-overlap/ignore-placement đều false — có va chạm thật thì
//     NHƯỜNG đúng chuẩn MapLibre, không cưỡng ép chồng chữ nữa). Để KHÔNG tái lỗi v1.7.4 (bị
//     nhãn phường/bưu cục add TRƯỚC chặn mất chỗ), chuyển hướng: đánh dấu 'text-ignore-
//     placement': true trên CHÍNH 3 lớp nhãn phường/bưu cục ('wards-old-labels'/'wards-new-
//     labels'/'hubs-labels', add TRƯỚC lớp nhân viên) — nghĩa là 3 lớp đó không còn "chiếm
//     chỗ" cản trở lớp nhân viên add SAU nữa (nhãn nhân viên LUÔN thắng, không bao giờ bị nhãn
//     phường/bưu cục che — giữ đúng yêu cầu v1.7.4), trong khi lớp nhân viên vẫn giữ va chạm
//     CHUẨN với CHÍNH NÓ (các chấm nhân viên tự động NÉ NHAU khi đứng sát, không còn chồng chữ
//     — đúng yêu cầu v1.7.6/v1.7.7 "rõ ràng về nhãn tên nhân viên").
//  3) Thêm 'symbol-sort-key' cho lớp nhãn nhân viên — quyết định GIỮ LẠI nhãn nào khi vài chấm
//     tranh cùng 1 chỗ hiện: nhân viên đang CẢNH BÁO (đỏ = quá tải, vàng = trung bình) luôn
//     được ưu tiên hiện tên TRƯỚC nhân viên bình thường (xanh)/đã nghỉ (xám) — thông tin quan
//     trọng (ai đang có vấn đề) không bị nhãn của người bình thường "giành chỗ" che mất. Nhãn
//     nào tạm thời bị nhường chỗ (do quá đông chấm ở cùng khu vực tại mức zoom hiện tại) vẫn
//     xem lại được bằng cách zoom vào gần hơn — chấm giãn ra xa nhau hơn trên màn hình, hết va
//     chạm, tự hiện lại — đúng hành vi chuẩn của bản đồ (giống nhãn địa danh/POI trên mọi bản
//     đồ khác, không riêng modul này).
//     [Lưu ý: đây là thay đổi ở TẦNG RENDER bản đồ (MapLibre GL, chạy trong trình duyệt) nên
//     KHÔNG kiểm chứng được bằng test Node như các phần logic tính toán khác của modul — đã
//     rà lại kỹ toàn bộ 4 lớp nhãn (symbol layer) trong file, xác nhận không còn lớp nào khác
//     ngoài 3 lớp phường/bưu cục + lớp nhân viên, và cú pháp file vẫn hợp lệ (node --check) —
//     nhờ bạn test lại trực tiếp trên bản đồ thật, đặc biệt đúng khu vực 3 chấm sát nhau trong
//     ảnh chụp vừa gửi.]
// v1.7.6 (3 lỗi phát hiện khi test v1.7.5 trên dữ liệu THẬT, kèm ảnh chụp bảng/bản đồ thật):
//  1) LỖI THẬT NGHIÊM TRỌNG: bảng "Theo Nhân Viên", nút "+" xem chi tiết khớp xã/phường LUÔN
//     hiện "Không có đơn giao nào trong ngày." dù dòng cha vẫn hiện đúng Giao TC/Giao thất
//     bại > 0 (VD thật người dùng gửi: Bùi Việt Hà 47/41, Hoàng Thị Thêu 69/63, ngày
//     2026-08-24, bưu cục (THN) Vạn Xuân). Nguyên nhân: renderStaffTable_() XÂY wardDebugMap
//     với key `${a.staffKey}${a.tripDate}` (có ký tự phân tách U+0001 để tránh 2 chuỗi
//     staffKey/tripDate khác nhau ghép dính lại trùng nhau), nhưng dòng TRA CỨU lại ghép
//     thẳng `${a.staffKey}${a.tripDate}` — THIẾU hẳn ký tự phân tách U+0001 — nên 2 chuỗi khoá KHÔNG BAO GIỜ
//     khớp nhau, mọi lần tra đều miss, wardDebugHtml_(null) luôn trả về thông báo "không có
//     đơn giao nào" bất kể dữ liệu thật có hay không. Đây là lỗi CÓ SẴN TỪ TRƯỚC (không phải
//     do các thay đổi driverId/dayCount ở v1.7.4/v1.7.5), chỉ tình cờ được phát hiện khi test
//     lần này. SỬA: thêm lại đúng ký tự U+0001 vào dòng tra cứu cho khớp với dòng xây key. Đã kiểm
//     chứng bằng test Node (test_ward_debug_map_key.js) — tái tạo đúng 2 dòng code thật từ
//     file (không hardcode lại) để nếu sau này ai sửa lệch lại 1 trong 2 dòng, test sẽ báo đỏ
//     ngay; đã xác nhận trước khi sửa test này FAIL đúng như lỗi người dùng báo, sau khi sửa
//     PASS.
//  2) SỬA bộ lọc "Bưu cục" (phản hồi: "không để phần hiển thị mấy cái nút chọn bưu cục => mà
//     danh sách xổ xuống và chọn... cho tìm kiếm và nút chọn, nút xoá danh sách đã chọn"):
//     thay danh sách checkbox LUÔN HIỆN (chiếm nhiều diện tích, y hệt bộ lọc "Nhân viên" cũ
//     trước v1.7.5) bằng combobox xổ-xuống ĐA CHỌN dùng chung khung .ghn-tg-combo — gọn khi
//     đóng, bấm mở mới hiện ô tìm kiếm + danh sách checkbox cuộn được (renderHubComboList_),
//     nút trigger hiện "N bưu cục đã chọn" (updateHubComboTriggerLabel_), có thêm nút "🗑️ Xoá
//     danh sách đã chọn" (xoá toàn bộ state.staffHubSelection) và nút "Xong" để đóng panel —
//     KHÁC combobox "Nhân viên" (đơn chọn, tự đóng sau khi chọn 1 mục) ở chỗ đây là ĐA CHỌN
//     nên panel KHÔNG tự đóng sau mỗi lần tick, để tick liên tiếp nhiều bưu cục cho tiện.
//  3) SỬA layout tên nhân viên trên bản đồ bị XUỐNG DÒNG khi có hậu tố trạng thái nghỉ (VD
//     ảnh chụp "Đinh Ngọc Hưng (Nghỉ việc)" xuống dòng 2 rồi CHÈN/ĐÈ lên nhãn nhân viên khác ở
//     gần đó — "Nguyễn Lê Hùng"/"Nguyễn Văn Bình"). Nguyên nhân: lớp 'staff-territory-label-
//     text' có 'text-max-width': 12 (thêm ở v1.7.3 để tên dài tự xuống dòng thoáng hơn) —
//     khoảng trắng THƯỜNG nối giữa tên và hậu tố "(...)" bị MapLibre coi là điểm ngắt dòng hợp
//     lệ, cộng với 'text-allow-overlap': true (thêm ở v1.7.4) khiến nhãn xuống dòng vẫn LUÔN
//     hiện đè lên nhãn khác thay vì bị ẩn đi. SỬA: driverLabelText (computeStaffDotFeatures_)
//     giờ nối tên với hậu tố bằng khoảng trắng KHÔNG NGẮT DÒNG (U+00A0) thay vì khoảng trắng
//     thường — cả khoảng trắng TRƯỚC dấu "(" lẫn khoảng trắng NỘI BỘ trong hậu tố (VD giữa
//     "Nghỉ" và "việc)") — MapLibre chỉ ngắt dòng tại khoảng trắng thường nên hậu tố giờ LUÔN
//     dính liền 1 dòng với tên, "kéo dài cùng với tên chứ không xuống dòng" đúng yêu cầu.
//     Khoảng trắng NỘI BỘ trong driverName KHÔNG đổi — tên rất dài (hiếm) vẫn tự xuống dòng
//     bình thường như trước, chỉ riêng hậu tố trạng thái là không bị tách rời khỏi dòng cuối.
// v1.7.5 (tích hợp sheet "HRM" có sẵn để hiện TRẠNG THÁI NHÂN SỰ trên tuyến giao, + sửa
// bộ lọc "Nhân viên" tốn diện tích):
//  1) LỖI THỰC TẾ: nhân viên ĐÃ NGHỈ VIỆC vẫn hiện chấm/tên BÌNH THƯỜNG trên bản đồ (vì
//     dữ liệu chuyến vẫn tồn tại trong khoảng ngày đang xem, dù người đó nghỉ SAU đó) — dễ
//     nhầm "vẫn còn nhân viên này". SỬA bằng cách tích hợp CHỈ ĐỌC sheet "HRM" đã có sẵn
//     trong Sheet (cột A:N, người dùng tự quản lý — module KHÔNG BAO GIỜ ghi gì vào đó):
//     thêm action getHrm trong GAS_TUYEN_GIAO.gs (readHrmRows_/getHrm_, đọc cột A:L, bỏ M
//     "Thâm niên" mã bậc nội bộ + N "SP Tear" không dùng), client tải 1 lần khi mở modul
//     (loadHrmData_, chạy song song KHÔNG chặn bản đồ chính) vào state.hrmByDriverId — khớp
//     với dữ liệu chuyến qua đúng cột A "ID" == driverId (GHN trả về trong chi tiết chuyến),
//     CÙNG hệ mã nhân viên nội bộ GHN, đã xác nhận với người dùng.
//  2) CHẤM + TÊN chuyển XÁM khi nhân viên "Nghỉ việc"/"Tạm nghỉ": computeStaffTerritories_()
//     tra HRM theo driverId, nếu isInactive thì GHI ĐÈ coreColor='gray' + ringType='none' —
//     'gray' KHÔNG có trong bất kỳ match-expression màu nào ở initMap_ (chỉ liệt kê
//     'red'/'yellow'/'green') nên MapLibre tự rơi về đúng màu FALLBACK đã có sẵn từ trước
//     ('#9e9e9e' xám cho chấm/viền tuyến, '#424242' xám đậm cho chữ tên) — hoàn toàn KHÔNG
//     cần sửa bất kỳ paint expression nào của 4 lớp staff-dot-core/staff-territory-line-
//     primary/-secondary/staff-territory-hull-line. Tắt luôn vòng sáng cảnh báo quá tải/
//     thiếu đơn (không còn ý nghĩa với người đã nghỉ). Đã kiểm chứng bằng test Node: nhân
//     viên ACTIVE quá tải vẫn ra đúng coreColor=red/ringType=over như trước (KHÔNG bị ảnh
//     hưởng); nhân viên NGHỈ VIỆC/TẠM NGHỈ với CÙNG số liệu quá tải bị ép đúng
//     coreColor=gray/ringType=none, còn giaoStatus (dùng cho DÒNG CHỮ trạng thái trong
//     popup) vẫn giữ nguyên đúng bản chất số liệu — chỉ MÀU trên bản đồ bị ép xám, không
//     che giấu số liệu thật.
//  3) TÊN TRÊN BẢN ĐỒ hiện thêm trạng thái nghỉ ngay cạnh tên (VD "Lê Huy Hoàng (Nghỉ
//     việc)") — không chỉ trong popup: lớp 'staff-territory-label-text' đổi text-field từ
//     driverName trần sang driverLabelText (driverName + hậu tố "(Nghỉ việc)"/"(Tạm nghỉ)"
//     nếu isInactive, tính sẵn trong computeStaffDotFeatures_).
//  4) POPUP bản đồ + BẢNG "Theo Nhân Viên" đều thêm dòng/cột "Trạng thái NV" cho MỌI nhân
//     viên (không chỉ người đã nghỉ) — gồm trạng thái làm việc (🟢 Đang làm việc/🔴 Tạm
//     nghỉ/⚫ Nghỉ việc, đúng màu người dùng yêu cầu), ngày vào làm, và THÂM NIÊN tự tính
//     "X năm Y tháng" (formatSeniority_) từ ngày vào làm tới ngày nghỉ việc (nếu đã nghỉ)
//     hoặc tới HÔM NAY (nếu đang làm) — KHÔNG dùng lại cột M "Thâm niên" có sẵn trong sheet
//     HRM vì đó là MÃ BẬC nội bộ (VD "G01: Dưới 1 tháng"), không đúng định dạng yêu cầu.
//     Chưa tìm thấy driverId trong sheet HRM (VD nhân viên mới) -> hiện ghi chú xám nhạt
//     "(chưa có dữ liệu nhân sự)", không chặn/lỗi gì.
//  5) SỬA bộ lọc "Nhân viên" (phản hồi: "quá tốn diện tích"): thay <select> native (xổ ra
//     danh sách DÀI cả trăm nhân viên, KHÔNG tìm kiếm được, chiếm hết màn hình khi mở) bằng
//     combobox tự vẽ — gọn khi đóng (như 1 nút bấm thường), bấm mở mới hiện ô tìm kiếm (gõ
//     lọc realtime theo tên HOẶC mã nhân viên, không phân biệt dấu/hoa-thường) + danh sách
//     cuộn được, có hiện sẵn badge trạng thái nghỉ ngay trong danh sách chọn. Click ra
//     ngoài panel tự đóng lại.
// v1.7.4 (2 lỗi phát hiện khi test v1.7.3 trên dữ liệu THẬT, kèm ảnh popup thật gộp 6 ngày):
//  1) LỖI THẬT NGHIÊM TRỌNG: gộp nhiều ngày báo "🔴 Quá tải" HẾT, kể cả khi khối lượng
//     thực tế không hề nhiều. Nguyên nhân: v1.7.3 đã sửa để combinedGiao tính trên
//     shared.dayTotalGiao — nhưng đó là TỔNG CỘNG DỒN cả khoảng ngày (VD gộp 6 ngày =
//     633 đơn), trong khi ngưỡng THRESHOLDS_.giaoXa/giaoPhuong (VD giaoPhuong.red=120) lại
//     THIẾT KẾ CHO ĐÚNG 1 NGÀY/1 nhân viên — so tổng 6 ngày với ngưỡng 1 ngày thì gộp từ 2
//     ngày trở lên GẦN NHƯ CHẮC CHẮN vượt ngưỡng đỏ, dù trung bình mỗi ngày hoàn toàn bình
//     thường (633/6 ≈ 105.5 đơn/ngày — vẫn nằm trong khoảng "Trung bình" nếu so đúng cách).
//     SỬA: thêm dayCount (số ngày THẬT đã gộp — buildDotComputationRows_() gắn
//     r.mergedDayCount vào từng dòng khi gộp nhiều ngày, đọc lại ở
//     computeStaffWardAssignments_() thành g.dayCount, mặc định 1 nếu là dữ liệu 1 ngày
//     bình thường — GIỮ NGUYÊN kết quả cũ khi không gộp) + dayTotalGiaoAvg = dayTotalGiao /
//     dayCount; combinedGiao giờ tính trên dayTotalGiaoAvg CHỨ KHÔNG PHẢI dayTotalGiao —
//     đúng bản chất "ngưỡng 1 ngày phải so với khối lượng bình quân 1 ngày, không phải tổng
//     dồn". dayTotalGiao (tổng thô) vẫn giữ nguyên, hiện đầy đủ trong popup để không mất
//     thông tin — CHỈ thêm phần "(TB X đơn/ngày, gộp N ngày)" ngay sau, để người xem hiểu
//     rõ số nào dùng để kết luận quá tải/thiếu đơn. Đã kiểm chứng bằng test Node riêng dựng
//     lại ĐÚNG kịch bản trong ảnh chụp (Lê Huy Hoàng, gộp 6 ngày, 633 đơn tổng) -> giờ ra
//     đúng "🟡 Trung bình" thay vì "🔴 Quá tải" giả tạo như trước; đồng thời xác nhận kịch
//     bản quá tải THẬT (450 đơn/3 ngày = 150 đơn/ngày, vượt ngưỡng đỏ phường=120) vẫn báo
//     đúng "🔴 Quá tải" — không bị "chữa cháy" thành lúc nào cũng bình thường. Dữ liệu 1
//     ngày (không gộp) hoàn toàn KHÔNG đổi hành vi (dayCount=1 -> chia 1 = không đổi gì).
//  2) LỖI THẬT (ảnh khoanh vòng tròn đen): 1 số chấm tuyến giao nhân viên trên bản đồ
//     KHÔNG HIỆN TÊN NHÂN VIÊN — không phải chữ nhỏ/bị cắt (đã sửa cỡ chữ ở v1.7.3), mà
//     RỖNG HẲN, đặc biệt ở những chấm nằm gần nhãn tên phường/bưu cục. Nguyên nhân: lớp
//     nhãn 'staff-territory-label-text' được add SAU 'wards-old-labels'/'wards-new-labels'/
//     'hubs-labels' trong initMap_() — theo cách MapLibre xử lý va chạm (collision) giữa
//     các lớp symbol, lớp add TRƯỚC được ưu tiên "giữ chỗ" trước; khi 1 chấm tên nhân viên
//     nằm đè lên vùng đã bị nhãn tên phường/bưu cục chiếm chỗ, MapLibre ẨN HẲN nhãn tên
//     nhân viên (mặc định text-allow-overlap/text-ignore-placement đều false) để tránh chữ
//     chồng chữ. Vì mục đích CHÍNH của bản đồ này là xem tuyến giao nhân viên (tên phường
//     chỉ là lớp tham khảo phụ, có thể tắt/bật), tên nhân viên phải LUÔN ưu tiên hiện — SỬA:
//     bật 'text-allow-overlap': true + 'text-ignore-placement': true cho lớp
//     'staff-territory-label-text', đảm bảo tên nhân viên không còn bị các lớp nhãn khác
//     (hoặc chính nó ở chấm lân cận) che khuất/ẩn mất nữa.
// v1.7.3 (2 yêu cầu sau khi test v1.7.2, + 1 bổ sung nhỏ gửi giữa chừng):
//  1) NHÃN TÊN PHƯỜNG/NHÂN VIÊN "hiển thị không đầy đủ khi zoom to": nguyên nhân — 4 lớp
//     symbol (wards-old-labels, wards-new-labels, hubs-labels, staff-territory-label-text)
//     đều đặt text-size CỐ ĐỊNH theo px (10/10/10/11), không tự lớn lên khi zoom bản đồ to
//     ra — trong khi hình khối (polygon/điểm) TO DẦN theo zoom, chữ vẫn giữ nguyên kích
//     thước cũ nên trông lệch tỉ lệ, khó đọc/như bị cắt. SỬA: đổi cả 4 lớp sang biểu thức
//     ['interpolate', ['linear'], ['zoom'], ...] để chữ LỚN DẦN theo đúng mức zoom (VD
//     wards: 9px ở zoom 8 -> 11px ở zoom 12 -> 15px ở zoom 16; tên nhân viên baseline cao
//     hơn 1 chút vì thường dài hơn: 10 -> 12 -> 17px), đồng thời nới text-max-width lên 12
//     (mặc định 10 em) để tên dài xuống dòng thoáng hơn thay vì bị bó hẹp.
//  2) GỘP NHIỀU NGÀY vẫn phải ra ĐÚNG 1 tuyến giao chính/nhân viên dựa trên TỔNG đơn (yêu
//     cầu: "vẫn giữ nguyên logic của 1 ngày nhưng từ 1 ngày => khi chạy nhiều ngày cần gom
//     là tổng của các ngày"). Trước đây MỌI hàm tính toán (computeStaffWardAssignments_,
//     computePickShareByStaff_, computeStaffTerritories_...) đều gộp theo khoá "staffKey +
//     tripDate" — chạy nhiều ngày thì MỖI ngày của cùng 1 nhân viên bị tính RIÊNG (ra nhiều
//     chấm/nhân viên thay vì 1 chấm dựa trên tổng, và trạng thái quá tải/thiếu đơn tính
//     trên từng ngày lẻ thay vì cả khoảng ngày). SỬA (không đụng vào bất kỳ logic tính toán
//     nào đã kiểm chứng kỹ cho trường hợp 1 ngày, tránh rủi ro sửa nhầm): thêm hàm MỚI
//     buildDotComputationRows_(rows) — nếu dữ liệu đang xem có NHIỀU tripDate khác nhau, tạo
//     bản sao NÔNG của từng dòng, GHI ĐÈ tripDate thành 1 NHÃN GỘP chung (VD "2026-08-18 →
//     2026-08-20 (gộp 3 ngày)"); nếu chỉ có 1 ngày (hoặc rỗng) thì trả về NGUYÊN VẸN mảng
//     gốc — hành vi 1 ngày giữ Y HỆT trước đây (đã có test xác nhận trả về ĐÚNG cùng
//     reference, không phải bản sao). Vì mọi hàm gộp theo khoá "staffKey+tripDate", khi tất
//     cả các dòng trong khoảng ngày đang xem cùng mang 1 nhãn tripDate gộp, chúng TỰ ĐỘNG
//     gộp thành 1 nhóm/nhân viên — tổng đơn, % từng xã/phường, trạng thái quá tải/thiếu đơn
//     (dựa trên TỔNG, đúng logic v1.7.2 đã sửa), và % chia sẻ đơn lấy đều được CỘNG DỒN đúng
//     qua các ngày. Chỉ hàm computeStaffDotFeatures_() (vẽ chấm/bản đồ) đi qua bước gộp này —
//     state.staffRawRows GỐC không hề bị đổi, nên tab "Theo Nhân Viên" vẫn hiện đúng breakdown
//     TỪNG ngày như cũ. Đã kiểm chứng bằng test Node riêng (buildDotComputationRows_): 1 ngày
//     -> không đổi gì; gộp 3 ngày 1 nhân viên (40+50+26=116 đơn, 30+35+20=85 thành công) -> ra
//     ĐÚNG 1 tuyến/nhân viên với dayTotalGiao=116, giaoStatus='yellow' (khớp chính xác kịch
//     bản 116 đơn đã kiểm chứng trong test v1.7.2); gộp nhiều ngày cho 2 nhân viên -> vẫn ra
//     2 tuyến RIÊNG (không gộp nhầm giữa các nhân viên khác nhau); % chia sẻ đơn lấy cũng
//     cộng dồn đúng qua các ngày.
//  3) (Gửi bổ sung giữa chừng) THÊM dòng "🏷️ Nhóm khách hàng (đơn lấy)" trong popup — mirror
//     đúng định dạng dòng "Nhóm khách hàng (đơn giao)" đã có (TikTok Shop/Shopee/SME/Khác),
//     nhưng đếm theo đơn LẤY thay vì đơn GIAO. Kỹ thuật: computePickShareByStaff_() giờ
//     cũng đếm thêm groupCounts {TTS, Shopee, SME, Khac} cho MỖI (nhân viên, ngày) — đếm
//     TẤT CẢ đơn lấy phát sinh (không chỉ đơn thành công, đúng cách "Nhóm khách hàng (đơn
//     giao)" đang đếm) — rồi computeStaffTerritories_() đưa vào field pickGroupCounts của
//     mỗi tuyến giao, computeStaffDotFeatures_() tách ra thành pickGroupTTS/pickGroupShopee/
//     pickGroupSME/pickGroupKhac trong properties của điểm/chấm, và staffDotPopupHtml_()
//     hiện dòng mới ngay dưới dòng "Nhóm khách hàng (đơn giao)". Đã kiểm chứng bằng test
//     Node riêng khớp đúng ví dụ người dùng đưa (TTS:21, Shopee:49, SME:42+5 chưa thành
//     công=47, Khác:0) — có phân biệt rõ v.count (chỉ đơn thành công, dùng tính % chia sẻ)
//     và groupCounts (đếm mọi đơn phát sinh, dùng hiển thị nhóm khách hàng).
// v1.7.2 (3 phản hồi tiếp theo sau khi test v1.7.1 trên dữ liệu THẬT, kèm ảnh popup thật):
//  1) LỖI THẬT (gốc của cả 2 phản hồi "quá tải/thiếu đơn tính sai" VÀ "phải dựa vào tổng
//     sản lượng nhân viên"): trạng thái tổng kết ở dòng đầu popup ("Giao cả tuyến") trước
//     đó tính bằng worstGiaoStatus_() — lấy trạng thái NẶNG NHẤT trong số CÁC XÃ/PHƯỜNG
//     THÀNH PHẦN, mỗi xã/phường tự so với ngưỡng vốn thiết kế cho CẢ NGÀY của 1 nhân viên
//     dồn hết vào 1 nơi. Với đúng số liệu người dùng đưa (Túc Duyên — chính — 85 đơn, Phan
//     Đình Phùng — phụ, chỉ nhận 21% đơn — 24 đơn): xã/phường phụ CHẮC CHẮN luôn bị coi
//     "không đủ đơn" một cách giả tạo vì tự nó có ít đơn (đúng bản chất — nó chỉ là PHẦN
//     PHỤ), kéo cả kết luận chung xuống "🔴 Không đủ đơn" dù tổng CẢ TUYẾN hôm đó tới 116
//     đơn (không hề ít). SỬA TẬN GỐC: bỏ hẳn cách "lấy xấu nhất trong các phần", đổi thành
//     đánh giá 1 LẦN DUY NHẤT trên dayTotalGiao — TỔNG đơn giao CẢ TUYẾN trong ngày (đã gồm
//     cả đơn ở xã/phường dưới ngưỡng 15%/không khớp được, đúng nghĩa "tổng đơn ĐI GIAO
//     trong chuyến" như yêu cầu — KHÔNG chỉ đếm đơn THÀNH CÔNG/GTC) — so với ĐÚNG 1 bộ
//     ngưỡng, chọn theo loại xã/phường CHÍNH. Đã tự kiểm chứng bằng Node với ĐÚNG số liệu
//     trong ảnh popup thật (85/51 + 24/14 + 7 đơn lẻ khác = 116 tổng/69 thành công) — trước
//     sửa ra "🔴 Không đủ đơn" (sai), sau sửa ra đúng "🟡 Trung bình" (116 nằm trong khoảng
//     90-120 của ngưỡng phường) — đồng thời vẫn xác nhận trường hợp THỰC SỰ ít việc (30 đơn/
//     ngày) vẫn báo đúng "không đủ đơn", trường hợp THỰC SỰ quá tải (150 đơn/ngày) vẫn báo
//     đúng "quá tải" (không sửa quá tay làm mất khả năng cảnh báo thật).
//     - Bỏ luôn tag trạng thái RIÊNG ở mỗi dòng xã/phường trong popup (từng gây hiểu lầm
//       "xã/phường này tự nó thiếu đơn") — chỉ còn ĐÚNG 1 kết luận duy nhất ở dòng đầu, mỗi
//       xã/phường bên dưới chỉ còn hiện số đơn/% đóng góp.
//     - LÀM RÕ lại phần "chạy nhiều ngày ra nhiều chấm": mỗi (nhân viên, ngày) vẫn tính
//       riêng 1 lần (dayTotalGiao/dayTotalGiaoSuccess là tổng của ĐÚNG ngày hôm đó, không
//       gộp nhiều ngày) — nếu chọn khoảng NHIỀU ngày mà chỉ thấy 1 chấm/nhân viên là do các
//       ngày đó đều rơi đúng 1 xã/phường CHÍNH giống hệt nhau nên toạ độ chấm trùng khít lên
//       nhau (không phải do hệ thống gộp lại). Việc dùng TỔNG SẢN LƯỢNG nhân viên để phân
//       định tuyến giao (yêu cầu) hiện đã đúng ở CẤP ĐỘ NGÀY (dayTotalGiao) — nếu muốn gộp
//       hẳn NHIỀU NGÀY thành 1 tuyến/kết luận duy nhất (thay vì tính riêng từng ngày rồi các
//       chấm trùng nhau), đây sẽ là 1 thay đổi thiết kế khác (đổi đơn vị gộp từ "nhân viên+
//       ngày" sang "nhân viên+cả khoảng ngày đã chọn") — xin xác nhận nếu cần làm tiếp.
//  2) Bỏ khối ghi chú kỹ thuật (chữ nhỏ, cuối popup nhân viên) theo yêu cầu — không cần
//     thiết cho người dùng cuối. Nới rộng "vòng sáng" cảnh báo (quá tải/thiếu đơn) trên bản
//     đồ: bán kính tĩnh 14 -> 18px, biên độ nhấp nháy 12-18px -> 16-24px, dễ nhìn hơn.
//  3) LỖI THẬT "tắt 1 lớp mà như chưa tắt, khó bấm vào tên bưu cục/tên nhân viên": hàm dò
//     chấm nhân viên gần điểm bấm (findStaffDotNearPoint_, tính khoảng cách pixel THUẦN TỪ
//     DỮ LIỆU JS, không qua GPU) trước đó KHÔNG kiểm tra checkbox "📍 Tuyến giao nhân viên"
//     có đang BẬT hay không trước khi chạy — vì nó không phụ thuộc lớp bản đồ có hiển thị
//     hay không, nên dù đã TẮT checkbox đó (ẩn chấm khỏi bản đồ), bấm đúng vị trí chấm TỪNG
//     Ở đó (dù không còn nhìn thấy) vẫn cướp mất click, chặn không cho bấm trúng phường/bưu
//     cục bên dưới — đúng y hệt hiện tượng "như chưa tắt". SỬA: thêm điều kiện kiểm tra
//     checkbox đang bật (state.showStaffDots) trước khi gọi hàm dò này, giống hệt điều kiện
//     đã có sẵn cho nhánh dò viền tuyến giao ngay bên dưới nó.
//
// v1.7.1 (6 lỗi/yêu cầu người dùng phát hiện khi TỰ TEST v1.7.0 trên dữ liệu THẬT —
//         kèm ảnh chụp màn hình — sửa tận gốc từng cái, có kiểm chứng Node trước khi giao):
//  1) LỖI "vào modul phải bấm sang tab khác bản đồ mới hiện" (ĐÃ TỰ KIỂM TRA CODE VÀ TÌM RA
//     GỐC): CSS .ghn-tg-panel mặc định display:none, chỉ .active mới display:flex — nhưng
//     v1.7.0 (thêm cổng phân quyền async) đã BỎ SÓT bước gán class "active" cho panel "Bản
//     Đồ" lúc mới mở modul, khiến #ghn-tg-map-container display:none ngay lúc MapLibre khởi
//     tạo — MapLibre đọc kích thước 0x0 lúc khởi tạo rồi "kẹt" ở đó, chỉ tự sửa khi có sự
//     kiện resize (đúng như bấm sang tab khác rồi quay lại mới thấy bản đồ). SỬA: gọi
//     switchTab_('map') NGAY TRƯỚC khi loadAndRenderMap_()/initMap_() chạy trong
//     openWindow_() — đúng nguyên tắc "ấn vào modul là phải tự load bản đồ".
//  2) Bỏ hẳn khối ghi chú "Bước 2..." dài ở đầu tab Theo Nhân Viên theo yêu cầu (không cần
//     thiết, chiếm chỗ) — các hướng dẫn quan trọng vẫn còn ở chú giải bản đồ (đã rút gọn,
//     xem mục 4).
//  3) LỖI THẬT "chạy sản lượng 3 ngày ra tới ~1000 chuyến dù bưu cục chỉ 13 chuyến/ngày":
//     searchTripPaged_() trước đó cố phân trang thêm (so với bản GTC gốc chỉ lấy trang 1)
//     bằng cách tăng "page" nhưng giữ "offset:0" cố định — endpoint search-trip của GHN có
//     vẻ KHÔNG phân trang đúng theo "page" như vậy, mỗi vòng lặp trả về LẶP LẠI đúng 50 mã
//     chuyến giống hệt trang trước => codes.length luôn == limit => không bao giờ dừng sớm
//     => ăn trọn 20 vòng lặp = tới 1000 mã, phần lớn TRÙNG LẶP. SỬA: (a) đổi "offset" tăng
//     dần theo trang phòng trường hợp server phân trang theo offset; (b) QUAN TRỌNG HƠN —
//     khử trùng bằng Set NGAY TRONG VÒNG LẶP + DỪNG NGAY nếu 1 trang không có mã MỚI nào —
//     đảm bảo không đếm trùng 1 chuyến đi 2 lần dù server có hỗ trợ phân trang thật hay
//     không. Đã tự kiểm chứng bằng Node (3 kịch bản: server không phân trang thật/bưu cục
//     nhỏ 39 chuyến/bưu cục lớn phân trang thật qua offset) — không còn trùng lặp, dừng sớm
//     đúng lúc thay vì lặp hết 20 trang.
//     - Thêm nút "⏹ Dừng" cạnh "📥 Tải sản lượng" — trước đây KHÔNG có cách dừng giữa chừng
//       ngoài F5 lại cả trang. fetchStaffVolumeRows_() giờ nhận thêm "isCancelled", kiểm tra
//       ở đầu mỗi bưu cục VÀ đầu mỗi lô 3 chuyến — dừng nhanh, KHÔNG mất dữ liệu đã tải được
//       tới lúc dừng (trả về rows từng phần thay vì huỷ trắng).
//     - Thêm ô "🔎 Tìm bưu cục theo tên hoặc mã..." phía trên danh sách checkbox bưu cục ở
//       tab Theo Nhân Viên (trước đây thiếu, phải kéo tay tìm trong danh sách dài) — lọc chỉ
//       ẢNH HƯỞNG HIỂN THỊ, không làm mất các bưu cục đã tick trước đó dù đang bị lọc ẩn đi.
//     - LÀM RÕ theo yêu cầu: chấm tuyến giao nhân viên tính ĐÚNG 1 CHẤM/NHÂN VIÊN/NGÀY (xem
//       computeStaffTerritories_ — nhóm theo staffKey+tripDate) — nếu chọn khoảng NHIỀU
//       ngày (VD 3 ngày), MỖI nhân viên sẽ có TỚI 3 CHẤM hiện đồng thời trên bản đồ (1 chấm/
//       ngày, có thể ở các xã/phường khác nhau tuỳ ngày hôm đó giao nhiều nhất ở đâu) — đây
//       là thiết kế hiện tại (không gộp nhiều ngày lại thành 1 chấm), có thể sẽ rối nếu chọn
//       khoảng ngày dài + nhiều nhân viên; nếu muốn gộp/chỉ hiện chấm mới nhất khi chọn nhiều
//       ngày, đây sẽ là thay đổi thiết kế riêng, xin ý kiến trước khi làm.
//  4) Rút ngắn nhãn chú giải bản đồ (trước đó vài dòng dài chiếm 2 dòng, đẩy bản đồ co lại
//     quá nhỏ) — giữ nguyên đầy đủ giải thích gốc bằng cách chuyển vào thuộc tính "title" (di
//     chuột vào từng mục vẫn xem được nguyên văn như cũ), giảm khoảng cách/đệm.
//  5) SyncLog trên Google Sheet: (a) TỰ ĐỘNG xoá dần log quá 5 NGÀY (SYNC_LOG_KEEP_DAYS),
//     dựa theo cột A (Thời Gian ghi) — chạy ngay sau mỗi lần ghi log mới (trimSyncLog_() ở
//     GAS_TUYEN_GIAO.gs), đã kiểm chứng bằng Node (4 kịch bản: có log cũ xen kẽ log mới/
//     không có gì quá hạn/toàn bộ quá hạn/sheet trống — đều xoá đúng, không xoá nhầm log còn
//     hạn). (b) Cột "Đồng Bộ Bởi" trước đây ghi CHUNG CHUNG "Tự động (auto-sync khi mở
//     modul)" hoặc tiêu đề trang, KHÔNG xác định được THỰC SỰ ai — SỬA: ghi kèm đúng họ tên +
//     ssoId thật (lấy qua GHN /my-profile, đã có sẵn trong state.currentUser lúc này) của
//     người vừa mở modul (auto-sync) hoặc vừa bấm "Đồng bộ" tay.
//  6) Popup "🔐 Quản Trị" — thêm nút "✏️ Sửa" rõ ràng cho mỗi dòng đã lưu. Trước đây các ô
//     input của dòng đã lưu VẪN sửa được trực tiếp (không disabled, trừ SSO ID readonly)
//     nhưng người dùng phản hồi "chỉ thấy mỗi thêm mới, xoá, lưu" — không nhận ra sửa được
//     ngay tại chỗ. SỬA: dòng đã lưu mặc định vào chế độ CHỈ XEM (mọi ô input/select
//     disabled, xám rõ ràng), bấm "✏️ Sửa" mới mở khoá (đổi nút thành "💾 Lưu" + "✖ Huỷ",
//     Huỷ khôi phục đúng dữ liệu gốc không cần gọi lại API). Nhân tiện sửa 1 lỗi tiềm ẩn kèm
//     theo: nút "➕ Thêm người dùng mới" trước đây gọi wireAdminRows_() (gắn lại sự kiện cho
//     TOÀN BỘ bảng) mỗi lần thêm dòng — vì DOM của các dòng cũ không bị xoá lại, việc gọi lại
//     này sẽ CỘNG DỒN thêm 1 bộ listener nữa lên các dòng cũ đã có sẵn (bấm Lưu/Xoá 1 lần
//     chạy 2 lần) — sửa thành chỉ gắn sự kiện cho ĐÚNG dòng mới thêm (wireAdminRow_() tách
//     riêng cho 1 dòng).
//
// v1.7.0 (YÊU CẦU MỚI: "làm cơ chế phân quyền để nhân viên chỉ xem được phần bản đồ tuyến
//         của bưu cục đang phụ trách" — ADMIN xem toàn bộ + nút đăng nhập quy hoạch + nút
//         phân quyền/thêm/xoá/lưu qua popup giữa màn hình; Quản lý xem nhiều bưu cục trong
//         phạm vi quản lý; Nhân viên xử lý xem bưu cục trong phạm vi làm việc):
//  1) DANH TÍNH NGƯỜI DÙNG KHÔNG THỂ GIẢ MẠO: dùng đúng API chính thức của GHN
//     (POST https://nhanh-api.ghn.vn/api/lastmile/user/my-profile, cùng cơ chế/token đã
//     dùng để tải sản lượng) để lấy ssoId + họ tên của người đang đăng nhập trên chính máy
//     họ — khác với việc để người dùng tự gõ mã nhân viên (gõ được thì giả mạo được), ssoId
//     lấy thẳng từ phiên đăng nhập GHN thật nên không thể giả.
//  2) SHEET PHÂN QUYỀN MỚI (PhanQuyen) + GAS: thêm sheet PhanQuyen (SSO ID, Họ Tên, Vai Trò,
//     Mã Bưu Cục được xem, Trạng Thái, Ghi Chú) và 4 hàm GAS mới — getPermission (ai cũng
//     gọi được, chỉ trả về ĐÚNG quyền của ssoId đang hỏi), listUsers/saveUser/deleteUser (CHỈ
//     ADMIN — mọi request ghi đều tự kiểm tra lại NGAY TRÊN SERVER xem ssoId của người gọi có
//     đúng là ADMIN đang Hoạt động không, KHÔNG tin bất kỳ cờ "tôi là admin" nào gửi từ trình
//     duyệt lên, để không ai tự nâng quyền cho mình bằng cách sửa code phía trình duyệt).
//     deleteUser cũng chặn xoá nốt ADMIN cuối cùng để tránh cả nhóm tự khoá mất quyền quản trị.
//  3) LỌC DỮ LIỆU 1 ĐIỂM DUY NHẤT: applyPermissionScopeFilter_ chạy ngay sau khi tải xong dữ
//     liệu xã/phường + bưu cục, lọc state.hubs/state.wards/state.wardsOldEnriched theo đúng
//     danh sách mã bưu cục được phép xem — vì mọi phần vẽ bản đồ, dropdown "Vùng", danh sách
//     bưu cục ở tab "Theo Nhân Viên" đều đọc từ 3 biến này nên lọc 1 chỗ là toàn bộ giao diện
//     tự động chỉ còn đúng phạm vi được phép, không cần sửa từng hàm vẽ riêng lẻ.
//  4) MÀN HÌNH CHẶN TRUY CẬP: nếu ssoId chưa có trong sheet PhanQuyen (hoặc bị Khoá), modul
//     hiện màn hình báo rõ lý do + hiện sẵn ssoId/họ tên của chính người đó kèm nút Sao chép,
//     để họ gửi cho ADMIN thêm quyền — giải quyết bài toán "sheet PhanQuyen mới toanh chưa có
//     ai thì làm sao thêm được ADMIN đầu tiên" (ADMIN đầu tiên dán tay 1 dòng vào sheet).
//  5) POPUP QUẢN TRỊ GIỮA MÀN HÌNH (chỉ ADMIN thấy nút 🔐 mở popup này): danh sách người dùng
//     dạng bảng sửa trực tiếp — thêm dòng/sửa vai trò/sửa mã bưu cục/khoá/xoá/lưu — và có nút
//     "🔗 Đăng nhập quyhoachbuucuc.info" NHƯNG nút này CHỈ mở tab mới tới trang đăng nhập, TUYỆT
//     ĐỐI KHÔNG tự điền hay tự gửi tài khoản/mật khẩu nào (đúng nguyên tắc không lưu/không tự
//     động hoá đăng nhập bằng mật khẩu/cookie đã thống nhất trước đó) — người dùng vẫn tự gõ.
//  6) Tab "🔄 Đồng Bộ Dữ Liệu" (dán tay dữ liệu thô) nay CHỈ hiện cho ADMIN — Quản lý/Nhân
//     viên xử lý chỉ cần xem bản đồ trong phạm vi của họ, không cần khả năng ghi đè dữ liệu
//     gốc (quyết định kỹ thuật riêng, không có trong yêu cầu gốc — có thể đổi lại nếu cần).
//  7) ĐÃ KIỂM CHỨNG bằng Node: applyPermissionScopeFilter_ (3 kịch bản: ADMIN xem hết, Quản
//     lý nhiều bưu cục, Nhân viên 1 bưu cục) và toàn bộ 4 hàm GAS phân quyền (22 assertion —
//     tra cứu đúng quyền, tài khoản bị Khoá, không phân biệt hoa/thường ssoId, chặn nâng
//     quyền trái phép ở cả 3 endpoint ghi, không tạo trùng khi lưu lại người đã có, chặn xoá
//     ADMIN cuối cùng) — TRƯỚC khi giao, bằng dữ liệu mô phỏng sheet Google Sheets thật.
//
// v1.6.4 (LỖI "chưa thể nào bấm được vào thông tin nhân viên... ấn toàn ra thông tin xã
//         phường" — sửa v1.6.3 (nới hộp dò ±8px) KHÔNG GIẢI QUYẾT ĐÚNG GỐC, đã tự bấm thử
//         TRỰC TIẾP trên trang nhanh.ghn.vn thật (không phải giả lập) để tìm đúng nguyên
//         nhân trước khi sửa lại lần này):
//  1) ĐÃ TỰ KIỂM CHỨNG TRÊN TRANG THẬT: mở trực tiếp map đang chạy trên nhanh.ghn.vn, bấm
//     đúng tâm nhiều chấm nhân viên khác nhau (xác nhận toạ độ bấm chính xác bằng cách gắn
//     thêm 1 listener đo clientX/clientY thật) — panel LUÔN đổi sang popup xã/phường bên
//     dưới, KHÔNG BAO GIỜ ra popup nhân viên, dù bấm đúng pixel đang vẽ chấm. Xác nhận đúng
//     y như người dùng báo cáo, không phải do bấm hụt.
//  2) NGUYÊN NHÂN THẬT: map.queryRenderedFeatures(...) — cách "hỏi GPU đã vẽ gì ở pixel
//     này" mà MapLibre cung cấp — với các lớp chấm/tên nhân viên ('staff-dot-core',
//     'staff-territory-label-text') trả về RỖNG một cách KHÔNG ỔN ĐỊNH, kể cả khi bấm đúng
//     tâm chấm. Đã tự dựng 1 trang MapLibre độc lập (cùng cấu hình lớp y hệt) để cô lập vấn
//     đề: xác nhận map.queryRenderedFeatures cho cùng 1 toạ độ, bấm nhiều lần liên tiếp, có
//     lúc trả về đúng (1 kết quả) có lúc trả về rỗng — tức là cách "dò qua GPU" này vốn
//     không đáng tin cậy 100% cho các lớp chấm/tên nhân viên của modul này (nới hộp dò ±8px
//     ở v1.6.3 không giải quyết được vì gốc vấn đề không phải do bấm hụt vài pixel).
//  3) SỬA TẬN GỐC: bỏ hẳn map.queryRenderedFeatures cho phần chấm/tên nhân viên, thay bằng
//     TỰ TÍNH khoảng cách bằng JavaScript thuần (findStaffDotNearPoint_): với MỖI chấm nhân
//     viên đang có trong dữ liệu (state.staffDotFeatures — dữ liệu ta tự quản lý, luôn
//     đúng, không phụ thuộc GPU), quy đổi toạ độ GPS ra pixel màn hình (map.project), đo
//     khoảng cách tới điểm vừa bấm, chấm nào gần nhất trong bán kính 16px thì coi là trúng
//     (tính cả khoảng cách tới vùng chữ tên hiển thị dưới chấm, để bấm vào TÊN cũng trúng).
//     Cách này không phụ thuộc gì vào việc GPU "đã vẽ xong" lớp đó hay chưa.
//  4) ĐÃ TỰ KIỂM CHỨNG LẠI bằng Chrome thật (trang cô lập nói trên): bấm lặp lại liên tiếp
//     nhiều lần đúng tâm 1 chấm — cách MỚI (tính khoảng cách) trúng ĐÚNG 100% mọi lần, so
//     với cách CŨ (queryRenderedFeatures) có lúc trúng có lúc trật trên cùng 1 toạ độ bấm.
//     Không đổi lớp viền tuyến giao ('staff-territory-hitline') vì lớp đó không bị đổi màu/
//     độ mờ liên tục 60 lần/giây như lớp chấm (không có dấu hiệu gặp lỗi tương tự) — nếu
//     người dùng phát hiện viền cũng bị lỗi tương tự, sẽ áp dụng đúng kỹ thuật này tiếp.
//
// v1.6.3 (2 LỖI THẬT người dùng phát hiện khi test v1.6.2 trên dữ liệu THẬT — "sản phẩm
//         tồi tệ", "vùng giao không liền mạch", "ấn vào tên nhân viên không có thông tin
//         tuyến giao/quá tải/sản lượng như trước" — cả 2 đều là lỗi CÓ THẬT, không phải
//         hành vi mong muốn, sửa tận gốc):
//  1) "VÙNG GIAO KHÔNG LIỀN MẠCH": Node test trước đó (khi giao v1.6.2) tự vẽ 2 xã hình
//     vuông có ranh giới TRÙNG KHỚP TUYỆT ĐỐI nên không phát hiện ra lỗi này — trên dữ
//     liệu THẬT, xã/phường CHÍNH và xã/phường PHỤ là 2 polygon LƯU RIÊNG trong dữ liệu gốc,
//     dù cùng 1 đường ranh giới hành chính nhưng toạ độ số hoá có thể lệch nhau vài mm~vài
//     mét (rất phổ biến với dữ liệu ranh giới hành chính thật) => turf.union coi 2 mảnh là
//     "không thật sự chạm nhau" => trả về MultiPolygon (2 vùng rời rạc trên bản đồ) dù đúng
//     ra phải là 1 tuyến giao liền mạch. Đã tự dựng lại đúng lỗi này bằng Node (2 xã CỐ Ý để
//     hở ~3m, mô phỏng đúng sai số dữ liệu thật) — xác nhận turf.union thường ra MultiPolygon
//     (lỗi tái hiện đúng như báo cáo). SỬA (unionFeatures_): nới rộng (turf.buffer) mỗi mảnh
//     thêm 5m trước khi union — 5m không đáng kể so với quy mô 1 xã/phường nhưng đủ "nuốt"
//     mọi khe hở làm tròn số của dữ liệu gốc. Đã kiểm chứng lại bằng Node với đúng kịch bản
//     "để hở 3m": SAU KHI sửa, ra ĐÚNG 1 Polygon liền mạch (trước khi sửa ra MultiPolygon).
//  2) "ẤN VÀO TÊN NHÂN VIÊN KHÔNG RA THÔNG TIN TUYẾN GIAO": lớp tên ('staff-territory-label-
//     text') và chấm ('staff-dot-core') là SYMBOL LAYER trong MapLibre — chỉ tính "trúng"
//     khi bấm ĐÚNG PIXEL có vẽ glyph/icon, hit-box rất hẹp (vài px) — bấm hụt 1-2px cạnh chữ
//     là rơi thẳng xuống lớp xã/phường bên dưới, ra popup xã/phường (chỉ Lấy/Giao tổng, mất
//     hết thông tin tuyến giao/quá tải/sản lượng theo nhân viên). SỬA: đổi từ dò ĐÚNG 1 pixel
//     sang dò trong Ô VUÔNG nhỏ quanh điểm bấm (±8px) — bấm gần tên/chấm vẫn ra đúng popup
//     nhân viên đầy đủ như các phiên bản trước, không còn bị rơi nhầm xuống lớp xã/phường.
//  3) Đã kiểm chứng lại toàn bộ pipeline sau 2 sửa lỗi trên bằng Node (turf.js thật): dựng
//     lại đúng ví dụ Ba Hàng (4 người, 100 đơn, Đặng Trần Mẫn 19 đơn = 19%) VỚI ranh giới xã
//     cố ý để hở 3m — vẫn ra đúng 4 chấm + 4 vùng, vùng Mẫn vẫn là 1 Polygon liền mạch, diện
//     tích và hướng múi vẫn đúng như v1.6.2 (chênh lệch do buffer 5m là không đáng kể).
//
// v1.6.2 (ĐỔI KỸ THUẬT "VÙNG GIAO THỰC TẾ" — người dùng phản hồi lớp concave-hull GPS thô
//         của v1.6.1 "nhìn quá rối" khi nhiều nhân viên hiện cùng lúc, và cho ví dụ THẬT cụ
//         thể: "Phường Ba Hàng có 4 người cùng phát sinh đơn, tổng 100 đơn, Đặng Trần Mẫn 19
//         đơn = 19%, giáp Phường Nam Tiến => vẽ vùng = 100% Nam Tiến + 19% Ba Hàng"):
//  1) BỎ concave hull (turf.concave) dựng trực tiếp từ điểm GPS thô — hình ra răng cưa, méo,
//     và không thể trả lời câu "nhân viên này giao đúng bao nhiêu % xã/phường nào" vì hull
//     không có khái niệm ranh giới hành chính. THAY BẰNG kỹ thuật "GHÉP MÚI" (ward-wedge):
//       - Xã/phường CHÍNH của nhân viên: giữ NGUYÊN VẸN 100% đa giác hành chính thật (đúng
//         "100% Phường Nam Tiến").
//       - Mỗi xã/phường PHỤ: tính tổng số đơn TẤT CẢ nhân viên phát sinh tại xã/phường đó
//         trong ngày (computeWardStaffBreakdown_), lấy % đúng của riêng nhân viên này trên
//         tổng đó (đúng ví dụ "19 đơn / 100 đơn = 19%"), CẮT 1 "múi bánh" (turf.sector) đúng
//         góc = 19% × 360°, XÉN lại đúng theo ranh giới xã/phường thật (turf.intersect) —
//         không tràn ra ngoài xã/phường phụ đó (buildWardWedgeFeature_).
//       - HƯỚNG cắt múi: lấy hướng trung bình (mean bearing, cộng vector đơn vị để xử lý
//         đúng góc vòng qua 0°/360°, KHÔNG cộng độ thẳng — xem meanBearing_) từ tâm xã/
//         phường phụ tới các điểm GPS thật của nhân viên trong xã/phường đó — múi luôn quay
//         về ĐÚNG PHÍA nhân viên thực sự giao hàng, không cắt ngẫu nhiên. Đã tự kiểm chứng
//         bằng Node: bbox của múi Đặng Trần Mẫn tại Ba Hàng nằm về phía TÂY (giáp Nam Tiến,
//         nơi Mẫn thật sự giao), KHÔNG lệch về phía Đông (nơi 3 nhân viên còn lại giao).
//  2) GHÉP tất cả mảnh (xã chính + múi xã phụ) của 1 nhân viên/ngày thành 1 HÌNH DUY NHẤT
//     liền mạch bằng turf.union (unionFeatures_, gộp tuần tự từng cặp) — 2 mảnh có chung 1
//     đoạn biên thật sẽ ra đúng 1 Polygon liền (đường biên trong bị xoá), có fallback ghép
//     thô (combinePolygonsRaw_) nếu turf.union lỗi. Đã tự kiểm chứng bằng Node: hình của
//     Đặng Trần Mẫn ra ĐÚNG 1 Polygon (không phải MultiPolygon rời rạc), diện tích lệch ~3%
//     so với diện tích lý thuyết (100% Nam Tiến + 19% Ba Hàng) — mức lệch này là do múi cắt
//     theo GÓC (%  360°) chứ không cắt theo % DIỆN TÍCH thật của xã (2 xã không phải hình
//     tròn hoàn hảo nên góc và diện tích không khớp tuyệt đối 100%) — ĐÃ NÊU RÕ đây là "mô
//     phỏng lý tưởng dựa trên dữ liệu hiện có" (như người dùng yêu cầu), KHÔNG PHẢI tái dựng
//     chính xác từng con đường giao hàng thật ngoài thực địa.
//  3) SỬA "nhìn quá rối" bằng cơ chế CHỌN 1 NGƯỜI: lớp "Vùng giao thực tế" giờ CHỈ hiện khi
//     (a) checkbox "🗺️ Vùng giao thực tế" đang bật VÀ (b) người dùng vừa bấm chọn 1 nhân
//     viên (bấm vào chấm, hoặc bấm vào tên nhân viên đang hiện trên bản đồ, hoặc bấm vào
//     viền ranh giới hành chính của tuyến giao đó) — CHỈ hiện đúng vùng của người vừa chọn,
//     không còn hiện tất cả nhân viên chồng chéo lên nhau cùng lúc nữa (selectStaffTerritory_
//     + applyStaffHullVisibility_ lọc bằng map.setFilter theo territoryKey). Bấm "✖ Bỏ chọn"
//     hoặc chọn người khác sẽ ẩn/đổi vùng đang hiện.
//  4) Đã tự kiểm chứng toàn bộ pipeline bằng Node (dùng turf.js thật @6.5.0, không giả lập):
//     dựng lại đúng dữ liệu mẫu Ba Hàng (4 nhân viên, 100 đơn, Đặng Trần Mẫn = 19 đơn = 19%)
//     — xác nhận ra đúng 4 chấm + 4 vùng (1 vùng/nhân viên), vùng của Mẫn là 1 Polygon liền
//     mạch bao gồm cả Nam Tiến lẫn Ba Hàng, territoryKey của chấm và của vùng khớp nhau
//     (cơ chế chọn-để-hiện hoạt động đúng), và múi Ba Hàng của Mẫn quay đúng hướng Nam Tiến.
//
// v1.6.1 (2 YÊU CẦU TIẾP THEO sau khi test v1.6.0 — "dev chuyên nghiệp thì sản phẩm phải
//         rõ ràng theo đúng mục đích": (1) bật tuyến giao lên là KHÔNG bấm chọn được xã/
//         phường bên dưới nữa — lỗi CHỒNG LỚP thật, sửa tận gốc chứ không né; (2) tự vẽ 1
//         lớp ranh giới "vùng giao thực tế" theo % đơn của nhân viên, xã liền kề tự gộp):
//  1) LỖI CHỒNG LỚP (đã xác nhận đúng là lỗi, không phải hành vi mong muốn): v1.6.0 dùng
//     1 lớp fill TRONG SUỐT phủ NGUYÊN CẢ xã/phường thuộc tuyến giao để bắt click — vô
//     tình chặn đứng mọi click vào PHẦN GIỮA xã/phường đó, chỉ còn bấm được đúng phần
//     KHÔNG bị tuyến giao nào phủ lên. SỬA: đổi lớp fill toàn vùng đó thành 1 lớp
//     "staff-territory-hitline" — line TRONG SUỐT nhưng RỘNG (16px, chỉ để bắt click,
//     không vẽ gì), chạy DỌC ĐÚNG THEO viền tuyến giao (chính + phụ). Kết quả: bấm ĐÚNG
//     VÀO/GẦN viền tuyến giao -> ra popup nhân viên (như cũ); bấm vào PHẦN GIỮA xã/phường
//     (dù xã/phường đó có đang thuộc tuyến giao ai đó hay không) -> rơi xuống ĐÚNG lớp
//     xã/phường bên dưới như trước khi có tính năng tuyến giao — giải quyết đúng gốc vấn
//     đề "chồng lớp", không phải giải pháp né tránh (VD không phải bắt Shift+click hay ẩn
//     bớt tính năng).
//  2) "VÙNG GIAO THỰC TẾ" theo mật độ GPS (tính năng MỚI, không thay thế lớp ranh giới
//     hành chính v1.6.0 — cả 2 cùng tồn tại, bật/tắt riêng để đối chiếu): thêm hẳn 1 lớp
//     mới tự vẽ đa giác bao quanh ĐÚNG toạ độ GPS của các đơn đã giao (KHÔNG dùng ranh
//     giới hành chính xã/phường nữa) — dùng CONCAVE HULL (turf.concave, @require thêm
//     turf.js@6.5.0) thay vì convex hull thường, vì convex hull sẽ "lấp đầy" luôn cả vùng
//     không có đơn nào ở giữa (VD tuyến hình chữ L bị vẽ thành hình chữ nhật to hơn thực
//     tế) — concave hull ôm sát mật độ điểm thật hơn nhiều, có fallback dần (maxEdge 3km
//     -> 8km -> convex -> đệm tròn quanh tâm nếu quá ít điểm) để LUÔN ra được 1 hình,
//     không bỏ trắng.
//     KỸ THUẬT GIẢI QUYẾT YÊU CẦU "2 xã giáp nhau tự gộp vào 1": vì hull dựng TRỰC TIẾP
//     từ TOÀN BỘ điểm GPS của 1 nhân viên/ngày (không tách riêng theo xã/phường rồi mới
//     kiểm tra có giáp nhau để gộp polygon), nếu các điểm đó trải trên 2 xã/phường liền kề
//     NHAU VỀ MẶT KHÔNG GIAN THỰC (không phải chỉ chung ranh giới hành chính), hull tự
//     nhiên "tràn" qua và bao trọn thành 1 hình liền mạch DUY NHẤT — hoàn toàn KHÔNG cần
//     bất kỳ bước "kiểm tra 2 xã có giáp ranh giới hành chính không rồi gộp polygon" thủ
//     công nào — đã tự kiểm chứng bằng Node: 2 cụm điểm GẦN NHAU (thật sự liền kề) ra
//     ĐÚNG 1 Polygon liền mạch; 2 cụm điểm XA NHAU (không liền kề thật) ra ĐÚNG
//     MultiPolygon (2 vùng tách biệt, KHÔNG bị gộp nhầm dù cùng 1 nhân viên) — tức là gộp
//     đúng theo THỰC TẾ không gian, chính xác hơn cả việc chỉ dựa vào 2 xã có chung ranh
//     giới hành chính hay không.
//  3) Lớp mới ("🗺️ Vùng giao thực tế (GPS)", checkbox riêng, mặc định TẮT) CHỈ để XEM —
//     KHÔNG tham gia bắt click, tránh lặp lại đúng lỗi (1) ở trên. Muốn xem chi tiết tuyến
//     giao (số đơn/tỷ lệ) vẫn bấm vào chấm hoặc viền ranh giới hành chính như trước.
//  4) Đã tự kiểm chứng bằng Node (dùng turf.js thật, không giả lập): dựng lại dữ liệu mẫu
//     Đặng Trần Mẫn + 2 kịch bản GPS (cụm liền kề / cụm tách biệt / quá ít điểm) — xác
//     nhận hull ra đúng hình, đúng số điểm, không crash khi dữ liệu quá ít, trước khi giao.
//
// v1.6.0 (ĐỔI HẲN CÁCH THỂ HIỆN TUYẾN GIAO TRÊN BẢN ĐỒ — theo đúng 3 yêu cầu người dùng
//         đưa ra từ ví dụ THẬT "Đặng Trần Mẫn": tuyến giao Xã Nam Tiến (81%, CHÍNH) + 1
//         phần Phường Ba Hàng (19%, PHỤ), v1.5.5 vẽ đúng 2 chấm rời rạc nhưng người dùng
//         muốn nhìn thấy đây là 1 NHÂN VIÊN với 1 TUYẾN GIAO gồm 2 xã/phường, không phải
//         2 điểm không liên quan):
//  1) "Số lượng chấm trên bản đồ phải khớp với số lượng nhân viên đi làm ngày hôm đó":
//     state.staffDotFeatures giờ chỉ có ĐÚNG 1 điểm / (nhân viên, ngày) có tuyến giao xác
//     định được (≥1 xã/phường đạt ≥15%) — đặt tại xã/phường "CHÍNH" (nhiều đơn nhất trong
//     số các xã/phường đạt ngưỡng). KHÔNG còn 1 điểm/xã-phường như v1.5.5.
//  2) "Nhìn vào sẽ thấy được tuyến giao ... có ranh giới": thêm hẳn
//     state.staffTerritoryFeatures (Polygon, nguồn bản đồ mới 'staff-territory') = TẤT CẢ
//     xã/phường thuộc tuyến giao của từng nhân viên hôm đó, tô VIỀN (không tô nền, tránh
//     đè lên lớp màu sản lượng theo bưu cục sẵn có) theo đúng ranh giới xã/phường CŨ đã
//     có trên bản đồ — viền LIỀN NÉT đậm cho xã/phường CHÍNH, viền ĐỨT NÉT mảnh hơn cho
//     xã/phường PHỤ, cùng màu trạng thái (đỏ/vàng/xanh) với chấm để nhìn phát biết ngay
//     mức độ. GIỚI HẠN KỸ THUẬT (không giấu): dữ liệu chỉ có ở mức CẢ xã/phường, không có
//     ranh giới nhỏ hơn, nên "1 phần Phường Ba Hàng" vẫn vẽ NGUYÊN VẸN cả phường đó (viền
//     đứt nét + % trong popup để biết đó chỉ là 1 phần, không vẽ đúng hình dạng vùng con
//     thực tế nhân viên đi qua — cần dữ liệu địa lý chi tiết hơn wardCode mới làm được).
//  3) "Hiển thị tên nhân viên, cho phép bật/tắt": thêm lớp symbol
//     'staff-territory-label-text' (text = tên nhân viên, đặt tại đúng điểm chấm), bật/
//     tắt bằng checkbox RIÊNG "🏷️ Hiện tên nhân viên" (tách khỏi checkbox chấm/ranh giới)
//     — giống đúng kiểu các nhãn khác trong modul (nhãn bưu cục, nhãn phường).
//  4) Bấm vào chấm HOẶC bấm vào bất kỳ xã/phường nào đã tô viền của 1 nhân viên đều ra
//     ĐÚNG 1 popup — liệt kê ĐẦY ĐỦ mọi xã/phường thuộc tuyến giao (không chỉ 1 xã/phường
//     lẻ như popup v1.5.5), kèm số đơn/tỷ lệ thành công RIÊNG từng xã/phường + tổng cả
//     tuyến.
//  5) Bảng "+" debug (wardDebugHtml_): đổi lại cách đánh dấu — CHỈ xã/phường nhiều đơn
//     nhất mới có 🏆 (chính — đặt chấm/tên), các xã/phường ≥15% còn lại đổi thành ✅ (phụ —
//     chỉ tô viền) — đúng phản ánh việc CHỈ 1 xã/phường được đặt chấm/tên, còn lại chỉ có
//     ranh giới.
//  6) Rủi ro đã biết, chưa xử lý (ghi rõ để không mập mờ): nếu 2 nhân viên KHÁC NHAU cùng
//     có 1 xã/phường trong tuyến giao ngày đó (VD 2 người cùng giao 1 phần Ba Hàng), viền
//     của cả 2 người sẽ chồng lên nhau trên cùng 1 ranh giới xã/phường (không tách được
//     vùng con) — bấm vào sẽ ra popup của người vẽ viền TRÊN CÙNG (thứ tự vẽ), không phải
//     lỗi nhưng cần biết trước khi dùng để tránh hiểu nhầm.
//  7) Đã tự kiểm chứng bằng Node: dựng lại ĐÚNG dữ liệu mẫu người dùng đưa (Đặng Trần Mẫn:
//     Xã Nam Tiến 163 đơn/81%, Phường Ba Hàng 39 đơn/19%/17 thành công — khớp y hệt số
//     17/39 (44%) trong popup người dùng chụp) — xác nhận CHÍNH XÁC 1 chấm/1 nhân viên, 2
//     ranh giới xã/phường tương ứng, popup + bảng "+" hiện đúng, trước khi giao.
//
// v1.5.5 (SỬA THEO PHẢN ÁNH THẬT của người dùng từ ví dụ NV Trần Thị Lan Hương: Phường
//         Ba Hàng 83 đơn/47% + Phường Tiên Phong 72 đơn/40% — cả 2 đều ≥15% ngưỡng,
//         nhưng bản v1.5.4 chỉ đặt 1 chấm tại Ba Hàng (số đơn cao nhất) rồi BỎ HẲN Tiên
//         Phong dù chiếm tới 40% đơn giao trong ngày. Câu hỏi gốc: "điểm đặt lại ở Ba
//         Hàng, trong khi NV giao cả Tiên Phong nữa? tìm kỹ thuật để có thể chính xác
//         hơn về tuyến giao 1 nhân viên giao nhiều xã phường."):
//  1) ĐỔI THIẾT KẾ: computeStaffWardAssignments_() không còn chọn 1 xã/phường "thắng"
//     duy nhất (số đơn cao nhất) nữa — MỌI xã/phường đạt ≥15% tổng đơn giao trong ngày
//     của nhân viên đó đều được trả về là 1 KẾT QUẢ RIÊNG -> 1 CHẤM RIÊNG trên bản đồ.
//     VD Trần Thị Lan Hương giờ ra ĐÚNG 2 chấm: Ba Hàng + Tiên Phong, không mất chấm nào.
//  2) SỬA LUÔN 1 lỗi liên quan phát hiện khi làm việc này: trước đây mỗi chấm dùng
//     giaoCount/giaoSuccess/groupCounts là TỔNG CẢ NGÀY của nhân viên (VD 178 đơn) dù
//     chỉ đặt tại 1 xã/phường (VD Ba Hàng 83 đơn) — khiến popup "Giao: 109/178 đơn thành
//     công... tại Phường Ba Hàng" SAI về bản chất (không phải cả 109 đơn đó đều ở Ba
//     Hàng). Giờ mỗi chấm tính RIÊNG số đơn/số thành công/nhóm khách hàng/tâm GPS CỦA
//     CHÍNH xã/phường đó — số liệu popup + màu chấm (giaoStatus_) giờ phản ánh đúng thực
//     tế từng khu vực, không lẫn lộn.
//  3) Popup chấm: thêm dòng ngữ cảnh "📍 Đây là khu vực X/N mà nhân viên này giao trong
//     ngày" khi có >1 chấm, kèm tổng cả ngày (mọi khu vực cộng lại) để đối chiếu, tránh
//     hiểu lầm 1 chấm = toàn bộ tuyến giao của nhân viên hôm đó.
//  4) Bảng "+" debug (wardDebugHtml_): TẤT CẢ xã/phường ≥15% giờ đánh dấu 🏆 (đặt chấm) —
//     trước đây chỉ 1 cái 🏆 (thắng), còn lại chỉ ✅ dù cũng đạt ngưỡng, dễ hiểu lầm chỉ
//     có 1 chấm được đặt. Dòng kết quả giờ liệt kê ĐÚNG tên + số lượng chấm sẽ đặt.
//  5) Cũng sửa luôn đoạn ghi chú cảnh báo cuối popup (đang ghi sai/cũ từ trước v1.5.4:
//     "GHN không trả mã phường/GPS") — nay ghi đúng thực tế: GHN CÓ trả trực tiếp
//     wardCode/GPS, chỉ suy luận từ địa chỉ text khi đơn nào đó thiếu field.
//  6) Đã tự kiểm chứng bằng Node: dựng lại ĐÚNG dữ liệu mẫu người dùng đưa (Ba Hàng 83
//     đơn/47%, Tiên Phong 72 đơn/40%, 6 xã/phường nhỏ còn lại <15%) — xác nhận ra ĐÚNG 2
//     chấm, đúng số đơn riêng từng xã/phường, đúng dotIndex/dotCount, trước khi giao.
//
// v1.5.4 (PHÁT HIỆN QUAN TRỌNG từ đúng 1 request curl thật người dùng đưa: GHN trả
//         THẲNG wardCode/wardName/lat/lng có sẵn — KHÔNG cần suy luận từ địa chỉ text
//         nữa. Đây là thay đổi lớn nhất trong toàn bộ tính năng chấm cảnh báo):
//  1) response của /api/lastmile/trip/get-trip-items — mỗi đơn có receiverContact/
//     senderContact chứa SẴN wardCode ("120106", ĐÚNG hệ mã với wards.json — đã kiểm
//     chứng khớp y hệt), wardName, districtCode/districtName, cityCode/cityName, VÀ
//     lat/lng (toạ độ GPS thật của địa chỉ). Bản v1.5.0-v1.5.3 chỉ lấy mỗi field
//     "address" (chuỗi text) rồi tự suy luận lại xã/phường bằng fuzzy-match — không cần
//     thiết, vì GHN đã trả sẵn kết quả chính xác 100%, không phải suy luận gần đúng.
//  2) ĐÃ SỬA: rows giờ lấy thêm wardCode/wardName/districtCode/districtName/cityName/
//     lat/lng (từ senderContact nếu là đơn PICK, receiverContact nếu là DELIVER/RETURN
//     — đúng theo vai trò từng loại đơn). computeStaffWardAssignments_() ưu tiên DÙNG
//     THẲNG wardCode này (chính xác 100%), CHỈ fallback về fuzzy-match địa chỉ text khi
//     đơn nào đó thiếu field (hiếm) — 2 con số "fromGhnField"/"fromFuzzyMatch" hiện
//     trong nút "+" để biết tỷ lệ đơn dùng nguồn nào.
//  3) TÂM CHẤM giờ ưu tiên toạ độ GPS THẬT (trung bình lat/lng của chính các đơn đã
//     giao ở xã/phường đó trong ngày) thay vì tâm hình học polygon ranh giới — chính
//     xác hơn hẳn (phản ánh đúng vị trí giao hàng thật, không phải trung tâm hành
//     chính); centroidForWard_() (bbox polygon) chỉ còn là fallback khi ward không có
//     đơn nào có GPS.
//  4) Limit trang API: đã dùng sẵn 1000/trang (không phải 50 như ví dụ curl mặc định
//     của trình duyệt) — không cần sửa gì thêm ở phần phân trang.
//
// v1.5.3 (v1.5.2 SỬA SAI HƯỚNG — TỰ NHẬN LỖI VÀ SỬA LẠI, đã tự kiểm chứng bằng dữ liệu
//         THẬT do người dùng cung cấp trước khi giao, không đoán mò nữa):
//  1) v1.5.2 đổi nguồn so khớp sang state.rezone.new_wards (xã/phường "MỚI") dựa trên
//     suy luận SAI: tưởng /api/wards.json là dữ liệu hành chính TRƯỚC sáp nhập 2025 nên
//     không còn khớp địa chỉ hiện tại. Người dùng đưa bằng chứng THẬT: địa chỉ 1 chuyến
//     đi thật ("Phường Phan Đình Phùng, Thành phố Thái Nguyên, Thái Nguyên") — ward này
//     CÓ NGUYÊN VẸN trong /api/wards.json (state.wards). Tức state.rezone.new_wards
//     KHÔNG phải danh sách hành chính GHN dùng cho địa chỉ khách hàng — đó là danh sách
//     bưu cục ĐỀ XUẤT gộp lại riêng của quyhoachbuucuc.info (tính năng "Re-zone" của
//     trang đó), không liên quan gì đến tên xã/phường trong địa chỉ thực tế. Đã ĐỔI LẠI
//     đúng nguồn: state.wards (CŨ) — và đã TỰ chạy thử bằng node với đúng dữ liệu thật
//     người dùng đưa (ward "Phan Đình Phùng" + "Đồng Quang") để xác nhận khớp ra kết
//     quả đúng TRƯỚC khi giao lại, không chỉ sửa code rồi đoán là xong.
//  2) THÊM lớp khớp CHÍNH XÁC theo cả 3 đoạn địa chỉ (xã/phường + quận/huyện + tỉnh) —
//     tận dụng field "district" có sẵn trong wards.json — chính xác hơn hẳn khớp 2 đoạn
//     (xã/phường + tỉnh) vì gần như không thể trùng khi có đủ quận/huyện; chỉ rơi về
//     khớp 2 đoạn (rồi về dò chuỗi con theo vùng) khi địa chỉ thiếu đoạn quận/huyện.
//  3) centroidForWard_() và bảng debug "+" cũng đổi lại đọc từ dữ liệu CŨ (wardsOldEnriched
//     + wardsByCode) cho khớp với wardCode CŨ.
//  4) CHƯA LÀM: xử lý phần "phường mới"/gộp bưu cục (rezone) cho chấm cảnh báo — theo
//     đúng yêu cầu hiện tại, làm chấm cho xã/phường CŨ trước, xong kỹ thuật rồi mới tính
//     tiếp; nhãn "Địa chỉ Khác" riêng trong bảng; phân quyền setup ngưỡng theo vai trò.
//
// v1.5.2 (SỬA ĐÚNG NGUYÊN NHÂN GỐC vẫn ra 0/13 chấm sau v1.5.1 + thêm nút "+" debug +
//         thêm nhóm khách hàng "Khác", theo đúng góp ý sau khi test v1.5.1):
//  1) NGUYÊN NHÂN THẬT SỰ (v1.5.1 sửa sai chỗ): thuật toán so khớp ĐANG dùng SAI nguồn
//     dữ liệu xã/phường — dùng state.wards (từ /api/wards.json) là số liệu theo xã/
//     phường CŨ, tức TRƯỚC đợt sáp nhập 2025 (đã ghi rõ ở comment đầu file dòng ~165:
//     "sau sáp nhập 2025 Việt Nam bỏ hẳn cấp huyện"). Địa chỉ khách hàng trong dữ liệu
//     GHN là địa chỉ THỰC TẾ HIỆN TẠI (sau sáp nhập), nên tên xã/phường trong đó khớp
//     với danh sách MỚI (~272 xã/phường ở khu vực đang tải) — hầu như KHÔNG khớp được
//     với danh sách CŨ (~771 xã/phường, phần lớn tên đã bị gộp/đổi, không còn tồn tại)
//     dù đã tách đúng cấu trúc địa chỉ ở v1.5.1. Kết quả: dò đúng cấu trúc nhưng dò
//     nhầm nguồn → vẫn 0/13.
//  2) ĐÃ SỬA: buildWardMatchIndex_() giờ dựng chỉ mục từ state.rezone.new_wards (từ
//     /api/rezone.json — xã/phường MỚI, có sẵn name+province+region+new_code), KHÔNG
//     dùng state.wards nữa. wardCode trả về từ giờ LÀ new_ward_code — centroidForWard_()
//     cũng sửa theo, tìm tâm bbox trong state.wardsNewRaw (ranh giới MỚI) thay vì
//     state.wardsOldEnriched (ranh giới CŨ, khác hệ mã hoàn toàn nên trước đó dù khớp
//     được tên cũng KHÔNG tìm ra toạ độ để đặt chấm).
//  3) NÚT "+" MỚI ở đầu mỗi dòng bảng "Theo Nhân Viên" (đúng yêu cầu "cho vào 1 dấu
//     cộng ... để tao coi mày chạy code đã đúng chưa") — bấm vào hiện chi tiết TOÀN BỘ
//     xã/phường (MỚI) đã khớp được từ địa chỉ các đơn giao của (nhân viên, ngày) đó,
//     kèm % mỗi xã/phường, đánh dấu 🏆 xã/phường được chọn đặt chấm (nếu có, ≥15%),
//     và số đơn KHÔNG khớp được xã/phường nào — cùng 1 nguồn dữ liệu với chấm trên bản
//     đồ nên xem đúng bằng chính con số thật đang chạy, không phải số minh hoạ.
//  4) NHÓM KHÁCH HÀNG: thêm nhóm thứ 4 "Khác" (đúng yêu cầu) — hiện tại chỉ có 1 cách
//     phân biệt được với "SME" là đơn KHÔNG có mã đơn hàng (GHN không trả field nhóm
//     khách hàng chính thức, không có tín hiệu nào khác để tách SME thật khỏi "không
//     rõ" — ghi rõ trong code để không hiểu nhầm đây là bộ phân loại đầy đủ, có thể cần
//     tín hiệu khác nếu muốn tách chính xác hơn).
//  5) CHƯA LÀM (vẫn như các bản trước): nhãn "Địa chỉ Khác" (đơn <15% ward share) riêng
//     trong bảng; phân quyền setup ngưỡng theo vai trò.
//
// v1.5.1 (SỬA LỖI KHÔNG RA CHẤM NÀO + LÀM ĐÚNG YÊU CẦU "dựa vào địa chỉ giao/lấy" +
//         thêm chi tiết trong panel bấm vào chấm, theo đúng góp ý sau khi test v1.5.0):
//  1) NGUYÊN NHÂN KHÔNG RA CHẤM ở v1.5.0: thuật toán khớp xã/phường CŨ chỉ dò chuỗi con
//     trong TOÀN BỘ câu địa chỉ, giới hạn theo "vùng" (region) của bưu cục xử lý đơn —
//     với các chuyến đi có nhiều đơn rải ở nhiều nơi ghi chú khác nhau, cách này dễ
//     khớp sai/khớp nhiều xã-phường khác nhau cho cùng 1 đơn (vd tên xã trùng 1 phần
//     với tên quận/huyện/tỉnh), làm phân mảnh số đơn/nhân viên xuống dưới ngưỡng 15%
//     ở hầu hết trường hợp → không nhân viên nào đạt ngưỡng → 0 chấm.
//  2) SỬA THEO ĐÚNG YÊU CẦU: địa chỉ GHN trả về có cấu trúc cố định "<Xã/Phường/Thị
//     trấn ...>, <Quận/Huyện/TP ...>, <Tỉnh/TP ...>" (vd "Phường Đồng Quang, Thành phố
//     Thái Nguyên, Thái Nguyên") — giờ tách đúng theo dấu phẩy, lấy ĐÚNG đoạn xã/phường
//     + đoạn TỈNH cuối cùng, khớp CHÍNH XÁC (không phải dò chuỗi con) trong đúng tỉnh đó
//     → độ chính xác cao hơn hẳn, không còn nhầm giữa các tỉnh/quận huyện có tên trùng
//     1 phần. Nếu địa chỉ sai cấu trúc hoặc trùng tên xã/phường ở >1 huyện cùng tỉnh
//     (không đủ dữ kiện phân biệt) mới rơi về cách dò chuỗi con theo vùng (region) như
//     bản cũ, làm phương án dự phòng.
//  3) PANEL BẤM VÀO CHẤM giờ hiện ĐẦY ĐỦ hơn theo đúng yêu cầu: Giao thành công/tổng đơn
//     giao + % thành công (trước chỉ có tổng); Lấy thành công/tổng đơn lấy + % thành
//     công RIÊNG của nhân viên (trước chỉ có % chiếm trong tổng bưu cục, không có % tự
//     thân); breakdown nhóm khách hàng theo đơn giao: TikTok Shop (TTS) / Shopee / SME
//     (nhóm khách còn lại).
//  4) CHƯA LÀM (vẫn như v1.5.0): nhãn "Địa chỉ Khác" riêng trong bảng; phân quyền setup
//     ngưỡng theo vai trò.
//
// v1.5.0 (BƯỚC 2 — ĐƯA CẢNH BÁO NHÂN VIÊN LÊN BẢN ĐỒ, theo đúng ngưỡng đã chốt):
//  1) NGƯỠNG (hardcode trong 1 object THRESHOLDS_ duy nhất — DỄ SỬA khi cần tính toán
//     lại hoặc làm phân quyền setup sau này, đúng như đã nói "còn phải tính toán lại
//     ngưỡng và có phân quyền setup nữa"):
//     - LẤY THÀNH CÔNG (theo % trong TỔNG lấy thành công của CẢ bưu cục hôm đó):
//       >80% đỏ (quá tải) · 50-80% vàng · <50% xanh.
//     - GIAO (theo SỐ ĐƠN giao tuyệt đối của riêng nhân viên đó, đã gộp về đúng 1
//       xã/phường — xem mục 2): Xã: >100 đỏ(quá tải) · 70-100 vàng · 40-70 xanh · <40
//       đỏ(KHÔNG ĐỦ ĐƠN). Phường: >120 đỏ(quá tải) · 90-120 vàng · 50-90 xanh · <50
//       đỏ(không đủ đơn). "Thị trấn" (không được nêu rõ) tạm xếp chung nhóm Xã.
//  2) XÁC ĐỊNH NHÂN VIÊN "THUỘC" XÃ/PHƯỜNG NÀO: làm đúng thuật toán đã mô tả — với
//     từng (nhân viên, ngày), fuzzy-match địa chỉ TEXT của từng đơn GIAO với tên
//     xã/phường (bỏ tiền tố "Xã/Phường/Thị trấn", bỏ dấu, so khớp chuỗi con, chỉ tìm
//     trong các xã/phường CÙNG VÙNG (region) với bưu cục xử lý đơn đó để đỡ nhầm và
//     đỡ chậm — vì GHN không trả mã phường/GPS, đây LÀ suy luận gần đúng theo tên,
//     không phải khớp chính xác 100%). Xã/phường nào <15% tổng đơn giao trong ngày
//     của nhân viên đó bị loại (gom ngầm — CHƯA hiển thị riêng nhãn "Địa chỉ Khác" ở
//     bản này), giữ lại xã/phường có SỐ ĐƠN CAO NHẤT trong các xã/phường còn ≥15% làm
//     nơi đặt chấm. Nếu không có xã/phường nào đạt ≥15% (rải quá đều) hoặc không khớp
//     được xã/phường nào — KHÔNG đặt chấm cho nhân viên đó ngày đó (đếm vào số liệu
//     "không xác định được" hiện ở thanh trạng thái, để biết % bao phủ của thuật toán).
//  3) 1 NHÂN VIÊN = 1 CHẤM, đặt tại toạ độ tâm xã/phường đã xác định ở mục 2. VÌ 1
//     chấm phải thể hiện ĐỒNG THỜI 2 trạng thái độc lập (LẤY và GIAO có thể khác màu
//     nhau) nên tách làm 2 lớp trực quan:
//     - LÕI chấm (to, ở giữa): màu theo trạng thái NẶNG HƠN giữa Lấy và Giao (đỏ >
//       vàng > xanh) — LUÔN nhấp nháy (mờ-tỏ liên tục), kể cả khi xanh, đúng yêu cầu
//       gốc "nếu nhân viên mà không vượt cảnh báo thì chấm xanh nhấp nháy".
//     - VÒNG SÁNG bao quanh (chỉ hiện khi có ít nhất 1 cảnh báo ĐỎ, cũng nhấp nháy) —
//       PHÂN BIỆT RÕ 3 loại đỏ khác nhau bằng MÀU vòng sáng (đúng góp ý "thêm vòng
//       sáng làm sao để người dùng biết nó là loại nào"):
//         🟡 Vòng VÀNG SÁNG = Giao quá tải (đúng y hệt mô tả gốc "chấm đỏ vòng sáng
//            vàng nhấp nháy" cho trường hợp quá tải).
//         🔵 Vòng XANH DƯƠNG = Giao KHÔNG ĐỦ ĐƠN (phân biệt với quá tải — 2 cảnh báo
//            đỏ nhưng Ý NGHĨA NGƯỢC NHAU, không thể dùng chung 1 màu vòng).
//         🟠 Vòng CAM = Lấy thành công quá tải (>80% cầu cả bưu cục dồn vào 1 người).
//       Nếu Giao và Lấy CÙNG đỏ 1 lúc, ưu tiên hiện vòng theo Giao (vì Giao gắn với vị
//       trí đặt chấm), chi tiết đầy đủ cả 2 chỉ số luôn xem được khi bấm vào chấm.
//  4) Bấm vào chấm: hiện panel thông tin (dùng lại đúng panel cố định góc bản đồ ở
//     v1.3.0) — số đơn Lấy/Giao thực tế, ngưỡng đang áp dụng, xã/phường đã suy luận
//     ra + % số đơn tập trung ở đó, để người xem tự kiểm chứng lại thuật toán suy luận
//     chứ không phải "tin mù" vào cái chấm màu.
//  5) Checkbox "📍 Hiện chấm cảnh báo nhân viên" trên tab Bản Đồ (mặc định TẮT, tự
//     BẬT ngay sau khi tải sản lượng ở tab Theo Nhân Viên thành công) + legend riêng.
//  6) CHƯA LÀM: nhãn "Địa chỉ Khác" riêng biệt trong bảng số liệu (mới xử lý ngầm khi
//     đặt chấm, chưa hiện thành 1 dòng trong bảng "Theo Nhân Viên"); phân quyền
//     setup ngưỡng theo vai trò (đang hardcode 1 bộ ngưỡng chung).
//
// v1.4.0 (BƯỚC 1 CỦA "TAB THEO NHÂN VIÊN" — theo đúng yêu cầu "trước mắt lấy phần sản
//         lượng ra đã, xem hiển thị ra sao" — CHƯA làm chấm cảnh báo nhấp nháy trên bản
//         đồ / CHƯA làm phần gộp "Địa chỉ Khác" theo ngưỡng 15%, sẽ làm ở bản sau khi
//         xác nhận phần sản lượng hiển thị đúng):
//  1) NGUỒN DỮ LIỆU: tham khảo TRỰC TIẾP cách ghn-baocao-gtc.user.js (Modul 4 - Báo cáo
//     GTC) lấy sản lượng — module đó gọi thẳng 3 API nội bộ của GHN (KHÔNG phải qua GAS):
//       POST https://fe-nhanh-api.ghn.vn/api/lastmile/trip/search-trip   (tìm mã chuyến
//         đi theo hubId + khoảng ngày)
//       POST https://fe-nhanh-api.ghn.vn/api/lastmile/v2/trip/trip-detail (chi tiết 1
//         chuyến: driverId/driverName = nhân viên, ngày chuyến)
//       POST https://fe-nhanh-api.ghn.vn/api/lastmile/trip/get-trip-items (từng đơn
//         PICK/DELIVER/RETURN trong chuyến, có địa chỉ dạng TEXT — KHÔNG có mã phường/
//         GPS trong dữ liệu trả về, đã kiểm chứng lại bằng cách đọc thẳng code GTC).
//     Bearer token lấy đúng theo cách GTC làm: quét chuỗi "eyJ..." trong các thẻ
//     <script> nội tuyến của trang nhanh.ghn.vn (KHÔNG cần đăng nhập riêng, dùng luôn
//     phiên đang đăng nhập sẵn của người dùng) — module CHỈ ĐỌC, không lưu token vào
//     đâu cả (giống nguyên tắc "không lưu cookie" đã áp dụng với quyhoachbuucuc.info).
//  2) 4 BỘ LỌC như yêu cầu:
//     a) Từ ngày / Đến ngày (mặc định = hôm nay, giống GTC) — lọc TẠI THỜI ĐIỂM GỌI API
//        (đổi ngày phải bấm "Tải sản lượng" lại).
//     b) Bưu cục — chọn nhiều (checkbox), lấy danh sách từ chính dữ liệu bưu cục đã tải
//        ở tab "Bản Đồ" (mã bưu cục của quyhoachbuucuc.info) — LƯU Ý: mã này giả định
//        TRÙNG với hubId nội bộ GHN dùng trong search-trip (cùng là mã bưu cục GHN) —
//        nếu bưu cục nào tải về 0 chuyến đi bất thường, khả năng cao là mã không khớp,
//        cần đối chiếu lại với danh sách bưu cục thật trong Báo cáo GTC.
//     c) Nhân viên — GHN KHÔNG có sẵn API danh sách nhân viên/lọc theo nhân viên (đã xác
//        nhận khi đọc code GTC), nên danh sách nhân viên CHỈ dựng được SAU KHI đã tải dữ
//        liệu (gom driverId - driverName xuất hiện trong các chuyến đã tải) — lọc theo
//        nhân viên áp dụng NGAY (không cần gọi lại API, lọc trên dữ liệu đã có trong bộ
//        nhớ).
//     d) Nhóm khách hàng — GHN cũng KHÔNG có field "nhóm khách hàng" thật trong dữ liệu
//        trả về (đã xác nhận). Dùng lại ĐÚNG cách suy luận (heuristic) mà GTC đang dùng:
//        mã đơn bắt đầu "VNGH" => TTS; tên khách có dấu "<>" => Shopee; còn lại => SME.
//        Đây KHÔNG phải field chính thức của GHN, đã ghi rõ trong giao diện để không gây
//        hiểu nhầm là số liệu chính xác 100%.
//  3) Bảng kết quả: mỗi dòng = 1 (ngày, bưu cục, nhân viên) — Lấy TC/Thất bại, Giao TC/
//     Thất bại, Trả hàng (RETURN), Tổng đơn. Có dòng tổng hợp (bao nhiêu đơn/nhân viên/
//     bưu cục/khoảng ngày) phía trên bảng.
//  4) CHƯA LÀM (đúng như đã thống nhất, làm ở bản sau khi sản lượng hiển thị đúng):
//     - Chấm tròn từng nhân viên trên bản đồ tab "Bản Đồ", nhấp nháy đỏ+viền vàng khi
//       quá tải / vàng khi trung bình / xanh khi bình thường (cần thống nhất NGƯỠNG quá
//       tải là bao nhiêu đơn/ngày trước khi code — hỏi khi bắt đầu bước này).
//     - Xác định 1 nhân viên "thuộc" xã/phường nào (gộp theo địa chỉ, phường nào <15%
//       tổng sản lượng của nhân viên đó trong ngày thì gom vào "Địa chỉ Khác") — CẦN
//       fuzzy-match địa chỉ TEXT với tên phường (đã xác nhận GHN không trả mã phường/GPS
//       nên không thể join chính xác 100%, chỉ khớp gần đúng theo tên).
//
// v1.3.0 (SỬA GÓP Ý SAU KHI TEST v1.2.0):
//  1) BỘ LỌC NHÃN (labels) — 3 checkbox độc lập trên thanh điều khiển: "Nhãn bưu cục",
//     "Nhãn phường cũ", "Nhãn phường mới" — bật/tắt tên hiển thị thẳng trên bản đồ
//     (dùng symbol layer của MapLibre, không phải label có sẵn của nền bản đồ). Mặc
//     định: nhãn bưu cục BẬT (chỉ ~59 cái, không rối), nhãn phường cũ/mới TẮT (hàng
//     nghìn phường, để mặc định bật sẽ rối bản đồ — người dùng tự bật khi cần soi kỹ
//     1 khu vực đã zoom gần).
//  2) PANEL THÔNG TIN CỐ ĐỊNH GÓC BẢN ĐỒ: bỏ hẳn maplibregl.Popup (loại popup "nhảy"
//     theo đúng toạ độ bấm, che mất ranh giới xung quanh chỗ đang xem) — thay bằng 1
//     panel thông tin nằm CỐ ĐỊNH ở góc trên-phải bản đồ (không đổi vị trí dù bấm vào
//     đâu), có nút ✕ để đóng, tự cuộn (scroll) nếu nội dung dài. Bấm phường/bưu cục
//     khác chỉ đổi NỘI DUNG bên trong panel, không đổi vị trí panel.
//  3) BẤM VÀO PHƯỜNG MỚI (đã gộp) GIỜ HIỂN THỊ ĐẦY ĐỦ SỐ LIỆU GỘP — trước đây bấm vào
//     ranh giới phường MỚI chỉ hiện mỗi tên (không có số liệu). Phát hiện thêm 1 API
//     nữa của quyhoachbuucuc.info khi bấm thử trực tiếp tính năng "Re-zone" trên trang
//     đó (F12 xem Network): /api/rezone.json — chứa sẵn đúng phần "gộp phường cũ vào
//     phường mới": tổng cầu (đơn/kg) theo phường mới, trạng thái gọn/bị xé, BC được tự
//     động gán + danh sách "ứng viên" BC theo % cầu, và bảng "thành phần phường cũ"
//     (từng phường cũ thuộc phường mới này giao cho BC nào, bao nhiêu đơn/kg, nhận
//     "toàn bộ" hay "một phần"). Đã thêm làm nguồn dữ liệu thứ 6, bấm vào bất kỳ đâu
//     bên trong ranh giới phường MỚI (không chỉ đúng viền) đều ra popup đầy đủ y hệt
//     màn hình "Re-zone" của quyhoachbuucuc.info, kèm viền highlight riêng (màu xanh
//     dương) quanh phường mới đang chọn.
//  4) GAS_TUYEN_GIAO.gs: thêm cache/API mới action=getRezone (file tuyen_giao_rezone.json
//     trên Drive) để lưu backup /api/rezone.json — CẦN DEPLOY LẠI GAS lần này (chỉ
//     thêm hàm mới, không phá dữ liệu cũ đã lưu).
//
// v1.2.0 (SỬA GÓP Ý SAU KHI TEST v1.1.0 — vào tận quyhoachbuucuc.info bấm thử từng
//         lớp/checkbox trên đó (F12 mở sẵn) để soi đúng cách họ làm, phát hiện ra
//         BUG GỐC RỄ khiến v1.1.0 vẫn không thấy ranh giới phường rõ ràng):
//  1) PHÁT HIỆN BUG NGHIÊM TRỌNG (join sai nguồn dữ liệu): bản v1.0.0/v1.1.0 lấy
//     SỐ LIỆU (pv/pw/dv/dw, pick_hub, delivery_hub...) từ /api/wards.json rồi ghép
//     vào POLYGON của /api/wards_new.geojson theo ward_code === new_ward_code — SAI,
//     vì soi kỹ 2 file mới thấy /api/wards.json thật ra là số liệu theo PHƯỜNG CŨ
//     (vẫn còn field "district": "Huyện ..." — cấp huyện chỉ tồn tại ở cấu trúc CŨ,
//     sau sáp nhập 2025 Việt Nam bỏ hẳn cấp huyện), còn /api/wards_new.geojson là
//     ranh giới phường MỚI (chỉ có new_ward_code + name, khác hệ mã hoàn toàn với
//     wards.json) — 2 file này ward_code CHÊNH NHAU, khớp được rất ít hoặc gần như
//     0 phường, nên bản đồ gần như trống trơn dù màu/viền đã sửa đúng ở bản trước.
//     Đã tìm thấy đúng cặp khớp nhau: có thêm 1 API nữa là /api/wards.geojson (ranh
//     giới phường CŨ, property chỉ có "ward_code") — field ward_code của
//     /api/wards.json và /api/wards.geojson LÀ CÙNG 1 HỆ MÃ (test khớp 771/771).
//     => Kiến trúc lại đúng: lớp TÔ MÀU + SỐ LIỆU + POPUP chính giờ dùng
//     wards.json (số liệu) + wards.geojson (ranh giới CŨ) — khớp 100%.
//     wards_new.geojson chỉ còn dùng làm LỚP VIỀN THAM KHẢO ranh giới MỚI (không có
//     số liệu riêng, đúng bản chất — quyhoachbuucuc.info cũng dùng nó y như vậy: 2
//     checkbox riêng "Phủ màu phường cũ (coverage)" và "Ranh giới phường mới").
//  2) THÊM 2 lớp ranh giới đúng yêu cầu:
//     a) "☑ Hiện ranh giới phường MỚI" (checkbox, mặc định bật) — vẽ viền ĐỎ đậm từ
//        wards_new.geojson đè lên trên, bấm vào 1 đường viền mới thấy popup tên
//        phường mới (không có số liệu riêng, có ghi chú rõ).
//     b) Ranh giới LÃNH THỔ BƯU CỤC: bấm vào 1 marker bưu cục (chấm cam) → ngoài
//        popup tổng sản lượng, TỰ ĐỘNG tô viền ĐEN DÀY quanh TẤT CẢ các phường cũ có
//        delivery_hub = đúng bưu cục đó → trả lời thẳng câu hỏi "bưu cục này gồm
//        những xã/phường nào". Bấm 1 phường bất kỳ cũng tự động highlight viền VÀNG
//        DÀY quanh đúng phường đó (không chỉ hiện popup như trước). Có nút
//        "✖ Bỏ chọn" để xoá highlight, hoặc bấm ra chỗ trống trên bản đồ.
//  3) THÊM 2 nút trên thanh tiêu đề:
//     a) "➖ Thu nhỏ" — thu cửa sổ về 1 thanh nhỏ (icon), giữ NGUYÊN toàn bộ dữ liệu
//        đã tải + bản đồ trong bộ nhớ (khác nút ✖ Đóng — đóng là huỷ hẳn, phải tải
//        lại từ đầu). Bấm lại để mở về đúng kích thước/vị trí lúc thu nhỏ.
//     b) "⛶ Phóng to" — phóng cửa sổ gần kín màn hình hiện tại (theo đúng độ phân
//        giải/zoom trình duyệt đang dùng). Bấm lại để về đúng kích thước trước đó.
//  4) GAS_TUYEN_GIAO.gs: thêm cache/API mới action=getWardsOldGeoJson (file
//     tuyen_giao_wards_old.geojson trên Drive) để lưu backup /api/wards.geojson —
//     CẦN DEPLOY LẠI GAS lần này (chỉ thêm hàm mới, không phá dữ liệu cũ đã lưu).
//
// v1.1.0 (SỬA 3 GÓP Ý SAU KHI TEST v1.0.0 — ảnh chụp màn hình cho thấy: marker BC
//         hiện đúng nhưng KHÔNG thấy polygon ranh giới phường nào; cửa sổ quá nhỏ;
//         và quy trình dán JSON tay bị chê "không chuyên nghiệp" — đúng, đã sửa cả 3):
//  1) TỰ ĐỘNG TẢI TRỰC TIẾP (không cần dán tay nữa): thêm @grant GM_xmlhttpRequest
//     + @connect www.quyhoachbuucuc.info — mỗi khi bấm nút mở modul, code tự gọi
//     thẳng API của quyhoachbuucuc.info bằng cookie đăng nhập có sẵn trên chính
//     trình duyệt (GM_xmlhttpRequest gửi kèm cookie của domain đích, không cần lấy
//     tay). Nếu thành công: hiện luôn lên bản đồ NGAY, đồng thời tự lưu 1 bản backup
//     lên Google Sheet/Drive (GAS_TUYEN_GIAO.gs) — không cần bấm gì thêm.
//     NẾU tải trực tiếp thất bại (mất mạng, chưa đăng nhập quyhoachbuucuc.info trên
//     trình duyệt này, đổi cách đăng nhập...): tự động rơi về dùng bản backup đã lưu
//     lần gần nhất, kèm CHẤM ĐỎ 🔴 "OFFLINE" ngay trên thanh trạng thái + ghi rõ thời
//     điểm đồng bộ backup lần cuối, để biết ngay đang xem số liệu cũ hay mới. Tab
//     "🔄 Đồng Bộ Dữ Liệu" (dán tay) VẪN GIỮ LẠI làm phương án dự phòng thủ công khi
//     GM_xmlhttpRequest cũng không dùng được, không phải cách dùng chính nữa.
//  2) Sửa màu viền/tô (xem chi tiết đầy đủ hơn ở mục 1 của v1.2.0 — hoá ra còn bug
//     join sai nguồn dữ liệu nặng hơn cả màu sắc, đã sửa dứt điểm ở bản này).
//  3) Cửa sổ tự tính kích thước theo màn hình đang dùng (92% chiều rộng, 88% chiều
//     cao, tối đa 1500×950px) thay vì cố định 900×620px, tự canh lại khi resize
//     trình duyệt hoặc đổi zoom, có tay cầm kéo-giãn góc dưới-phải.
//
// v1.0.0 (KHỞI TẠO — modul hoàn toàn mới, TÁCH RIÊNG khỏi "Modul 4 - Báo cáo GTC"
//         theo đúng yêu cầu, KHÔNG đụng/sửa bất kỳ dòng nào của
//         ghn-baocao-gtc.user.js hay GAS_BAOCAO_GTC.gs — 2 modul chạy song song,
//         độc lập hoàn toàn, mỗi modul có cửa sổ + nút bấm riêng trên trang):
//
//  BỐI CẢNH & NGHIÊN CỨU ĐÃ LÀM TRƯỚC KHI CODE:
//   - Đã vào xem trực tiếp https://www.quyhoachbuucuc.info/web/index.html (trang
//     nội bộ GHN đang làm tốt phần bản đồ, đã đăng nhập sẵn) để xem nó dùng công
//     nghệ gì. XÁC NHẬN: trang đó dùng MapLibre GL JS + nền bản đồ OpenFreeMap
//     (style "positron" tại https://tiles.openfreemap.org/styles/positron — MIỄN
//     PHÍ, KHÔNG cần API key, đúng như https://openfreemap.org/quick_start/ mô tả)
//     + deck.gl cho vài lớp phụ (không dùng ở modul này, MapLibre polygon là đủ).
//   - Trang đó có 5 API nội bộ (đã cập nhật đủ ở v1.2.0):
//       /api/wards.geojson       → ranh giới phường CŨ (chỉ có ward_code)
//       /api/wards_new.geojson   → ranh giới phường MỚI, sau sáp nhập 2025 (chỉ có
//                                   new_ward_code + name — KHÔNG có số liệu riêng)
//       /api/wards.json          → số liệu theo phường CŨ: BC lấy/giao phụ trách,
//                                   pv (đơn lấy) / pw (kg lấy) / dv (đơn giao) / dw
//                                   (kg giao) — join với wards.geojson qua ward_code
//       /api/hubs.json           → danh sách bưu cục, toạ độ, sản lượng actual
//       /api/ward_centroids.json → toạ độ tâm từng phường (cũ)
//     5 file này được đồng bộ vào Google Sheet + Drive RIÊNG của modul này
//     (GAS_TUYEN_GIAO.gs) để KHÔNG bị phụ thuộc quyhoachbuucuc.info về lâu dài.
//
//  CHƯA LÀM (cần dữ liệu KHÁC — không có sẵn trong quyhoachbuucuc.info, phải nối
//  với dữ liệu chuyến đi/đơn hàng thật của GHN, đúng kế hoạch "dễ trước, khó sau"):
//   a) Cấp lọc "Nhân viên" — quyhoachbuucuc.info CHỈ có số liệu theo BƯU CỤC/PHƯỜNG,
//      KHÔNG có theo từng nhân viên. Cần: xác định nhân viên đó giao đơn ở phường
//      nào (dựa vào dữ liệu chuyến đi) — hiện dữ liệu trích xuất của Modul 4 (báo
//      cáo GTC) MỚI CHỈ CÓ địa chỉ dạng TEXT, CHƯA có mã phường/GPS, nên chưa "chấm"
//      được đơn lên đúng phường — cần thêm bước khớp địa chỉ text với tên phường
//      trong wards.json (hoặc tìm field mã phường ẩn trong API gốc GHN, nếu có).
//   b) "Tỷ lệ giao hàng / trả hàng" — quyhoachbuucuc.info chỉ có SẢN LƯỢNG (số đơn),
//      không có tỷ lệ — cần nối dữ liệu trạng thái đơn thật (Modul 4), làm cùng lúc
//      với mục (a) vì cùng cần nguồn dữ liệu đơn hàng thật.
//
//  LƯU Ý QUAN TRỌNG: KHÔNG lưu cookie/session của quyhoachbuucuc.info ở bất kỳ đâu
//  trong code hay trong Google Sheet — chỉ lưu DỮ LIỆU JSON (geojson/json thuần).
// ==========================================================================================

(function () {
    'use strict';

    // ==================== CẤU HÌNH ====================
    // ⚠️ FILE NÀY ĐANG ĐỂ TRỐNG (không biết URL Web App hiện tại của bạn) — TRƯỚC
    // KHI DÙNG BẢN v1.7.16 NÀY, NHỚ DÁN LẠI ĐÚNG URL Web App bạn đã deploy trước đó — VÀ PHẢI
    // DEPLOY LẠI Web App (Deploy > Manage deployments > Version: New version) vì
    // GAS_TUYEN_GIAO.gs có action MỚI (getHrm) — chỉ lưu code trong editor KHÔNG đủ.
    // (dạng https://script.google.com/macros/s/XXXX/exec) vào dòng dưới đây, nếu
    // không tải trực tiếp vẫn chạy được (không cần dòng này) nhưng sẽ KHÔNG có bản
    // backup offline khi mất mạng/mất đăng nhập quyhoachbuucuc.info. Xem hướng dẫn
    // đầy đủ ở đầu file GAS_TUYEN_GIAO.gs.
    const GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO = 'https://script.google.com/macros/s/AKfycbx7-gr0yl5Ps9Pn_Ax0nedYCuN3-B9skJ1aSq36ntkltDl_w4SCO86fFnzcYOHQCeb5/exec';

    const GHN_BLUE = '#007ed4';
    const GHN_ORANGE = '#ff7300';
    const QUYHOACH_BASE = 'https://www.quyhoachbuucuc.info';
    const NO_MATCH_TOKEN = '__ghn_tg_no_match__';
    // API nội bộ GHN (KHÔNG phải quyhoachbuucuc.info) — dùng để lấy sản lượng theo
    // nhân viên/bưu cục cho tab "Theo Nhân Viên", mirror đúng cách ghn-baocao-gtc.user.js
    // đang gọi (xem changelog v1.4.0).
    const GHN_API_BASE = 'https://fe-nhanh-api.ghn.vn';

    // Bảng màu cố định để tô theo bưu cục (mỗi bưu cục luôn ra đúng 1 màu, không
    // đổi màu lung tung mỗi lần load lại trang) — hash tên/mã BC ra 1 hue cố định.
    function hubColor_(hubCode) {
        const str = String(hubCode || '');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
        }
        const hue = hash % 360;
        return `hsl(${hue}, 68%, 55%)`;
    }

    // ==================== GỌI BACKEND (GAS_TUYEN_GIAO.gs) ====================
    async function gasGet_(action, extraParams) {
        if (!GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO || !GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO.trim()) {
            throw new Error('Chưa cấu hình GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO trong code — xem hướng dẫn deploy ở đầu file GAS_TUYEN_GIAO.gs.');
        }
        const params = new URLSearchParams({ action, ...(extraParams || {}) });
        const url = `${GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO}?${params.toString()}`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status} khi gọi action=${action}`);
        return res.json();
    }

    // QUAN TRỌNG: dùng "text/plain;charset=utf-8" (KHÔNG dùng "application/json")
    // để tránh trình duyệt gửi preflight OPTIONS — Apps Script Web App không xử lý
    // được OPTIONS nên preflight sẽ luôn thất bại với "Failed to fetch". Bài học đã
    // rút ra và ghi lại trong ghn-baocao-gtc.user.js, áp dụng lại ở đây.
    async function gasPost_(action, body) {
        if (!GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO || !GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO.trim()) {
            throw new Error('Chưa cấu hình GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO trong code — xem hướng dẫn deploy ở đầu file GAS_TUYEN_GIAO.gs.');
        }
        const res = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, ...body })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} khi gọi action=${action}`);
        return res.json();
    }

    // v1.7.5 — tải trạng thái nhân sự (sheet "HRM", CHỈ ĐỌC — xem getHrm_() trong
    // GAS_TUYEN_GIAO.gs) 1 lần khi mở modul, song song với việc tải bản đồ (KHÔNG await ở
    // openWindow_ — xem lời gọi), để không làm chậm/chặn phần tải bản đồ chính. Lỗi ở đây
    // (VD chưa có sheet HRM, hoặc mất mạng) KHÔNG được phép làm hỏng cả modul — chỉ đơn
    // giản là thiếu phần trạng thái nhân sự (mọi popup/bảng vẫn hoạt động bình thường,
    // resolveHrmDisplay_() tự trả về "(chưa có dữ liệu nhân sự)" khi không tìm thấy).
    async function loadHrmData_() {
        try {
            const res = await gasGet_('getHrm');
            if (!res || !res.ok) {
                console.warn('[Tuyến Giao] Không tải được dữ liệu HRM:', res && res.error);
                return;
            }
            const map = {};
            (res.rows || []).forEach(r => { if (r.id) map[String(r.id).trim()] = r; });
            state.hrmByDriverId = map;
            state.hrmLoaded = true;
            if (state.dataLoaded) qhBuildOrg_();
            // Nếu tab "Theo Nhân Viên" đã có dữ liệu TRƯỚC KHI HRM tải xong (chạy song
            // song, không chờ nhau) -> vẽ lại NGAY để cập nhật màu xám/trạng thái, không bắt
            // người dùng phải tự bấm tải lại sản lượng.
            if (state.staffRawRows && state.staffRawRows.length > 0) {
                renderStaffTable_();
                updateStaffDotsOnMap_();
            }
        } catch (err) {
            console.warn('[Tuyến Giao] Lỗi tải dữ liệu HRM (không chặn modul, chỉ thiếu phần trạng thái nhân sự):', err);
        }
    }

    // v1.7.17 — tải sản lượng CẦN GIAO + số đơn ĐÃ GÁN thật theo ngày/bưu cục (sheet
    // "Performance", CHỈ ĐỌC — xem getPerformance_() trong GAS_TUYEN_GIAO.gs), ĐÚNG khoảng
    // ngày người dùng vừa bấm tải ở tab "Theo Nhân Viên" (fromDate/toDate) — KHÁC HRM (tải 1
    // lần, cả roster, không theo ngày) vì Performance là dữ liệu THEO NGÀY, phải tải lại mỗi
    // lần đổi khoảng ngày xem, giống hệt fetchStaffVolumeRows_(). Gọi SONG SONG (Promise.all)
    // với fetchStaffVolumeRows_ ở loadStaffVolume_() — không làm chậm thêm phần tải chính. Lỗi
    // ở đây (chưa có sheet Performance, mất mạng...) KHÔNG được chặn cả modul — Định biên tự
    // rơi về phương án dự phòng cũ (v1.7.16, suy luận từ chuyến chưa gán tài xế) khi
    // state.performanceRows rỗng, xem computeHubStaffingStats_.
    async function loadPerformanceData_(fromDate, toDate) {
        try {
            const res = await gasGet_('getPerformance', { fromDate, toDate });
            if (!res || !res.ok) {
                console.warn('[Tuyến Giao] Không tải được dữ liệu Performance (đơn tồn chưa gán cấp bưu cục):', res && res.error);
                state.performanceRows = [];
                state.performanceLoaded = false;
                return;
            }
            state.performanceRows = res.rows || [];
            state.performanceLoaded = true;
        } catch (err) {
            console.warn('[Tuyến Giao] Lỗi tải dữ liệu Performance (không chặn modul — Định biên tự dùng phương án dự phòng cũ):', err);
            state.performanceRows = [];
            state.performanceLoaded = false;
        }
    }

    // ==================== TẢI TRỰC TIẾP TỪ quyhoachbuucuc.info ====================
    // Dùng GM_xmlhttpRequest (KHÔNG phải fetch()) vì đây là gọi CROSS-ORIGIN sang 1
    // domain khác hẳn (nhanh.ghn.vn -> quyhoachbuucuc.info) — trình duyệt sẽ chặn
    // fetch() thường vì lỗi CORS. GM_xmlhttpRequest chạy với quyền của tiện ích mở
    // rộng Tampermonkey, không bị chặn CORS, và tự động gửi kèm cookie đăng nhập đã
    // có sẵn trên trình duyệt cho domain quyhoachbuucuc.info — KHÔNG cần copy
    // cookie/token vào code ở bất kỳ đâu.
    function gmFetch_(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('Trình duyệt/Tampermonkey không hỗ trợ GM_xmlhttpRequest (thiếu @grant).'));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: 25000,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        try {
                            resolve(JSON.parse(res.responseText));
                        } catch (e) {
                            reject(new Error(`Không đọc được JSON từ ${url}: ${e.message}`));
                        }
                    } else if (res.status === 401 || res.status === 403) {
                        reject(new Error(`Chưa đăng nhập quyhoachbuucuc.info trên trình duyệt này (HTTP ${res.status}).`));
                    } else {
                        reject(new Error(`HTTP ${res.status} khi tải ${url}`));
                    }
                },
                onerror: () => reject(new Error(`Lỗi mạng khi tải ${url}`)),
                ontimeout: () => reject(new Error(`Quá thời gian chờ khi tải ${url}`))
            });
        });
    }

    // v1.7.28 — GỘP DỮ LIỆU NHIỀU VÙNG. "live" = dữ liệu mới (thắng), "old" = dữ liệu cũ (vd backup Drive).
    // Vùng có trong live → lấy hoàn toàn từ live (bỏ bản cũ của vùng đó, kể cả phường/bưu cục đã bị xoá);
    // các vùng KHÁC trong old giữ nguyên. Mỗi tham số: {wardsNew, wardsOld, hubs, wards, centroids, rezone}.
    function regionMergeData_(live, old) {
        live = live || {}; old = old || {};
        const S = v => String(v == null ? '' : v);
        const liveRegions = new Set();
        (live.hubs || []).forEach(h => h && h.region && liveRegions.add(S(h.region)));
        (live.wards || []).forEach(w => w && w.region && liveRegions.add(S(w.region)));
        const oldWardRegion = {};
        (old.wards || []).forEach(w => { if (w) oldWardRegion[S(w.ward_code)] = S(w.region); });
        const oldNewRegion = {};
        ((old.rezone && old.rezone.new_wards) || []).forEach(n => { if (n) oldNewRegion[S(n.new_code)] = S(n.region); });
        const liveWard = new Set((live.wards || []).map(w => S(w.ward_code)));
        ((live.wardsOld && live.wardsOld.features) || []).forEach(f => liveWard.add(S((f.properties || {}).ward_code)));
        const liveHub = new Set((live.hubs || []).map(h => S(h.hub_code)));
        const liveNew = new Set(((live.rezone && live.rezone.new_wards) || []).map(n => S(n.new_code)));
        ((live.wardsNew && live.wardsNew.features) || []).forEach(f => liveNew.add(S((f.properties || {}).new_ward_code)));
        const keepWard = c => !liveWard.has(S(c)) && !liveRegions.has(oldWardRegion[S(c)]);
        const keepNew = c => !liveNew.has(S(c)) && !liveRegions.has(oldNewRegion[S(c)]);
        const fc = (a, b, key, keep) => {
            const A = a && Array.isArray(a.features) ? a.features : null;
            const B = b && Array.isArray(b.features) ? b.features.filter(f => keep((f.properties || {})[key])) : [];
            if (!A && !B.length) return a || b || null;
            return { type: 'FeatureCollection', features: (A || []).concat(B) };
        };
        const out = {};
        out.hubs = (live.hubs || []).concat((old.hubs || []).filter(h => h && !liveHub.has(S(h.hub_code)) && !liveRegions.has(S(h.region))));
        out.wards = (live.wards || []).concat((old.wards || []).filter(w => w && keepWard(w.ward_code)));
        out.wardsOld = fc(live.wardsOld, old.wardsOld, 'ward_code', keepWard);
        out.wardsNew = fc(live.wardsNew, old.wardsNew, 'new_ward_code', keepNew);
        out.centroids = {};
        Object.keys(old.centroids || {}).forEach(k => { if (keepWard(k)) out.centroids[k] = old.centroids[k]; });
        Object.assign(out.centroids, live.centroids || {});
        const lr = live.rezone && Array.isArray(live.rezone.new_wards) ? live.rezone : null;
        const or = old.rezone && Array.isArray(old.rezone.new_wards) ? old.rezone : null;
        out.rezone = (lr || or) ? {
            stats: (lr || or).stats || {},
            new_wards: (lr ? lr.new_wards : []).concat(or ? or.new_wards.filter(n => n && keepNew(n.new_code)) : [])
        } : null;
        out.regions = Array.from(new Set(out.hubs.map(h => S(h.region)).filter(Boolean)));
        return out;
    }

    // v1.7.28 — đọc toàn bộ backup Drive (qua GAS) thành 1 object cho regionMergeData_. Lỗi → null.
    async function fetchBackupData_() {
        try {
            const meta = await gasGet_('getMeta');
            if (!meta || !meta.ok || !meta.hasHubs || !meta.hasWards || !meta.hasWardsOldGeoJson) return null;
            const g = async (a, ok) => { try { const r = await gasGet_(a); return r && r.ok ? r.data : null; } catch (e) { return null; } };
            const [wardsOld, wardsNew, hubs, wards, centroids, rezone] = await Promise.all([
                g('getWardsOldGeoJson'), meta.hasWardsGeoJson ? g('getWardsGeoJson') : null, g('getHubs'), g('getWards'),
                g('getWardCentroids'), meta.hasRezone ? g('getRezone') : null]);
            if (!Array.isArray(hubs) || !Array.isArray(wards)) return null;
            return { wardsOld, wardsNew, hubs, wards, centroids: centroids || {}, rezone };
        } catch (e) { console.warn('[Tuyến Giao] Không đọc được backup Drive để gộp vùng:', e); return null; }
    }

    // v1.7.29 — gửi phiên đăng nhập quyhoachbuucuc.info lên máy chủ web báo cáo để web tự đồng bộ (xem changelog)
    const QH_WEB_API = 'https://baocaovanhanh.vercel.app/api/gas';
    function readQuyhoachCookie_() {
        const listBy = d => new Promise(res => {
            try {
                GM_cookie.list(d, (cookies, err) => res({ cookies: Array.isArray(cookies) ? cookies : [], err: err ? String(err) : '' }));
            } catch (e) { res({ cookies: [], err: String(e && e.message || e) }); }
        });
        return (async () => {
            if (typeof GM_cookie === 'undefined' || !GM_cookie || typeof GM_cookie.list !== 'function') {
                return { cookie: '', why: 'tampermonkey_khong_ho_tro_GM_cookie' };
            }
            const tries = [
                ['url', { url: QUYHOACH_BASE + '/' }],
                ['url_api', { url: QUYHOACH_BASE + '/api/hubs.json' }],
                ['domain', { domain: 'quyhoachbuucuc.info' }],
                ['domain_www', { domain: 'www.quyhoachbuucuc.info' }],
                ['tat_ca', {}]
            ];
            const notes = [];
            for (const [name, d] of tries) {
                const r = await listBy(d);
                const ck = r.cookies.filter(c => !c.domain || String(c.domain).indexOf('quyhoachbuucuc') !== -1);
                notes.push(name + ':' + (r.err ? 'loi ' + r.err : ck.length));
                if (ck.length) {
                    console.log('[Tuyến Giao] Cookie quyhoach đọc được (' + name + '):', ck.map(c => c.name + (c.httpOnly ? '[httpOnly]' : '')).join(', '));
                    return { cookie: ck.map(c => c.name + '=' + c.value).join('; '), why: '' };
                }
            }
            return { cookie: '', why: 'khong_co_cookie [' + notes.join(' ') + ']' };
        })();
    }
    async function pushQuyhoachSessionToWeb_() {
        try {
            const KEY = 'ghn_tg_qh_sid_push';
            const last = Number(localStorage.getItem(KEY) || 0);
            if (Date.now() - last < 2 * 3600 * 1000) return;
            const ck = await readQuyhoachCookie_();
            if (!ck.cookie) {
                console.warn('[Tuyến Giao] Không đọc được phiên quyhoachbuucuc để gửi web báo cáo:', ck.why);
                state.qhWebSidStatus = '⚠️ chưa gửi được phiên cho web (' + ck.why + ')';
                setTimeout(() => { const el = document.getElementById('ghn-tg-status-text'); if (el) el.textContent += ' · ' + state.qhWebSidStatus; }, 4000);
                return;
            }
            const by = state.currentUser ? (state.currentUser.fullname || '') + ' (' + state.currentUser.ssoId + ')' : '';
            GM_xmlhttpRequest({
                method: 'POST', url: QH_WEB_API, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                data: JSON.stringify({ action: 'qhSaveSid', cookie: ck.cookie, by }),
                onload: r => {
                    let j = null; try { j = JSON.parse(r.responseText); } catch (e) { /* */ }
                    if (j && j.ok) { localStorage.setItem(KEY, String(Date.now())); state.qhWebSidStatus = '✅ đã gửi phiên cho web báo cáo tự đồng bộ'; }
                    else state.qhWebSidStatus = '⚠️ web báo cáo chưa nhận phiên (' + ((j && (j.error + (j.detail ? ':' + j.detail : ''))) || ('HTTP ' + r.status)) + ')';
                    console.log('[Tuyến Giao] Gửi phiên quyhoach cho web báo cáo:', j || r.status);
                    const el = document.getElementById('ghn-tg-status-text');
                    if (el && state.qhWebSidStatus) el.textContent += ' · ' + state.qhWebSidStatus;
                },
                onerror: () => { state.qhWebSidStatus = '⚠️ không gọi được web báo cáo'; }
            });
        } catch (e) { console.warn('[Tuyến Giao] pushQuyhoachSessionToWeb_ lỗi:', e); }
    }

    // Thử tải TRỰC TIẾP cả 6 nguồn từ quyhoachbuucuc.info. Thành công thì gán thẳng
    // vào state (không cần qua GAS trước), đồng thời BẮN NGẦM 1 bản backup lên
    // GAS_TUYEN_GIAO.gs (không chờ, không chặn UI).
    async function tryLiveSync_(onProgress) {
        onProgress && onProgress('🔎 Đang thử tải trực tiếp từ quyhoachbuucuc.info...');
        const [wardsNew, wardsOld, hubs, wards, centroids, rezone] = await Promise.all([
            gmFetch_(`${QUYHOACH_BASE}/api/wards_new.geojson`),
            gmFetch_(`${QUYHOACH_BASE}/api/wards.geojson`),
            gmFetch_(`${QUYHOACH_BASE}/api/hubs.json`),
            gmFetch_(`${QUYHOACH_BASE}/api/wards.json`),
            gmFetch_(`${QUYHOACH_BASE}/api/ward_centroids.json`),
            gmFetch_(`${QUYHOACH_BASE}/api/rezone.json`).catch(err => {
                // rezone.json KHÔNG bắt buộc — nếu lỗi (VD API đổi) vẫn cho phần còn lại
                // của bản đồ chạy bình thường, chỉ mất phần popup gộp phường mới.
                console.warn('[Tuyến Giao] Tải /api/rezone.json thất bại (không bắt buộc):', err);
                return null;
            })
        ]);
        if (!wardsOld || !Array.isArray(wardsOld.features)) {
            throw new Error('wards.geojson (ranh giới cũ) tải về không hợp lệ.');
        }
        pushQuyhoachSessionToWeb_(); // v1.7.29 — không chờ
        // v1.7.28 — gộp với backup Drive để KHÔNG mất các vùng khác (xem regionMergeData_)
        onProgress && onProgress('🔎 Đang gộp với dữ liệu các vùng khác đã lưu...');
        const backupAll = await fetchBackupData_();
        const merged = regionMergeData_({ wardsNew: wardsNew && Array.isArray(wardsNew.features) ? wardsNew : null,
            wardsOld, hubs, wards, centroids, rezone: rezone && Array.isArray(rezone.new_wards) ? rezone : null }, backupAll);
        state.wardsNewRaw = merged.wardsNew && Array.isArray(merged.wardsNew.features) ? merged.wardsNew : null;
        state.wardsOldRaw = merged.wardsOld;
        state.hubs = merged.hubs;
        state.wards = merged.wards;
        state.wardCentroids = merged.centroids;
        state.rezone = merged.rezone;

        // Backup ngầm lên GAS — cố tình KHÔNG await, để không làm chậm việc hiển thị
        // bản đồ. Lỗi backup chỉ log ra console, không ảnh hưởng phiên đang xem.
        if (GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO && GOOGLE_APPS_SCRIPT_WEB_APP_URL_TUYEN_GIAO.trim()) {
            // v1.7.1 — SỬA: trước đây "syncedBy" luôn ghi cứng chuỗi chung chung "Tự động
            // (auto-sync khi mở modul)", không biết THỰC SỰ ai đã mở modul gây ra lần đồng
            // bộ đó — người dùng yêu cầu bổ sung "ai là người load" để theo dõi trong sheet
            // SyncLog. state.currentUser đã có sẵn (họ tên + ssoId thật, lấy qua GHN
            // /my-profile) NGAY LÚC NÀY vì tryLiveSync_() chỉ chạy sau khi qua được cổng
            // phân quyền checkPermissionAndGate_() — luôn có state.currentUser hợp lệ.
            const whoTriggered = state.currentUser
                ? `${state.currentUser.fullname || '(chưa rõ tên)'} (ssoId: ${state.currentUser.ssoId})`
                : '(không xác định được người dùng)';
            const backupPayload = {
                syncedBy: `Tự động (auto-sync khi mở modul) — bởi ${whoTriggered}`,
                wardsGeoJson: JSON.stringify(state.wardsNewRaw),
                wardsOldGeoJson: JSON.stringify(state.wardsOldRaw),
                hubs: JSON.stringify(state.hubs),
                wards: JSON.stringify(state.wards),
                wardCentroids: JSON.stringify(state.wardCentroids)
            };
            if (state.rezone) backupPayload.rezone = JSON.stringify(state.rezone);
            gasPost_('syncData', backupPayload).then(r => {
                console.log('[Tuyến Giao] Đã backup dữ liệu auto-sync lên GAS:', r);
            }).catch(err => {
                console.warn('[Tuyến Giao] Backup auto-sync lên GAS thất bại (không ảnh hưởng phiên đang xem):', err);
            });
        }
    }

    // ==================== STATE ====================
    const state = {
        map: null,
        wardsNewRaw: null,       // FeatureCollection ranh giới MỚI (new_ward_code + name, KHÔNG có số liệu)
        wardsOldRaw: null,       // FeatureCollection ranh giới CŨ (ward_code)
        wardsOldEnriched: null,  // ranh giới CŨ + số liệu wards.json đã gộp — LỚP CHÍNH
        hubs: [],
        wards: [],
        wardCentroids: {},
        rezone: null,            // /api/rezone.json thô — gộp phường cũ -> phường mới
        rezoneByNewCode: {},     // lookup nhanh new_ward_code -> entry trong rezone.new_wards
        hubsByCode: {},
        wardsByCode: {},
        // v1.7.17 — tên bưu cục (VD "(THN) Phú Bình 2", giống HỆT h.name trong hubs.json) ->
        // hub_code — dựng 1 lần trong buildLookups_(), dùng để khớp sheet "Performance" (chỉ có
        // TÊN bưu cục ở cột B, không có mã) với hubCode nội bộ. Xem performanceHubCode_().
        hubNameToCode: {},
        // v1.7.17 — dữ liệu sản lượng CẦN GIAO + số đơn ĐÃ GÁN thật theo ngày/bưu cục (sheet
        // "Performance", tự đọc qua action=getPerformance — xem loadPerformanceData_()). Đây là
        // nguồn "đơn tồn CHƯA GÁN" (Volume - Đơn gán) đáng tin cậy nhất hiện có ở cấp BƯU CỤC,
        // dùng bổ sung cho tử số Định biên ở computeHubStaffingStats_ (phân bổ xuống xã/phường
        // theo tỷ trọng — chính sheet này KHÔNG có cột xã/phường). Tải LẠI mỗi khi bấm tải sản
        // lượng ở tab "Theo Nhân Viên" (cùng lúc, cùng khoảng ngày — xem loadStaffVolume_()).
        performanceRows: [],
        performanceLoaded: false,
        regions: [],
        currentRegion: 'all',
        currentMode: 'hub', // 'hub' | 'ward'
        showNewBoundary: false, // v1.7.13: mặc định TẮT theo yêu cầu — bật tay khi cần (trước đây mặc định BẬT gây rối bản đồ)
        showHubLabels: true,
        showOldWardLabels: false,
        showNewWardLabels: false,
        selectedWardCode: null,
        selectedHubCode: null,
        selectedNewWardCode: null,
        dataLoaded: false,
        // v1.7.0 — PHÂN QUYỀN theo bưu cục. currentUser = {ssoId, fullname} lấy qua
        // fetchGhnProfile_() (API chính thức GHN, không thể tự gõ giả). permission =
        // {role: 'ADMIN'|'QUAN_LY'|'NHAN_VIEN', hubCodes: [...]} lấy từ sheet PhanQuyen
        // qua GAS — null nghĩa là CHƯA kiểm tra hoặc KHÔNG có quyền (2 trường hợp phân
        // biệt bằng permissionChecked). Toàn bộ dữ liệu (state.wards/state.hubs/
        // state.wardsOldEnriched) bị LỌC lại theo permission.hubCodes ngay sau khi tải
        // xong nếu role khác ADMIN — xem applyPermissionScopeFilter_().
        currentUser: null,
        permission: null,
        permissionChecked: false,
        isOffline: false,
        offlineReason: '',
        lastSyncAt: null,
        matchedWardCount: 0,
        totalWardFeatureCount: 0,
        savedRect: null,       // dùng khi thu nhỏ/phóng to để khôi phục đúng vị trí/cỡ cũ
        isMinimized: false,
        isMaximized: false,

        // ---- Tab "Theo Nhân Viên" (v1.4.0) ----
        ghnToken: null,               // Bearer token quét được từ trang nhanh.ghn.vn
        staffHubSelection: new Set(), // mã bưu cục đang tick chọn để tải sản lượng
        staffRawRows: [],             // mảng phẳng từng đơn (PICK/DELIVER/RETURN) đã tải
        // v1.7.16 — đơn thuộc CHUYẾN CHƯA GÁN tài xế (driverId rỗng) — TRƯỚC ĐÂY bị loại thẳng
        // khỏi staffRawRows (xem fetchStaffVolumeRows_) nên "Định biên" ở popup bưu cục tính
        // THIẾU khối lượng thật (bỏ sót đúng phần đơn tồn đọng vì THIẾU NHÂN SỰ — nghịch lý: bưu
        // cục càng thiếu người càng có nhiều đơn chưa gán được, thì Định biên lại càng bị tính
        // THẤP hơn thực tế). Mảng riêng này CHỈ dùng làm TỬ SỐ bổ sung cho Định biên/cột "TB Lấy/
        // Giao" (computeHubStaffingStats_) — KHÔNG dùng cho bảng "Theo Nhân Viên", chấm/tuyến
        // giao trên bản đồ, hay "Hiện có" (không có driverId thì không thể gán cho 1 nhân viên
        // cụ thể nào cả) — xem giải thích đầy đủ ở fetchStaffVolumeRows_/computeHubStaffingStats_.
        staffUnassignedRawRows: [],
        staffSelectedStaffKey: 'all', // 'all' hoặc đúng chuỗi "driverId - driverName"
        staffComboOptions: [], // v1.7.5 — {key,driverName,driverId,hrm}[], nguồn cho combobox tìm-kiếm-được (xem refreshStaffComboOptions_)
        staffSelectedGroup: 'all',    // 'all' | 'TTS' | 'Shopee' | 'SME' | 'Khac'
        staffLoading: false,
        staffLoadCancelRequested: false, // v1.7.1 — cờ dừng cho nút "⏹ Dừng"
        staffLastLoadedAt: null,
        // v1.7.5 — TRẠNG THÁI NHÂN SỰ, đọc CHỈ ĐỌC từ sheet "HRM" (đã có sẵn trong Google
        // Sheet của modul — tab riêng, KHÔNG liên quan sheet PhanQuyen dùng cho phân
        // quyền). key = driverId (String) -> {id,hoTen,chucVu,ngayVaoLam,ngayNghiViec,
        // trangThai,buuCuc,zone,am,loaiHinh,tinh,vung}. Dùng để tô xám chấm/tên nhân viên
        // đã nghỉ trên bản đồ + hiện trạng thái/thâm niên ở popup + bảng "Theo Nhân Viên".
        hrmByDriverId: {},
        hrmLoaded: false,

        // ---- Chấm cảnh báo nhân viên trên bản đồ (v1.5.0) ----
        wardMatchIndex: null,           // region -> [{searchKey, wardCode, name, isPhuong}], dựng 1 lần từ state.wards
        wardMatchByProvince: null,      // normalizedProvince -> { normalizedBareWardName -> [{searchKey,wardCode,name,isPhuong}] } — khớp CHÍNH XÁC theo tỉnh
        wardMatchByProvinceDistrict: null, // "normalizedProvince|normalizedDistrict" -> { normalizedBareWardName -> [...] } — khớp CHÍNH XÁC theo tỉnh+huyện (v1.5.3, chính xác nhất)
        staffDotFeatures: { type: 'FeatureCollection', features: [] },
        staffDotUnmatchedCount: 0,      // số (nhân viên,ngày) có đơn giao nhưng KHÔNG xác định được xã/phường ổn định
        showStaffDots: false,
        staffDotBlinkPhase: 1,
        staffDotBlinkRaf: null,

        // ---- Tuyến giao nhân viên = ranh giới + tên (v1.6.0) ----
        // staffDotFeatures (ở trên) từ v1.6.0 giờ chỉ có ĐÚNG 1 điểm/nhân viên/ngày (đặt
        // tại xã/phường CHÍNH — nhiều đơn nhất) — số điểm KHỚP đúng số nhân viên có tuyến
        // giao xác định được ngày đó, không còn 1-điểm/xã-phường như v1.5.5. Ranh giới
        // (có thể nhiều xã/phường/nhân viên) tách riêng ra staffTerritoryFeatures.
        staffTerritoryFeatures: { type: 'FeatureCollection', features: [] },
        showStaffNameLabels: false, // nhãn TÊN nhân viên trên bản đồ — bật/tắt riêng, giống các nhãn khác (hubs-labels/wards-new-labels)
        // v1.7.13 — lọc theo trạng thái làm việc (xem staffWorkStatusCategory_). v1.7.14: ĐỔI
        // PHẠM VI theo phản hồi "đưa phần bộ lọc trạng thái làm việc áp dụng cho cả hạng mục
        // của Tuyến giao nhân viên thay vì đang chỉ lọc ở phần mỗi tên" — giờ áp dụng cho TOÀN
        // BỘ nhóm "Tuyến giao nhân viên" (chấm/ranh giới/nhãn tên), không còn riêng lớp nhãn
        // tên nữa — xem STAFF_STATUS_FILTERED_LAYERS_/applyStaffStatusFilter_. Đổi tên field
        // (bỏ chữ "Label") cho đúng phạm vi mới. Mặc định CHỈ tick "Đang làm việc" (yêu cầu rõ
        // "mặc định tick vào phần ĐANG LÀM VIỆC") — 3 nhóm còn lại mặc định TẮT (khác v1.7.13,
        // trước đó mặc định bật cả 4).
        staffStatusFilter: { ACTIVE: true, RESIGNED: false, ON_LEAVE: false, SUPPORT: false },

        // ---- "Vùng giao thực tế" (v1.6.2, ĐỔI KỸ THUẬT — xem changelog) — mỗi nhân viên/
        // ngày có tuyến giao là 1 hình GHÉP: xã/phường CHÍNH lấy NGUYÊN VẸN (100%), các xã/
        // phường PHỤ (chung với người khác) được CẮT thành 1 "múi" (như múi bánh, diện tích
        // đúng bằng % số đơn của người đó / tổng đơn CẢ xã/phường hôm đó, hướng múi lấy theo
        // hướng GPS thật của người đó trong xã/phường) rồi GHÉP LIỀN (turf.union) thành 1
        // đường viền DUY NHẤT — KHÔNG dùng hull thô từ điểm GPS nữa (nhìn rối, không đẹp).
        // CHỈ hiển thị đúng 1 nhân viên tại 1 thời điểm — bấm vào chấm/tên/viền mới hiện,
        // tránh chồng chéo nhiều người cùng lúc (xem selectStaffTerritory_()).
        staffTerritoryHullFeatures: { type: 'FeatureCollection', features: [] },
        showStaffHull: false,
        selectedStaffTerritoryKey: null
    };

    function buildLookups_() {
        state.hubsByCode = {};
        (state.hubs || []).forEach(h => { state.hubsByCode[String(h.hub_code)] = h; });
        state.wardsByCode = {};
        (state.wards || []).forEach(w => { state.wardsByCode[String(w.ward_code)] = w; });
        const regionSet = new Set();
        (state.hubs || []).forEach(h => { if (h.region) regionSet.add(h.region); });
        (state.wards || []).forEach(w => { if (w.region) regionSet.add(w.region); });
        state.regions = Array.from(regionSet).sort();
        // v1.7.17 — tên bưu cục -> hub_code, để khớp sheet "Performance" (chỉ có TÊN ở cột B,
        // VD "(THN) Phú Bình 2" — ĐÚNG hệt h.name, đã xác nhận qua popup bưu cục hiện đúng chuỗi
        // này) — xem performanceHubCode_().
        state.hubNameToCode = {};
        (state.hubs || []).forEach(h => {
            const name = String(h.name || '').trim();
            if (name) state.hubNameToCode[name] = String(h.hub_code);
        });
    }

    // v1.7.17 — tra hub_code từ TÊN bưu cục ở cột B sheet "Performance" — trả về null nếu
    // không khớp được tên nào (VD tên trong sheet gõ sai/khác định dạng với hubs.json đã đồng
    // bộ) — nơi gọi PHẢI xử lý null bằng cách bỏ qua dòng đó (không đoán mò gán nhầm bưu cục).
    function performanceHubCode_(hubName) {
        const name = String(hubName || '').trim();
        if (!name || !state.hubNameToCode) return null;
        return state.hubNameToCode[name] || null;
    }

    // Lookup nhanh new_ward_code -> entry gộp (từ /api/rezone.json), dùng để hiển thị
    // popup đầy đủ khi bấm vào ranh giới phường MỚI.
    function buildRezoneLookup_() {
        state.rezoneByNewCode = {};
        const newWards = (state.rezone && state.rezone.new_wards) || [];
        newWards.forEach(nw => {
            state.rezoneByNewCode[String(nw.new_code)] = nw;
        });
    }

    function hubLabel_(hubCode) {
        const h = state.hubsByCode[String(hubCode)];
        if (h && h.name) return h.name;
        return hubCode ? `(${hubCode})` : '(chưa gán)';
    }

    // Gộp số liệu wards.json (pv/pw/dv/dw, pick_hub, delivery_hub, province, district)
    // vào đúng polygon ranh giới CŨ (wards.geojson), khớp qua ward_code === ward_code
    // (CÙNG 1 field tên, CÙNG 1 hệ mã — đây là cặp đúng, khác với bug v1.0/v1.1 lỡ
    // ghép nhầm với ranh giới MỚI).
    function enrichOldWards_() {
        if (!state.wardsOldRaw) return null;
        let matchedCount = 0;
        const rawFeatures = state.wardsOldRaw.features || [];
        const features = rawFeatures.map(f => {
            const code = String((f.properties || {}).ward_code || '');
            const w = state.wardsByCode[code] || null;
            if (w) matchedCount++;
            const wSafe = w || {};
            return {
                ...f,
                properties: {
                    ...f.properties,
                    ward_code: code,
                    name: wSafe.name || '',
                    province: wSafe.province || '',
                    district: wSafe.district || '',
                    region: wSafe.region || '',
                    pick_hub: wSafe.pick_hub || '',
                    delivery_hub: wSafe.delivery_hub || '',
                    pickHubName: hubLabel_(wSafe.pick_hub),
                    deliveryHubName: hubLabel_(wSafe.delivery_hub),
                    pv: typeof wSafe.pv === 'number' ? wSafe.pv : 0,
                    pw: typeof wSafe.pw === 'number' ? wSafe.pw : 0,
                    dv: typeof wSafe.dv === 'number' ? wSafe.dv : 0,
                    dw: typeof wSafe.dw === 'number' ? wSafe.dw : 0
                }
            };
        });
        state.matchedWardCount = matchedCount;
        state.totalWardFeatureCount = rawFeatures.length;
        if (rawFeatures.length > 0 && matchedCount === 0) {
            console.error('[Tuyến Giao] ⚠️ 0/%d phường khớp được ranh giới cũ — kiểm tra lại field ward_code giữa wards.json và wards.geojson.', rawFeatures.length);
        } else if (rawFeatures.length > 0 && matchedCount < rawFeatures.length * 0.9) {
            console.warn(`[Tuyến Giao] ⚠️ Chỉ khớp ${matchedCount}/${rawFeatures.length} phường.`);
        }
        return { type: 'FeatureCollection', features };
    }

    function hubsToPointsGeoJson_() {
        const features = (state.hubs || [])
            .filter(h => typeof h.lat === 'number' && typeof h.lng === 'number')
            .map(h => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
                properties: {
                    hub_code: h.hub_code,
                    name: h.name,
                    region: h.region,
                    province: h.province,
                    type: h.type,
                    staff: h.staff || 0,
                    n_wards: h.n_wards || 0,
                    pv: h.actual ? h.actual.pv : 0,
                    pw: h.actual ? h.actual.pw : 0,
                    dv: h.actual ? h.actual.dv : 0,
                    dw: h.actual ? h.actual.dw : 0
                }
            }));
        return { type: 'FeatureCollection', features };
    }

    // ==================== TẢI DỮ LIỆU (TRỰC TIẾP TRƯỚC, CACHE LÀ DỰ PHÒNG) ====================
    async function loadFromCache_(onProgress) {
        onProgress && onProgress('Đang tải dữ liệu backup đã lưu trên server...');
        const meta = await gasGet_('getMeta');
        if (!meta.ok) throw new Error(meta.error || 'Không đọc được trạng thái backup.');
        if (!meta.hasWardsOldGeoJson || !meta.hasHubs || !meta.hasWards) {
            throw new Error('Chưa có dữ liệu backup nào trên server, và tải trực tiếp cũng thất bại. Vào tab "🔄 Đồng Bộ Dữ Liệu" để dán tay ít nhất 1 lần đầu.');
        }

        const wardsOldRes = await gasGet_('getWardsOldGeoJson');
        if (!wardsOldRes.ok) throw new Error(wardsOldRes.error);
        state.wardsOldRaw = wardsOldRes.data;

        if (meta.hasWardsGeoJson) {
            try {
                const wardsNewRes = await gasGet_('getWardsGeoJson');
                if (wardsNewRes.ok) state.wardsNewRaw = wardsNewRes.data;
            } catch (e) { /* không bắt buộc phải có */ }
        }

        const hubsRes = await gasGet_('getHubs');
        if (!hubsRes.ok) throw new Error(hubsRes.error);
        state.hubs = hubsRes.data;

        const wardsRes = await gasGet_('getWards');
        if (!wardsRes.ok) throw new Error(wardsRes.error);
        state.wards = wardsRes.data;

        try {
            const centroidsRes = await gasGet_('getWardCentroids');
            if (centroidsRes.ok) state.wardCentroids = centroidsRes.data;
        } catch (e) { /* không bắt buộc phải có */ }

        if (meta.hasRezone) {
            try {
                const rezoneRes = await gasGet_('getRezone');
                if (rezoneRes.ok && Array.isArray(rezoneRes.data.new_wards)) state.rezone = rezoneRes.data;
            } catch (e) { /* không bắt buộc phải có */ }
        }

        state.lastSyncAt = meta.lastSyncAt || null;
    }

    async function loadAllData_(onProgress) {
        state.isOffline = false;
        state.offlineReason = '';

        try {
            await tryLiveSync_(onProgress);
        } catch (liveErr) {
            console.warn('[Tuyến Giao] Tải trực tiếp từ quyhoachbuucuc.info thất bại, chuyển sang dữ liệu backup:', liveErr);
            state.isOffline = true;
            state.offlineReason = liveErr && liveErr.message ? liveErr.message : String(liveErr);
            await loadFromCache_(onProgress);
        }

        buildLookups_();
        buildRezoneLookup_();
        state.wardsOldEnriched = enrichOldWards_();
        applyPermissionScopeFilter_(); // v1.7.0 — lọc theo phạm vi bưu cục ĐƯỢC PHÉP xem, nếu không phải ADMIN
        state.dataLoaded = true;
    }

    // v1.7.0 — LỌC state.hubs/state.wards/state.wardsOldEnriched CHỈ CÒN đúng (các) bưu
    // cục người dùng hiện tại được phép xem (permission.hubCodes) — gọi 1 LẦN DUY NHẤT
    // ngay sau khi tải xong dữ liệu, TRƯỚC khi bất kỳ hàm render/tô màu/danh sách checkbox
    // nào chạy. Vì mọi nơi khác trong code (bản đồ, dropdown "Vùng", danh sách checkbox
    // bưu cục ở tab Theo Nhân Viên...) đều ĐỌC LẠI từ 3 mảng này, lọc đúng 1 chỗ ở đây là
    // đủ để chặn toàn bộ giao diện — không cần sửa từng hàm hiển thị riêng lẻ. ADMIN
    // (hoặc chưa xác định được quyền — an toàn mặc định KHÔNG lọc gì, vì trường hợp
    // "chưa xác định quyền" đã bị chặn từ sớm hơn ở checkPermissionAndGate_(), không bao
    // giờ tới được đây) không bị lọc — xem toàn bộ như cũ.
    function applyPermissionScopeFilter_() {
        const perm = state.permission;
        if (!perm || perm.role === 'ADMIN') return;
        const allowed = new Set((perm.hubCodes || []).map(c => String(c).trim()).filter(Boolean));
        if (allowed.size === 0) return; // an toàn: không có mã bưu cục nào thì không lọc thêm gì (đã chặn ở cổng quyền)
        state.hubs = (state.hubs || []).filter(h => allowed.has(String(h.hub_code)));
        state.wards = (state.wards || []).filter(w => allowed.has(String(w.delivery_hub)));
        if (state.wardsOldEnriched && Array.isArray(state.wardsOldEnriched.features)) {
            state.wardsOldEnriched = {
                type: 'FeatureCollection',
                features: state.wardsOldEnriched.features.filter(f => allowed.has(String(f.properties.delivery_hub)))
            };
        }
    }

    function statusSummary_() {
        const matchInfo = state.totalWardFeatureCount > 0
            ? ` · Ranh giới khớp: ${state.matchedWardCount}/${state.totalWardFeatureCount} phường${state.matchedWardCount < state.totalWardFeatureCount ? ' ⚠️' : ''}`
            : ' · ⚠️ Không có polygon ranh giới nào';
        const newInfo = state.wardsNewRaw ? ` · Ranh giới mới: ${state.wardsNewRaw.features.length} phường` : ' · (chưa có ranh giới mới)';
        const rezoneInfo = state.rezone ? ` · Dữ liệu gộp phường mới: ${state.rezone.new_wards.length} phường` : ' · (chưa có dữ liệu gộp phường mới — bấm phường mới sẽ chỉ hiện tên)';
        if (state.isOffline) {
            return { text: `OFFLINE — dùng backup lúc ${state.lastSyncAt || '?'} (lý do: ${state.offlineReason}): ${state.wards.length} phường · ${state.hubs.length} bưu cục.${matchInfo}${newInfo}${rezoneInfo}`, dot: 'offline' };
        }
        return { text: `Trực tiếp từ quyhoachbuucuc.info: ${state.wards.length} phường · ${state.hubs.length} bưu cục.${matchInfo}${newInfo}${rezoneInfo}`, dot: 'online' };
    }

    // ==================== MÀU SẮC ====================
    function applyPaint_() {
        if (!state.map || !state.map.getLayer('wards-fill')) return;

        if (state.currentMode === 'hub') {
            // Tô theo bưu cục GIAO phụ trách — mỗi BC 1 màu cố định.
            const hubCodes = Array.from(new Set((state.wards || []).map(w => w.delivery_hub).filter(Boolean)));
            const matchExpr = ['match', ['get', 'delivery_hub']];
            hubCodes.forEach(code => { matchExpr.push(code, hubColor_(code)); });
            matchExpr.push('#a0a0a0'); // màu mặc định khi chưa gán BC
            state.map.setPaintProperty('wards-fill', 'fill-color', matchExpr);
            state.map.setPaintProperty('wards-fill', 'fill-opacity', 0.65);
        } else if (state.currentMode === 'am') {
            // v1.7.43 — tô theo AM quản lý bưu cục giao (theo cơ cấu), mỗi AM 1 màu
            qhAmPaint_();
            state.map.setPaintProperty('wards-fill', 'fill-opacity', 0.65);
        } else {
            // Tô theo cường độ sản lượng GIAO (dv) — thang màu ColorBrewer "Reds".
            let maxDv = 1;
            (state.wardsOldEnriched?.features || []).forEach(f => {
                if (state.currentRegion === 'all' || f.properties.region === state.currentRegion) {
                    maxDv = Math.max(maxDv, f.properties.dv || 0);
                }
            });
            state.map.setPaintProperty('wards-fill', 'fill-color', [
                'interpolate', ['linear'], ['get', 'dv'],
                0, '#fee5d9',
                Math.max(1, maxDv * 0.25), '#fcae91',
                Math.max(2, maxDv * 0.5), '#fb6a4a',
                Math.max(3, maxDv * 0.75), '#de2d26',
                Math.max(4, maxDv), '#a50f15'
            ]);
            state.map.setPaintProperty('wards-fill', 'fill-opacity', 0.8);
        }
        if (state.qhOrg) qhApply_(false);
        qhAmLayer_();
    }

    function applyRegionFilter_() {
        if (!state.map) return;
        const regionFilter = state.currentRegion === 'all'
            ? null
            : ['==', ['get', 'region'], state.currentRegion];
        ['wards-fill', 'wards-line', 'wards-old-labels', 'hubs-points', 'hubs-labels'].forEach(id => {
            if (state.map.getLayer(id)) state.map.setFilter(id, regionFilter);
        });
        // Lớp ranh giới MỚI không có field "region" (không join với wards.json) nên
        // không lọc theo vùng được — luôn hiện toàn bộ khi bật checkbox, chỉ ẩn/hiện
        // theo state.showNewBoundary (xem applyNewBoundaryVisibility_()).
    }

    function applyNewBoundaryVisibility_() {
        if (!state.map) return;
        const vis = state.showNewBoundary ? 'visible' : 'none';
        ['wards-new-line', 'wards-new-fill', 'wards-new-selected-line'].forEach(id => {
            if (state.map.getLayer(id)) state.map.setLayoutProperty(id, 'visibility', vis);
        });
    }

    // Bật/tắt 3 lớp NHÃN TÊN (bưu cục / phường cũ / phường mới) — độc lập với việc
    // tô màu/ranh giới, chỉ điều khiển chữ hiển thị trên bản đồ.
    function applyLabelVisibility_() {
        if (!state.map) return;
        if (state.map.getLayer('hubs-labels')) {
            state.map.setLayoutProperty('hubs-labels', 'visibility', state.showHubLabels ? 'visible' : 'none');
        }
        if (state.map.getLayer('wards-old-labels')) {
            state.map.setLayoutProperty('wards-old-labels', 'visibility', state.showOldWardLabels ? 'visible' : 'none');
        }
        if (state.map.getLayer('wards-new-labels')) {
            state.map.setLayoutProperty('wards-new-labels', 'visibility', state.showNewWardLabels ? 'visible' : 'none');
        }
    }

    function applyStaffDotVisibility_() {
        if (!state.map) return;
        const vis = state.showStaffDots ? 'visible' : 'none';
        // v1.6.0: cùng 1 checkbox điều khiển CẢ chấm LẪN ranh giới tuyến giao (2 khái
        // niệm đi cùng nhau — có ranh giới mà không có chấm/ngược lại đều khó hiểu).
        // Nhãn TÊN nhân viên tách RIÊNG (xem applyStaffLabelVisibility_) theo đúng yêu
        // cầu "cho phép mở/tắt" độc lập.
        // v1.7.12 — thêm 'staff-territory-selected-line' (highlight viền khi bấm chọn 1
        // người, xem giải thích ở initMap_/selectStaffTerritory_) vào cùng nhóm bật/tắt với
        // chấm/ranh giới — tắt "chấm - ranh giới" thì highlight cũng ẩn theo cho nhất quán.
        ['staff-dot-ring', 'staff-dot-core', 'staff-territory-hitline', 'staff-territory-line-primary', 'staff-territory-line-secondary', 'staff-territory-selected-line'].forEach(id => {
            if (state.map.getLayer(id)) state.map.setLayoutProperty(id, 'visibility', vis);
        });
    }

    function applyStaffLabelVisibility_() {
        if (!state.map) return;
        const vis = state.showStaffNameLabels ? 'visible' : 'none';
        if (state.map.getLayer('staff-territory-label-text')) {
            state.map.setLayoutProperty('staff-territory-label-text', 'visibility', vis);
        }
    }

    // v1.7.13/v1.7.14 — Xây filter MapLibre TỪ state.staffStatusFilter (bộ lọc "trạng thái làm
    // việc", xem staffWorkStatusCategory_) — chỉ giữ lại feature có workStatusCategory nằm
    // trong danh sách đang được tick.
    function staffStatusFilterExpression_() {
        const f = state.staffStatusFilter || {};
        const allowed = ['ACTIVE', 'RESIGNED', 'ON_LEAVE', 'SUPPORT'].filter(k => f[k] !== false);
        return ['in', ['get', 'workStatusCategory'], ['literal', allowed]];
    }

    // v1.7.14 — Danh sách TOÀN BỘ lớp thuộc nhóm "Tuyến giao nhân viên" cần áp bộ lọc trạng
    // thái, kèm filter GỐC riêng của từng lớp (nếu có, VD isPrimary/ringType) — GIỮ NGUYÊN filter
    // gốc, chỉ AND thêm điều kiện trạng thái, tránh ghi đè mất filter gốc. TRƯỚC ĐÂY (v1.7.13)
    // bộ lọc CHỈ áp cho lớp nhãn tên ('staff-territory-label-text') — phản hồi "đưa phần bộ lọc
    // trạng thái làm việc áp dụng cho cả hạng mục của Tuyến giao nhân viên thay vì đang chỉ lọc
    // ở phần mỗi tên" -> giờ áp cho ĐỦ 6 lớp bên dưới (chấm/vòng sáng/ranh giới/hitbox/nhãn).
    // KHÔNG áp cho 'staff-territory-selected-line'/'staff-territory-hull-fill'/'-hull-line' —
    // đó là lớp HIGHLIGHT khi bấm chọn TƯỜNG MINH 1 người (selectStaffTerritory_/
    // applyStaffHullVisibility_), giữ nguyên hành vi "bấm là luôn thấy", không phụ thuộc bộ lọc.
    const STAFF_STATUS_FILTERED_LAYERS_ = [
        { id: 'staff-dot-ring', baseFilter: ['!=', ['get', 'ringType'], 'none'] },
        { id: 'staff-dot-core', baseFilter: null },
        { id: 'staff-territory-hitline', baseFilter: null },
        { id: 'staff-territory-line-primary', baseFilter: ['==', ['get', 'isPrimary'], true] },
        { id: 'staff-territory-line-secondary', baseFilter: ['==', ['get', 'isPrimary'], false] },
        { id: 'staff-territory-label-text', baseFilter: null }
    ];

    function staffLayerFilterWithStatus_(baseFilter) {
        const status = staffStatusFilterExpression_();
        return baseFilter ? ['all', baseFilter, status] : status;
    }

    function applyStaffStatusFilter_() {
        if (!state.map) return;
        STAFF_STATUS_FILTERED_LAYERS_.forEach(({ id, baseFilter }) => {
            if (state.map.getLayer(id)) state.map.setFilter(id, staffLayerFilterWithStatus_(baseFilter));
        });
    }

    // v1.7.14 — dùng CHUNG với findStaffDotNearPoint_ (dò click bằng JS thuần, KHÔNG qua
    // map.queryRenderedFeatures nên không tự động tôn trọng filter MapLibre của lớp — xem giải
    // thích đầy đủ ở findStaffDotNearPoint_) để đảm bảo người/chấm đã bị bộ lọc trạng thái ẨN
    // ĐI thì cũng KHÔNG bấm trúng được (nhất quán nhìn thấy gì thì bấm được đúng cái đó).
    function staffStatusAllowed_(category) {
        const f = state.staffStatusFilter || {};
        return f[category] !== false;
    }

    // v1.6.2: lớp "Vùng giao thực tế" CHỈ hiện đúng 1 nhân viên tại 1 thời điểm (bấm chọn
    // qua selectStaffTerritory_()) — bật checkbox mà CHƯA bấm chọn ai thì chưa hiện gì cả,
    // tránh nhiều người chồng lên nhau nhìn rối (đúng phản hồi "code vừa nãy nhìn quá rối").
    function applyStaffHullVisibility_() {
        if (!state.map) return;
        const hasSelection = state.showStaffHull && !!state.selectedStaffTerritoryKey;
        const vis = hasSelection ? 'visible' : 'none';
        const filter = ['==', ['get', 'territoryKey'], state.selectedStaffTerritoryKey || '__none__'];
        ['staff-territory-hull-fill', 'staff-territory-hull-line'].forEach(id => {
            if (state.map.getLayer(id)) {
                state.map.setLayoutProperty(id, 'visibility', vis);
                state.map.setFilter(id, filter);
            }
        });
    }

    // v1.6.4 — TÌM CHẤM NHÂN VIÊN GẦN ĐIỂM BẤM BẰNG TOẠ ĐỘ (không dùng
    // map.queryRenderedFeatures nữa). Lý do đổi: đã tự kiểm chứng trực tiếp trên trang
    // nhanh.ghn.vn thật (bấm đúng tâm chấm nhiều lần) — map.queryRenderedFeatures(...,
    // {layers:['staff-dot-core','staff-territory-label-text']}) trả về RỖNG dù bấm đúng
    // pixel đang vẽ chấm, kể cả khi đã nới hộp dò ±8px (lỗi v1.6.2b tưởng đã sửa nhưng
    // KHÔNG sửa đúng gốc) — trong khi map.queryRenderedFeatures cho lớp phường (fill to,
    // ít đổi) luôn đúng. Việc "hit-test" bằng GPU picking của MapLibre với các source hay
    // được setData() lại rõ ràng không đáng tin cậy 100%. SỬA TẬN GỐC: bỏ hẳn cách dựa
    // vào GPU, tự tính bằng JS thuần — với MỖI chấm nhân viên đang có trong
    // state.staffDotFeatures (dữ liệu ta tự quản lý, luôn đúng), quy đổi toạ độ GPS của
    // chấm đó ra pixel màn hình (map.project), đo khoảng cách Euclid tới điểm vừa bấm —
    // chấm NÀO gần nhất trong bán kính maxPx thì coi là trúng. Cách này không phụ thuộc gì
    // vào việc GPU đã "vẽ xong" lớp đó hay chưa, luôn cho kết quả đúng 100% — đã tự kiểm
    // chứng bằng Chrome thật: bấm lặp lại nhiều lần liên tiếp đúng tâm 1 chấm, cách cũ
    // (queryRenderedFeatures) có lúc trúng có lúc trật; cách mới (tính khoảng cách) trúng
    // 100% mọi lần. Bán kính 16px đủ rộng để bắt cả khi bấm hụt nhẹ ra ngoài viền chấm/chữ.
    function findStaffDotNearPoint_(map, point, maxPx) {
        const feats = (state.staffDotFeatures && state.staffDotFeatures.features) || [];
        let best = null, bestDist = Infinity;
        feats.forEach(f => {
            if (!f.geometry || !f.geometry.coordinates) return;
            // v1.7.14 — bỏ qua chấm đã bị bộ lọc trạng thái làm việc ẨN đi (xem
            // staffStatusAllowed_/STAFF_STATUS_FILTERED_LAYERS_) — hàm này tính khoảng cách
            // THUẦN từ dữ liệu JS, KHÔNG tự động tôn trọng filter MapLibre của lớp bản đồ, nên
            // phải tự kiểm tra lại ở đây để tránh bấm trúng chấm đang KHÔNG hiển thị.
            if (!staffStatusAllowed_(f.properties && f.properties.workStatusCategory)) return;
            const px = map.project(f.geometry.coordinates);
            const dDot = Math.hypot(px.x - point.x, px.y - point.y);
            // Tên nhân viên hiển thị ngay DƯỚI chấm (text-offset [0,1.1], text-size 11) —
            // tính thêm khoảng cách tới vùng chữ (~22px dưới chấm) để bấm vào TÊN cũng trúng.
            const dLabel = Math.hypot(px.x - point.x, (px.y + 22) - point.y);
            const d = Math.min(dDot, dLabel);
            if (d < bestDist) { bestDist = d; best = f; }
        });
        return (best && bestDist <= maxPx) ? best : null;
    }

    // Chọn 1 nhân viên/ngày để hiện "Vùng giao thực tế" của riêng người đó — gọi khi bấm
    // vào chấm/tên/viền tuyến giao trên bản đồ (xem map.on('click') trong initMap_()).
    function selectStaffTerritory_(territoryKey) {
        state.selectedStaffTerritoryKey = territoryKey || null;
        applyStaffHullVisibility_();
        // v1.7.12 — LUÔN cập nhật viền highlight 'staff-territory-selected-line' (viền vàng
        // dày, xem lớp này ở initMap_) mỗi khi bấm chọn/bỏ chọn — KHÔNG phụ thuộc checkbox
        // "Vùng giao thực tế (GPS)" như applyStaffHullVisibility_() ở trên, nên bấm là LUÔN
        // thấy viền nổi lên ngay, đúng yêu cầu "khi bấm vào đối tượng nào thì phải hiển thị/
        // làm bật lên được ranh giới/đường viền của đối tượng được chọn". Bỏ chọn (truyền
        // null/rỗng) sẽ tự rơi về NO_MATCH_TOKEN -> không khớp feature nào -> viền tự ẩn.
        if (state.map && state.map.getLayer('staff-territory-selected-line')) {
            state.map.setFilter('staff-territory-selected-line', [
                '==', ['get', 'territoryKey'], state.selectedStaffTerritoryKey || NO_MATCH_TOKEN
            ]);
        }
    }

    // Nhấp nháy chấm nhân viên bằng JS (MapLibre không có hiệu ứng blink sẵn) — 1 vòng
    // lặp requestAnimationFrame DUY NHẤT cho TẤT CẢ chấm (không phải 1 vòng lặp/chấm),
    // dùng sóng sin để mờ-tỏ mượt, tự dừng khi cửa sổ đóng/ẩn chấm để đỡ tốn CPU.
    function startStaffDotBlink_() {
        if (state.staffDotBlinkRaf) return; // đã chạy rồi
        const periodMs = 1400;
        const tick = (ts) => {
            if (!state.map || !state.map.getLayer('staff-dot-core')) {
                state.staffDotBlinkRaf = null;
                return;
            }
            if (state.showStaffDots && state.staffDotFeatures.features.length > 0) {
                const phase = (ts % periodMs) / periodMs; // 0 -> 1
                const wave = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); // 0 -> 1 -> 0, mượt
                state.map.setPaintProperty('staff-dot-core', 'circle-opacity', 0.45 + 0.55 * wave);
                state.map.setPaintProperty('staff-dot-ring', 'circle-opacity', 0.25 + 0.45 * wave);
                state.map.setPaintProperty('staff-dot-ring', 'circle-radius', 16 + 8 * wave);
            }
            state.staffDotBlinkRaf = requestAnimationFrame(tick);
        };
        state.staffDotBlinkRaf = requestAnimationFrame(tick);
    }

    // ==================== HIGHLIGHT (chọn phường / chọn lãnh thổ bưu cục) ====================
    function updateSelectionHighlight_() {
        if (!state.map) return;
        if (state.map.getLayer('wards-selected-line')) {
            state.map.setFilter('wards-selected-line', [
                '==', ['get', 'ward_code'], state.selectedWardCode || NO_MATCH_TOKEN
            ]);
        }
        if (state.map.getLayer('wards-hub-highlight-line')) {
            state.map.setFilter('wards-hub-highlight-line', [
                '==', ['get', 'delivery_hub'], state.selectedHubCode || NO_MATCH_TOKEN
            ]);
        }
        if (state.map.getLayer('wards-new-selected-line')) {
            state.map.setFilter('wards-new-selected-line', [
                '==', ['get', 'new_ward_code'], state.selectedNewWardCode || NO_MATCH_TOKEN
            ]);
        }
    }

    function selectWard_(wardCode) {
        state.selectedWardCode = wardCode;
        state.selectedHubCode = null;
        state.selectedNewWardCode = null;
        updateSelectionHighlight_();
    }

    function selectHubTerritory_(hubCode) {
        state.selectedHubCode = hubCode;
        state.selectedWardCode = null;
        state.selectedNewWardCode = null;
        updateSelectionHighlight_();
    }

    function selectNewWard_(newWardCode) {
        state.selectedNewWardCode = newWardCode;
        state.selectedWardCode = null;
        state.selectedHubCode = null;
        updateSelectionHighlight_();
    }

    // v1.7.15 — dùng CHUNG bởi resetToDefaultDisplay_() (nút "✖ Bỏ chọn") VÀ (gián tiếp, để đối
    // chiếu) giá trị khởi tạo `const state = {...}` phía trên — PHẢI khớp 100% 2 nơi
    // (currentRegion:'all', currentMode:'hub', showNewBoundary:false, showHubLabels:true,
    // showOldWardLabels:false, showNewWardLabels:false, showStaffDots:false,
    // showStaffNameLabels:false, staffStatusFilter:{ACTIVE:true, còn lại false},
    // showStaffHull:false) — nếu sau này đổi mặc định thì PHẢI sửa CẢ 2 chỗ (không tự động
    // đồng bộ; đã cân nhắc gộp bằng spread trong `state` gốc nhưng 10 field này KHÔNG nằm liền
    // nhau trong object đó — spread rải rác dễ trùng key khó đọc hơn lợi ích DRY mang lại). Trả
    // về 1 object MỚI mỗi lần gọi (kể cả staffStatusFilter lồng bên trong) — KHÔNG trả về CÙNG
    // 1 object tái sử dụng, tránh lỗi tham chiếu chung: nếu trả về đúng 1 object cố định rồi
    // gán thẳng vào state, lần sau người dùng tick checkbox lại sẽ VÔ TÌNH sửa luôn "bản mặc
    // định gốc" này vì state.staffStatusFilter khi đó CHÍNH LÀ nó, không phải bản sao.
    function defaultMapConfig_() {
        return {
            currentRegion: 'all',
            currentMode: 'hub',
            showNewBoundary: false,
            showHubLabels: true,
            showOldWardLabels: false,
            showNewWardLabels: false,
            showStaffDots: false,
            showStaffNameLabels: false,
            staffStatusFilter: { ACTIVE: true, RESIGNED: false, ON_LEAVE: false, SUPPORT: false },
            showStaffHull: false
        };
    }

    // Xoá lựa chọn phường/bưu cục/nhân viên ĐANG bấm chọn (tắt viền highlight, đóng panel
    // thông tin) — KHÔNG đụng tới bất kỳ checkbox/dropdown "lớp hiển thị" nào. Dùng cho các
    // hành động MANG TÍNH "đóng cái đang xem", tần suất cao, người dùng KHÔNG kỳ vọng nó động
    // tới cấu hình hiển thị đang xem dở: bấm ra khoảng trống trên bản đồ, bấm nút × đóng panel
    // thông tin, và sau khi tải lại dữ liệu (loadAndRenderMap_ — tải lại KHÔNG được phép xoá
    // mất cấu hình lớp người dùng đang bật, chỉ cần bỏ chọn feature cũ vì dữ liệu đã đổi).
    function clearSelection_() {
        state.selectedWardCode = null;
        state.selectedHubCode = null;
        state.selectedNewWardCode = null;
        updateSelectionHighlight_();
        selectStaffTerritory_(null); // ẩn luôn "Vùng giao thực tế" đang chọn (nếu có) — v1.6.2
        hideInfoPanel_();
    }

    // v1.7.15 — LỖI THẬT người dùng phát hiện: nút "✖ Bỏ chọn" trên thanh công cụ TRƯỚC ĐÂY chỉ
    // gọi clearSelection_() ở trên (chỉ xoá phường/bưu cục/nhân viên đang chọn) — KHÔNG hề đụng
    // tới bất kỳ checkbox/dropdown "lớp hiển thị" nào (Vùng/Xem theo/ranh giới mới/nhãn/chấm-
    // ranh giới nhân viên/lọc trạng thái/GPS wedge...) dù tên nút dễ khiến người dùng hiểu là
    // "reset về mặc định". Phản hồi rõ: "nếu bấm vào bỏ chọn thì mọi hạng mục, lớp hiển thị ...
    // phải về như ban đầu cấu hình mặc định". SỬA: nút này giờ gọi HÀM RIÊNG dưới đây (KHÔNG
    // sửa thẳng clearSelection_() — xem giải thích tại sao tách 2 hàm ở comment của
    // clearSelection_() phía trên: bấm trống bản đồ/đóng panel/tải lại dữ liệu KHÔNG được phép
    // vô tình xoá mất cấu hình lớp người dùng đang xem, CHỈ nút "✖ Bỏ chọn" tường minh mới nên
    // reset toàn bộ) — xoá lựa chọn NHƯ CŨ, rồi reset CẢ cấu hình hiển thị về đúng mặc định gốc
    // (defaultMapConfig_() ở trên), đồng bộ lại UI (checkbox/dropdown) khớp đúng, và vẽ lại bản
    // đồ NGAY LẬP TỨC theo cấu hình mặc định. KHÔNG đổi vị trí/zoom camera bản đồ (không ai yêu
    // cầu, đổi thêm dễ gây khó chịu khi đang xem đúng khu vực cần xem) — chỉ đổi CẤU HÌNH HIỂN THỊ.
    function resetToDefaultDisplay_() {
        clearSelection_();
        Object.assign(state, defaultMapConfig_());

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
        setVal('ghn-tg-region-select', state.currentRegion);
        setVal('ghn-tg-mode-select', state.currentMode);
        setChecked('ghn-tg-newboundary-checkbox', state.showNewBoundary);
        setChecked('ghn-tg-label-hub-checkbox', state.showHubLabels);
        setChecked('ghn-tg-label-oldward-checkbox', state.showOldWardLabels);
        setChecked('ghn-tg-label-newward-checkbox', state.showNewWardLabels);
        setChecked('ghn-tg-staff-dots-checkbox', state.showStaffDots);
        setChecked('ghn-tg-staff-labels-checkbox', state.showStaffNameLabels);
        setChecked('ghn-tg-status-active-checkbox', state.staffStatusFilter.ACTIVE);
        setChecked('ghn-tg-status-resigned-checkbox', state.staffStatusFilter.RESIGNED);
        setChecked('ghn-tg-status-onleave-checkbox', state.staffStatusFilter.ON_LEAVE);
        setChecked('ghn-tg-status-support-checkbox', state.staffStatusFilter.SUPPORT);
        setChecked('ghn-tg-staff-hull-checkbox', state.showStaffHull);

        // Vẽ lại bản đồ ĐÚNG theo cấu hình vừa reset — KHÔNG đổi vị trí/zoom camera.
        applyPaint_();
        applyRegionFilter_();
        applyNewBoundaryVisibility_();
        applyLabelVisibility_();
        applyStaffDotVisibility_();
        applyStaffLabelVisibility_();
        applyStaffStatusFilter_();
        applyStaffHullVisibility_();

        // v1.7.40 — bỏ luôn lọc Tỉnh / AM / Bưu cục + ô tìm + xã/phường đang chọn trong bản nháp,
        // rồi đưa bản đồ về toàn vùng (trước chỉ reset lớp hiển thị → người dùng thấy nút "không chạy").
        try {
            state.qhTinh = []; state.qhAm = []; state.qhBc = [];
            const qs = document.getElementById('qh-search'); if (qs) qs.value = '';
            if (state.qhd) { if (state.qhd.sel) state.qhd.sel = new Set(); state.qhd.place = null; }
            if (typeof qhFillSelects_ === 'function') qhFillSelects_();
            if (typeof qhApply_ === 'function') qhApply_(false);
            if (state.qhd && state.qhd.open && typeof qhdRefresh_ === 'function') qhdRefresh_();
            if (typeof fitToData_ === 'function') fitToData_();
        } catch (e) { console.warn('[Modul 6] Bỏ chọn:', e); }
        hideInfoPanel_();
    }

    // ==================== PANEL THÔNG TIN (cố định góc bản đồ, KHÔNG dùng maplibregl.Popup
    // nữa — Popup "nhảy" theo đúng toạ độ bấm, che mất ranh giới xung quanh chỗ đang
    // xem bản đồ, đã bị góp ý). Panel này luôn nằm cố định góc trên-phải, chỉ đổi NỘI
    // DUNG bên trong khi bấm phường/bưu cục khác. ====================
    // v1.7.16 — tham số `wide` MỚI (mặc định false, giữ nguyên hành vi cũ cho mọi popup khác):
    // popup bưu cục có bảng "Theo từng xã/phường" 6 cột KHÔNG thể hiện đủ trong panel rộng cố
    // định 300px cũ (phải cuộn ngang mới xem hết — đúng phản ánh "phần bảng không hiển thị hết
    // nè => thiết kế lại để có thể xem được hết thông tin"). SỬA: thêm class
    // '.ghn-tg-info-panel--wide' (đổi CSS width panel lên 460px, vẫn có max-width: calc(100% -
    // 24px) để không tràn khỏi màn hình nhỏ) — CHỈ bật khi mở popup bưu cục (nơi gọi duy nhất
    // truyền wide=true, xem initMap_ click handler), các popup khác (xã/phường, chấm nhân viên...)
    // vẫn giữ đúng bề rộng 300px như trước, không bị ảnh hưởng. classList.toggle(...,!!wide) thay
    // vì chỉ add — đảm bảo TỰ TẮT lại khi mở popup KHÁC ngay sau đó (không bị dính lại class rộng
    // từ lần bấm bưu cục trước).
    function showInfoPanel_(html, wide) {
        const panel = document.getElementById('ghn-tg-info-panel');
        const content = document.getElementById('ghn-tg-info-content');
        if (!panel || !content) return;
        content.innerHTML = html;
        panel.hidden = false;
        panel.classList.toggle('ghn-tg-info-panel--wide', !!wide);
    }

    function hideInfoPanel_() {
        const panel = document.getElementById('ghn-tg-info-panel');
        if (panel) panel.hidden = true;
    }

    // ==================== NỘI DUNG POPUP/PANEL ====================
    function wardPopupHtml_(props) {
        return `
            <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; min-width: 220px;">
                <div style="font-weight: 700; font-size: 14px; color: #212529; margin-bottom: 2px;">${props.name || '(chưa rõ tên)'}</div>
                <div style="font-size: 12px; color: #6c757d; margin-bottom: 8px;">${props.district || ''}${props.district && props.province ? ', ' : ''}${props.province || ''} · ${props.region || ''}</div>
                <div style="font-size: 13px; color: #333; line-height: 1.6;">
                    <div>📫 <b>Lấy:</b> ${(props.pv || 0).toLocaleString()} đơn · ${(props.pw || 0).toLocaleString()} kg</div>
                    <div>📦 <b>Giao:</b> ${(props.dv || 0).toLocaleString()} đơn · ${(props.dw || 0).toLocaleString()} kg</div>
                    <div style="margin-top: 6px; color: #495057;">BC lấy: <b>${props.pickHubName || '(chưa gán)'}</b></div>
                    <div style="color: #495057;">BC giao: <b>${props.deliveryHubName || '(chưa gán)'}</b></div>
                </div>
                <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #dee2e6; font-size: 11px; color: #adb5bd;">
                    ℹ️ Ranh giới phường CŨ · Tỷ lệ giao hàng/trả hàng sẽ có ở bản sau.
                </div>
            </div>
        `;
    }

    // Bấm vào ranh giới phường MỚI: gộp số liệu từ TẤT CẢ phường cũ nằm trong, dùng
    // /api/rezone.json (nguồn: F12 Network khi bấm thử tab "Re-zone" trên chính
    // quyhoachbuucuc.info — xem changelog v1.3.0). entry.olds là mảng phường cũ thuộc
    // phường mới này; entry.candidates là các BC "ứng viên" xếp theo % cầu.
    function newWardPopupHtml_(props) {
        const entry = state.rezoneByNewCode[String(props.new_ward_code)];
        if (!entry) {
            return `
                <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif;">
                    <div style="font-weight: 700; font-size: 14px; color: #de2d26; margin-bottom: 2px;">${props.name || '(chưa rõ tên)'}</div>
                    <div style="font-size: 11px; color: #adb5bd;">Ranh giới phường MỚI (sau sáp nhập 2025) — chưa có dữ liệu gộp phường cũ (chưa đồng bộ được /api/rezone.json, thử bấm "🔄 Tải lại dữ liệu").</div>
                </div>
            `;
        }
        const statusMap = {
            clean: '<span style="color:#28a745; font-weight:700;">gọn (1 BC)</span>',
            split: '<span style="color:#dc3545; font-weight:700;">bị xé (nhiều BC)</span>',
            empty: '<span style="color:#adb5bd; font-weight:700;">rỗng cầu</span>'
        };
        const statusHtml = statusMap[entry.status] || String(entry.status || '');
        const assignedCandidate = (entry.candidates || []).find(c => c.bc === entry.assigned_bc);
        const assignedShare = assignedCandidate && typeof assignedCandidate.share === 'number' ? ` (${assignedCandidate.share}% cầu)` : '';
        const candidatesRows = (entry.candidates || []).map(c => `
            <tr>
                <td style="padding:2px 4px;">${c.bc_name || c.bc || ''}</td>
                <td style="padding:2px 4px; text-align:right;">${(c.dem || 0).toLocaleString()}</td>
                <td style="padding:2px 4px; text-align:right;">${typeof c.share === 'number' ? c.share + '%' : ''}</td>
            </tr>
        `).join('');
        const oldsRows = (entry.olds || []).map(o => `
            <tr>
                <td style="padding:2px 4px;">${o.name || o.ward || ''}</td>
                <td style="padding:2px 4px;">${o.bc_name || o.bc || ''}</td>
                <td style="padding:2px 4px; text-align:right;">${(o.dem || 0).toLocaleString()}</td>
                <td style="padding:2px 4px; text-align:right;">${(o.dem_kg || 0).toLocaleString()}</td>
                <td style="padding:2px 4px;">${o.note || ''}</td>
            </tr>
        `).join('');
        return `
            <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif;">
                <div style="font-weight: 700; font-size: 14px; color: #de2d26; margin-bottom: 2px;">${props.name || entry.name || '(chưa rõ tên)'}</div>
                <div style="font-size: 11px; color: #868e96; margin-bottom: 6px;">
                    ${entry.province || ''} · ${entry.n_old || (entry.olds || []).length} phường cũ · cầu ${(entry.dem || 0).toLocaleString()} đơn · ${(entry.dem_kg || 0).toLocaleString()} kg/ngày · ${statusHtml}
                </div>
                <div style="font-size: 12px; color: #333; margin-top: 4px;">
                    <b>BC auto gán:</b> <span style="color:${GHN_BLUE};">${entry.assigned_bc_name || '(chưa gán)'}${assignedShare}</span>
                </div>
                ${candidatesRows ? `
                <div style="font-size: 11px; font-weight: 700; color: #495057; margin-top: 8px;">Ứng viên (theo cầu):</div>
                <table style="width:100%; font-size:11px; border-collapse:collapse; margin-top:2px;">
                    <thead><tr style="color:#868e96;"><th style="text-align:left; padding:2px 4px;">BC</th><th style="text-align:right; padding:2px 4px;">Cầu</th><th style="text-align:right; padding:2px 4px;">%</th></tr></thead>
                    <tbody>${candidatesRows}</tbody>
                </table>` : ''}
                ${oldsRows ? `
                <div style="font-size: 11px; font-weight: 700; color: #495057; margin-top: 10px;">Thành phần phường cũ:</div>
                <table style="width:100%; font-size:11px; border-collapse:collapse; margin-top:2px;">
                    <thead><tr style="color:#868e96;"><th style="text-align:left; padding:2px 4px;">Phường cũ</th><th style="text-align:left; padding:2px 4px;">BC giao</th><th style="text-align:right; padding:2px 4px;">Đơn</th><th style="text-align:right; padding:2px 4px;">Kg</th><th style="text-align:left; padding:2px 4px;">Nhập</th></tr></thead>
                    <tbody>${oldsRows}</tbody>
                </table>` : ''}
                <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #dee2e6; font-size: 10px; color: #adb5bd;">
                    ℹ️ Ranh giới phường MỚI (sau sáp nhập 2025) · gộp từ dữ liệu phường CŨ — nguồn: /api/rezone.json.
                </div>
            </div>
        `;
    }

    // ==================== NHÂN SỰ / ĐỊNH BIÊN THEO BƯU CỤC (v1.7.9) ====================
    // Người dùng yêu cầu bổ sung vào popup bưu cục: (1) tổng số xã/phường phụ trách (đã có
    // sẵn props.n_wards, chỉ cần LÀM RÕ nhãn cho dễ hiểu), (2) tổng sản lượng đơn GTC/LTC
    // (gộp cả khoảng ngày đang tải ở tab "Theo Nhân Viên", kèm trung bình/ngày nếu >1 ngày),
    // (3) khối "Nhân sự": Hiện có / Định biên cần / Thiếu — cả CẤP BƯU CỤC lẫn TỪNG xã/phường.
    //
    // NGUỒN DỮ LIỆU (khác hẳn Tổng Lấy/Tổng Giao ở trên — 2 dòng đó lấy TĨNH từ
    // quyhoachbuucuc.info/api/hubs.json, KHÔNG đổi theo khoảng ngày đang xem): khối MỚI này
    // đọc TRỰC TIẾP state.staffRawRows — dữ liệu SỐNG, đã lọc theo khoảng ngày, chỉ có SAU
    // KHI người dùng bấm tải sản lượng ở tab "Theo Nhân Viên" — nên nếu tab đó CHƯA từng tải
    // dữ liệu cho bưu cục này, khối GTC/LTC + Định biên/Thiếu KHÔNG thể tính được (KHÔNG giả
    // vờ hiện số 0 gây hiểu lầm "bưu cục này không có việc/dư người") — chỉ hiện 1 dòng ghi
    // chú hướng dẫn thay vào đó, xem hubPopupHtml_.
    //
    // CÔNG THỨC ĐỊNH BIÊN — v1.7.12 SỬA LỖI THẬT người dùng phát hiện ngay sau khi dùng
    // v1.7.9: bản đó lấy TỬ SỐ là "tổng Giao TC" (chỉ đơn GIAO THÀNH CÔNG) — SAI, vì định
    // biên phải phản ánh ĐÚNG khối lượng công việc CẦN LÀM (bao nhiêu đơn phải giao trong
    // ngày), không phải chỉ phần đã giao thành công (1 người vẫn phải chạy đủ số đơn được
    // giao dù có đơn giao thất bại/khách không nhận — KHÔNG PHẢI việc đó "không tính vào
    // khối lượng"). Người dùng xác nhận rõ: "Định biên = tổng lượng đơn CẦN GIAO của bưu cục
    // ngày hôm đó / định mức ổn định... chứ không phải đơn GTC". SỬA: tử số đổi từ "Giao TC"
    // (chỉ isUpdated && isSucceeded) sang TỔNG MỌI ĐƠN GIAO (mọi dòng type==='DELIVER', không
    // lọc theo isSucceeded — gồm cả thành công/thất bại/đang xử lý) — ĐÚNG NHẤT QUÁN với cách
    // 'dayTotalGiao'/giaoStatus_() đã dùng cho toàn bộ modul từ v1.7.2 ("phải tính là tổng đơn
    // Giao hàng trong chuyến chứ không phải chỉ tính đơn GTC [thành công]" — xem changelog
    // v1.7.2 ở computeStaffTerritories_) — v1.7.9 đã VÔ TÌNH lệch khỏi đúng tiền lệ này.
    //
    // MẪU SỐ ("mức ổn định") — GIỮ NGUYÊN, đã hỏi lại người dùng rõ ràng và được xác nhận:
    // "không lấy điểm giữa, mà điểm tiệm cận trên, ví dụ xã 40-70 thì lấy 70, phường 50-90 thì
    // lấy 90" — tức "mức ổn định" (số đơn CẦN GIAO/người/ngày) = THRESHOLDS_.giaoXa.yellowMin
    // (70) cho xã, THRESHOLDS_.giaoPhuong.yellowMin (90) cho phường (TÁI DÙNG đúng hằng số
    // ngưỡng quá tải/thiếu đơn đã có sẵn cho cả modul, không thêm cấu hình mới).
    //
    // CÔNG THỨC ĐẦY ĐỦ (đã xác nhận, áp dụng ĐÚNG như nhau cho cả 1 ngày lẫn nhiều ngày —
    // "nếu là nhiều ngày: Định biên = tổng đơn cần giao của các ngày đó / số ngày / số đơn ở
    // mức ổn định" — chính là công thức 1 ngày chia thêm cho số ngày, không phải công thức
    // khác): Định biên = ROUND((tổng đơn CẦN GIAO của xã đó trong khoảng ngày đang xem / số
    // ngày) / mức ổn định) — làm tròn về SỐ NGUYÊN theo đúng yêu cầu "định biên phải là số
    // nguyên". Cơ sở đơn vẫn CHỈ tính đơn GIAO (không gộp thêm đơn LẤY) — nhất quán với toàn bộ
    // hệ ngưỡng giaoXa/giaoPhuong của modul (vốn chỉ đánh giá riêng khối lượng Giao).
    //
    // "TỔNG ĐƠN CẦN GIAO CỦA XÃ" — KHÔNG dùng lại computeStaffWardAssignments_() (hàm đó CHỈ
    // trả về xã/phường đạt ngưỡng ≥15% tổng đơn/ngày của 1 nhân viên — dùng để QUYẾT ĐỊNH
    // tuyến giao chính/phụ đặt chấm trên bản đồ, KHÔNG PHẢI để cộng dồn khối lượng thật — dùng
    // lại sẽ BỎ SÓT mọi đơn ở xã/phường <15%, làm SAI THẤP tổng khối lượng thật) — hàm dưới
    // đây cộng dồn TRỰC TIẾP mọi đơn Giao (thành công lẫn thất bại) theo xã/phường, không lọc
    // theo kết quả, không lọc theo ngưỡng 15%.
    //
    // "HIỆN CÓ" (headcount) — 2 CẤP, 2 NGUỒN KHÁC NHAU, có thể KHÔNG cộng khớp nhau tuyệt
    // đối (đã nêu rõ trong popup, không giấu):
    //  - CẤP BƯU CỤC: đếm nhân viên trong sheet "HRM" có cột "Bưu cục" khớp mã bưu cục này VÀ
    //    trạng thái ĐANG LÀM VIỆC — đây là danh sách nhân sự THẬT (tổ chức), có sẵn dù CHƯA
    //    tải dữ liệu tuyến giao (tab "Theo Nhân Viên").
    //  - CẤP XÃ/PHƯỜNG: sheet HRM KHÔNG có cột xã/phường phụ trách -> phải suy ra từ chính dữ
    //    liệu tuyến giao ĐANG TẢI: đếm nhân viên (loại người đã nghỉ/tạm nghỉ) có xã/phường
    //    CHÍNH (primaryWardCode, tính giống HỆT bản đồ ở computeStaffTerritories_) = xã/phường
    //    đó — nên CHỈ tính được khi đã tải dữ liệu tuyến giao.
    // v1.7.17 — tra wardCode của 1 dòng đơn (wardCode có sẵn từ GHN, hoặc dự phòng suy luận
    // từ địa chỉ text) — TÁCH RA thành hàm dùng chung (trước đây lặp lại y hệt 2 lần trong
    // computeHubStaffingStats_ cho wardGiaoTotal/wardPickTotal, giờ dùng thêm ở phần phân bổ
    // đơn tồn theo ngày nên tách hẳn ra ngoài cho gọn, không lặp code lần 3).
    function resolveRowWardCode_(r) {
        return resolveOldWardCode_(r);
    }

    // v1.7.24 — SỬA LỖI "tải sản lượng xong 0 chấm nhân viên, (nhân viên,ngày) không xác định
    // được xã/phường ổn định": trước đây cứ có r.wardCode (mã xã/phường GHN trả về) là dùng
    // THẲNG làm khoá xã/phường — nhưng GHN đã chuyển sang mã xã/phường MỚI (sau sáp nhập), KHÁC
    // hệ mã phường CŨ của bản đồ (wards.json/wards.geojson) → không tra được ranh giới / tâm
    // phường → không đặt được chấm. Nay quy MỌI đơn về đúng 1 xã/phường CŨ trên bản đồ theo thứ
    // tự: (1) mã GHN trùng mã phường cũ · (2) toạ độ GPS của đơn nằm trong ranh giới phường cũ
    // nào · (3) tên xã/phường GHN trả về (+ huyện/tỉnh) · (4) mã phường MỚI → phường cũ lớn nhất
    // của nó (rezone) · (5) dò địa chỉ text như cũ. Kết quả cache ngay trên dòng (r.__oldWard).
    function buildOldWardBboxIndex_() {
        if (state.oldWardBboxIdx && state.oldWardBboxIdx.src === state.wardsOldEnriched) return state.oldWardBboxIdx.list;
        const list = [];
        ((state.wardsOldEnriched && state.wardsOldEnriched.features) || []).forEach(f => {
            try { list.push({ f, bb: turf.bbox(f), code: String(f.properties.ward_code) }); } catch (e) { /* bỏ qua */ }
        });
        state.oldWardBboxIdx = { src: state.wardsOldEnriched, list };
        return list;
    }
    function oldWardByPoint_(lng, lat) {
        if (typeof turf === 'undefined' || !isFinite(lng) || !isFinite(lat)) return null;
        const pt = turf.point([lng, lat]);
        for (const it of buildOldWardBboxIndex_()) {
            const b = it.bb;
            if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
            try { if (turf.booleanPointInPolygon(pt, it.f)) return it.code; } catch (e) { /* bỏ qua */ }
        }
        return null;
    }
    // v1.7.25 — dòng CHẨN ĐOÁN chấm nhân viên (hiện đầu dòng trạng thái tab "Theo Nhân Viên")
    function staffDotDiagText_() {
        const rows = (state.staffRawRows || []).filter(r => r.type === 'DELIVER');
        const how = {};
        rows.forEach(r => { resolveOldWardCode_(r); const k = r.__oldWardHow || 'khong'; how[k] = (how[k] || 0) + 1; });
        const lbl = { gpsngoai: 'GPS nằm ngoài ranh giới bản đồ', ghn: 'mã cũ', gps: 'GPS', name: 'tên xã', newname: 'tên xã mới', rezone: 'mã mới', text: 'địa chỉ', khong: 'KHÔNG khớp' };
        const feats = (state.staffDotFeatures && state.staffDotFeatures.features) || [];
        const hidden = feats.filter(f => !staffStatusAllowed_(f.properties && f.properties.workStatusCategory)).length;
        const s0 = rows[0] || {};
        console.log('[Tuyến Giao] Mẫu 3 đơn giao:', rows.slice(0, 3).map(r => ({ wardCode: r.wardCode, wardName: r.wardName, districtName: r.districtName, cityName: r.cityName, lat: r.lat, lng: r.lng, address: r.address })));
        return `🔎 Chẩn đoán: ${rows.length} đơn giao → ` + Object.keys(how).map(k => `${lbl[k] || k} ${how[k]}`).join(' · ')
            + ` · GPS hợp lệ ${rows.filter(r => vnLatLng_(r.lat, r.lng)).length} · ${feats.length} chấm${hidden ? ` (⚠️ ${hidden} bị ẩn do lọc trạng thái)` : ''}`
            + ` · mẫu: mã "${s0.wardCode || ''}" / xã "${s0.wardName || ''}" / toạ độ ${s0.lat},${s0.lng} / ${String(s0.address || '').slice(0, 70)}`;
    }
    function resolveOldWardCode_(r) {
        if (r.__oldWard !== undefined) return r.__oldWard;
        let code = null, how = '';
        const wc = r.wardCode ? String(r.wardCode) : '';
        const hub = state.hubsByCode ? state.hubsByCode[String(r.hubId)] : null;
        const region = hub ? (hub.region || '__none__') : '__none__';
        if (wc && state.wardsByCode && state.wardsByCode[wc]) { code = wc; how = 'ghn'; }
        if (!code && typeof r.lat === 'number' && typeof r.lng === 'number') {
            const ll = vnLatLng_(r.lat, r.lng);
            if (ll) { code = oldWardByPoint_(ll[1], ll[0]); if (code) how = 'gps'; else how = 'gpsngoai'; }
        }
        if (!code && r.wardName) {
            const m = matchAddressToWard_([r.wardName, r.districtName, r.cityName].filter(Boolean).join(', '), region);
            if (m) { code = m.wardCode; how = 'name'; }
        }
        if (!code && wc && state.rezoneByNewCode && state.rezoneByNewCode[wc]) {
            const olds = (state.rezoneByNewCode[wc].olds || []).filter(o => state.wardsByCode && state.wardsByCode[String(o.ward)]).sort((a, b) => (b.dem || 0) - (a.dem || 0));
            if (olds.length) { code = String(olds[0].ward); how = 'rezone'; }
        }
        if (!code && r.wardName && state.wardsNewRaw) {
            // tên xã/phường MỚI (sau sáp nhập) → ranh giới phường mới → điểm bên trong → phường cũ chứa điểm đó
            if (!state.newWardByName) {
                state.newWardByName = {};
                (state.wardsNewRaw.features || []).forEach(f => {
                    const k = normalizeVn_(String((f.properties || {}).name || '').replace(/^(Xã|Phường|Thị trấn|Đặc khu)\s+/i, ''));
                    if (k) (state.newWardByName[k] = state.newWardByName[k] || []).push(f);
                });
            }
            const k = normalizeVn_(String(r.wardName).replace(/^(Xã|Phường|Thị trấn|Đặc khu)\s+/i, ''));
            const fs = state.newWardByName[k] || [];
            if (fs.length === 1) {
                try { const p = turf.pointOnFeature(fs[0]).geometry.coordinates; code = oldWardByPoint_(p[0], p[1]); if (code) how = 'newname'; } catch (e) { /* bỏ qua */ }
            }
        }
        if (!code && r.address) {
            const m = matchAddressToWard_(r.address, region);
            if (m) { code = m.wardCode; how = 'text'; }
        }
        if (!code && how === 'gpsngoai') { r.__oldWard = null; r.__oldWardHow = how; return null; }
        r.__oldWard = code; r.__oldWardHow = how;
        return code;
    }

    function computeHubStaffingStats_(hubCode) {
        const allRows = state.staffRawRows || [];
        const rows = allRows.filter(r => String(r.hubId) === String(hubCode));
        // v1.7.16 — đơn thuộc chuyến CHƯA gán tài xế của bưu cục này (xem giải thích đầy đủ ở
        // fetchStaffVolumeRows_ — phản hồi thật: "bưu cục còn đơn chưa gán được vì thiếu nhân sự
        // đó => định biên sẽ sai vì còn lượng đơn tồn chưa gán"). v1.7.17: CHỈ dùng làm PHƯƠNG ÁN
        // DỰ PHÒNG cho những NGÀY sheet "Performance" (xem ngay dưới) KHÔNG có dữ liệu — khi có
        // Performance, số liệu đó ĐÁNG TIN HƠN (bắt được CẢ đơn chưa từng vào chuyến nào, không
        // chỉ riêng "chuyến có driverId rỗng") nên được ưu tiên, tránh cộng trùng 2 nguồn cho
        // cùng 1 ngày.
        const allUnassignedRows = state.staffUnassignedRawRows || [];
        const unassignedRows = allUnassignedRows.filter(r => String(r.hubId) === String(hubCode));

        // v1.7.17 — dữ liệu sheet "Performance" của ĐÚNG bưu cục này, gộp theo ngày (phòng khi
        // lỡ có >1 dòng cùng ngày) — NGUỒN CHÍNH cho "đơn tồn chưa gán" cấp bưu cục (Volume -
        // Đơn gán), xem giải thích đầy đủ ở loadPerformanceData_/SHEET_NAME_PERFORMANCE. Khớp
        // bưu cục qua TÊN (cột B, sheet không có mã) — performanceHubCode_() trả null nếu tên
        // không khớp được hub nào (bị bỏ qua, không đoán mò).
        const perfByDate = new Map(); // date -> { volume, donGan }
        (state.performanceRows || []).forEach(p => {
            if (performanceHubCode_(p.hubName) !== String(hubCode)) return;
            const cur = perfByDate.get(p.date) || { volume: 0, donGan: 0 };
            cur.volume += (typeof p.volume === 'number' ? p.volume : 0);
            cur.donGan += (typeof p.donGan === 'number' ? p.donGan : 0);
            perfByDate.set(p.date, cur);
        });

        const hasTripData = rows.length > 0 || unassignedRows.length > 0 || perfByDate.size > 0;

        // v1.7.16/17 — gộp CẢ ngày của đơn "chưa gán" (dù từ nguồn nào) vào dayCount — nếu 1
        // ngày CHỈ có đơn tồn (không có 1 dòng "rows" nào), bỏ ngày đó khỏi mẫu số sẽ làm TB/
        // ngày bị tính cao giả tạo (chia cho ít ngày hơn thực tế đang xem).
        const distinctDates = Array.from(new Set(
            rows.concat(unassignedRows).map(r => r.tripDate).filter(Boolean).concat(Array.from(perfByDate.keys()))
        )).sort();
        const dayCount = Math.max(distinctDates.length, 1);

        let gtc = 0, ltc = 0;
        rows.forEach(r => {
            if (!(r.isUpdated && r.isSucceeded)) return;
            if (r.type === 'DELIVER') gtc += 1;
            else if (r.type === 'PICK') ltc += 1;
        });

        // v1.7.12 — Tổng đơn CẦN GIAO THẬT của TỪNG xã/phường (mọi đơn Giao ĐÃ GÁN, suy ra CHÍNH
        // XÁC xã/phường qua resolveRowWardCode_, KHÔNG lọc theo isSucceeded), CỘNG DỒN CẢ khoảng
        // ngày đang xem — v1.7.21: đây LUÔN là NỀN CHÍNH THỨC cho MỌI ngày (kể cả ngày sheet
        // Performance có dữ liệu — xem lý do đảo ngược quyết định v1.7.20 ở khối "GAP" phía dưới),
        // ĐỒNG THỜI vẫn là cơ sở tỷ trọng dự phòng (wardShareBase, khi bưu cục không có "dv").
        const wardGiaoTotal = new Map();
        rows.forEach(r => {
            if (r.type !== 'DELIVER') return;
            const wardCode = resolveRowWardCode_(r);
            if (!wardCode) return;
            wardGiaoTotal.set(wardCode, (wardGiaoTotal.get(wardCode) || 0) + 1);
        });
        // v1.7.19 — LỖI THẬT phát hiện tiếp ở v1.7.18: dùng đơn ĐÃ GÁN CỘNG DỒN CẢ khoảng ngày
        // (wardGiaoTotal) làm tỷ trọng VẪN sai, vì nếu 1 xã/phường bị bỏ dispatch HOÀN TOÀN suốt
        // CẢ khoảng ngày đang xem (không phải chỉ 1 ngày — đúng lúc thiếu người kinh niên, ví dụ
        // thật: "Xã Lương Phú 0/6,3 ... Xã Tân Hòa 0/0,9 ... Xã Tân Thành 4,5/0" đều ra 0 hoặc gần
        // 0 đơn Giao dù "ngày nào chẳng vài chục đơn"), tỷ trọng đó VẪN = 0/gần 0 -> xã đó vẫn
        // không nhận được phần backlog nào -> Định biên vẫn = 0 -> "✓ Đủ" trong khi THỰC RA đang
        // hoàn toàn KHÔNG có ai phục vụ (Hiện có = 0) — nghịch lý y hệt lỗi gốc rễ ban đầu, chỉ là
        // ở quy mô "cả khoảng ngày" thay vì "1 ngày". Phản hồi thật: "mày đã tham khảo số đơn giao
        // ở từng xã phường trong dữ liệu Json chưa? để tính tỷ trọng tổng đơn cần giao của bưu cục
        // ngày hôm đó" + ví dụ cụ thể chỉ thẳng bảng sai ở trên.
        // SỬA: đổi NGUỒN tỷ trọng sang cột "dv" (đơn Giao) có sẵn trong /api/wards.json — dữ liệu
        // THAM KHẢO TĨNH của quyhoachbuucuc.info cho TỪNG xã/phường (đã dùng hiển thị ở popup xã/
        // phường — wardPopupHtml_, "📦 Giao: X đơn" — xem SHEET_NAME_PERFORMANCE/enrichOldWards_),
        // ĐỘC LẬP hoàn toàn với dữ liệu chuyến đang tải của khoảng ngày đang xem -> KHÔNG bị "mù"
        // với xã/phường đang bị bỏ dispatch trong CHÍNH khoảng ngày đó, vì nguồn này không phụ
        // thuộc gì vào việc có dispatch hay không. wardDvBase CHỈ tính xã/phường có dv > 0 (loại
        // dv=0/thiếu dữ liệu ra khỏi mẫu số tỷ trọng — dv=0 do THIẾU dữ liệu khác về bản chất với
        // "tỷ trọng thật sự = 0", không nên cho ăn 0% oan uổng). CHỈ fallback về tỷ trọng đơn ĐÃ
        // GÁN sống (wardGiaoTotal, cách tính v1.7.18) khi TOÀN BỘ xã/phường bưu cục này đều có
        // dv=0/không có (VD wards.json lỗi/chưa tải được) — còn hơn không có tỷ trọng nào cả.
        const wardDvBase = new Map();
        (Object.values(state.wardsByCode || {})).forEach(w => {
            if (String(w.delivery_hub) !== String(hubCode)) return;
            const dv = typeof w.dv === 'number' ? w.dv : 0;
            if (dv > 0) wardDvBase.set(String(w.ward_code), dv);
        });
        const wardShareBase = wardDvBase.size > 0 ? wardDvBase : new Map(wardGiaoTotal);
        const wardShareIsFromDv = wardDvBase.size > 0;

        // v1.7.16 — đơn "chưa gán tài xế" (trip-level), theo ngày — CHỈ dùng làm dự phòng cho
        // những ngày Performance KHÔNG có dữ liệu (xem vòng lặp bên dưới), đã BIẾT SẴN wardCode
        // của từng đơn (không cần phân bổ theo tỷ trọng).
        const unassignedGiaoByDateWard = new Map(); // date -> Map(wardCode -> count)
        unassignedRows.forEach(r => {
            if (r.type !== 'DELIVER') return;
            const wardCode = resolveRowWardCode_(r);
            if (!wardCode) return;
            if (!unassignedGiaoByDateWard.has(r.tripDate)) unassignedGiaoByDateWard.set(r.tripDate, new Map());
            const m = unassignedGiaoByDateWard.get(r.tripDate);
            m.set(wardCode, (m.get(wardCode) || 0) + 1);
        });

        // v1.7.18 — TỔNG Volume/Đơn gán Performance (CỘNG DỒN mọi ngày CÓ dữ liệu Performance
        // trong khoảng đang xem — mỗi ngày tính riêng max(0,...) cho phần chênh trước khi cộng, để
        // 1 ngày báo âm/lỗi không "bù" ngầm cho ngày khác báo dương). totalPerfBacklog (Volume-Đơn
        // gán, theo SHEET) v1.7.21 CHỈ còn dùng làm SỐ THAM KHẢO hiển thị ở popup (xem
        // performanceBacklogInfo ở return bên dưới) — KHÔNG dùng để quyết định lượng phân bổ (xem
        // vì sao ở khối GAP ngay dưới).
        let totalPerfVolume = 0, totalPerfDonGan = 0, totalPerfBacklog = 0;
        let performanceDayCoveredCount = 0;
        perfByDate.forEach(perf => {
            performanceDayCoveredCount++;
            totalPerfVolume += perf.volume;
            totalPerfDonGan += perf.donGan;
            totalPerfBacklog += Math.max(0, perf.volume - perf.donGan);
        });

        // v1.7.21 — LỖI THẬT phát hiện tiếp sau v1.7.20 (bản v1.7.20 sửa QUÁ TAY: bỏ HẲN "đã gán
        // sống, biết CHÍNH XÁC xã/phường" của những ngày có Performance, thay bằng phân bổ TOÀN BỘ
        // Volume theo tỷ trọng dv — làm MẤT ĐỘ CHÍNH XÁC của những xã/phường đã BIẾT RÕ số liệu
        // thật, không đáng phải "đoán" qua dv nữa). Phản hồi thật CHỈ RÕ đúng công thức nên dùng —
        // nguyên văn: "mày phải lôi cái đám đã gán trong chuyến ra theo từng xã phường đã gán, số
        // còn lại chưa gán = 1448 đơn (Volume) - đi số đã gán thực tế (ví dụ đc 771 đơn) thì số
        // còn lại là chưa gán = 677 đơn chưa gán => mày * với tỷ trọng từng xã phường (đã có đơn ở
        // file json) => số đơn chưa gán mỗi xã phường => lấy số đơn này + số đơn đã gán = tổng đơn
        // của xã phường đó" — TỨC: GIỮ NGUYÊN số đã gán sống theo từng xã/phường ĐÃ BIẾT CHÍNH
        // XÁC (không ghi đè bằng phân bổ dv nữa), CHỈ phân bổ theo tỷ trọng PHẦN CÒN THIẾU so với
        // Volume. Khác 1 điểm quan trọng so với công thức v1.7.17-19 (Volume - Đơn gán THEO SHEET)
        // và đúng ý người dùng hơn: coveredLiveTotal dùng ĐÚNG con số đã cộng được vào wardGiaoTotal
        // ở trên (từ CHÍNH dữ liệu tuyến giao, KHÔNG phải cột Đơn gán của sheet) — nên phần "GAP"
        // này TỰ ĐỘNG hấp thụ CẢ 2 loại thiếu hụt cùng lúc: (a) backlog THẬT (Volume > Đơn gán) LẪN
        // (b) đơn ĐÃ gán thật theo sheet nhưng resolveRowWardCode_/matchAddressToWard_ KHÔNG suy ra
        // được xã/phường cụ thể (lỗi v1.7.20 vừa sửa) — dù nguyên nhân cụ thể là gì, phần "chưa
        // biết rơi vào xã/phường nào" đều được phân bổ ĐÚNG theo tỷ trọng dv thay vì bị bỏ sót
        // (v1.7.17-19) hay ghi đè mất chính xác (v1.7.20). Do đó GAP này CÓ THỂ khác totalPerfBacklog
        // (Volume-Đơn gán sheet) — ví dụ thật: Volume=1448, Đơn gán(sheet)=771, nhưng
        // coveredLiveTotal (đã gán sống suy ra được xã/phường) chỉ = 719 (52 đơn "đã gán" theo sheet
        // không suy ra được xã/phường cụ thể) -> GAP = 1448-719 = 729 (không phải 677) -> phân bổ
        // đúng 729 theo tỷ trọng, cộng THÊM vào 719 đã có sẵn theo từng xã/phường -> TỔNG vẫn khớp
        // ĐÚNG Volume (719+729=1448) nhưng KHÔNG xã/phường nào bị mất số liệu THẬT đã biết.
        let coveredLiveTotal = 0;
        rows.forEach(r => {
            if (r.type !== 'DELIVER') return;
            if (!perfByDate.has(r.tripDate)) return;
            if (!resolveRowWardCode_(r)) return;
            coveredLiveTotal += 1;
        });
        const performanceGapAmount = Math.max(0, totalPerfVolume - coveredLiveTotal);

        let performanceGapGiaoCount = 0;
        let performanceUnallocatedGiaoCount = 0;
        if (performanceGapAmount > 0) {
            const shareTotal = Array.from(wardShareBase.values()).reduce((s, v) => s + v, 0);
            if (shareTotal > 0) {
                wardShareBase.forEach((cnt, wardCode) => {
                    const alloc = performanceGapAmount * (cnt / shareTotal);
                    wardGiaoTotal.set(wardCode, (wardGiaoTotal.get(wardCode) || 0) + alloc);
                });
                performanceGapGiaoCount = performanceGapAmount;
            } else {
                performanceUnallocatedGiaoCount = performanceGapAmount;
            }
        }

        // Trip-level fallback — CHỈ những ngày Performance KHÔNG có dữ liệu (giữ nguyên hành vi
        // v1.7.16 nguyên bản cho riêng phần này) — 2 nguồn KHÔNG BAO GIỜ cộng chung cho CÙNG 1
        // ngày (tránh đếm trùng): ngày nào Performance CÓ dữ liệu thì bỏ qua hẳn trip-level của
        // đúng ngày đó (dù unassignedGiaoByDateWard có thể vẫn có entry — cố ý bỏ qua).
        let tripLevelBacklogGiaoCount = 0;
        distinctDates.forEach(date => {
            if (perfByDate.has(date)) return;
            const dayUnassigned = unassignedGiaoByDateWard.get(date);
            if (dayUnassigned) {
                dayUnassigned.forEach((cnt, wardCode) => {
                    wardGiaoTotal.set(wardCode, (wardGiaoTotal.get(wardCode) || 0) + cnt);
                    tripLevelBacklogGiaoCount += cnt;
                });
            }
        });

        // v1.7.18 — TỶ LỆ GÁN cấp bưu cục (Đơn gán / Volume, cộng dồn mọi ngày CÓ Performance
        // trong khoảng đang xem) — dùng để "ĐẨY" năng lực gán/người lên gần mức TỐI ĐA ngành cho
        // phép thay vì cộng thẳng 100% đơn tồn vào công thức Định biên ở mức ỔN ĐỊNH (yellowMin).
        // Phản hồi thật (nguyên văn): "khi mà bưu cục tỷ lệ gán chỉ đc 80% thì còn tồn 20% => 20%
        // đó cần phải tăng thêm vào năng lực gán cho các nhân viên => ví dụ thay vì chỉ ổn định ở
        // mức 70 đơn thì họ phải gán lên 84-90 đơn vì hàng còn mà? nhưng theo nghề này, tối đa gán
        // thành phố (tuyến phường) chỉ đc 150 đơn, xã/thị trấn ở huyện thì cũng chỉ 120 đơn là cao
        // lắm rồi." — VÀ xác nhận thêm cột Volume LÀ SỐ TỒN CỘNG DỒN ("đây là số tồn cả ngày hôm
        // trước không giao đc => tồn sang hôm sau thành số giao hôm sau, chứ bản chất hàng mới về
        // không phải là 1942 đâu") — tức KHÔNG được coi Volume là nhu cầu MỚI phát sinh thuần tuý
        // của riêng ngày đó rồi cộng thẳng vào công thức mức ỔN ĐỊNH (sẽ tính ra Định biên quá
        // cao, "ảo" theo đúng lượng nợ tồn dồn qua nhiều ngày) — effectiveDivisor_ bên dưới xử lý
        // đúng việc này: đẩy mức "đơn/người/ngày" lên cao hơn (gần mức TỐI ĐA ngành) khi tỷ lệ gán
        // càng thấp (tồn càng nhiều), thay vì suy ra thêm người mới theo tỷ lệ 1:1 ở mức ổn định.
        // null nếu bưu cục HOÀN TOÀN không có Performance trong khoảng đang xem (giữ nguyên Định
        // biên ở mức ỔN ĐỊNH như trước khi có sheet Performance, y hệt hành vi v1.7.16).
        const tyLeGanHub = totalPerfVolume > 0 ? (totalPerfDonGan / totalPerfVolume) : null;
        function effectiveDivisor_(isPhuong) {
            const stable = isPhuong ? THRESHOLDS_.giaoPhuong.yellowMin : THRESHOLDS_.giaoXa.yellowMin;
            const max = isPhuong ? THRESHOLDS_.giaoPhuong.dinhBienMax : THRESHOLDS_.giaoXa.dinhBienMax;
            if (tyLeGanHub === null || tyLeGanHub >= 1) return stable; // không có Performance, hoặc bưu cục đã gán ĐỦ/vượt Volume -> không cần đẩy
            if (tyLeGanHub <= 0) return max; // gán được 0% -> đẩy thẳng lên mức tối đa
            return Math.min(max, stable / tyLeGanHub);
        }

        // v1.7.16 — thống kê số đơn "chưa gán" (Lấy — Performance KHÔNG có cột Lấy nên vẫn CHỈ
        // dùng trip-level cho Lấy, không đổi so với v1.7.16) để hiện 1 dòng minh bạch ở popup.
        let unassignedPickCount = 0;
        unassignedRows.forEach(r => { if (r.type === 'PICK') unassignedPickCount += 1; });

        // v1.7.14 — Tổng đơn LẤY của TỪNG xã/phường, dùng cho cột "TB Lấy/Giao" của bảng mới ở
        // popup bưu cục. GHN trả THẲNG wardCode cho CẢ đơn Lấy (lấy từ senderContact, xem
        // loadStaffRowsRaw_/items.forEach — "loc = item.type === 'PICK' ? sender : receiver")
        // nên tính được y hệt cách tính wardGiaoTotal, KHÔNG lọc isSucceeded (cùng triết lý
        // "khối lượng công việc thật"). v1.7.16 — GỘP THÊM unassignedRows (Performance không có
        // cột Lấy nên KHÔNG cần tách theo nguồn như Giao ở trên — trip-level vẫn luôn là nguồn
        // duy nhất cho Lấy, dùng cho MỌI ngày, không riêng ngày thiếu Performance).
        const wardPickTotal = new Map();
        rows.concat(unassignedRows).forEach(r => {
            if (r.type !== 'PICK') return;
            const wardCode = resolveRowWardCode_(r);
            if (!wardCode) return;
            wardPickTotal.set(wardCode, (wardPickTotal.get(wardCode) || 0) + 1);
        });

        // "Hiện có" — v1.7.10, SỬA LẠI ĐÚNG NGHĨA theo góp ý người dùng: "Hiện có = Nhân sự
        // hiện đang có đi làm" — tức phải là người THỰC TẾ CÓ PHÁT SINH chuyến/đơn (Lấy hoặc
        // Giao) trong khoảng ngày đang xem, KHÔNG PHẢI danh sách "trạng thái ACTIVE" tĩnh
        // trong sheet HRM (1 người có thể đang ACTIVE trên giấy tờ nhưng nghỉ không phép/mới
        // tuyển chưa từng chạy tuyến/đã chuyển bưu cục khác mà sheet HRM chưa cập nhật kịp —
        // KHÔNG PHẢI "đang đi làm" đúng nghĩa). Bản v1.7.9 trước đó dùng SAI 2 nguồn khác nhau
        // cho 2 cấp (xã/phường: đếm từ dữ liệu tuyến giao thật; bưu cục: đếm từ sheet HRM) —
        // giờ THỐNG NHẤT LẠI 1 nguồn DUY NHẤT (dữ liệu tuyến giao thật, state.staffRawRows đã
        // lọc theo khoảng ngày đang xem) cho CẢ 2 cấp, chỉ khác phạm vi gộp:
        //  - CẤP XÃ/PHƯỜNG: đếm nhân viên có xã/phường CHÍNH (primaryWardCode, TỪ ĐÚNG pipeline
        //    bản đồ computeStaffTerritories_ để luôn khớp số chấm/tên hiện trên bản đồ) = xã/
        //    phường đó.
        //  - CẤP BƯU CỤC: đếm nhân viên có ÍT NHẤT 1 dòng (Lấy hoặc Giao, không cần đạt ngưỡng
        //    15%/có xã-phường CHÍNH xác định được) thuộc bưu cục này trong khoảng ngày đang
        //    xem — rộng hơn tổng các cấp xã/phường cộng lại (vì có thể còn người chưa xác định
        //    được xã/phường CHÍNH nhưng vẫn đang thực sự đi làm/có đơn).
        // Cả 2 cấp đều LOẠI người đã nghỉ việc/tạm nghỉ (tra sheet HRM qua driverId) — người đã
        // nghỉ dù dữ liệu chuyến cũ vẫn còn trong khoảng ngày đang xem cũng KHÔNG được tính là
        // "đang đi làm". CHỈ tính được khi ĐÃ tải dữ liệu tuyến giao cho bưu cục này (hasTripData)
        // — không có dữ liệu tuyến giao thì KHÔNG có cách nào biết ai thực tế đang đi làm.
        // v1.7.13 — ĐỐI CHIẾU THÊM Mã nhân viên (driverId) <-> buuCuc (HRM) với bưu cục ĐANG
        // XEM (hubCode) — phản hồi thật kèm ví dụ cụ thể: "Vi Trường An" thuộc BIÊN CHẾ bưu
        // cục 23021000 (Phú Bình 1) theo HRM, nhưng ĐI HỖ TRỢ tạm thời bưu cục 22410000 (Phú
        // Bình 2) nên có dữ liệu tuyến giao dưới hubId=22410000 trong khoảng ngày đang xem —
        // TRƯỚC ĐÂY (v1.7.10) chỉ cần "có dữ liệu tuyến giao dưới bưu cục này" là tính vào
        // "Hiện có" của bưu cục đó -> ĐẾM NHẦM người "đi hỗ trợ" là nhân sự CƠ HỮU của bưu cục
        // đang xem. SỬA: "Hiện có" giờ phải thoả CẢ 3 điều kiện — (a) có dữ liệu tuyến giao
        // dưới bưu cục ĐANG XEM trong khoảng ngày đang xem (giữ nguyên yêu cầu "đang đi làm"
        // v1.7.10) — (b) KHÔNG phải đã nghỉ việc/tạm nghỉ theo HRM (giữ nguyên) — (c) MỚI: mã
        // bưu cục "nhà" theo HRM (buuCuc, hrmHomeHubCode_) phải TRÙNG với bưu cục đang xem —
        // NẾU có dữ liệu HRM và buuCuc đó KHÔNG trùng (VD "Vi Trường An" khi đang xem Phú Bình
        // 2) -> LOẠI, không tính là "Hiện có" của bưu cục đang xem (dù có dữ liệu tuyến giao ở
        // đây, vì đó chỉ là đi hỗ trợ tạm thời). NẾU KHÔNG tra được HRM cho driverId đó (chưa
        // có dữ liệu HRM) -> vẫn giữ tính như cũ (không đủ dữ liệu để loại, tránh đếm thiếu).
        function belongsToThisHub_(driverId) {
            const home = hrmHomeHubCode_(driverId);
            if (home === null) return true; // không tra được HRM -> không đủ căn cứ để loại
            return home === String(hubCode);
        }

        // v1.7.22 — "Hiện có" (wardHeadcount + workingStaffKeys ngay dưới) giờ dùng
        // isHrmInactiveOnDate_(driverId, tripDate) THAY CHO resolveHrmDisplay_(...).isInactive (so
        // với TRẠNG THÁI HIỆN TẠI, không phân biệt ngày) — xem giải thích đầy đủ ở
        // isHrmInactiveOnDate_. territories mỗi phần tử ỨNG VỚI ĐÚNG 1 (staffKey, tripDate) — xem
        // byStaffDay ở computeStaffTerritories_ — nên t.tripDate luôn có sẵn, dùng được thẳng.
        const territories = hasTripData ? computeStaffTerritories_(buildDotComputationRows_(rows)) : [];
        const wardHeadcount = new Map(); // wardCode -> Set(staffKey)
        territories.forEach(t => {
            if (isHrmInactiveOnDate_(t.driverId, t.tripDate)) return;
            if (!t.primaryWardCode) return;
            if (!belongsToThisHub_(t.driverId)) return; // v1.7.13: loại người "đi hỗ trợ" — xem giải thích ở belongsToThisHub_
            if (!wardHeadcount.has(t.primaryWardCode)) wardHeadcount.set(t.primaryWardCode, new Set());
            wardHeadcount.get(t.primaryWardCode).add(t.staffKey);
        });

        const workingStaffKeys = new Set();
        rows.forEach(r => {
            if (isHrmInactiveOnDate_(r.driverId, r.tripDate)) return; // v1.7.22: đã nghỉ TÍNH ĐẾN đúng ngày r.tripDate mới loại — không loại nhầm người nghỉ SAU ngày đang xem
            if (!belongsToThisHub_(r.driverId)) return; // v1.7.13: loại người "đi hỗ trợ" — xem giải thích ở belongsToThisHub_
            workingStaffKeys.add(r.staffKey);
        });
        const hubHeadcountWorking = workingStaffKeys.size;

        // Số ĐĂNG KÝ (roster) theo sheet HRM — CHỈ giữ lại làm THAM KHẢO PHỤ (hiện khi CHƯA
        // có dữ liệu tuyến giao, để người dùng vẫn thấy được quy mô nhân sự trên giấy tờ của
        // bưu cục) — KHÔNG dùng con số này làm "Hiện có" nữa (đó chính là điều đã sửa ở trên).
        let hubHeadcountRoster = 0;
        const hrmAvailable = !!state.hrmByDriverId;
        if (hrmAvailable) {
            Object.keys(state.hrmByDriverId).forEach(id => {
                const rec = state.hrmByDriverId[id];
                const bc = String(rec.buuCuc || '').split(' - ')[0].trim();
                if (bc !== String(hubCode)) return;
                if (normalizeHrmTrangThai_(rec.trangThai) !== 'ACTIVE') return;
                hubHeadcountRoster += 1;
            });
        }

        // Danh sách xã/phường bưu cục này phụ trách (delivery_hub) — LUÔN có (dữ liệu tĩnh
        // wards.json), không phụ thuộc dữ liệu tuyến giao.
        const wards = Object.values(state.wardsByCode || {}).filter(w => String(w.delivery_hub) === String(hubCode));
        const wardStats = wards.map(w => {
            const isPhuong = /^Phường\s+/i.test(w.name || '');
            const giaoTotal = wardGiaoTotal.get(String(w.ward_code)) || 0;
            // v1.7.14: tổng đơn Lấy của xã/phường này — dùng cho cột "TB Lấy/Giao" của bảng
            // "Theo từng xã/phường" mới ở popup bưu cục (xem wardPickTotal ở trên).
            const pickTotal = wardPickTotal.get(String(w.ward_code)) || 0;
            // v1.7.18 — divisor giờ ĐỘNG (effectiveDivisor_), không còn cố định ở mức ỔN ĐỊNH
            // (yellowMin) nữa — xem giải thích đầy đủ ở effectiveDivisor_ phía trên.
            const stableDivisor = isPhuong ? THRESHOLDS_.giaoPhuong.yellowMin : THRESHOLDS_.giaoXa.yellowMin;
            const divisor = effectiveDivisor_(isPhuong);
            const dinhBien = hasTripData ? Math.round((giaoTotal / dayCount) / divisor) : 0;
            const hienCo = (wardHeadcount.get(String(w.ward_code)) || new Set()).size;
            const thieu = Math.max(0, dinhBien - hienCo);
            return {
                wardCode: w.ward_code, wardName: w.name || w.ward_code, isPhuong, giaoTotal, pickTotal,
                // v1.7.14 — trung bình/ngày (làm tròn 1 chữ số thập phân) — cột "TB Lấy/Giao".
                giaoAvg: Math.round((giaoTotal / dayCount) * 10) / 10,
                pickAvg: Math.round((pickTotal / dayCount) * 10) / 10,
                hienCo, dinhBien, thieu,
                stableDivisor, divisor // v1.7.18 — trả ra để hubPopupHtml_ hiện minh bạch mức đang dùng
            };
        }).sort((a, b) => b.giaoTotal - a.giaoTotal || String(a.wardName).localeCompare(String(b.wardName)));

        const hubDinhBien = hasTripData ? wardStats.reduce((s, w) => s + w.dinhBien, 0) : 0;
        const hubThieu = hasTripData ? Math.max(0, hubDinhBien - hubHeadcountWorking) : 0;
        // v1.7.14 — tổng Lấy/Giao (khối lượng CẦN LÀM, không lọc isSucceeded — cùng triết lý
        // giaoTotal) cộng dồn từ TẤT CẢ xã/phường — dùng cho hàng TỔNG của bảng mới.
        const hubGiaoTotalAll = wardStats.reduce((s, w) => s + w.giaoTotal, 0);
        const hubPickTotalAll = wardStats.reduce((s, w) => s + w.pickTotal, 0);

        return {
            hasTripData, hrmAvailable, dayCount,
            gtc, ltc, gtcAvg: gtc / dayCount, ltcAvg: ltc / dayCount,
            hubHeadcountWorking, hubHeadcountRoster, hubDinhBien, hubThieu,
            hubGiaoTotalAll, hubPickTotalAll,
            hubGiaoAvgAll: Math.round((hubGiaoTotalAll / dayCount) * 10) / 10,
            hubPickAvgAll: Math.round((hubPickTotalAll / dayCount) * 10) / 10,
            // v1.7.16/17/20/21 — số đơn ĐÃ CỘNG vào wardGiaoTotal/wardPickTotal (và do đó vào
            // Định biên) ở trên, tách theo NGUỒN — trả riêng ra để hubPopupHtml_ hiện dòng minh
            // bạch:
            //  - performanceCoveredLiveGiaoCount (v1.7.21, MỚI): phần đơn Giao ĐÃ GÁN sống, suy ra
            //    ĐÚNG xã/phường cụ thể qua resolveRowWardCode_, của riêng những NGÀY sheet
            //    Performance có dữ liệu — GIỮ NGUYÊN, không bị ghi đè (khác v1.7.20).
            //  - performanceGapGiaoCount (v1.7.21, ĐỔI TÊN từ performanceVolumeGiaoCount v1.7.20 +
            //    ĐỔI Ý NGHĨA lần nữa): phần CÒN THIẾU so với Volume sau khi đã trừ
            //    performanceCoveredLiveGiaoCount (= Volume - phần đã biết chính xác xã/phường,
            //    KHÔNG PHẢI Volume-Đơn gán theo sheet — xem comment v1.7.21 đầy đủ ở
            //    performanceGapAmount/wardGiaoTotal phía trên), đã phân bổ xuống xã/phường theo tỷ
            //    trọng wardShareBase và CỘNG THÊM vào performanceCoveredLiveGiaoCount (không ghi
            //    đè). Tổng performanceCoveredLiveGiaoCount + performanceGapGiaoCount LUÔN khớp
            //    ĐÚNG totalPerfVolume (trừ khi performanceUnallocatedGiaoCount > 0).
            //  - performanceBacklogInfo (v1.7.20, THUẦN THAM KHẢO, KHÔNG đổi ở v1.7.21): phần
            //    Volume - Đơn gán THEO SHEET (đơn đang THỰC SỰ tồn theo sheet) — CHỈ để hiện minh
            //    bạch ở popup, KHÔNG dùng để tính lượng phân bổ (có thể KHÁC performanceGapGiaoCount
            //    — xem lý do ở comment v1.7.21).
            //  - performanceUnallocatedGiaoCount: từ Performance nhưng KHÔNG phân bổ được (bưu
            //    cục hoàn toàn chưa có dữ liệu xã/phường nào để học tỷ trọng) — CHƯA cộng vào
            //    Định biên/bất kỳ xã/phường nào (tránh đoán mò sai), cần báo minh bạch riêng.
            //  - tripLevelBacklogGiaoCount: từ suy luận trip-level (v1.7.16, "chuyến chưa gán tài
            //    xế") — CHỈ dùng cho những NGÀY sheet Performance không có dữ liệu.
            //  - performanceDayCoveredCount / dayCount: bao nhiêu ngày trong khoảng đang xem có
            //    dữ liệu Performance (phần còn lại dùng trip-level hoặc không có backlog nào).
            performanceCoveredLiveGiaoCount: coveredLiveTotal,
            performanceGapGiaoCount, performanceBacklogInfo: totalPerfBacklog, performanceUnallocatedGiaoCount,
            tripLevelBacklogGiaoCount, performanceDayCoveredCount,
            unassignedPickCount,
            // v1.7.18 — tỷ lệ gán cấp bưu cục dùng để "đẩy" divisor (null nếu không có Performance
            // trong khoảng đang xem) — xem effectiveDivisor_/hubPopupHtml_.
            tyLeGanHub,
            // v1.7.19 — true nếu tỷ trọng phân bổ backlog đang dùng "dv" (wards.json, KHUYẾN
            // NGHỊ) — false nếu phải fallback về đơn ĐÃ GÁN sống (wardGiaoTotal, chỉ khi TOÀN BỘ
            // xã/phường bưu cục này không có dv) — xem wardShareBase/hubPopupHtml_.
            wardShareIsFromDv,
            wardStats
        };
    }

    function hubPopupHtml_(props) {
        const stats = computeHubStaffingStats_(props.hub_code);

        let gtcLtcHtml;
        if (stats.hasTripData) {
            const avgNote = stats.dayCount > 1
                ? ` <span style="color:#868e96;">(TB ${Math.round(stats.gtcAvg).toLocaleString()} GTC / ${Math.round(stats.ltcAvg).toLocaleString()} LTC mỗi ngày, gộp ${stats.dayCount} ngày)</span>`
                : '';
            gtcLtcHtml = `<div>🚚 <b>Tổng GTC / LTC:</b> ${stats.gtc.toLocaleString()} / ${stats.ltc.toLocaleString()} đơn${avgNote}</div>`;
        } else {
            gtcLtcHtml = `<div style="color:#adb5bd; font-style: italic;">🚚 Tổng GTC/LTC: chưa có dữ liệu — vào tab "Theo Nhân Viên", chọn bưu cục này rồi tải sản lượng.</div>`;
        }

        let staffingHtml;
        if (!stats.hasTripData) {
            // v1.7.10 — CHƯA có dữ liệu tuyến giao thì KHÔNG có cách nào biết ai THỰC TẾ đang
            // đi làm -> KHÔNG hiện "Hiện có" (dễ hiểu lầm là số đang đi làm thật). Chỉ hiện số
            // ĐĂNG KÝ trên sheet HRM làm tham khảo PHỤ, ghi rõ đây KHÔNG PHẢI số đang đi làm.
            const hrmLine = stats.hrmAvailable
                ? `<div style="color:#868e96;">Tham khảo — số đăng ký theo HRM: <b>${stats.hubHeadcountRoster}</b> (NV) <i>(chưa rõ ai trong số này đang thực tế đi làm)</i></div>`
                : `<div style="color:#adb5bd;">(chưa tải được dữ liệu HRM)</div>`;
            staffingHtml = `
                <div class="ghn-tg-hub-staffing-title">👥 Nhân sự</div>
                ${hrmLine}
                <div style="color:#adb5bd; font-style: italic; margin-top: 4px;">Hiện có / Định biên cần / Thiếu / chi tiết từng xã-phường: cần tải dữ liệu tuyến giao ở tab "Theo Nhân Viên" trước đã (chỉ dữ liệu đó mới biết ai THỰC TẾ đang đi làm).</div>
            `;
        } else {
            // v1.7.14 — ĐỔI THIẾT KẾ theo phản hồi "phần định biên đang thiết kế chưa đẹp...
            // Theo từng xã/phường => cho vào thành 1 cái bảng" — thay danh sách liệt kê từng
            // dòng bằng bảng HTML THẬT (Xã phường / TB Lấy/Giao / SL NV hiện có / Định biên /
            // Thiếu / Kết luận), có hàng TỔNG bên dưới, tô đỏ hàng Thiếu / xanh hàng Đủ, và có
            // thể lọc theo tên + bấm tiêu đề cột để sắp xếp NGAY TRONG bảng (xem
            // wireHubStaffingTable_, gọi ngay sau showInfoPanel_ ở nơi mở popup bưu cục). Mỗi
            // <tr> mang sẵn data-* (đã escapeHtml_ tên xã/phường) để JS sắp xếp/lọc đọc lại,
            // KHÔNG cần tính lại từ text hiển thị (tránh sai lệch định dạng số).
            // v1.7.16 — GỘP cột "Thiếu" (số) vào NGAY TRONG cột "Kết luận" (VD "❌ Thiếu 2" / "✓
            // Đủ") — bớt 1 cột trong 6 cột cũ để bảng gọn hơn, đỡ tràn ngang trong panel (xem giải
            // thích đầy đủ ở CSS .ghn-tg-info-panel--wide và showInfoPanel_ phía trên) — vẫn giữ
            // đủ data-thieu trên <tr> để sắp xếp cột "Kết luận" theo đúng SỐ Thiếu (không phải
            // sắp theo chữ "Thiếu/Đủ" vô nghĩa).
            const wardsRows = stats.wardStats.map(w => `
                <tr class="${w.thieu > 0 ? 'ghn-tg-ward-row--shortage' : 'ghn-tg-ward-row--ok'}"
                    data-wardname="${escapeHtml_(w.wardName)}" data-giaoavg="${w.giaoAvg}" data-hienco="${w.hienCo}" data-dinhbien="${w.dinhBien}" data-thieu="${w.thieu}">
                    <td class="ghn-tg-ward-td-name">${escapeHtml_(w.wardName)}</td>
                    <td>${w.pickAvg.toLocaleString('vi-VN')} / ${w.giaoAvg.toLocaleString('vi-VN')}</td>
                    <td>${w.hienCo}</td>
                    <td>${w.dinhBien}</td>
                    <td>${w.thieu > 0 ? `<span class="ghn-tg-shortage">❌ Thiếu ${w.thieu}</span>` : '<span class="ghn-tg-ok">✓ Đủ</span>'}</td>
                </tr>
            `).join('');

            const wardsTableOrEmpty = stats.wardStats.length
                ? `
                    <div class="ghn-tg-ward-table-toolbar">
                        <input type="text" id="ghn-tg-ward-table-search" class="ghn-tg-ward-table-search" placeholder="🔍 Lọc theo tên xã/phường...">
                    </div>
                    <div class="ghn-tg-ward-table-wrap">
                        <table class="ghn-tg-ward-table" id="ghn-tg-ward-staffing-table">
                            <thead>
                                <tr>
                                    <th data-sort="wardname" data-type="text">Xã/phường</th>
                                    <th data-sort="giaoavg" data-type="num" title="Trung bình đơn Lấy / Giao mỗi ngày (gộp cả thành công/thất bại/đang xử lý, KỂ CẢ đơn thuộc chuyến chưa gán tài xế — đúng khối lượng CẦN LÀM, không chỉ phần đã xong/đã có người nhận)">TB Lấy/Giao<br>(đơn/ngày)</th>
                                    <th data-sort="hienco" data-type="num" title="Số nhân viên THỰC TẾ đang đi làm ở xã/phường này (đã đối chiếu buuCuc HRM, loại người đi hỗ trợ/đã nghỉ)">Hiện<br> có</th>
                                    <th data-sort="dinhbien" data-type="num" title="round(TB đơn Giao/ngày ÷ mức năng lực/người/ngày đang dùng — mức này có thể ĐẨY LÊN tới mức tối đa ngành khi bưu cục đang tồn nhiều, xem dòng ⚙️ Tỷ lệ gán phía trên — CHỈ tính đơn Giao, không gộp đơn Lấy)">Định<br>biên</th>
                                    <th data-sort="thieu" data-type="num" title="Thiếu bao nhiêu NV so với Định biên (0 = Đủ)">Kết luận</th>
                                </tr>
                            </thead>
                            <tbody>${wardsRows}</tbody>
                            <tfoot>
                                <tr class="ghn-tg-ward-row--total">
                                    <td>TỔNG (${stats.wardStats.length} xã/phường)</td>
                                    <td>${stats.hubPickAvgAll.toLocaleString('vi-VN')} / ${stats.hubGiaoAvgAll.toLocaleString('vi-VN')}</td>
                                    <td>${stats.hubHeadcountWorking}</td>
                                    <td>${stats.hubDinhBien}</td>
                                    <td>${stats.hubThieu > 0 ? `<span class="ghn-tg-shortage">❌ Thiếu ${stats.hubThieu}</span>` : '<span class="ghn-tg-ok">✓ Đủ</span>'}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <div style="color:#adb5bd; font-size: 10px; margin-top: 3px;">Bấm vào tiêu đề cột để sắp xếp · hàng TỔNG luôn tính từ số liệu THỰC (Hiện có/Định biên cấp bưu cục), không phải cộng dồn số đã làm tròn của từng xã/phường nên có thể lệch 1-2 đơn vị so với tự cộng tay.</div>
                `
                : `<div style="color:#adb5bd; font-size: 11.5px; padding: 2px 6px;">(chưa xã/phường nào ghi nhận đơn Giao TC trong khoảng ngày đang xem)</div>`;

            // v1.7.16/17 — dòng minh bạch "đơn tồn CHƯA GÁN" (phản hồi thật: "bưu cục còn đơn
            // chưa gán được vì thiếu nhân sự đó => định biên sẽ sai vì còn lượng đơn tồn chưa
            // gán"). v1.7.17: tách rõ 3 trường hợp — (a) đã phân bổ được xuống xã/phường qua
            // sheet Performance (nguồn chính, đáng tin nhất); (b) đã cộng qua trip-level (dự
            // phòng, chỉ những ngày Performance chưa có dữ liệu); (c) KHÔNG phân bổ được (bưu
            // cục chưa có dữ liệu xã/phường nào để học tỷ trọng — cảnh báo riêng, MÀU ĐỎ, vì
            // phần này CHƯA cộng vào Định biên). CHỈ hiện dòng nào có số > 0, không làm rối popup
            // của bưu cục không gặp tình trạng nào trong 3 cái trên.
            const perfCoveredLive = Math.round(stats.performanceCoveredLiveGiaoCount);
            const perfGap = Math.round(stats.performanceGapGiaoCount);
            const perfBacklogInfo = Math.round(stats.performanceBacklogInfo);
            const perfUnalloc = Math.round(stats.performanceUnallocatedGiaoCount);
            const tripBacklog = stats.tripLevelBacklogGiaoCount;
            const pickBacklog = stats.unassignedPickCount;
            let backlogNote = '';
            // v1.7.18 — dòng minh bạch MỚI: khi bưu cục đang tồn nhiều (tỷ lệ gán < 100%), Định
            // biên KHÔNG còn cộng thẳng số tồn vào công thức ở mức ỔN ĐỊNH nữa — mức năng lực/
            // người/ngày được "đẩy" lên cao hơn (tới mức tối đa ngành cho phép) trước, xem
            // effectiveDivisor_ ở computeHubStaffingStats_. Phản hồi thật làm căn cứ: "khi mà bưu
            // cục tỷ lệ gán chỉ đc 80% thì còn tồn 20% => 20% đó cần phải tăng thêm vào năng lực
            // gán... nhưng tối đa gán... phường chỉ đc 150 đơn, xã/thị trấn... 120 đơn là cao lắm
            // rồi" + xác nhận cột Volume là số TỒN CỘNG DỒN qua các ngày, không phải hàng mới về
            // thuần tuý của riêng 1 ngày — nên KHÔNG được cộng thẳng 1:1 vào mức ổn định.
            if (stats.tyLeGanHub !== null && stats.tyLeGanHub < 1) {
                const pctStr = (Math.round(stats.tyLeGanHub * 1000) / 10).toLocaleString('vi-VN');
                const xaWard = stats.wardStats.find(w => !w.isPhuong);
                const phuongWard = stats.wardStats.find(w => w.isPhuong);
                const divParts = [];
                if (xaWard && xaWard.divisor > xaWard.stableDivisor) divParts.push(`Xã/Thị trấn: ${Math.round(xaWard.stableDivisor)} → <b>${Math.round(xaWard.divisor)}</b> đơn/người/ngày`);
                if (phuongWard && phuongWard.divisor > phuongWard.stableDivisor) divParts.push(`Phường: ${Math.round(phuongWard.stableDivisor)} → <b>${Math.round(phuongWard.divisor)}</b> đơn/người/ngày`);
                if (divParts.length) {
                    backlogNote += `<div>⚙️ Tỷ lệ gán cấp bưu cục (sheet Performance): <b>${pctStr}%</b> — bưu cục đang tồn nhiều nên mức năng lực/người/ngày dùng để tính Định biên bên dưới đã được ĐẨY LÊN (thay vì cộng thẳng số tồn ở mức ổn định): ${divParts.join(' · ')} (đã chặn trần theo mức tối đa ngành cho phép).</div>`;
                }
            }
            if (perfCoveredLive > 0 || perfGap > 0) {
                // v1.7.21 — ĐỔI Ý NGHĨA dòng này LẦN NỮA: v1.7.20 từng bỏ HẲN "đã gán sống, biết
                // CHÍNH XÁC xã/phường" của những ngày có Performance (thay bằng phân bổ TOÀN BỘ
                // Volume qua dv) — SAI theo đúng ý người dùng (mất độ chính xác của xã/phường ĐÃ
                // biết rõ số liệu thật). GIỜ: giữ nguyên phần "đã gán sống" (perfCoveredLive, biết
                // CHÍNH XÁC xã/phường), CHỈ phân bổ theo tỷ trọng phần CÒN THIẾU so với Volume
                // (perfGap = Volume - perfCoveredLive, xem comment v1.7.21 đầy đủ ở
                // computeHubStaffingStats_/performanceGapAmount) — 2 số CỘNG LẠI mới ra tổng đúng
                // Volume, không xã/phường nào bị "đoán" thay số liệu đã biết.
                const shareSrcNote = stats.wardShareIsFromDv
                    ? 'theo tỷ trọng sản lượng Giao tham khảo từng xã/phường (wards.json)'
                    : 'theo tỷ trọng đơn ĐÃ GÁN sống (dự phòng — bưu cục này CHƯA có dữ liệu sản lượng tham khảo theo xã/phường, xã/phường bị bỏ dispatch cả khoảng ngày có thể vẫn ra tỷ trọng thấp/0)';
                const backlogInfoNote = perfBacklogInfo > 0
                    ? ` <span style="color:#868e96;">(trong đó theo sheet có ${perfBacklogInfo} đơn đang THỰC SỰ tồn — Volume trừ Đơn gán, có thể khác số ${perfGap} bên dưới nếu 1 phần đơn đã gán không suy ra được xã/phường cụ thể)</span>`
                    : '';
                backlogNote += `<div>📊 Đơn Giao (theo sheet Performance, ${stats.performanceDayCoveredCount}/${stats.dayCount} ngày có dữ liệu): <b>${perfCoveredLive}</b> đơn đã BIẾT CHÍNH XÁC xã/phường (từ dữ liệu tuyến giao) + <b>${perfGap}</b> đơn CÒN LẠI (Volume trừ phần đã biết) đã phân bổ ${shareSrcNote}${backlogInfoNote} — tổng ${perfCoveredLive + perfGap} đơn đã dùng làm Định biên bên dưới.</div>`;
            }
            if (tripBacklog > 0) {
                backlogNote += `<div>📦 Đơn Giao tồn CHƯA gán tài xế (suy luận từ chuyến — chỉ áp dụng ${stats.dayCount - stats.performanceDayCoveredCount} ngày sheet Performance chưa có dữ liệu): <b>${tripBacklog}</b> đơn — đã cộng vào Định biên bên dưới.</div>`;
            }
            if (pickBacklog > 0) {
                backlogNote += `<div>📦 Đơn Lấy tồn CHƯA gán tài xế: <b>${pickBacklog}</b> đơn — đã cộng vào cột "TB Lấy/Giao" bên dưới.</div>`;
            }
            if (perfUnalloc > 0) {
                // v1.7.19/20/21 — giờ CHỈ xảy ra khi CẢ 2 nguồn tỷ trọng đều trống (bưu cục này vừa
                // không có dv/wards.json, vừa chưa có 1 đơn Giao đã gán nào — kể cả suy ra được xã/
                // phường — trong khoảng ngày đang xem) — hiếm hơn hẳn trước đây (v1.7.18 chỉ dựa 1
                // nguồn duy nhất). v1.7.21 — perfUnalloc giờ = performanceGapAmount (phần CÒN LẠI
                // sau khi trừ perfCoveredLive, thường = TOÀN BỘ Volume trong đúng trường hợp hiếm
                // này vì perfCoveredLive cũng = 0 khi không có nguồn tỷ trọng nào).
                backlogNote += `<div style="color:#dc3545;">⚠️ <b>${perfUnalloc}</b> đơn Giao cần giao (theo Performance) CHƯA phân bổ được xuống xã/phường cụ thể — bưu cục này CHƯA có cả dữ liệu sản lượng tham khảo (wards.json) LẪN dữ liệu tuyến giao đã gán nào trong khoảng ngày đang xem để học tỷ trọng. Số này CHƯA cộng vào Định biên bên dưới (Định biên đang có thể THẤP hơn thực tế) — hãy tải dữ liệu tuyến giao (tab "Theo Nhân Viên") cho bưu cục này để phân bổ đúng.</div>`;
            }
            // v1.7.23 — phản hồi thật: "phần này cho vào 1 dấu + ai thích xem thì ấn, không thì
            // mặc định ẩn, để phần diện tích không chèn vào bảng định biên" — khối giải thích cách
            // tính Định biên (⚙️ Tỷ lệ gán cấp bưu cục.../📊 Đơn Giao (theo sheet Performance...)/
            // 📦 Đơn tồn CHƯA gán tài xế/⚠️ chưa phân bổ được...) trước đây LUÔN hiện đầy đủ, chiếm
            // nhiều diện tích panel, đẩy bảng "Theo từng xã/phường" xuống xa — giờ gói trong 1 nút
            // "+" xổ ra, MẶC ĐỊNH ẨN. Wiring ở wireHubStaffingTable_ (gọi ngay sau
            // showInfoPanel_(hubPopupHtml_(...)) — cùng chỗ đã wire lọc/sắp xếp bảng xã/phường).
            const unassignedNote = backlogNote
                ? `
                    <div style="margin-top: 4px;">
                        <button type="button" id="ghn-tg-backlog-toggle-btn" class="ghn-tg-backlog-toggle-btn">🔍 Xem chi tiết cách tính Định biên</button>
                        <div id="ghn-tg-backlog-detail" style="display:none; color: #e8590c; line-height: 1.5; margin-top: 4px;">${backlogNote}</div>
                    </div>
                `
                : '';
            staffingHtml = `
                <div class="ghn-tg-hub-staffing-title">👥 Nhân sự bưu cục</div>
                <div class="ghn-tg-hub-staffing-summary">
                    <div>Hiện có: <b>${stats.hubHeadcountWorking}</b> (NV) <span style="color:#adb5bd; font-size: 10.5px;">— đang thực tế đi làm (có đơn trong khoảng ngày đang xem)</span></div>
                    <div>Định biên cần: <b>${stats.hubDinhBien}</b> (NV)</div>
                    <div>${stats.hubThieu > 0 ? `Thiếu: <b class="ghn-tg-shortage">${stats.hubThieu}</b> (NV)` : `<span class="ghn-tg-ok">✓ Đủ định biên</span>`}</div>
                    ${unassignedNote}
                </div>
                <div class="ghn-tg-hub-staffing-title" style="margin-top: 8px;">Theo từng xã/phường</div>
                ${wardsTableOrEmpty}
            `;
        }

        return `
            <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; min-width: 220px;">
                <div style="font-weight: 700; font-size: 14px; color: ${GHN_BLUE}; margin-bottom: 2px;">🏢 ${props.name || ''}</div>
                <div style="font-size: 12px; color: #6c757d; margin-bottom: 8px;">${props.province || ''} · ${props.region || ''} · ${props.n_wards || 0} phường phụ trách · ${props.staff || 0} nhân viên</div>
                <div style="font-size: 13px; color: #333; line-height: 1.6;">
                    <div>📫 <b>Tổng Lấy:</b> ${(props.pv || 0).toLocaleString()} đơn · ${(props.pw || 0).toLocaleString()} kg</div>
                    <div>📦 <b>Tổng Giao:</b> ${(props.dv || 0).toLocaleString()} đơn · ${(props.dw || 0).toLocaleString()} kg</div>
                    <div>🏘️ <b>Tổng xã/phường phụ trách:</b> ${props.n_wards || 0}</div>
                    ${gtcLtcHtml}
                </div>
                <div class="ghn-tg-hub-staffing-block">
                    ${staffingHtml}
                </div>
                <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #dee2e6; font-size: 11px; color: #495057;">
                    ⬛ Đã tô viền đen dày quanh các phường thuộc lãnh thổ bưu cục này trên bản đồ.
                </div>
            </div>
        `;
    }

    // v1.7.14 — "kỹ thuật lọc, sắp xếp được trong chính bảng này": gắn sự kiện lọc (ô tìm theo
    // tên xã/phường) + sắp xếp (bấm tiêu đề cột, đảo chiều asc/desc mỗi lần bấm lại cùng cột)
    // cho bảng "Theo từng xã/phường" ở popup bưu cục (hubPopupHtml_). Gọi NGAY SAU
    // showInfoPanel_(hubPopupHtml_(...)) ở nơi mở popup (chỉ 1 chỗ, xem initMap_/click hubs-
    // points) — an toàn gọi cả khi bảng không tồn tại trong panel đang hiện (VD popup xã/
    // phường/nhân viên khác) vì luôn getElementById + return sớm nếu không thấy. KHÔNG dùng
    // framework nào — panel này chỉ set lại bằng innerHTML mỗi lần mở popup (xem showInfoPanel_)
    // nên chỉ cần thao tác DOM thuần, không cần dọn listener cũ (nút DOM cũ đã bị innerHTML=...
    // huỷ theo cùng lúc).
    function wireHubStaffingTable_() {
        // v1.7.23 — nút "+" khối giải thích cách tính Định biên (mặc định ẩn, xem unassignedNote ở
        // hubPopupHtml_). Wiring TÁCH RIÊNG khỏi phần bảng xã/phường bên dưới (return sớm nếu
        // KHÔNG có bảng xã/phường — VD bưu cục chưa ghi nhận đơn Giao TC nào trong khoảng ngày
        // đang xem) — nút "+" này vẫn phải hoạt động bình thường trong trường hợp đó nếu popup có.
        const backlogToggleBtn = document.getElementById('ghn-tg-backlog-toggle-btn');
        const backlogDetail = document.getElementById('ghn-tg-backlog-detail');
        if (backlogToggleBtn && backlogDetail) {
            backlogToggleBtn.addEventListener('click', () => {
                const isHidden = backlogDetail.style.display === 'none';
                backlogDetail.style.display = isHidden ? '' : 'none';
                backlogToggleBtn.textContent = isHidden ? '🔽 Ẩn chi tiết cách tính Định biên' : '🔍 Xem chi tiết cách tính Định biên';
            });
        }

        const table = document.getElementById('ghn-tg-ward-staffing-table');
        if (!table) return;
        const tbody = table.querySelector('tbody');
        const searchInput = document.getElementById('ghn-tg-ward-table-search');
        let sortState = { key: null, dir: 1 };

        function applyFilter_() {
            const q = ((searchInput && searchInput.value) || '').trim().toLowerCase();
            Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
                const name = (tr.dataset.wardname || '').toLowerCase();
                tr.style.display = (!q || name.includes(q)) ? '' : 'none';
            });
        }

        function applySort_(key, type) {
            const dir = (sortState.key === key) ? -sortState.dir : 1;
            sortState = { key, dir };
            const rows = Array.from(tbody.querySelectorAll('tr'));
            rows.sort((a, b) => {
                if (type === 'num') {
                    const va = parseFloat(a.dataset[key]) || 0, vb = parseFloat(b.dataset[key]) || 0;
                    return (va - vb) * dir;
                }
                return String(a.dataset[key] || '').localeCompare(String(b.dataset[key] || '')) * dir;
            });
            rows.forEach(tr => tbody.appendChild(tr)); // appendChild lại 1 node ĐÃ có trong DOM = DI CHUYỂN nó, không nhân đôi.
            table.querySelectorAll('thead th[data-sort]').forEach(th => {
                th.classList.remove('ghn-tg-sort-asc', 'ghn-tg-sort-desc');
                if (th.dataset.sort === key) th.classList.add(dir === 1 ? 'ghn-tg-sort-asc' : 'ghn-tg-sort-desc');
            });
        }

        if (searchInput) searchInput.addEventListener('input', applyFilter_);
        table.querySelectorAll('thead th[data-sort]').forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => applySort_(th.dataset.sort, th.dataset.type));
        });
    }

    const STATUS_LABEL_ = {
        red_over: '🔴 Quá tải', red_under: '🔴 Không đủ đơn', red: '🔴 Quá tải',
        yellow: '🟡 Trung bình', green: '🟢 Bình thường'
    };
    const RING_LABEL_ = { over: '🟡 Vòng vàng = Giao quá tải', under: '🔵 Vòng xanh dương = Giao không đủ đơn', pickup_over: '🟠 Vòng cam = Lấy quá tải', none: '' };

    // ==================== TRẠNG THÁI NHÂN SỰ (v1.7.5, đọc CHỈ ĐỌC từ sheet "HRM") ====================
    // Người dùng phản ánh: nhân viên ĐÃ NGHỈ VIỆC vẫn hiện chấm/tên trên bản đồ (vì vẫn có
    // chuyến đi phát sinh trong khoảng ngày đang xem) — cần phân biệt rõ bằng màu xám +
    // hiện trạng thái ngay cạnh tên, đồng thời bổ sung trạng thái làm việc/ngày vào làm/
    // thâm niên cho MỌI nhân viên xuất hiện trên tuyến giao (popup bản đồ) và trong bảng
    // "Theo Nhân Viên". Sheet "HRM" đã có sẵn (người dùng tự nhập/quản lý bên ngoài modul),
    // cột A:N — module này chỉ ĐỌC (action=getHrm trong GAS_TUYEN_GIAO.gs), KHÔNG BAO GIỜ
    // ghi gì vào sheet đó. Khớp với dữ liệu chuyến qua cột A "ID" == driverId (GHN trả về
    // trong chi tiết chuyến, xem fetchStaffVolumeRows_) — CÙNG hệ mã nhân viên nội bộ GHN,
    // đã xác nhận với người dùng.
    const HRM_STATUS_META_ = {
        ACTIVE: { code: 'ACTIVE', label: 'Đang làm việc', color: '#2e7d32', dot: '🟢' },
        ON_LEAVE: { code: 'ON_LEAVE', label: 'Tạm nghỉ', color: '#c62828', dot: '🔴' },
        // "màu đen xám" theo đúng yêu cầu — dùng #495057 (khớp tông xám-đen đã dùng cho
        // text-halo/label phụ trong modul, không dùng đen tuyệt đối #000 vì chói trên nền
        // bản đồ sáng).
        RESIGNED: { code: 'RESIGNED', label: 'Nghỉ việc', color: '#495057', dot: '⚫' }
    };

    // Chuẩn hoá text trạng thái tự do trong sheet ("Đang làm việc"/"Nghỉ việc"/"Tạm nghỉ",
    // có thể lẫn khoảng trắng/viết hoa khác nhau) về 1 trong 3 mã cố định. Bất kỳ giá trị
    // lạ/rỗng nào KHÔNG nhận diện được đều mặc định về ACTIVE — AN TOÀN theo hướng không tô
    // nhầm 1 nhân viên đang làm việc bình thường thành "đã nghỉ" chỉ vì lỗi chính tả trong
    // sheet nguồn.
    function normalizeHrmTrangThai_(raw) {
        const s = String(raw || '').trim();
        if (/nghỉ\s*việc/i.test(s)) return 'RESIGNED';
        if (/tạm\s*nghỉ/i.test(s)) return 'ON_LEAVE';
        return 'ACTIVE';
    }

    function hrmRecordForDriverId_(driverId) {
        if (!driverId || !state.hrmByDriverId) return null;
        return state.hrmByDriverId[String(driverId).trim()] || null;
    }

    // v1.7.13 — Tra MÃ BƯU CỤC "nhà" (buuCuc, cột trong sheet HRM) của 1 driverId, dùng để
    // đối chiếu "Hiện có" của bưu cục/xã-phường ĐANG XEM có đúng là bưu cục nhân viên đó
    // THUỘC BIÊN CHẾ hay không — KHÁC với "có dữ liệu tuyến giao dưới bưu cục nào" (có thể là
    // đang "đi hỗ trợ" bưu cục khác tạm thời, xem computeHubStaffingStats_). Cùng cách tách
    // "hub_code - hub_name" đã dùng sẵn ở hubHeadcountRoster (không lặp logic khác nhau ở 2
    // nơi). Trả về null nếu KHÔNG có dữ liệu HRM cho driverId này (không tra được — xem nơi
    // gọi để biết cách xử lý khi không xác định được, tránh loại nhầm người khi thiếu dữ liệu).
    function hrmHomeHubCode_(driverId) {
        const rec = hrmRecordForDriverId_(driverId);
        if (!rec) return null;
        const bc = String(rec.buuCuc || '').split(' - ')[0].trim();
        return bc || null;
    }

    // v1.7.13 — Phân loại "trạng thái làm việc" của 1 (nhân viên, ngày) — DÙNG CHUNG 1 định
    // nghĩa với belongsToThisHub_ (computeHubStaffingStats_) để 2 chỗ không lệch nhau: yêu cầu
    // mới thêm bộ lọc HIỂN THỊ TÊN trên bản đồ theo 4 nhóm — 'ACTIVE' (Đang làm việc),
    // 'RESIGNED' (Nghỉ việc), 'ON_LEAVE' (Tạm Nghỉ), và 'SUPPORT' (Hỗ trợ/Điều chuyển — nhân
    // viên đang làm việc bình thường (KHÔNG nghỉ) nhưng có dữ liệu chuyến dưới bưu cục hubId
    // này trong khi buuCuc theo HRM lại là bưu cục KHÁC — đúng ví dụ "Vi Trường An" đã sửa ở
    // "Hiện có"). hrmDisplay truyền vào PHẢI là kết quả resolveHrmDisplay_(driverId) đã tính
    // sẵn ở nơi gọi (tránh tra HRM 2 lần cho cùng 1 người).
    function staffWorkStatusCategory_(hrmDisplay, driverId, hubId) {
        if (hrmDisplay && hrmDisplay.code === 'RESIGNED') return 'RESIGNED';
        if (hrmDisplay && hrmDisplay.code === 'ON_LEAVE') return 'ON_LEAVE';
        const home = hrmHomeHubCode_(driverId);
        if (home !== null && home !== String(hubId)) return 'SUPPORT';
        return 'ACTIVE';
    }

    // "X năm Y tháng" tính từ ngày vào làm tới ngày MỐC (ngày nghỉ việc nếu đã nghỉ/tạm
    // nghỉ, nếu không thì tới HÔM NAY) — KHÔNG dùng lại cột M "Thâm niên" có sẵn trong sheet
    // HRM (đó là MÃ BẬC nội bộ dạng "G01: Dưới 1 tháng", không phải định dạng "số Năm, số
    // tháng" người dùng yêu cầu) — tự tính lại từ ngày vào làm nên LUÔN đúng thời gian thực
    // với nhân viên đang làm việc (không cần đồng bộ lại sheet HRM mỗi ngày để cập nhật).
    function formatSeniority_(startDate, endDate) {
        if (!(startDate instanceof Date) || isNaN(startDate.getTime())) return null;
        const end = (endDate instanceof Date && !isNaN(endDate.getTime())) ? endDate : new Date();
        if (end < startDate) return 'Dưới 1 tháng'; // dữ liệu ngày lệch (hiếm) -> an toàn, không hiện số âm
        let years = end.getFullYear() - startDate.getFullYear();
        let months = end.getMonth() - startDate.getMonth();
        if (end.getDate() < startDate.getDate()) months -= 1;
        if (months < 0) { years -= 1; months += 12; }
        if (years <= 0 && months <= 0) return 'Dưới 1 tháng';
        const parts = [];
        if (years > 0) parts.push(`${years} năm`);
        if (months > 0) parts.push(`${months} tháng`);
        return parts.join(' ');
    }

    // Gộp toàn bộ thông tin HRM cần hiển thị cho 1 driverId thành 1 object gọn — DÙNG
    // CHUNG cho cả popup bản đồ (staffDotPopupHtml_) lẫn bảng "Theo Nhân Viên"
    // (renderStaffTable_) lẫn override màu chấm/tên (computeStaffTerritories_), tránh lặp
    // logic tính thâm niên/màu sắc ở nhiều nơi khác nhau rồi lệch nhau.
    function resolveHrmDisplay_(driverId) {
        const rec = hrmRecordForDriverId_(driverId);
        if (!rec) {
            return {
                found: false, code: null, label: '(chưa có dữ liệu nhân sự)', color: '#adb5bd', dotIcon: '',
                isInactive: false, startDateText: '', seniorityText: '', trangThaiRaw: ''
            };
        }
        const code = normalizeHrmTrangThai_(rec.trangThai);
        const meta = HRM_STATUS_META_[code];
        const startDate = rec.ngayVaoLam ? new Date(rec.ngayVaoLam) : null;
        const endDate = (code !== 'ACTIVE' && rec.ngayNghiViec) ? new Date(rec.ngayNghiViec) : null;
        const seniorityText = formatSeniority_(startDate, endDate) || '';
        return {
            found: true,
            code,
            label: meta.label,
            color: meta.color,
            dotIcon: meta.dot,
            isInactive: code !== 'ACTIVE',
            startDateText: (startDate && !isNaN(startDate.getTime())) ? startDate.toLocaleDateString('vi-VN') : '',
            seniorityText,
            trangThaiRaw: rec.trangThai || ''
        };
    }

    // v1.7.22 — resolveHrmDisplay_().isInactive dùng TRẠNG THÁI HIỆN TẠI (tại thời điểm đồng bộ
    // sheet HRM gần nhất) — ĐÚNG cho hiển thị chung (popup chấm/tên trên bản đồ, bảng
    // "Theo Nhân Viên"...) nhưng SAI khi dùng để tính "Hiện có" (đang đi làm) của MỘT NGÀY CỤ THỂ
    // trong quá khứ đang xem: 1 nhân viên ĐÃ nghỉ việc ở thời điểm HIỆN TẠI vẫn phải được tính là
    // "đang đi làm" cho những ngày TRƯỚC/ĐÚNG ngày họ nghỉ (họ THẬT SỰ có đi làm ngày đó), CHỈ loại
    // khỏi "Hiện có" cho những ngày SAU ngày họ đã nghỉ. Phản hồi thật: "định biên này => số lượng
    // nhân sự có cần phải so Ngày đang xem dữ liệu và Ngày nghỉ của nhân viên => để hiển thị cho
    // đúng ví dụ tao đang xem ngày 15/8 => nếu nhân viên có ngày nghỉ sau ngày đang xem thì người
    // đó vẫn được tính là nhân viên đi làm chứ? còn nhân viên mà nghỉ trước ngày đang xem thì mới
    // không tính là nhân viên hiện có". Hàm này CHỈ dùng cho tính "Hiện có" theo NGÀY CỤ THỂ
    // (computeHubStaffingStats_/workingStaffKeys + wardHeadcount) — resolveHrmDisplay_() (hiển thị
    // chung, KHÔNG gắn với 1 ngày cụ thể) giữ NGUYÊN không đổi.
    function isHrmInactiveOnDate_(driverId, tripDateStr) {
        const rec = hrmRecordForDriverId_(driverId);
        if (!rec) return false; // không tra được HRM -> không đủ căn cứ để loại (an toàn, giống hành vi cũ)
        if (normalizeHrmTrangThai_(rec.trangThai) === 'ACTIVE') return false; // hiện đang làm việc bình thường -> chắc chắn không loại
        if (!rec.ngayNghiViec || !tripDateStr) return true; // đã nghỉ nhưng KHÔNG rõ ngày nghỉ cụ thể (hoặc dòng dữ liệu thiếu tripDate) -> an toàn theo hành vi CŨ (loại, tránh đếm THỪA người đã nghỉ từ rất lâu)
        const leaveDate = new Date(rec.ngayNghiViec);
        const tripDate = new Date(tripDateStr);
        if (isNaN(leaveDate.getTime()) || isNaN(tripDate.getTime())) return true; // dữ liệu ngày lỗi -> an toàn theo hành vi cũ
        // Ngày đang xem SAU ngày nghỉ -> lúc đó đã thật sự nghỉ rồi -> LOẠI. Ngày đang xem TRƯỚC
        // HOẶC ĐÚNG ngày nghỉ -> lúc đó vẫn đang đi làm thật -> KHÔNG loại (đúng ngày nghỉ = ngày
        // làm việc cuối, vẫn tính là "có đi làm" ngày đó — an toàn theo hướng không loại nhầm).
        return tripDate > leaveDate;
    }

    // Popup chấm/ranh giới nhân viên — hiện ĐẦY ĐỦ số liệu + ngưỡng đang áp dụng để
    // người xem tự kiểm chứng lại thuật toán (không "tin mù" vào màu chấm) — đúng tinh
    // thần đã yêu cầu ở các popup khác của modul này.
    // TỪ v1.6.0: 1 popup = 1 TUYẾN GIAO đầy đủ của nhân viên trong ngày (không phải 1
    // xã/phường lẻ như v1.5.5) — props.wards là mảng TẤT CẢ xã/phường thuộc tuyến giao
    // đó (đạt ≥15%, xã/phường đầu tiên = CHÍNH, nơi đặt chấm/tên), mỗi phần tử có số đơn/
    // trạng thái RIÊNG. Bấm vào chấm HOẶC bất kỳ xã/phường nào có viền tô của nhân viên
    // này trên bản đồ đều ra ĐÚNG popup này (xem map.on('click') trong initMap_()).
    // v1.7.2 — 2 THAY ĐỔI theo phản hồi thực tế:
    // 1) Dòng đầu ("Giao cả tuyến") trước đây ghi "→ nặng nhất: ..." (lấy trạng thái xấu
    //    nhất trong số các xã/phường thành phần) — giờ đã SỬA Ở computeStaffTerritories_()
    //    để tính trên TỔNG đơn giao cả tuyến (không còn theo "nặng nhất từng xã/phường"
    //    nữa), nên bỏ chữ "nặng nhất" (gây hiểu lầm là vẫn lấy max) + bỏ luôn tag trạng thái
    //    RIÊNG ở mỗi dòng xã/phường bên dưới (props.wards không còn field giaoStatus) — chỉ
    //    còn ĐÚNG 1 kết luận duy nhất ở dòng đầu, mỗi xã/phường chỉ còn hiện số liệu/% đóng
    //    góp, không tự gắn nhãn "quá tải/thiếu đơn" of riêng nó nữa (từng gây hiểu lầm nghiêm
    //    trọng — 1 xã/phường PHỤ chỉ nhận 21% đơn NGÀY NÀO CŨNG sẽ trông "thiếu đơn" nếu so
    //    riêng, dù tuyến đó không hề thiếu việc).
    // 2) Bỏ khối ghi chú kỹ thuật (chữ nhỏ, cuối popup) theo yêu cầu — không cần thiết cho
    //    người dùng cuối, chỉ làm popup dài/rối.
    function staffDotPopupHtml_(props) {
        const wardsLines = (props.wards || []).map(w => {
            const pct = Math.round(w.wardShare * 100);
            const successPct = w.giaoCount > 0 ? Math.round((w.giaoSuccess / w.giaoCount) * 100) : 0;
            const tag = w.isPrimary ? ' 🏆 (chính — đặt chấm/tên tại đây)' : ' (phụ)';
            const dk = qhKmDist_(props.hubId, 'BC', w.wardCode);
            const kmTxt = dk.km !== null ? ` · cách BC ${qhKmFmt_(dk.km)} km${dk.road ? '' : ' (chim bay)'}` : '';
            return `<div>&nbsp;&nbsp;• <b>${w.wardName}</b>${tag}: ${w.giaoSuccess}/${w.giaoCount} đơn thành công (${successPct}%) · ${pct}% tổng đơn ngày${kmTxt}</div>`;
        }).join('');
        // v1.7.4 — khi gộp NHIỀU NGÀY (props.dayCount > 1), hiện THÊM "TB X đơn/ngày (gộp N
        // ngày)" ngay sau tổng số thô — trạng thái quá tải/thiếu đơn ở cuối dòng giờ tính
        // trên đúng con số trung bình này (xem computeStaffTerritories_), không phải tổng
        // cộng dồn — để người xem hiểu ĐÚNG vì sao ra kết luận đó, không tưởng nhầm là tính
        // trên tổng như trước.
        const avgSuffix = (props.dayCount && props.dayCount > 1)
            ? ` (TB ${props.dayTotalGiaoAvg} đơn/ngày, gộp ${props.dayCount} ngày)`
            : '';
        const giaoLine = `📦 <b>Giao (cả tuyến, ${props.wardCount} xã/phường):</b> ${props.dayTotalGiaoSuccess}/${props.dayTotalGiao} đơn thành công${avgSuffix} → ${STATUS_LABEL_[props.giaoStatus] || props.giaoStatus}`;
        const kmA = qhKmStaffAvg_(props.staffKey, props.hubId);
        const kmLine = kmA ? `🛣️ <b>Km giao ước tính:</b> ${qhKmFmt_(kmA.km)} km${kmA.n > 1 ? '/ngày (TB ' + kmA.n + ' ngày)' : ''}${kmA.road ? '' : ' (chim bay)'} — bưu cục → các xã/phường có đơn → về bưu cục` : '';
        const pickLine = props.hasPick
            ? `📫 <b>Lấy:</b> ${props.pickCount}/${props.pickTotal} đơn thành công (${props.pickSuccessPct}%) · chiếm ${props.pickSharePct}% (${props.pickCount}/${props.pickHubTotal}) tổng lấy thành công CẢ bưu cục → ${STATUS_LABEL_[props.pickStatus] || props.pickStatus}`
            : `📫 <b>Lấy:</b> không có đơn lấy thành công nào trong ngày.`;
        const groupLine = `🏷️ <b>Nhóm khách hàng (đơn giao):</b> TikTok Shop (TTS): ${props.groupTTS} đơn · Shopee: ${props.groupShopee} đơn · SME: ${props.groupSME} đơn · Khác: ${props.groupKhac} đơn`;
        // v1.7.3: dòng mirror cho ĐƠN LẤY (theo yêu cầu bổ sung) — cùng định dạng với dòng
        // "đơn giao" ở trên, chỉ khác nguồn dữ liệu (pickGroupTTS/Shopee/SME/Khac, đếm TẤT
        // CẢ đơn lấy — không chỉ đơn thành công — đúng cách đếm groupLine đơn giao đang dùng
        // ở trên, xem computePickShareByStaff_() -> v.groupCounts).
        const groupLine2 = `🏷️ <b>Nhóm khách hàng (đơn lấy):</b> TikTok Shop (TTS): ${props.pickGroupTTS} đơn · Shopee: ${props.pickGroupShopee} đơn · SME: ${props.pickGroupSME} đơn · Khác: ${props.pickGroupKhac} đơn`;
        // v1.7.5 — dòng TRẠNG THÁI NHÂN SỰ (HRM): trạng thái làm việc (màu theo yêu cầu —
        // Đang làm việc=xanh lá, Tạm nghỉ=đỏ, Nghỉ việc=đen xám) + ngày vào làm + thâm niên
        // (tự tính "X năm Y tháng" từ ngày vào làm, xem formatSeniority_) — hiện cho MỌI
        // nhân viên trên tuyến giao, không chỉ người đã nghỉ. Không tìm thấy trong sheet HRM
        // (VD nhân viên mới, chưa kịp cập nhật sheet) -> hiện ghi chú xám nhạt, không chặn gì.
        const hrm = props.hrmStatus || { found: false, label: '(chưa có dữ liệu nhân sự)', color: '#adb5bd', dotIcon: '', startDateText: '', seniorityText: '' };
        const hrmExtra = [hrm.startDateText ? `Vào làm: ${hrm.startDateText}` : '', hrm.seniorityText ? `Thâm niên: ${hrm.seniorityText}` : '']
            .filter(Boolean).join(' · ');
        const hrmLine = `👔 <b>Trạng thái NV:</b> <span style="color:${hrm.color}; font-weight:700;">${hrm.dotIcon} ${hrm.label}</span>${hrmExtra ? ' · ' + hrmExtra : ''}`;
        // v1.7.13 — dòng "Đi hỗ trợ" khi workStatusCategory === 'SUPPORT' (nhân viên có
        // chuyến ở bưu cục ĐANG XEM (props.hubName) nhưng buuCuc theo HRM lại là bưu cục
        // KHÁC — xem staffWorkStatusCategory_/computeHubStaffingStats_) — hiện RÕ tên bưu cục
        // "nhà" để người xem biết ngay không nên tính nhân viên này vào biên chế bưu cục đang
        // xem, đúng ví dụ thật "Vi Trường An" đã báo.
        const supportLine = (props.workStatusCategory === 'SUPPORT')
            ? `<div style="font-size: 11px; margin-bottom: 8px; color:#e8590c; font-weight:700;">🔀 Đi hỗ trợ — thuộc biên chế bưu cục <b>${hubNameForStaffTable_(props.homeHubCode)}</b> (không tính vào "Hiện có" của ${props.hubName})</div>`
            : '';
        return `
            <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; min-width: 280px; max-width: 320px;">
                <div style="font-weight: 700; font-size: 14px; color: #212529; margin-bottom: 2px;">👤 ${props.driverLabelText || props.driverName}</div>
                <div style="font-size: 11px; color: #6c757d; margin-bottom: 4px;">${props.hubName} · ${props.tripDate}</div>
                <div style="font-size: 11px; margin-bottom: 8px;">${hrmLine}</div>
                ${supportLine}
                <div style="font-size: 12px; color: #333; line-height: 1.7;">
                    <div>${giaoLine}</div>
                    <div style="font-size:11px; color:#495057;">${wardsLines}</div>
                    ${kmLine ? `<div style="color:#1c4f9c;">${kmLine}</div>` : ''}
                    <div style="margin-top:4px;">${pickLine}</div>
                    <div>${groupLine}</div>
                    <div>${groupLine2}</div>
                    ${props.ringType !== 'none' ? `<div style="margin-top:4px;">${RING_LABEL_[props.ringType]}</div>` : ''}
                </div>
            </div>
        `;
    }

    // ==================== KHỞI TẠO BẢN ĐỒ ====================
    function initMap_(containerEl) {
        const map = new maplibregl.Map({
            container: containerEl,
            style: 'https://tiles.openfreemap.org/styles/positron',
            center: [105.8, 21.0],
            zoom: 5.2
        });
        state.map = map;

        // Đặt nút zoom +/- ở GÓC DƯỚI-PHẢI (không phải top-right mặc định) — vì panel
        // thông tin cố định (mục 2, v1.3.0) giờ chiếm luôn góc trên-phải bản đồ, để
        // mặc định sẽ bị đè lên nhau.
        map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

        map.on('load', () => {
            // ---- Lớp CHÍNH: ranh giới CŨ + số liệu (tô màu + popup) ----
            map.addSource('wards', { type: 'geojson', data: state.wardsOldEnriched });
            map.addLayer({
                id: 'wards-fill',
                type: 'fill',
                source: 'wards',
                paint: { 'fill-color': '#a0a0a0', 'fill-opacity': 0.65 }
            });
            map.addLayer({
                id: 'wards-line',
                type: 'line',
                source: 'wards',
                paint: { 'line-color': '#4a4a4a', 'line-width': 0.9, 'line-opacity': 0.9 }
            });
            // ---- Nhãn tên phường CŨ (mặc định TẮT — bật qua checkbox "Nhãn phường cũ") ----
            map.addLayer({
                id: 'wards-old-labels',
                type: 'symbol',
                source: 'wards',
                // v1.7.8 — GIỚI HẠN ZOOM (phản hồi "màn hình bản đồ zoom to lên nhìn rối quá",
                // ảnh chụp: hàng chục nhãn phường chồng chéo khi xem cả 1 vùng/tỉnh). Trước
                // đây lớp này LUÔN vẽ ở MỌI mức zoom hễ checkbox "Phường cũ" bật — với 771
                // phường trên toàn vùng, xem ở zoom thấp (toàn tỉnh/vùng) chắc chắn chồng chữ
                // dày đặc không đọc nổi, dù MapLibre đã tự né chữ chồng nhau (mỗi ô chỉ hiện 1
                // tên, còn lại tự ẩn) thì cũng ẩn LOẠN XẠ không theo quy luật, nhìn vẫn "rối".
                // SỬA theo đúng gợi ý người dùng "zoom to hiển thị tên tỉnh (nền bản đồ nguồn
                // đã tự có), zoom dần vào thì tên bưu cục, ... nhãn không chèn lên nhau" —
                // minzoom: 11 nghĩa là nhãn phường CŨ chỉ bắt đầu vẽ khi đã zoom đủ gần tới
                // mức quận/huyện/cụm phường (không còn hàng trăm phường cùng lọt vào khung
                // hình 1 lúc nữa) — xem thêm 'hubs-labels' (minzoom 8, hiện sớm hơn vì chỉ có
                // 59 bưu cục) và 'staff-territory-label-text' (minzoom 8) bên dưới.
                minzoom: 11,
                layout: {
                    'text-field': ['get', 'name'],
                    'text-font': ['Noto Sans Regular'],
                    // v1.7.3: text-size CỐ ĐỊNH theo px không tự lớn lên khi zoom to (chỉ có
                    // hình khối/bản đồ phóng to, chữ vẫn y nguyên kích thước cũ) -> tên
                    // phường trông "không đầy đủ"/khó đọc so với tỉ lệ đã phóng to. Đổi
                    // sang biểu thức interpolate theo zoom để chữ LỚN DẦN khi zoom to, và
                    // nới text-max-width để tên dài xuống dòng thoáng hơn thay vì bị bó hẹp.
                    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9, 12, 11, 16, 15],
                    'text-max-width': 12,
                    // v1.7.6 — lớp này add TRƯỚC lớp nhãn tên nhân viên ('staff-territory-
                    // label-text') nên mặc định MapLibre coi lớp này chiếm chỗ trước, khiến
                    // nhãn nhân viên add SAU bị nhường/ẩn khi va chạm (lỗi v1.7.4). Đánh dấu
                    // 'text-ignore-placement': true để lớp NHÃN PHƯỜNG này không còn "chặn
                    // chỗ" của các lớp add SAU nữa (nhãn nhân viên giờ được ưu tiên tuyệt đối
                    // so với nhãn phường) — xem giải thích đầy đủ ở lớp 'staff-territory-label-
                    // text' bên dưới.
                    'text-ignore-placement': true,
                    'visibility': state.showOldWardLabels ? 'visible' : 'none'
                },
                paint: {
                    'text-color': '#343a40',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.2
                }
            });

            // ---- Lớp VIỀN + VÙNG BẤM ranh giới MỚI (tham khảo, gộp số liệu qua rezone.json) ----
            map.addSource('wards-new', { type: 'geojson', data: state.wardsNewRaw || { type: 'FeatureCollection', features: [] } });
            // Lớp "fill" trong suốt (opacity 0) chỉ để BẮT ĐƯỢC click ở BẤT KỲ ĐÂU bên
            // trong phường mới (không chỉ đúng viền như bản trước) — vẫn phải là 1 lớp
            // fill để MapLibre query trúng toàn bộ diện tích polygon, không chỉ đường viền.
            map.addLayer({
                id: 'wards-new-fill',
                type: 'fill',
                source: 'wards-new',
                paint: { 'fill-color': '#e31a1c', 'fill-opacity': 0 },
                layout: { visibility: state.showNewBoundary ? 'visible' : 'none' }
            });
            map.addLayer({
                id: 'wards-new-line',
                type: 'line',
                source: 'wards-new',
                paint: { 'line-color': '#e31a1c', 'line-width': 2.2, 'line-opacity': 0.85 },
                layout: { visibility: state.showNewBoundary ? 'visible' : 'none' }
            });
            // ---- Nhãn tên phường MỚI (mặc định TẮT — bật qua checkbox "Nhãn phường mới") ----
            map.addLayer({
                id: 'wards-new-labels',
                type: 'symbol',
                source: 'wards-new',
                // v1.7.8: xem giải thích ở lớp 'wards-old-labels' phía trên — cùng cách sửa.
                minzoom: 11,
                layout: {
                    'text-field': ['get', 'name'],
                    'text-font': ['Noto Sans Bold'],
                    // v1.7.3: xem giải thích ở lớp 'wards-old-labels' phía trên — cùng cách sửa.
                    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9, 12, 11, 16, 15],
                    'text-max-width': 12,
                    // v1.7.6: xem giải thích ở lớp 'wards-old-labels' phía trên — cùng cách sửa
                    // (không chặn chỗ của nhãn tên nhân viên add sau).
                    'text-ignore-placement': true,
                    'visibility': state.showNewWardLabels ? 'visible' : 'none'
                },
                paint: {
                    'text-color': '#de2d26',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.2
                }
            });

            // ---- Lớp HIGHLIGHT: phường CŨ đang chọn (viền vàng dày) ----
            map.addLayer({
                id: 'wards-selected-line',
                type: 'line',
                source: 'wards',
                paint: { 'line-color': '#ffd600', 'line-width': 4.5, 'line-opacity': 1 },
                filter: ['==', ['get', 'ward_code'], NO_MATCH_TOKEN]
            });

            // ---- Lớp HIGHLIGHT: lãnh thổ bưu cục đang chọn (viền đen dày) ----
            map.addLayer({
                id: 'wards-hub-highlight-line',
                type: 'line',
                source: 'wards',
                paint: { 'line-color': '#000000', 'line-width': 4, 'line-opacity': 0.9 },
                filter: ['==', ['get', 'delivery_hub'], NO_MATCH_TOKEN]
            });

            // ---- Lớp HIGHLIGHT: phường MỚI đang chọn (viền xanh dương dày) ----
            map.addLayer({
                id: 'wards-new-selected-line',
                type: 'line',
                source: 'wards-new',
                paint: { 'line-color': '#1e88e5', 'line-width': 4.5, 'line-opacity': 1 },
                filter: ['==', ['get', 'new_ward_code'], NO_MATCH_TOKEN],
                layout: { visibility: state.showNewBoundary ? 'visible' : 'none' }
            });

            // ---- Marker bưu cục (trên cùng) ----
            map.addSource('hubs', { type: 'geojson', data: hubsToPointsGeoJson_() });
            map.addLayer({
                id: 'hubs-points',
                type: 'circle',
                source: 'hubs',
                paint: {
                    'circle-radius': 5,
                    'circle-color': GHN_ORANGE,
                    'circle-stroke-width': 1.5,
                    'circle-stroke-color': '#ffffff'
                }
            });
            // ---- Nhãn tên bưu cục (mặc định BẬT) ----
            map.addLayer({
                id: 'hubs-labels',
                type: 'symbol',
                source: 'hubs',
                // v1.7.8 — LỖI THẬT phát hiện qua ảnh chụp: ghi chú cũ "ít, không rối" chỉ
                // đúng khi xem 1 bưu cục/khu vực nhỏ — thực tế người dùng mở modul ở mức zoom
                // TOÀN VÙNG (nhiều tỉnh) thì 59 tên bưu cục cùng lúc lọt vào khung hình vẫn
                // chồng chéo rối mắt y hệt nhãn phường. minzoom: 8 — chỉ vẽ tên bưu cục khi đã
                // zoom đủ gần tới mức tỉnh/nhóm huyện trở lên; xem 'wards-old-labels' phía
                // trên (minzoom 11, hiện muộn hơn vì 771 phường nhiều gấp hơn chục lần).
                minzoom: 8,
                layout: {
                    'text-field': ['get', 'name'],
                    'text-font': ['Noto Sans Bold'],
                    // v1.7.3: xem giải thích ở lớp 'wards-old-labels' phía trên — cùng cách sửa.
                    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9, 12, 11, 16, 15],
                    'text-max-width': 12,
                    'text-offset': [0, 0.9],
                    'text-anchor': 'top',
                    // v1.7.6: xem giải thích ở lớp 'wards-old-labels' phía trên — cùng cách sửa
                    // (không chặn chỗ của nhãn tên nhân viên add sau).
                    'text-ignore-placement': true,
                    'visibility': state.showHubLabels ? 'visible' : 'none'
                },
                paint: {
                    'text-color': GHN_BLUE,
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.4
                }
            });

            // ---- Ranh giới TUYẾN GIAO nhân viên (v1.6.0) — TẤT CẢ xã/phường thuộc tuyến
            // giao của từng nhân viên/ngày (đạt ≥15%), tô viền theo màu trạng thái (giống
            // màu chấm) để BIẾT BẰNG MẮT tuyến giao gồm những xã/phường nào, không chỉ 1
            // điểm chấm — đúng yêu cầu "nhìn vào sẽ thấy được tuyến giao ... có ranh giới".
            // SỬA ở v1.6.1 (lỗi người dùng phát hiện: bật tuyến giao lên là KHÔNG bấm chọn
            // được xã/phường bên dưới nữa): v1.6.0 dùng 1 lớp fill TRONG SUỐT phủ NGUYÊN
            // CẢ xã/phường để bắt click — vô tình chặn luôn mọi click vào phần GIỮA xã/
            // phường đó (chỉ còn bấm được vào phần KHÔNG có tuyến giao nào phủ lên). Đổi
            // sang lớp "hitline" — 1 đường line TRONG SUỐT nhưng RỘNG (chỉ để bắt click,
            // không vẽ ra gì) chạy DỌC THEO đúng viền tuyến giao — bấm ĐÚNG VÀO/GẦN viền
            // (chính hoặc phụ) mới ra popup nhân viên, bấm vào PHẦN GIỮA xã/phường (dù xã/
            // phường đó có đang thuộc tuyến giao ai đó) vẫn rơi xuống đúng lớp xã/phường
            // như bình thường — giải quyết đúng gốc vấn đề "chồng lớp" thay vì né tránh.
            map.addSource('staff-territory', { type: 'geojson', data: state.staffTerritoryFeatures });

            // ---- "Vùng giao thực tế" — GHÉP MÚI theo % thật + hướng GPS (v1.6.2, xem
            // changelog computeStaffTerritoryShapes_ để biết chi tiết kỹ thuật). Xã/phường
            // CHÍNH giữ nguyên 100%, xã/phường PHỤ cắt múi đúng % thực tế của nhân viên tại
            // đó, GHÉP LIỀN (turf.union) thành 1 hình/nhân viên/ngày. Vẽ TRƯỚC lớp ranh giới
            // hành chính để viền hành chính luôn nổi rõ lên trên phần fill mờ này. Lớp này
            // CHỈ để XEM (không tham gia bắt click) — tránh lặp lại đúng lỗi "chồng lớp chặn
            // click chọn xã/phường" đã sửa ở trên. KHÁC v1.6.1: mặc định KHÔNG hiện nhân viên
            // nào cả (kể cả khi bật checkbox) — chỉ hiện ĐÚNG 1 người sau khi bấm chọn (vào
            // chấm/tên/viền ranh giới của người đó), để tránh chồng chéo rối mắt khi nhiều
            // nhân viên cùng lúc — xem selectStaffTerritory_/applyStaffHullVisibility_. Bật/
            // tắt hẳn lớp bằng checkbox riêng "🗺️ Vùng giao thực tế (GPS)".
            map.addSource('staff-territory-hull', { type: 'geojson', data: state.staffTerritoryHullFeatures });
            map.addLayer({
                id: 'staff-territory-hull-fill',
                type: 'fill',
                source: 'staff-territory-hull',
                paint: {
                    'fill-color': ['match', ['get', 'coreColor'], 'red', '#e53935', 'yellow', '#fbc02d', 'green', '#43a047', '#9e9e9e'],
                    'fill-opacity': 0.22
                },
                layout: { visibility: state.showStaffHull ? 'visible' : 'none' }
            });
            map.addLayer({
                id: 'staff-territory-hull-line',
                type: 'line',
                source: 'staff-territory-hull',
                paint: {
                    'line-color': ['match', ['get', 'coreColor'], 'red', '#e53935', 'yellow', '#fbc02d', 'green', '#43a047', '#9e9e9e'],
                    'line-width': 2.5,
                    'line-opacity': 0.9
                },
                layout: { visibility: state.showStaffHull ? 'visible' : 'none' }
            });

            map.addLayer({
                id: 'staff-territory-hitline',
                type: 'line',
                source: 'staff-territory',
                // v1.7.14 — thêm filter theo trạng thái làm việc (xem STAFF_STATUS_FILTERED_LAYERS_)
                // để lớp hitbox (dò click) khớp ĐÚNG với những gì đang thực sự hiển thị.
                filter: staffLayerFilterWithStatus_(null),
                paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
                layout: { visibility: state.showStaffDots ? 'visible' : 'none' }
            });
            // Xã/phường CHÍNH (nhiều đơn nhất, nơi đặt chấm/tên) — viền đậm, liền nét.
            // v1.7.12 — GIẢM ĐỘ ĐẬM MẶC ĐỊNH (4px/0.9 -> 3px/0.75) — vẫn CHƯA đủ, người dùng
            // phản hồi tiếp: "chỉ khi nào tao không tick lớp chấm + ranh giới thì mới hiện viền
            // xã phường" — tức là GIẢM ĐỘ MỜ THÔI KHÔNG ĐỦ, vì lớp này vẫn được vẽ SAU (canh
            // lớp ĐÈ LÊN TRÊN, do map.addLayer không truyền beforeId nên luôn nằm trên cùng của
            // ngăn xếp lúc đó) đúng lớp viền hành chính 'wards-line' — kể cả mờ đi, cả TRĂM viền
            // (mỗi nhân viên/ngày) chồng lên 1 đường viền hành chính mảnh vẫn át hẳn nó.
            // v1.7.13 — SỬA TẬN GỐC (đổi Z-ORDER, không chỉ độ mờ): chèn 2 lớp CHÍNH/PHỤ này
            // NGAY BÊN DƯỚI lớp 'wards-line' bằng tham số beforeId của map.addLayer (lớp mới
            // luôn vẽ TRƯỚC/DƯỚI lớp có id truyền vào) — 'wards-line' giờ LUÔN vẽ ĐÈ LÊN TRÊN,
            // rõ nét, không phụ thuộc có bao nhiêu tuyến giao nhân viên đang hiện cùng lúc. Lớp
            // highlight khi bấm chọn ('staff-territory-selected-line', thêm SAU 'wards-line' —
            // xem bên dưới) vẫn nằm TRÊN CÙNG nên vẫn nổi bật đúng yêu cầu.
            map.addLayer({
                id: 'staff-territory-line-primary',
                type: 'line',
                source: 'staff-territory',
                // v1.7.14 — AND thêm bộ lọc trạng thái làm việc vào filter isPrimary gốc (giữ
                // NGUYÊN filter gốc, xem staffLayerFilterWithStatus_/STAFF_STATUS_FILTERED_LAYERS_).
                filter: staffLayerFilterWithStatus_(['==', ['get', 'isPrimary'], true]),
                paint: {
                    'line-color': ['match', ['get', 'coreColor'], 'red', '#e53935', 'yellow', '#fbc02d', 'green', '#43a047', '#9e9e9e'],
                    'line-width': 3,
                    'line-opacity': 0.75
                },
                layout: { visibility: state.showStaffDots ? 'visible' : 'none' }
            }, 'wards-line');
            // Xã/phường PHỤ (dưới 1 phần tuyến giao, KHÔNG phải nơi nhiều đơn nhất) — viền
            // mảnh hơn + đứt nét để phân biệt "chính"/"phụ" bằng mắt (không tách được hình
            // học 1 phần nhỏ hơn của xã/phường — xem ghi chú computeStaffTerritories_()).
            // v1.7.12: giảm nhạt thêm (2.2px/0.75 -> 1.6px/0.5). v1.7.13: cùng lý do "primary"
            // ngay trên — chèn TRƯỚC 'wards-line' (nằm DƯỚI) để viền hành chính luôn nổi lên trên.
            map.addLayer({
                id: 'staff-territory-line-secondary',
                type: 'line',
                source: 'staff-territory',
                // v1.7.14 — cùng lý do "primary" ở trên.
                filter: staffLayerFilterWithStatus_(['==', ['get', 'isPrimary'], false]),
                paint: {
                    'line-color': ['match', ['get', 'coreColor'], 'red', '#e53935', 'yellow', '#fbc02d', 'green', '#43a047', '#9e9e9e'],
                    'line-width': 1.6,
                    'line-opacity': 0.5,
                    'line-dasharray': [2, 1.5]
                },
                layout: { visibility: state.showStaffDots ? 'visible' : 'none' }
            }, 'wards-line');
            // ---- Lớp HIGHLIGHT: viền tuyến giao của nhân viên ĐANG CHỌN (viền vàng dày,
            // LUÔN NỔI RÕ) — v1.7.12, phản hồi trực tiếp: "KHI BẤM VÀO ĐỐI TƯỢNG NÀO THÌ PHẢI
            // HIỂN THỊ / LÀM BẬT LÊN ĐƯỢC RANH GIỚI/ĐƯỜNG VIỀN của mỗi đối tượng được chọn".
            // TRƯỚC ĐÂY: highlight tuyến giao khi bấm chọn CHỈ hiện qua lớp
            // 'staff-territory-hull-fill'/'-hull-line' (hình múi GPS mờ màu), mà lớp đó lại bị
            // KHOÁ sau checkbox riêng "🗺️ Vùng giao thực tế (GPS)" (mặc định TẮT, xem
            // applyStaffHullVisibility_) — nên bấm chọn 1 nhân viên (VD "Dương Văn Anh")
            // nhưng KHÔNG bật sẵn checkbox đó thì KHÔNG thấy viền nổi lên đâu cả (ảnh chụp
            // "ảnh 5" người dùng gửi — bấm không ra viền), dù đúng ra bấm phải LUÔN thấy được.
            // SỬA: thêm HẲN 1 lớp mới, RIÊNG CHO MỤC ĐÍCH HIGHLIGHT — cùng nguyên lý với 3 lớp
            // highlight đã có sẵn cho xã/phường/lãnh thổ bưu cục ('wards-selected-line'/
            // 'wards-hub-highlight-line'/'wards-new-selected-line', xem updateSelectionHighlight_
            // phía trên) — filter theo 'territoryKey', viền VÀNG (#ffd600, giống hệt màu
            // highlight xã/phường đang chọn) DÀY 6px, KHÔNG phụ thuộc bất kỳ checkbox nào — chỉ
            // phụ thuộc DUY NHẤT vào việc đã bấm chọn hay chưa (xem selectStaffTerritory_ bên
            // dưới) — bấm là LUÔN thấy, đúng yêu cầu "phải". Đặt SAU (bên dưới, tức vẽ ĐÈ LÊN
            // TRÊN) 2 lớp 'primary'/'secondary' vừa làm nhạt ở trên, để tương phản rõ với phần
            // nền đã dịu bớt.
            map.addLayer({
                id: 'staff-territory-selected-line',
                type: 'line',
                source: 'staff-territory',
                paint: { 'line-color': '#ffd600', 'line-width': 6, 'line-opacity': 1 },
                filter: ['==', ['get', 'territoryKey'], NO_MATCH_TOKEN],
                // Gắn theo ĐÚNG checkbox "chấm - ranh giới" (showStaffDots, xem
                // applyStaffDotVisibility_ đã thêm layer này vào danh sách) — KHÔNG gắn theo
                // checkbox "Vùng giao thực tế (GPS)" (showStaffHull) như lớp hull cũ, vì đó
                // chính là điều cần sửa ở đây.
                layout: { visibility: state.showStaffDots ? 'visible' : 'none' }
            });

            // ---- Chấm cảnh báo nhân viên (v1.5.0, đổi sang 1 chấm/nhân viên/ngày ở
            // v1.6.0) — nguồn dữ liệu tính từ tab "Theo Nhân Viên", có thể rỗng lúc khởi
            // tạo map (chưa tải sản lượng lần nào). ----
            map.addSource('staff-dots', { type: 'geojson', data: state.staffDotFeatures });
            // Vòng sáng — chỉ hiện với chấm có ringType != 'none', màu phân biệt 3 loại
            // đỏ khác nhau (vàng=Giao quá tải, xanh dương=Giao không đủ đơn, cam=Lấy
            // quá tải) — bán kính/độ mờ được ANIMATE bằng JS (xem staffDotBlinkTick_).
            map.addLayer({
                id: 'staff-dot-ring',
                type: 'circle',
                source: 'staff-dots',
                // v1.7.14 — AND thêm bộ lọc trạng thái làm việc vào filter ringType gốc.
                filter: staffLayerFilterWithStatus_(['!=', ['get', 'ringType'], 'none']),
                paint: {
                    // v1.7.2 — người dùng phản hồi vòng sáng cảnh báo hơi nhỏ, khó nhìn —
                    // nới bán kính (14 -> 18) + biên độ nhấp nháy (12-18 -> 16-24, xem
                    // startStaffDotBlink_ bên dưới) để dễ nhận ra hơn trên bản đồ.
                    'circle-radius': 18,
                    'circle-color': ['match', ['get', 'ringType'], 'over', '#ffca28', 'under', '#29b6f6', 'pickup_over', GHN_ORANGE, '#ffffff'],
                    'circle-opacity': 0.55,
                    'circle-blur': 0.35
                },
                layout: { visibility: state.showStaffDots ? 'visible' : 'none' }
            });
            // Lõi chấm — LUÔN nhấp nháy (kể cả xanh), màu = trạng thái nặng nhất giữa
            // Lấy/Giao.
            map.addLayer({
                id: 'staff-dot-core',
                type: 'circle',
                source: 'staff-dots',
                // v1.7.14 — bộ lọc trạng thái làm việc (không có filter gốc trước đó).
                filter: staffLayerFilterWithStatus_(null),
                paint: {
                    'circle-radius': 6,
                    'circle-color': ['match', ['get', 'coreColor'], 'red', '#e53935', 'yellow', '#fbc02d', 'green', '#43a047', '#9e9e9e'],
                    'circle-stroke-width': 1.5,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 1
                },
                layout: { visibility: state.showStaffDots ? 'visible' : 'none' }
            });
            // Nhãn TÊN nhân viên (v1.6.0) — đặt tại đúng điểm chấm (xã/phường CHÍNH), bật/
            // tắt RIÊNG bằng checkbox "🏷️ Hiện tên nhân viên" (không gộp chung với chấm/
            // ranh giới) — đúng yêu cầu "cho phép mở/tắt = việc tick vào trên thanh điều khiển".
            map.addLayer({
                id: 'staff-territory-label-text',
                type: 'symbol',
                source: 'staff-dots',
                // v1.7.8: xem giải thích ở lớp 'hubs-labels' phía trên — cùng lý do (tên
                // nhân viên trải khắp toàn vùng khi xem zoom rộng cũng rối y hệt tên bưu cục).
                minzoom: 8,
                // v1.7.13/v1.7.14 — lọc TÊN hiện theo trạng thái làm việc (Đang làm việc/Nghỉ
                // việc/Tạm Nghỉ/Hỗ trợ-Điều chuyển) — nay CHỈ là 1 trong 6 lớp cùng áp dụng bộ
                // lọc này, xem STAFF_STATUS_FILTERED_LAYERS_/applyStaffStatusFilter_.
                filter: staffLayerFilterWithStatus_(null),
                layout: {
                    // v1.7.5 — đổi từ driverName trần sang driverLabelText (đã ghép hậu tố
                    // "(Nghỉ việc)"/"(Tạm nghỉ)" nếu có, xem computeStaffDotFeatures_) — hiện
                    // TRẠNG THÁI NGAY CẠNH TÊN trên bản đồ, không phải chỉ trong popup.
                    'text-field': ['get', 'driverLabelText'],
                    'text-font': ['Noto Sans Bold'],
                    // v1.7.3: xem giải thích ở lớp 'wards-old-labels' phía trên — cùng cách sửa
                    // (tên nhân viên thường dài hơn tên phường nên baseline cao hơn 1 chút).
                    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 12, 16, 17],
                    // v1.7.12 — LỖI THẬT người dùng chụp ảnh phát hiện: tên dài (VD "Nguyễn
                    // Thành Vinh (Nghỉ việc)") vẫn tự XUỐNG DÒNG giữa chừng (ngay giữa TÊN,
                    // không phải chỉ ở hậu tố) dù v1.7.6 đã đổi khoảng trắng NỐI hậu tố sang
                    // khoảng trắng không ngắt dòng (U+00A0, xem driverLabelText ở
                    // computeStaffDotFeatures_) — vì khoảng trắng NỘI BỘ giữa các TỪ trong
                    // chính driverName (VD giữa "Thành" và "Vinh") vẫn là khoảng trắng THƯỜNG,
                    // và text-max-width GIÁ TRỊ CŨ (đơn vị em, ~12 ký tự) vẫn ép MapLibre tự
                    // ngắt dòng tại đó khi tên dài vượt quá 12 em. v1.7.12 từng đổi sang
                    // text-max-width GIÁ TRỊ 0 (thử ở v1.7.12) — tưởng là giá trị đặc biệt "tắt hẳn wrap" — NHƯNG
                    // người dùng xác nhận tên VẪN xuống dòng sau khi dùng bản đó. SAU KHI KIỂM
                    // TRA LẠI kỹ thuật ngắt dòng của MapLibre/Mapbox GL: 0 KHÔNG tắt wrap — vì
                    // thuật toán ngắt dòng coi 0 là "độ rộng tối đa = 0 em", nên nó ngắt dòng
                    // SỚM HƠN (gần như tại MỌI khoảng trắng) chứ không phải tắt hẳn — tức bản
                    // v1.7.12 vô tình làm ĐÚNG NGƯỢC LẠI ý muốn. SỬA TẬN GỐC (v1.7.13): đặt
                    // 'text-max-width' thành 1 số RẤT LỚN (40 em, đủ chứa tên người Việt dài
                    // nhất + hậu tố trạng thái mà không đụng ngưỡng ngắt dòng thực tế) — đây là
                    // cách chuẩn được khuyến nghị của Mapbox/MapLibre để "vô hiệu hoá" wrap khi
                    // bản thân style-spec không có giá trị nào nghĩa là "tắt hẳn". Chỉ đổi lớp
                    // NÀY (không đụng 'wards-old-labels'/'wards-new-labels'/'hubs-labels' — các
                    // lớp đó không bị phản ánh lỗi này). Khoảng trắng không ngắt dòng (U+00A0)
                    // ở driverLabelText vẫn giữ nguyên — an toàn 2 lớp bảo hiểm cùng lúc.
                    'text-max-width': 40,
                    'text-offset': [0, 1.1],
                    'text-anchor': 'top',
                    // v1.7.4 — LỖI THẬT phát hiện qua ảnh chụp: tên nhân viên KHÔNG HIỆN
                    // (rỗng hẳn) ở những chấm nằm GẦN nhãn tên phường ('wards-old-labels'/
                    // 'wards-new-labels'/'hubs-labels' — add TRƯỚC lớp này nên MapLibre ưu
                    // tiên đặt chỗ cho chúng trước theo đúng thứ tự add). Bản v1.7.4 sửa bằng
                    // 'text-allow-overlap'+'text-ignore-placement' = true — NHƯNG cách đó khiến
                    // lớp này bỏ qua MỌI va chạm, KỂ CẢ va chạm với CHÍNH NÓ (các chấm nhân viên
                    // khác đứng sát nhau) — ảnh chụp v1.7.6 cho thấy 3 chấm gần nhau (Nguyễn
                    // Văn Chung/Lê Đình Chung/... (Nghỉ việc)) hiện chữ chồng đè be bét, không
                    // đọc được ai với ai — "rối hết với nhau".
                    // SỬA ĐÚNG GỐC ở v1.7.6: đổi lớp này về mặc định (allow-overlap/ignore-
                    // placement đều false — có va chạm thật thì NHƯỜNG, không cưỡng ép hiện
                    // chồng chữ nữa) — nhưng để KHÔNG tái lỗi v1.7.4 (bị nhãn phường/bưu cục
                    // chặn mất), chuyển hướng ngược lại: đánh dấu 'text-ignore-placement': true
                    // trên CHÍNH 3 lớp nhãn phường/bưu cục add TRƯỚC (xem 'wards-old-labels'/
                    // 'wards-new-labels'/'hubs-labels' bên trên) — nghĩa là 3 lớp đó KHÔNG còn
                    // "chiếm chỗ" cản trở các lớp add SAU (lớp nhân viên) nữa, trong khi lớp
                    // nhân viên vẫn giữ va chạm CHUẨN với CHÍNH NÓ — kết quả: nhãn nhân viên
                    // KHÔNG BAO GIỜ bị nhãn phường/bưu cục che (đúng yêu cầu v1.7.4), ĐỒNG THỜI
                    // tự động né nhau khi đứng sát nhau (đúng yêu cầu v1.7.6, rõ ràng thay vì
                    // chồng chữ) — ưu tiên GIỮ LẠI nhãn nào khi vài chấm tranh cùng 1 chỗ được
                    // quyết bằng 'symbol-sort-key' dưới đây: nhân viên đang CẢNH BÁO (đỏ/vàng)
                    // luôn được ưu tiên hiện tên trước nhân viên bình thường (xanh)/đã nghỉ
                    // (xám) — nhãn xung quanh vẫn còn có thể xem lại bằng cách zoom vào gần hơn
                    // (chấm giãn ra xa nhau hơn trên màn hình, hết va chạm, tự hiện lại).
                    'symbol-sort-key': ['match', ['get', 'coreColor'], 'red', 0, 'yellow', 1, 'green', 2, 3],
                    'visibility': state.showStaffNameLabels ? 'visible' : 'none'
                },
                paint: {
                    'text-color': ['match', ['get', 'coreColor'], 'red', '#c62828', 'yellow', '#e65100', 'green', '#2e7d32', '#424242'],
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.6
                }
            });

            applyPaint_();
            applyRegionFilter_();
            fitToData_();
            startStaffDotBlink_();

            // QUAN TRỌNG: dùng 1 handler click DUY NHẤT (không đăng ký riêng từng lớp)
            // vì lớp "wards-new-fill" (trong suốt, phủ gần như toàn bộ diện tích) và
            // lớp "wards-fill" (phường cũ) CHỒNG LÊN NHAU ở gần như mọi điểm trên bản
            // đồ — nếu đăng ký click riêng cho từng lớp, MapLibre sẽ BẮN CẢ 2 handler
            // cùng lúc mỗi lần bấm, panel thông tin sẽ bị ghi đè lung tung tuỳ thứ tự
            // đăng ký. Giải pháp: tự query theo THỨ TỰ ƯU TIÊN rõ ràng, chỉ xử lý lớp
            // trúng đầu tiên: chấm/tên nhân viên > ĐÚNG VÀO/GẦN viền tuyến giao nhân viên
            // (v1.6.1: chỉ bắt click SÁT viền, KHÔNG còn phủ hết cả xã/phường — xem ghi
            // chú 'staff-territory-hitline' ở trên) > chấm bưu cục > phường MỚI (nếu đang
            // bật "Hiện ranh giới phường MỚI" — đúng ý khi bật lớp này là để BẤM VÀO XEM SỐ
            // LIỆU GỘP) > phường CŨ > (không trúng gì) bỏ chọn. Bấm vào chấm/tên/viền của 1
            // nhân viên (v1.6.2) LUÔN gọi selectStaffTerritory_() để hiện đúng "Vùng giao
            // thực tế" của RIÊNG người đó (nếu checkbox đang bật) — xem applyStaffHullVisibility_.
            map.on('click', (e) => {
                if (state.qhd && state.qhd.open && qhdMapClick_(e)) return; // v1.7.34 — đang sửa bản nháp quy hoạch
                // v1.6.4 — KHÔNG còn dùng map.queryRenderedFeatures cho chấm/tên nhân viên
                // (đã tự kiểm chứng trên trang thật: hay bị RỖNG dù bấm đúng pixel, xem giải
                // thích chi tiết ở findStaffDotNearPoint_ phía trên) — thay bằng tính khoảng
                // cách pixel trực tiếp từ dữ liệu JS (luôn đúng, không phụ thuộc GPU picking).
                //
                // v1.7.2 — LỖI THẬT phát hiện qua phản hồi "tắt 1 lớp mà như chưa tắt, khó
                // bấm vào tên bưu cục/tên nhân viên": findStaffDotNearPoint_() ở đây trước
                // đó KHÔNG kiểm tra state.showStaffDots trước khi chạy — vì nó tính khoảng
                // cách THUẦN TỪ DỮ LIỆU JS (state.staffDotFeatures), hoàn toàn không phụ
                // thuộc lớp bản đồ có đang HIỂN THỊ hay không, nên dù đã tắt checkbox "📍
                // Tuyến giao nhân viên" (ẩn chấm khỏi bản đồ), bấm vào đúng vị trí chấm ĐÓ
                // TỪNG Ở (dù không còn nhìn thấy) vẫn cướp mất click, chặn không cho bấm
                // trúng phường/bưu cục bên dưới — đúng y hệt hiện tượng "như chưa tắt". SỬA:
                // thêm điều kiện state.showStaffDots ở đây, giống hệt điều kiện đã có sẵn
                // cho nhánh territoryHits ngay bên dưới.
                const staffHit = state.showStaffDots ? findStaffDotNearPoint_(map, e.point, 16) : null;
                if (staffHit) {
                    selectStaffTerritory_(staffHit.properties.territoryKey);
                    showInfoPanel_(staffDotPopupHtml_(staffHit.properties));
                    return;
                }
                if (state.showStaffDots) {
                    const territoryHits = map.queryRenderedFeatures(e.point, { layers: ['staff-territory-hitline'] });
                    if (territoryHits.length) {
                        const tf = territoryHits[0];
                        const dotFeat = (state.staffDotFeatures.features || []).find(f =>
                            f.properties.staffKey === tf.properties.staffKey && f.properties.tripDate === tf.properties.tripDate
                        );
                        if (dotFeat) {
                            selectStaffTerritory_(dotFeat.properties.territoryKey);
                            showInfoPanel_(staffDotPopupHtml_(dotFeat.properties));
                            return;
                        }
                    }
                }
                const hubHits = map.queryRenderedFeatures(e.point, { layers: ['hubs-points'] });
                if (hubHits.length) {
                    const f = hubHits[0];
                    selectHubTerritory_(f.properties.hub_code);
                    showInfoPanel_(hubPopupHtml_(f.properties), true); // v1.7.16: wide=true — panel rộng hơn để bảng xã/phường hiện đủ cột
                    wireHubStaffingTable_(); // v1.7.14 — gắn lọc/sắp xếp cho bảng "Theo từng xã/phường" vừa render
                    return;
                }
                if (state.showNewBoundary) {
                    const newHits = map.queryRenderedFeatures(e.point, { layers: ['wards-new-fill'] });
                    if (newHits.length) {
                        const f = newHits[0];
                        selectNewWard_(f.properties.new_ward_code);
                        showInfoPanel_(newWardPopupHtml_(f.properties));
                        return;
                    }
                }
                const oldHits = map.queryRenderedFeatures(e.point, { layers: ['wards-fill'] });
                if (oldHits.length) {
                    const f = oldHits[0];
                    selectWard_(f.properties.ward_code);
                    showInfoPanel_(wardPopupHtml_(f.properties));
                    return;
                }
                // Không trúng phường/marker nào => bỏ chọn highlight + đóng panel
                // (clearSelection_() tự gọi hideInfoPanel_()).
                clearSelection_();
            });
            ['wards-fill', 'wards-new-fill', 'hubs-points', 'staff-dot-core', 'staff-territory-hitline', 'staff-territory-label-text'].forEach(layerId => {
                map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
            });
        });
    }

    function fitToData_() {
        if (!state.map || !state.wardsOldEnriched) return;
        const feats = state.wardsOldEnriched.features.filter(f =>
            state.currentRegion === 'all' || f.properties.region === state.currentRegion
        );
        if (!feats.length) return;
        const bounds = new maplibregl.LngLatBounds();
        feats.forEach(f => {
            const geom = f.geometry;
            const rings = geom.type === 'Polygon' ? [geom.coordinates] : (geom.coordinates || []);
            rings.forEach(polygon => {
                (polygon || []).forEach(ring => {
                    (ring || []).forEach(coord => {
                        if (Array.isArray(coord) && coord.length >= 2) bounds.extend(coord);
                    });
                });
            });
        });
        if (!bounds.isEmpty()) {
            state.map.fitBounds(bounds, { padding: 30, duration: 400 });
        }
    }

    // ==================== SẢN LƯỢNG THEO NHÂN VIÊN (gọi thẳng API nội bộ GHN — KHÔNG
    // qua GAS, KHÔNG qua quyhoachbuucuc.info — mirror đúng cách ghn-baocao-gtc.user.js
    // đang làm, xem changelog v1.4.0 để biết bối cảnh đầy đủ). ====================

    // Quét Bearer token từ các thẻ <script> nội tuyến của trang nhanh.ghn.vn — ĐÚNG
    // cách ghn-baocao-gtc.user.js đang làm (KHÔNG tự chế cách khác) — module chỉ ĐỌC,
    // không lưu token vào Google Sheet/Drive hay bất kỳ đâu ngoài localStorage của
    // chính trình duyệt (localStorage['ghn_extracted_token'] là do CHÍNH GHN's app hoặc
    // module GTC đã set sẵn nếu đang chạy song song — ở đây chỉ ĐỌC lại nếu có).
    function autoDetectGhnToken_() {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
            const content = script.textContent || '';
            const tokenMatch = content.match(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*/g);
            if (tokenMatch) {
                for (const token of tokenMatch) {
                    if (token.length > 100) {
                        state.ghnToken = token;
                        return token;
                    }
                }
            }
        }
        const stored = localStorage.getItem('ghn_extracted_token') ||
            localStorage.getItem('access_token') ||
            sessionStorage.getItem('access_token');
        if (stored) {
            state.ghnToken = stored;
            return stored;
        }
        return null;
    }

    function getGhnBearerToken_() {
        if (state.ghnToken) return state.ghnToken;
        const found = autoDetectGhnToken_();
        if (!found) {
            throw new Error('Không bắt được thông tin đăng nhập GHN — thử thao tác gì đó trên trang nhanh.ghn.vn (VD mở 1 đơn hàng) rồi bấm "Tải sản lượng" lại.');
        }
        return found;
    }

    // v1.7.0 — XÁC THỰC DANH TÍNH để PHÂN QUYỀN (ADMIN/QUAN_LY/NHAN_VIEN theo bưu cục).
    // Gọi ĐÚNG API chính thức của GHN (/user/my-profile) mà ghn-baocao-gtc.user.js đã
    // dùng và kiểm chứng ổn định từ lâu (module đó là tài liệu tham khảo READ-ONLY,
    // không sửa gì vào đó — chỉ học đúng kỹ thuật rồi viết lại độc lập ở đây) để lấy
    // "ssoId" — ID tài khoản THẬT đang đăng nhập trên trình duyệt, KHÔNG thể tự gõ giả
    // được (khác hẳn việc tự nhập Mã NV/Tên NV bằng tay, có thể "mượn" quyền người
    // khác). Chỉ ĐỌC thông tin danh tính (ssoId, họ tên) để so với sheet PhanQuyen —
    // KHÔNG lưu token/cookie GHN vào Sheet/Drive ở bất kỳ đâu, đúng nguyên tắc bảo mật
    // xuyên suốt cả modul.
    async function fetchGhnProfile_() {
        const token = getGhnBearerToken_();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        let response;
        try {
            response = await fetch('https://nhanh-api.ghn.vn/api/lastmile/user/my-profile', {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'authorization': `Bearer ${token}`,
                    'content-type': 'application/json',
                    'origin': 'https://nhanh.ghn.vn',
                    'referer': 'https://nhanh.ghn.vn/'
                },
                body: JSON.stringify({}),
                signal: controller.signal
            });
        } catch (err) {
            if (err && err.name === 'AbortError') {
                throw new Error('Hết thời gian chờ (15s) khi xác thực tài khoản GHN để kiểm tra quyền truy cập.');
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status} khi xác thực tài khoản GHN`);
        const data = await response.json();
        const userInfo = data && data.data && data.data.userInfo;
        if (!userInfo || !userInfo.ssoId) throw new Error('Phản hồi /my-profile của GHN thiếu ssoId');
        return {
            ssoId: String(userInfo.ssoId).trim(),
            fullname: (userInfo.profile && userInfo.profile.fullname) || ''
        };
    }

    async function ghnApiPost_(path, body) {
        const token = getGhnBearerToken_();
        const res = await fetch(`${GHN_API_BASE}${path}`, {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json',
                'origin': 'https://nhanh.ghn.vn',
                'referer': 'https://nhanh.ghn.vn/'
            },
            body: JSON.stringify(body)
        });
        if (res.status === 401 || res.status === 403) {
            state.ghnToken = null; // token hết hạn — bắt lại ở lần gọi sau
            throw new Error(`Chưa đăng nhập / hết phiên GHN (HTTP ${res.status}) khi gọi ${path}`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} khi gọi ${path}`);
        return res.json();
    }

    // Đổi khoảng ngày UI (giờ VN) sang UTC ISO đúng cách GTC đang làm: lùi 1 ngày, bắt
    // đầu 17:00 UTC hôm trước = 00:00 VN ngày fromDate; kết thúc 16:59:59.999 UTC ngày
    // toDate = 23:59:59 VN ngày toDate — để không sót chuyến tạo trước 7h sáng VN.
    function vnDateRangeToUtc_(fromDateStr, toDateStr) {
        const from = new Date(fromDateStr);
        const to = new Date(toDateStr);
        const fromAdjusted = new Date(from);
        fromAdjusted.setDate(fromAdjusted.getDate() - 1);
        return {
            formattedFromDate: `${fromAdjusted.toISOString().split('T')[0]}T17:00:00.000Z`,
            formattedToDate: `${to.toISOString().split('T')[0]}T16:59:59.999Z`
        };
    }

    // Tìm TẤT CẢ mã chuyến đi của 1 bưu cục trong khoảng ngày — có PHÂN TRANG (bản GTC
    // gốc — xem ghn-baocao-gtc.user.js hàm searchTrip(), chỉ ĐỌC tham khảo, không sửa —
    // luôn cố định page:1/offset:0, chấp nhận chỉ lấy tối đa 50 chuyến/bưu cục/khoảng
    // ngày; ở đây lặp thêm trang để không sót chuyến khi bưu cục đông chuyến/khoảng ngày
    // dài, chặn tối đa 20 trang = 1000 chuyến/bưu cục để tránh vòng lặp quá đà).
    //
    // LỖI THẬT phát hiện v1.7.0 (người dùng báo cáo bưu cục chỉ 13 chuyến/ngày, chạy 3
    // ngày lại ra gần 1000 chuyến — sai hoàn toàn): endpoint search-trip của GHN — khác
    // với suy đoán ban đầu — có vẻ KHÔNG thực sự phân trang theo tham số "page" như bản
    // GTC gốc gửi cố định "offset: 0" mọi lần (GTC chưa từng cần trang 2 vì luôn chỉ lấy
    // trang 1). Khi trước đây giữ nguyên "offset: 0" cố định nhưng tăng "page" ở mỗi vòng
    // lặp, rất có thể server bỏ qua "page" (hoặc phân trang thực sự theo "offset" chứ
    // không phải "page") nên mỗi vòng lặp trả về LẶP LẠI ĐÚNG 50 mã chuyến giống hệt
    // trang trước — khiến allCodes.length luôn == limit (không bao giờ < limit để dừng
    // sớm) và ăn trọn 20 vòng lặp = 1000 mã, phần lớn là TRÙNG LẶP.
    // SỬA: (1) truyền "offset" tăng dần đúng theo trang (offset = (page-1)*limit) — phòng
    // trường hợp server phân trang theo offset chứ không phải page; (2) QUAN TRỌNG HƠN —
    // khử trùng bằng Set NGAY TRONG VÒNG LẶP, và DỪNG NGAY nếu 1 trang không mang lại mã
    // chuyến MỚI nào cả (dấu hiệu chắc chắn server không phân trang thêm được nữa, dù do
    // "page" bị bỏ qua hay do offset cũng đã hết dữ liệu) — đảm bảo KHÔNG BAO GIỜ đếm
    // trùng 1 chuyến đi 2 lần, bất kể endpoint có hỗ trợ phân trang thật hay không.
    async function searchTripPaged_(hubId, fromDateStr, toDateStr) {
        const { formattedFromDate, formattedToDate } = vnDateRangeToUtc_(fromDateStr, toDateStr);
        const limit = 50;
        let page = 1;
        let allCodes = [];
        const seen = new Set();
        while (page <= 20) {
            const data = await ghnApiPost_('/api/lastmile/trip/search-trip', {
                page, limit,
                fromDate: formattedFromDate, toDate: formattedToDate,
                offset: (page - 1) * limit, hubId, reverse: true
            });
            const codes = Array.isArray(data.data) ? data.data.map(t => t.tripCode) : [];
            const newCodes = codes.filter(c => c && !seen.has(c));
            newCodes.forEach(c => seen.add(c));
            allCodes = allCodes.concat(newCodes);
            // Trang này không có mã MỚI nào (kể cả khi trả về đủ "limit" phần tử) => server
            // không phân trang thêm được nữa (lặp lại y hệt trang trước) => dừng ngay, tránh
            // đếm trùng — KHÔNG dựa vào "codes.length < limit" một mình vì chính điều kiện
            // đó là nguyên nhân gây lỗi đếm trùng ở trên.
            if (newCodes.length === 0) break;
            if (codes.length < limit) break;
            page += 1;
        }
        return allCodes;
    }

    async function getTripDetailGhn_(tripCode) {
        return ghnApiPost_('/api/lastmile/v2/trip/trip-detail', { trip_code: tripCode });
    }

    async function getTripItemsGhn_(tripCode, offset, limit) {
        const data = await ghnApiPost_('/api/lastmile/trip/get-trip-items', {
            typeList: ['PICK', 'DELIVER', 'RETURN'], offset, limit, TripCode: tripCode
        });
        return Array.isArray(data.data) ? data.data : [];
    }

    async function getTripItemsByPageGhn_(tripCode, page, limit) {
        const data = await ghnApiPost_('/api/lastmile/trip/get-trip-items', {
            typeList: ['PICK', 'DELIVER', 'RETURN'], page, limit, TripCode: tripCode
        });
        return Array.isArray(data.data) ? data.data : [];
    }

    // Mirror đúng cơ chế 2 chế độ (offset -> page) của GTC — 1 số chuyến đi API trả về
    // sai lệch nếu chỉ dùng 1 chế độ duy nhất.
    async function getAllTripItemsGhn_(tripCode) {
        const pageLimit = 1000;
        let mode = 'offset';
        let pageIndex = 0;
        let allItems = [];
        const seen = new Set();
        while (true) {
            let batch;
            if (mode === 'offset') {
                batch = await getTripItemsGhn_(tripCode, pageIndex * pageLimit, pageLimit);
                if (pageIndex > 0 && batch.length === 0) { mode = 'page'; continue; }
            } else {
                batch = await getTripItemsByPageGhn_(tripCode, pageIndex + 1, pageLimit);
            }
            const newOnes = [];
            for (const it of batch) {
                const key = it.orderCode || `${it.tripCode || ''}-${Math.random()}`;
                if (!seen.has(key)) { seen.add(key); newOnes.push(it); }
            }
            allItems = allItems.concat(newOnes);
            if (batch.length < pageLimit) break;
            if (newOnes.length === 0) {
                if (mode === 'offset') { mode = 'page'; continue; }
                break;
            }
            pageIndex += 1;
            await new Promise(r => setTimeout(r, 50));
        }
        return allItems;
    }

    // Suy luận "nhóm khách hàng" — ĐÚNG heuristic GTC đang dùng, KHÔNG phải field thật
    // của GHN (đã ghi rõ trong changelog + UI để tránh hiểu nhầm).
    // 4 nhóm theo đúng yêu cầu: TTS (TikTok Shop, mã đơn "VNGH..."), Shopee (tên khách
    // có dấu "<>"), SME (đơn bình thường còn lại, CÓ mã đơn hợp lệ), KHÁC (không đủ dữ
    // kiện để xếp nhóm nào — hiện chỉ xảy ra khi thiếu hẳn mã đơn, GHN không trả field
    // nhóm khách hàng chính thức nên KHÔNG có cách phân biệt SME thật với "không rõ"
    // ngoài trường hợp này — ghi rõ để không hiểu nhầm là bộ phân loại đầy đủ).
    function deriveCustomerGroup_(orderCode, client) {
        const code = String(orderCode || '').toUpperCase().trim();
        if (!code) return 'Khac';
        if (code.startsWith('VNGH')) return 'TTS';
        if (client && typeof client === 'string' && client.includes('<') && client.includes('>')) return 'Shopee';
        return 'SME';
    }

    function tripDateFromDetail_(detail) {
        const d = detail && detail.data;
        if (!d) return '';
        const raw = d.startTime || d.createdAt || d.date || d.created_at;
        if (!raw) return '';
        try { return new Date(raw).toISOString().split('T')[0]; } catch (e) { return ''; }
    }

    // Tải TOÀN BỘ sản lượng (rows phẳng, mỗi dòng = 1 đơn PICK/DELIVER/RETURN) cho các
    // bưu cục + khoảng ngày đã chọn — batch 3 chuyến/lượt + nghỉ 300ms giữa các lô, ĐÚNG
    // pattern chống bị hệ thống GHN coi là traffic bất thường mà GTC đã áp dụng.
    //
    // v1.7.1 — thêm "isCancelled" (hàm trả về true/false, đọc state.staffLoadCancelRequested)
    // để hỗ trợ nút "⏹ Dừng" — trước đây KHÔNG có cách nào dừng giữa chừng ngoài việc tải
    // lại (F5) cả trang, đúng lỗi người dùng báo cáo. Kiểm tra cờ này ở ĐẦU mỗi bưu cục VÀ
    // đầu mỗi lô 3 chuyến — dừng nhanh (trong vòng ~1 lô đang chạy, không đợi hết cả bưu
    // cục) và LUÔN trả về "rows" đã gom được TỚI LÚC DỪNG (không mất dữ liệu đã tải, chỉ
    // là chưa đầy đủ) thay vì huỷ trắng toàn bộ.
    //
    // v1.7.16 — TRẢ VỀ THÊM "unassignedRows" (phản hồi thật: "hiện tại định biên mày đang chỉ
    // cộng các đơn có trong chuyến đi tuy nhiên bưu cục còn đơn chưa gán được vì thiếu nhân sự
    // đó => định biên sẽ sai vì còn lượng đơn tồn chưa gán"). TRƯỚC ĐÂY: chuyến (tripCode) tìm
    // được qua search-trip nhưng trip-detail trả driverId RỖNG (chưa gán tài xế) bị BỎ QUA HẲN
    // ("chuyến chưa gán nhân viên — bỏ qua khỏi thống kê theo nhân viên") — đúng cho MỌI thống kê
    // GẮN VỚI 1 NHÂN VIÊN cụ thể (bảng "Theo Nhân Viên", chấm/tuyến giao trên bản đồ, "Hiện có")
    // vì không có driverId thì KHÔNG THỂ gán cho ai — nhưng SAI khi dùng làm tử số "Định biên"
    // (computeHubStaffingStats_), vì Định biên phải phản ánh ĐÚNG tổng khối lượng đơn CẦN GIAO
    // của xã/phường/bưu cục, KHÔNG PHẢI chỉ phần đã có người nhận — nghịch lý càng thiếu người
    // càng nhiều đơn tồn "chưa gán" thì Định biên tính theo cách cũ lại càng THẤP hơn thực tế
    // (chính là lỗ hổng người dùng phát hiện). SỬA: KHÔNG bỏ qua nữa — items của các chuyến
    // driverId rỗng vẫn được đẩy vào 1 mảng RIÊNG "unassignedRows" (driverId/staffKey = null, các
    // field khác — wardCode/type/tripDate... — lấy y hệt cách làm với rows bình thường, vì
    // get-trip-items/wardCode của item KHÔNG phụ thuộc đã gán tài xế hay chưa), KHÔNG gộp chung
    // vào "rows" — computeHubStaffingStats_ sẽ CHỈ cộng unassignedRows vào tử số Định biên/cột
    // "TB Lấy/Giao", còn "Hiện có"/bảng Theo Nhân Viên/bản đồ vẫn CHỈ đọc "rows" như cũ (không đổi
    // hành vi những chỗ đó — đúng, vì đơn chưa gán thì không thể "thuộc về" 1 nhân viên nào để vẽ
    // chấm/tính Hiện có).
    // v1.7.26 — GHN có lúc để trống receiverContact (không mã/tên xã, không địa chỉ) nhưng vẫn có
    // toạ độ — có khi đảo lat/lng, hoặc để 0, hoặc nằm ở field khác. Hàm này: (1) lấy từ contact như
    // cũ; (2) thiếu thì dò TOÀN BỘ đơn (sâu 4 cấp) tìm cặp lat/lng + mã/tên xã + địa chỉ; (3) chuẩn
    // hoá toạ độ: bỏ 0/ngoài VN, tự đảo nếu lat/lng bị ngược.
    function vnLatLng_(lat, lng) {
        lat = Number(lat); lng = Number(lng);
        if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;
        const ok = (a, b) => a >= 8 && a <= 24 && b >= 102 && b <= 110;
        if (ok(lat, lng)) return [lat, lng];
        if (ok(lng, lat)) return [lng, lat];
        return null;
    }
    function locFromItem_(item, contact) {
        // v1.7.27 — ĐÃ XÁC NHẬN bằng phản hồi thật của API get-trip-items (chủ dự án gửi 16/11/2026): GHN đã
        // CHE thông tin trong senderContact/receiverContact (chỉ còn contactName/contactPhone "*******"), vị trí
        // chuyển sang 3 khối riêng: pickInfo (đơn LẤY), deliverInfo (đơn GIAO), returnInfo (đơn TRẢ) — mỗi khối có
        // wardName/districtName/cityName/lat/lng (address bị che 1 phần, KHÔNG có wardCode). Ưu tiên đúng khối
        // theo loại đơn; thiếu thì mới dùng contact cũ / dò sâu như v1.7.26.
        const info = item && (item.type === 'PICK' ? item.pickInfo : item.type === 'RETURN' ? item.returnInfo : item.deliverInfo);
        if (info && (info.lat != null || info.wardName)) contact = Object.assign({}, contact || {}, info);
        const out = {
            wardCode: contact && contact.wardCode != null ? contact.wardCode : null,
            wardName: (contact && contact.wardName) || '', districtCode: contact && contact.districtCode != null ? contact.districtCode : null,
            districtName: (contact && contact.districtName) || '', cityName: (contact && contact.cityName) || '',
            address: (contact && contact.address) || '', lat: null, lng: null
        };
        const ll0 = contact ? vnLatLng_(contact.lat, contact.lng != null ? contact.lng : contact.long) : null;
        if (ll0) { out.lat = ll0[0]; out.lng = ll0[1]; }
        const pref = item.type === 'PICK' ? /sender|from|pick/i : /receiver|to[A-Z_]|deliver|customer|recipient/i;
        const found = { ll: [], ward: [], wardName: [], addr: [] };
        const walk = (o, path, depth) => {
            if (!o || typeof o !== 'object' || depth > 4) return;
            const keys = Object.keys(o);
            const kLat = keys.find(k => /^(lat|latitude)$/i.test(k) || /(^|_)lat$/i.test(k) || /Lat$/.test(k));
            const kLng = keys.find(k => /^(lng|lon|long|longitude)$/i.test(k) || /(^|_)(lng|lon)$/i.test(k) || /(Lng|Lon|Long)$/.test(k));
            if (kLat && kLng) { const ll = vnLatLng_(o[kLat], o[kLng]); if (ll) found.ll.push({ ll, path }); }
            keys.forEach(k => {
                const v = o[k], p = path + '.' + k;
                if (v && typeof v === 'object') walk(v, p, depth + 1);
                else if (/wardcode/i.test(k) && v) found.ward.push({ v: String(v), path: p });
                else if (/wardname/i.test(k) && v) found.wardName.push({ v: String(v), path: p });
                else if (/address/i.test(k) && typeof v === 'string' && v.length > 5) found.addr.push({ v, path: p });
            });
        };
        try { walk(item, 'item', 0); } catch (e) { /* bỏ qua */ }
        const pick = (arr) => (arr.find(x => pref.test(x.path)) || arr[0]);
        if (out.lat == null && found.ll.length) { const x = pick(found.ll); out.lat = x.ll[0]; out.lng = x.ll[1]; }
        if (out.wardCode == null || out.wardCode === '') { const x = found.ward.length ? pick(found.ward) : null; if (x) out.wardCode = x.v; }
        if (!out.wardName) { const x = found.wardName.length ? pick(found.wardName) : null; if (x) out.wardName = x.v; }
        if (!out.address) { const x = found.addr.length ? pick(found.addr) : null; if (x) out.address = x.v; }
        if (/^\*+/.test(out.address || '')) out.address = [out.wardName, out.districtName, out.cityName].filter(Boolean).join(', '); // địa chỉ bị che → dựng lại từ tên xã/huyện/tỉnh
        return out;
    }
    async function fetchStaffVolumeRows_(hubIds, fromDateStr, toDateStr, onProgress, isCancelled) {
        const TRIP_BATCH_SIZE = 3;
        const REQUEST_DELAY = 300;
        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        const rows = [];
        const unassignedRows = [];
        const cancelled = () => !!(isCancelled && isCancelled());

        for (let hi = 0; hi < hubIds.length; hi++) {
            if (cancelled()) { onProgress && onProgress('⏹ Đã dừng theo yêu cầu.'); return { rows, unassignedRows }; }
            const hubId = hubIds[hi];
            onProgress && onProgress(`Bưu cục ${hubId} (${hi + 1}/${hubIds.length}): đang tìm chuyến đi...`);
            let tripCodes = [];
            try {
                tripCodes = await searchTripPaged_(hubId, fromDateStr, toDateStr);
            } catch (err) {
                console.warn(`[Tuyến Giao] Lỗi tìm chuyến đi bưu cục ${hubId}:`, err);
                onProgress && onProgress(`⚠️ Bưu cục ${hubId}: lỗi tìm chuyến đi (${err.message}) — bỏ qua.`);
                continue;
            }

            for (let i = 0; i < tripCodes.length; i += TRIP_BATCH_SIZE) {
                if (cancelled()) { onProgress && onProgress('⏹ Đã dừng theo yêu cầu.'); return { rows, unassignedRows }; }
                const batch = tripCodes.slice(i, i + TRIP_BATCH_SIZE);
                onProgress && onProgress(`Bưu cục ${hubId} (${hi + 1}/${hubIds.length}): chuyến ${i + 1}-${Math.min(i + TRIP_BATCH_SIZE, tripCodes.length)}/${tripCodes.length}...`);

                await Promise.all(batch.map(async (tripCode) => {
                    try {
                        const [items, detail] = await Promise.all([
                            getAllTripItemsGhn_(tripCode),
                            getTripDetailGhn_(tripCode)
                        ]);
                        if (!detail || !detail.data) return;
                        const driverId = detail.data.driverId;
                        const driverName = detail.data.driverName;
                        // v1.7.16 — chuyến CHƯA gán tài xế (driverId rỗng): KHÔNG bỏ qua nữa —
                        // vẫn đẩy items vào "unassignedRows" riêng (driverId/staffKey=null) để
                        // computeHubStaffingStats_ cộng vào tử số Định biên/"TB Lấy/Giao" (đúng
                        // khối lượng CẦN GIAO thật, kể cả đơn tồn chưa có ai nhận) — xem giải
                        // thích đầy đủ ở đầu hàm. Mọi thống kê GẮN VỚI 1 NHÂN VIÊN cụ thể (bảng
                        // Theo Nhân Viên/chấm bản đồ/Hiện có) vẫn CHỈ đọc "rows" như cũ nên không
                        // bị ảnh hưởng — không thể "gán" đơn chưa có tài xế cho ai để vẽ chấm.
                        const isUnassigned = !driverId;
                        const staffKey = isUnassigned ? null : `${driverId} - ${driverName || driverId}`;
                        const tripDate = tripDateFromDetail_(detail);
                        const targetArr = isUnassigned ? unassignedRows : rows;

                        items.forEach(item => {
                            const receiver = item.receiverContact || {};
                            const sender = item.senderContact || {};
                            const client = `Gửi ${sender.contactName || ''} - ${sender.contactPhone || ''}\nNhận: ${receiver.contactName || ''} - ${receiver.contactPhone || ''}`;
                            // QUAN TRỌNG (v1.5.4): GHN trả THẲNG wardCode/wardName/lat/lng có sẵn
                            // trong receiverContact/senderContact — KHÔNG cần suy luận từ chuỗi
                            // địa chỉ text nữa (bản trước bỏ sót, chỉ lấy mỗi field "address" rồi
                            // tự fuzzy-match lại, trong khi GHN đã cho sẵn kết quả chính xác).
                            // Với PICK: vị trí liên quan là nơi GỬI (senderContact). Với DELIVER/
                            // RETURN: vị trí liên quan là nơi NHẬN (receiverContact). Field này
                            // KHÔNG phụ thuộc chuyến đã gán tài xế hay chưa — vẫn khớp xã/phường
                            // đúng cho cả đơn "chưa gán".
                            const loc = locFromItem_(item, item.type === 'PICK' ? sender : receiver);
                            if (!state.__rawItemLogged) { state.__rawItemLogged = true; try { console.log('[Tuyến Giao] Mẫu 1 đơn GHN trả về (raw):', JSON.stringify(item).slice(0, 4000)); } catch (e) { /* bỏ qua */ } }
                            targetArr.push({
                                hubId,
                                staffKey,
                                driverId: isUnassigned ? null : String(driverId),
                                driverName: isUnassigned ? '' : (driverName || String(driverId)),
                                tripCode,
                                orderCode: item.orderCode || '',
                                type: item.type || '',
                                address: loc.address || receiver.address || '',
                                wardCode: loc.wardCode != null ? String(loc.wardCode) : '',
                                wardName: loc.wardName || '',
                                districtCode: loc.districtCode != null ? String(loc.districtCode) : '',
                                districtName: loc.districtName || '',
                                cityName: loc.cityName || '',
                                lat: typeof loc.lat === 'number' ? loc.lat : null,
                                lng: typeof loc.lng === 'number' ? loc.lng : null,
                                isUpdated: !!item.isUpdated,
                                isSucceeded: !!item.isSucceeded,
                                tripDate: tripDate || fromDateStr,
                                customerGroup: deriveCustomerGroup_(item.orderCode, client)
                            });
                        });
                    } catch (err) {
                        console.warn(`[Tuyến Giao] Lỗi xử lý chuyến ${tripCode}:`, err);
                    }
                }));

                if (i + TRIP_BATCH_SIZE < tripCodes.length) await delay(REQUEST_DELAY);
            }
            if (hi + 1 < hubIds.length) await delay(REQUEST_DELAY);
        }
        return { rows, unassignedRows };
    }

    // Gộp rows phẳng -> 1 dòng / (ngày, bưu cục, nhân viên), theo đúng bộ lọc nhân
    // viên/nhóm khách hàng ĐANG chọn (lọc client-side, không cần gọi lại API).
    function aggregateStaffRows_(rows, staffKeyFilter, groupFilter) {
        const byKey = new Map();
        rows.forEach(r => {
            if (staffKeyFilter !== 'all' && r.staffKey !== staffKeyFilter) return;
            if (groupFilter !== 'all' && r.customerGroup !== groupFilter) return;
            const key = `${r.tripDate}|${r.hubId}|${r.staffKey}`;
            if (!byKey.has(key)) {
                byKey.set(key, {
                    tripDate: r.tripDate, hubId: r.hubId, staffKey: r.staffKey, driverName: r.driverName,
                    driverId: r.driverId, // v1.7.5 — tra trạng thái nhân sự (HRM) ở renderStaffTable_
                    pickSuccess: 0, pickFail: 0, pickPending: 0,
                    deliverSuccess: 0, deliverFail: 0, deliverPending: 0,
                    returnCount: 0, total: 0
                });
            }
            const agg = byKey.get(key);
            agg.total += 1;
            if (r.type === 'PICK') {
                if (r.isUpdated && r.isSucceeded) agg.pickSuccess += 1;
                else if (r.isUpdated) agg.pickFail += 1;
                else agg.pickPending += 1;
            } else if (r.type === 'DELIVER') {
                if (r.isUpdated && r.isSucceeded) agg.deliverSuccess += 1;
                else if (r.isUpdated) agg.deliverFail += 1;
                else agg.deliverPending += 1;
            } else if (r.type === 'RETURN') {
                agg.returnCount += 1;
            }
        });
        return Array.from(byKey.values()).sort((a, b) =>
            b.tripDate.localeCompare(a.tripDate) || a.hubId.localeCompare(b.hubId) || a.driverName.localeCompare(b.driverName)
        );
    }

    // ==================== CHẤM CẢNH BÁO NHÂN VIÊN TRÊN BẢN ĐỒ (v1.5.0) ====================
    // Ngưỡng — gom vào 1 chỗ DUY NHẤT để dễ sửa/tính lại sau này (đã nói trước sẽ có
    // phân quyền setup theo vai trò, hiện tại hardcode 1 bộ ngưỡng chung).
    // v1.7.18 — dinhBienMax (mỗi loại xã/phường): mức TỐI ĐA thực tế 1 người có thể gán/ngày,
    // theo đúng số người dùng cung cấp ("theo nghề này, tối đa gán thành phố (tuyến phường) chỉ
    // được 150 đơn, xã/thị trấn ở huyện thì cũng chỉ 120 đơn là cao lắm rồi") — CHỈ dùng riêng
    // cho công thức Định biên (computeHubStaffingStats_/effectiveDivisor_, "đẩy" năng lực lên gần
    // mức này khi bưu cục đang tồn nhiều, thay vì cộng thẳng 100% đơn tồn vào công thức ở mức ỔN
    // ĐỊNH yellowMin) — CỐ Ý TÁCH RIÊNG khỏi "red" (red dùng cho chấm cảnh báo quá tải của TỪNG
    // nhân viên trên bản đồ, mục đích khác, không đổi hành vi đó dù giá trị số có vẻ gần nhau).
    const THRESHOLDS_ = {
        pickShare: { red: 0.80, yellow: 0.50 },        // % lấy thành công / tổng lấy thành công cả bưu cục
        giaoXa: { red: 100, yellowMin: 70, greenMin: 40, dinhBienMax: 120 },     // đơn giao riêng của 1 nhân viên/ngày
        giaoPhuong: { red: 120, yellowMin: 90, greenMin: 50, dinhBienMax: 150 },
        wardMatchMinShare: 0.15 // xã/phường <15% tổng đơn giao trong ngày -> loại (gom ngầm)
    };

    // Bỏ dấu tiếng Việt + chuẩn hoá để so khớp chuỗi con (fuzzy match địa chỉ TEXT).
    function normalizeVn_(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Dựng 2 chỉ mục từ state.wards, 1 lần:
    // 1) theo VÙNG (region) — dò chuỗi con, dùng làm PHƯƠNG ÁN DỰ PHÒNG khi địa chỉ
    //    không đúng cấu trúc chuẩn hoặc không xác định được tỉnh.
    // 2) theo TỈNH (province) — khớp CHÍNH XÁC tên xã/phường đã bỏ tiền tố, dùng làm
    //    PHƯƠNG ÁN CHÍNH (v1.5.1) vì địa chỉ GHN trả về đúng cấu trúc 3 đoạn "<Xã/
    //    Phường/Thị trấn ...>, <Quận/Huyện/TP ...>, <Tỉnh/TP ...>" — khớp theo tỉnh +
    //    tên xã/phường chính xác hơn nhiều so với dò chuỗi con trong cả câu địa chỉ
    //    (tránh khớp nhầm khi tên xã/phường trùng 1 phần với tên quận/huyện/tỉnh khác).
    // Bỏ tiền tố hành chính cấp tỉnh ("Tỉnh ", "Thành phố ", "TP ", "TP.") trước khi so
    // khớp — địa chỉ GHN và dữ liệu wards.json có thể ghi tỉnh theo 2 kiểu khác nhau
    // (VD "Thái Nguyên" so với "Tỉnh Thái Nguyên"), bỏ tiền tố đi để cả 2 ra cùng 1 khoá.
    function normalizeAdminKey_(text) {
        const bare = String(text || '').replace(/^(Tỉnh|Thành phố|TP\.?|Quận|Huyện|Thị xã)\s+/i, '');
        return normalizeVn_(bare);
    }
    // ĐÃ SỬA LẠI ở v1.5.3 (v1.5.2 đổi SANG state.rezone.new_wards là SAI — đã tự kiểm
    // chứng lại bằng dữ liệu THẬT người dùng cung cấp: "Phường Phan Đình Phùng, Thành
    // phố Thái Nguyên, Thái Nguyên" là địa chỉ THẬT của 1 chuyến hiện tại, và ward này
    // CÓ trong /api/wards.json — tức state.wards (CŨ) mới là nguồn khớp đúng thực tế,
    // không phải state.rezone.new_wards (MỚI — đó là danh sách bưu cục ĐỀ XUẤT gộp lại
    // của quyhoachbuucuc.info, không phải danh sách hành chính GHN dùng cho địa chỉ
    // khách hàng). Test lại bằng node với đúng dữ liệu thật đã xác nhận: nguồn
    // state.wards khớp ra kết quả đúng, nguồn state.rezone.new_wards khớp ra 0 kết quả.
    function buildWardMatchIndex_() {
        const byRegion = {};
        const byProvince = {};
        const byProvinceDistrict = {};
        (state.wards || []).forEach(w => {
            const name = w.name || '';
            const bare = name.replace(/^(Xã|Phường|Thị trấn)\s+/i, '');
            const key = normalizeVn_(bare);
            if (!key || key.length < 3) return; // tên quá ngắn sau khi chuẩn hoá -> dễ khớp nhầm, bỏ qua
            const region = w.region || '__none__';
            const entry = { searchKey: key, wardCode: String(w.ward_code), name, isPhuong: /^Phường\s+/i.test(name) };
            if (!byRegion[region]) byRegion[region] = [];
            byRegion[region].push(entry);

            const provKey = normalizeAdminKey_(w.province || '');
            if (provKey) {
                if (!byProvince[provKey]) byProvince[provKey] = {};
                if (!byProvince[provKey][key]) byProvince[provKey][key] = [];
                byProvince[provKey][key].push(entry); // có thể >1 nếu trùng tên xã/phường khác huyện cùng tỉnh

                const distKey = normalizeAdminKey_(w.district || '');
                if (distKey) {
                    const pdKey = provKey + '|' + distKey;
                    if (!byProvinceDistrict[pdKey]) byProvinceDistrict[pdKey] = {};
                    if (!byProvinceDistrict[pdKey][key]) byProvinceDistrict[pdKey][key] = [];
                    byProvinceDistrict[pdKey][key].push(entry); // theo đúng tỉnh + quận/huyện -> gần như không thể trùng
                }
            }
        });
        // Ưu tiên tên DÀI/CỤ THỂ hơn khi có nhiều xã/phường cùng khớp 1 đoạn địa chỉ (áp
        // dụng cho phương án dự phòng theo vùng).
        Object.values(byRegion).forEach(arr => arr.sort((a, b) => b.searchKey.length - a.searchKey.length));
        state.wardMatchIndex = byRegion;
        state.wardMatchByProvince = byProvince;
        state.wardMatchByProvinceDistrict = byProvinceDistrict;
    }

    // Tách địa chỉ theo dấu phẩy — địa chỉ GHN trả về có cấu trúc "<Xã/Phường/Thị
    // trấn ...>, <Quận/Huyện/TP ...>, <Tỉnh/TP ...>" (đã xác nhận bằng địa chỉ thật).
    function parseAddressSegments_(address) {
        return String(address || '').split(',').map(s => s.trim()).filter(Boolean);
    }

    // Suy luận GẦN ĐÚNG 1 xã/phường từ địa chỉ TEXT — GHN không trả mã phường/GPS nên
    // đây KHÔNG PHẢI khớp chính xác 100%. Ưu tiên 3 bước, từ chắc chắn nhất trở xuống:
    //  1) Khớp CHÍNH XÁC theo cả 3 đoạn (xã/phường + quận/huyện + tỉnh) — gần như không
    //     thể trùng, dùng khi địa chỉ có đủ ≥3 đoạn.
    //  2) Nếu bước 1 không ra (thiếu đoạn quận/huyện, hoặc tên quận/huyện ghi khác dữ
    //     liệu gốc) — khớp CHÍNH XÁC theo tỉnh + xã/phường; chỉ nhận khi DUY NHẤT 1 kết
    //     quả trong tỉnh đó.
    //  3) Nếu vẫn không ra (địa chỉ sai cấu trúc, hoặc trùng tên xã/phường ở nhiều
    //     quận/huyện cùng tỉnh) — rơi về dò chuỗi con trong TOÀN BỘ địa chỉ, giới hạn
    //     theo VÙNG (region) của bưu cục xử lý đơn, làm phương án dự phòng cuối cùng.
    function matchAddressToWard_(address, region) {
        if (!state.wardMatchIndex) buildWardMatchIndex_();
        const segs = parseAddressSegments_(address);
        if (segs.length) {
            const wardSeg = segs.find(s => /^(Xã|Phường|Thị trấn)\s+/i.test(s)) || segs[0];
            const bare = wardSeg.replace(/^(Xã|Phường|Thị trấn)\s+/i, '');
            const wardKey = normalizeVn_(bare);
            const provinceKey = normalizeAdminKey_(segs[segs.length - 1] || '');

            if (segs.length >= 3) {
                const districtKey = normalizeAdminKey_(segs[segs.length - 2] || '');
                const pdKey = provinceKey + '|' + districtKey;
                const pdCandidates = (state.wardMatchByProvinceDistrict[pdKey] || {})[wardKey] || [];
                if (pdCandidates.length >= 1) return pdCandidates[0]; // khớp cả tỉnh + quận/huyện -> tin được luôn
            }

            const candidates = provinceKey && state.wardMatchByProvince[provinceKey]
                ? (state.wardMatchByProvince[provinceKey][wardKey] || [])
                : [];
            if (candidates.length === 1) return candidates[0]; // khớp CHÍNH XÁC theo tỉnh, không mơ hồ
            // >1 ứng viên (trùng tên khác huyện cùng tỉnh, bước 1 cũng không phân biệt
            // được) -> không đủ dữ kiện để chọn, rơi xuống phương án dự phòng bên dưới.
        }
        const norm = normalizeVn_(address);
        if (!norm) return null;
        const list = (state.wardMatchIndex[region] || []).concat(region !== '__none__' ? (state.wardMatchIndex['__none__'] || []) : []);
        for (const c of list) {
            if (norm.includes(c.searchKey)) return c;
        }
        return null;
    }

    function giaoThresholdsFor_(isPhuong) {
        return isPhuong ? THRESHOLDS_.giaoPhuong : THRESHOLDS_.giaoXa;
    }

    // 'red_over' (quá tải) | 'yellow' | 'green' | 'red_under' (không đủ đơn)
    function giaoStatus_(count, isPhuong) {
        const t = giaoThresholdsFor_(isPhuong);
        if (count > t.red) return 'red_over';
        if (count >= t.yellowMin) return 'yellow';
        if (count >= t.greenMin) return 'green';
        return 'red_under';
    }

    // 'red' (quá tải) | 'yellow' | 'green'
    function pickStatus_(share) {
        if (share > THRESHOLDS_.pickShare.red) return 'red';
        if (share >= THRESHOLDS_.pickShare.yellow) return 'yellow';
        return 'green';
    }

    // Với mỗi (nhân viên, ngày): gộp các đơn GIAO theo xã/phường suy luận được (ưu
    // tiên field wardCode THẬT do GHN trả về — xem ghi chú v1.5.4 bên dưới — chỉ suy
    // luận từ địa chỉ text khi đơn thiếu field này), rồi với MỖI xã/phường đạt ≥15%
    // tổng đơn giao trong ngày của nhân viên đó, trả về 1 KẾT QUẢ RIÊNG (= 1 chấm
    // trên bản đồ) mang đúng số liệu CỦA RIÊNG xã/phường đó (không phải tổng cả
    // ngày) — SỬA Ở v1.5.5: trước đây chỉ giữ lại xã/phường có số đơn CAO NHẤT làm
    // "best" rồi bỏ hết các xã/phường ≥15% còn lại, khiến 1 nhân viên giao nhiều khu
    // vực (VD Ba Hàng 47% + Tiên Phong 40%) chỉ lên 1 chấm, mất hẳn khu vực thứ 2 dù
    // chiếm tới 40% đơn ngày đó — theo đúng phản ánh thực tế của người dùng. Không có
    // xã/phường nào đạt ngưỡng -> trả về 1 kết quả wardCode:null (không đặt chấm,
    // nhưng vẫn giữ dòng debug cho bảng "+" ở renderStaffTable_).
    // ĐÃ SỬA ở v1.5.4: GHN trả THẲNG wardCode (đúng hệ mã với wards.json — đã kiểm
    // chứng: "120106" khớp y hệt) trong receiverContact/senderContact của mỗi đơn — ưu
    // tiên dùng TRỰC TIẾP field này (chính xác 100%, không phải suy luận), CHỈ fallback
    // về fuzzy-match địa chỉ text (matchAddressToWard_) khi đơn nào đó thiếu field này.
    function computeStaffWardAssignments_(rows) {
        const byStaffDay = new Map();
        rows.forEach(r => {
            if (r.type !== 'DELIVER') return;
            const key = `${r.staffKey}\u0001${r.tripDate}`;
            if (!byStaffDay.has(key)) {
                byStaffDay.set(key, {
                    staffKey: r.staffKey, driverName: r.driverName, tripDate: r.tripDate, hubId: r.hubId,
                    // v1.7.5 — r.driverId đã có sẵn trên MỌI dòng (gán ở fetchStaffVolumeRows_,
                    // bất biến trong cùng 1 nhóm staffKey — chính driverId + driverName ghép
                    // thành staffKey) — lấy 1 LẦN lúc khởi tạo nhóm, dùng để tra sheet "HRM"
                    // (trạng thái làm việc/thâm niên) ở computeStaffTerritories_.
                    driverId: r.driverId,
                    wardStats: new Map(), // wardCode -> {count, success, latSum, lngSum, gpsCount, groupCounts}
                    dayTotal: 0, daySuccess: 0, fromGhnField: 0, fromFuzzyMatch: 0,
                    dayGroupCounts: { TTS: 0, Shopee: 0, SME: 0, Khac: 0 },
                    // v1.7.4 — r.mergedDayCount do buildDotComputationRows_() gắn vào MỖI dòng
                    // khi gộp nhiều ngày (= số ngày thật đã gộp); dòng 1-ngày bình thường
                    // không có field này -> mặc định 1 (giữ nguyên logic 1 ngày, chia 1 = không đổi gì).
                    dayCount: r.mergedDayCount || 1
                });
            }
            const g = byStaffDay.get(key);
            g.dayTotal += 1;
            const succeeded = !!(r.isUpdated && r.isSucceeded);
            if (succeeded) g.daySuccess += 1;
            if (g.dayGroupCounts[r.customerGroup] !== undefined) g.dayGroupCounts[r.customerGroup] += 1;

            // v1.7.24 — quy về xã/phường CŨ của bản đồ (xem resolveOldWardCode_).
            const oldCode = resolveOldWardCode_(r);
            const wKey = oldCode || '__unmatched__';
            if (oldCode) { if (r.__oldWardHow === 'ghn') g.fromGhnField += 1; else g.fromFuzzyMatch += 1; }
            if (!g.wardStats.has(wKey)) {
                g.wardStats.set(wKey, { count: 0, success: 0, latSum: 0, lngSum: 0, gpsCount: 0, groupCounts: { TTS: 0, Shopee: 0, SME: 0, Khac: 0 } });
            }
            const ws = g.wardStats.get(wKey);
            ws.count += 1;
            if (succeeded) ws.success += 1;
            if (ws.groupCounts[r.customerGroup] !== undefined) ws.groupCounts[r.customerGroup] += 1;
            const llv = vnLatLng_(r.lat, r.lng); // v1.7.26 — bỏ toạ độ 0/ngoài VN, tự đảo nếu ngược
            if (llv) {
                ws.latSum += llv[0]; ws.lngSum += llv[1]; ws.gpsCount += 1;
            }
        });

        const results = [];
        byStaffDay.forEach(g => {
            const breakdown = [];
            g.wardStats.forEach((ws, wKey) => {
                if (wKey === '__unmatched__') return;
                const share = g.dayTotal > 0 ? ws.count / g.dayTotal : 0;
                breakdown.push({ wardCode: wKey, count: ws.count, share, meetsThreshold: share >= THRESHOLDS_.wardMatchMinShare });
            });
            breakdown.sort((a, b) => b.count - a.count);
            const qualifying = breakdown.filter(b => b.meetsThreshold);
            const unmatchedStat = g.wardStats.get('__unmatched__');

            // Số liệu DÙNG CHUNG cho cả ngày (nhân viên) — hiện trong "+" debug + dòng
            // ngữ cảnh popup ("khu vực X/N trong ngày"), KHÔNG dùng để đặt màu chấm.
            const shared = {
                staffKey: g.staffKey, driverName: g.driverName, tripDate: g.tripDate, hubId: g.hubId,
                driverId: g.driverId, // v1.7.5 — dùng tra sheet HRM ở computeStaffTerritories_
                dayTotalGiao: g.dayTotal, dayTotalGiaoSuccess: g.daySuccess, dayGroupCounts: g.dayGroupCounts,
                wardBreakdown: breakdown,
                unmatchedCount: unmatchedStat ? unmatchedStat.count : 0,
                fromGhnField: g.fromGhnField, fromFuzzyMatch: g.fromFuzzyMatch,
                dotCount: qualifying.length,
                // v1.7.4 — LỖI THẬT phát hiện khi test gộp nhiều ngày trên dữ liệu THẬT: các
                // ngưỡng THRESHOLDS_.giaoXa/giaoPhuong (VD giaoPhuong.red=120) được THIẾT KẾ
                // CHO 1 NGÀY/1 nhân viên — nhưng v1.7.3 lại so TỔNG CỘNG DỒN cả khoảng ngày
                // (VD gộp 6 ngày = 633 đơn) với ĐÚNG ngưỡng 1-ngày đó -> chắc chắn LUÔN ra
                // "quá tải" khi gộp từ 2 ngày trở lên, dù trung bình mỗi ngày có thể hoàn
                // toàn bình thường (633/6 = 105.5 đơn/ngày, KHÔNG quá tải). SỬA: thêm
                // dayCount (số ngày thật đã gộp, do buildDotComputationRows_ gắn vào từng
                // dòng qua r.mergedDayCount — 1 ngày thì mặc định 1, giữ NGUYÊN kết quả cũ)
                // + dayTotalGiaoAvg = tổng / dayCount, dùng số NÀY để so ngưỡng thay vì tổng
                // cộng dồn (xem computeStaffTerritories_). dayTotalGiao (tổng RAW) vẫn giữ
                // nguyên để hiển thị đúng số đơn thật đã giao trong popup.
                dayCount: g.dayCount,
                dayTotalGiaoAvg: g.dayTotal / g.dayCount
            };

            if (qualifying.length === 0) {
                results.push(Object.assign({}, shared, {
                    wardCode: null, wardShare: 0, giaoCount: 0, giaoSuccess: 0,
                    groupCounts: { TTS: 0, Shopee: 0, SME: 0, Khac: 0 },
                    wardGpsCenter: null, dotIndex: 0
                }));
                return;
            }

            // MỖI xã/phường đạt ≥15% -> 1 kết quả riêng = 1 chấm trên bản đồ, mang đúng
            // giaoCount/giaoSuccess/groupCounts/toạ độ GPS CỦA RIÊNG xã/phường đó (SỬA ở
            // v1.5.5 — trước đây gán nhầm tổng CẢ NGÀY của nhân viên cho 1 xã/phường
            // "thắng" duy nhất, vừa làm mất khu vực giao thứ 2 trở đi, vừa khiến % giao
            // thành công hiện trong popup không đúng với riêng xã/phường đó).
            qualifying.forEach((b, idx) => {
                const ws = g.wardStats.get(b.wardCode);
                results.push(Object.assign({}, shared, {
                    wardCode: b.wardCode, wardShare: b.share,
                    giaoCount: ws.count, giaoSuccess: ws.success, groupCounts: ws.groupCounts,
                    // Tâm GPS THẬT (trung bình lat/lng của chính các đơn đã giao ở xã/phường
                    // này) — chính xác hơn tâm hình học polygon, dùng làm toạ độ đặt chấm
                    // chính; centroidForWard_() (bbox polygon) chỉ còn là fallback.
                    wardGpsCenter: ws.gpsCount > 0 ? [ws.lngSum / ws.gpsCount, ws.latSum / ws.gpsCount] : null,
                    dotIndex: idx + 1
                }));
            });
        });
        return results;
    }

    // Tra hình học (geometry) 1 xã/phường CŨ theo ward_code — dùng để vẽ ranh giới
    // tuyến giao nhân viên (v1.6.0). Không cache trong state vì state.wardsOldEnriched có
    // thể được tải lại (reload) — tính lại mỗi lần gọi computeStaffDotFeatures_ (rẻ, vài
    // trăm phường, không đáng lo hiệu năng).
    function buildWardGeometryIndex_() {
        const idx = {};
        (state.wardsOldEnriched && state.wardsOldEnriched.features || []).forEach(f => {
            idx[String(f.properties.ward_code)] = f.geometry;
        });
        return idx;
    }

    // Gộp NHIỀU trạng thái Giao (của nhiều xã/phường 1 nhân viên phụ trách trong ngày)
    // thành 1 trạng thái NẶNG NHẤT — dùng làm màu chấm/viền chung cho cả tuyến giao (v1.6.0).
    function worstGiaoStatus_(statusList) {
        const rank = (s) => (s === 'red_over' || s === 'red_under') ? 2 : (s === 'yellow') ? 1 : (s === 'green') ? 0 : -1;
        let worst = null, worstRank = -2;
        (statusList || []).forEach(s => { const r = rank(s); if (r > worstRank) { worstRank = r; worst = s; } });
        return worst;
    }

    // Gộp computeStaffWardAssignments_() (1 kết quả/xã-phường) thành 1 "TUYẾN GIAO"/
    // (nhân viên, ngày) — v1.6.0, thay cho việc đặt NHIỀU chấm rời rạc ở v1.5.5. Người
    // dùng phản ánh: "số lượng chấm trên bản đồ phải khớp với số lượng nhân viên đi làm
    // ngày hôm đó" + "nhìn vào sẽ thấy được tuyến giao ... có ranh giới" + "hiển thị tên
    // nhân viên ở tuyến giao đó". Kỹ thuật: MỖI (nhân viên, ngày) có tuyến giao xác định
    // được (≥1 xã/phường đạt ≥15%) giờ chỉ tạo ĐÚNG 1 ĐIỂM đặt tên/chấm (tại xã/phường
    // "CHÍNH" — nhiều đơn nhất trong số các xã/phường đạt ngưỡng) — nên tổng số điểm =
    // đúng tổng số nhân viên có tuyến xác định được trong khoảng ngày đang xem. Ranh giới
    // (có thể NHIỀU xã/phường/nhân viên) vẽ RIÊNG bằng cách tô viền TẤT CẢ xã/phường đạt
    // ngưỡng của nhân viên đó (đậm hơn cho xã/phường CHÍNH, viền đứt mảnh hơn cho xã/
    // phường PHỤ) — xem computeStaffDotFeatures_() để biết cách dựng 2 lớp bản đồ từ dữ
    // liệu trả về ở đây.
    // LƯU Ý (giới hạn kỹ thuật, không giấu): dữ liệu chỉ có ở mức CẢ XÃ/PHƯỜNG (wardCode),
    // KHÔNG có ranh giới nhỏ hơn (đường/tổ dân phố) nên khi 1 xã/phường chỉ là "1 phần"
    // tuyến giao của nhân viên (VD Ba Hàng 19%) thì ranh giới vẽ ra vẫn là NGUYÊN VẸN cả
    // xã/phường đó (không tách được hình học 1 phần nhỏ hơn) — phân biệt "chính"/"phụ" chỉ
    // qua độ đậm/kiểu nét viền + số đơn/% hiện trong popup, không phải vẽ đúng hình dạng
    // vùng con thực tế nhân viên đó đi qua.
    function computeStaffTerritories_(rows) {
        const wardAssignments = computeStaffWardAssignments_(rows);
        const pickShareMap = computePickShareByStaff_(rows);
        const byStaffDay = new Map();
        wardAssignments.forEach(a => {
            const key = `${a.staffKey}\u0001${a.tripDate}`;
            if (!byStaffDay.has(key)) byStaffDay.set(key, []);
            byStaffDay.get(key).push(a);
        });

        const territories = [];
        byStaffDay.forEach(list => {
            const shared = list[0];
            const qualifying = list.filter(a => a.wardCode).sort((a, b) => b.giaoCount - a.giaoCount);
            if (qualifying.length === 0) return; // không xã/phường nào đạt ngưỡng -> không có tuyến xác định được, bỏ qua (tính vào unmatched)

            const primary = qualifying[0];
            const ward = state.wardsByCode ? state.wardsByCode[primary.wardCode] : null;
            const anchor = primary.wardGpsCenter || centroidForWard_(primary.wardCode);
            if (!anchor) return; // không xác định được toạ độ đặt tên -> bỏ qua, giống logic cũ

            const isPhuongList = qualifying.map(w => {
                const wd = state.wardsByCode ? state.wardsByCode[w.wardCode] : null;
                return !!(wd && /^Phường\s+/i.test(wd.name || ''));
            });
            // v1.7.2 — SỬA LỖI THẬT người dùng phát hiện: trước đây "combinedGiao" (trạng
            // thái quá tải/bình thường/thiếu đơn hiện ở dòng đầu popup) được tính bằng
            // worstGiaoStatus_() — lấy trạng thái NẶNG NHẤT trong số các xã/phường THÀNH
            // PHẦN (mỗi xã/phường tự so với ngưỡng riêng). Nhưng ngưỡng giaoXa/giaoPhuong
            // vốn thiết kế để đánh giá TOÀN BỘ khối lượng 1 NGÀY của 1 nhân viên nếu dồn hết
            // vào 1 xã/phường — áp y hệt ngưỡng đó cho 1 xã/phường PHỤ (chỉ nhận 1 PHẦN nhỏ,
            // VD 21% tổng đơn) chắc chắn LUÔN ra "không đủ đơn" một cách giả tạo, dù tổng cả
            // tuyến hôm đó vẫn ổn (VD 116 đơn — không hề ít). Đúng như phản hồi "phải tính
            // là tổng đơn Giao hàng trong chuyến chứ không phải chỉ tính đơn GTC [thành
            // công]" — SỬA: đánh giá dựa trên shared.dayTotalGiao — TỔNG đơn giao CẢ TUYẾN
            // trong ngày đó (đã gồm cả đơn ở xã/phường KHÔNG đạt ngưỡng 15%, đúng nghĩa
            // "tổng đơn đi giao trong chuyến", KHÔNG chỉ đếm đơn THÀNH CÔNG) — so với đúng 1
            // bộ ngưỡng duy nhất, chọn theo loại xã/phường CHÍNH (primary, nơi nhận nhiều
            // đơn nhất). Không còn hiện trạng thái riêng cho từng xã/phường PHỤ trong popup
            // nữa (dễ hiểu lầm là "xã/phường đó tự nó thiếu đơn") — chỉ còn 1 kết luận DUY
            // NHẤT cho cả tuyến, xem staffDotPopupHtml_().
            // v1.7.4 — SỬA TIẾP: khi gộp NHIỀU NGÀY, ngưỡng (thiết kế cho 1 ngày) phải so
            // với TRUNG BÌNH/NGÀY (shared.dayTotalGiaoAvg = dayTotalGiao / dayCount), KHÔNG
            // phải tổng cộng dồn cả khoảng ngày — nếu không, gộp từ 2 ngày trở lên sẽ LUÔN
            // báo "quá tải" một cách giả tạo dù trung bình mỗi ngày hoàn toàn bình thường
            // (xem chú thích đầy đủ ở computeStaffWardAssignments_ nơi tính dayTotalGiaoAvg).
            // 1 ngày -> dayCount=1 -> dayTotalGiaoAvg === dayTotalGiao -> KHÔNG đổi gì.
            const combinedGiao = giaoStatus_(shared.dayTotalGiaoAvg, isPhuongList[0]);

            const pickInfo = pickShareMap.get(`${shared.staffKey}\u0001${shared.tripDate}`) || null;
            const pick = pickInfo ? pickStatus_(pickInfo.share) : null;
            const combined = combineStaffDotStatus_(combinedGiao, pick);

            // v1.7.5 — LỖI THẬT người dùng phát hiện: nhân viên ĐÃ NGHỈ VIỆC vẫn hiện chấm/
            // tên bình thường trên bản đồ (dữ liệu chuyến vẫn tồn tại trong khoảng ngày đang
            // xem dù người đó đã nghỉ SAU thời điểm đó) — dễ gây nhầm lẫn "vẫn còn nhân viên
            // này". SỬA: tra sheet HRM theo driverId, nếu đang "Nghỉ việc"/"Tạm nghỉ" thì GHI
            // ĐÈ coreColor thành 'gray' + ringType thành 'none' — 'gray' là giá trị KHÔNG có
            // trong bất kỳ match-expression màu nào ở initMap_ (chỉ liệt kê 'red'/'yellow'/
            // 'green') nên MapLibre tự rơi về đúng màu fallback đã có sẵn ('#9e9e9e' xám cho
            // chấm/viền, '#424242' xám đậm cho chữ tên) — KHÔNG cần sửa bất kỳ paint
            // expression nào của 4 lớp staff-dot-core/staff-territory-line-primary/
            // -secondary/staff-territory-hull-line. Tắt luôn vòng sáng cảnh báo (ringType=
            // 'none') vì cảnh báo quá tải/thiếu đơn không còn ý nghĩa với người đã nghỉ.
            const hrmDisplay = resolveHrmDisplay_(shared.driverId);
            if (hrmDisplay.isInactive) {
                combined.coreColor = 'gray';
                combined.ringType = 'none';
            }

            territories.push({
                staffKey: shared.staffKey, driverName: shared.driverName, tripDate: shared.tripDate, hubId: shared.hubId,
                driverId: shared.driverId,
                // v1.7.5 — trạng thái nhân sự (HRM) — dùng ở popup (staffDotPopupHtml_) +
                // nhãn tên trên bản đồ (computeStaffDotFeatures_ ghép thêm hậu tố trạng thái
                // vào tên nếu isInactive) + bảng "Theo Nhân Viên".
                hrmStatus: hrmDisplay,
                // v1.7.13/v1.7.14 — nhóm trạng thái làm việc DÙNG ĐỂ LỌC toàn bộ chấm/ranh
                // giới/nhãn tên trên bản đồ (Đang làm việc/Nghỉ việc/Tạm Nghỉ/Hỗ trợ-Điều
                // chuyển) — xem staffWorkStatusCategory_/applyStaffStatusFilter_.
                workStatusCategory: staffWorkStatusCategory_(hrmDisplay, shared.driverId, shared.hubId),
                // v1.7.13 — mã bưu cục "nhà" theo HRM (buuCuc) — dùng để hiện dòng "Đi hỗ trợ
                // bưu cục X" trong popup khi workStatusCategory === 'SUPPORT' (xem
                // staffDotPopupHtml_), giúp người xem biết NGAY nhân viên này thuộc bưu cục nào.
                homeHubCode: hrmHomeHubCode_(shared.driverId),
                anchor,
                primaryWardCode: primary.wardCode,
                primaryWardName: ward ? ward.name : primary.wardCode,
                wards: qualifying.map((w, i) => ({
                    wardCode: w.wardCode,
                    wardName: (state.wardsByCode && state.wardsByCode[w.wardCode]) ? state.wardsByCode[w.wardCode].name : w.wardCode,
                    isPrimary: i === 0,
                    isPhuong: isPhuongList[i],
                    giaoCount: w.giaoCount, giaoSuccess: w.giaoSuccess, wardShare: w.wardShare
                    // KHÔNG còn field giaoStatus riêng/xã-phường — xem giải thích combinedGiao ở trên.
                })),
                dayTotalGiao: shared.dayTotalGiao, dayTotalGiaoSuccess: shared.dayTotalGiaoSuccess,
                // v1.7.4: dayCount (số ngày thật đã gộp) + dayTotalGiaoAvg (trung bình đơn/
                // ngày, DÙNG ĐỂ SO NGƯỠNG — xem combinedGiao ở trên) — thêm để hiển thị rõ
                // cho người dùng tự kiểm chứng, không chỉ ẩn trong hậu trường.
                dayCount: shared.dayCount, dayTotalGiaoAvg: shared.dayTotalGiaoAvg,
                dayGroupCounts: shared.dayGroupCounts,
                unmatchedCount: shared.unmatchedCount, fromGhnField: shared.fromGhnField, fromFuzzyMatch: shared.fromFuzzyMatch,
                hasPick: !!pickInfo,
                pickCount: pickInfo ? pickInfo.count : 0, pickTotal: pickInfo ? pickInfo.total : 0,
                pickHubTotal: pickInfo ? pickInfo.hubTotal : 0, pickSharePct: pickInfo ? Math.round(pickInfo.share * 100) : 0,
                // v1.7.3: nhóm khách hàng CHO ĐƠN LẤY (mirror của dayGroupCounts nhưng cho pick) —
                // lấy thẳng từ pickInfo.groupCounts (đã tính sẵn trong computePickShareByStaff_()).
                pickGroupCounts: pickInfo ? pickInfo.groupCounts : { TTS: 0, Shopee: 0, SME: 0, Khac: 0 },
                pickStatus: pick || '',
                coreColor: combined.coreColor, ringType: combined.ringType, giaoStatus: combinedGiao
            });
        });
        return territories;
    }

    // Gộp TOÀN BỘ đơn GIAO theo (xã/phường, ngày) — biết ĐẦY ĐỦ những ai (không chỉ 1
    // nhân viên) có phát sinh đơn giao ở xã/phường đó hôm đó + số đơn/toạ độ GPS của từng
    // người — dùng làm CƠ SỞ chia "múi" (xem buildWardWedgeFeature_) theo ĐÚNG % thực tế,
    // không chỉ tính riêng người đang xem (đúng ví dụ người dùng đưa: "Ba Hàng tổng 100
    // đơn của 4 người, Mẫn 19 đơn -> chiếm đúng 19% diện tích", không phải 19% trên tổng
    // của riêng Mẫn).
    function computeWardStaffBreakdown_(rows) {
        const byWardDay = new Map(); // "wardCode\u0001tripDate" -> Map(staffKey -> {count, driverName, points:[[lng,lat]]})
        rows.forEach(r => {
            if (r.type !== 'DELIVER') return;
            const oc = resolveOldWardCode_(r); // v1.7.24
            if (!oc) return;
            const wKey = `${oc}\u0001${r.tripDate}`;
            if (!byWardDay.has(wKey)) byWardDay.set(wKey, new Map());
            const staffMap = byWardDay.get(wKey);
            if (!staffMap.has(r.staffKey)) staffMap.set(r.staffKey, { count: 0, driverName: r.driverName, points: [] });
            const s = staffMap.get(r.staffKey);
            s.count += 1;
            { const llv = vnLatLng_(r.lat, r.lng); if (llv) s.points.push([llv[1], llv[0]]); }
        });
        return byWardDay;
    }

    // Hướng TRUNG BÌNH (circular mean, độ, 0=Bắc thuận chiều kim đồng hồ — đúng quy ước
    // turf.bearing) của 1 nhóm điểm GPS nhìn từ 1 tâm — dùng cộng vector đơn vị rồi lấy
    // atan2 (không thể cộng-chia trung bình thường vì góc có điểm "vòng lại" ở ±180°).
    function meanBearing_(center, points) {
        if (!points.length) return 0;
        let sx = 0, sy = 0;
        points.forEach(pt => {
            const rad = turf.bearing(center, pt) * Math.PI / 180;
            sx += Math.cos(rad); sy += Math.sin(rad);
        });
        if (sx === 0 && sy === 0) return 0;
        return Math.atan2(sy, sx) * 180 / Math.PI;
    }

    // Cắt 1 "múi" (hình quạt, như múi bánh) của 1 xã/phường cho ĐÚNG 1 người trong số
    // nhiều người cùng có đơn giao ở đó hôm đó — độ RỘNG múi = ĐÚNG % số đơn của người đó
    // / tổng đơn CẢ xã/phường (không phải % trong ngày của riêng người đó); HƯỚNG múi đặt
    // theo hướng GPS TRUNG BÌNH thật của người đó (so với tâm xã/phường) — người này giao
    // ở phía đông xã/phường thì múi của họ cũng nằm phía đông. Xếp TẤT CẢ người theo đúng
    // thứ tự góc thật (không chồng lấn), rồi cắt múi bằng turf.sector + turf.intersect với
    // đúng ranh giới xã/phường — múi luôn nằm GỌN trong ranh giới thật, không tràn ra
    // ngoài. LƯU Ý (không giấu): đây là MÔ PHỎNG gần đúng (diện tích múi tỷ lệ theo GÓC,
    // không hoàn toàn tỷ lệ theo DIỆN TÍCH thật nếu xã/phường có hình dạng bất thường/góc
    // cạnh — sai số thực nghiệm khoảng vài %) — không phải ranh giới tuyến đường thật.
    function buildWardWedgeFeature_(wardFeature, staffMapForWard, targetStaffKey) {
        if (!staffMapForWard || !staffMapForWard.has(targetStaffKey)) return null;
        const totalCount = Array.from(staffMapForWard.values()).reduce((s, v) => s + v.count, 0);
        if (totalCount <= 0) return null;
        const center = turf.centroid(wardFeature).geometry.coordinates;
        const entries = Array.from(staffMapForWard.entries()).map(([staffKey, v]) => ({
            staffKey, count: v.count,
            bearing: v.points.length ? meanBearing_(center, v.points) : 0
        }));
        entries.sort((a, b) => a.bearing - b.bearing);

        let cursor = entries[0].bearing - (entries[0].count / totalCount) * 180;
        let targetRange = null;
        entries.forEach(e => {
            const width = (e.count / totalCount) * 360;
            const b1 = cursor, b2 = cursor + width;
            if (e.staffKey === targetStaffKey) targetRange = { b1, b2 };
            cursor = b2;
        });
        if (!targetRange) return null;

        const bbox = turf.bbox(wardFeature);
        const radiusKm = Math.max(turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]], { units: 'kilometers' }), 0.5);
        let sectorPoly;
        try { sectorPoly = turf.sector(center, radiusKm, targetRange.b1, targetRange.b2, { units: 'kilometers' }); }
        catch (e) { return null; }
        try { return turf.intersect(wardFeature, sectorPoly); } catch (e) { return null; }
    }

    // Ghép NHIỀU mảnh (Polygon/MultiPolygon) thành 1 hình — ưu tiên turf.union (mảnh nào
    // CHUNG ranh giới sẽ tự DÍNH LIỀN, xoá luôn đường nối giữa 2 mảnh -> ra đúng 1 đường
    // viền liền mạch duy nhất, đúng yêu cầu "phải ra được đường line màu xanh kia"); nếu
    // union lỗi (hiếm, hình học không hợp lệ) -> gộp thô bằng cách nối trực tiếp mảng toạ
    // độ thành 1 MultiPolygon (vẫn hiện đủ, chỉ còn thấy đường nối giữa các mảnh).
    // v1.6.2b — SỬA LỖI "vùng giao không liền mạch" người dùng phát hiện trên dữ liệu
    // THẬT (Node test trước đó dùng 2 xã hình vuông TỰ VẼ, ranh giới trùng khít tuyệt đối
    // nên không phát hiện ra lỗi này). Nguyên nhân THẬT: xã/phường CHÍNH và xã/phường PHỤ
    // là 2 polygon LƯU RIÊNG trong dữ liệu wardsOldEnriched gốc — dù về mặt hành chính
    // "chung 1 đường ranh giới", toạ độ đường viền đó ở 2 polygon có thể lệch nhau vài mm~
    // vài mét do sai số số hoá dữ liệu gốc (RẤT PHỔ BIẾN với dữ liệu ranh giới hành chính
    // thật, khác hẳn 2 hình vuông tự vẽ trùng khít trong test) => turf.union coi 2 mảnh là
    // "không thật sự chạm nhau" => trả về MultiPolygon (2 vùng RỜI RẠC trên bản đồ) dù về
    // logic phải là 1 tuyến giao liền mạch. Đã tự kiểm chứng lại bằng Node với 2 mảnh CỐ Ý
    // để hở ~3m (mô phỏng đúng sai số dữ liệu thật): turf.union thường (không buffer) ra
    // MultiPolygon; SAU KHI nới rộng (buffer) mỗi mảnh thêm 5m rồi mới union thì ra ĐÚNG 1
    // Polygon liền mạch. SỬA: nới mỗi mảnh thêm 5m (turf.buffer) trước khi union — 5m là
    // sai số không đáng kể so với quy mô 1 xã/phường (hàng trăm mét đến vài km) nhưng đủ để
    // "nuốt" mọi khe hở làm tròn số của dữ liệu ranh giới hành chính gốc, đảm bảo LUÔN ra 1
    // hình liền mạch thay vì bị vỡ thành nhiều mảnh rời rạc.
    function unionFeatures_(features) {
        const valid = features.filter(Boolean);
        if (!valid.length) return null;
        const GAP_FIX_BUFFER_KM = 0.005; // ~5m, xem giải thích ở trên
        const buffered = valid.map(f => {
            try {
                const b = turf.buffer(f, GAP_FIX_BUFFER_KM, { units: 'kilometers' });
                return (b && b.geometry) ? b : f;
            } catch (e) { return f; }
        });
        let acc = buffered[0];
        for (let i = 1; i < buffered.length; i++) {
            let merged = null;
            try { merged = turf.union(acc, buffered[i]); } catch (e) { merged = null; }
            acc = merged || combinePolygonsRaw_(acc, buffered[i]);
        }
        return acc;
    }
    function combinePolygonsRaw_(a, b) {
        const polys = [];
        [a, b].forEach(f => {
            if (!f || !f.geometry) return;
            if (f.geometry.type === 'Polygon') polys.push(f.geometry.coordinates);
            else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates.forEach(c => polys.push(c));
        });
        return polys.length ? turf.multiPolygon(polys) : null;
    }

    // "Vùng giao thực tế" (v1.6.2 — ĐỔI KỸ THUẬT so với v1.6.1). v1.6.1 tự vẽ concave hull
    // TRỰC TIẾP từ điểm GPS thô — người dùng phản hồi "nhìn quá rối" (điểm GPS thực tế lấm
    // chấm/lệch nhau khiến hull ra hình răng cưa, chồng chéo nhiều nhân viên cùng lúc rất
    // khó nhìn). Đổi sang kỹ thuật GHÉP MÚI: xã/phường CHÍNH giữ NGUYÊN VẸN (100%, đúng ví
    // dụ "vẽ vùng là 100% Phường Nam Tiến"), mỗi xã/phường PHỤ được CẮT thành 1 múi đúng %
    // đơn thực tế của người đó trong xã/phường đó (xem buildWardWedgeFeature_ — đúng ví dụ
    // "19% Phường Ba Hàng"), rồi GHÉP LIỀN (unionFeatures_) tất cả các mảnh thành 1 hình
    // DUY NHẤT/1 nhân viên/ngày. Đường biên ra được là ĐA GIÁC RÕ RÀNG, SẠCH — không còn
    // hình răng cưa từ hull thô — mà vẫn "dùng GPS" đúng như yêu cầu: GPS chỉ dùng để chọn
    // HƯỚNG cắt múi (mô phỏng lý tưởng dựa trên dữ liệu hiện có), không dùng để vẽ trực
    // tiếp đường biên nữa.
    function computeStaffTerritoryShapes_(rows, territories, wardGeomIdx) {
        const wardBreakdown = computeWardStaffBreakdown_(rows);
        const features = [];
        territories.forEach(t => {
            const pieces = [];
            t.wards.forEach(w => {
                const geom = wardGeomIdx[w.wardCode];
                if (!geom) return;
                const wardFeature = turf.feature(geom);
                if (w.isPrimary) {
                    pieces.push(wardFeature);
                } else {
                    const key = `${w.wardCode}\u0001${t.tripDate}`;
                    const staffMap = wardBreakdown.get(key);
                    const wedge = staffMap ? buildWardWedgeFeature_(wardFeature, staffMap, t.staffKey) : null;
                    // Không cắt được múi (hiếm, VD hình học lỗi) -> vẫn hiện NGUYÊN xã/phường
                    // đó, còn hơn bỏ trắng hẳn phần này của tuyến giao.
                    pieces.push(wedge || wardFeature);
                }
            });
            if (!pieces.length) return;
            const shape = unionFeatures_(pieces);
            if (!shape || !shape.geometry) return;
            features.push({
                type: 'Feature',
                geometry: shape.geometry,
                properties: {
                    staffKey: t.staffKey, driverName: t.driverName, tripDate: t.tripDate,
                    territoryKey: `${t.staffKey}\u0001${t.tripDate}`,
                    coreColor: t.coreColor, wardCount: t.wards.length
                }
            });
        });
        return { type: 'FeatureCollection', features };
    }

        // Với mỗi (bưu cục, ngày): % đơn LẤY THÀNH CÔNG của từng nhân viên / tổng lấy
    // thành công CẢ bưu cục ngày đó.
    function computePickShareByStaff_(rows) {
        const hubDayTotal = new Map();
        rows.forEach(r => {
            if (r.type === 'PICK' && r.isUpdated && r.isSucceeded) {
                const hkey = `${r.hubId}${r.tripDate}`;
                hubDayTotal.set(hkey, (hubDayTotal.get(hkey) || 0) + 1);
            }
        });
        const perStaff = new Map();
        rows.forEach(r => {
            if (r.type !== 'PICK') return;
            const key = `${r.hubId}${r.tripDate}${r.staffKey}`;
            if (!perStaff.has(key)) {
                perStaff.set(key, {
                    count: 0, total: 0, driverName: r.driverName, hubId: r.hubId, tripDate: r.tripDate, staffKey: r.staffKey,
                    // v1.7.3 -- nhom khach hang CHO DON LAY, dung cung cach dem voi "Nhom
                    // khach hang (don giao)" (dayGroupCounts o computeStaffWardAssignments_):
                    // dem TONG don LAY theo nhom, KHONG chi don thanh cong -- xem groupLine2
                    // o staffDotPopupHtml_().
                    groupCounts: { TTS: 0, Shopee: 0, SME: 0, Khac: 0 }
                });
            }
            const v = perStaff.get(key);
            v.total += 1;
            if (r.isUpdated && r.isSucceeded) v.count += 1;
            if (v.groupCounts[r.customerGroup] !== undefined) v.groupCounts[r.customerGroup] += 1;
        });
        const result = new Map(); // staffKeytripDate -> {count, total, hubTotal, share, groupCounts}
        perStaff.forEach(v => {
            if (v.count === 0) return; // không có đơn lấy thành công nào -> giữ hasPick=false ở nơi gọi
            const hubTotal = hubDayTotal.get(`${v.hubId}${v.tripDate}`) || 0;
            result.set(`${v.staffKey}${v.tripDate}`, {
                count: v.count, total: v.total, hubTotal, share: hubTotal > 0 ? v.count / hubTotal : 0,
                groupCounts: v.groupCounts
            });
        });
        return result;
    }

    // Gộp trạng thái Giao + Lấy -> 1 màu LÕI (nặng hơn thắng) + 1 loại VÒNG SÁNG (chỉ
    // hiện khi có đỏ, ưu tiên Giao vì Giao gắn với vị trí đặt chấm).
    function combineStaffDotStatus_(giao, pick) {
        const rank = (s) => (s === 'red_over' || s === 'red_under' || s === 'red') ? 2 : (s === 'yellow') ? 1 : (s === 'green') ? 0 : -1;
        const giaoRank = rank(giao);
        const pickRank = rank(pick);
        const maxRank = Math.max(giaoRank, pickRank);
        const coreColor = maxRank === 2 ? 'red' : maxRank === 1 ? 'yellow' : maxRank === 0 ? 'green' : 'gray';
        let ringType = 'none';
        if (giao === 'red_over') ringType = 'over';
        else if (giao === 'red_under') ringType = 'under';
        else if (pick === 'red') ringType = 'pickup_over';
        return { coreColor, ringType };
    }

    // Toạ độ đặt chấm: tâm state.wardCentroids (nếu có, key = ward_code CŨ), fallback =
    // tâm bbox polygon ranh giới CŨ đã tải (wardCode ở đây LÀ ward_code CŨ — xem
    // buildWardMatchIndex_ ở v1.5.3, đã đổi lại đúng nguồn state.wards).
    function centroidForWard_(wardCode) {
        const c = state.wardCentroids && state.wardCentroids[wardCode];
        if (Array.isArray(c) && c.length >= 2) return c;
        const feat = state.wardsOldEnriched && state.wardsOldEnriched.features.find(f => String(f.properties.ward_code) === wardCode);
        if (!feat) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const rings = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates] : (feat.geometry.coordinates || []);
        rings.forEach(poly => (poly || []).forEach(ring => (ring || []).forEach(pt => {
            if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
        })));
        if (!isFinite(minX)) return null;
        return [(minX + maxX) / 2, (minY + maxY) / 2];
    }

    // Tính TOÀN BỘ TUYẾN GIAO nhân viên từ state.staffRawRows đang có trong bộ nhớ
    // (không gọi API) — gọi lại mỗi khi tải sản lượng mới xong. TỪ v1.6.0: đổi hẳn cách
    // thể hiện trên bản đồ theo đúng 3 yêu cầu người dùng đưa ra (dùng ví dụ thật "Đặng
    // Trần Mẫn" — tuyến giao Xã Nam Tiến + 1 phần Phường Ba Hàng):
    //  1) "Số lượng chấm phải khớp số nhân viên đi làm ngày hôm đó" -> state.staffDotFeatures
    //     giờ chỉ có ĐÚNG 1 điểm / (nhân viên, ngày) có tuyến giao xác định được (đặt tại
    //     xã/phường CHÍNH — nhiều đơn nhất), KHÔNG còn 1 điểm/xã-phường như v1.5.5.
    //  2 + 3) "Thấy được tuyến giao ... có ranh giới ... hiển thị tên nhân viên, bật/tắt
    //     được" -> thêm state.staffTerritoryFeatures (Polygon) = TẤT CẢ xã/phường thuộc
    //     tuyến giao của từng nhân viên (đạt ≥15%), tô viền đậm (xã/phường CHÍNH) hoặc
    //     viền đứt mảnh nhạt hơn (xã/phường PHỤ) quanh đúng ranh giới xã/phường CŨ đã có
    //     sẵn trên bản đồ — xem initMap_() lớp 'staff-territory-line-primary'/'-secondary'.
    //     Tên nhân viên hiện qua lớp symbol riêng 'staff-territory-label-text', bật/tắt
    //     bằng checkbox riêng (không gộp chung với chấm/ranh giới) — xem showStaffNameLabels.
    // v1.7.3 — YÊU CẦU MỚI: "chạy nhiều ngày vẫn phải có tuyến giao CHÍNH dựa trên TỔNG
    // đơn, khi đó nhiều ngày cần gom là tổng của các ngày" — nhưng "vẫn giữ nguyên logic
    // của 1 ngày". Thiết kế: TOÀN BỘ pipeline tính tuyến giao (computeStaffWardAssignments_,
    // computePickShareByStaff_, computeStaffTerritories_...) đều gộp dữ liệu theo CHÌA KHOÁ
    // "staffKey + tripDate" — nếu MỌI dòng của 1 khoảng ngày đang xem đều mang CÙNG 1 giá
    // trị tripDate (thay vì mỗi dòng giữ đúng ngày thật của nó), các hàm đó sẽ TỰ ĐỘNG gộp
    // toàn bộ khoảng ngày lại thành đúng 1 nhóm/nhân viên — mà KHÔNG cần sửa logic bên
    // trong bất kỳ hàm nào (tránh nguy cơ sửa nhầm phần đã kiểm chứng kỹ cho trường hợp 1
    // ngày). Hàm này chỉ làm ĐÚNG 1 việc: nếu dữ liệu đang có NHIỀU ngày khác nhau, nhân
    // bản (clone NÔNG — không đổi object gốc) từng dòng rồi GHI ĐÈ tripDate thành 1 NHÃN GỘP
    // chung (VD "2026-08-18 → 2026-08-20 (gộp 3 ngày)"); CHỈ 1 ngày duy nhất (hoặc rỗng) ->
    // trả về NGUYÊN VẸN mảng gốc, hành vi giữ Y HỆT bản trước — đúng yêu cầu "giữ nguyên
    // logic của 1 ngày". KHÔNG đụng tới state.staffRawRows gốc — bảng "Theo Nhân Viên" (tab
    // cùng tên) vẫn đọc thẳng state.staffRawRows nên vẫn hiện đúng breakdown TỪNG ngày như
    // cũ; chỉ dữ liệu DÙNG ĐỂ VẼ CHẤM/TUYẾN GIAO trên bản đồ mới đi qua hàm này.
    function buildDotComputationRows_(rows) {
        const distinctDates = Array.from(new Set(rows.map(r => r.tripDate).filter(Boolean))).sort();
        if (distinctDates.length <= 1) return rows; // 1 ngày (hoặc không có dữ liệu) -> không đổi gì
        const rangeLabel = `${distinctDates[0]} → ${distinctDates[distinctDates.length - 1]} (gộp ${distinctDates.length} ngày)`;
        // v1.7.4 — gắn thêm mergedDayCount = SỐ NGÀY THẬT đã gộp vào MỖI dòng (đọc lại ở
        // computeStaffWardAssignments_ để tính dayTotalGiaoAvg = tổng/số ngày, dùng so
        // ngưỡng quá tải/thiếu đơn thay vì so thẳng tổng cộng dồn — xem chú thích đầy đủ ở
        // đó). Dòng 1-ngày (nhánh return rows ở trên) không có field này -> mặc định 1.
        return rows.map(r => Object.assign({}, r, { tripDate: rangeLabel, mergedDayCount: distinctDates.length }));
    }

    function computeStaffDotFeatures_() {
        const rows = buildDotComputationRows_(state.staffRawRows || []);
        const territories = computeStaffTerritories_(rows);
        const wardGeomIdx = buildWardGeometryIndex_();

        const pointFeatures = [];
        const polyFeatures = [];
        let unmatched = 0;

        // (nhân viên,ngày) không có ≥1 xã/phường đạt ngưỡng -> không có tuyến xác định
        // được -> không vẽ gì, tính vào unmatched (giữ đúng ý nghĩa cũ của con số này).
        const totalStaffDayCount = new Set(rows.filter(r => r.type === 'DELIVER').map(r => `${r.staffKey}\u0001${r.tripDate}`)).size;
        unmatched = Math.max(0, totalStaffDayCount - territories.length);

        territories.forEach(t => {
            const t_ = giaoThresholdsFor_(t.wards[0].isPhuong);
            pointFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: t.anchor },
                properties: {
                    staffKey: t.staffKey, driverName: t.driverName, tripDate: t.tripDate, hubId: t.hubId,
                    driverId: t.driverId,
                    // v1.7.5 — trạng thái nhân sự (HRM) + nhãn tên có hậu tố trạng thái nếu đã
                    // nghỉ/tạm nghỉ (VD "Lê Huy Hoàng (Nghỉ việc)") — dùng cho lớp
                    // 'staff-territory-label-text' (text-field, xem initMap_) thay vì driverName
                    // trần như trước, để "có thông tin trạng thái nghỉ ... ở ngay tên nhân viên"
                    // đúng yêu cầu, hiện NGAY trên bản đồ chứ không chỉ trong popup.
                    hrmStatus: t.hrmStatus,
                    // v1.7.13/v1.7.14 — nhóm trạng thái làm việc (xem staffWorkStatusCategory_)
                    // — dùng làm filter của TOÀN BỘ lớp "Tuyến giao nhân viên" (chấm/ranh giới/
                    // nhãn tên, xem STAFF_STATUS_FILTERED_LAYERS_/applyStaffStatusFilter_).
                    workStatusCategory: t.workStatusCategory,
                    homeHubCode: t.homeHubCode,
                    // v1.7.6 — SỬA LỖI hậu tố trạng thái bị MapLibre XUỐNG DÒNG (do
                    // 'text-max-width' của lớp nhãn + khoảng trắng thường giữa tên và "(...)"
                    // bị coi là điểm ngắt dòng hợp lệ), khiến dòng 2 chèn/chồng lên nhãn nhân
                    // viên KHÁC ở gần đó (ảnh chụp "Đinh Ngọc Hưng (Nghỉ việc)" đè lên "Nguyễn
                    // Lê Hùng"/"Nguyễn Văn Bình"). Thay TOÀN BỘ khoảng trắng NỐI hậu tố (trước
                    // dấu "(" và giữa các từ trong hậu tố, ví dụ "Nghỉ việc") bằng khoảng trắng
                    // KHÔNG NGẮT DÒNG (U+00A0) — MapLibre chỉ ngắt dòng tại khoảng trắng
                    // THƯỜNG nên hậu tố giờ LUÔN dính liền cùng 1 dòng với tên, "kéo dài cùng
                    // với tên chứ không xuống dòng" đúng yêu cầu. Khoảng trắng NỘI BỘ trong tên
                    // (driverName) vẫn giữ nguyên bình thường — tên rất dài (hiếm) vẫn có thể tự
                    // xuống dòng như trước, chỉ riêng hậu tố là không tách rời khỏi dòng cuối.
                    driverLabelText: t.hrmStatus.isInactive
                        ? `${t.driverName} (${t.hrmStatus.label.replace(/ /g, ' ')})`
                        : t.driverName,
                    hubName: hubNameForStaffTable_(t.hubId),
                    territoryKey: `${t.staffKey}${t.tripDate}`,
                    primaryWardCode: t.primaryWardCode, primaryWardName: t.primaryWardName,
                    wardCount: t.wards.length,
                    // Danh sách ĐẦY ĐỦ xã/phường thuộc tuyến giao — dùng để vẽ popup chi
                    // tiết khi bấm vào chấm/ranh giới (staffDotPopupHtml_ đọc mảng này).
                    wards: t.wards,
                    giaoStatus: t.giaoStatus,
                    // v1.7.4: ghi rõ "/ngày" vì ngưỡng so với TRUNG BÌNH/NGÀY (dayTotalGiaoAvg),
                    // không phải tổng cộng dồn — tránh hiểu lầm khi xem nhiều ngày gộp lại.
                    giaoThresholdText: `>${t_.red} đỏ · ${t_.yellowMin}-${t_.red} vàng · ${t_.greenMin}-${t_.yellowMin} xanh · <${t_.greenMin} không đủ (đơn/ngày)`,
                    dayTotalGiao: t.dayTotalGiao, dayTotalGiaoSuccess: t.dayTotalGiaoSuccess,
                    // v1.7.4: số ngày thật đã gộp + trung bình đơn/ngày (làm tròn 1 chữ số
                    // thập phân) — hiện trong popup để người dùng tự kiểm chứng cách tính
                    // trạng thái quá tải/thiếu đơn (xem computeStaffTerritories_).
                    dayCount: t.dayCount, dayTotalGiaoAvg: Math.round(t.dayTotalGiaoAvg * 10) / 10,
                    groupTTS: t.dayGroupCounts.TTS, groupShopee: t.dayGroupCounts.Shopee, groupSME: t.dayGroupCounts.SME, groupKhac: t.dayGroupCounts.Khac,
                    hasPick: t.hasPick, pickCount: t.pickCount, pickTotal: t.pickTotal,
                    pickSuccessPct: t.pickTotal > 0 ? Math.round((t.pickCount / t.pickTotal) * 100) : 0,
                    pickHubTotal: t.pickHubTotal, pickSharePct: t.pickSharePct, pickStatus: t.pickStatus,
                    // v1.7.3: nhóm khách hàng CHO ĐƠN LẤY — mirror groupTTS/groupShopee/... ở trên
                    // nhưng đọc từ pickGroupCounts (xem computeStaffTerritories_).
                    pickGroupTTS: t.pickGroupCounts.TTS, pickGroupShopee: t.pickGroupCounts.Shopee,
                    pickGroupSME: t.pickGroupCounts.SME, pickGroupKhac: t.pickGroupCounts.Khac,
                    coreColor: t.coreColor, ringType: t.ringType
                }
            });

            t.wards.forEach(w => {
                const geom = wardGeomIdx[w.wardCode];
                if (!geom) return; // không có hình học ranh giới (hiếm) -> chấm vẫn lên, chỉ thiếu viền xã/phường này
                polyFeatures.push({
                    type: 'Feature',
                    geometry: geom,
                    properties: {
                        staffKey: t.staffKey, driverName: t.driverName, tripDate: t.tripDate,
                        wardCode: w.wardCode, wardName: w.wardName, isPrimary: w.isPrimary,
                        giaoCount: w.giaoCount, wardShare: Math.round(w.wardShare * 100),
                        coreColor: t.coreColor
                    }
                });
            });
        });

        state.staffDotFeatures = { type: 'FeatureCollection', features: pointFeatures };
        state.staffTerritoryFeatures = { type: 'FeatureCollection', features: polyFeatures };
        // "Vùng giao thực tế" — ghép múi theo % thực tế + hướng GPS (v1.6.2) — xem
        // computeStaffTerritoryShapes_().
        state.staffTerritoryHullFeatures = computeStaffTerritoryShapes_(rows, territories, wardGeomIdx);
        state.staffDotUnmatchedCount = unmatched;
        return state.staffDotFeatures;
    }

    // Tính lại chấm cảnh báo nhân viên từ state.staffRawRows rồi đẩy lên bản đồ (nếu bản đồ
    // đã khởi tạo) + tự BẬT checkbox hiển thị. Gọi sau mỗi lần tải/refresh sản lượng ở tab
    // Theo Nhân Viên. An toàn khi gọi trước khi tab Bản Đồ từng được mở (map/checkbox chưa
    // tồn tại) — dữ liệu vẫn được chuẩn bị sẵn, initMap_() sẽ đọc state.staffDotFeatures/
    // state.staffTerritoryFeatures/state.staffTerritoryHullFeatures khi tạo các nguồn
    // 'staff-dots'/'staff-territory'/'staff-territory-hull'.
    function updateStaffDotsOnMap_() {
        buildWardMatchIndex_(); // luôn dựng lại từ state.wards MỚI NHẤT (không dùng bản cache cũ có thể rỗng nếu wards tải xong SAU lần gọi trước)
        computeStaffDotFeatures_();
        state.showStaffDots = true;
        const cb = document.getElementById('ghn-tg-staff-dots-checkbox');
        if (cb) cb.checked = true;
        if (state.map && state.map.getSource('staff-dots')) {
            state.map.getSource('staff-dots').setData(state.staffDotFeatures);
        }
        if (state.map && state.map.getSource('staff-territory')) {
            state.map.getSource('staff-territory').setData(state.staffTerritoryFeatures);
        }
        if (state.map && state.map.getSource('staff-territory-hull')) {
            state.map.getSource('staff-territory-hull').setData(state.staffTerritoryHullFeatures);
        }
        applyStaffDotVisibility_();
    }

    // ==================== PHÂN QUYỀN (v1.7.0) ====================
    function escapeHtml_(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Xác thực danh tính (fetchGhnProfile_) rồi tra quyền trên sheet PhanQuyen qua GAS.
    // Gọi 1 LẦN mỗi lần mở cửa sổ modul, TRƯỚC KHI build bất kỳ tab/panel nào — xem
    // openWindow_(). Trả về {allowed, profile, reason?, error?} — KHÔNG throw, để
    // openWindow_() luôn xử lý được gọn 1 nhánh if/else.
    async function checkPermissionAndGate_() {
        let profile;
        try {
            profile = await fetchGhnProfile_();
        } catch (err) {
            return { allowed: false, reason: 'error', error: err && err.message ? err.message : String(err) };
        }
        state.currentUser = profile;
        try {
            const res = await gasGet_('getPermission', { ssoId: profile.ssoId });
            if (!res.ok) throw new Error(res.error || 'Không kiểm tra được quyền truy cập.');
            if (!res.found) {
                state.permission = null;
                state.permissionChecked = true;
                return { allowed: false, reason: 'not_found', profile };
            }
            state.permission = { role: res.role, hubCodes: res.hubCodes || [] };
            state.permissionChecked = true;
            return { allowed: true, profile };
        } catch (err) {
            return { allowed: false, reason: 'error', profile, error: err && err.message ? err.message : String(err) };
        }
    }

    function buildAccessDeniedHtml_(gate) {
        if (gate.reason === 'error') {
            return `
                <div style="padding:40px 30px; text-align:center;">
                    <div style="font-size:32px; margin-bottom:10px;">❌</div>
                    <div style="font-weight:700; color:#e03131; margin-bottom:8px;">Không xác thực/kiểm tra được quyền truy cập</div>
                    <div style="color:#868e96; font-size:13px; margin-bottom:16px;">${escapeHtml_(gate.error || '')}</div>
                    <div style="color:#495057; font-size:13px;">Thử thao tác gì đó trên trang nhanh.ghn.vn (VD mở 1 đơn hàng) rồi đóng/mở lại modul.</div>
                </div>`;
        }
        const p = gate.profile || {};
        return `
            <div style="padding:40px 30px; text-align:center;">
                <div style="font-size:32px; margin-bottom:10px;">🔒</div>
                <div style="font-weight:700; color:#495057; margin-bottom:14px;">Bạn chưa được cấp quyền dùng Modul Tuyến Giao</div>
                <div style="display:inline-block; text-align:left; background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:14px 18px; font-size:13px; color:#495057; line-height:1.8;">
                    SSO ID: <b>${escapeHtml_(p.ssoId || '?')}</b>
                    <button id="ghn-tg-copy-ssoid-btn" style="margin-left:8px; font-size:11px; padding:2px 8px; cursor:pointer; border:1px solid #ced4da; border-radius:4px; background:#fff;">📋 Copy</button>
                    <br>Họ tên: <b>${escapeHtml_(p.fullname || '?')}</b>
                </div>
                <div style="color:#868e96; font-size:13px; margin-top:16px;">Gửi 2 thông tin trên cho Admin (qua nút "🔐 Quản Trị" trong modul của Admin) để được cấp quyền xem bản đồ tuyến giao.</div>
            </div>`;
    }

    function wireAccessDeniedControls_(gate) {
        const copyBtn = document.getElementById('ghn-tg-copy-ssoid-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const ssoId = (gate.profile && gate.profile.ssoId) || '';
                navigator.clipboard?.writeText(ssoId).then(() => {
                    copyBtn.textContent = '✅ Đã copy';
                    setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
                }).catch(() => {});
            });
        }
    }

    // ---- Popup "🔐 Quản Trị" (chỉ ADMIN mới thấy nút mở) — quản lý sheet PhanQuyen:
    // thêm/sửa/xoá người dùng + gán vai trò/mã bưu cục, và 1 nút mở nhanh tab đăng nhập
    // quyhoachbuucuc.info (chỉ MỞ TAB, không tự động điền tài khoản/mật khẩu gì cả).
    function roleLabel_(role) {
        if (role === 'ADMIN') return 'Admin';
        if (role === 'QUAN_LY') return 'Quản lý';
        if (role === 'NHAN_VIEN') return 'Nhân viên xử lý';
        return role || '?';
    }

    function buildAdminModalHtml_() {
        const hubHint = (state.hubs || []).map(h => h.hub_code).join(', ') || '(chưa có dữ liệu bưu cục)';
        return `
            <div id="ghn-tg-admin-overlay">
                <div id="ghn-tg-admin-modal">
                    <div id="ghn-tg-admin-modal-header">
                        <span>🔐 Quản Trị Phân Quyền — Modul Tuyến Giao</span>
                        <button id="ghn-tg-admin-close-btn" title="Đóng">✕</button>
                    </div>
                    <div id="ghn-tg-admin-modal-body">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:10px; flex-wrap:wrap;">
                            <div style="font-size:12px; color:#868e96;">Mã bưu cục hợp lệ hiện có: <b>${escapeHtml_(hubHint)}</b></div>
                            <button id="ghn-tg-admin-open-quyhoach-btn" style="padding:6px 12px; border-radius:6px; border:1px solid #ced4da; background:#fff; color:#495057; font-size:12px; cursor:pointer;">🔗 Đăng nhập quyhoachbuucuc.info (mở tab mới)</button>
                        </div>
                        <div id="ghn-tg-admin-status" style="font-size:12px; color:#868e96; margin-bottom:8px;">Đang tải danh sách...</div>
                        <div style="overflow-x:auto;">
                            <table id="ghn-tg-admin-table" style="width:100%; border-collapse:collapse; font-size:12px;">
                                <thead>
                                    <tr style="background:#f8f9fa; text-align:left;">
                                        <th style="padding:6px 8px; border-bottom:1px solid #e9ecef;">SSO ID</th>
                                        <th style="padding:6px 8px; border-bottom:1px solid #e9ecef;">Họ Tên</th>
                                        <th style="padding:6px 8px; border-bottom:1px solid #e9ecef;">Vai Trò</th>
                                        <th style="padding:6px 8px; border-bottom:1px solid #e9ecef;">Mã Bưu Cục</th>
                                        <th style="padding:6px 8px; border-bottom:1px solid #e9ecef;">Trạng Thái</th>
                                        <th style="padding:6px 8px; border-bottom:1px solid #e9ecef;">Ghi Chú</th>
                                        <th style="padding:6px 8px; border-bottom:1px solid #e9ecef;"></th>
                                    </tr>
                                </thead>
                                <tbody id="ghn-tg-admin-tbody"></tbody>
                            </table>
                        </div>
                        <button id="ghn-tg-admin-add-row-btn" style="margin-top:10px; padding:6px 12px; border-radius:6px; border:1px solid #ced4da; background:#fff; color:#495057; font-size:12px; cursor:pointer;">➕ Thêm người dùng mới</button>
                    </div>
                </div>
            </div>`;
    }

    // v1.7.1 — THÊM nút "✏️ Sửa" rõ ràng. Trước đây các dòng đã lưu vẫn cho sửa được TRỰC
    // TIẾP trên các ô input (không disabled) — chỉ có SSO ID là readonly — nhưng người
    // dùng phản hồi "đang chỉ thấy mỗi thêm mới, xoá, lưu", tức là không nhận ra được các
    // ô đó bấm/gõ sửa được luôn, dễ gây sửa nhầm ngoài ý muốn. SỬA: mặc định mọi dòng ĐÃ
    // LƯU hiện ở chế độ CHỈ XEM (mọi ô input/select "disabled", xám, rõ ràng không sửa
    // được) kèm 1 nút "✏️ Sửa" — bấm vào mới mở khoá sửa (đổi thành "💾 Lưu" + "✖ Huỷ").
    // Dòng MỚI THÊM (chưa có ssoId) vẫn ở thẳng chế độ sửa như cũ (không cần bấm "Sửa").
    function adminRowHtml_(u, opts) {
        const editable = !!(opts && opts.editable);
        const isNew = !u.ssoId;
        const roles = ['ADMIN', 'QUAN_LY', 'NHAN_VIEN'];
        const statuses = ['Hoạt động', 'Khoá'];
        const dis = editable ? '' : 'disabled';
        const hubDis = (!editable || u.vaiTro === 'ADMIN') ? 'disabled' : '';
        const actionsHtml = editable
            ? `<button class="ghn-tg-admin-save-row-btn" style="padding:3px 8px; border-radius:4px; border:1px solid #339af0; background:#e7f5ff; color:#1971c2; font-size:11px; cursor:pointer;">💾 Lưu</button>` +
              (isNew ? '' : `<button class="ghn-tg-admin-cancel-row-btn" style="padding:3px 8px; border-radius:4px; border:1px solid #ced4da; background:#fff; color:#495057; font-size:11px; cursor:pointer;">✖ Huỷ</button>`)
            : `<button class="ghn-tg-admin-edit-row-btn" style="padding:3px 8px; border-radius:4px; border:1px solid #ffd43b; background:#fff9db; color:#8a6d00; font-size:11px; cursor:pointer;">✏️ Sửa</button>`;
        return `
            <tr data-ssoid="${escapeHtml_(u.ssoId || '')}" data-original-ssoid="${escapeHtml_(u.ssoId || '')}">
                <td style="padding:4px 8px; border-bottom:1px solid #f1f3f5;"><input class="ghn-tg-admin-ssoid" type="text" value="${escapeHtml_(u.ssoId || '')}" style="width:100px;" ${u.ssoId ? 'readonly' : ''}></td>
                <td style="padding:4px 8px; border-bottom:1px solid #f1f3f5;"><input class="ghn-tg-admin-hoten" type="text" value="${escapeHtml_(u.hoTen || '')}" style="width:130px;" ${dis}></td>
                <td style="padding:4px 8px; border-bottom:1px solid #f1f3f5;">
                    <select class="ghn-tg-admin-vaitro" ${dis}>
                        ${roles.map(r => `<option value="${r}" ${u.vaiTro === r ? 'selected' : ''}>${roleLabel_(r)}</option>`).join('')}
                    </select>
                </td>
                <td style="padding:4px 8px; border-bottom:1px solid #f1f3f5;"><input class="ghn-tg-admin-hubcodes" type="text" placeholder="VD: DBB,THN" value="${escapeHtml_((u.hubCodes || []).join(','))}" style="width:110px;" ${hubDis}></td>
                <td style="padding:4px 8px; border-bottom:1px solid #f1f3f5;">
                    <select class="ghn-tg-admin-trangthai" ${dis}>
                        ${statuses.map(s => `<option value="${s}" ${u.trangThai === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </td>
                <td style="padding:4px 8px; border-bottom:1px solid #f1f3f5;"><input class="ghn-tg-admin-ghichu" type="text" value="${escapeHtml_(u.ghiChu || '')}" style="width:100px;" ${dis}></td>
                <td style="padding:4px 8px; border-bottom:1px solid #f1f3f5; white-space:nowrap;">
                    ${actionsHtml}
                    <button class="ghn-tg-admin-delete-row-btn" style="padding:3px 8px; border-radius:4px; border:1px solid #ff8787; background:#fff5f5; color:#c92a2a; font-size:11px; cursor:pointer;">🗑️ Xoá</button>
                </td>
            </tr>`;
    }

    async function reloadAdminUserList_() {
        const statusEl = document.getElementById('ghn-tg-admin-status');
        const tbody = document.getElementById('ghn-tg-admin-tbody');
        if (!statusEl || !tbody) return;
        statusEl.textContent = 'Đang tải danh sách...';
        try {
            const res = await gasGet_('listUsers', { ssoId: state.currentUser.ssoId });
            if (!res.ok) throw new Error(res.error || 'Không tải được danh sách.');
            // Mọi dòng tải từ server ĐÃ LƯU rồi -> mặc định hiện ở chế độ CHỈ XEM
            // (editable:false), bấm "✏️ Sửa" mới mở khoá — xem giải thích ở adminRowHtml_.
            tbody.innerHTML = res.users.map(u => adminRowHtml_(u, { editable: false })).join('');
            Array.from(tbody.children).forEach((tr, i) => { tr.dataset.userJson = JSON.stringify(res.users[i]); });
            statusEl.textContent = `Tổng ${res.users.length} người dùng.`;
            wireAdminRows_();
        } catch (err) {
            statusEl.textContent = `❌ Lỗi: ${err.message || err}`;
        }
    }

    // Đọc giá trị các ô input HIỆN TẠI trong 1 <tr> ra đúng shape {ssoId, hoTen, vaiTro,
    // hubCodes (MẢNG), trangThai, ghiChu} — GIỐNG shape server trả về (readPhanQuyenRows_)
    // để feed thẳng lại vào adminRowHtml_() khi bật/tắt chế độ sửa mà không mất dữ liệu
    // đang có trên dòng đó. Đọc được kể cả khi input đang "disabled" (chỉ readonly/
    // disabled chặn SỬA, không chặn đọc .value bằng JS).
    function rowDataFromTr_(tr) {
        return {
            ssoId: tr.querySelector('.ghn-tg-admin-ssoid').value.trim(),
            hoTen: tr.querySelector('.ghn-tg-admin-hoten').value.trim(),
            vaiTro: tr.querySelector('.ghn-tg-admin-vaitro').value,
            hubCodes: tr.querySelector('.ghn-tg-admin-hubcodes').value.split(',').map(s => s.trim()).filter(Boolean),
            trangThai: tr.querySelector('.ghn-tg-admin-trangthai').value,
            ghiChu: tr.querySelector('.ghn-tg-admin-ghichu').value.trim()
        };
    }

    // Payload đúng shape API saveUser cần (hubCodes dạng CHUỖI cách nhau dấu phẩy, không
    // phải mảng — khác rowDataFromTr_() ở trên, xem saveUser_() phía GAS).
    function readAdminRowInputs_(tr) {
        return {
            ssoId: tr.querySelector('.ghn-tg-admin-ssoid').value.trim(),
            hoTen: tr.querySelector('.ghn-tg-admin-hoten').value.trim(),
            vaiTro: tr.querySelector('.ghn-tg-admin-vaitro').value,
            hubCodes: tr.querySelector('.ghn-tg-admin-hubcodes').value.trim(),
            trangThai: tr.querySelector('.ghn-tg-admin-trangthai').value,
            ghiChu: tr.querySelector('.ghn-tg-admin-ghichu').value.trim()
        };
    }

    // Vẽ lại 1 dòng <tr> ở chế độ sửa/chỉ-xem khác (dùng cho nút "✏️ Sửa" / "✖ Huỷ") mà
    // KHÔNG cần gọi lại API (Huỷ chỉ cần khôi phục đúng dữ liệu gốc đã lưu ở data-userJson
    // lúc tải danh sách — nhanh, không phụ thuộc mạng).
    function replaceAdminRow_(tr, u, editable) {
        const wrap = document.createElement('tbody');
        wrap.innerHTML = adminRowHtml_(u, { editable });
        const newTr = wrap.firstElementChild;
        newTr.dataset.userJson = JSON.stringify(u);
        tr.replaceWith(newTr);
        wireAdminRow_(newTr);
        return newTr;
    }

    // Gắn sự kiện cho ĐÚNG 1 <tr> — tách riêng khỏi wireAdminRows_() (gắn cho TẤT CẢ dòng)
    // để nút "➕ Thêm người dùng mới" chỉ cần gắn sự kiện cho DÒNG MỚI vừa thêm, không gọi
    // lại wireAdminRows_() trên toàn bảng — TRÁNH LỖI gắn listener TRÙNG LẶP lên các dòng
    // cũ đã có sẵn listener từ trước (dòng cũ không bị tbody.innerHTML xoá lại, DOM node
    // vẫn y nguyên, gọi wireAdminRows_() lần nữa sẽ cộng dồn thêm 1 bộ listener nữa lên
    // chính các dòng đó — bấm Lưu/Xoá 1 lần sẽ chạy 2 lần).
    function wireAdminRow_(tr) {
        const vaiTroSelect = tr.querySelector('.ghn-tg-admin-vaitro');
        const hubInput = tr.querySelector('.ghn-tg-admin-hubcodes');
        if (vaiTroSelect && hubInput) {
            vaiTroSelect.addEventListener('change', () => {
                if (vaiTroSelect.disabled) return;
                hubInput.disabled = vaiTroSelect.value === 'ADMIN';
                if (hubInput.disabled) hubInput.value = '';
            });
        }
        const editBtn = tr.querySelector('.ghn-tg-admin-edit-row-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                replaceAdminRow_(tr, rowDataFromTr_(tr), true);
            });
        }
        const cancelBtn = tr.querySelector('.ghn-tg-admin-cancel-row-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                let original;
                try { original = JSON.parse(tr.dataset.userJson || '{}'); } catch (e) { original = rowDataFromTr_(tr); }
                replaceAdminRow_(tr, original, false);
            });
        }
        const saveBtn = tr.querySelector('.ghn-tg-admin-save-row-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const u = readAdminRowInputs_(tr);
                if (!u.ssoId) { qhAlert_('Thiếu SSO ID.'); return; }
                if (u.vaiTro !== 'ADMIN' && !u.hubCodes) { qhAlert_('Quản lý / Nhân viên xử lý cần nhập ít nhất 1 mã bưu cục.'); return; }
                try {
                    const res = await gasPost_('saveUser', { callerSsoId: state.currentUser.ssoId, user: u });
                    if (!res.ok) throw new Error(res.error || 'Lưu thất bại.');
                    await reloadAdminUserList_();
                } catch (err) {
                    qhAlert_('❌ ' + (err.message || err), 'Lỗi');
                }
            });
        }
        const delBtn = tr.querySelector('.ghn-tg-admin-delete-row-btn');
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                const originalSsoId = tr.dataset.originalSsoid;
                if (!originalSsoId) { tr.remove(); return; } // dòng vừa thêm, chưa lưu -> chỉ cần bỏ khỏi bảng
                if (!(await qhConfirm_(`Xoá quyền của "${originalSsoId}"?`, 'Xoá', 'Xoá quyền', true))) return;
                try {
                    const res = await gasPost_('deleteUser', { callerSsoId: state.currentUser.ssoId, targetSsoId: originalSsoId });
                    if (!res.ok) throw new Error(res.error || 'Xoá thất bại.');
                    await reloadAdminUserList_();
                } catch (err) {
                    qhAlert_('❌ ' + (err.message || err), 'Lỗi');
                }
            });
        }
    }

    function wireAdminRows_() {
        document.querySelectorAll('#ghn-tg-admin-tbody tr').forEach(wireAdminRow_);
    }

    function openAdminModal_() {
        if (document.getElementById('ghn-tg-admin-overlay')) return; // đã mở sẵn
        const wrap = document.createElement('div');
        wrap.innerHTML = buildAdminModalHtml_();
        document.body.appendChild(wrap.firstElementChild);
        document.getElementById('ghn-tg-admin-close-btn').addEventListener('click', () => {
            document.getElementById('ghn-tg-admin-overlay')?.remove();
        });
        document.getElementById('ghn-tg-admin-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'ghn-tg-admin-overlay') e.currentTarget.remove();
        });
        document.getElementById('ghn-tg-admin-open-quyhoach-btn').addEventListener('click', () => {
            window.open('https://www.quyhoachbuucuc.info/web/index.html', '_blank', 'noopener');
        });
        document.getElementById('ghn-tg-admin-add-row-btn').addEventListener('click', () => {
            const tbody = document.getElementById('ghn-tg-admin-tbody');
            const blank = { ssoId: '', hoTen: '', vaiTro: 'NHAN_VIEN', hubCodes: [], trangThai: 'Hoạt động', ghiChu: '' };
            const wrap2 = document.createElement('tbody');
            wrap2.innerHTML = adminRowHtml_(blank, { editable: true }); // dòng mới -> vào thẳng chế độ sửa
            const newTr = wrap2.firstElementChild;
            newTr.dataset.originalSsoid = ''; // dòng mới, chưa có trên Sheet -> Xoá chỉ cần bỏ khỏi bảng
            newTr.dataset.userJson = JSON.stringify(blank);
            tbody.appendChild(newTr);
            // CHỈ gắn sự kiện cho DÒNG MỚI — KHÔNG gọi wireAdminRows_() ở đây (sẽ gắn lặp
            // thêm 1 bộ listener nữa lên các dòng CŨ đã có sẵn listener, xem giải thích ở
            // wireAdminRow_() phía trên).
            wireAdminRow_(newTr);
        });
        reloadAdminUserList_();
    }

    // ==================== GIAO DIỆN ====================
    function injectBaseStyles_() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.3.0/dist/maplibre-gl.css';
        document.head.appendChild(link);

        const style = document.createElement('style');
        style.textContent = `
            .qh-ms { display: inline-flex; align-items: center; border: 1px solid #ced4da; border-radius: 6px; background: #fff; height: 28px; flex: none; }
            .qh-ms.on { border-color: #e8590c; box-shadow: inset 0 0 0 1px #e8590c; }
            .qh-ms > b { font-size: 11.5px; color: #868e96; font-weight: 600; padding: 0 6px; border-right: 1px solid #e9ecef; height: 100%; display: flex; align-items: center; background: #f8f9fa; border-radius: 6px 0 0 6px; }
            .qh-ms input { border: 0; outline: none; font: inherit; font-size: 12px; font-weight: 600; padding: 0 6px; width: 170px; height: 100%; background: none; cursor: pointer; }
            .qh-ms i { font-style: normal; color: #adb5bd; font-size: 10px; padding-right: 6px; pointer-events: none; }
            .qh-ms button { border: 0; background: none; color: #c92a2a; cursor: pointer; font-size: 14px; padding: 0 6px; height: 100%; }
            #qh-msp { position: fixed; z-index: 2147483647; width: 460px; max-width: calc(100vw - 16px); background: #fff; border: 1px solid #ced4da; border-radius: 10px; box-shadow: 0 12px 30px rgba(0,0,0,.22); font-family: -apple-system, Segoe UI, Roboto, sans-serif; overflow: hidden; }
            #qh-msp .h { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 9px 10px 4px; }
            #qh-msp .h b { font-size: 12.5px; color: #868e96; font-weight: 600; margin-right: auto; }
            #qh-msp .h button { border: 1px solid #ced4da; background: #fff; border-radius: 14px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
            #qh-msp .h button.ap { background: #1c7ed6; border-color: #1c7ed6; color: #fff; font-weight: 700; }
            #qh-msp .n { font-size: 11px; color: #adb5bd; padding: 0 10px 6px; border-bottom: 1px solid #f1f3f5; }
            #qh-msp .l { max-height: 320px; overflow: auto; padding: 4px; }
            #qh-msp .it { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
            #qh-msp .it:hover { background: #fff4e6; }
            #qh-msp .ck { width: 14px; height: 14px; border: 1.5px solid #1c7ed6; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: #1c7ed6; flex: none; }
            #qh-msp .it.on .ck::after { content: '✓'; font-weight: 800; }
            #qh-msp .nm { color: #1c7ed6; font-weight: 600; }
            #qh-msp .sb { color: #adb5bd; font-size: 11.5px; margin-left: auto; white-space: nowrap; }
            #qh-msp .one { display: none; border: 1px solid #ced4da; background: #fff; border-radius: 12px; padding: 1px 8px; font-size: 11px; cursor: pointer; color: #1c7ed6; margin-left: auto; white-space: nowrap; }
            #qh-msp .it:hover .one { display: inline-block; } #qh-msp .it:hover .sb { display: none; }
            #qh-msp .e { padding: 12px; color: #adb5bd; font-size: 12.5px; }
            .qh-lab { font-size: 12px; color: #495057; display: inline-flex; align-items: center; gap: 4px; }
            .qh-lab select { max-width: 240px; font-weight: 600; padding: 4px 6px; border-radius: 6px; border: 1px solid #ced4da; }
            .qh-clear { padding: 4px 8px; border-radius: 6px; border: 1px solid #ced4da; background: #fff; color: #868e96; cursor: pointer; font-size: 12px; }
            .qh-clear:hover { color: #c92a2a; border-color: #c92a2a; }
            table.qh-sum { width: 100%; border-collapse: collapse; font-size: 12px; }
            table.qh-sum th { position: sticky; top: 0; background: #f1f3f5; text-align: left; padding: 5px 6px; border-bottom: 1px solid #dee2e6; }
            table.qh-sum td { padding: 4px 6px; border-bottom: 1px solid #f1f3f5; }
            table.qh-sum td:nth-child(n+2), table.qh-sum th:nth-child(n+2) { text-align: right; }
            .qh-bc-link { color: #1c7ed6; text-decoration: underline; }
            .qh-search { width: 210px; padding: 5px 8px; border-radius: 6px; border: 1px solid #ced4da; font-size: 12px; }
            .qh-search:focus { outline: none; border-color: #e8590c; box-shadow: 0 0 0 2px rgba(232,89,12,.15); }
            .qh-cc-badge { font-size: 12px; white-space: nowrap; }
            .qh-cc-badge.qh-cc-intab { align-self: center; margin-left: 10px; padding-bottom: 2px; }
            .qh-cc-ok { color: #1c7ed6; font-weight: 700; cursor: pointer; }
            .qh-cc-warn { color: #c92a2a; font-weight: 700; cursor: pointer; text-decoration: underline; }
            #qh-cc-pop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483600; display: flex; align-items: center; justify-content: center; }
            #qh-cc-pop .box { background: #fff; border-radius: 10px; width: min(860px, 94vw); max-height: 84vh; overflow: auto; padding: 16px 18px; box-shadow: 0 10px 40px rgba(0,0,0,.3); font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
            #qh-cc-pop h4 { margin: 14px 0 6px; font-size: 13px; color: #212529; }
            #qh-cc-pop .sub { font-size: 12px; color: #6c757d; }
            #qh-dlg { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 2147483646; display: flex; align-items: center; justify-content: center; font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
            #qh-dlg .qh-dlg-box { background: #fff; border-radius: 12px; width: min(440px, 92vw); padding: 18px 20px 14px; box-shadow: 0 16px 48px rgba(0,0,0,.3); animation: qhDlgIn .14s ease-out; }
            @keyframes qhDlgIn { from { transform: translateY(8px) scale(.98); opacity: 0; } to { transform: none; opacity: 1; } }
            #qh-dlg .qh-dlg-t { font-weight: 700; font-size: 15px; color: #212529; margin-bottom: 8px; }
            #qh-dlg .qh-dlg-m { font-size: 13px; color: #495057; line-height: 1.55; margin-bottom: 10px; }
            #qh-dlg .qh-dlg-f { display: block; margin: 8px 0; font-size: 12px; color: #495057; }
            #qh-dlg .qh-dlg-f span { display: block; margin-bottom: 3px; font-weight: 600; }
            #qh-dlg .qh-dlg-f input { width: 100%; box-sizing: border-box; padding: 7px 9px; border: 1px solid #ced4da; border-radius: 7px; font-size: 13px; }
            #qh-dlg .qh-dlg-f input:focus { outline: none; border-color: #1c7ed6; box-shadow: 0 0 0 3px rgba(28,126,214,.15); }
            #qh-dlg .qh-dlg-err { color: #c92a2a; font-size: 12px; min-height: 16px; }
            #qh-dlg .qh-dlg-b { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
            #qh-dlg button { padding: 7px 16px; border-radius: 7px; font-size: 13px; cursor: pointer; border: 1px solid #ced4da; background: #fff; color: #495057; }
            #qh-dlg .qh-dlg-ok { background: #1c7ed6; border-color: #1c7ed6; color: #fff; font-weight: 600; }
            #qh-dlg .qh-dlg-ok.red { background: #e03131; border-color: #e03131; }
            .qhd-btn { background: linear-gradient(135deg, #ff7a18, #e8590c) !important; color: #fff !important; border: none !important; font-weight: 700; padding: 5px 12px !important; border-radius: 7px; box-shadow: 0 2px 6px rgba(232,89,12,.35); white-space: nowrap; }
            .qhd-btn:hover { filter: brightness(1.06); }
            .qhd-btn.on { background: linear-gradient(135deg, #7048e8, #5f3dc4) !important; box-shadow: 0 2px 6px rgba(112,72,232,.4); }
            #qhd-panel { position: absolute; top: 12px; left: 12px; width: 380px; max-width: calc(100% - 24px); max-height: calc(100% - 24px); overflow-y: auto; background: #fff; border-radius: 10px; box-shadow: 0 4px 18px rgba(0,0,0,.25); padding: 12px 14px; z-index: 6; font-family: -apple-system, Segoe UI, Roboto, sans-serif; font-size: 12px; color: #212529; box-sizing: border-box; }
            #qhd-panel.min { width: 340px; }
            #qhd-btn { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            #qhd-panel.wide { width: min(760px, calc(100% - 24px)); }
            #qhd-panel .qhd-hd { display: flex; justify-content: space-between; align-items: center; font-size: 14px; margin-bottom: 4px; }
            #qhd-panel .qhd-row { display: flex; gap: 6px; align-items: center; margin: 6px 0; flex-wrap: wrap; }
            #qhd-panel .qhd-row > input, #qhd-panel .qhd-row > select { flex: 1; min-width: 120px; padding: 5px 7px; border: 1px solid #ced4da; border-radius: 6px; font-size: 12px; }
            #qhd-panel textarea { width: 100%; box-sizing: border-box; padding: 5px 7px; border: 1px solid #ced4da; border-radius: 6px; font-size: 12px; font-family: inherit; resize: vertical; }
            #qhd-panel .qhd-b { padding: 5px 9px; border-radius: 6px; border: 1px solid #ced4da; background: #fff; cursor: pointer; font-size: 12px; white-space: nowrap; }
            #qhd-panel .qhd-b.pri { background: #1c7ed6; border-color: #1c7ed6; color: #fff; font-weight: 600; }
            #qhd-panel .qhd-b.red { color: #c92a2a; }
            #qhd-panel .qhd-b:disabled { opacity: .45; cursor: default; }
            #qhd-panel .qhd-x { border: none; background: transparent; color: #868e96; cursor: pointer; font-size: 13px; padding: 2px 4px; }
            #qhd-panel .qhd-x:hover { color: #c92a2a; }
            #qhd-panel .qhd-lnk { border: none; background: none; color: #1c7ed6; text-decoration: underline; cursor: pointer; padding: 0; font-size: 12px; margin-top: 3px; }
            #qhd-panel .qhd-mut, #qhd-panel .qhd-sm { color: #868e96; font-size: 11px; }
            #qhd-panel .qhd-msg { background: #fff4e6; border: 1px solid #ffd8a8; border-radius: 6px; padding: 5px 8px; margin: 6px 0; }
            #qhd-panel .qhd-dirty { color: #e8590c; font-weight: 700; font-size: 11px; white-space: nowrap; }
            #qhd-panel .qhd-tabs { display: flex; gap: 4px; margin: 10px 0 4px; border-bottom: 1px solid #dee2e6; }
            #qhd-panel .qhd-tabs button { border: none; background: none; padding: 6px 10px; cursor: pointer; font-size: 12px; color: #495057; border-bottom: 2px solid transparent; }
            #qhd-panel .qhd-tabs button.on { color: #e8590c; border-bottom-color: #e8590c; font-weight: 700; }
            #qhd-panel .qhd-sec { border: 1px solid #e9ecef; border-radius: 8px; padding: 8px 10px; margin: 8px 0; }
            #qhd-panel .qhd-st { font-weight: 700; color: #343a40; margin-bottom: 4px; }
            #qhd-panel .qhd-chk { display: flex; gap: 6px; align-items: flex-start; color: #495057; }
            #qhd-panel .qhd-selbox { background: #fff9db; border-radius: 6px; padding: 6px 8px; margin-top: 4px; }
            #qhd-panel .qhd-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
            #qhd-panel .qhd-chip { background: #e7f5ff; border: 1px solid #a5d8ff; border-radius: 12px; padding: 2px 4px 2px 8px; }
            #qhd-panel .qhd-chip button { border: none; background: none; cursor: pointer; color: #868e96; }
            #qhd-panel .qhd-nh { display: flex; gap: 5px; align-items: center; margin: 4px 0; flex-wrap: wrap; }
            #qhd-panel .qhd-nh input { flex: 1; min-width: 110px; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 6px; font-size: 12px; font-weight: 600; }
            #qhd-panel .qhd-nh input.qhd-nham { flex: 1 1 100%; font-weight: 400; }
            #qhd-panel .qhd-dot { width: 10px; height: 10px; border-radius: 50%; border: 3px solid; }
            #qhd-panel .qhd-chg { display: flex; justify-content: space-between; gap: 6px; padding: 4px 0; border-bottom: 1px dashed #e9ecef; }
            #qhd-panel .qhd-kpi { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
            #qhd-panel .qhd-kpi span { background: #f1f3f5; border-radius: 6px; padding: 4px 8px; }
            #qhd-panel h4 { margin: 12px 0 4px; font-size: 13px; }
            #qhd-panel .qhd-tw { max-height: 330px; overflow: auto; border: 1px solid #e9ecef; border-radius: 6px; }
            #qhd-panel table.qhd-t { border-collapse: collapse; width: 100%; font-size: 12px; }
            #qhd-panel table.qhd-t th { position: sticky; top: 0; background: #f1f3f5; padding: 5px 6px; border-bottom: 1px solid #dee2e6; border-right: 1px solid #e9ecef; text-align: right; white-space: nowrap; z-index: 1; }
            #qhd-panel table.qhd-t th:first-child { text-align: left; }
            #qhd-panel table.qhd-t td { padding: 4px 6px; border-bottom: 1px solid #f1f3f5; border-right: 1px solid #f8f9fa; text-align: right; vertical-align: top; white-space: nowrap; }
            #qhd-panel .qhd-good { color: #2b8a3e; font-weight: 700; }
            #qhd-panel .qhd-bad { color: #c92a2a; font-weight: 700; }
            #qhd-panel .qhd-neu { color: #495057; }
            #qhd-panel .qhd-note { color: #868e96; font-size: 11px; margin-top: 8px; line-height: 1.5; }
            #qhd-panel .qhd-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; color: #495057; font-size: 11px; }
            #qhd-panel .qhd-legend i { display: inline-block; width: 14px; height: 4px; margin-right: 4px; vertical-align: middle; border-radius: 2px; }
            #ghn-tuyen-giao-root {
                position: fixed; box-sizing: border-box;
                background: #ffffff; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.25);
                z-index: 999998; display: flex; flex-direction: column; overflow: hidden;
                font-family: -apple-system, Segoe UI, Roboto, sans-serif;
                min-width: 480px; min-height: 380px;
                transition: none;
            }
            #ghn-tuyen-giao-root.ghn-tg-collapsed {
                width: 260px !important; height: 48px !important; min-height: 0;
                left: 20px !important; top: auto !important; bottom: 20px;
            }
            #ghn-tuyen-giao-root.ghn-tg-collapsed #ghn-tuyen-giao-tabs,
            #ghn-tuyen-giao-root.ghn-tg-collapsed #ghn-tuyen-giao-body,
            #ghn-tuyen-giao-root.ghn-tg-collapsed #ghn-tg-resize-handle {
                display: none !important;
            }
            #ghn-tg-resize-handle {
                position: absolute; right: 0; bottom: 0; width: 18px; height: 18px;
                cursor: nwse-resize; z-index: 5;
                background: linear-gradient(135deg, transparent 50%, #ced4da 50%, #ced4da 60%, transparent 60%, transparent 70%, #ced4da 70%, #ced4da 80%, transparent 80%);
            }
            .ghn-tg-status-dot {
                display: inline-block; width: 8px; height: 8px; border-radius: 50%;
                margin-right: 6px; vertical-align: middle;
            }
            .ghn-tg-status-dot.online { background: #28a745; box-shadow: 0 0 5px rgba(40,167,69,0.8); }
            .ghn-tg-status-dot.offline { background: #dc3545; box-shadow: 0 0 5px rgba(220,53,69,0.8); }
            .ghn-tg-status-dot.loading { background: #adb5bd; }
            #ghn-tuyen-giao-titlebar {
                background: linear-gradient(90deg, ${GHN_BLUE}, ${GHN_ORANGE});
                color: #fff; padding: 10px 14px; display: flex; align-items: center;
                justify-content: space-between; cursor: move; user-select: none; flex-shrink: 0;
                gap: 10px;
            }
            #ghn-tuyen-giao-titlebar .ghn-tg-title-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            #ghn-tuyen-giao-titlebar .ghn-tg-titlebar-btns { display: flex; gap: 4px; flex-shrink: 0; }
            .ghn-tg-titlebar-btn {
                background: rgba(255,255,255,0.18); border: none; color: #fff; font-size: 14px;
                width: 26px; height: 26px; border-radius: 5px; cursor: pointer; line-height: 1;
                display: flex; align-items: center; justify-content: center;
            }
            .ghn-tg-titlebar-btn:hover { background: rgba(255,255,255,0.32); }
            #ghn-tuyen-giao-tabs { display: flex; gap: 4px; padding: 8px 10px 0; background: #f1f3f5; flex-shrink: 0; }
            .ghn-tg-tab-btn {
                border: none; background: #e9ecef; color: #495057; padding: 8px 14px; border-radius: 8px 8px 0 0;
                cursor: pointer; font-size: 13px; font-weight: 600;
            }
            .ghn-tg-tab-btn.active { background: #ffffff; color: ${GHN_BLUE}; }
            #ghn-tuyen-giao-body { flex: 1; min-height: 0; background: #ffffff; position: relative; }
            .ghn-tg-panel { position: absolute; inset: 0; display: none; flex-direction: column; }
            .ghn-tg-panel.active { display: flex; }
            /* v1.7.8 — GOM GỌN thanh điều khiển bản đồ (phản hồi "khoảng không gian cho hiển
               thị bản đồ khá là ít"): trước đây là 2 hàng LUÔN HIỆN (hàng điều khiển + hàng
               chú thích dài dằng dặc, có lúc xuống tận 3 dòng khi cửa sổ hẹp) chiếm mất một
               phần đáng kể chiều cao dành cho bản đồ. Giờ rút về ĐÚNG 1 HÀNG THẤP, GỌN kiểu
               thanh công cụ macOS: 2 ô select + 2 nút xổ-xuống ("🗂️ Lớp hiển thị" gộp hết các
               checkbox ranh giới/nhãn/tuyến giao trước đây LUÔN HIỆN thành 1 danh sách chỉ
               hiện khi bấm mở, "ℹ️ Chú thích" gộp toàn bộ chú giải màu sắc thành popup chỉ hiện
               khi bấm mở) + 2 nút hành động — xem buildMapPanel_/wireMapControls_ bên dưới.
               '#ghn-tg-legend' (hàng chú thích LUÔN HIỆN cũ) không còn dùng nữa, thay bằng
               '.ghn-tg-legend-panel' (nội dung Y HỆT nhưng nằm trong panel xổ xuống). */
            /* v1.7.11 — thanh công cụ bộ lọc tab "Theo Nhân Viên" (#ghn-tg-staff-controls)
               giờ DÙNG CHUNG đúng bộ rule với thanh công cụ tab "Bản Đồ" (#ghn-tg-map-controls,
               đã gọn từ v1.7.8) — cùng 1 phong cách thanh công cụ macOS xuyên suốt cả 2 tab,
               tránh lặp lại việc phải "gom gọn" riêng lẻ từng tab một. */
            #ghn-tg-map-controls, #ghn-tg-staff-controls {
                display: flex; gap: 8px; align-items: center; padding: 7px 14px;
                border-bottom: 1px solid #e9ecef; flex-wrap: wrap; flex-shrink: 0; row-gap: 6px;
            }
            #ghn-tg-map-controls select, #ghn-tg-map-controls input,
            #ghn-tg-staff-controls select, #ghn-tg-staff-controls input {
                padding: 5px 8px; border: 1px solid #ced4da; border-radius: 6px; font-size: 12px;
            }
            #ghn-tg-map-controls .ghn-tg-controls-sep, #ghn-tg-staff-controls .ghn-tg-controls-sep {
                width: 1px; align-self: stretch; background: #e9ecef; margin: 0 2px;
            }
            /* Nội dung CUỘN được của tab "Theo Nhân Viên" (trạng thái/tổng hợp/bảng năng
               suất) — nằm DƯỚI thanh công cụ cố định, chiếm hết phần diện tích còn lại
               (flex:1) thay vì cả tab cuộn chung 1 khối như trước — đúng phản hồi "dành diện
               tích cho mục quan trọng về năng suất". */
            .ghn-tg-staff-content { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px; }
            /* Nút icon gọn (VD "🔄 Làm mới danh sách bưu cục") — trước đây là 1 nút CHỮ ĐẦY
               ĐỦ nằm riêng hẳn 1 dòng bên dưới combobox bưu cục, giờ thu gọn thành icon +
               tooltip (title) nằm NGAY TRONG thanh công cụ, không còn chiếm dòng riêng. */
            .ghn-tg-icon-btn {
                padding: 5px 8px; border-radius: 6px; border: 1px solid #ced4da; background: #fff;
                color: #495057; font-size: 13px; cursor: pointer; line-height: 1;
            }
            .ghn-tg-icon-btn:hover { background: #f1f3f5; }
            /* Panel "🗂️ Lớp hiển thị" — checklist gọn thay cho hàng checkbox LUÔN HIỆN cũ. */
            .ghn-tg-layers-panel { max-height: 70vh; overflow-y: auto; }
            .ghn-tg-layers-group-title {
                font-size: 10.5px; font-weight: 700; color: #adb5bd; text-transform: uppercase;
                letter-spacing: 0.03em; margin: 8px 4px 3px; padding-top: 6px; border-top: 1px solid #f1f3f5;
            }
            .ghn-tg-layers-group-title:first-child { margin-top: 0; padding-top: 0; border-top: none; }
            .ghn-tg-layers-item {
                display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #343a40;
                padding: 5px 6px; border-radius: 5px; cursor: pointer;
            }
            .ghn-tg-layers-item:hover { background: #f1f3f5; }
            .ghn-tg-layers-item input { margin: 0; flex-shrink: 0; }
            .ghn-tg-layers-hint { font-size: 10.5px; color: #adb5bd; padding: 2px 6px 4px 27px; line-height: 1.4; }
            /* v1.7.13 — nhóm lọc "trạng thái làm việc". v1.7.14: KHÔNG còn lồng dưới checkbox
               "🏷️ Hiện tên nhân viên" nữa (đổi phạm vi áp dụng cho CẢ nhóm "Tuyến giao nhân
               viên") — chuyển lên đầu nhóm, giảm thụt lề (20px -> 6px) cho đúng vị trí mới,
               chữ vẫn nhỏ hơn 1 chút để phân biệt với các checkbox "cấp lớp" chính bên dưới —
               xem applyStaffStatusFilter_/wireMapControls_. */
            .ghn-tg-layers-substatus { padding-left: 6px; }
            .ghn-tg-layers-subitem {
                display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: #495057;
                padding: 4px 6px; border-radius: 5px; cursor: pointer;
            }
            .ghn-tg-layers-subitem:hover { background: #f1f3f5; }
            .ghn-tg-layers-subitem input { margin: 0; flex-shrink: 0; }
            /* Panel "ℹ️ Chú thích" — nội dung GIỮ NGUYÊN từng dòng của '#ghn-tg-legend' cũ,
               chỉ đổi bố cục hàng-ngang -> cột-dọc gọn (vì giờ nằm trong panel hẹp chứ không
               cần trải hết chiều ngang cửa sổ nữa) — xem đầy đủ nguyên văn giải thích từng mục
               ở thuộc tính "title" (di chuột vào xem, giữ nguyên như bản cũ). */
            .ghn-tg-legend-panel { max-height: 70vh; overflow-y: auto; }
            .ghn-tg-legend-panel .ghn-tg-legend-item {
                display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: #495057;
                padding: 4px 6px; cursor: help;
            }
            .ghn-tg-legend-panel .ghn-tg-legend-swatch { display: inline-block; width: 16px; height: 3px; border-radius: 2px; flex-shrink: 0; }
            #ghn-tg-map-wrap { position: relative; flex: 1; min-height: 0; display: flex; }
            #ghn-tg-map-container { flex: 1; min-height: 0; }
            #ghn-tg-info-panel {
                position: absolute; top: 12px; right: 12px; width: 300px; max-width: calc(100% - 24px);
                max-height: calc(100% - 24px); overflow-y: auto; background: #ffffff; border-radius: 10px;
                box-shadow: 0 4px 18px rgba(0,0,0,0.25); padding: 14px 16px; z-index: 5;
                font-family: -apple-system, Segoe UI, Roboto, sans-serif;
                transition: width 0.15s ease;
            }
            /* v1.7.16 — panel RỘNG HƠN riêng cho popup bưu cục (bảng "Theo từng xã/phường" 5 cột
               tràn ngang khi panel chỉ 300px, phản hồi "phần bảng không hiển thị hết nè => thiết
               kế lại để có thể xem được hết thông tin") — bật qua showInfoPanel_(html, true), CHỈ
               ở nơi mở popup bưu cục (xem initMap_). max-width vẫn calc(100% - 24px) như panel
               thường để không tràn khỏi khung bản đồ trên màn hình nhỏ/cửa sổ hẹp — khi đó bảng
               vẫn cuộn ngang trong .ghn-tg-ward-table-wrap như phương án dự phòng cuối cùng. */
            #ghn-tg-info-panel.ghn-tg-info-panel--wide { width: 460px; }
            #ghn-tg-info-panel[hidden] { display: none; }
            #ghn-tg-info-close {
                position: absolute; top: 6px; right: 6px; border: none; background: transparent;
                font-size: 14px; line-height: 1; cursor: pointer; color: #868e96; padding: 4px;
            }
            #ghn-tg-info-close:hover { color: #212529; }
            /* v1.7.9 — khối "Nhân sự"/"Định biên" trong popup bưu cục — người dùng yêu cầu
               rõ "phần này cần thiết kế đẹp, chỉnh chu để người xem hiểu, và không bị rối"
               -> tách hẳn khỏi khối số liệu tĩnh phía trên bằng viền chấm, tóm tắt cấp bưu
               cục đặt trong khung nền xám nhẹ (dễ nhìn thấy ngay), danh sách xã/phường bên
               dưới dùng zebra-stripe (dòng chẵn/lẻ khác màu nhẹ) để mắt dễ dò theo hàng khi
               có nhiều xã/phường, thay vì 1 khối chữ dài dằng dặc dễ rối mắt. */
            .ghn-tg-hub-staffing-block {
                margin-top: 8px; padding-top: 8px; border-top: 1px dashed #dee2e6; font-size: 12px;
            }
            .ghn-tg-hub-staffing-title { font-weight: 700; font-size: 12.5px; color: #212529; margin-bottom: 4px; }
            .ghn-tg-hub-staffing-summary {
                background: #f8f9fa; border-radius: 6px; padding: 6px 10px; margin-bottom: 6px;
                line-height: 1.6; font-size: 12px; color: #333;
            }
            /* v1.7.23 — nút "+" gói khối giải thích cách tính Định biên (mặc định ẩn), phản hồi
               "cho vào 1 dấu + ... để phần diện tích không chèn vào bảng định biên". */
            .ghn-tg-backlog-toggle-btn {
                font-size: 11px; color: #495057; background: #fff; border: 1px solid #ced4da;
                border-radius: 5px; padding: 3px 8px; cursor: pointer; font-weight: 600;
            }
            .ghn-tg-backlog-toggle-btn:hover { background: #e9ecef; }
            /* v1.7.14 — bảng "Theo từng xã/phường" (thay danh sách liệt kê cũ, phản hồi "thiết
               kế chưa đẹp... cho vào thành 1 cái bảng"), bọc trong .ghn-tg-ward-table-wrap
               (overflow-x:auto) + ép min-width bảng để cột không bị bóp méo, cuộn ngang bên
               trong panel thay vì phá layout — Tô nền đỏ nhạt/xanh nhạt CẢ HÀNG (không chỉ chữ)
               để dễ quét mắt khi nhiều xã/phường.
               v1.7.16 — SỬA "phần bảng không hiển thị hết nè => thiết kế lại để có thể xem được
               hết thông tin": trước đây panel LUÔN cố định 300px nên bảng 6 cột (min-width
               480px) chắc chắn tràn ngang, phải tự cuộn mới thấy hết — người dùng không nhận ra.
               2 THAY ĐỔI CỘNG HƯỞNG: (a) panel bưu cục giờ RỘNG 460px (xem
               #ghn-tg-info-panel.ghn-tg-info-panel--wide + showInfoPanel_(html, wide)) — (b) gộp
               cột "Thiếu" vào "Kết luận" (còn 5 cột thay vì 6, xem hubPopupHtml_), giảm min-width
               bảng xuống 400px — với panel 460px (trừ padding 16px*2) còn dư ~428px, ĐỦ hiện
               TRỌN bảng 400px KHÔNG cần cuộn ngang trong đa số trường hợp (tên xã/phường dài bất
               thường vẫn có thể khiến cột đầu giãn ra và phải cuộn — .ghn-tg-ward-table-wrap vẫn
               giữ overflow-x:auto làm phương án dự phòng cuối, không xoá hẳn khả năng cuộn). */
            .ghn-tg-ward-table-toolbar { margin-bottom: 4px; }
            .ghn-tg-ward-table-search {
                width: 100%; box-sizing: border-box; padding: 4px 8px; border: 1px solid #ced4da;
                border-radius: 5px; font-size: 11.5px;
            }
            .ghn-tg-ward-table-wrap { overflow-x: auto; border: 1px solid #e9ecef; border-radius: 6px; }
            .ghn-tg-ward-table { border-collapse: collapse; width: 100%; min-width: 400px; font-size: 11px; }
            .ghn-tg-ward-table th, .ghn-tg-ward-table td { padding: 4px 6px; text-align: center; white-space: nowrap; }
            .ghn-tg-ward-table thead th {
                background: #f1f3f5; font-weight: 700; color: #495057; border-bottom: 1px solid #dee2e6;
                user-select: none; position: sticky; top: 0; line-height: 1.3;
            }
            .ghn-tg-ward-table thead th.ghn-tg-sort-asc::after { content: " ▲"; color: #007ed4; }
            .ghn-tg-ward-table thead th.ghn-tg-sort-desc::after { content: " ▼"; color: #007ed4; }
            .ghn-tg-ward-table td.ghn-tg-ward-td-name, .ghn-tg-ward-table th:first-child { text-align: left; white-space: normal; }
            .ghn-tg-ward-table tbody tr { border-bottom: 1px solid #f1f3f5; }
            .ghn-tg-ward-row--shortage { background: #fff5f5; }
            .ghn-tg-ward-row--ok { background: #f4fbf5; }
            .ghn-tg-ward-row--total { font-weight: 700; background: #eef1f4 !important; border-top: 2px solid #ced4da; }
            .ghn-tg-shortage { color: #dc3545; font-weight: 700; }
            .ghn-tg-ok { color: #2e7d32; font-weight: 600; }
            #ghn-tg-map-status { padding: 6px 14px; font-size: 12px; color: #6c757d; border-top: 1px solid #e9ecef; flex-shrink: 0; }
            .ghn-tg-sync-field { margin-bottom: 12px; }
            .ghn-tg-sync-field label { display: block; font-size: 12px; font-weight: 700; color: #495057; margin-bottom: 4px; }
            .ghn-tg-sync-field textarea {
                width: 100%; height: 70px; font-family: monospace; font-size: 11px; padding: 6px;
                border: 1px solid #ced4da; border-radius: 6px; box-sizing: border-box; resize: vertical;
            }
            .ghn-tg-staff-note {
                font-size: 12px; color: #6c757d; line-height: 1.6; background: #fff8e1;
                border: 1px solid #ffe082; border-radius: 6px; padding: 10px; margin-bottom: 14px;
            }
            .ghn-tg-staff-hubbox {
                max-height: 130px; overflow-y: auto; border: 1px solid #ced4da; border-radius: 6px;
                padding: 8px 10px; background: #fff;
            }
            .ghn-tg-staff-hub-row {
                display: block; font-size: 12px; color: #495057; padding: 3px 0; cursor: pointer;
            }
            .ghn-tg-staff-hub-row input { margin-right: 6px; }
            /* v1.7.5 — combobox tìm-kiếm-được thay cho <select> "Nhân viên" cũ (native
               select xổ ra danh sách DÀI cả trăm nhân viên KHÔNG tìm kiếm được, chiếm hết
               màn hình — người dùng phản ánh "quá tốn diện tích"). Gọn khi đóng (như 1
               <select> bình thường), chỉ hiện panel tìm kiếm/danh sách khi bấm mở. */
            .ghn-tg-combo { position: relative; display: inline-block; }
            .ghn-tg-combo-trigger {
                padding: 5px 10px; border: 1px solid #ced4da; border-radius: 6px; background: #fff;
                color: #212529; font-size: 12px; cursor: pointer; min-width: 170px; max-width: 260px;
                text-align: left; display: inline-flex; align-items: center; justify-content: space-between; gap: 6px;
            }
            .ghn-tg-combo-trigger span.ghn-tg-combo-trigger-label {
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .ghn-tg-combo-panel {
                position: absolute; top: calc(100% + 4px); left: 0; z-index: 50; width: 280px;
                background: #fff; border: 1px solid #ced4da; border-radius: 8px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.15); padding: 8px;
            }
            /* v1.7.8 — SỬA LỖI panel combobox ("Bưu cục" trong tab Theo Nhân Viên, ảnh chụp
               người dùng gửi: nút "Xoá đã chọn"/"Xong" bị cắt mất, "như đang bị ẩn dưới 1
               layer") — panel vốn 'position:absolute' nên bị GIỚI HẠN bởi khối cha bọc ngoài
               (div nội dung tab, có 'overflow-y:auto' để cuộn cả tab) — phần panel tràn ra
               ngoài ranh giới khối cha bị CẮT MẤT dù về mặt hình học nó vẫn "vẽ" đúng chỗ.
               SỬA TẬN GỐC: khi mở, panel được "đẩy" (portal) ra làm con trực tiếp của
               <body> với 'position:fixed', vị trí tính lại bằng JS theo đúng toạ độ nút bấm
               (xem ghnTgRegisterDropdown_/ghnTgPositionPanel_) — thoát HẲN khỏi mọi vùng
               overflow:hidden/auto của bất kỳ khối cha nào, không riêng gì combobox "Bưu cục"
               mà ÁP DỤNG CHUNG cho mọi panel xổ-xuống trong modul (Lớp hiển thị/Chú thích/
               Nhân viên/Bưu cục) để tránh lặp lại đúng lỗi này ở chỗ khác sau này. */
            .ghn-tg-combo-panel-portal { position: fixed !important; top: 0; left: 0; z-index: 1000000; }
            /* v1.7.8 — popup "🔒 Đang kiểm tra quyền truy cập..." giữa màn hình (phản hồi
               "thiếu chuyên nghiệp" khi trước đây chỉ là dòng chữ nằm im trong khung cửa sổ
               modul) — dùng lại đúng bố cục overlay-giữa-màn-hình như '#ghn-tg-admin-overlay'
               (position:fixed;inset:0, appendChild thẳng vào <body> — xem openWindow_). */
            #ghn-tg-loading-overlay {
                position: fixed; inset: 0; background: rgba(0,0,0,0.45);
                z-index: 999999; display: flex; align-items: center; justify-content: center;
            }
            #ghn-tg-loading-card {
                background: #fff; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.35);
                padding: 30px 40px; display: flex; flex-direction: column; align-items: center; gap: 14px;
                font-family: -apple-system, Segoe UI, Roboto, sans-serif; font-size: 13px; color: #495057;
            }
            .ghn-tg-spinner {
                width: 26px; height: 26px; border-radius: 50%;
                border: 3px solid #e9ecef; border-top-color: ${GHN_BLUE};
                animation: ghn-tg-spin 0.8s linear infinite;
            }
            @keyframes ghn-tg-spin { to { transform: rotate(360deg); } }
            .ghn-tg-combo-search {
                width: 100%; box-sizing: border-box; padding: 6px 10px; margin-bottom: 6px;
                border: 1px solid #ced4da; border-radius: 6px; font-size: 12px;
            }
            .ghn-tg-combo-list { max-height: 220px; overflow-y: auto; }
            .ghn-tg-combo-item {
                padding: 5px 8px; font-size: 12px; color: #343a40; cursor: pointer; border-radius: 4px;
                display: flex; align-items: center; justify-content: space-between; gap: 6px;
            }
            .ghn-tg-combo-item:hover { background: #f1f3f5; }
            .ghn-tg-combo-item.active { background: #e7f3ff; font-weight: 700; }
            .ghn-tg-combo-item-empty { padding: 10px; text-align: center; color: #adb5bd; font-size: 12px; }
            .ghn-tg-staff-table-wrap { margin-top: 10px; overflow-x: auto; }
            .ghn-tg-staff-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .ghn-tg-staff-table th, .ghn-tg-staff-table td {
                padding: 5px 8px; border-bottom: 1px solid #e9ecef; text-align: left; white-space: nowrap;
            }
            .ghn-tg-staff-table thead th {
                position: sticky; top: 0; background: #f8f9fa; color: #495057; font-weight: 700; z-index: 1;
            }
            .ghn-tg-staff-table tbody tr:hover { background: #f8f9fa; }
            .ghn-tg-ward-toggle {
                width: 20px; height: 20px; line-height: 1; border: 1px solid #ced4da; border-radius: 4px;
                background: #fff; color: #495057; cursor: pointer; font-weight: 700; font-size: 12px; padding: 0;
            }
            .ghn-tg-ward-toggle:hover { background: #e9ecef; }
            .ghn-tg-ward-detail td { white-space: normal; }
            #ghn-tuyen-giao-launcher-btn {
                position: fixed; left: 20px; bottom: 20px; z-index: 999997;
                background: linear-gradient(90deg, ${GHN_BLUE}, ${GHN_ORANGE}); color: #fff; border: none;
                padding: 12px 18px; border-radius: 24px; font-weight: 700; font-size: 13px; cursor: pointer;
                box-shadow: 0 4px 14px rgba(0,0,0,0.3);
            }
            /* v1.7.0 — Phân quyền: popup "🔐 Quản Trị" LUÔN nổi GIỮA MÀN HÌNH, tách hẳn
               khỏi cửa sổ modul (đúng yêu cầu "toàn bộ chạy theo popup giữa màn hình"). */
            #ghn-tg-admin-overlay {
                position: fixed; inset: 0; background: rgba(0,0,0,0.45);
                z-index: 999999; display: flex; align-items: center; justify-content: center;
            }
            #ghn-tg-admin-modal {
                background: #fff; border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.35);
                width: min(920px, 92vw); max-height: 86vh; display: flex; flex-direction: column;
                overflow: hidden; font-family: -apple-system, Segoe UI, Roboto, sans-serif;
            }
            #ghn-tg-admin-modal-header {
                background: linear-gradient(90deg, ${GHN_BLUE}, ${GHN_ORANGE}); color: #fff;
                padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;
                font-weight: 700; font-size: 14px; flex-shrink: 0;
            }
            #ghn-tg-admin-close-btn {
                background: rgba(255,255,255,0.2); border: none; color: #fff; width: 26px; height: 26px;
                border-radius: 50%; cursor: pointer; font-size: 13px;
            }
            #ghn-tg-admin-modal-body { padding: 16px; overflow-y: auto; }
            #ghn-tg-admin-table input, #ghn-tg-admin-table select {
                width: 100%; box-sizing: border-box; padding: 4px 6px; border: 1px solid #ced4da;
                border-radius: 4px; font-size: 12px;
            }
            #ghn-tg-admin-table input[readonly] { background: #f1f3f5; color: #868e96; }
            #ghn-tg-admin-table input:disabled { background: #f1f3f5; color: #adb5bd; }
        `;
        document.head.appendChild(style);
    }

    function makeDraggable_(handleEl, targetEl) {
        let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
        handleEl.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            if (state.isMaximized || state.isMinimized) return;
            dragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = targetEl.getBoundingClientRect();
            startLeft = rect.left; startTop = rect.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            targetEl.style.left = `${startLeft + (e.clientX - startX)}px`;
            targetEl.style.top = `${startTop + (e.clientY - startY)}px`;
        });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    function buildMapPanel_() {
        const panel = document.createElement('div');
        panel.className = 'ghn-tg-panel';
        panel.id = 'ghn-tg-panel-map';
        panel.innerHTML = `
            <div id="ghn-tg-map-controls">
                <label style="font-size:12px; color:#495057;">Vùng:
                    <select id="ghn-tg-region-select"><option value="all">Tất cả</option></select>
                </label>
                <span id="qh-tinh" class="qh-ms" data-unit="tỉnh" data-lab="Tỉnh"></span>
                <span id="qh-am" class="qh-ms" data-unit="AM" data-lab="AM"></span>
                <span id="qh-bc" class="qh-ms" data-unit="BC" data-lab="Bưu cục"></span>
                <button id="qh-clear" class="qh-clear" title="Bỏ lọc Tỉnh / AM / Bưu cục — về toàn vùng">✕ Bỏ lọc</button>
                <input id="qh-search" class="qh-search" list="qh-search-dl" placeholder="🔍 Tìm tỉnh, AM, bưu cục…" autocomplete="off">
                <datalist id="qh-search-dl"></datalist>
                <span id="qh-cc-badge" class="qh-cc-badge"></span>
                <button id="qhd-btn" class="qh-clear qhd-btn" title="Bản nháp quy hoạch — thử gộp xã/phường, bưu cục, AM thành quy hoạch mới">📝 Bản nháp quy hoạch</button>
                <span class="ghn-tg-controls-sep"></span>
                <label style="font-size:12px; color:#495057;">Xem theo:
                    <select id="ghn-tg-mode-select">
                        <option value="hub">Bưu cục</option>
                        <option value="am">AM (khu vực từng AM)</option>
                        <option value="ward">Xã/Phường (sản lượng giao)</option>
                    </select>
                </label>
                <span class="ghn-tg-controls-sep"></span>
                <!-- v1.7.8 — gộp TOÀN BỘ checkbox ranh giới/nhãn/tuyến giao (trước đây 8 ô
                     LUÔN HIỆN trải hết chiều ngang, có lúc tràn xuống dòng 2-3) vào 1 panel
                     xổ-xuống duy nhất — xem wireMapControls_/ghnTgRegisterDropdown_. -->
                <div class="ghn-tg-combo" id="ghn-tg-layers-combo">
                    <button type="button" class="ghn-tg-combo-trigger" id="ghn-tg-layers-combo-trigger" style="min-width:130px;">
                        <span class="ghn-tg-combo-trigger-label">🗂️ Lớp hiển thị</span><span>▾</span>
                    </button>
                    <div class="ghn-tg-combo-panel ghn-tg-layers-panel" id="ghn-tg-layers-combo-panel" style="display:none;">
                        <div class="ghn-tg-layers-group-title">Ranh giới</div>
                        <label class="ghn-tg-layers-item"><input type="checkbox" id="ghn-tg-newboundary-checkbox"> Hiện ranh giới phường MỚI</label>
                        <div class="ghn-tg-layers-group-title">Nhãn</div>
                        <label class="ghn-tg-layers-item"><input type="checkbox" id="ghn-tg-label-hub-checkbox" checked> Bưu cục</label>
                        <label class="ghn-tg-layers-item"><input type="checkbox" id="ghn-tg-label-oldward-checkbox"> Phường cũ</label>
                        <label class="ghn-tg-layers-item"><input type="checkbox" id="ghn-tg-label-newward-checkbox"> Phường mới</label>
                        <div class="ghn-tg-layers-hint">Nhãn phường/bưu cục chỉ hiện khi zoom đủ gần (tránh chồng chữ khi xem toàn vùng) — xem mục (4) bên dưới.</div>
                        <div class="ghn-tg-layers-group-title">Tuyến giao nhân viên</div>
                        <!-- v1.7.14 — ĐỔI PHẠM VI theo phản hồi "đưa phần bộ lọc trạng thái làm
                             việc áp dụng cho cả hạng mục của Tuyến giao nhân viên thay vì đang
                             chỉ lọc ở phần mỗi tên" — bộ lọc 4 nhóm "Đang làm việc"/"Nghỉ việc"/
                             "Tạm Nghỉ"/"Hỗ trợ/Điều chuyển" (nhân viên có chuyến ở bưu cục đang
                             xem nhưng buuCuc theo HRM lại là bưu cục KHÁC, xem
                             staffWorkStatusCategory_) giờ nằm NGAY ĐẦU nhóm, áp dụng cho TOÀN
                             BỘ chấm/ranh giới/nhãn tên bên dưới — không còn riêng lớp nhãn tên
                             nữa (xem STAFF_STATUS_FILTERED_LAYERS_). Mặc định CHỈ tick "Đang
                             làm việc" (yêu cầu rõ), 3 nhóm còn lại mặc định TẮT. -->
                        <div class="ghn-tg-layers-hint" style="padding:2px 6px 4px;">Lọc theo trạng thái làm việc (áp dụng cho cả chấm/ranh giới/tên bên dưới):</div>
                        <div class="ghn-tg-layers-substatus" id="ghn-tg-staff-status-filter-group">
                            <label class="ghn-tg-layers-subitem"><input type="checkbox" id="ghn-tg-status-active-checkbox" checked> Đang làm việc</label>
                            <label class="ghn-tg-layers-subitem"><input type="checkbox" id="ghn-tg-status-resigned-checkbox"> Nghỉ việc</label>
                            <label class="ghn-tg-layers-subitem"><input type="checkbox" id="ghn-tg-status-onleave-checkbox"> Tạm Nghỉ</label>
                            <label class="ghn-tg-layers-subitem"><input type="checkbox" id="ghn-tg-status-support-checkbox"> Hỗ trợ/Điều chuyển</label>
                        </div>
                        <label class="ghn-tg-layers-item"><input type="checkbox" id="ghn-tg-staff-dots-checkbox"> 📍 Chấm + ranh giới tuyến giao</label>
                        <label class="ghn-tg-layers-item"><input type="checkbox" id="ghn-tg-staff-labels-checkbox"> 🏷️ Hiện tên nhân viên</label>
                        <label class="ghn-tg-layers-item"><input type="checkbox" id="ghn-tg-staff-hull-checkbox"> 🗺️ Vùng giao thực tế (GPS)</label>
                    </div>
                </div>
                <div class="ghn-tg-combo" id="ghn-tg-legend-combo">
                    <button type="button" class="ghn-tg-combo-trigger" id="ghn-tg-legend-combo-trigger" style="min-width:110px;">
                        <span class="ghn-tg-combo-trigger-label">ℹ️ Chú thích</span><span>▾</span>
                    </button>
                    <div class="ghn-tg-combo-panel ghn-tg-legend-panel" id="ghn-tg-legend-combo-panel" style="display:none;">
                        <span class="ghn-tg-legend-item" title="Ranh giới phường CŨ (trước sáp nhập 2025)"><span class="ghn-tg-legend-swatch" style="background:#4a4a4a;"></span> Ranh giới cũ</span>
                        <span class="ghn-tg-legend-item" title="Ranh giới phường MỚI (sau sáp nhập 2025)"><span class="ghn-tg-legend-swatch" style="background:#e31a1c;"></span> Ranh giới mới</span>
                        <span class="ghn-tg-legend-item" title="Phường cũ đang chọn"><span class="ghn-tg-legend-swatch" style="background:#ffd600;"></span> Phường cũ chọn</span>
                        <span class="ghn-tg-legend-item" title="Phường mới đang chọn"><span class="ghn-tg-legend-swatch" style="background:#1e88e5;"></span> Phường mới chọn</span>
                        <span class="ghn-tg-legend-item" title="Lãnh thổ bưu cục đang chọn (bấm vào chấm cam)"><span class="ghn-tg-legend-swatch" style="background:#000000;"></span> Lãnh thổ BC</span>
                        <span class="ghn-tg-legend-item" title="Chấm nhân viên: đỏ = quá tải/không đủ · vàng = trung bình · xanh = bình thường (1 chấm/nhân viên/ngày, đặt tại xã/phường CHÍNH — nơi giao nhiều đơn nhất)"><span class="ghn-tg-legend-swatch" style="background:#e53935; border-radius:50%; width:9px; height:9px;"></span> Chấm NV (theo tải)</span>
                        <span class="ghn-tg-legend-item" title="Viền liền nét = xã/phường CHÍNH · viền đứt nét = xã/phường PHỤ cùng tuyến giao (theo ranh giới hành chính)"><span class="ghn-tg-legend-swatch" style="background:#e53935; width:14px; height:3px; border-radius:0;"></span> Viền: liền=chính, đứt=phụ</span>
                        <span class="ghn-tg-legend-item" title="Vùng giao thực tế — xã/phường CHÍNH 100% + múi xã/phường PHỤ cắt đúng % thực tế (hướng theo GPS), CHỈ hiện khi bấm chọn 1 nhân viên"><span class="ghn-tg-legend-swatch" style="background:#e53935; opacity:0.35;"></span> Vùng giao thực tế (GPS)</span>
                        <span class="ghn-tg-legend-item" title="Vòng vàng = Giao quá tải"><span class="ghn-tg-legend-swatch" style="background:#ffca28; border-radius:50%; width:9px; height:9px;"></span> Giao quá tải</span>
                        <span class="ghn-tg-legend-item" title="Vòng xanh dương = Giao không đủ đơn"><span class="ghn-tg-legend-swatch" style="background:#29b6f6; border-radius:50%; width:9px; height:9px;"></span> Giao thiếu đơn</span>
                        <span class="ghn-tg-legend-item" title="Vòng cam = Lấy quá tải"><span class="ghn-tg-legend-swatch" style="background:${GHN_ORANGE}; border-radius:50%; width:9px; height:9px;"></span> Lấy quá tải</span>
                    </div>
                </div>
                <span class="ghn-tg-controls-sep"></span>
                <button id="ghn-tg-clear-selection-btn" style="padding:6px 10px; border-radius:6px; border:1px solid #ced4da; background:#fff; color:#495057; font-size:12px; cursor:pointer;">✖ Bỏ chọn</button>
                <button id="ghn-tg-reload-btn" style="padding:6px 12px; border-radius:6px; border:none; background:${GHN_BLUE}; color:#fff; font-size:12px; cursor:pointer; font-weight:700;">🔄 Tải lại dữ liệu</button>
            </div>
            <div id="ghn-tg-map-wrap">
                <div id="ghn-tg-map-container"></div>
                <div id="ghn-tg-info-panel" hidden>
                    <button id="ghn-tg-info-close" title="Đóng">✕</button>
                    <div id="ghn-tg-info-content"></div>
                </div>
            </div>
            <div id="ghn-tg-map-status"><span class="ghn-tg-status-dot loading" id="ghn-tg-status-dot"></span><span id="ghn-tg-status-text">Chưa tải dữ liệu.</span></div>
        `;
        return panel;
    }

    function buildStaffPanel_() {
        const panel = document.createElement('div');
        panel.className = 'ghn-tg-panel';
        panel.id = 'ghn-tg-panel-staff';
        const todayStr = new Date().toISOString().split('T')[0];
        // v1.7.11 — GOM GỌN toàn bộ bộ lọc (ngày/bưu cục/nhân viên/nhóm khách hàng) thành 1
        // THANH CÔNG CỤ DUY NHẤT nằm cố định phía trên (giống hệt cách đã làm cho tab "Bản
        // Đồ" ở v1.7.8: '#ghn-tg-map-controls'/'.ghn-tg-controls-sep' — dùng LẠI ĐÚNG các
        // class đó, KHÔNG tạo bộ CSS riêng) — phản hồi "các phần tuỳ chọn... tối ưu lại diện
        // tích, gom lên phía bên trên để dành diện tích cho mục quan trọng về năng suất". Bản
        // trước đây có tới 2 hàng bộ lọc + 1 dòng tiêu đề "Bưu cục (chọn ít nhất 1):" + 1 dòng
        // riêng cho nút "🔄 Làm mới danh sách bưu cục" — 4 dòng LUÔN CHIẾM CHỖ trước khi thấy
        // được dữ liệu năng suất. Giờ dồn hết vào 1 hàng ngang (tự xuống dòng nếu cửa sổ hẹp),
        // đúng bố cục 1 khối bộ lọc + 1 combobox bưu cục (kèm nút 🔄 gọn ngay cạnh, không còn
        // dòng riêng) + 1 combobox nhân viên + 1 chọn nhóm khách hàng — 3 dấu ngăn cách dọc
        // (.ghn-tg-controls-sep) phân nhóm rõ ràng, giống hệt phong cách thanh công cụ macOS
        // đã dùng ở tab Bản Đồ.
        //
        // LỖI THẬT người dùng chụp ảnh phát hiện, SỬA CÙNG LÚC: combobox "Bưu cục" trước đây
        // ép trigger 'width:100%' (để "không bị cắt", đúng tinh thần sửa lỗi clipping v1.7.8)
        // — nhưng khối cha (nay là thanh công cụ full chiều ngang cửa sổ) RẤT RỘNG, nên
        // trigger rộng theo => panel xổ-xuống (tính theo đúng chiều rộng trigger — xem
        // ghnTgPositionPanel_) cũng bị kéo rộng HẾT CẢ CHIỀU NGANG cửa sổ ("tràn viền", "đâu
        // cần chiếm hết cả chiều ngang đâu" — đúng như phản ánh). Việc panel bị CẮT MẤT
        // (lỗi v1.7.8) và panel bị KÉO QUÁ RỘNG (lỗi này) là 2 VẤN ĐỀ KHÁC NHAU dễ nhầm lẫn
        // sửa nhầm chỗ: v1.7.8 đã sửa đúng vụ "bị cắt" (cơ chế portal, vẫn giữ nguyên, không
        // đụng lại); còn "quá rộng" là do CHÍNH trigger quá rộng — SỬA Ở ĐÂY: bỏ hẳn
        // 'width:100%' khỏi trigger, để nó tự nhận đúng kích thước gọn mặc định của
        // '.ghn-tg-combo-trigger' (min-width:170px; max-width:260px — Y HỆT combobox "Nhân
        // viên" bên cạnh) — panel theo đó cũng gọn lại đúng 280px thay vì tràn hết màn hình.
        panel.innerHTML = `
            <div id="ghn-tg-staff-controls">
                <label style="font-size:12px; color:#495057;">Từ ngày:
                    <input type="date" id="ghn-tg-staff-from" value="${todayStr}">
                </label>
                <label style="font-size:12px; color:#495057;">Đến ngày:
                    <input type="date" id="ghn-tg-staff-to" value="${todayStr}">
                </label>
                <button id="ghn-tg-staff-load-btn" style="padding:6px 14px; border-radius:6px; border:none; background:${GHN_BLUE}; color:#fff; font-size:12px; cursor:pointer; font-weight:700;">📥 Tải sản lượng</button>
                <button id="ghn-tg-staff-stop-btn" style="display:none; padding:6px 14px; border-radius:6px; border:none; background:#e03131; color:#fff; font-size:12px; cursor:pointer; font-weight:700;" title="Dừng ngay — không cần tải lại (F5) cả trang">⏹ Dừng</button>

                <span class="ghn-tg-controls-sep"></span>

                <!-- v1.7.6 — thay danh sách checkbox LUÔN HIỆN (chiếm nhiều diện tích) bằng
                     combobox xổ-xuống ĐA CHỌN (checkbox nằm TRONG panel, chỉ hiện khi bấm mở),
                     dùng chung khung .ghn-tg-combo với combobox "Nhân viên" — có ô tìm kiếm và
                     nút "Xoá đã chọn" theo đúng yêu cầu. v1.7.11: bỏ width:100% (xem giải
                     thích ở trên) + nhãn "Bưu cục:" đặt gọn trước trigger thay vì 1 dòng tiêu
                     đề riêng. -->
                <label style="font-size:12px; color:#495057; display:inline-flex; align-items:center; gap:6px;">Bưu cục:
                    <div class="ghn-tg-combo" id="ghn-tg-hub-combo">
                        <button type="button" class="ghn-tg-combo-trigger" id="ghn-tg-hub-combo-trigger" title="Bưu cục (chọn ít nhất 1)">
                            <span class="ghn-tg-combo-trigger-label" id="ghn-tg-hub-combo-trigger-label">Chưa chọn bưu cục nào</span><span>▾</span>
                        </button>
                        <div class="ghn-tg-combo-panel" id="ghn-tg-hub-combo-panel" style="display:none;">
                            <!-- v1.7.12 — LỖI THẬT người dùng chụp ảnh phát hiện: Chrome tự
                                 hiện gợi ý (dropdown "phú"/"phú bình"...) từ LỊCH SỬ đã gõ
                                 trước đó cho ô này, ĐÈ LÊN danh sách bưu cục thật bên dưới —
                                 "cản trở việc tìm kiếm bưu cục". Nguyên nhân: input text
                                 không có 'autocomplete', Chrome mặc định BẬT autofill/gợi ý
                                 theo lịch sử cho MỌI input text thường (không riêng gì form
                                 đăng nhập). SỬA: thêm autocomplete="off" (chuẩn HTML, tắt
                                 đúng loại gợi ý này) — cùng sửa cho ô tìm nhân viên bên dưới
                                 (cùng 1 lỗi, cùng class .ghn-tg-combo-search). -->
                            <input type="text" class="ghn-tg-combo-search" id="ghn-tg-hub-combo-search" placeholder="🔎 Tìm bưu cục theo tên hoặc mã..." autocomplete="off">
                            <div class="ghn-tg-combo-list" id="ghn-tg-hub-combo-list">
                                <div style="text-align:center; color:#6c757d; font-size:12px; padding:10px;">Chưa có danh sách bưu cục.</div>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; padding-top:6px; border-top:1px solid #e9ecef;">
                                <button type="button" id="ghn-tg-hub-combo-clear-btn" style="padding:4px 8px; border-radius:6px; border:1px solid #ced4da; background:#fff; color:#e03131; font-size:11px; cursor:pointer;">🗑️ Xoá danh sách đã chọn</button>
                                <button type="button" id="ghn-tg-hub-combo-done-btn" style="padding:4px 10px; border-radius:6px; border:none; background:${GHN_BLUE}; color:#fff; font-size:11px; cursor:pointer; font-weight:700;">Xong</button>
                            </div>
                        </div>
                    </div>
                </label>
                <button id="ghn-tg-staff-refresh-hubs-btn" class="ghn-tg-icon-btn" title="Làm mới danh sách bưu cục (từ tab Bản Đồ)">🔄</button>

                <span class="ghn-tg-controls-sep"></span>

                <label style="font-size:12px; color:#495057;">Nhân viên:
                    <!-- v1.7.5 — thay <select> native (xổ ra cả trăm dòng, không tìm kiếm
                         được, "quá tốn diện tích") bằng combobox tự vẽ: gọn khi đóng,
                         bấm mở mới hiện ô tìm kiếm + danh sách cuộn được — xem
                         wireStaffCombo_()/renderStaffComboOptions_(). -->
                    <div class="ghn-tg-combo" id="ghn-tg-staff-combo">
                        <button type="button" class="ghn-tg-combo-trigger" id="ghn-tg-staff-combo-trigger">
                            <span class="ghn-tg-combo-trigger-label">Tất cả</span><span>▾</span>
                        </button>
                        <div class="ghn-tg-combo-panel" id="ghn-tg-staff-combo-panel" style="display:none;">
                            <input type="text" class="ghn-tg-combo-search" id="ghn-tg-staff-combo-search" placeholder="🔎 Tìm nhân viên theo tên hoặc mã..." autocomplete="off">
                            <div class="ghn-tg-combo-list" id="ghn-tg-staff-combo-list"></div>
                        </div>
                    </div>
                </label>
                <label style="font-size:12px; color:#495057;">Nhóm KH:
                    <select id="ghn-tg-staff-group-select">
                        <option value="all">Tất cả</option>
                        <option value="TTS">TTS (TikTok Shop)</option>
                        <option value="Shopee">Shopee</option>
                        <option value="SME">SME</option>
                        <option value="Khac">Khác</option>
                    </select>
                </label>
            </div>

            <div class="ghn-tg-staff-content">
                <div id="ghn-tg-staff-status" style="font-size:12px; color:#6c757d;">Chưa tải dữ liệu.</div>
                <div id="ghn-tg-staff-summary" style="margin-top:6px; font-size:12px; color:#495057; font-weight:600;"></div>
                <div id="ghn-tg-staff-table-wrap" class="ghn-tg-staff-table-wrap"></div>
            </div>
        `;
        return panel;
    }

    function setStaffStatus_(text) {
        const el = document.getElementById('ghn-tg-staff-status');
        if (el) el.textContent = text;
    }

    // ==================== HẠ TẦNG DÙNG CHUNG CHO MỌI PANEL XỔ-XUỐNG (v1.7.8) ====================
    // Trước v1.7.8, mỗi combobox ("Nhân viên", "Bưu cục") tự vẽ panel 'position:absolute'
    // NẰM TRONG cây DOM của khối cha chứa nó — nếu khối cha đó (hoặc bất kỳ tổ tiên nào)
    // có 'overflow-y:auto/hidden' (VD khối nội dung tab "Theo Nhân Viên" cuộn được), phần
    // panel tràn RA NGOÀI ranh giới khối cha bị CẮT MẤT dù toạ độ vẫn đúng — đúng lỗi người
    // dùng chụp ảnh báo "nút Xoá đã chọn/Xong như đang bị ẩn dưới 1 layer". 3 hàm dưới đây
    // là hạ tầng DÙNG CHUNG cho MỌI panel xổ-xuống trong modul (Lớp hiển thị/Chú thích/Nhân
    // viên/Bưu cục) — SỬA TẬN GỐC bằng kỹ thuật "portal": khi mở, panel được chuyển thành
    // con TRỰC TIẾP của <body> với 'position:fixed', toạ độ tính lại bằng JS theo đúng vị
    // trí nút bấm trên MÀN HÌNH THẬT (getBoundingClientRect — không phụ thuộc DOM cha) —
    // thoát HẲN mọi vùng overflow của bất kỳ khối cha nào. Đồng thời cư xử kiểu menu thanh
    // công cụ macOS: bấm mở panel nào thì các panel KHÁC đang mở tự đóng lại.
    const ghnTgDropdownRegistry_ = [];
    let ghnTgDropdownCloserInstalled_ = false;

    function ghnTgEnsurePortal_(panelEl) {
        if (panelEl.parentElement !== document.body) document.body.appendChild(panelEl);
        panelEl.classList.add('ghn-tg-combo-panel-portal');
    }

    function ghnTgPositionPanel_(triggerEl, panelEl) {
        const r = triggerEl.getBoundingClientRect();
        const panelWidth = panelEl.offsetWidth || 260;
        let left = r.left;
        const maxLeft = window.innerWidth - panelWidth - 8;
        if (left > maxLeft) left = Math.max(8, maxLeft);
        let top = r.bottom + 4;
        const panelHeight = panelEl.offsetHeight || 200;
        // Tràn xuống dưới màn hình -> hiện NGƯỢC LÊN TRÊN nút bấm thay vì bị cắt mất phần dưới.
        if (top + panelHeight > window.innerHeight - 8) {
            top = Math.max(8, r.top - panelHeight - 4);
        }
        panelEl.style.left = Math.round(left) + 'px';
        panelEl.style.top = Math.round(top) + 'px';
        panelEl.style.minWidth = Math.round(r.width) + 'px';
    }

    function ghnTgInstallDropdownCloser_() {
        if (ghnTgDropdownCloserInstalled_) return;
        ghnTgDropdownCloserInstalled_ = true;
        document.addEventListener('click', (e) => {
            ghnTgDropdownRegistry_.forEach(({ triggerId, panelId }) => {
                const trigger = document.getElementById(triggerId);
                const panel = document.getElementById(panelId);
                if (!trigger || !panel || panel.style.display === 'none') return;
                if (trigger.contains(e.target) || panel.contains(e.target)) return;
                panel.style.display = 'none';
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            ghnTgDropdownRegistry_.forEach(({ panelId }) => {
                const panel = document.getElementById(panelId);
                if (panel) panel.style.display = 'none';
            });
        });
    }

    // Đăng ký 1 cặp trigger/panel — trả về hàm open(triggerEl, panelEl) để gọi lúc bấm mở
    // (đóng các panel khác + portal ra <body> + đặt vị trí đúng). opts.onOpen (tuỳ chọn)
    // chạy SAU khi panel đã hiện + đặt vị trí xong (dùng để focus ô tìm kiếm, render lại
    // danh sách mỗi lần mở, v.v — xem wireHubCombo_/wireStaffCombo_ bên dưới).
    function ghnTgRegisterDropdown_(triggerId, panelId, opts) {
        opts = opts || {};
        const trigger = document.getElementById(triggerId);
        const panel = document.getElementById(panelId);
        if (!trigger || !panel) return;
        ghnTgEnsurePortal_(panel);
        // Tránh phình mảng đăng ký khi modul bị đóng/mở lại nhiều lần (buildMapPanel_/
        // buildStaffPanel_ tạo phần tử DOM MỚI nhưng CÙNG id mỗi lần mở lại) — chỉ giữ 1
        // bản ghi cho mỗi cặp trigger/panel id, tra cứu phần tử DOM luôn theo id MỚI NHẤT.
        if (!ghnTgDropdownRegistry_.some(d => d.triggerId === triggerId && d.panelId === panelId)) {
            ghnTgDropdownRegistry_.push({ triggerId, panelId });
        }
        ghnTgInstallDropdownCloser_();
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = panel.style.display !== 'none';
            if (isOpen) { panel.style.display = 'none'; return; }
            ghnTgDropdownRegistry_.forEach(({ panelId: pid }) => {
                if (pid === panelId) return;
                const p = document.getElementById(pid);
                if (p) p.style.display = 'none';
            });
            panel.style.display = '';
            ghnTgPositionPanel_(trigger, panel);
            if (opts.onOpen) opts.onOpen();
        });
    }

    // Gọi lúc ĐÓNG cửa sổ modul (nút ✖) — xoá khỏi DOM mọi panel đã bị "portal" ra <body>
    // (chúng không còn là con của root nên root.remove() không dọn được) rồi làm rỗng mảng
    // đăng ký, để lần MỞ LẠI modul sau đó không bị lẫn với panel MỒ CÔI cũ trùng id — xem
    // giải thích đầy đủ ở nút "ghn-tg-close-btn" trong openWindow_.
    function ghnTgCleanupPortaledDropdowns_() {
        ghnTgDropdownRegistry_.forEach(({ panelId }) => {
            const panel = document.getElementById(panelId);
            if (panel && panel.classList.contains('ghn-tg-combo-panel-portal')) panel.remove();
        });
        ghnTgDropdownRegistry_.length = 0;
    }

    // v1.7.6 — thay renderStaffHubCheckboxes_() (danh sách checkbox LUÔN HIỆN, chiếm nhiều
    // diện tích) bằng combobox xổ-xuống ĐA CHỌN (checkbox nằm TRONG panel #ghn-tg-hub-combo-panel,
    // chỉ hiện khi bấm mở #ghn-tg-hub-combo-trigger) — đúng yêu cầu "không để phần hiển thị
    // mấy cái nút chọn bưu cục => mà danh sách xổ xuống và chọn ... cho tìm kiếm và nút chọn,
    // nút xoá danh sách đã chọn". Giữ NGUYÊN cơ chế lọc-chỉ-hiển-thị (không đụng
    // state.staffHubSelection khi gõ tìm kiếm) như renderStaffHubCheckboxes_() cũ.
    function renderHubComboList_(filterTerm) {
        const list = document.getElementById('ghn-tg-hub-combo-list');
        if (!list) return;
        if (!state.hubs || state.hubs.length === 0) {
            list.innerHTML = '<div class="ghn-tg-combo-item-empty">Chưa có danh sách bưu cục — bấm "🔄 Làm mới danh sách bưu cục" ở dưới.</div>';
            return;
        }
        const term = String(filterTerm || '').trim().toLowerCase();
        const items = term
            ? state.hubs.filter(h => String(h.hub_code).toLowerCase().includes(term) || String(h.name || '').toLowerCase().includes(term))
            : state.hubs;
        if (items.length === 0) {
            list.innerHTML = '<div class="ghn-tg-combo-item-empty">Không tìm thấy bưu cục nào khớp — vẫn giữ nguyên các bưu cục đã tick trước đó (nếu có).</div>';
            return;
        }
        list.innerHTML = items.map(h => {
            const code = String(h.hub_code);
            const checked = state.staffHubSelection.has(code) ? 'checked' : '';
            return `<label class="ghn-tg-combo-item" style="cursor:pointer;">
                <span style="display:flex; align-items:center; gap:6px; overflow:hidden;">
                    <input type="checkbox" class="ghn-tg-hub-combo-checkbox" value="${escapeHtml_(code)}" ${checked} style="flex-shrink:0;">
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml_(h.name || code)}</span>
                </span>
                <span style="color:#adb5bd; flex-shrink:0;">(${escapeHtml_(code)})</span>
            </label>`;
        }).join('');
    }

    function updateHubComboTriggerLabel_() {
        const label = document.getElementById('ghn-tg-hub-combo-trigger-label');
        if (!label) return;
        const n = state.staffHubSelection.size;
        if (n === 0) {
            label.textContent = 'Chưa chọn bưu cục nào';
        } else if (n === 1) {
            const code = Array.from(state.staffHubSelection)[0];
            const hub = (state.hubs || []).find(h => String(h.hub_code) === code);
            label.textContent = hub ? (hub.name || code) : code;
        } else {
            label.textContent = `${n} bưu cục đã chọn`;
        }
    }

    function closeHubCombo_() {
        const panel = document.getElementById('ghn-tg-hub-combo-panel');
        if (panel) panel.style.display = 'none';
    }

    function wireHubCombo_() {
        const search = document.getElementById('ghn-tg-hub-combo-search');
        const list = document.getElementById('ghn-tg-hub-combo-list');
        const clearBtn = document.getElementById('ghn-tg-hub-combo-clear-btn');
        const doneBtn = document.getElementById('ghn-tg-hub-combo-done-btn');
        if (!search || !list) return;
        // v1.7.8 — mở/định vị/đóng-khi-mở-panel-khác giờ dùng chung hạ tầng portal
        // (ghnTgRegisterDropdown_), thoát khỏi lỗi bị cắt mất phần dưới panel — xem giải
        // thích đầy đủ ở khối "HẠ TẦNG DÙNG CHUNG CHO MỌI PANEL XỔ-XUỐNG" phía trên.
        ghnTgRegisterDropdown_('ghn-tg-hub-combo-trigger', 'ghn-tg-hub-combo-panel', {
            onOpen: () => { search.value = ''; renderHubComboList_(''); search.focus(); }
        });
        search.addEventListener('input', (e) => renderHubComboList_(e.target.value));
        search.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHubCombo_(); });
        // Đa chọn — KHÔNG đóng panel sau mỗi lần tick (khác combobox "Nhân viên" đơn chọn) để
        // tick liên tiếp nhiều bưu cục cho tiện, bấm "Xong" hoặc bấm ra ngoài mới đóng.
        list.addEventListener('change', (e) => {
            const cb = e.target.closest('.ghn-tg-hub-combo-checkbox');
            if (!cb) return;
            const code = cb.value;
            if (cb.checked) state.staffHubSelection.add(code);
            else state.staffHubSelection.delete(code);
            updateHubComboTriggerLabel_();
        });
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                state.staffHubSelection.clear();
                renderHubComboList_(search.value);
                updateHubComboTriggerLabel_();
            });
        }
        if (doneBtn) doneBtn.addEventListener('click', () => closeHubCombo_());
    }

    async function ensureStaffTabReady_() {
        if (state.hubs && state.hubs.length > 0) {
            renderHubComboList_('');
            updateHubComboTriggerLabel_();
            return;
        }
        setStaffStatus_('Đang tải danh sách bưu cục (từ tab Bản Đồ)...');
        try {
            await loadAllData_(() => {});
            renderHubComboList_('');
            updateHubComboTriggerLabel_();
            setStaffStatus_('Đã có danh sách bưu cục — chọn bưu cục + ngày rồi bấm "Tải sản lượng".');
        } catch (err) {
            setStaffStatus_(`❌ Không tải được danh sách bưu cục: ${err.message || err}`);
        }
    }

    // Đổ danh sách nhân viên (gom từ rows đã tải) vào select, GIỮ nguyên lựa chọn hiện
    // tại nếu vẫn còn tồn tại trong dữ liệu mới.
    // v1.7.5 — thay cho refreshStaffSelectOptions_() cũ (đổ vào <select> native). Gom danh
    // sách nhân viên (từ state.staffRawRows đã tải) thành state.staffComboOptions — dùng
    // chung cho việc VẼ danh sách (renderStaffComboList_) lẫn LỌC theo từ khoá gõ vào ô tìm
    // kiếm. Giữ nguyên state.staffSelectedStaffKey nếu vẫn còn tồn tại trong dữ liệu mới
    // (đúng hành vi refreshStaffSelectOptions_() cũ), về lại "all" nếu không còn.
    function refreshStaffComboOptions_() {
        const staffMap = new Map(); // staffKey -> driverName
        state.staffRawRows.forEach(r => { if (!staffMap.has(r.staffKey)) staffMap.set(r.staffKey, r.driverName); });
        const keys = Array.from(staffMap.keys()).sort((a, b) => a.localeCompare(b));
        state.staffComboOptions = keys.map(k => {
            const driverId = k.split(' - ')[0];
            return { key: k, driverName: staffMap.get(k), driverId, hrm: resolveHrmDisplay_(driverId) };
        });
        if (state.staffSelectedStaffKey !== 'all' && !keys.includes(state.staffSelectedStaffKey)) {
            state.staffSelectedStaffKey = 'all';
        }
        renderStaffComboList_('');
        updateStaffComboTriggerLabel_();
    }

    // Vẽ lại danh sách trong panel combobox theo từ khoá tìm kiếm (rỗng = hiện tất cả) —
    // so khớp KHÔNG phân biệt dấu/hoa-thường (dùng chung normalizeVn_ với phần khớp xã/
    // phường trong modul, nhất quán 1 kiểu tìm kiếm xuyên suốt) trên cả tên VÀ mã nhân viên.
    function renderStaffComboList_(filterTerm) {
        const list = document.getElementById('ghn-tg-staff-combo-list');
        if (!list) return;
        const term = normalizeVn_(filterTerm || '');
        const items = [{ key: 'all', driverName: 'Tất cả', driverId: '', hrm: null }]
            .concat(state.staffComboOptions || [])
            .filter(o => o.key === 'all' || !term || normalizeVn_(o.driverName).includes(term) || String(o.driverId).includes(term));
        if (items.length === 1) { // chỉ còn mỗi "Tất cả" -> không khớp gì
            list.innerHTML = '<div class="ghn-tg-combo-item-empty">Không tìm thấy nhân viên nào khớp.</div>';
            return;
        }
        list.innerHTML = items.map(o => {
            const activeCls = o.key === state.staffSelectedStaffKey ? ' active' : '';
            const idSuffix = o.key === 'all' ? '' : ` <span style="color:#adb5bd;">(${o.driverId})</span>`;
            // Hiện trạng thái nhân sự NGAY trong danh sách chọn (nếu đã nghỉ/tạm nghỉ) để
            // người lọc nhận ra ngay từ đây, không cần chọn thử rồi mới biết.
            const hrmBadge = (o.hrm && o.hrm.isInactive) ? `<span style="color:${o.hrm.color}; font-size:10px; font-weight:700; white-space:nowrap;">${o.hrm.dotIcon} ${o.hrm.label}</span>` : '';
            return `<div class="ghn-tg-combo-item${activeCls}" data-key="${escapeHtml_(o.key)}"><span>${escapeHtml_(o.driverName)}${idSuffix}</span>${hrmBadge}</div>`;
        }).join('');
    }

    function updateStaffComboTriggerLabel_() {
        const label = document.querySelector('#ghn-tg-staff-combo-trigger .ghn-tg-combo-trigger-label');
        if (!label) return;
        if (state.staffSelectedStaffKey === 'all') { label.textContent = 'Tất cả'; return; }
        const found = (state.staffComboOptions || []).find(o => o.key === state.staffSelectedStaffKey);
        label.textContent = found ? `${found.driverName} (${found.driverId})` : 'Tất cả';
    }

    function closeStaffCombo_() {
        const panel = document.getElementById('ghn-tg-staff-combo-panel');
        if (panel) panel.style.display = 'none';
    }

    // Dây sự kiện cho combobox "Nhân viên" — trigger mở/đóng panel, ô tìm kiếm lọc realtime,
    // click 1 dòng trong danh sách = chọn (delegation trên container list vì nội dung được
    // vẽ lại liên tục theo từ khoá tìm kiếm — gắn listener trực tiếp từng dòng sẽ mất tác
    // dụng ngay sau lần gõ tìm kiếm đầu tiên), click ra ngoài panel = tự đóng lại.
    function wireStaffCombo_() {
        const search = document.getElementById('ghn-tg-staff-combo-search');
        const list = document.getElementById('ghn-tg-staff-combo-list');
        if (!search || !list) return;
        // v1.7.8 — xem giải thích ở wireHubCombo_() phía trên (hạ tầng portal dùng chung).
        ghnTgRegisterDropdown_('ghn-tg-staff-combo-trigger', 'ghn-tg-staff-combo-panel', {
            onOpen: () => { search.value = ''; renderStaffComboList_(''); search.focus(); }
        });
        search.addEventListener('input', (e) => renderStaffComboList_(e.target.value));
        search.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStaffCombo_(); });
        list.addEventListener('click', (e) => {
            const item = e.target.closest('.ghn-tg-combo-item');
            if (!item || !item.dataset.key) return;
            state.staffSelectedStaffKey = item.dataset.key;
            updateStaffComboTriggerLabel_();
            closeStaffCombo_();
            renderStaffTable_();
        });
    }

    function hubNameForStaffTable_(hubId) {
        const h = state.hubsByCode ? state.hubsByCode[String(hubId)] : null;
        return h && h.name ? h.name : String(hubId);
    }

    // Popup HTML cho nút "+" ở mỗi dòng — hiện TOÀN BỘ xã/phường (MỚI) đã khớp được từ
    // địa chỉ các đơn GIAO của (nhân viên, ngày) đó, để tự kiểm chứng thuật toán khớp
    // đúng/sai — đúng yêu cầu "cho vào 1 dấu cộng ... để tao coi mày chạy code đã đúng
    // chưa". LUÔN tính trên TOÀN BỘ đơn giao trong ngày (không bị bộ lọc nhân viên/nhóm
    // khách hàng đang chọn ảnh hưởng) — vì đây chính là dữ liệu chấm trên bản đồ đang
    // dùng, lọc khác đi sẽ gây hiểu lầm "chấm sai" khi thực ra chỉ là bảng đang lọc.
    // TỪ v1.5.5: debugList là 1 MẢNG (có thể >1 phần tử nếu nhân viên giao nhiều
    // xã/phường ≥15% trong ngày đó) — wardBreakdown/unmatchedCount/... giống nhau ở mọi
    // phần tử (đều tính trên CẢ NGÀY), chỉ khác wardCode/giaoCount/... (riêng từng xã/
    // phường). computeStaffWardAssignments_() LUÔN trả về mảng đã sắp xếp GIẢM DẦN theo
    // số đơn -> debugList[0] chính là xã/phường "CHÍNH" mà computeStaffTerritories_()
    // dùng để đặt chấm/tên (v1.6.0) — các phần tử còn lại là xã/phường "PHỤ", vẫn thuộc
    // tuyến giao (có tô viền trên bản đồ) nhưng KHÔNG phải nơi đặt chấm.
    function wardDebugHtml_(debugList) {
        if (!debugList || debugList.length === 0) return '<div style="padding:6px 10px; font-size:11px; color:#adb5bd;">Không có đơn giao nào trong ngày.</div>';
        const shared = debugList[0];
        const qualifyingWardCodes = debugList.filter(d => d.wardCode).map(d => d.wardCode); // đã sắp xếp giảm dần theo số đơn
        const primaryWardCode = qualifyingWardCodes[0] || null;
        const secondaryWardCodes = new Set(qualifyingWardCodes.slice(1));
        const rows = shared.wardBreakdown.map(b => {
            const w = state.wardsByCode ? state.wardsByCode[b.wardCode] : null;
            const name = w ? w.name : b.wardCode;
            const pct = Math.round(b.share * 100);
            const mark = b.wardCode === primaryWardCode ? ' 🏆 (chính — đặt chấm/tên)'
                : secondaryWardCodes.has(b.wardCode) ? ' ✅ (phụ — chỉ tô viền)'
                : '';
            const dk = qhKmDist_(shared.hubId, 'BC', b.wardCode);
            const kmTxt = dk.km !== null ? ` · 🛣️ cách BC <b>${qhKmFmt_(dk.km)} km</b>${dk.road ? '' : ' (chim bay)'}` : '';
            return `<div>${name}: <b>${b.count}</b> đơn (${pct}%)${mark}${kmTxt}</div>`;
        }).join('');
        const unmatchedLine = shared.unmatchedCount > 0
            ? `<div style="color:#dc3545;">Không khớp được xã/phường nào: <b>${shared.unmatchedCount}</b> đơn (${Math.round(shared.unmatchedCount / shared.dayTotalGiao * 100)}%)</div>`
            : '';
        let resultLine;
        if (qualifyingWardCodes.length === 0) {
            resultLine = `<div style="margin-top:4px; color:#dc3545;">→ KHÔNG xác định được tuyến giao (không xã/phường nào đạt ≥15% tổng đơn giao trong ngày).</div>`;
        } else {
            const names = qualifyingWardCodes.map(code => {
                const w = state.wardsByCode ? state.wardsByCode[code] : null;
                return w ? w.name : code;
            });
            const gpsNote = debugList.some(d => d.wardCode && d.wardGpsCenter) ? ' (dùng toạ độ GPS thật, trung bình các đơn)' : '';
            resultLine = names.length > 1
                ? `<div style="margin-top:4px; color:#28a745;">→ Tuyến giao gồm <b>${names.length}</b> xã/phường (tô viền cả ${names.length}): <b>${names[0]}</b> (chính — đặt chấm/tên) + ${names.slice(1).join(', ')} (phụ)${gpsNote}.</div>`
                : `<div style="margin-top:4px; color:#28a745;">→ Đặt chấm/tên tại <b>${names[0]}</b>${gpsNote}.</div>`;
        }
        const kmT = qhKmTrip_(shared.hubId, qhKmWardsOf_(shared));
        const kmLine = kmT ? `<div style="margin-top:4px; color:#1c4f9c;">🛣️ Km giao ước tính: <b>${qhKmFmt_(kmT.km)} km</b>${kmT.road ? '' : ' (chim bay)'} — bưu cục → ${kmT.n} xã/phường → về bưu cục${kmT.far ? ` · xa nhất: <b>${(state.wardsByCode && state.wardsByCode[kmT.far.wc] ? state.wardsByCode[kmT.far.wc].name : kmT.far.wc)}</b> cách BC ${qhKmFmt_(kmT.far.km)} km` : ''}.</div>` : '';
        const sourceLine = kmLine + `<div style="margin-top:4px; color:#6c757d;">Nguồn xã/phường: ${shared.fromGhnField} đơn lấy trực tiếp từ GHN (wardCode) · ${shared.fromFuzzyMatch} đơn suy luận từ địa chỉ text (dự phòng).</div>`;
        return `<div style="padding:6px 10px; font-size:11px; line-height:1.7;">${rows}${unmatchedLine}${resultLine}${sourceLine}</div>`;
    }

    // Vẽ lại bảng kết quả từ state.staffRawRows + 2 bộ lọc đang chọn (nhân viên/nhóm KH)
    // — KHÔNG gọi lại API, chỉ tính toán lại trong bộ nhớ nên rất nhanh.
    // ==================== v1.7.45 — KHOẢNG CÁCH BƯU CỤC → XÃ/PHƯỜNG + KM 1 NHÂN VIÊN GIAO ====================
    // Chủ dự án yêu cầu: "khoảng cách di chuyển từ bưu cục đến trung tâm xã/phường các tuyến giao,
    // để xem 1 nhân viên giao bao nhiêu km và từ bưu cục đến xã/phường đó bao xa".
    // - Điểm xã/phường = TÂM xã/phường (centroidForWard_), điểm bưu cục = toạ độ BC (hubs.json).
    // - Khoảng cách ĐƯỜNG BỘ lấy từ OSRM công khai (router.project-osrm.org, cho phép CORS *):
    //   MỖI bưu cục 1 lần gọi bảng khoảng cách (table) giữa BC + mọi xã/phường có đơn → dùng chung cho
    //   mọi nhân viên của BC đó. Gọi lần lượt, cách nhau ~1,1s (giới hạn của máy chủ công khai).
    //   Không gọi được thì dùng ĐƯỜNG CHIM BAY và ghi rõ "chim bay".
    // - Km giao 1 nhân viên / ngày (ước tính) = BC → lần lượt tâm các xã/phường có đơn giao (xã gần nhất
    //   đi trước) → về BC. Bỏ xã/phường lẻ tẻ < 3% đơn giao trong ngày (thường do GPS sai).
    const QH_KM_MIN_SHARE_ = 0.03;
    function qhKmHav_(a, b) {
        const R = 6371, rad = Math.PI / 180, dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
    }
    function qhKmHubPos_(hubId) {
        const h = state.hubsByCode ? state.hubsByCode[String(hubId)] : null;
        const lat = h ? Number(h.lat) : NaN, lng = h ? Number(h.lng) : NaN;
        return isFinite(lat) && isFinite(lng) && lat && lng ? [lng, lat] : null;
    }
    function qhKmWardPos_(wc) { const c = centroidForWard_(String(wc)); return c && isFinite(+c[0]) && isFinite(+c[1]) ? [+c[0], +c[1]] : null; }
    function qhKmFmt_(km) { return km === null || km === undefined || !isFinite(km) ? '—' : (Math.round(km * 10) / 10).toLocaleString('vi-VN'); }
    function qhKmHttp_(url) {
        if (typeof GM_xmlhttpRequest === 'function') {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({ method: 'GET', url, timeout: 20000,
                    onload: (r) => { try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(e); } },
                    onerror: () => reject(new Error('net')), ontimeout: () => reject(new Error('timeout')) });
            });
        }
        return fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    }
    // Khoảng cách giữa 2 điểm của 1 bưu cục ('BC' hoặc mã xã/phường) → {km, road}
    function qhKmDist_(hubId, a, b) {
        const R = state.qhKmRoad && state.qhKmRoad[String(hubId)];
        if (R && R.m && R.ix[a] !== undefined && R.ix[b] !== undefined) {
            const v = R.m[R.ix[a]] && R.m[R.ix[a]][R.ix[b]];
            if (typeof v === 'number' && isFinite(v)) return { km: v / 1000, road: true };
        }
        const pa = a === 'BC' ? qhKmHubPos_(hubId) : qhKmWardPos_(a), pb = b === 'BC' ? qhKmHubPos_(hubId) : qhKmWardPos_(b);
        if (!pa || !pb) return { km: null, road: false };
        return { km: qhKmHav_(pa, pb), road: false };
    }
    // Danh sách xã/phường tính km của 1 (nhân viên, ngày) — từ wardBreakdown (cả ngày)
    function qhKmWardsOf_(asg) {
        if (!asg || !asg.wardBreakdown) return [];
        const tot = asg.dayTotalGiao || 1;
        return asg.wardBreakdown.filter((b) => b.count / tot >= QH_KM_MIN_SHARE_ && qhKmWardPos_(b.wardCode)).map((b) => b.wardCode);
    }
    // Km giao (ước tính) + xã xa nhất của 1 (nhân viên, ngày)
    function qhKmTrip_(hubId, wards) {
        if (!qhKmHubPos_(hubId) || !wards.length) return null;
        const left = wards.slice(); let cur = 'BC', tot = 0, road = true, far = null;
        wards.forEach((w) => { const d = qhKmDist_(hubId, 'BC', w); if (d.km !== null && (!far || d.km > far.km)) far = { wc: w, km: d.km, road: d.road }; });
        while (left.length) {
            let bi = -1, bd = null;
            left.forEach((w, i) => { const d = qhKmDist_(hubId, cur, w); if (d.km !== null && (bd === null || d.km < bd.km)) { bd = d; bi = i; } });
            if (bi < 0) break; tot += bd.km; if (!bd.road) road = false; cur = left[bi]; left.splice(bi, 1);
        }
        const back = qhKmDist_(hubId, cur, 'BC'); if (back.km !== null) { tot += back.km; if (!back.road) road = false; }
        return { km: tot, road, far, n: wards.length };
    }
    // Bảng tra (nhân viên, ngày THẬT) → assignment cả ngày (dựng lại khi dữ liệu đổi)
    function qhKmAsgMap_() {
        const rows = state.staffRawRows || [];
        if (state.qhKmAsgRows === rows && state.qhKmAsg) return state.qhKmAsg;
        buildWardMatchIndex_();
        const m = new Map();
        computeStaffWardAssignments_(rows).forEach((a) => { const k = a.staffKey + '\u0001' + a.tripDate; if (!m.has(k)) m.set(k, a); });
        state.qhKmAsg = m; state.qhKmAsgRows = rows; return m;
    }
    function qhKmStaffDay_(staffKey, tripDate, hubId) {
        const a = qhKmAsgMap_().get(staffKey + '\u0001' + tripDate);
        if (!a) return null; return qhKmTrip_(hubId || a.hubId, qhKmWardsOf_(a));
    }
    // Popup chấm (có thể gộp nhiều ngày) → trung bình km/ngày các ngày của nhân viên đó
    function qhKmStaffAvg_(staffKey, hubId) {
        const xs = []; qhKmAsgMap_().forEach((a) => { if (a.staffKey === staffKey && String(a.hubId) === String(hubId)) { const t = qhKmTrip_(a.hubId, qhKmWardsOf_(a)); if (t) xs.push(t); } });
        if (!xs.length) return null;
        return { km: xs.reduce((s, t) => s + t.km, 0) / xs.length, road: xs.every((t) => t.road), n: xs.length };
    }
    // Lấy khoảng cách đường bộ cho mọi bưu cục đang có dữ liệu (1 lần gọi / BC), xong thì vẽ lại bảng
    async function qhKmPrefetch_() {
        if (state.qhKmBusy) return; state.qhKmRoad = state.qhKmRoad || {};
        const need = {};
        qhKmAsgMap_().forEach((a) => { const h = String(a.hubId); if (!qhKmHubPos_(h)) return; (need[h] = need[h] || new Set()); (a.wardBreakdown || []).forEach((b) => { if (qhKmWardPos_(b.wardCode)) need[h].add(String(b.wardCode)); }); });
        const todo = Object.keys(need).filter((h) => { const R = state.qhKmRoad[h]; if (!R) return true; if (R.fail) return false; return Array.from(need[h]).some((w) => R.ix[w] === undefined); });
        if (!todo.length) return;
        state.qhKmBusy = true; let changed = false;
        try {
            for (let i = 0; i < todo.length; i++) {
                const h = todo[i], old = state.qhKmRoad[h], ws = Array.from(new Set([].concat(old ? Object.keys(old.ix).filter((k) => k !== 'BC') : [], Array.from(need[h])))).slice(0, 95);
                const keys = ['BC'].concat(ws), pts = keys.map((k) => k === 'BC' ? qhKmHubPos_(h) : qhKmWardPos_(k));
                const url = 'https://router.project-osrm.org/table/v1/driving/' + pts.map((p) => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join(';') + '?annotations=distance';
                try {
                    const j = await qhKmHttp_(url);
                    if (j && j.code === 'Ok' && Array.isArray(j.distances)) { const ix = {}; keys.forEach((k, n) => { ix[k] = n; }); state.qhKmRoad[h] = { ix, m: j.distances }; changed = true; }
                    else state.qhKmRoad[h] = { ix: {}, m: null, fail: true };
                } catch (e) { state.qhKmRoad[h] = { ix: {}, m: null, fail: true }; }
                if (i < todo.length - 1) await new Promise((r) => setTimeout(r, 1100));
            }
        } finally { state.qhKmBusy = false; }
        if (changed) try { renderStaffTable_(); } catch (e) {}
    }

    function renderStaffTable_() {
        const summaryEl = document.getElementById('ghn-tg-staff-summary');
        const wrapEl = document.getElementById('ghn-tg-staff-table-wrap');
        if (!summaryEl || !wrapEl) return;

        const agg = aggregateStaffRows_(state.staffRawRows, state.staffSelectedStaffKey, state.staffSelectedGroup);
        if (state.staffRawRows.length === 0) {
            summaryEl.textContent = '';
            wrapEl.innerHTML = '';
            return;
        }
        const staffCount = new Set(agg.map(a => a.staffKey)).size;
        const hubCount = new Set(agg.map(a => a.hubId)).size;
        const totalOrders = agg.reduce((s, a) => s + a.total, 0);

        // Dựng lại debug khớp xã/phường (GIỐNG HỆT dữ liệu dùng để đặt chấm trên bản đồ)
        // để nút "+" hiện đúng thực tế thuật toán đang chạy.
        buildWardMatchIndex_();
        const wardAssignments = computeStaffWardAssignments_(state.staffRawRows);
        const wardDebugMap = new Map(); // key -> mảng kết quả (v1.5.5: có thể >1 chấm/ngày)
        wardAssignments.forEach(a => {
            const dkey = `${a.staffKey}${a.tripDate}`;
            if (!wardDebugMap.has(dkey)) wardDebugMap.set(dkey, []);
            wardDebugMap.get(dkey).push(a);
        });

        // v1.7.22 — map chỉ số cấp bưu cục/ngày từ sheet "Performance" (Volume/% Gán/% GTC), khớp
        // qua (hubCode, tripDate) — performanceHubCode_() trả null nếu tên bưu cục trong sheet
        // không khớp được (bỏ qua, không đoán mò, giống cách computeHubStaffingStats_ đã làm).
        // v1.7.23 — KHÔNG còn lặp lại làm 3 CỘT RIÊNG mỗi dòng nhân viên nữa (phản hồi thật: "3
        // cột cuối không ai để vậy" — số liệu CẤP BƯU CỤC/NGÀY lặp y hệt trên MỌI dòng nhân viên
        // cùng bưu cục/ngày trông thừa/rối) — dùng để gộp vào dòng TÓM TẮT phía trên bảng thay
        // vào đó, xem đoạn tính perfSummaryNote ngay dưới đây.
        const perfByHubDateKey_ = (hubCode, date) => `${hubCode}::${date}`;
        const perfByHubDate = new Map(); // perfByHubDateKey_(hubCode,date) -> {volume, pctGan, pctGtc}
        (state.performanceRows || []).forEach(p => {
            const hc = performanceHubCode_(p.hubName);
            if (!hc) return;
            perfByHubDate.set(perfByHubDateKey_(hc, p.date), {
                volume: typeof p.volume === 'number' ? p.volume : 0,
                pctGan: typeof p.pctGan === 'number' ? p.pctGan : null,
                pctGtc: typeof p.pctGtc === 'number' ? p.pctGtc : null
            });
        });

        // v1.7.22 — hàng TỔNG (phản hồi thật: "thêm số tổng vào") — LUÔN cộng dồn từ TOÀN BỘ
        // `agg` (không chỉ `shown`, phần bị cắt bởi MAX_ROWS bên dưới) để không báo tổng THIẾU khi
        // bảng đang hiển thị giới hạn 500 dòng đầu.
        const totalPickSuccess = agg.reduce((s, a) => s + a.pickSuccess, 0);
        const totalPickFail = agg.reduce((s, a) => s + a.pickFail, 0);
        const totalDeliverSuccess = agg.reduce((s, a) => s + a.deliverSuccess, 0);
        const totalDeliverFail = agg.reduce((s, a) => s + a.deliverFail, 0);
        const totalReturn = agg.reduce((s, a) => s + a.returnCount, 0);

        // v1.7.23 — dòng tóm tắt phía trên bảng. Phản hồi thật: "còn cái số 1409 là mày đang gom
        // cả đơn lấy vào à? => số này ko cần. vì tao xem số tổng trong bảng rồi" — trước đây hiện
        // "Tổng: X đơn" gộp CHUNG Lấy/Giao/Trả (đúng là gồm cả đơn Lấy, dễ hiểu lầm là số đơn
        // Giao), nay đổi thành riêng "Tổng đơn giao" (Giao TC + Giao thất bại — đúng khối lượng
        // GIAO chính đang xem, số Lấy/Trả/Tổng gộp đã có sẵn & tách rõ ở hàng TỔNG cuối bảng, không
        // cần lặp lại ở đây nữa). Đồng thời "di dời chỉ số bưu cục lên hàng bên trên" (Volume/%
        // Gán/% GTC, trước đây lặp lại y hệt ở 3 cột cuối MỌI dòng) — CHỈ hiện khi TOÀN BỘ agg
        // đang xem cùng chung ĐÚNG 1 (bưu cục, ngày) VÀ khớp được Performance, vì mỗi (bưu cục,
        // ngày) có Volume/% Gán/% GTC RIÊNG — không thể gộp thành 1 số chung khi khoảng đang xem
        // trải nhiều bưu cục/ngày khác nhau (sẽ phải chọn hiện số của combo nào, dễ gây hiểu lầm)
        // — trường hợp đó ẩn hẳn phần này (vẫn xem được TỪNG bưu cục ở popup bản đồ, nút "+" "Xem
        // chi tiết cách tính Định biên").
        const totalDeliverAll = totalDeliverSuccess + totalDeliverFail + agg.reduce((s, a) => s + a.deliverPending, 0); // v1.7.47 gồm cả đơn đang giao
        const distinctHubDateCombos = new Set(agg.map(a => perfByHubDateKey_(a.hubId, a.tripDate)));
        let perfSummaryNote = '';
        if (distinctHubDateCombos.size === 1) {
            const perf = perfByHubDate.get(Array.from(distinctHubDateCombos)[0]);
            if (perf) {
                const pctGanStr = perf.pctGan !== null ? `${(Math.round(perf.pctGan * 1000) / 10).toLocaleString('vi-VN')}%` : '—';
                const pctGtcStr = perf.pctGtc !== null ? `${(Math.round(perf.pctGtc * 1000) / 10).toLocaleString('vi-VN')}%` : '—';
                perfSummaryNote = ` · 📊 Volume: ${perf.volume.toLocaleString('vi-VN')} đơn · % Gán: ${pctGanStr} · % GTC: ${pctGtcStr} (theo sheet Performance)`;
            }
        }
        summaryEl.textContent = `Tổng đơn giao: ${totalDeliverAll.toLocaleString('vi-VN')} đơn · ${staffCount} nhân viên · ${hubCount} bưu cục · ${agg.length} dòng (ngày×bưu cục×nhân viên).${perfSummaryNote}`;

        const MAX_ROWS = 500;
        const shown = agg.slice(0, MAX_ROWS);
        let kmSum = 0, kmN = 0, kmAir = false;
        // v1.7.46 — cần lấy / cần giao + % LTC, % GTC, % Trả hàng (= trả ÷ (giao TC + trả))
        const qhPct_ = (a, b) => b > 0 ? (Math.round(a / b * 1000) / 10).toLocaleString('vi-VN') + '%' : '—';
        // v1.7.47 — chủ dự án: cần giao/cần lấy phải gồm CẢ đơn đang giao/đang lấy (chưa cập nhật kết quả) — đều là đơn chưa thành công
        const qhCanCells_ = (ps, pf, pp, ds, df, dp, rt, bold) => {
            const b = bold ? 'font-weight:700;' : '';
            return {
                lay: `<td style="text-align:right; color:#e67700;">${pp.toLocaleString('vi-VN')}</td><td style="text-align:right; ${b}">${(ps + pf + pp).toLocaleString('vi-VN')}</td><td style="text-align:right; font-weight:700; color:#1c4f9c;">${qhPct_(ps, ps + pf + pp)}</td>`,
                giao: `<td style="text-align:right; color:#e67700;">${dp.toLocaleString('vi-VN')}</td><td style="text-align:right; ${b}">${(ds + df + dp).toLocaleString('vi-VN')}</td><td style="text-align:right; font-weight:700; color:#1c4f9c;">${qhPct_(ds, ds + df + dp)}</td>`,
                tra: `<td style="text-align:right; font-weight:700; color:#c0392b;">${qhPct_(rt, ds + rt)}</td>`
            };
        };
        const rowsHtml = shown.map((a, i) => {
            const debug = wardDebugMap.get(`${a.staffKey}${a.tripDate}`) || null; // v1.7.6 fix: dkey xay dung o tren dung dung ky tu phan cach rieng, khong phai chuoi thuong, cho nay truoc day thieu -> luon mismatch -> debug luon null
            // v1.7.5 -- them cot "Trang thai NV" (doc tu sheet HRM qua driverId) theo dung yeu
            // cau "Trong thong tin khi tai du lieu chuyen o muc Theo nhan vien cung can bo
            // sung trang thai lam viec cua nhan vien" -- dung chung resolveHrmDisplay_() voi
            // popup ban do, tranh lech logic mau sac/nhan giua 2 noi.
            const cc = qhCanCells_(a.pickSuccess, a.pickFail, a.pickPending, a.deliverSuccess, a.deliverFail, a.deliverPending, a.returnCount);
            const kmT = qhKmTrip_(a.hubId, qhKmWardsOf_(debug && debug[0]));
            const kmCell = kmT ? `<b>${qhKmFmt_(kmT.km)}</b>${kmT.road ? '' : '<span title="Đường chim bay — chưa lấy được khoảng cách đường bộ" style="color:#adb5bd;">*</span>'}` : '<span style="color:#adb5bd;">—</span>';
            const farCell = kmT && kmT.far ? `<b>${qhKmFmt_(kmT.far.km)}</b><div style="font-size:10px; color:#6c757d; white-space:nowrap;">${(state.wardsByCode && state.wardsByCode[kmT.far.wc] ? state.wardsByCode[kmT.far.wc].name : kmT.far.wc)}</div>` : '<span style="color:#adb5bd;">—</span>';
            if (kmT) { kmSum += kmT.km; kmN += 1; if (!kmT.road) kmAir = true; }
            const hrm = resolveHrmDisplay_(a.driverId);
            const hrmCellHtml = hrm.found
                ? `<span style="color:${hrm.color}; font-weight:700;">${hrm.dotIcon} ${hrm.label}</span>`
                : `<span style="color:#adb5bd;">${hrm.label}</span>`;
            return `
            <tr>
                <td><button type="button" class="ghn-tg-ward-toggle" data-idx="${i}">+</button></td>
                <td>${a.tripDate}</td>
                <td>${hubNameForStaffTable_(a.hubId)}</td>
                <td>${a.driverName}</td>
                <td style="font-size:11px; white-space:nowrap;">${hrmCellHtml}</td>
                <td style="text-align:right; color:#28a745;">${a.pickSuccess}</td>
                <td style="text-align:right; color:#dc3545;">${a.pickFail}</td>
                ${cc.lay}
                <td style="text-align:right; color:#28a745;">${a.deliverSuccess}</td>
                <td style="text-align:right; color:#dc3545;">${a.deliverFail}</td>
                ${cc.giao}
                <td style="text-align:right;">${a.returnCount}</td>
                ${cc.tra}
                <td style="text-align:right; font-weight:700;">${a.total}</td>
                <td style="text-align:right; color:#1c4f9c;">${kmCell}</td>
                <td style="text-align:right; color:#1c4f9c;">${farCell}</td>
            </tr>
            <tr class="ghn-tg-ward-detail" data-idx="${i}" style="display:none;">
                <td colspan="20" style="background:#f8f9fa; border-top:none;">${wardDebugHtml_(debug)}</td>
            </tr>
        `;
        }).join('');
        // v1.7.22 — hàng TỔNG cuối bảng (phản hồi thật: "thêm số tổng vào").
        // v1.7.23 — 3 cột Performance (Volume/% Gán/% GTC) KHÔNG còn ở đây nữa (đã dời lên dòng
        // tóm tắt phía trên bảng, xem perfSummaryNote) nên hàng TỔNG trở lại đúng 11 cột như cũ.
        const ccT = qhCanCells_(totalPickSuccess, totalPickFail, agg.reduce((s, a) => s + a.pickPending, 0), totalDeliverSuccess, totalDeliverFail, agg.reduce((s, a) => s + a.deliverPending, 0), totalReturn, true);
        const totalRowHtml = `
            <tr style="font-weight:700; background:#f1f3f5; border-top:2px solid #ced4da;">
                <td></td>
                <td colspan="4">TỔNG (${agg.length} dòng)</td>
                <td style="text-align:right; color:#28a745;">${totalPickSuccess.toLocaleString('vi-VN')}</td>
                <td style="text-align:right; color:#dc3545;">${totalPickFail.toLocaleString('vi-VN')}</td>
                ${ccT.lay}
                <td style="text-align:right; color:#28a745;">${totalDeliverSuccess.toLocaleString('vi-VN')}</td>
                <td style="text-align:right; color:#dc3545;">${totalDeliverFail.toLocaleString('vi-VN')}</td>
                ${ccT.giao}
                <td style="text-align:right;">${totalReturn.toLocaleString('vi-VN')}</td>
                ${ccT.tra}
                <td style="text-align:right;">${totalOrders.toLocaleString('vi-VN')}</td>
                <td style="text-align:right; color:#1c4f9c;" title="Trung bình km giao / nhân viên / ngày">${kmN ? 'TB ' + qhKmFmt_(kmSum / kmN) : '—'}</td>
                <td></td>
            </tr>
        `;
        wrapEl.innerHTML = `
            <table class="ghn-tg-staff-table">
                <thead>
                    <tr>
                        <th title="Bấm để xem chi tiết xã/phường (MỚI) đã khớp được từ địa chỉ đơn giao — đúng dữ liệu dùng để đặt chấm trên bản đồ">+</th>
                        <th>Ngày</th><th>Bưu cục</th><th>Nhân viên</th><th>Trạng thái NV</th>
                        <th>Lấy TC</th><th>Lấy thất bại</th>
                        <th title="Đơn lấy chưa cập nhật kết quả (đang đi lấy)">Đang lấy</th><th title="Cần lấy = Lấy TC + Lấy thất bại + Đang lấy">Cần lấy</th><th title="% LTC = Lấy TC ÷ Cần lấy">% LTC</th>
                        <th>Giao TC</th><th>Giao thất bại</th>
                        <th title="Đơn giao chưa cập nhật kết quả (đang đi giao)">Đang giao</th><th title="Cần giao = Giao TC + Giao thất bại + Đang giao">Cần giao</th><th title="% GTC = Giao TC ÷ Cần giao">% GTC</th>
                        <th>Trả hàng</th><th title="% Trả hàng = Đơn trả ÷ (Giao TC + Đơn trả)">% Trả hàng</th><th>Tổng</th>
                        <th title="Ước tính quãng đường giao trong ngày: bưu cục → lần lượt tâm các xã/phường có đơn giao (gần nhất đi trước) → về bưu cục. Đường bộ; * = đường chim bay">Km giao (ước tính)</th>
                        <th title="Khoảng cách từ bưu cục tới tâm xã/phường xa nhất nhân viên giao trong ngày">BC → xã xa nhất (km)</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>${totalRowHtml}</tfoot>
            </table>
            <div style="font-size:11px; color:#6c757d; margin-top:6px;">🛣️ Km giao (ước tính) = bưu cục → tâm từng xã/phường có đơn giao (xã gần nhất đi trước, bỏ xã &lt; 3% đơn) → về bưu cục${kmAir ? ' · <b>*</b> = đường chim bay (chưa lấy được đường bộ)' : ' · khoảng cách đường bộ'}${state.qhKmBusy ? ' · <i>đang tính đường bộ…</i>' : ''}. Bấm "+" để xem khoảng cách bưu cục → từng xã/phường.</div>
            ${agg.length > MAX_ROWS ? `<div style="font-size:11px; color:#adb5bd; margin-top:6px;">Đang hiển thị ${MAX_ROWS}/${agg.length} dòng đầu (hàng TỔNG vẫn tính từ TOÀN BỘ ${agg.length} dòng) — thu hẹp bằng bộ lọc nhân viên/nhóm khách hàng hoặc khoảng ngày để xem hết.</div>` : ''}
        `;
        wrapEl.querySelectorAll('.ghn-tg-ward-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = btn.getAttribute('data-idx');
                const detailRow = wrapEl.querySelector(`.ghn-tg-ward-detail[data-idx="${idx}"]`);
                if (!detailRow) return;
                const isHidden = detailRow.style.display === 'none';
                detailRow.style.display = isHidden ? '' : 'none';
                btn.textContent = isHidden ? '−' : '+';
            });
        });
        qhKmPrefetch_();
    }

    async function loadStaffVolume_() {
        if (state.staffLoading) return;
        const fromDate = document.getElementById('ghn-tg-staff-from').value;
        const toDate = document.getElementById('ghn-tg-staff-to').value;
        const hubIds = Array.from(state.staffHubSelection);
        if (!fromDate || !toDate) { setStaffStatus_('⚠️ Chưa chọn đủ Từ ngày / Đến ngày.'); return; }
        if (hubIds.length === 0) { setStaffStatus_('⚠️ Chưa chọn bưu cục nào.'); return; }

        state.staffLoading = true;
        state.staffLoadCancelRequested = false;
        const loadBtn = document.getElementById('ghn-tg-staff-load-btn');
        const stopBtn = document.getElementById('ghn-tg-staff-stop-btn');
        if (loadBtn) loadBtn.disabled = true;
        if (stopBtn) stopBtn.style.display = '';
        try {
            setStaffStatus_('Đang tải sản lượng từ GHN...');
            // v1.7.17 — tải SONG SONG dữ liệu Performance (sản lượng CẦN GIAO + đơn ĐÃ GÁN thật
            // theo ngày/bưu cục, sheet "Performance") CÙNG khoảng ngày — không chờ tuần tự,
            // không làm chậm thêm phần tải chuyến GHN. Lỗi ở loadPerformanceData_ tự nuốt bên
            // trong (không throw), nên Promise.all không bị hỏng cả nhánh nếu riêng phần này lỗi.
            const [fetchResult] = await Promise.all([
                fetchStaffVolumeRows_(
                    hubIds, fromDate, toDate,
                    (msg) => setStaffStatus_(msg),
                    () => state.staffLoadCancelRequested
                ),
                loadPerformanceData_(fromDate, toDate)
            ]);
            const { rows, unassignedRows } = fetchResult;
            state.staffRawRows = rows;
            // v1.7.16 — đơn thuộc chuyến CHƯA gán tài xế (xem fetchStaffVolumeRows_) — CHỈ dùng
            // làm tử số bổ sung cho Định biên ở computeHubStaffingStats_, không đụng tới các chỗ
            // khác đọc state.staffRawRows.
            state.staffUnassignedRawRows = unassignedRows;
            state.staffLastLoadedAt = new Date();
            refreshStaffComboOptions_();
            renderStaffTable_();
            updateStaffDotsOnMap_();
            const dotCount = state.staffDotFeatures.features.length;
            const unmatchedNote = state.staffDotUnmatchedCount > 0 ? ` · ${state.staffDotUnmatchedCount} (nhân viên,ngày) không xác định được xã/phường ổn định (không đặt chấm).` : '';
            const cancelledNote = state.staffLoadCancelRequested
                ? ' ⏹ ĐÃ DỪNG THEO YÊU CẦU — dữ liệu bên dưới CHƯA ĐẦY ĐỦ, chỉ tính tới lúc dừng.'
                : '';
            const label = state.staffLoadCancelRequested ? '⏹ Đã dừng' : '✅ Đã tải xong';
            // v1.7.16 — ghi rõ luôn số đơn "chưa gán tài xế" gom được (unassignedRows) trong dòng
            // trạng thái, để người dùng biết ngay CÓ đơn tồn kiểu này hay không mà không cần mở
            // từng popup bưu cục — xem fetchStaffVolumeRows_/computeHubStaffingStats_.
            const unassignedNote = unassignedRows.length > 0
                ? ` · ⚠️ ${unassignedRows.length.toLocaleString()} đơn thuộc chuyến CHƯA gán tài xế (đã cộng vào Định biên ở popup bưu cục, không hiện trên bản đồ/bảng Theo Nhân Viên).`
                : '';
            // v1.7.17 — ghi rõ luôn kết quả tải sheet Performance (nguồn đơn tồn chưa gán chính
            // xác hơn, xem loadPerformanceData_/computeHubStaffingStats_) — cảnh báo NGAY nếu có
            // tên bưu cục trong sheet không khớp được mã (VD gõ sai/khác định dạng với
            // hubs.json), để người dùng biết sửa lại tên trong sheet thay vì thấy Định biên sai
            // mà không hiểu vì sao.
            const perfRows = state.performanceRows || [];
            const perfUnmatchedHubNames = new Set();
            perfRows.forEach(r => { if (!performanceHubCode_(r.hubName)) perfUnmatchedHubNames.add(r.hubName); });
            if (perfUnmatchedHubNames.size > 0) {
                console.warn('[Tuyến Giao] Sheet Performance có tên bưu cục KHÔNG khớp được mã (kiểm tra lại chính tả/định dạng, phải giống hệt tên trong hubs.json):', Array.from(perfUnmatchedHubNames));
            }
            const perfNote = !state.performanceLoaded
                ? ' · 📊 Performance: không tải được (xem console) — Định biên tự dùng phương án dự phòng cũ (chuyến chưa gán tài xế).'
                : perfRows.length === 0
                    ? ' · 📊 Performance: chưa có dòng nào trong khoảng ngày này.'
                    : ` · 📊 Performance: ${perfRows.length.toLocaleString()} dòng${perfUnmatchedHubNames.size > 0 ? ` (⚠️ ${perfUnmatchedHubNames.size} tên bưu cục KHÔNG khớp được mã, xem console)` : ''}.`;
            setStaffStatus_(`${staffDotDiagText_()} — ${label} lúc ${state.staffLastLoadedAt.toLocaleTimeString('vi-VN')}: ${rows.length.toLocaleString()} dòng đơn (${fromDate} → ${toDate}, ${hubIds.length} bưu cục) · ${dotCount} chấm nhân viên đã đặt lên bản đồ (tab Bản Đồ).${unmatchedNote}${cancelledNote}${unassignedNote}${perfNote}`);
        } catch (err) {
            console.error('[Tuyến Giao] Lỗi tải sản lượng nhân viên:', err);
            setStaffStatus_(`❌ Lỗi: ${err.message || err}`);
        } finally {
            state.staffLoading = false;
            state.staffLoadCancelRequested = false;
            if (loadBtn) loadBtn.disabled = false;
            if (stopBtn) stopBtn.style.display = 'none';
        }
    }

    function wireStaffControls_() {
        document.getElementById('ghn-tg-staff-load-btn').addEventListener('click', () => loadStaffVolume_());
        document.getElementById('ghn-tg-staff-stop-btn').addEventListener('click', () => {
            state.staffLoadCancelRequested = true;
            setStaffStatus_('⏹ Đang dừng... (dừng ngay sau khi xong lô chuyến đi đang tải dở, không mất dữ liệu đã tải được)');
        });
        wireHubCombo_(); // v1.7.6 — combobox đa chọn tìm-kiếm-được thay cho checkbox-list "Bưu cục" cũ
        document.getElementById('ghn-tg-staff-refresh-hubs-btn').addEventListener('click', () => {
            state.hubs = []; // ép tải lại danh sách bưu cục
            const searchInput = document.getElementById('ghn-tg-hub-combo-search');
            if (searchInput) searchInput.value = '';
            ensureStaffTabReady_();
        });
        wireStaffCombo_(); // v1.7.5 — combobox tìm-kiếm-được thay cho <select> "Nhân viên" cũ
        document.getElementById('ghn-tg-staff-group-select').addEventListener('change', (e) => {
            state.staffSelectedGroup = e.target.value;
            renderStaffTable_();
        });
    }

    function buildSyncPanel_() {
        const panel = document.createElement('div');
        panel.className = 'ghn-tg-panel';
        panel.id = 'ghn-tg-panel-sync';
        panel.innerHTML = `
            <div style="padding: 16px; overflow-y: auto;">
                <div style="font-size: 12px; color: #6c757d; margin-bottom: 14px; line-height: 1.6; background:#fff8e1; border:1px solid #ffe082; border-radius:6px; padding:10px;">
                    ℹ️ Modul đã <b>TỰ ĐỘNG</b> tải trực tiếp từ quyhoachbuucuc.info mỗi khi mở (tab
                    "🗺️ Bản Đồ") — KHÔNG cần dán tay ở đây trong điều kiện bình thường. Tab này chỉ còn
                    là <b>phương án dự phòng thủ công</b>, dùng khi việc tải trực tiếp báo lỗi.
                </div>
                <div style="font-size: 12px; color: #6c757d; margin-bottom: 14px; line-height: 1.6;">
                    Mở từng link bên dưới trên trình duyệt ĐÃ đăng nhập
                    <a href="https://www.quyhoachbuucuc.info/web/index.html" target="_blank">quyhoachbuucuc.info</a>,
                    copy toàn bộ nội dung JSON hiện ra rồi dán vào đúng ô tương ứng, sau đó bấm "Đồng bộ lên server".
                    Có thể chỉ dán 1 vài ô nếu chỉ muốn cập nhật riêng phần đó, để trống các ô còn lại.
                </div>
                <div class="ghn-tg-sync-field">
                    <label>1) wards.geojson (ranh giới CŨ — quan trọng nhất, dùng để tô màu + số liệu) — <a href="https://www.quyhoachbuucuc.info/api/wards.geojson" target="_blank">mở link</a></label>
                    <textarea id="ghn-tg-sync-wardsoldgeo" placeholder="Dán nội dung JSON tại đây..."></textarea>
                </div>
                <div class="ghn-tg-sync-field">
                    <label>2) wards_new.geojson (ranh giới MỚI, chỉ để tham khảo) — <a href="https://www.quyhoachbuucuc.info/api/wards_new.geojson" target="_blank">mở link</a></label>
                    <textarea id="ghn-tg-sync-wardsgeo" placeholder="Dán nội dung JSON tại đây..."></textarea>
                </div>
                <div class="ghn-tg-sync-field">
                    <label>3) hubs.json — <a href="https://www.quyhoachbuucuc.info/api/hubs.json" target="_blank">mở link</a></label>
                    <textarea id="ghn-tg-sync-hubs" placeholder="Dán nội dung JSON tại đây..."></textarea>
                </div>
                <div class="ghn-tg-sync-field">
                    <label>4) wards.json (số liệu theo phường CŨ) — <a href="https://www.quyhoachbuucuc.info/api/wards.json" target="_blank">mở link</a></label>
                    <textarea id="ghn-tg-sync-wards" placeholder="Dán nội dung JSON tại đây..."></textarea>
                </div>
                <div class="ghn-tg-sync-field">
                    <label>5) ward_centroids.json — <a href="https://www.quyhoachbuucuc.info/api/ward_centroids.json" target="_blank">mở link</a></label>
                    <textarea id="ghn-tg-sync-centroids" placeholder="Dán nội dung JSON tại đây..."></textarea>
                </div>
                <div class="ghn-tg-sync-field">
                    <label>6) rezone.json (gộp phường cũ → phường mới: cầu/BC auto gán/thành phần) — <a href="https://www.quyhoachbuucuc.info/api/rezone.json" target="_blank">mở link</a></label>
                    <textarea id="ghn-tg-sync-rezone" placeholder="Dán nội dung JSON tại đây..."></textarea>
                </div>
                <button id="ghn-tg-sync-btn" style="padding:10px 18px; border-radius:6px; border:none; background:${GHN_ORANGE}; color:#fff; font-size:13px; cursor:pointer; font-weight:700;">⬆️ Đồng bộ lên server</button>
                <div id="ghn-tg-sync-status" style="margin-top: 10px; font-size: 12px; color: #495057;"></div>
            </div>
        `;
        return panel;
    }

    function setStatus_(text, dotClass) {
        const dotEl = document.getElementById('ghn-tg-status-dot');
        const textEl = document.getElementById('ghn-tg-status-text');
        if (textEl) textEl.textContent = text;
        if (dotEl) dotEl.className = `ghn-tg-status-dot ${dotClass || 'loading'}`;
    }

    function wireMapControls_() {
        const regionSelect = document.getElementById('ghn-tg-region-select');
        const modeSelect = document.getElementById('ghn-tg-mode-select');
        const newBoundaryCheckbox = document.getElementById('ghn-tg-newboundary-checkbox');
        const labelHubCheckbox = document.getElementById('ghn-tg-label-hub-checkbox');
        const labelOldWardCheckbox = document.getElementById('ghn-tg-label-oldward-checkbox');
        const labelNewWardCheckbox = document.getElementById('ghn-tg-label-newward-checkbox');
        const staffDotsCheckbox = document.getElementById('ghn-tg-staff-dots-checkbox');
        const staffLabelsCheckbox = document.getElementById('ghn-tg-staff-labels-checkbox');
        // v1.7.13/v1.7.14 — 4 checkbox lọc CẢ NHÓM "Tuyến giao nhân viên" theo trạng thái làm
        // việc (xem staffStatusFilterExpression_/applyStaffStatusFilter_).
        const statusFilterCheckboxIds = {
            ACTIVE: 'ghn-tg-status-active-checkbox',
            RESIGNED: 'ghn-tg-status-resigned-checkbox',
            ON_LEAVE: 'ghn-tg-status-onleave-checkbox',
            SUPPORT: 'ghn-tg-status-support-checkbox'
        };
        const staffHullCheckbox = document.getElementById('ghn-tg-staff-hull-checkbox');
        const clearBtn = document.getElementById('ghn-tg-clear-selection-btn');
        const reloadBtn = document.getElementById('ghn-tg-reload-btn');
        const infoCloseBtn = document.getElementById('ghn-tg-info-close');

        // v1.7.8 — 2 panel xổ-xuống mới ("🗂️ Lớp hiển thị" gộp checkbox, "ℹ️ Chú thích" gộp
        // chú giải) dùng chung hạ tầng portal — xem ghnTgRegisterDropdown_ (khối "HẠ TẦNG
        // DÙNG CHUNG CHO MỌI PANEL XỔ-XUỐNG" ở gần wireHubCombo_/wireStaffCombo_). Không cần
        // onOpen gì đặc biệt (không có ô tìm kiếm/danh sách render lại) — chỉ mở/định vị/
        // đóng-khi-mở-cái-khác.
        ghnTgRegisterDropdown_('ghn-tg-layers-combo-trigger', 'ghn-tg-layers-combo-panel');
        ghnTgRegisterDropdown_('ghn-tg-legend-combo-trigger', 'ghn-tg-legend-combo-panel');

        regionSelect.addEventListener('change', () => {
            state.currentRegion = regionSelect.value;
            applyPaint_();
            applyRegionFilter_();
            fitToData_();
        });
        modeSelect.addEventListener('change', () => {
            state.currentMode = modeSelect.value;
            applyPaint_();
        });
        newBoundaryCheckbox.addEventListener('change', () => {
            state.showNewBoundary = newBoundaryCheckbox.checked;
            applyNewBoundaryVisibility_();
        });
        labelHubCheckbox.addEventListener('change', () => {
            state.showHubLabels = labelHubCheckbox.checked;
            applyLabelVisibility_();
        });
        labelOldWardCheckbox.addEventListener('change', () => {
            state.showOldWardLabels = labelOldWardCheckbox.checked;
            applyLabelVisibility_();
        });
        labelNewWardCheckbox.addEventListener('change', () => {
            state.showNewWardLabels = labelNewWardCheckbox.checked;
            applyLabelVisibility_();
        });
        staffDotsCheckbox.addEventListener('change', () => {
            state.showStaffDots = staffDotsCheckbox.checked;
            applyStaffDotVisibility_();
        });
        staffLabelsCheckbox.addEventListener('change', () => {
            state.showStaffNameLabels = staffLabelsCheckbox.checked;
            applyStaffLabelVisibility_();
        });
        // v1.7.13/v1.7.14 — mỗi checkbox trạng thái cập nhật state.staffStatusFilter[key] rồi
        // áp lại filter cho CẢ 6 lớp thuộc nhóm "Tuyến giao nhân viên" ngay (không cần bấm gì
        // thêm) — xem STAFF_STATUS_FILTERED_LAYERS_.
        Object.keys(statusFilterCheckboxIds).forEach(key => {
            const el = document.getElementById(statusFilterCheckboxIds[key]);
            if (!el) return;
            el.addEventListener('change', () => {
                if (!state.staffStatusFilter) state.staffStatusFilter = {};
                state.staffStatusFilter[key] = el.checked;
                applyStaffStatusFilter_();
            });
        });
        staffHullCheckbox.addEventListener('change', () => {
            state.showStaffHull = staffHullCheckbox.checked;
            applyStaffHullVisibility_();
        });
        // v1.7.15 — nút "✖ Bỏ chọn" giờ reset CẢ cấu hình hiển thị về mặc định (xem
        // resetToDefaultDisplay_) — KHÁC nút × đóng panel (infoCloseBtn) ngay dưới đây, vẫn
        // giữ nguyên hành vi CŨ (chỉ đóng panel/bỏ chọn feature, không đụng cấu hình hiển thị)
        // vì đó là hành động tần suất cao, người dùng không kỳ vọng nó xoá luôn các lớp đang bật.
        clearBtn.addEventListener('click', () => resetToDefaultDisplay_());
        reloadBtn.addEventListener('click', () => { loadAndRenderMap_(); });
        infoCloseBtn.addEventListener('click', () => clearSelection_());
        qhWireControls_();
    }

    async function loadAndRenderMap_() {
        try {
            setStatus_('Đang tải dữ liệu...', 'loading');
            await loadAllData_((msg) => { setStatus_(msg, 'loading'); });

            const regionSelect = document.getElementById('ghn-tg-region-select');
            const currentVal = regionSelect.value;
            regionSelect.innerHTML = '<option value="all">Tất cả</option>' +
                state.regions.map(r => `<option value="${r}">${r}</option>`).join('');
            regionSelect.value = state.regions.includes(currentVal) ? currentVal : 'all';
            state.currentRegion = regionSelect.value;

            const container = document.getElementById('ghn-tg-map-container');
            if (!state.map) {
                initMap_(container);
            } else {
                state.map.getSource('wards').setData(state.wardsOldEnriched);
                state.map.getSource('wards-new').setData(state.wardsNewRaw || { type: 'FeatureCollection', features: [] });
                state.map.getSource('hubs').setData(hubsToPointsGeoJson_());
                if (state.map.getSource('staff-dots')) state.map.getSource('staff-dots').setData(state.staffDotFeatures);
                if (state.map.getSource('staff-territory')) state.map.getSource('staff-territory').setData(state.staffTerritoryFeatures);
                if (state.map.getSource('staff-territory-hull')) state.map.getSource('staff-territory-hull').setData(state.staffTerritoryHullFeatures);
                applyPaint_();
                applyRegionFilter_();
                applyNewBoundaryVisibility_();
                applyLabelVisibility_();
                applyStaffDotVisibility_();
                applyStaffLabelVisibility_();
                applyStaffStatusFilter_();
                applyStaffHullVisibility_();
                clearSelection_();
                fitToData_();
            }

            const summary = statusSummary_();
            setStatus_(summary.text, summary.dot);
            qhOrgAfterLoad_();
            qhdAfterLoad_();
        } catch (err) {
            setStatus_(`❌ Lỗi: ${err.message || err}`, 'offline');
            console.error('[Tuyến Giao] Lỗi tải dữ liệu:', err);
        }
    }

    function wireSyncControls_() {
        const btn = document.getElementById('ghn-tg-sync-btn');
        const statusEl = document.getElementById('ghn-tg-sync-status');
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            statusEl.textContent = 'Đang đồng bộ...';
            try {
                // v1.7.1 — cùng lý do như auto-sync: ghi đúng tên + ssoId thật của người bấm
                // "Đồng bộ" tay ở đây, thay vì chuỗi tiêu đề trang chung chung không định
                // danh được ai.
                const whoTriggered = state.currentUser
                    ? `${state.currentUser.fullname || '(chưa rõ tên)'} (ssoId: ${state.currentUser.ssoId})`
                    : '(không xác định được người dùng)';
                const body = {
                    syncedBy: `Dán tay (tab Đồng Bộ Dữ Liệu) — bởi ${whoTriggered} @ ${new Date().toLocaleString('vi-VN')}`,
                    wardsOldGeoJson: document.getElementById('ghn-tg-sync-wardsoldgeo').value.trim(),
                    wardsGeoJson: document.getElementById('ghn-tg-sync-wardsgeo').value.trim(),
                    hubs: document.getElementById('ghn-tg-sync-hubs').value.trim(),
                    wards: document.getElementById('ghn-tg-sync-wards').value.trim(),
                    wardCentroids: document.getElementById('ghn-tg-sync-centroids').value.trim(),
                    rezone: document.getElementById('ghn-tg-sync-rezone').value.trim()
                };
                if (!body.wardsOldGeoJson && !body.wardsGeoJson && !body.hubs && !body.wards && !body.wardCentroids && !body.rezone) {
                    statusEl.textContent = '⚠️ Chưa dán dữ liệu nào cả.';
                    btn.disabled = false;
                    return;
                }
                // v1.7.28 — dán đủ hubs + wards của 1 vùng → GỘP với backup đang có (giữ các vùng khác), không ghi đè
                if (body.hubs && body.wards) {
                    statusEl.textContent = 'Đang gộp với dữ liệu các vùng đã lưu...';
                    const P = t => { try { return t ? JSON.parse(t) : null; } catch (e) { throw new Error('Dữ liệu dán không phải JSON hợp lệ.'); } };
                    const m = regionMergeData_({ wardsOld: P(body.wardsOldGeoJson), wardsNew: P(body.wardsGeoJson), hubs: P(body.hubs),
                        wards: P(body.wards), centroids: P(body.wardCentroids), rezone: P(body.rezone) }, await fetchBackupData_());
                    body.hubs = JSON.stringify(m.hubs); body.wards = JSON.stringify(m.wards);
                    if (m.wardsOld) body.wardsOldGeoJson = JSON.stringify(m.wardsOld);
                    if (m.wardsNew) body.wardsGeoJson = JSON.stringify(m.wardsNew);
                    body.wardCentroids = JSON.stringify(m.centroids);
                    if (m.rezone) body.rezone = JSON.stringify(m.rezone);
                    body.syncedBy += ' — gộp vùng: ' + m.regions.join(', ');
                }
                const result = await gasPost_('syncData', body);
                if (result.ok) {
                    statusEl.textContent = `✅ Đồng bộ thành công: ${result.saved.join(', ')}.`;
                } else {
                    statusEl.textContent = `⚠️ Có lỗi: ${result.errors.join(' | ')}${result.saved.length ? ' (đã lưu được: ' + result.saved.join(', ') + ')' : ''}`;
                }
            } catch (err) {
                statusEl.textContent = `❌ Lỗi: ${err.message || err}`;
            } finally {
                btn.disabled = false;
            }
        });
    }

    function switchTab_(tabName) {
        document.querySelectorAll('.ghn-tg-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
        document.querySelectorAll('.ghn-tg-panel').forEach(p => p.classList.toggle('active', p.id === `ghn-tg-panel-${tabName}`));
        if (tabName === 'map' && state.map) {
            setTimeout(() => state.map.resize(), 50);
        }
        if (tabName === 'staff') {
            ensureStaffTabReady_();
        }
    }

    // Kích thước MẶC ĐỊNH tự tính theo màn hình đang dùng (92% rộng / 88% cao, tối
    // đa 1500x950) thay vì cố định px — tránh tràn/mất viền trên màn hình nhỏ hoặc
    // khi trình duyệt đang zoom to/nhỏ. Luôn chừa ít nhất 12px margin mỗi cạnh.
    function computeDefaultRect_() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const width = Math.max(480, Math.min(1500, vw * 0.92));
        const height = Math.max(380, Math.min(950, vh * 0.88));
        const left = Math.max(12, (vw - width) / 2);
        const top = Math.max(12, (vh - height) / 2);
        return { left, top, width, height };
    }

    function readRect_(root) {
        return { left: root.offsetLeft, top: root.offsetTop, width: root.offsetWidth, height: root.offsetHeight };
    }

    function applyRect_(root, rect) {
        root.style.left = `${rect.left}px`;
        root.style.top = `${rect.top}px`;
        root.style.width = `${rect.width}px`;
        root.style.height = `${rect.height}px`;
    }

    // Đảm bảo cửa sổ luôn nằm TRONG viewport hiện tại (gọi lại khi resize trình
    // duyệt / đổi zoom) — không để bị kéo lệch ra ngoài màn hình, mất viền.
    function clampWindowToViewport_(root) {
        if (state.isMinimized) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (state.isMaximized) {
            applyRect_(root, { left: 12, top: 12, width: vw - 24, height: vh - 24 });
        } else {
            let width = Math.min(root.offsetWidth, vw - 24);
            let height = Math.min(root.offsetHeight, vh - 24);
            let left = Math.min(Math.max(12, root.offsetLeft), vw - width - 12);
            let top = Math.min(Math.max(12, root.offsetTop), vh - height - 12);
            applyRect_(root, { left: Math.max(12, left), top: Math.max(12, top), width, height });
        }
        if (state.map) state.map.resize();
    }

    function makeResizable_(handleEl, targetEl) {
        let resizing = false, startX = 0, startY = 0, startW = 0, startH = 0;
        handleEl.addEventListener('mousedown', (e) => {
            if (state.isMaximized || state.isMinimized) return;
            resizing = true;
            startX = e.clientX; startY = e.clientY;
            startW = targetEl.offsetWidth; startH = targetEl.offsetHeight;
            e.preventDefault();
            e.stopPropagation();
        });
        document.addEventListener('mousemove', (e) => {
            if (!resizing) return;
            const newW = Math.max(480, Math.min(window.innerWidth - targetEl.offsetLeft - 12, startW + (e.clientX - startX)));
            const newH = Math.max(380, Math.min(window.innerHeight - targetEl.offsetTop - 12, startH + (e.clientY - startY)));
            targetEl.style.width = `${newW}px`;
            targetEl.style.height = `${newH}px`;
            if (state.map) state.map.resize();
        });
        document.addEventListener('mouseup', () => { resizing = false; });
    }

    // ➖ Thu nhỏ / mở lại — GIỮ NGUYÊN dữ liệu + bản đồ đã tải trong bộ nhớ (khác
    // hẳn nút ✖ Đóng — đóng là gỡ hẳn khỏi DOM, phải tải lại từ đầu).
    function toggleMinimize_(root, btn) {
        if (state.isMinimized) {
            root.classList.remove('ghn-tg-collapsed');
            if (state.savedRect) applyRect_(root, state.savedRect);
            state.isMinimized = false;
            btn.textContent = '➖';
            btn.title = 'Thu nhỏ';
            setTimeout(() => { if (state.map) state.map.resize(); }, 50);
        } else {
            state.savedRect = readRect_(root);
            root.classList.add('ghn-tg-collapsed');
            state.isMinimized = true;
            btn.textContent = '🔼';
            btn.title = 'Mở lại';
        }
    }

    // ⛶ Phóng to gần kín màn hình / khôi phục kích thước cũ.
    function toggleMaximize_(root, btn) {
        if (state.isMinimized) return; // đang thu nhỏ thì bỏ qua, tránh xung đột trạng thái
        if (state.isMaximized) {
            if (state.savedRect) applyRect_(root, state.savedRect);
            state.isMaximized = false;
            btn.textContent = '⛶';
            btn.title = 'Phóng to';
        } else {
            state.savedRect = readRect_(root);
            const vw = window.innerWidth, vh = window.innerHeight;
            applyRect_(root, { left: 12, top: 12, width: vw - 24, height: vh - 24 });
            state.isMaximized = true;
            btn.textContent = '🗗';
            btn.title = 'Khôi phục kích thước';
        }
        setTimeout(() => { if (state.map) state.map.resize(); }, 50);
    }

    // v1.7.0 — openWindow_() giờ ASYNC: TRƯỚC KHI build bất kỳ tab/panel dữ liệu nào,
    // phải xác thực danh tính + tra quyền qua checkPermissionAndGate_(). Khung cửa sổ
    // (kéo/thu nhỏ/phóng to/đóng) vẫn wire NGAY (không cần chờ quyền) để người bị chặn
    // vẫn đóng/di chuyển được cửa sổ hiển thị lý do bị chặn.
    async function openWindow_() {
        const existing = document.getElementById('ghn-tuyen-giao-root');
        if (existing) {
            // Đã mở sẵn (có thể đang thu nhỏ) — bấm launcher lần nữa thì mở lại nếu
            // đang thu nhỏ, không tạo cửa sổ thứ 2.
            if (state.isMinimized) {
                const minimizeBtn = document.getElementById('ghn-tg-minimize-btn');
                if (minimizeBtn) toggleMinimize_(existing, minimizeBtn);
            }
            return;
        }

        const root = document.createElement('div');
        root.id = 'ghn-tuyen-giao-root';
        root.innerHTML = `
            <div id="ghn-tuyen-giao-titlebar">
                <span class="ghn-tg-title-text">🗺️ Modul Tuyến Giao <span style="font-weight:400; opacity:0.85; font-size:11px;">(độc lập — v1.7.33, chưa gộp vào Báo cáo GTC)</span></span>
                <span class="ghn-tg-titlebar-btns">
                    <button id="ghn-tg-admin-open-btn" class="ghn-tg-titlebar-btn" title="Quản trị phân quyền" style="display:none;">🔐</button>
                    <button id="ghn-tg-minimize-btn" class="ghn-tg-titlebar-btn" title="Thu nhỏ">➖</button>
                    <button id="ghn-tg-maximize-btn" class="ghn-tg-titlebar-btn" title="Phóng to">⛶</button>
                    <button id="ghn-tg-close-btn" class="ghn-tg-titlebar-btn" title="Đóng">✖</button>
                </span>
            </div>
            <div id="ghn-tuyen-giao-tabs" style="display:none;">
                <button class="ghn-tg-tab-btn active" data-tab="map">🗺️ Bản Đồ</button>
                <button class="ghn-tg-tab-btn" data-tab="staff">👤 Theo Nhân Viên</button>
                <button class="ghn-tg-tab-btn" data-tab="sync">🔄 Đồng Bộ Dữ Liệu</button>
            </div>
            <div id="ghn-tuyen-giao-body"></div>
            <div id="ghn-tg-resize-handle" title="Kéo để chỉnh kích thước"></div>
        `;
        document.body.appendChild(root);

        // v1.7.8 — "🔒 Đang kiểm tra quyền truy cập..." giờ là 1 overlay GIỮA MÀN HÌNH
        // (position:fixed;inset:0, appendChild thẳng vào <body> — Y HỆT bố cục
        // '#ghn-tg-admin-overlay' đã có sẵn) thay vì dòng chữ nằm im trong khung
        // '#ghn-tuyen-giao-body' như trước (phản hồi "thiếu chuyên nghiệp"). Dọn overlay này ở
        // CẢ 2 đường ra: xác thực xong (bên dưới) VÀ người dùng bấm Đóng trong lúc đang chờ.
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'ghn-tg-loading-overlay';
        loadingOverlay.innerHTML = `<div id="ghn-tg-loading-card"><div class="ghn-tg-spinner"></div><div>🔒 Đang kiểm tra quyền truy cập...</div></div>`;
        document.body.appendChild(loadingOverlay);

        applyRect_(root, computeDefaultRect_());

        makeDraggable_(document.getElementById('ghn-tuyen-giao-titlebar'), root);
        makeResizable_(document.getElementById('ghn-tg-resize-handle'), root);

        document.getElementById('ghn-tg-minimize-btn').addEventListener('click', (e) => {
            toggleMinimize_(root, e.currentTarget);
        });
        document.getElementById('ghn-tg-maximize-btn').addEventListener('click', (e) => {
            toggleMaximize_(root, e.currentTarget);
        });
        // Click vào thanh tiêu đề lúc đang thu nhỏ cũng mở lại (tiện hơn phải nhắm
        // đúng nút bé xíu).
        document.getElementById('ghn-tuyen-giao-titlebar').addEventListener('click', (e) => {
            if (state.isMinimized && !e.target.closest('button')) {
                toggleMinimize_(root, document.getElementById('ghn-tg-minimize-btn'));
            }
        });
        document.getElementById('ghn-tg-close-btn').addEventListener('click', () => {
            // v1.7.8 — dọn các panel xổ-xuống đã bị "portal" ra <body> (ghnTgEnsurePortal_)
            // TRƯỚC KHI remove() root: các panel đó KHÔNG còn là con của root (đã bị
            // appendChild thẳng vào <body> lúc mở panel lần đầu) nên root.remove() KHÔNG dọn
            // được chúng — nếu để sót, lần MỞ LẠI modul sau đó sẽ tạo panel MỚI trùng id với
            // panel MỒ CÔI cũ này, document.getElementById(...) có thể trả về nhầm bản MỒ CÔI
            // (vô hình, không còn được dây sự kiện) thay vì bản mới đang hiển thị thật.
            ghnTgCleanupPortaledDropdowns_();
            root.remove();
            document.getElementById('ghn-tg-loading-overlay')?.remove(); // vẫn đang chờ xác thực thì bấm Đóng cũng phải dọn overlay này theo
            window.removeEventListener('resize', root.__ghnTgResizeListener);
            state.map = null;
            state.dataLoaded = false;
            state.isMinimized = false;
            state.isMaximized = false;
        });
        document.getElementById('ghn-tg-admin-open-btn').addEventListener('click', openAdminModal_);

        root.__ghnTgResizeListener = () => clampWindowToViewport_(root);
        window.addEventListener('resize', root.__ghnTgResizeListener);

        const body = document.getElementById('ghn-tuyen-giao-body');
        const gate = await checkPermissionAndGate_();
        document.getElementById('ghn-tg-loading-overlay')?.remove();
        if (!root.isConnected) return; // người dùng đã bấm Đóng trong lúc đang chờ xác thực

        if (!gate.allowed) {
            body.innerHTML = buildAccessDeniedHtml_(gate);
            wireAccessDeniedControls_(gate);
            return; // KHÔNG build tab/panel/bản đồ gì thêm — bị chặn hoàn toàn ở đây
        }

        document.getElementById('ghn-tuyen-giao-tabs').style.display = '';
        if (state.permission.role === 'ADMIN') {
            document.getElementById('ghn-tg-admin-open-btn').style.display = '';
        } else {
            // v1.7.0 — tab "Đồng Bộ Dữ Liệu" (dán tay dữ liệu thô từ quyhoachbuucuc.info)
            // chỉ dành cho ADMIN. Quản lý/Nhân viên xử lý chỉ cần XEM bản đồ tuyến trong
            // phạm vi của họ, không cần (và không nên) có khả năng ghi đè dữ liệu gốc.
            const syncTabBtn = document.querySelector('#ghn-tuyen-giao-tabs .ghn-tg-tab-btn[data-tab="sync"]');
            if (syncTabBtn) syncTabBtn.style.display = 'none';
        }

        body.innerHTML = '';
        body.appendChild(buildMapPanel_());
        body.appendChild(buildStaffPanel_());
        body.appendChild(buildSyncPanel_());

        document.querySelectorAll('.ghn-tg-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab_(btn.dataset.tab));
        });

        // v1.7.1 — SỬA LỖI "vào modul phải bấm sang tab khác thì bản đồ mới hiện":
        // buildMapPanel_/buildStaffPanel_/buildSyncPanel_ tạo ra các panel KHÔNG có sẵn
        // class "active" (CSS .ghn-tg-panel{display:none} mặc định, chỉ .active mới
        // display:flex — xem injectBaseStyles_). Trước đây không có chỗ nào gán "active"
        // cho panel nào lúc mới mở modul, nên bản đồ container thực chất đang display:none
        // ngay lúc initMap_() khởi tạo MapLibre — MapLibre đọc kích thước 0x0 lúc khởi tạo
        // rồi "kẹt" ở đó, chỉ tự sửa lại khi có sự kiện resize (đúng như bấm sang tab khác
        // rồi quay lại "Bản Đồ" sẽ gọi map.resize() ở switchTab_ bên dưới, hoặc bấm "Đồng
        // bộ" xảy ra load lại toàn trang). SỬA TẬN GỐC: gọi switchTab_('map') NGAY Ở ĐÂY để
        // đưa tab Bản Đồ về đúng trạng thái "active"/hiển thị THỰC SỰ TRƯỚC KHI initMap_()
        // chạy (bên trong loadAndRenderMap_() dưới đây) — đúng nguyên tắc "ấn vào modul là
        // phải tự load bản đồ", không cần người dùng phải tự bấm tab nào khác trước.
        switchTab_('map');

        wireMapControls_();
        wireSyncControls_();
        wireStaffControls_();

        loadAndRenderMap_();
        loadHrmData_(); // v1.7.5 — chạy song song, KHÔNG await (xem giải thích ở loadHrmData_())
    }

    function createLauncherButton_() {
        if (document.getElementById('ghn-tuyen-giao-launcher-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'ghn-tuyen-giao-launcher-btn';
        btn.textContent = '🗺️ Tuyến Giao';
        btn.addEventListener('click', openWindow_);
        document.body.appendChild(btn);
    }


    // ==================== v1.7.32 — LỚP TỈNH / AM / BƯU CỤC THEO CƠ CẤU (dùng chung Tampermonkey + web) ====================
    // v1.7.32 — CƠ CẤU BƯU CỤC (sheet cơ cấu của web báo cáo: Mã BC / Bưu cục / ID AM / AM / Tỉnh) → lớp Tỉnh / AM.
    // Khớp bưu cục theo Mã BC (= hub_code), không có thì theo tên. AM hiển thị "ID - Họ tên". Thiếu cơ cấu thì dùng
    // danh mục [TNT]-Report trên trang web cha (nếu đang chạy trong web) rồi AM phổ biến nhất của nhân viên theo HRM.
    const QH_WEB_API_URL = 'https://baocaovanhanh.vercel.app/api/gas';
    function qhCocauFetch_() {
        return new Promise(resolve => {
            const body = JSON.stringify({ action: 'qhCocau' });
            const done = (txt) => { try { const j = JSON.parse(txt); resolve(j && j.ok ? j : null); } catch (e) { resolve(null); } };
            try {
                if (typeof GM_xmlhttpRequest === 'function') {
                    GM_xmlhttpRequest({ method: 'POST', url: QH_WEB_API_URL, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, data: body,
                        onload: r => done(r.responseText), onerror: () => resolve(null), ontimeout: () => resolve(null), timeout: 30000 });
                    return;
                }
                const url = /baocaovanhanh/.test(location.hostname) || location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '/api/gas' : QH_WEB_API_URL;
                fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body }).then(r => r.text()).then(done).catch(() => resolve(null));
            } catch (e) { resolve(null); }
        });
    }
    function qhLoadCocau_() {
        if (state.qhCocauLoading || state.qhCocau) return;
        state.qhCocauLoading = true;
        qhCocauFetch_().then(res => {
            state.qhCocauLoading = false;
            const rows = res && res.rows;
            state.qhCocauCheck = res && res.kiemTra && !res.kiemTra.loi ? res.kiemTra : null;
            qhCcBadge_();
            if (!Array.isArray(rows) || !rows.length) { console.warn('[Tuyến Giao] Không đọc được cơ cấu bưu cục — dùng AM theo nhân sự.'); return; }
            state.qhCocau = rows;
            if (state.dataLoaded) { qhBuildOrg_(); if (qhSelectedHubs_()) qhApply_(false); }
        });
    }
    function qhParentEnts_() {
        try { const T = window.parent && window.parent !== window && window.parent.TNT; return (T && T.data && T.data.ents) || null; } catch (e) { return null; }
    }
    function qhBuildOrg_() {
        const ccByCode = {}, ccByName = {};
        (state.qhCocau || []).forEach(r => {
            const [bc, ma, am, tinh, idAm] = r;
            const amLb = am ? (idAm ? String(idAm).trim() + ' - ' + am : am) : '';
            const o = { am: amLb, tinh: String(tinh || '').trim() };
            if (ma) ccByCode[String(ma).trim()] = o;
            if (bc) ccByName[normalizeVn_(bc)] = o;
        });
        const byName = {};
        (qhParentEnts_() || []).forEach(e => { if (e && e[0]) byName[normalizeVn_(e[0])] = { am: String(e[1] || '').trim() }; });
        const cnt = {};
        Object.values(state.hrmByDriverId || {}).forEach(r => {
            const code = String(r.buuCuc || '').split(' - ')[0].trim();
            const am = String(r.am || '').trim();
            if (!code || !am || /^loai$/.test(normalizeVn_(am))) return;
            const w = normalizeHrmTrangThai_(r.trangThai) === 'ACTIVE' ? 5 : 1;
            cnt[code] = cnt[code] || {};
            cnt[code][am] = (cnt[code][am] || 0) + w;
        });
        const org = {};
        let fromCc = 0;
        (state.hubs || []).forEach(h => {
            const code = String(h.hub_code);
            const cc = ccByCode[code] || ccByName[normalizeVn_(h.name)];
            let am = cc && cc.am ? cc.am : '';
            let tinh = cc && cc.tinh ? cc.tinh : '';
            if (cc) fromCc++;
            if (!am) { const t = byName[normalizeVn_(h.name)]; if (t && t.am && !/^loai$/.test(normalizeVn_(t.am))) am = t.am; }
            if (!am && cnt[code]) am = Object.entries(cnt[code]).sort((a, b) => b[1] - a[1])[0][0];
            org[code] = { tinh: tinh || h.province || '(chưa rõ tỉnh)', am: am || '(chưa rõ AM)', name: h.name || code };
        });
        state.qhOrg = org;
        state.qhOrgFromCocau = fromCc;
        state.qhHubShape = state.qhHubShape || {};
        qhFillSelects_();
    }

    // v1.7.33 — nhãn kiểm tra cơ cấu (giống [TNT]-Report) + popup chi tiết
    function qhCcBadge_() {
        const el = document.getElementById('qh-cc-badge');
        const K = state.qhCocauCheck;
        if (!el) return;
        if (!K) { el.innerHTML = ''; return; }
        const n = (K.thieu || []).length + (K.lechAm || []).length;
        const tick = '<svg width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-3px"><path fill="#1877F2" d="M12 1.5l2.3 1.7 2.8-.3 1.1 2.6 2.6 1.1-.3 2.8 1.7 2.3-1.7 2.3.3 2.8-2.6 1.1-1.1 2.6-2.8-.3L12 22.5l-2.3-1.7-2.8.3-1.1-2.6-2.6-1.1.3-2.8L1.8 12l1.7-2.3-.3-2.8 2.6-1.1 1.1-2.6 2.8.3z"/><path fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M7.5 12.3l3 3 6-6.3"/></svg>';
        const warn = '<svg width="17" height="17" viewBox="0 0 24 24" style="vertical-align:-3px"><path fill="#FFC21A" stroke="#E0A000" stroke-width="1" d="M12 2.5L1.8 20.5h20.4z"/><rect x="11" y="8.5" width="2" height="7" rx="1" fill="#D32F2F"/><circle cx="12" cy="17.6" r="1.25" fill="#D32F2F"/></svg>';
        el.innerHTML = n ? `<span class="qh-cc-warn" title="Bấm xem chi tiết">${warn} ${n} thay đổi cơ cấu — bấm xem</span>`
            : `<span class="qh-cc-ok" title="Cơ cấu bưu cục khớp hệ thống: ${K.soHt} bưu cục, đúng AM">${tick} Đã xác thực</span>`;
        el.firstChild.addEventListener('click', qhCcPop_);
    }
    function qhCcPop_() {
        const K = state.qhCocauCheck; if (!K) return;
        let el = document.getElementById('qh-cc-pop');
        if (!el) { el = document.createElement('div'); el.id = 'qh-cc-pop'; el.addEventListener('click', e => { if (e.target === el) el.remove(); }); document.body.appendChild(el); }
        const tb = (heads, rows) => rows.length ? `<table class="qh-sum"><thead><tr><th>#</th>${heads.map(h => `<th style="text-align:left">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td>${r.map(c => `<td style="text-align:left">${escapeHtml_(c || '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="sub">Không có.</div>';
        const n = (K.thieu || []).length + (K.lechAm || []).length;
        el.innerHTML = `<div class="box"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">Kiểm tra cơ cấu bưu cục so với hệ thống</b><button class="qh-clear" id="qh-cc-x">✕</button></div>
            <div class="sub">Hệ thống: <b>${K.soHt}</b> bưu cục có sản lượng giao · Cơ cấu: <b>${K.soCc}</b> dòng. ${n ? `<b style="color:#c92a2a">${n} điểm cần cập nhật cơ cấu.</b>` : '<b style="color:#2b8a3e">Khớp hoàn toàn.</b>'} Bản đồ vẫn chạy theo cơ cấu.</div>
            <h4>1. Bưu cục mới — có trong hệ thống, CHƯA có trong cơ cấu (${(K.thieu || []).length})</h4>${tb(['Bưu cục', 'AM theo hệ thống'], (K.thieu || []).map(r => [r.bc, r.amHt]))}
            <h4>2. Bưu cục đổi AM — AM trong cơ cấu khác hệ thống (${(K.lechAm || []).length})</h4>${tb(['Bưu cục', 'AM trong cơ cấu', 'AM theo hệ thống (ngày mới nhất)'], (K.lechAm || []).map(r => [r.bc, r.amCc, r.amHt]))}
            <details style="margin-top:12px"><summary class="sub" style="cursor:pointer">Có trong cơ cấu nhưng không có sản lượng giao trong hệ thống — kho chuyển tiếp, điểm giao, bưu cục đã đóng (${(K.du || []).length})</summary>${tb(['Bưu cục / kho', 'AM trong cơ cấu'], (K.du || []).map(r => [r.bc, r.amCc]))}</details></div>`;
        document.getElementById('qh-cc-x').addEventListener('click', () => el.remove());
    }
    // v1.7.33 — ô tìm nhanh tỉnh / AM / bưu cục
    function qhSearchFill_() {
        const dl = document.getElementById('qh-search-dl'); if (!dl) return;
        const org = qhOrgV_();
        const items = [];
        Array.from(new Set(Object.values(org).map(o => o.tinh))).sort((a, b) => a.localeCompare(b, 'vi')).forEach(t => items.push('Tỉnh: ' + t));
        Array.from(new Set(Object.values(org).map(o => o.am))).sort((a, b) => a.localeCompare(b, 'vi')).forEach(a => items.push('AM: ' + a));
        Object.keys(org).sort((a, b) => org[a].name.localeCompare(org[b].name, 'vi')).forEach(c => items.push('Bưu cục: ' + org[c].name));
        dl.innerHTML = items.map(x => `<option value="${escapeHtml_(x)}">`).join('');
    }
    function qhSearchGo_(q) {
        const org = qhOrgV_(); q = String(q || '').trim(); if (!q) return false;
        const m = /^(Tỉnh|AM|Bưu cục):\s*(.+)$/.exec(q);
        const codes = Object.keys(org);
        const pickBc = c => { state.qhBc = [c]; state.qhTinh = []; state.qhAm = []; };
        if (m) {
            if (m[1] === 'Tỉnh') { state.qhTinh = [m[2]]; state.qhAm = []; state.qhBc = []; }
            else if (m[1] === 'AM') { state.qhAm = [m[2]]; state.qhBc = []; state.qhTinh = []; }
            else { const c = codes.find(x => org[x].name === m[2]); if (!c) return false; pickBc(c); }
        } else {
            const n = normalizeVn_(q);
            const bc = codes.find(c => normalizeVn_(org[c].name).includes(n) || c === q);
            const am = Array.from(new Set(codes.map(c => org[c].am))).find(a => normalizeVn_(a).includes(n));
            const tinh = Array.from(new Set(codes.map(c => org[c].tinh))).find(t => normalizeVn_(t).includes(n));
            if (am) { state.qhAm = [am]; state.qhBc = []; state.qhTinh = []; }
            else if (tinh) { state.qhTinh = [tinh]; state.qhAm = []; state.qhBc = []; }
            else if (bc) pickBc(bc);
            else return false;
        }
        clearSelection_(); qhFillSelects_(); qhApply_(true);
        return true;
    }

    // gọi sau mỗi lần tải dữ liệu bản đồ xong (cả Tampermonkey và web)
    function qhOrgAfterLoad_() {
        state.qhHubShape = {}; state.qhAmKey = null;
        qhLoadCocau_();
        qhBuildOrg_();
        const go = () => qhApply_(!!qhSelectedHubs_());
        if (state.map && state.map.getLayer('wards-fill')) go();
        else if (state.map) state.map.once('idle', go);
    }
    function qhOpt_(v, l, sel) { return `<option value="${escapeHtml_(v)}"${v === sel ? ' selected' : ''}>${escapeHtml_(l)}</option>`; }
    // v1.7.41 — lọc CHỌN NHIỀU: state.qhTinh / qhAm / qhBc là MẢNG (rỗng = tất cả)
    function qhA_(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
    function qhFillSelects_() {
        const org = qhOrgV_() || {};
        const codes = Object.keys(org);
        const tH = document.getElementById('qh-tinh'), aH = document.getElementById('qh-am'), bH = document.getElementById('qh-bc');
        if (!tH || !aH || !bH) return;
        const T = qhA_(state.qhTinh), A = qhA_(state.qhAm), B = qhA_(state.qhBc);
        const tinhs = Array.from(new Set(codes.map(c => org[c].tinh))).sort((a, b) => a.localeCompare(b, 'vi'));
        state.qhTinh = T.filter(t => tinhs.includes(t));
        const inT = codes.filter(c => !state.qhTinh.length || state.qhTinh.includes(org[c].tinh));
        const ams = Array.from(new Set(inT.map(c => org[c].am))).sort((a, b) => a.localeCompare(b, 'vi'));
        state.qhAm = A.filter(a => ams.includes(a));
        const inA = inT.filter(c => !state.qhAm.length || state.qhAm.includes(org[c].am)).sort((a, b) => org[a].name.localeCompare(org[b].name, 'vi'));
        state.qhBc = B.filter(c => inA.includes(c));
        qhMsSet_(tH, tinhs.map(t => ({ v: t, l: t, sb: codes.filter(c => org[c].tinh === t).length + ' BC' })), state.qhTinh, (arr) => { state.qhTinh = arr; qhFilterChanged_(); });
        qhMsSet_(aH, ams.map(a => ({ v: a, l: a, sb: inT.filter(c => org[c].am === a).length + ' BC' })), state.qhAm, (arr) => { state.qhAm = arr; qhFilterChanged_(); });
        qhMsSet_(bH, inA.map(c => ({ v: c, l: org[c].name, sb: org[c].am || '' })), state.qhBc, (arr) => { state.qhBc = arr; qhFilterChanged_(); });
        qhSearchFill_();
    }
    function qhFilterChanged_() { clearSelection_(); qhFillSelects_(); qhApply_(true); }
    // ---- Ô chọn nhiều (kiểu [S]-Report). Danh sách nổi gắn vào body (position:fixed) để không bị thanh công cụ cuộn ngang cắt mất.
    function qhMsSum_(H) { const M = H._ms, sel = M.sel; const n = M.opts.length, lab = v => (M.opts.find(o => o.v === v) || { l: v }).l;
        if (!n) return `☑ Tất cả ${M.unit}`;
        return !sel.length ? `☑ Tất cả ${n} ${M.unit}` : sel.length === 1 ? lab(sel[0]) : `☑ ${sel.length}/${n} ${M.unit}: ${sel.slice(0, 2).map(lab).join(', ')}${sel.length > 2 ? '…' : ''}`; }
    function qhMsSet_(H, opts, sel, cb) {
        H._ms = { opts, sel: sel.filter(v => opts.some(o => o.v === v)), cb, unit: H.dataset.unit || '', st: null, q: '' };
        if (!H._wired) {
            H._wired = true;
            H.innerHTML = `<b>${escapeHtml_(H.dataset.lab || '')}</b><input autocomplete="off"><i>▾</i><button title="Bỏ chọn — xem tất cả" style="display:none">×</button>`;
            const inp = H.querySelector('input'), x = H.querySelector('button');
            inp.addEventListener('focus', () => qhMsOpen_(H));
            inp.addEventListener('input', () => { const M = H._ms; M.q = inp.value === inp.dataset.sum ? '' : inp.value; qhMsDraw_(H); });
            inp.addEventListener('keydown', (e) => {
                const M = H._ms; if (!M.st) return;
                if (e.key === 'Enter') { e.preventDefault(); if (M.q && M.st.size === M.opts.length) { const v = qhMsVis_(M); if (v.length) M.st = new Set(v.map(o => o.v)); } qhMsApply_(H); }
                else if (e.key === 'Escape') { M.st = null; qhMsClose_(); inp.value = inp.dataset.sum; inp.blur(); }
            });
            x.addEventListener('mousedown', e => e.preventDefault());
            x.addEventListener('click', (e) => { e.preventDefault(); H._ms.st = new Set(); qhMsApply_(H); });
        }
        const inp = H.querySelector('input'), sum = qhMsSum_(H);
        inp.value = sum; inp.dataset.sum = sum; inp.title = H._ms.sel.map(v => (opts.find(o => o.v === v) || {}).l).join(', ');
        H.classList.toggle('on', H._ms.sel.length > 0);
        H.querySelector('button').style.display = H._ms.sel.length ? '' : 'none';
    }
    function qhMsVis_(M) { const q = normalizeVn_(M.q || ''); return q ? M.opts.filter(o => normalizeVn_(o.l + ' ' + (o.sb || '')).includes(q)) : M.opts; }
    function qhMsClose_() { const p = document.getElementById('qh-msp'); if (p) p.remove(); state.qhMsOpen = null; }
    function qhMsOpen_(H) {
        if (state.qhMsOpen && state.qhMsOpen !== H) qhMsApply_(state.qhMsOpen);
        const M = H._ms; if (!M) return;
        if (!M.st) M.st = new Set(M.sel.length ? M.sel : M.opts.map(o => o.v)); M.q = '';
        state.qhMsOpen = H; H.querySelector('input').select(); qhMsDraw_(H);
        if (!state.qhMsDoc) { state.qhMsDoc = true; document.addEventListener('mousedown', (ev) => { const O = state.qhMsOpen, p = document.getElementById('qh-msp'); if (O && !O.contains(ev.target) && !(p && p.contains(ev.target))) qhMsApply_(O); }, true); }
    }
    function qhMsDraw_(H) {
        const M = H._ms; let p = document.getElementById('qh-msp');
        if (!p) { p = document.createElement('div'); p.id = 'qh-msp'; p.addEventListener('mousedown', e => e.preventDefault()); document.body.appendChild(p); }
        const rc = H.getBoundingClientRect(); p.style.top = (rc.bottom + 4) + 'px'; p.style.left = Math.max(8, Math.min(rc.left, window.innerWidth - Math.min(460, window.innerWidth - 16) - 8)) + 'px';
        const vis = M.list = qhMsVis_(M);
        p.innerHTML = `<div class="h"><b>${vis.length} kết quả${M.q ? '' : ' (tất cả ' + escapeHtml_(M.unit) + ')'}</b><button data-a="all">Chọn tất cả</button><button data-a="none">Bỏ chọn tất cả</button><button class="ap" data-a="ap">Áp dụng (${M.st.size})</button></div>
            <div class="n">Gõ để tìm (không dấu cũng được) · bấm tên để chọn / bỏ chọn · Enter = Áp dụng · Esc = đóng · "chỉ … này" = xem riêng 1 mục</div>
            <div class="l">${vis.length ? vis.map((o, i) => `<div class="it${M.st.has(o.v) ? ' on' : ''}" data-i="${i}"><span class="ck"></span><span class="nm">${escapeHtml_(o.l)}</span>${o.sb ? `<span class="sb">${escapeHtml_(o.sb)}</span>` : ''}<button class="one" data-one="${i}">chỉ ${escapeHtml_(M.unit)} này</button></div>`).join('') : (M.opts.length ? '<div class="e">Không có mục nào khớp.</div>' : '<div class="e">Đang tải dữ liệu bản đồ… chờ chút rồi bấm lại.</div>')}</div>`;
        p.onclick = (e) => {
            const a = e.target.closest('[data-a]'), one = e.target.closest('[data-one]'), it = e.target.closest('[data-i]');
            if (a) { const k = a.dataset.a; if (k === 'ap') return qhMsApply_(H); vis.forEach(o => { if (k === 'all') M.st.add(o.v); else M.st.delete(o.v); }); return qhMsDraw_(H); }
            if (one) { M.st = new Set([vis[+one.dataset.one].v]); return qhMsApply_(H); }
            if (it) { const v = vis[+it.dataset.i].v; if (M.st.has(v)) M.st.delete(v); else M.st.add(v); qhMsDraw_(H); }
        };
    }
    function qhMsApply_(H) {
        const M = H._ms; qhMsClose_(); const inp = H.querySelector('input');
        if (!M || !M.st) { if (inp) { inp.value = inp.dataset.sum || ''; inp.blur(); } return; }
        let arr = M.opts.map(o => o.v).filter(v => M.st.has(v)); M.st = null;
        if (arr.length === M.opts.length) arr = [];
        if (inp) { inp.value = inp.dataset.sum || ''; inp.blur(); }
        if (arr.length === M.sel.length && arr.every(v => M.sel.includes(v))) return;
        M.sel = arr; M.cb(arr);
    }
    function qhSelectedHubs_() {
        const org = qhOrgV_();
        const T = qhA_(state.qhTinh), A = qhA_(state.qhAm), B = qhA_(state.qhBc);
        if (B.length) return B.filter(c => org[c]);
        if (!T.length && !A.length) return null;
        return Object.keys(org).filter(c => (!T.length || T.includes(org[c].tinh)) && (!A.length || A.includes(org[c].am)));
    }
    function qhHubShape_(code) {
        if (qhdOn_()) { // v1.7.36 — đang xem bản nháp: ranh giới BC theo bản nháp
            const ws = (state.qhdAfter && state.qhdAfter[code] && state.qhdAfter[code].wards) || [];
            const u = ws.length ? qhdShape_('H:' + code, ws) : null;
            if (u) u.properties = { hub_code: code, name: qhdName_(code) };
            return u;
        }
        state.qhHubShape = state.qhHubShape || {};
        if (state.qhHubShape[code] !== undefined) return state.qhHubShape[code];
        const feats = ((state.wardsOldEnriched && state.wardsOldEnriched.features) || []).filter(f => String(f.properties.delivery_hub) === code);
        let u = null;
        try { u = unionFeatures_(feats.map(f => ({ type: 'Feature', properties: {}, geometry: f.geometry }))); } catch (e) { u = null; }
        if (u) u.properties = { hub_code: code, name: (state.qhOrg[code] || {}).name || code };
        state.qhHubShape[code] = u;
        return u;
    }
    // ===== v1.7.43 — LỚP THEO AM: màu từng AM + viền + tên khu vực AM =====
    // màu AM: các AM ĐANG XEM (theo lọc) lấy trước từ bảng màu tương phản mạnh → AM cạnh nhau không trùng màu
    function qhAmColor_(am) {
        const ord = state.qhAmOrd || [];
        const P = ['#e6194b', '#4363d8', '#f58231', '#3cb44b', '#911eb4', '#f032e6', '#469990', '#9a6324', '#000075', '#808000', '#42d4f4', '#800000', '#d4a017', '#5f9ea0', '#c71585', '#2f4f4f', '#ff7f50', '#6b8e23', '#8a2be2', '#a0522d'];
        let i = ord.indexOf(am); if (i < 0) { let h = 0; for (const ch of String(am)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; i = ord.length + (h % 40); }
        if (i < P.length) return P[i];
        return `hsl(${Math.round((i * 137.508) % 360)}, 62%, 46%)`;
    }
    function qhAmOrder_() {
        const org = qhOrgV_() || {}, set = qhSelectedHubs_();
        const inV = Array.from(new Set((set || []).map(c => (org[c] || {}).am).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
        const rest = Array.from(new Set(Object.values(org).map(o => o.am).filter(Boolean))).filter(a => !inV.includes(a)).sort((a, b) => a.localeCompare(b, 'vi'));
        state.qhAmOrd = inV.concat(rest);
    }
    function qhAmPaint_() {
        if (!state.map || !state.map.getLayer('wards-fill') || state.currentMode !== 'am') return;
        qhAmOrder_();
        const org = qhOrgV_() || {};
        const matchExpr = ['match', ['to-string', ['get', 'delivery_hub']]];
        const seen = {};
        (state.wards || []).forEach(w => { const c = String(w.delivery_hub || ''); if (!c || seen[c]) return; seen[c] = 1; const am = (org[c] || {}).am; matchExpr.push(c, am ? qhAmColor_(am) : '#c8c8c8'); });
        if (matchExpr.length === 2) matchExpr.push('__', '#c8c8c8');
        matchExpr.push('#c8c8c8');
        state.map.setPaintProperty('wards-fill', 'fill-color', matchExpr);
    }
    function qhAmLayer_() {
        const map = state.map; if (!map || !map.getLayer('wards-fill') || !qhEnsureLayers_()) return;
        const empty = { type: 'FeatureCollection', features: [] };
        if (!map.getSource('qh-am')) {
            map.addSource('qh-am', { type: 'geojson', data: empty });
            map.addSource('qh-am-pt', { type: 'geojson', data: empty });
            map.addLayer({ id: 'qh-am-casing', type: 'line', source: 'qh-am', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.85 } }, 'qh-grp-casing');
            map.addLayer({ id: 'qh-am-line', type: 'line', source: 'qh-am', paint: { 'line-color': ['get', 'color'], 'line-width': 2.6 } }, 'qh-grp-casing');
            map.addLayer({ id: 'qh-am-label', type: 'symbol', source: 'qh-am-pt', layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 9, 13, 12, 15], 'text-allow-overlap': false, 'text-padding': 4, 'text-max-width': 14 }, paint: { 'text-color': '#111111', 'text-halo-color': '#ffffff', 'text-halo-width': 2.2 } });
        }
        const on = state.currentMode === 'am';
        ['qh-am-casing', 'qh-am-line', 'qh-am-label'].forEach(id => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
        if (!on) return;
        const org = qhOrgV_() || {}, set = qhSelectedHubs_();
        const codes = (set || Object.keys(org)).filter(c => org[c] && org[c].am);
        const key = codes.map(c => c + ':' + org[c].am).sort().join(',');
        if (!qhdOn_() && state.qhAmKey === key) return;
        state.qhAmKey = key; qhAmPaint_();
        const by = {};
        codes.forEach(c => { (by[org[c].am] = by[org[c].am] || []).push(c); });
        const polys = [], pts = [];
        Object.keys(by).forEach(am => {
            const shapes = by[am].map(qhHubShape_).filter(Boolean); if (!shapes.length) return;
            let u = null; try { u = shapes.length > 1 ? unionFeatures_(shapes) : shapes[0]; } catch (e) { u = null; }
            const color = qhAmColor_(am), nm = am.replace(/^\s*\d+\s*-\s*/, '');
            (u ? [u] : shapes).forEach(f => polys.push({ type: 'Feature', geometry: f.geometry, properties: { color } }));
            try { const big = u || shapes[0]; const pt = turf.pointOnFeature(big); pts.push({ type: 'Feature', geometry: pt.geometry, properties: { color, label: `${nm}\n${by[am].length} BC` } }); } catch (e) { /* bỏ qua */ }
        });
        map.getSource('qh-am').setData({ type: 'FeatureCollection', features: polys });
        map.getSource('qh-am-pt').setData({ type: 'FeatureCollection', features: pts });
    }
    function qhEnsureLayers_() {
        const map = state.map;
        if (!map || !map.getLayer('wards-fill')) return false;
        const empty = { type: 'FeatureCollection', features: [] };
        if (!map.getSource('qh-grp')) {
            map.addSource('qh-grp', { type: 'geojson', data: empty });
            map.addSource('qh-hubs', { type: 'geojson', data: empty });
            const before = map.getLayer('staff-territory-line-primary') ? 'staff-territory-line-primary' : undefined;
            map.addLayer({ id: 'qh-hubs-line', type: 'line', source: 'qh-hubs', paint: { 'line-color': '#1f2a44', 'line-width': 1.6, 'line-opacity': 0.85 } }, before);
            map.addLayer({ id: 'qh-grp-casing', type: 'line', source: 'qh-grp', paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } }, before);
            map.addLayer({ id: 'qh-grp-line', type: 'line', source: 'qh-grp', paint: { 'line-color': '#e8590c', 'line-width': 3.6 } }, before);
        }
        return true;
    }
    function qhApply_(fit) {
        const map = state.map;
        if (!map || !map.getLayer('wards-fill')) return;
        if (!qhEnsureLayers_()) return;
        const set = qhSelectedHubs_();
        try { qhAmLayer_(); } catch (e) { /* bỏ qua */ }
        const baseOpacity = state.currentMode === 'ward' ? 0.8 : 0.65;
        const empty = { type: 'FeatureCollection', features: [] };
        const dOn = qhdOn_() && map.getLayer('qhd-fill');
        const dOp = ['case', ['==', ['get', 'ch'], 1], 0.85, 0.6];
        if (dOn) map.setPaintProperty('qhd-fill', 'fill-opacity', set ? ['case', ['in', ['get', 'k'], ['literal', set]], dOp, 0.07] : dOp);
        if (!set) {
            map.setPaintProperty('wards-fill', 'fill-opacity', baseOpacity);
            if (map.getLayer('hubs-points')) map.setPaintProperty('hubs-points', 'circle-opacity', 1);
            map.getSource('qh-grp').setData(empty);
            map.getSource('qh-hubs').setData(empty);
            qhSummary_(null);
            return;
        }
        const lit = ['literal', set];
        map.setPaintProperty('wards-fill', 'fill-opacity', ['case', ['in', ['to-string', ['get', 'delivery_hub']], lit], baseOpacity, 0.07]);
        if (map.getLayer('hubs-points')) map.setPaintProperty('hubs-points', 'circle-opacity', ['case', ['in', ['to-string', ['get', 'hub_code']], lit], 1, 0.18]);
        const shapes = set.map(qhHubShape_).filter(Boolean);
        map.getSource('qh-hubs').setData({ type: 'FeatureCollection', features: shapes });
        let grp = null;
        try { grp = shapes.length > 1 ? unionFeatures_(shapes) : shapes[0]; } catch (e) { grp = null; }
        map.getSource('qh-grp').setData(grp ? { type: 'FeatureCollection', features: [grp] } : empty);
        if (fit && shapes.length) {
            try {
                const bb = turf.bbox({ type: 'FeatureCollection', features: shapes });
                map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 40, duration: 500 });
            } catch (e) { /* bỏ qua */ }
        }
        const oneBc = qhA_(state.qhBc).length === 1 ? qhA_(state.qhBc)[0] : '';
        if (oneBc && qhdOn_()) {
            qhSummary_(set);
        } else if (oneBc) {
            const h = state.hubsByCode[oneBc];
            const pf = hubsToPointsGeoJson_().features.find(f => String(f.properties.hub_code) === oneBc);
            selectHubTerritory_(oneBc);
            if (h && pf) { showInfoPanel_(hubPopupHtml_(pf.properties), true); wireHubStaffingTable_(); }
        } else {
            qhSummary_(set);
        }
    }
    function qhFmt_(n) { return (Math.round(n || 0)).toLocaleString('vi-VN'); }
    function qhSummary_(set) {
        if (!set) return;
        const org = qhOrgV_();
        const D = qhdOn_() ? (state.qhdAfter || {}) : null;
        const rows = D ? set.map(c => {
            const s = D[c] || { nW: 0, dv: 0, pv: 0, staff: 0 };
            return { c, name: org[c] ? org[c].name : c, am: org[c] ? org[c].am : '', tinh: org[c] ? org[c].tinh : '', nW: s.nW, staff: qhdNew_(c) ? 0 : ((state.hubsByCode[c] || {}).staff || 0), dv: s.dv, pv: s.pv, isNew: !!qhdNew_(c) };
        }).sort((x, y) => y.dv - x.dv) : set.map(c => {
            const h = state.hubsByCode[c] || {};
            const a = h.actual || {};
            const nW = ((state.wardsOldEnriched && state.wardsOldEnriched.features) || []).filter(f => String(f.properties.delivery_hub) === c).length;
            return { c, name: org[c] ? org[c].name : c, am: org[c] ? org[c].am : '', tinh: org[c] ? org[c].tinh : '', nW, staff: h.staff || 0, dv: a.dv || 0, pv: a.pv || 0 };
        }).sort((x, y) => y.dv - x.dv);
        const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
        const lst = (a, pre, unit, f) => !a.length ? '' : a.length <= 3 ? pre + ' ' + a.map(f || (x => x)).join(', ') : a.length + ' ' + unit;
        const T_ = qhA_(state.qhTinh), A_ = qhA_(state.qhAm), B_ = qhA_(state.qhBc);
        let title = [lst(T_, 'Tỉnh', 'tỉnh'), lst(A_, 'AM', 'AM'), lst(B_, 'Bưu cục', 'bưu cục', c => (org[c] || {}).name || c)].filter(Boolean).join(' · ');
        if (D) title = '📝 ' + title + ' — theo bản nháp "' + ((state.qhd.cur || {}).ten || '') + '"';
        const showAm = qhA_(state.qhAm).length !== 1;
        let html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif">
            <div style="font-weight:700;font-size:14px;color:#212529">${escapeHtml_(title)}</div>
            <div style="font-size:12px;color:#6c757d;margin:2px 0 8px">Khu vực quản lý: <b>${rows.length}</b> bưu cục · <b>${qhFmt_(sum('nW'))}</b> xã/phường · nhân sự <b>${qhFmt_(sum('staff'))}</b> · giao <b>${qhFmt_(sum('dv'))}</b> đơn · lấy <b>${qhFmt_(sum('pv'))}</b> đơn (số liệu quy hoạch)</div>
            ${state.currentMode === 'am' ? (() => { const g = {}; rows.forEach(r => { if (r.am) g[r.am] = (g[r.am] || 0) + 1; }); return '<div style="display:flex;flex-wrap:wrap;gap:4px 10px;margin:0 0 8px;font-size:12px">' + Object.keys(g).sort((a, b) => g[b] - g[a]).map(a => `<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${qhAmColor_(a)};vertical-align:-1px;margin-right:4px"></span>${escapeHtml_(a)} <b>${g[a]} BC</b></span>`).join('') + '</div>'; })() : ''}
            <table class="qh-sum"><thead><tr><th>Bưu cục</th>${showAm ? '<th>AM</th>' : ''}<th>Xã/phường</th><th>Nhân sự</th><th>Giao</th><th>Lấy</th></tr></thead><tbody>`;
        rows.forEach(r => {
            html += `<tr><td><a href="#" class="qh-bc-link" data-hub="${escapeHtml_(r.c)}">${r.isNew ? '★ ' : ''}${escapeHtml_(r.name)}</a></td>${showAm ? `<td>${state.currentMode === 'am' && r.am ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${qhAmColor_(r.am)};margin-right:4px"></span>` : ''}${escapeHtml_(r.am)}</td>` : ''}<td>${r.nW}</td><td>${qhFmt_(r.staff)}</td><td>${qhFmt_(r.dv)}</td><td>${qhFmt_(r.pv)}</td></tr>`;
        });
        html += `</tbody></table><div style="font-size:11px;color:#868e96;margin-top:6px">Viền cam = ranh giới cả khu vực · viền xanh đen = ranh giới từng bưu cục. Bấm tên bưu cục để xem chi tiết.</div></div>`;
        showInfoPanel_(html, true);
        document.querySelectorAll('#ghn-tg-info-content .qh-bc-link').forEach(a => a.addEventListener('click', (e) => {
            e.preventDefault();
            state.qhBc = [a.dataset.hub];
            qhFillSelects_();
            qhApply_(true);
        }));
    }
    function qhWireControls_() {
        if (!document.getElementById('qh-tinh')) return;
        state.qhTinh = qhA_(state.qhTinh); state.qhAm = qhA_(state.qhAm); state.qhBc = qhA_(state.qhBc);
        try { qhFillSelects_(); } catch (e) { /* chưa có dữ liệu — ô vẫn hiện "Tất cả …" */ }
        const sIn = document.getElementById('qh-search');
        if (sIn) {
            sIn.addEventListener('change', () => { if (qhSearchGo_(sIn.value)) sIn.value = ''; });
            sIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (qhSearchGo_(sIn.value)) sIn.value = ''; else sIn.style.borderColor = '#c92a2a'; } else sIn.style.borderColor = ''; });
        }
        // v1.7.39 — nhãn "Đã xác thực" chuyển lên hàng tab (cạnh "Theo Nhân Viên") để thanh công cụ rộng chỗ hơn
        const ccb = document.getElementById('qh-cc-badge'), tabs = document.getElementById('ghn-tuyen-giao-tabs');
        if (ccb && tabs && ccb.parentNode !== tabs) { ccb.classList.add('qh-cc-intab'); tabs.appendChild(ccb); }
        qhCcBadge_();
        const qb = document.getElementById('qhd-btn');
        if (qb) qb.addEventListener('click', qhdToggle_);
        const clr = document.getElementById('qh-clear');
        if (clr) clr.addEventListener('click', () => { state.qhTinh = []; state.qhAm = []; state.qhBc = []; clearSelection_(); qhFillSelects_(); qhApply_(false); fitToData_(); });
    }

    // ==================== v1.7.37 — HỘP THÔNG BÁO / XÁC NHẬN / NHẬP LIỆU dạng popup (thay alert / confirm / prompt của trình duyệt) ====================
    function qhDialog_(o) {
        o = o || {};
        return new Promise(resolve => {
            const old = document.getElementById('qh-dlg'); if (old) old.remove();
            const el = document.createElement('div'); el.id = 'qh-dlg';
            const fields = (o.fields || []).map(f => `<label class="qh-dlg-f"><span>${escapeHtml_(f.label || '')}</span><input data-k="${escapeHtml_(f.key)}" value="${escapeHtml_(f.value || '')}" placeholder="${escapeHtml_(f.placeholder || '')}" ${f.list ? `list="${escapeHtml_(f.list)}"` : ''} autocomplete="off"></label>`).join('');
            el.innerHTML = `<div class="qh-dlg-box" role="dialog"><div class="qh-dlg-t">${o.icon || ''} ${escapeHtml_(o.title || 'Thông báo')}</div>
                ${o.msg ? `<div class="qh-dlg-m">${o.html ? o.msg : escapeHtml_(o.msg).replace(/\n/g, '<br>')}</div>` : ''}${fields}<div class="qh-dlg-err"></div>
                <div class="qh-dlg-b">${o.cancel === false ? '' : `<button class="qh-dlg-no">${escapeHtml_(o.cancel || 'Huỷ')}</button>`}<button class="qh-dlg-ok${o.danger ? ' red' : ''}">${escapeHtml_(o.ok || 'OK')}</button></div></div>`;
            document.body.appendChild(el);
            const vals = () => { const v = {}; el.querySelectorAll('input[data-k]').forEach(i => { v[i.dataset.k] = i.value.trim(); }); return v; };
            const close = (r) => { el.remove(); document.removeEventListener('keydown', key, true); resolve(r); };
            const ok = () => {
                const v = vals();
                if (o.validate) { const e = o.validate(v); if (e) { el.querySelector('.qh-dlg-err').textContent = e; return; } }
                close(o.fields ? v : true);
            };
            const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(o.fields ? null : false); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ok(); } };
            document.addEventListener('keydown', key, true);
            el.querySelector('.qh-dlg-ok').addEventListener('click', ok);
            const no = el.querySelector('.qh-dlg-no'); if (no) no.addEventListener('click', () => close(o.fields ? null : false));
            el.addEventListener('click', (e) => { if (e.target === el) close(o.fields ? null : false); });
            const f1 = el.querySelector('input[data-k]'); (f1 || el.querySelector('.qh-dlg-ok')).focus();
        });
    }
    function qhAlert_(msg, title) { return qhDialog_({ title: title || 'Thông báo', icon: 'ℹ️', msg, cancel: false, ok: 'Đã hiểu' }); }
    function qhConfirm_(msg, ok, title, danger) { return qhDialog_({ title: title || 'Xác nhận', icon: danger ? '⚠️' : '❓', msg, ok: ok || 'Đồng ý', danger }); }
    // v1.7.37 — thêm AM mới chưa có trong cơ cấu: nhập ID + Họ tên → "ID - Họ tên"
    async function qhdNewAm_() {
        const known = qhdAmList_();
        const v = await qhDialog_({ title: 'Thêm AM mới', icon: '👤', msg: 'AM chưa có trong cơ cấu. Nhập mã nhân viên và họ tên — sẽ hiện dạng "ID - Họ tên".',
            fields: [{ key: 'id', label: 'ID AM (mã nhân viên)', placeholder: 'vd 3172684' }, { key: 'name', label: 'Họ tên AM', placeholder: 'vd Nguyễn Văn A' }],
            ok: 'Thêm AM',
            validate: (x) => !x.id ? 'Chưa nhập ID AM.' : !/^[A-Za-z0-9._-]{3,20}$/.test(x.id) ? 'ID AM chỉ gồm chữ/số, 3–20 ký tự.' : !x.name ? 'Chưa nhập họ tên AM.' : '' });
        if (!v) return null;
        const same = known.find(a => String(a).split(' - ')[0].trim() === v.id);
        if (same) { await qhAlert_('ID ' + v.id + ' đã có: "' + same + '". Dùng AM này.', 'AM đã có'); return same; }
        const lb = v.id + ' - ' + v.name.replace(/\s+/g, ' ');
        const Q = qhd_(); Q.amNew = Q.amNew || []; if (!Q.amNew.includes(lb)) Q.amNew.push(lb);
        return lb;
    }

    // ==================== v1.7.34 — BẢN NHÁP QUY HOẠCH (gộp xã/phường, bưu cục, AM — dùng chung Tampermonkey + web) ====================
    // Dữ liệu quy hoạch thật (Drive) KHÔNG bị đụng tới. Bản nháp = danh sách "ghi đè": xã/phường → bưu cục mới (wm),
    // bưu cục mới tạo (nh), bưu cục → AM mới (ham). Lưu CHUNG ở sheet của web báo cáo (action qhDraftList/qhDraftSave/
    // qhDraftDelete); ai cũng xem được, chỉ Admin + Quản lý được tạo/sửa (máy chủ kiểm tra). 3 kiểu thao tác:
    //   (1) gộp các bưu cục đang có cho 1 AM / 1 quy hoạch mới  (2) gộp thêm xã/phường vào 1 bưu cục có sẵn
    //   (3) gộp xã/phường của nhiều bưu cục thành 1 bưu cục mới. Bảng so sánh trước → sau: số xã/phường, diện tích,
    //   sản lượng giao/lấy, nhân sự hiện có, định biên cần (đơn giao ÷ năng lực ổn định 70 xã / 90 phường), khoảng cách tới BC.
    function qhdOn_() { const Q = state.qhd; return !!(Q && Q.open && Q.cur); }
    // v1.7.36 — cơ cấu Tỉnh / AM / Bưu cục đang xem: bản nháp (khi đang mở 1 bản nháp) hoặc quy hoạch thật
    function qhOrgV_() { return qhdOn_() && state.qhdOrg ? state.qhdOrg : (state.qhOrg || {}); }
    function qhdBuildOrg_() {
        if (!qhdOn_()) { state.qhdOrg = null; state.qhdAfter = null; return; }
        const base = state.qhOrg || {}, A = qhdStats_(qhdHub_, qhdPos_), org = {};
        const hadWards = new Set(qhdAllWards_().map(qhdBase_));
        state.qhdAfter = A;
        qhdHubKeys_().forEach(k => {
            const n = qhdNew_(k), s = A[k];
            if (!n && !base[k]) return;
            if (!n && !s && hadWards.has(k)) return; // BC bị gộp hết xã/phường → không còn trong bản nháp
            let tinh = base[k] ? base[k].tinh : '';
            if (n || !tinh) { const c = {}; (s ? s.wards : []).forEach(wc => { const p = qhdWard_(wc).province; if (p) c[p] = (c[p] || 0) + 1; }); tinh = Object.keys(c).sort((x, y) => c[y] - c[x])[0] || tinh || '(chưa rõ tỉnh)'; }
            org[k] = { tinh, am: qhdAm_(k), name: qhdName_(k) };
        });
        state.qhdOrg = org;
    }
    function qhd_() {
        if (!state.qhd) state.qhd = { open: false, list: [], canEdit: false, isAdmin: false, who: '', me: '', loaded: false, cur: null, sel: new Set(), pick: true, place: null, tab: 'edit', undo: [], dirty: false, msg: '', amChips: [] };
        return state.qhd;
    }
    function qhdPost_(body) {
        return new Promise(resolve => {
            const done = (txt) => { try { resolve(JSON.parse(txt)); } catch (e) { resolve({ ok: false, error: 'phan_hoi_loi' }); } };
            try {
                if (typeof qhSession_ === 'function') {
                    body.token = (qhSession_() || {}).token || '';
                } else {
                    let t = state.ghnToken || null;
                    try { if (!t) t = autoDetectGhnToken_(); } catch (e) { t = null; }
                    body.ghnToken = t || '';
                }
                const data = JSON.stringify(body);
                if (typeof qhSession_ !== 'function' && typeof GM_xmlhttpRequest === 'function') {
                    GM_xmlhttpRequest({ method: 'POST', url: QH_WEB_API_URL, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, data,
                        onload: r => done(r.responseText), onerror: () => resolve({ ok: false, error: 'loi_mang' }), ontimeout: () => resolve({ ok: false, error: 'het_gio' }), timeout: 45000 });
                    return;
                }
                const url = /baocaovanhanh/.test(location.hostname) || location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '/api/gas' : QH_WEB_API_URL;
                fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: data }).then(r => r.text()).then(done).catch(() => resolve({ ok: false, error: 'loi_mang' }));
            } catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); }
        });
    }
    const QHD_ERR_ = {
        session_expired: 'Phiên đăng nhập web đã hết hạn — đăng nhập lại.', account_inactive: 'Tài khoản web chưa được kích hoạt.',
        ghn_token_het_han: 'Phiên GHN đã hết hạn — tải lại trang nhanh.ghn.vn.', ghn_khong_xac_thuc: 'Không xác thực được tài khoản GHN.',
        ghn_loi_mang: 'Không gọi được GHN để xác thực.', khong_co_quyen: 'Tài khoản chưa có quyền dùng Modul 6.',
        khong_co_quyen_sua: 'Chỉ Admin và Quản lý được tạo / sửa bản nháp.', ban_nhap_da_bi_sua: 'Bản nháp vừa được người khác sửa — mở lại để xem bản mới nhất.',
        chi_nguoi_tao_hoac_admin_duoc_xoa: 'Chỉ người tạo hoặc Admin được xoá bản nháp này.', khong_tim_thay_ban_nhap: 'Không tìm thấy bản nháp (có thể đã bị xoá).',
        du_lieu_qua_lon: 'Bản nháp quá lớn.', loi_mang: 'Lỗi mạng — thử lại.', het_gio: 'Hết thời gian chờ — thử lại.'
    };
    function qhdErr_(r) { return QHD_ERR_[r && r.error] || ('Lỗi: ' + ((r && r.error) || 'không rõ')); }

    // ---- dữ liệu nền ----
    function qhdIdx_() {
        if (state.qhdFeatSrc === state.wardsOldEnriched && state.qhdFeat) return;
        state.qhdFeatSrc = state.wardsOldEnriched;
        state.qhdFeat = {}; state.qhdWc = {}; state.qhdShape = {};
        ((state.wardsOldEnriched && state.wardsOldEnriched.features) || []).forEach(f => { const c = String(f.properties.ward_code || ''); if (c && state.wardsByCode[c]) state.qhdFeat[c] = f; });
    }
    function qhdWard_(wc) {
        qhdIdx_();
        if (state.qhdWc[wc]) return state.qhdWc[wc];
        const w = state.wardsByCode[wc] || {}, f = state.qhdFeat[wc];
        let area = 0, cen = state.wardCentroids && state.wardCentroids[wc];
        try { if (f) area = turf.area(f) / 1e6; } catch (e) { area = 0; }
        if (!Array.isArray(cen)) { try { cen = f ? turf.centroid(f).geometry.coordinates : null; } catch (e) { cen = null; } }
        const o = { wc, name: w.name || wc, province: w.province || '', district: w.district || '', dv: +w.dv || 0, pv: +w.pv || 0, dw: +w.dw || 0, pw: +w.pw || 0, area, cen, isP: /^Phường\s+/i.test(w.name || '') };
        state.qhdWc[wc] = o;
        return o;
    }
    function qhdBase_(wc) { const w = state.wardsByCode[wc]; return w ? String(w.delivery_hub || '') : ''; }
    function qhdHub_(wc) { const c = qhd_().cur; return c && Object.prototype.hasOwnProperty.call(c.wm, wc) ? c.wm[wc] : qhdBase_(wc); }
    function qhdNew_(k) { const c = qhd_().cur; return c ? c.nh.find(h => h.id === k) || null : null; }
    function qhdName_(k) { const n = qhdNew_(k); if (n) return n.name; return (state.qhOrg && state.qhOrg[k] && state.qhOrg[k].name) || hubLabel_(k); }
    function qhdAmBase_(k) { return (state.qhOrg && state.qhOrg[k] && state.qhOrg[k].am) || '(chưa rõ AM)'; }
    function qhdAm_(k) { const c = qhd_().cur; if (c && c.ham[k]) return c.ham[k]; const n = qhdNew_(k); if (n) return n.am || '(chưa gán AM)'; return qhdAmBase_(k); }
    function qhdPos_(k) { const n = qhdNew_(k); if (n) return typeof n.lat === 'number' ? [n.lng, n.lat] : null; const h = state.hubsByCode[k]; return h && typeof h.lat === 'number' ? [h.lng, h.lat] : null; }
    function qhdKm_(a, b) {
        if (!a || !b) return null;
        const R = 6371, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(x));
    }
    function qhdAllWards_() { qhdIdx_(); return Object.keys(state.qhdFeat); }
    function qhdHubKeys_() {
        const c = qhd_().cur;
        const ks = new Set((state.hubs || []).map(h => String(h.hub_code)));
        if (c) c.nh.forEach(h => ks.add(h.id));
        return Array.from(ks);
    }
    // thống kê theo bưu cục: hubOf(wc) → khoá BC, posOf(k) → [lng,lat]
    function qhdStats_(hubOf, posOf) {
        const S = {};
        qhdAllWards_().forEach(wc => {
            const k = hubOf(wc); if (!k) return;
            const w = qhdWard_(wc);
            const s = S[k] || (S[k] = { k, wards: [], nW: 0, area: 0, dv: 0, pv: 0, dw: 0, pw: 0, need: 0, dSum: 0, dW: 0, dMax: 0, dMaxName: '', dN: 0, dPlain: 0 });
            s.wards.push(wc); s.nW++; s.area += w.area; s.dv += w.dv; s.pv += w.pv; s.dw += w.dw; s.pw += w.pw;
            s.need += w.dv / (w.isP ? THRESHOLDS_.giaoPhuong.yellowMin : THRESHOLDS_.giaoXa.yellowMin);
            const d = qhdKm_(posOf(k), w.cen);
            if (d != null) { s.dSum += d * w.dv; s.dW += w.dv; s.dPlain += d; s.dN++; if (d > s.dMax) { s.dMax = d; s.dMaxName = w.name; } }
        });
        Object.values(S).forEach(s => {
            s.dAvg = s.dW > 0 ? s.dSum / s.dW : (s.dN ? s.dPlain / s.dN : null);
            const h = state.hubsByCode[s.k];
            s.staff = h ? (+h.staff || 0) : 0;
            s.needR = Math.ceil(s.need - 1e-9);
        });
        return S;
    }
    function qhdBasePos_(k) { const h = state.hubsByCode[k]; return h && typeof h.lat === 'number' ? [h.lng, h.lat] : null; }
    function qhdAffected_() {
        const c = qhd_().cur, hubs = new Set();
        if (!c) return hubs;
        Object.keys(c.wm).forEach(wc => { hubs.add(qhdBase_(wc)); hubs.add(c.wm[wc]); });
        c.nh.forEach(h => hubs.add(h.id));
        Object.keys(c.ham).forEach(k => hubs.add(k));
        hubs.delete('');
        return hubs;
    }

    // ---- thao tác ----
    function qhdSnap_() { const c = qhd_().cur; return JSON.stringify({ wm: c.wm, nh: c.nh, ham: c.ham }); }
    function qhdPush_() { const Q = qhd_(); Q.undo.push(qhdSnap_()); if (Q.undo.length > 40) Q.undo.shift(); Q.dirty = true; }
    function qhdUndo_() { const Q = qhd_(); if (!Q.undo.length || !Q.cur) return; const o = JSON.parse(Q.undo.pop()); Q.cur.wm = o.wm; Q.cur.nh = o.nh; Q.cur.ham = o.ham; Q.dirty = true; qhdRefresh_(); }
    function qhdAssign_(codes, k) {
        const c = qhd_().cur; if (!c || !codes.length) return;
        qhdPush_();
        codes.forEach(wc => { if (qhdBase_(wc) === k) delete c.wm[wc]; else c.wm[wc] = k; });
        qhdCleanNew_();
    }
    function qhdRevert_(codes) { const c = qhd_().cur; if (!c) return; qhdPush_(); codes.forEach(wc => { delete c.wm[wc]; }); qhdCleanNew_(); }
    function qhdCleanNew_() {
        // BC mới không còn xã/phường nào thì giữ lại (để người dùng tự xoá) — chỉ dọn AM ghi đè trùng AM gốc
        const c = qhd_().cur;
        Object.keys(c.ham).forEach(k => { if (!qhdNew_(k) && c.ham[k] === qhdAmBase_(k)) delete c.ham[k]; });
    }
    function qhdNewHub_(name, codes, amPick) {
        const c = qhd_().cur; if (!c) return null;
        let n = 1; while (c.nh.some(h => h.id === 'N' + n)) n++;
        const id = 'N' + n;
        let sx = 0, sy = 0, sw = 0;
        codes.forEach(wc => { const w = qhdWard_(wc); if (w.cen) { const wt = Math.max(1, w.dv); sx += w.cen[0] * wt; sy += w.cen[1] * wt; sw += wt; } });
        const cnt = {};
        codes.forEach(wc => { const a = qhdAm_(qhdHub_(wc)); cnt[a] = (cnt[a] || 0) + qhdWard_(wc).dv + 1; });
        const am = String(amPick || '').trim() || Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '';
        qhdPush_();
        c.nh.push({ id, name: String(name || '').trim() || ('Bưu cục mới ' + n), lng: sw ? sx / sw : null, lat: sw ? sy / sw : null, am });
        codes.forEach(wc => { c.wm[wc] = id; });
        return id;
    }
    function qhdDelNew_(id) {
        const c = qhd_().cur; if (!c) return;
        qhdPush_();
        Object.keys(c.wm).forEach(wc => { if (c.wm[wc] === id) delete c.wm[wc]; });
        c.nh = c.nh.filter(h => h.id !== id);
        delete c.ham[id];
    }
    function qhdSetAm_(hubKeys, am) {
        const c = qhd_().cur; am = String(am || '').trim(); if (!c || !am || !hubKeys.length) return;
        qhdPush_();
        hubKeys.forEach(k => { const n = qhdNew_(k); if (n) n.am = am; else if (am === qhdAmBase_(k)) delete c.ham[k]; else c.ham[k] = am; });
    }

    // ---- bản đồ ----
    function qhdEnsureLayers_() {
        const map = state.map;
        if (!map || !map.getLayer('wards-fill')) return false;
        const empty = { type: 'FeatureCollection', features: [] };
        if (map.getSource('qhd-w')) return true;
        ['qhd-w', 'qhd-sel', 'qhd-hb', 'qhd-am', 'qhd-np'].forEach(id => map.addSource(id, { type: 'geojson', data: empty }));
        const top = map.getLayer('hubs-points') ? 'hubs-points' : undefined; // viền nháp nằm trên mọi lớp tô, dưới chấm bưu cục
        map.addLayer({ id: 'qhd-fill', type: 'fill', source: 'qhd-w', paint: { 'fill-color': '#a0a0a0', 'fill-opacity': ['case', ['==', ['get', 'ch'], 1], 0.85, 0.6] } }, 'wards-line');
        map.addLayer({ id: 'qhd-chg', type: 'line', source: 'qhd-w', filter: ['==', ['get', 'ch'], 1], paint: { 'line-color': '#c92a2a', 'line-width': 1.6, 'line-dasharray': [2, 1.5] } }, top);
        map.addLayer({ id: 'qhd-sel-fill', type: 'fill', source: 'qhd-sel', paint: { 'fill-color': '#ffd43b', 'fill-opacity': 0.6 } }, top);
        map.addLayer({ id: 'qhd-sel-line', type: 'line', source: 'qhd-sel', paint: { 'line-color': '#f08c00', 'line-width': 2.2 } }, top);
        map.addLayer({ id: 'qhd-hb-casing', type: 'line', source: 'qhd-hb', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.85 } }, top);
        map.addLayer({ id: 'qhd-hb-line', type: 'line', source: 'qhd-hb', paint: { 'line-color': '#1f2a44', 'line-width': 2.6 } }, top);
        map.addLayer({ id: 'qhd-am-line', type: 'line', source: 'qhd-am', paint: { 'line-color': '#7048e8', 'line-width': 3.4, 'line-dasharray': [3, 2] } }, top);
        map.addLayer({ id: 'qhd-np-c', type: 'circle', source: 'qhd-np', paint: { 'circle-radius': 8, 'circle-color': '#ffffff', 'circle-stroke-width': 3, 'circle-stroke-color': ['get', 'col'] } });
        map.addLayer({ id: 'qhd-np-t', type: 'symbol', source: 'qhd-np', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-allow-overlap': true }, paint: { 'text-color': '#1f2a44', 'text-halo-color': '#fff', 'text-halo-width': 1.6 } });
        return true;
    }
    function qhdVis_(on) {
        const map = state.map; if (!map || !map.getLayer('qhd-fill')) return;
        ['qhd-fill', 'qhd-chg', 'qhd-sel-fill', 'qhd-sel-line', 'qhd-hb-casing', 'qhd-hb-line', 'qhd-am-line', 'qhd-np-c', 'qhd-np-t'].forEach(id => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
    }
    function qhdShape_(key, codes) {
        state.qhdShape = state.qhdShape || {};
        const sig = key + '|' + codes.slice().sort().join(',');
        if (state.qhdShape[sig] !== undefined) return state.qhdShape[sig];
        let u = null;
        try { u = unionFeatures_(codes.map(wc => state.qhdFeat[wc]).filter(Boolean).map(f => ({ type: 'Feature', properties: {}, geometry: f.geometry }))); } catch (e) { u = null; }
        state.qhdShape[sig] = u;
        return u;
    }
    function qhdRender_() {
        const Q = qhd_(), map = state.map;
        if (!Q.cur || !Q.open) { qhdVis_(false); return; }
        if (!qhdEnsureLayers_()) { if (map) map.once('idle', qhdRender_); return; }
        qhdVis_(true);
        // viền khu vực Tỉnh/AM/BC (cam) phải nằm trên lớp tô bản nháp
        ['qh-hubs-line', 'qh-grp-casing', 'qh-grp-line'].forEach(id => { if (map.getLayer(id)) map.moveLayer(id, map.getLayer('hubs-points') ? 'hubs-points' : undefined); });
        qhdIdx_();
        const keys = new Set();
        const feats = qhdAllWards_().map(wc => {
            const k = qhdHub_(wc); keys.add(k);
            return { type: 'Feature', geometry: state.qhdFeat[wc].geometry, properties: { ward_code: wc, k, ch: Object.prototype.hasOwnProperty.call(Q.cur.wm, wc) ? 1 : 0 } };
        });
        const match = ['match', ['get', 'k']];
        Array.from(keys).filter(Boolean).forEach(k => match.push(k, hubColor_(k)));
        match.push('#a0a0a0');
        map.setPaintProperty('qhd-fill', 'fill-color', match.length > 3 ? match : '#a0a0a0');
        map.getSource('qhd-w').setData({ type: 'FeatureCollection', features: feats });
        map.getSource('qhd-sel').setData({ type: 'FeatureCollection', features: Array.from(Q.sel).filter(wc => state.qhdFeat[wc]).map(wc => ({ type: 'Feature', geometry: state.qhdFeat[wc].geometry, properties: {} })) });
        // viền BC bị ảnh hưởng + viền AM bị ảnh hưởng (theo bản nháp)
        const aff = qhdAffected_();
        const after = qhdStats_(qhdHub_, qhdPos_);
        const hb = [];
        aff.forEach(k => { const s = after[k]; if (!s) return; const u = qhdShape_(k, s.wards); if (u) hb.push(u); });
        map.getSource('qhd-hb').setData({ type: 'FeatureCollection', features: hb });
        const amSet = new Set(); aff.forEach(k => { amSet.add(qhdAm_(k)); amSet.add(qhdAmBase_(k)); });
        const am = [];
        amSet.forEach(a => {
            const ws = []; Object.values(after).forEach(s => { if (qhdAm_(s.k) === a) ws.push(...s.wards); });
            if (ws.length) { const u = qhdShape_('AM:' + a, ws); if (u) am.push(u); }
        });
        map.getSource('qhd-am').setData({ type: 'FeatureCollection', features: Q.cur.nh.length || Object.keys(Q.cur.ham).length ? am : [] });
        map.getSource('qhd-np').setData({ type: 'FeatureCollection', features: Q.cur.nh.filter(h => typeof h.lat === 'number').map(h => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [h.lng, h.lat] }, properties: { name: '★ ' + h.name, col: hubColor_(h.id) } })) });
    }
    // gọi đầu map.on('click') — trả true nếu đã xử lý
    function qhdMapClick_(e) {
        const Q = state.qhd;
        if (!Q || !Q.open || !Q.cur || !Q.canEdit) return false;
        const map = state.map;
        if (Q.place) {
            const n = qhdNew_(Q.place);
            if (n) { qhdPush_(); n.lng = e.lngLat.lng; n.lat = e.lngLat.lat; }
            Q.place = null; qhdRefresh_();
            return true;
        }
        if (!Q.pick) return false;
        const hubHits = map.queryRenderedFeatures(e.point, { layers: ['hubs-points'] });
        if (hubHits.length) {
            const k = String(hubHits[0].properties.hub_code);
            const ws = qhdAllWards_().filter(wc => qhdHub_(wc) === k);
            const allIn = ws.length && ws.every(wc => Q.sel.has(wc));
            ws.forEach(wc => { if (allIn) Q.sel.delete(wc); else Q.sel.add(wc); });
            qhdRefresh_();
            return true;
        }
        const hits = map.queryRenderedFeatures(e.point, { layers: ['wards-fill'] });
        if (hits.length) {
            const wc = String(hits[0].properties.ward_code);
            if (Q.sel.has(wc)) Q.sel.delete(wc); else Q.sel.add(wc);
            qhdRefresh_();
            return true;
        }
        return false;
    }

    // ---- lưu / mở ----
    function qhdFromData_(d) {
        const wm = {};
        Object.entries((d && d.wh) || {}).forEach(([k, arr]) => (arr || []).forEach(wc => { wm[String(wc)] = String(k); }));
        return { wm, nh: Array.isArray(d && d.nh) ? d.nh : [], ham: (d && d.ham) || {} };
    }
    function qhdToData_(c) {
        const wh = {};
        Object.entries(c.wm).forEach(([wc, k]) => { (wh[k] = wh[k] || []).push(wc); });
        return { v: 1, wh, nh: c.nh, ham: c.ham };
    }
    async function qhdLoadList_(keepId) {
        const Q = qhd_();
        Q.msg = 'Đang tải danh sách bản nháp…'; qhdPanel_();
        const r = await qhdPost_({ action: 'qhDraftList' });
        if (!r.ok) { Q.msg = qhdErr_(r); Q.loaded = true; qhdPanel_(); return; }
        Q.list = r.drafts || []; Q.canEdit = !!r.canEdit; Q.isAdmin = !!r.isAdmin; Q.who = r.who || ''; Q.me = r.me || ''; Q.loaded = true; Q.msg = '';
        if (keepId) { const d = Q.list.find(x => x.id === keepId); if (d && Q.cur) Q.cur.suaLuc = d.suaLuc; }
        qhdPanel_();
    }
    async function qhdOpenDraft_(id) {
        const Q = qhd_();
        if (Q.dirty && !(await qhConfirm_('Bản nháp đang mở có thay đổi chưa lưu. Bỏ thay đổi để mở bản khác?', 'Bỏ thay đổi', 'Chưa lưu', true))) { qhdPanel_(); return; }
        const d = Q.list.find(x => x.id === id);
        Q.sel = new Set(); Q.undo = []; Q.dirty = false; Q.place = null;
        if (!d) { Q.cur = null; qhdRefresh_(); return; }
        Q.cur = Object.assign({ id: d.id, ten: d.ten, ghiChu: d.ghiChu, suaLuc: d.suaLuc, nguoiTao: d.nguoiTao, maNguoiTao: d.maNguoiTao }, qhdFromData_(d.data));
        Q.tab = Q.canEdit ? 'edit' : 'cmp';
        qhdRefresh_();
        qhdFit_();
    }
    async function qhdNewDraft_() {
        const Q = qhd_();
        if (Q.dirty && !(await qhConfirm_('Bản nháp đang mở có thay đổi chưa lưu. Bỏ thay đổi để tạo bản mới?', 'Bỏ thay đổi', 'Chưa lưu', true))) return;
        Q.cur = { id: '', ten: 'Quy hoạch nháp ' + new Date().toLocaleDateString('vi-VN'), ghiChu: '', suaLuc: '', wm: {}, nh: [], ham: {} };
        Q.sel = new Set(); Q.undo = []; Q.dirty = true; Q.tab = 'edit'; Q.pick = true;
        qhdRefresh_();
    }
    async function qhdSave_(asNew) {
        const Q = qhd_(); if (!Q.cur) return;
        const tenEl = document.getElementById('qhd-ten'), gcEl = document.getElementById('qhd-gc');
        if (tenEl) Q.cur.ten = tenEl.value; if (gcEl) Q.cur.ghiChu = gcEl.value;
        Q.msg = 'Đang lưu…'; qhdPanel_();
        const r = await qhdPost_({ action: 'qhDraftSave', draft: { id: asNew ? '' : Q.cur.id, ten: Q.cur.ten + (asNew && Q.cur.id ? ' (bản sao)' : ''), ghiChu: Q.cur.ghiChu, suaLuc: asNew ? '' : Q.cur.suaLuc, data: qhdToData_(Q.cur) } });
        if (!r.ok) { Q.msg = qhdErr_(r) + (r.nguoiSua ? ' (' + r.nguoiSua + ')' : ''); qhdPanel_(); return; }
        if (asNew && Q.cur.id) Q.cur.ten += ' (bản sao)';
        Q.cur.id = r.id; Q.cur.suaLuc = r.suaLuc; Q.dirty = false;
        await qhdLoadList_(r.id);
        Q.msg = '✅ Đã lưu bản nháp — mọi người mở tab Bản nháp đều xem được.'; qhdPanel_();
    }
    async function qhdDelete_() {
        const Q = qhd_(); if (!Q.cur || !Q.cur.id) { Q.cur = null; Q.dirty = false; qhdRefresh_(); return; }
        if (!(await qhConfirm_('Xoá bản nháp "' + Q.cur.ten + '"?\nQuy hoạch thật không bị ảnh hưởng.', 'Xoá', 'Xoá bản nháp', true))) return;
        const r = await qhdPost_({ action: 'qhDraftDelete', id: Q.cur.id });
        if (!r.ok) { Q.msg = qhdErr_(r); qhdPanel_(); return; }
        Q.cur = null; Q.dirty = false; Q.sel = new Set();
        await qhdLoadList_();
        qhdRefresh_();
    }
    function qhdFit_() {
        const Q = qhd_(); if (!Q.cur || !state.map) return;
        const codes = Object.keys(Q.cur.wm);
        qhdAffected_().forEach(k => qhdAllWards_().forEach(wc => { if (qhdHub_(wc) === k) codes.push(wc); }));
        const fs = codes.map(wc => state.qhdFeat[wc]).filter(Boolean);
        if (!fs.length) return;
        try { const bb = turf.bbox({ type: 'FeatureCollection', features: fs }); state.map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 50, duration: 500 }); } catch (e) { /* bỏ qua */ }
    }

    // ---- giao diện ----
    async function qhdToggle_() {
        const Q = qhd_();
        if (Q.open && Q.min) { Q.min = false; qhdRefresh_(); return; }
        if (Q.open && Q.dirty && !(await qhConfirm_('Bản nháp có thay đổi chưa lưu. Vẫn đóng?', 'Đóng, bỏ thay đổi', 'Chưa lưu', true))) return;
        Q.open = !Q.open;
        if (!Q.open) { Q.cur = null; Q.dirty = false; Q.sel = new Set(); Q.place = null; }
        if (Q.open && !Q.loaded) qhdLoadList_();
        qhdRefresh_();
    }
    function qhdRefresh_() {
        const Q = qhd_();
        qhdBuildOrg_();
        qhdPanel_(); qhdRender_();
        // bộ lọc Tỉnh / AM / Bưu cục + viền khu vực chạy theo bản nháp đang mở (đóng bản nháp → về quy hoạch thật)
        if (typeof qhFillSelects_ === 'function' && state.qhOrg) { qhFillSelects_(); if (state.map && state.map.getLayer('wards-fill')) qhApply_(false); }
        const b = document.getElementById('qhd-btn');
        if (b) { b.classList.toggle('on', Q.open); b.textContent = qhdOn_() ? '📝 Đang xem nháp: ' + (Q.cur.ten || '') : '📝 Bản nháp quy hoạch'; b.title = qhdOn_() ? 'Cả bản đồ + bộ lọc Tỉnh / AM / Bưu cục đang theo bản nháp này — bấm để đóng bản nháp' : 'Bản nháp quy hoạch — thử gộp xã/phường, bưu cục, AM thành quy hoạch mới'; }
    }
    function qhdN_(n, d) { if (n == null || !isFinite(n)) return '—'; return (+n).toLocaleString('vi-VN', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }); }
    function qhdHubOptions_() {
        const keys = qhdHubKeys_().sort((a, b) => qhdName_(a).localeCompare(qhdName_(b), 'vi'));
        return keys.map(k => `<option value="${escapeHtml_(qhdName_(k))}">`).join('');
    }
    function qhdKeyByName_(name) {
        name = String(name || '').trim(); if (!name) return null;
        const keys = qhdHubKeys_();
        return keys.find(k => qhdName_(k) === name) || keys.find(k => normalizeVn_(qhdName_(k)) === normalizeVn_(name)) || keys.find(k => normalizeVn_(qhdName_(k)).includes(normalizeVn_(name))) || null;
    }
    function qhdAmList_() {
        const s = new Set(Object.values(state.qhOrg || {}).map(o => o.am));
        const c = qhd_().cur; if (c) { Object.values(c.ham).forEach(a => s.add(a)); c.nh.forEach(h => h.am && s.add(h.am)); }
        (qhd_().amNew || []).forEach(a => s.add(a));
        return Array.from(s).sort((a, b) => a.localeCompare(b, 'vi'));
    }
    function qhdChangesHtml_() {
        const c = qhd_().cur, grp = {};
        Object.entries(c.wm).forEach(([wc, k]) => { const key = qhdBase_(wc) + '→' + k; (grp[key] = grp[key] || { from: qhdBase_(wc), to: k, codes: [] }).codes.push(wc); });
        const rows = Object.values(grp).map(g => {
            const dv = g.codes.reduce((s, wc) => s + qhdWard_(wc).dv, 0);
            const names = g.codes.slice(0, 4).map(wc => qhdWard_(wc).name).join(', ') + (g.codes.length > 4 ? ` … +${g.codes.length - 4}` : '');
            return `<div class="qhd-chg"><div><b>${g.codes.length} xã/phường</b> <span class="qhd-mut">(giao ${qhdN_(dv)} đơn)</span>: ${escapeHtml_(qhdName_(g.from))} → <b>${escapeHtml_(qhdName_(g.to))}</b><div class="qhd-mut">${escapeHtml_(names)}</div></div>${qhd_().canEdit ? `<button class="qhd-x" data-rv="${escapeHtml_(g.codes.join(','))}" title="Trả các xã/phường này về bưu cục cũ">✕</button>` : ''}</div>`;
        });
        Object.entries(c.ham).forEach(([k, a]) => rows.push(`<div class="qhd-chg"><div>Bưu cục <b>${escapeHtml_(qhdName_(k))}</b>: AM ${escapeHtml_(qhdAmBase_(k))} → <b>${escapeHtml_(a)}</b></div>${qhd_().canEdit ? `<button class="qhd-x" data-rham="${escapeHtml_(k)}" title="Trả về AM cũ">✕</button>` : ''}</div>`));
        return rows.length ? rows.join('') : '<div class="qhd-mut">Chưa có thay đổi nào.</div>';
    }
    // ô "trước → sau": số sau đậm, dòng nhỏ "trước x (▲Δ)"; dir: 1 = tăng là tốt, -1 = tăng là xấu, 0 = trung tính
    function qhdCell_(b, a, d, dir) {
        const bb = b == null ? null : b, aa = a == null ? null : a;
        if (bb == null && aa == null) return '<td>—</td>';
        const diff = (aa || 0) - (bb || 0), eps = d ? 0.05 : 0.5;
        let delta = '';
        if (bb != null && aa != null && Math.abs(diff) >= eps) {
            const up = diff > 0, good = dir === 0 ? null : (dir > 0 ? up : !up);
            delta = ` <span class="${good == null ? 'qhd-neu' : good ? 'qhd-good' : 'qhd-bad'}">${up ? '▲' : '▼'}${qhdN_(Math.abs(diff), d)}</span>`;
        }
        return `<td><b>${qhdN_(aa, d)}</b><div class="qhd-sm">${bb == null ? 'mới' : 'trước ' + qhdN_(bb, d)}${delta}</div></td>`;
    }
    function qhdCmpHtml_() {
        const Q = qhd_(), c = Q.cur;
        const aff = Array.from(qhdAffected_());
        if (!aff.length) return '<div class="qhd-mut">Chưa có thay đổi để so sánh. Chọn xã/phường rồi chuyển / tạo bưu cục mới ở tab Thao tác.</div>';
        const B = qhdStats_(qhdBase_, qhdBasePos_), A = qhdStats_(qhdHub_, qhdPos_);
        const nW = Object.keys(c.wm).length;
        const dvMoved = Object.keys(c.wm).reduce((s, wc) => s + qhdWard_(wc).dv, 0);
        let h = `<div class="qhd-kpi"><span><b>${nW}</b> xã/phường đổi bưu cục</span><span><b>${qhdN_(dvMoved)}</b> đơn giao chuyển đi</span><span><b>${aff.length}</b> bưu cục bị ảnh hưởng</span><span><b>${c.nh.length}</b> bưu cục mới</span></div>`;
        const rows = aff.map(k => ({ k, b: B[k], a: A[k] })).sort((x, y) => ((y.a && y.a.dv) || 0) - ((x.a && x.a.dv) || 0));
        h += `<h4>1. Theo bưu cục</h4><div class="qhd-tw"><table class="qhd-t"><thead><tr><th>Bưu cục</th><th>AM</th><th>Xã/phường</th><th>Diện tích (km²)</th><th>Giao (đơn)</th><th>Lấy (đơn)</th><th>Nhân sự hiện có</th><th>Định biên cần</th><th>Thiếu (+) / thừa (−)</th><th>KC TB tới BC (km)</th><th>Xã xa nhất (km)</th></tr></thead><tbody>`;
        rows.forEach(r => {
            const b = r.b || null, a = r.a || null, isNew = !!qhdNew_(r.k);
            const amB = isNew ? '' : qhdAmBase_(r.k), amA = qhdAm_(r.k);
            const staff = isNew ? 0 : ((b || a || {}).staff || 0);
            const gapB = b ? b.needR - staff : null, gapA = a ? a.needR - staff : -staff;
            h += `<tr><td style="text-align:left"><a href="#" class="qh-bc-link" data-zk="${escapeHtml_(r.k)}">${isNew ? '★ ' : ''}${escapeHtml_(qhdName_(r.k))}</a>${!a ? '<div class="qhd-sm qhd-bad">không còn xã/phường</div>' : ''}</td>
                <td style="text-align:left">${amB && amB !== amA ? `<b>${escapeHtml_(amA)}</b><div class="qhd-sm">trước ${escapeHtml_(amB)}</div>` : escapeHtml_(amA)}</td>
                ${qhdCell_(b ? b.nW : (isNew ? null : 0), a ? a.nW : 0, 0, 0)}${qhdCell_(b ? b.area : (isNew ? null : 0), a ? a.area : 0, 1, 0)}
                ${qhdCell_(b ? b.dv : (isNew ? null : 0), a ? a.dv : 0, 0, 0)}${qhdCell_(b ? b.pv : (isNew ? null : 0), a ? a.pv : 0, 0, 0)}
                <td>${isNew ? '<span class="qhd-sm">chưa có</span>' : qhdN_(staff)}</td>
                ${qhdCell_(b ? b.needR : (isNew ? null : 0), a ? a.needR : 0, 0, 0)}${qhdCell_(gapB, gapA, 0, -1)}
                ${qhdCell_(b ? b.dAvg : null, a ? a.dAvg : null, 1, -1)}
                <td>${a && a.dMax ? `<b>${qhdN_(a.dMax, 1)}</b><div class="qhd-sm">${escapeHtml_(a.dMaxName)}${b && b.dMax ? ' · trước ' + qhdN_(b.dMax, 1) : ''}</div>` : '—'}</td></tr>`;
        });
        h += '</tbody></table></div>';
        // theo AM
        const amAgg = (S, amOf) => { const o = {}; Object.values(S).forEach(s => { const a = amOf(s.k); const x = o[a] || (o[a] = { nBc: 0, nW: 0, area: 0, dv: 0, pv: 0, staff: 0, need: 0 }); x.nBc++; x.nW += s.nW; x.area += s.area; x.dv += s.dv; x.pv += s.pv; x.staff += qhdNew_(s.k) ? 0 : s.staff; x.need += s.needR; }); return o; };
        const amB = amAgg(B, qhdAmBase_), amA = amAgg(A, qhdAm_);
        const ams = new Set(); aff.forEach(k => { if (!qhdNew_(k)) ams.add(qhdAmBase_(k)); ams.add(qhdAm_(k)); });
        h += `<h4>2. Theo AM / quy hoạch</h4><div class="qhd-tw"><table class="qhd-t"><thead><tr><th>AM</th><th>Số bưu cục</th><th>Xã/phường</th><th>Diện tích (km²)</th><th>Giao (đơn)</th><th>Lấy (đơn)</th><th>Nhân sự hiện có</th><th>Định biên cần</th></tr></thead><tbody>`;
        Array.from(ams).sort((x, y) => x.localeCompare(y, 'vi')).forEach(a => {
            const b = amB[a] || null, x = amA[a] || null;
            h += `<tr><td style="text-align:left">${escapeHtml_(a)}${!b ? ' <span class="qhd-sm qhd-good">mới</span>' : ''}</td>${qhdCell_(b ? b.nBc : null, x ? x.nBc : 0, 0, 0)}${qhdCell_(b ? b.nW : null, x ? x.nW : 0, 0, 0)}${qhdCell_(b ? b.area : null, x ? x.area : 0, 1, 0)}${qhdCell_(b ? b.dv : null, x ? x.dv : 0, 0, 0)}${qhdCell_(b ? b.pv : null, x ? x.pv : 0, 0, 0)}${qhdCell_(b ? b.staff : null, x ? x.staff : 0, 0, 0)}${qhdCell_(b ? b.need : null, x ? x.need : 0, 0, 0)}</tr>`;
        });
        h += '</tbody></table></div>';
        h += `<div class="qhd-note">Số giao/lấy là sản lượng theo dữ liệu quy hoạch của từng xã/phường. Định biên cần = Σ đơn giao xã/phường ÷ năng lực ổn định 1 người (${THRESHOLDS_.giaoXa.yellowMin} đơn xã · ${THRESHOLDS_.giaoPhuong.yellowMin} đơn phường), làm tròn lên. Nhân sự hiện có giữ nguyên theo bưu cục cũ (chưa tính điều chuyển người). Khoảng cách = đường chim bay từ bưu cục tới tâm xã/phường; KC TB tính theo trọng số đơn giao. Bưu cục mới đặt ở trọng tâm sản lượng — bấm "📍 Vị trí" để đặt lại.</div>`;
        return h;
    }
    function qhdPanel_() {
        const wrap = document.getElementById('ghn-tg-map-wrap');
        const Q = qhd_();
        let el = document.getElementById('qhd-panel');
        if (!Q.open) { if (el) el.remove(); return; }
        if (!wrap) return;
        if (!el) { el = document.createElement('div'); el.id = 'qhd-panel'; wrap.appendChild(el); }
        const c = Q.cur, E = Q.canEdit;
        const opts = Q.list.map(d => `<option value="${escapeHtml_(d.id)}"${c && c.id === d.id ? ' selected' : ''}>${escapeHtml_(d.ten)} · ${escapeHtml_(d.nguoiSua || d.nguoiTao)}</option>`).join('');
        if (Q.min && c) {
            el.innerHTML = `<div class="qhd-hd"><b>📝 Đang xem bản nháp: ${escapeHtml_(c.ten)}</b><span><button class="qhd-x" id="qhd-max" title="Mở lại bảng bản nháp">▢</button><button class="qhd-x" id="qhd-close" title="Đóng bản nháp — bản đồ về quy hoạch thật">✕</button></span></div><div class="qhd-mut">Cả bản đồ và bộ lọc Tỉnh / AM / Bưu cục đang theo bản nháp này${Q.dirty ? ' · <b style="color:#e8590c">chưa lưu</b>' : ''}.</div>`;
            el.classList.add('min'); el.classList.remove('wide');
            qhdWire_(el);
            return;
        }
        el.classList.remove('min');
        let h = `<div class="qhd-hd"><b>📝 Bản nháp quy hoạch</b><span>${c ? '<button class="qhd-x" id="qhd-min" title="Thu nhỏ bảng để xem cả bản đồ theo bản nháp">—</button>' : ''}<button class="qhd-x" id="qhd-close" title="Đóng — bản đồ trở về quy hoạch thật">✕</button></span></div>
            <div class="qhd-mut" style="margin-bottom:6px">Thử gộp xã/phường, bưu cục, AM mà không đụng tới quy hoạch thật.${E ? '' : (Q.loaded ? ' <b>Bạn chỉ xem được</b> — Admin / Quản lý mới được tạo, sửa.' : '')}</div>
            <div class="qhd-row"><select id="qhd-list"><option value="">${Q.list.length ? '— Chọn bản nháp đã lưu (' + Q.list.length + ') —' : '— Chưa có bản nháp đã lưu —'}</option>${opts}${c && !c.id ? '<option value="__new" selected>(bản nháp mới — chưa lưu)</option>' : ''}</select>${E ? '<button id="qhd-new" class="qhd-b">＋ Tạo mới</button>' : ''}</div>`;
        if (Q.msg) h += `<div class="qhd-msg">${escapeHtml_(Q.msg)}</div>`;
        if (c) {
            h += `<div class="qhd-row"><input id="qhd-ten" value="${escapeHtml_(c.ten)}" placeholder="Tên bản nháp" ${E ? '' : 'readonly'}>${Q.dirty ? '<span class="qhd-dirty" title="Có thay đổi chưa lưu">● chưa lưu</span>' : ''}</div>
                <textarea id="qhd-gc" rows="2" placeholder="Ghi chú / lý do quy hoạch…" ${E ? '' : 'readonly'}>${escapeHtml_(c.ghiChu || '')}</textarea>
                ${c.nguoiTao ? `<div class="qhd-mut">Tạo bởi ${escapeHtml_(c.nguoiTao)}${c.suaLuc ? ' · sửa lúc ' + escapeHtml_(new Date(c.suaLuc).toLocaleString('vi-VN')) : ''}</div>` : ''}
                ${E ? `<div class="qhd-row"><button id="qhd-save" class="qhd-b pri">💾 Lưu</button>${c.id ? '<button id="qhd-saveas" class="qhd-b">Lưu thành bản mới</button>' : ''}<button id="qhd-undo" class="qhd-b" ${Q.undo.length ? '' : 'disabled'}>↶ Hoàn tác</button><button id="qhd-del" class="qhd-b red">🗑 ${c.id ? 'Xoá' : 'Bỏ'}</button></div>` : ''}
                <div class="qhd-tabs">${E ? `<button data-tab="edit" class="${Q.tab === 'edit' ? 'on' : ''}">✏️ Thao tác</button>` : ''}<button data-tab="cmp" class="${Q.tab === 'cmp' || !E ? 'on' : ''}">📊 So sánh trước → sau</button></div>`;
            if (E && Q.tab === 'edit') {
                const selArr = Array.from(Q.sel);
                const sDv = selArr.reduce((s, wc) => s + qhdWard_(wc).dv, 0), sPv = selArr.reduce((s, wc) => s + qhdWard_(wc).pv, 0);
                const fromHubs = Array.from(new Set(selArr.map(qhdHub_))).map(qhdName_);
                h += `<datalist id="qhd-hubs-dl">${qhdHubOptions_()}</datalist><datalist id="qhd-am-dl">${qhdAmList_().map(a => `<option value="${escapeHtml_(a)}">`).join('')}</datalist>
                    <div class="qhd-sec"><div class="qhd-st">1. Chọn xã/phường</div>
                    <label class="qhd-chk"><input type="checkbox" id="qhd-pick" ${Q.pick ? 'checked' : ''}> Bấm bản đồ để chọn / bỏ chọn xã/phường (bấm chấm bưu cục = chọn cả bưu cục)</label>
                    <div class="qhd-row"><input id="qhd-addhub" list="qhd-hubs-dl" placeholder="Thêm cả 1 bưu cục…"><button id="qhd-addhub-b" class="qhd-b">＋</button><button id="qhd-addflt" class="qhd-b" title="Thêm mọi xã/phường của Tỉnh / AM / Bưu cục đang lọc trên thanh công cụ">＋ Vùng đang lọc</button></div>
                    <div class="qhd-selbox">${selArr.length ? `Đang chọn <b>${selArr.length}</b> xã/phường · giao <b>${qhdN_(sDv)}</b> · lấy <b>${qhdN_(sPv)}</b> đơn<div class="qhd-mut">Thuộc: ${escapeHtml_(fromHubs.slice(0, 6).join(', '))}${fromHubs.length > 6 ? ' …' : ''}</div><div class="qhd-mut">${escapeHtml_(selArr.slice(0, 10).map(wc => qhdWard_(wc).name).join(', '))}${selArr.length > 10 ? ' …' : ''}</div><button id="qhd-selclr" class="qhd-lnk">Bỏ chọn hết</button>` : '<span class="qhd-mut">Chưa chọn xã/phường nào.</span>'}</div></div>
                    <div class="qhd-sec"><div class="qhd-st">2. Gộp vùng đang chọn</div>
                    <div class="qhd-row"><input id="qhd-to" list="qhd-hubs-dl" placeholder="Bưu cục nhận (có sẵn hoặc bưu cục mới)…"><button id="qhd-move" class="qhd-b pri" ${selArr.length ? '' : 'disabled'}>Gộp vào bưu cục</button></div>
                    <div class="qhd-row"><input id="qhd-newname" placeholder="Tên bưu cục mới, vd (THN) Phú Bình 3"></div>
                    <div class="qhd-row"><input id="qhd-newam" list="qhd-am-dl" placeholder="AM quản lý (chọn AM có sẵn)…"><button id="qhd-newam-add" class="qhd-b" title="AM chưa có trong cơ cấu — nhập ID + họ tên">＋ AM mới</button><button id="qhd-mknew" class="qhd-b pri" ${selArr.length ? '' : 'disabled'}>Tạo bưu cục mới</button></div>
                    <div class="qhd-mut">Để trống ô AM = tự lấy AM có nhiều đơn giao nhất trong vùng chọn.</div>
                    <div class="qhd-row"><button id="qhd-revert" class="qhd-b" ${selArr.some(wc => Object.prototype.hasOwnProperty.call(c.wm, wc)) ? '' : 'disabled'}>↩ Trả vùng chọn về bưu cục cũ</button></div></div>
                    <div class="qhd-sec"><div class="qhd-st">3. Gộp bưu cục cho 1 AM / quy hoạch mới</div>
                    <div class="qhd-row"><input id="qhd-amhub" list="qhd-hubs-dl" placeholder="Thêm bưu cục…"><button id="qhd-amhub-b" class="qhd-b">＋</button><button id="qhd-amflt" class="qhd-b" title="Thêm các bưu cục đang lọc trên thanh công cụ">＋ BC đang lọc</button></div>
                    <div class="qhd-chips">${Q.amChips.map(k => `<span class="qhd-chip">${escapeHtml_(qhdName_(k))}<button data-unchip="${escapeHtml_(k)}">×</button></span>`).join('') || '<span class="qhd-mut">Chưa chọn bưu cục.</span>'}</div>
                    <div class="qhd-row"><input id="qhd-amname" list="qhd-am-dl" placeholder="Chọn AM có sẵn…"><button id="qhd-amname-add" class="qhd-b" title="AM chưa có trong cơ cấu — nhập ID + họ tên">＋ AM mới</button><button id="qhd-setam" class="qhd-b pri" ${Q.amChips.length ? '' : 'disabled'}>Gán cho AM</button></div></div>`;
                if (c.nh.length) {
                    h += `<div class="qhd-sec"><div class="qhd-st">Bưu cục mới trong bản nháp</div>${c.nh.map(n => {
                        const nW = Object.values(c.wm).filter(k => k === n.id).length;
                        return `<div class="qhd-nh"><span class="qhd-dot" style="border-color:${hubColor_(n.id)}"></span><input data-nhname="${escapeHtml_(n.id)}" value="${escapeHtml_(n.name)}" title="Tên bưu cục mới"><span class="qhd-mut">${nW} xã</span><input data-nham="${escapeHtml_(n.id)}" list="qhd-am-dl" value="${escapeHtml_(n.am || '')}" placeholder="AM…" title="AM quản lý — chọn AM có sẵn" class="qhd-nham"><button class="qhd-b" data-nhamnew="${escapeHtml_(n.id)}" title="AM chưa có trong cơ cấu — nhập ID + họ tên">＋ AM mới</button><button class="qhd-b" data-place="${escapeHtml_(n.id)}" title="Bấm rồi bấm 1 điểm trên bản đồ để đặt vị trí bưu cục">${Q.place === n.id ? '👉 Bấm bản đồ…' : '📍 Vị trí'}</button><button class="qhd-x" data-delnh="${escapeHtml_(n.id)}" title="Xoá bưu cục mới (xã/phường về bưu cục cũ)">✕</button></div>`;
                    }).join('')}</div>`;
                }
                h += `<div class="qhd-sec"><div class="qhd-st">Các thay đổi</div>${qhdChangesHtml_()}</div>`;
            } else {
                h += `<div class="qhd-sec"><div class="qhd-st">Các thay đổi</div>${qhdChangesHtml_()}</div>` + qhdCmpHtml_();
            }
            h += `<div class="qhd-legend"><span><i style="background:#c92a2a"></i>viền đỏ đứt = xã/phường đổi bưu cục</span><span><i style="background:#1f2a44"></i>ranh giới bưu cục mới</span><span><i style="background:#7048e8"></i>ranh giới AM mới</span><span><i style="background:#ffd43b"></i>đang chọn</span></div>`;
        } else if (Q.loaded) {
            h += `<div class="qhd-mut" style="margin-top:8px">${E ? 'Chọn 1 bản nháp đã lưu để xem / sửa, hoặc bấm <b>＋ Tạo mới</b>.' : 'Chọn 1 bản nháp đã lưu để xem.'}</div>`;
        }
        el.innerHTML = h;
        el.classList.toggle('wide', !!(c && (Q.tab === 'cmp' || !E)));
        qhdWire_(el);
    }
    function qhdFltWards_() {
        const set = typeof qhSelectedHubs_ === 'function' ? qhSelectedHubs_() : null;
        if (!set) return [];
        const s = new Set(set);
        return qhdAllWards_().filter(wc => s.has(qhdBase_(wc)));
    }
    function qhdWire_(el) {
        const Q = qhd_(), $ = id => el.querySelector('#' + id);
        const on = (id, ev, fn) => { const x = $(id); if (x) x.addEventListener(ev, fn); };
        on('qhd-close', 'click', async () => { if (Q.dirty && !(await qhConfirm_('Bản nháp có thay đổi chưa lưu. Vẫn đóng?', 'Đóng, bỏ thay đổi', 'Chưa lưu', true))) return; Q.open = false; Q.min = false; Q.cur = null; Q.dirty = false; Q.sel = new Set(); Q.place = null; qhdRefresh_(); });
        on('qhd-min', 'click', () => { Q.min = true; qhdPanel_(); });
        on('qhd-max', 'click', () => { Q.min = false; qhdPanel_(); });
        on('qhd-list', 'change', (e) => { const v = e.target.value; if (v === '__new') return; qhdOpenDraft_(v); });
        on('qhd-new', 'click', qhdNewDraft_);
        on('qhd-save', 'click', () => qhdSave_(false));
        on('qhd-saveas', 'click', () => qhdSave_(true));
        on('qhd-del', 'click', qhdDelete_);
        on('qhd-undo', 'click', qhdUndo_);
        on('qhd-ten', 'input', (e) => { if (Q.cur) { Q.cur.ten = e.target.value; Q.dirty = true; } });
        on('qhd-gc', 'input', (e) => { if (Q.cur) { Q.cur.ghiChu = e.target.value; Q.dirty = true; } });
        el.querySelectorAll('.qhd-tabs button').forEach(b => b.addEventListener('click', () => { Q.tab = b.dataset.tab; qhdPanel_(); }));
        on('qhd-pick', 'change', (e) => { Q.pick = e.target.checked; });
        const addHub = (inpId) => { const inp = $(inpId); const k = qhdKeyByName_(inp && inp.value); if (!k) { if (inp) inp.style.borderColor = '#c92a2a'; return null; } return k; };
        on('qhd-addhub-b', 'click', () => { const k = addHub('qhd-addhub'); if (!k) return; qhdAllWards_().forEach(wc => { if (qhdHub_(wc) === k) Q.sel.add(wc); }); qhdRefresh_(); });
        on('qhd-addhub', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('qhd-addhub-b').click(); } });
        on('qhd-addflt', 'click', () => { const ws = qhdFltWards_(); if (!ws.length) { Q.msg = 'Chưa lọc Tỉnh / AM / Bưu cục trên thanh công cụ.'; qhdPanel_(); return; } ws.forEach(wc => Q.sel.add(wc)); Q.msg = ''; qhdRefresh_(); });
        on('qhd-selclr', 'click', () => { Q.sel = new Set(); qhdRefresh_(); });
        on('qhd-move', 'click', () => { const k = addHub('qhd-to'); if (!k) return; qhdAssign_(Array.from(Q.sel), k); Q.sel = new Set(); Q.msg = ''; qhdRefresh_(); });
        on('qhd-mknew', 'click', () => { const nm = ($('qhd-newname') || {}).value; const id = qhdNewHub_(nm, Array.from(Q.sel), ($('qhd-newam') || {}).value); if (id) { Q.sel = new Set(); Q.msg = ''; qhdRefresh_(); } });
        on('qhd-revert', 'click', () => { qhdRevert_(Array.from(Q.sel)); Q.sel = new Set(); qhdRefresh_(); });
        on('qhd-amhub-b', 'click', () => { const k = addHub('qhd-amhub'); if (!k) return; if (!Q.amChips.includes(k)) Q.amChips.push(k); qhdPanel_(); });
        on('qhd-amhub', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('qhd-amhub-b').click(); } });
        on('qhd-amflt', 'click', () => { const set = typeof qhSelectedHubs_ === 'function' ? qhSelectedHubs_() : null; if (!set) { Q.msg = 'Chưa lọc Tỉnh / AM / Bưu cục trên thanh công cụ.'; qhdPanel_(); return; } set.forEach(k => { if (!Q.amChips.includes(k)) Q.amChips.push(k); }); Q.msg = ''; qhdPanel_(); });
        el.querySelectorAll('[data-unchip]').forEach(b => b.addEventListener('click', () => { Q.amChips = Q.amChips.filter(k => k !== b.dataset.unchip); qhdPanel_(); }));
        on('qhd-setam', 'click', () => { const am = ($('qhd-amname') || {}).value; if (!String(am || '').trim()) { $('qhd-amname').style.borderColor = '#c92a2a'; return; } qhdSetAm_(Q.amChips.slice(), am); Q.amChips = []; qhdRefresh_(); });
        el.querySelectorAll('[data-nhname]').forEach(inp => inp.addEventListener('change', () => { const n = qhdNew_(inp.dataset.nhname); if (n && inp.value.trim()) { qhdPush_(); n.name = inp.value.trim(); qhdRefresh_(); } }));
        on('qhd-newam-add', 'click', async () => { const a = await qhdNewAm_(); if (a) { qhdPanel_(); const i = document.getElementById('qhd-newam'); if (i) i.value = a; } });
        on('qhd-amname-add', 'click', async () => { const a = await qhdNewAm_(); if (a) { const keep = ($('qhd-newname') || {}).value; qhdPanel_(); const i = document.getElementById('qhd-amname'); if (i) i.value = a; const nn = document.getElementById('qhd-newname'); if (nn && keep) nn.value = keep; } });
        el.querySelectorAll('[data-nhamnew]').forEach(b => b.addEventListener('click', async () => { const a = await qhdNewAm_(); const n = qhdNew_(b.dataset.nhamnew); if (a && n) { qhdPush_(); n.am = a; qhdRefresh_(); } }));
        el.querySelectorAll('[data-nham]').forEach(inp => inp.addEventListener('change', () => { const n = qhdNew_(inp.dataset.nham); const v = inp.value.trim(); if (n && v && v !== n.am) { qhdPush_(); n.am = v; qhdRefresh_(); } }));
        el.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => { Q.place = Q.place === b.dataset.place ? null : b.dataset.place; qhdPanel_(); }));
        el.querySelectorAll('[data-delnh]').forEach(b => b.addEventListener('click', async () => { if (await qhConfirm_('Xoá bưu cục mới này?\nCác xã/phường của nó về lại bưu cục cũ.', 'Xoá', 'Xoá bưu cục mới', true)) { qhdDelNew_(b.dataset.delnh); qhdRefresh_(); } }));
        el.querySelectorAll('[data-rv]').forEach(b => b.addEventListener('click', () => { qhdRevert_(b.dataset.rv.split(',')); qhdRefresh_(); }));
        el.querySelectorAll('[data-rham]').forEach(b => b.addEventListener('click', () => { const c = Q.cur; qhdPush_(); delete c.ham[b.dataset.rham]; qhdRefresh_(); }));
        el.querySelectorAll('[data-zk]').forEach(a => a.addEventListener('click', (e) => {
            e.preventDefault();
            const k = a.dataset.zk, fs = qhdAllWards_().filter(wc => qhdHub_(wc) === k || qhdBase_(wc) === k).map(wc => state.qhdFeat[wc]);
            if (fs.length && state.map) { try { const bb = turf.bbox({ type: 'FeatureCollection', features: fs }); state.map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 50, duration: 500 }); } catch (err) { /* bỏ qua */ } }
        }));
    }
    function qhdAfterLoad_() {
        state.qhdFeatSrc = null;
        const Q = state.qhd;
        if (Q && Q.open) { if (state.map && state.map.getLayer('wards-fill')) qhdRefresh_(); else if (state.map) state.map.once('idle', qhdRefresh_); }
    }

    function init_() {
        injectBaseStyles_();
        createLauncherButton_();
    }

    // v1.7.30 — @match quyhoachbuucuc.info chỉ để GM_cookie được phép đọc phiên; trên trang đó không làm gì
    if (location.hostname.indexOf('quyhoachbuucuc.info') !== -1) {
        // v1.7.31 — đang mở trang quyhoachbuucuc.info: nếu đọc được phiên ngay trên trang thì gửi luôn cho web báo cáo
        try {
            if (document.cookie && /=/.test(document.cookie) && typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({ method: 'POST', url: 'https://baocaovanhanh.vercel.app/api/gas', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    data: JSON.stringify({ action: 'qhSaveSid', cookie: document.cookie, by: 'trang quyhoachbuucuc.info' }),
                    onload: r => console.log('[Tuyến Giao] Gửi phiên quyhoach (từ trang quyhoach) cho web báo cáo:', r.responseText) });
            }
        } catch (e) { /* bỏ qua */ }
        return;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init_);
    } else {
        init_();
    }
})();