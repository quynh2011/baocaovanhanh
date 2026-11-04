# CLAUDE.md — Ghi chú bàn giao dự án "Báo Cáo Vận Hành GHN (DBB)"

> File này để BẤT KỲ tài khoản Claude nào mở repo cũng nắm được ngay dự án và làm tiếp.
> **Quy tắc:** mỗi lần sửa code xong, cập nhật mục "Nhật ký thay đổi" ở cuối file (ngày, việc gì, file nào).

## 1. Thông tin chung
- Chủ dự án: Phạm Văn Quỳnh (quynhpv1@ghn.vn) — Vùng DBB (Đông Bắc), GHN.
- Web: https://baocaovanhanh.vercel.app/  · Vercel project: `dbb-giaohangnhanh/baocaovanhanh`
- GitHub: https://github.com/quynh2011/baocaovanhanh (nhánh `main`, push là Vercel tự deploy)
- Sheet dữ liệu chính (SHEET_ID): `1j3KarXqurcP0GxPE3A4qSxVXs2nfkUM87QscsY5_DtU`
- Sheet Kế hoạch KD / BCKQKD / Event (KEHOACH_SHEET_ID): `1HxAQ6aUAqvme6ixsiSr-QmvjSLLBPnl2TQkLadQyjvk` · thư mục Drive ảnh: `1fmIbxoMYUzxVobE8aLPDXzohpXlFy45n`
- Sheet Đối soát vận tải (RECON_SHEET_ID): `1cuj2EuZfuglithQCCknx1tMl6Uwl14GtWnPBlDSLv8Y`
- Người dùng giao tiếp bằng tiếng Việt, xưng "tao/mày" — trả lời tiếng Việt, ngắn gọn.

## 2. Kiến trúc
```
Trình duyệt ──POST /api/gas {action, token,...}──> Vercel function api/gas.js
                                                   ├─ action có trong LOCAL_ACTIONS → gọi THẲNG Google Sheets/Gmail/Drive API
                                                   │    (api/_sheetsClient.js, api/_reconClient.js) bằng OAuth refresh token của quynhpv1@ghn.vn
                                                   └─ action chưa port → forward sang Apps Script (Code.gs) — ĐANG HỎNG
```
- Apps Script bị chặn vì deployment chỉ cho "Anyone within GHN" (không nhận token server-to-server) → **mọi tính năng mới phải viết trong `api/_sheetsClient.js` và đăng ký vào `LOCAL_ACTIONS` trong `api/gas.js`.** Không dựa vào Code.gs nữa (Code.gs chỉ để tham khảo logic gốc).
- 3 nguyên tắc của proxy: không nhận URL đích từ client; luôn trả JSON; không đụng Code.gs/Apps Script.
- `vercel.json`: `/` và `/index.html` → `bao_cao_van_hanh_live.html`; `api/gas.js` maxDuration 60s.

### Biến môi trường Vercel
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` (scope spreadsheets + gmail.send + drive), `SESSION_SECRET` (ký token phiên HMAC), `GEMINI_API_KEY` (AI tổng hợp BCKQKD, tuỳ chọn), `GAS_URL` (nhánh Apps Script cũ, tuỳ chọn).
`api/oauth-callback.js` = endpoint dùng 1 lần để lấy lại refresh token khi cần.

## 3. Các file
| File | Vai trò |
|---|---|
| `bao_cao_van_hanh_live.html` (~7.400 dòng, 1 file gồm CSS + HTML + JS `<script id="mainScript">`) | Web chính: đăng nhập, menu DBB, mọi section |
| `lapday_view.html` | Trang "Tỷ lệ lấp đầy thùng xe", nhúng bằng iframe `lapDayFrame?t=<token>` |
| `doi_soat_van_tai.html/.js/.css` | Trang "Đối soát vận tải NCC–GHN", nhúng iframe `dsvtFrame`, token qua localStorage `doisoat_token` |
| `api/gas.js` | Router action (LOCAL_ACTIONS) + fallback Apps Script |
| `api/_sheetsClient.js` | Toàn bộ backend Node: auth, báo cáo, cấu hình, Kế hoạch KD, BCKQKD, Event, online, Lấp đầy, RPLD |
| `api/_reconClient.js` | Đối soát vận tải: `getReconData`, `syncTongHop` (gộp sheet `GHN_*` → `Tổng hợp`, khớp theo Mã chuyến) |
| `Code.gs` | Apps Script cũ — chỉ tham khảo |

## 4. Đăng nhập & phân quyền
- Sheet `Main` (cột 1..16): Email, HoTen, Hash, Salt, Active, VaiTro, NgayTao, DangNhapGanNhat, SoLanSai, KhoaDenLuc, OTP, OTPHetHan, GhiChu, Quyen_TaiHTML, Quyen_Copy, Quyen_ChupManHinh.
- Chỉ email `@ghn.vn`; mật khẩu sha256(password + ':' + salt); sai 5 lần khoá 15 phút; token HMAC hết hạn 24h → xác thực lại bằng OTP gửi Gmail (hiệu lực 60s).
- Phiên lưu localStorage `ghn_report_session_v1`; email gần nhất `ghn_report_last_email_v1`.
- 4 vai trò: Admin / Quản lý / Nhân viên xử lý / Nhân viên. Bật/tắt từng hạng mục ở sheet `CauHinhHangMuc` (MODULE_DEFS phải KHỚP giữa `_sheetsClient.js` và `window.MODULE_DEFS` trong HTML; nút DOM map ở `window.MODULE_DOM_MAP`).
- Non-Admin không có quyền: chặn copy/chuột phải/F12/Ctrl+P, watermark tên+email; nút "Xuất file HTML" chỉ hiện khi Admin hoặc có quyền Tải HTML.
- Sheet `OnlineUsers`: heartbeat 25s, TTL 90s → thanh avatar người đang xem.

## 5. Các section (menu nút tròn DBB, `switchSection(id)`)
| Section | Trạng thái | Nguồn dữ liệu |
|---|---|---|
| 📊 Vận hành › Tuần | Chạy | `getReportData` — 13 tab `01_Scorecard`…`13_KTC_Ton24H` (+ `21_..24_KD_*`, `31..33_FC_*` cùng lượt). Render: `main()` → `window.RAW_VH_DATA` → `renderVanHanhReport()`; chọn kỳ xem lại `setVHCutoff`. Chỉ số dạng vol+pct khai báo ở `METRIC_META` (thêm chỉ số mới = thêm 1 dòng). Ghi chú từng mục ở `NOTES`. |
| Vận hành › Ngày | Chạy (2026-11-03) | `getDailyReport` — tự đọc MỌI sheet có mã 3 số **100 → 200** ở đầu tên (`/^(1\d\d|200)_/`). Hiện có: 100_Capacity, 101_ReportGTC, 102_ReportGTCtheoloaihang, 103_ReportGan, 104_Aging, 105_Tiktok Shop, 106_BaocaoGan, 107_Luanchuyen, 108_Tyletrahang. SỐ THỨ TỰ SHEET CÓ THỂ ĐỔI — code không dựa vào số. Xem mục 5b. |
| Vận hành › Tháng | Placeholder "sắp ra mắt" | — |
| Vận hành › **[S]-Report** (Siêu báo cáo live) | Chạy (2026-11-04) | Nhúng NGUYÊN file `bao-cao-bc-TNT-YYYY-MM-DD.html` mới nhất (hôm nay N → file N-1) từ folder Drive `1PY10hBt2V93tfUPPNyNPg4h-e8JDBPB_`. Luồng: Apps Script **"[S]-Report — Tự lấy Siêu báo cáo"** (code `apps_script/SReport.gs`, project `1onjjLbkT9k8gA_2mQTfo5MaYZef8CP9CzM1Qp38tu5aJGkm_iNS17uZR`, trigger mỗi giờ, chạy dưới quynhpv1@ghn.vn) chép file vào Google Sheet `1He6ycTpoJMFr1fHGMEYuV0YmyH_Y5Id_3BfeBw7BQoU` (tab SR_Meta, SR_Html = đoạn 40.000 ký tự có tiền tố "~", SR_Log) → backend `handleGetSReport` (trả THEO PHẦN 30 đoạn/phần vì Vercel giới hạn body ~4,5MB) → `loadSReport` ghép lại, hiện trong iframe `sandbox` (không allow-same-origin; có shim localStorage). Lý do đi qua Sheet: token OAuth backend chỉ có scope `spreadsheets` + `gmail.send` (KHÔNG có Drive — GET /api/gas hiện `scopes`). Module id `vh_sreport`. |
| 💰 Kinh doanh › Tuần | Chạy | `21_KD_HangNangNhe`, `22_KD_HangNang`, `23_KD_HangNhe`, `24_KD_BanMoi`, `24_KD_BanMoiAM` (`loadKinhDoanh`, `KD_TABS`) |
| Kinh doanh › Kế hoạch KD | Chạy | KEHOACH sheet: `Kehoach/Ketqua/Tiendo` (6 tab con `switchKHTab`) |
| Kinh doanh › Báo Cáo Kết Quả KD | Chạy | `BCKQKD_Config/Periods/Submissions/Aggregate`, AI Gemini `gemini-2.5-flash` |
| 🎯 Kế hoạch Event | Chạy | Forecast `31_FC_Lay/32_FC_Giao/33_FC_KTC` + `EVENT_Config/Periods/Submissions` |
| 🚛 Tỷ lệ lấp đầy | Chạy (iframe) | `getLapDayData` ← sheet `61_LapDayNew` (32 cột A..AF); `getRPLapDayData` ← `62_RPlapday` (đọc cả màu ô/merge/bold để tách bảng) |
| 🚚 Đối soát vận tải | Chạy (iframe) | RECON sheet: `Main`, `Tổng hợp`, `GHN_*` |
| 🗓️ Lịch làm việc | **Hỏng** — action chưa port (getTasks, createTask, updateTaskStatus, deleteTask, getAssignableUsers, get/save/deleteCalendarConfig, getCalendarEvents) |
| Truy thu / Capacity / Nhân sự / Sắp ra mắt | Placeholder | — |

### 5b. Vận hành › Ngày — cách hoạt động (code trong `bao_cao_van_hanh_live.html`, khối "VẬN HÀNH › NGÀY", hàm tiền tố `dn`)
- **Quy tắc sheet** (do chủ dự án đặt): các bảng trong 1 sheet cách nhau bởi 1 HÀNG TIÊU ĐỀ GỘP (chỉ ô cột A có chữ). Thêm cột / thêm dòng / thêm sheet mã 100→200 đều PHẢI tự nhận vào báo cáo — không hard-code vị trí cột/số sheet.
- `dnParseSheet` tự hiểu: header 1 hoặc nhiều tầng (hàng nhóm cột gộp ở trên/dưới hàng header chính, ô gộp trống tự lan sang phải → `col.group`); dòng số nằm TRÊN header (vd dòng tổng + giờ cập nhật đầu sheet Capacity) → thành dòng tổng; nhãn "…cập nhật lúc hh:mm dd/mm/yyyy" → tách ra `block.stamp`.
- `dnAnalyzeBlock`: cột chữ ở đầu (+ cột "ID…") = chiều; chiều cuối không phải ID = khoá (Tỉnh/AM/Bưu cục); bảng ghi header "Tỉnh|AM" nhưng dữ liệu là "(XXX) Bưu cục" → tự đổi thành AM|Bưu cục. Cột ngày `dd/mm` hoặc `dd/mm/yyyy` → bảng theo ngày; `2026/45` → tuần; "Diff"/"vs"/"so với" → chênh lệch; cột chữ giữa/cuối (vd "Nhóm 1 – An toàn") → `kind:'text'`, đếm theo nhóm.
- Hướng tốt/xấu `dnDir` (xét tên cột → nhóm cột → tiêu đề bảng → tên sheet): GTC/Gán/ODR/OPR/hiệu suất cao là tốt; FD/tồn/aging/rớt/chưa LC/trả hàng/cảnh báo thấp là tốt; sản lượng/đơn tạo/nhân sự trung tính.
- `dnPickKey` chọn CHỈ SỐ CHÍNH mỗi bảng (bảng ngày → ngày mới nhất; bảng thường → cột % có hướng, ưu tiên "N-1"; không có % → "Tổng…"/"Aging >…") + cột chênh lệch tương ứng + target (`DAY_TARGET_RULES` + `dnTargetFor`/`dnTg`: GTC 67%, GTC hàng mới 85% / tồn 60%, Gán 95%, ODR TTS 96%, OPR TTS 80%, Trả hàng tất cả 7% / SME COD 7% / TTS COD 5%, Aging = 0 đơn (chỉ xét mức Vùng), Rớt LC & chưa LC ≤2% (chỉ hiển thị vì cột là số đơn)).
- **Bố cục V2 (theo mẫu báo cáo chuyên gia, 2026-11-03)** — `renderVanHanhNgay`: I Tổng quan (Bảng tín hiệu `dnSignalHtml` 1 dòng/chỉ số, Điểm nóng `dnHotspotHtml` = AM/BC kém nhiều chỉ số, Bảng điểm AM đóng sẵn) → II Giao hàng (GTC chuyên sâu + các bảng giao khác) → III Trả hàng → IV Backlog & luân chuyển → V Lấy hàng → VI Khác → VII Tham khảo (bảng gốc từng sheet đóng sẵn + định nghĩa). Bảng tự xếp vào phần theo `dnDomainOf` (từ khoá tiêu đề/tên sheet).
- Mỗi chỉ số = `dnMetricItemHtml`: định nghĩa (`DAY_DEFS`) → biểu đồ Vùng + panel N-1 (bảng theo ngày) → nhận xét → **chỉ ngoại lệ** `dnExceptionsHtml` (AM/BC kém, 6 dòng + "Hiện thêm", cột "Bưu cục kém nhất của AM" lấy từ bảng BC/TOP đi ngay sau trong cùng sheet, cột "Chỉ số khác cũng kém" nối mọi sheet theo tên) → "▸ Mở bảng đầy đủ".
- Nối dữ liệu: `dnBuildLinks` gom mọi chỉ số theo tên AM/BC; `dnStatus` (kém/bình thường/tốt so target → mức Vùng (%) → TB mỗi AM/BC (số đơn, kém = cao hơn 30%)); `dnUniqBad` bỏ trùng; bấm tên AM/BC → `dnOpenEntity` mở hồ sơ (drawer) gom mọi chỉ số; ô tìm kiếm AM/BC ở mục lục.
- (Hàm cũ `dnSheetSectionHtml`, `dnPanoramaHtml` còn trong code nhưng không dùng nữa.)
- Phân tích GTC chuyên sâu (`dnBuildModel`) dò cột theo TÊN: "% GTC N-1", "Hàng mới N-1", bảng ngày có tiêu đề GTC/Gán/hàng mới/tồn. Tên sheet hiển thị: `DAY_SHEET_NAMES` (dò theo tên, không theo số).
- Sheet mới: tự có mục riêng + thẻ toàn cảnh + cột trong bảng điểm AM (nếu có bảng cấp AM). Muốn phân tích riêng sâu hơn → thêm hàm render + `sec(...)` trong `renderVanHanhNgay`.
- Test nhanh không cần đăng nhập: chạy `python3 -m http.server` ở thư mục repo + Playwright chặn `/api/gas` trả fixture `{ok:true,sheets:[{name,rows}]}` (rows = mảng 2 chiều chuỗi đã định dạng, giống Sheets API FORMATTED_VALUE), set localStorage `ghn_report_session_v1`.
- Xuất HTML: `EXPORT_PANE_META.vhNgay`, snapshot nhúng `dayRaw`, `hydrateFromSnapshot` dựng lại `window.DAY.M`.

### Action frontend gọi nhưng CHƯA port (rơi xuống Apps Script → lỗi)
`getOpsAnalysis`, `getKDAnalysis` (nhận xét AI Vận hành/KD — lỗi im lặng, web giữ nhận xét rule-based), toàn bộ Lịch làm việc ở trên.

## 6. Quy ước khi sửa
- Thêm tính năng backend: viết `async function handleXxx(body)` trong `_sheetsClient.js` (kiểm tra `requireActiveUser`/`requireAdmin`), export ở `module.exports`, đăng ký trong `LOCAL_ACTIONS` của `api/gas.js`.
- Ngày giờ trong Sheet là serial number theo giờ VN (UTC+7): dùng `serialToDate` / `dateToSheetString`.
- Số kiểu VN "1.234,5" → `ldVnNum`/`parseVNNum`; regex trong chuỗi template phải giữ đúng backslash (đã từng lỗi, xem commit 01c47ed).
- "Xuất file HTML" (`exportStaticHtml`) đóng gói pane đang xem + snapshot dữ liệu (`window.__STATIC_SNAPSHOT__`) + nguyên script → file mở offline. Biến store mới nào cần chạy trong file xuất thì phải thêm vào snapshot + `hydrateFromSnapshot`.
- Sửa xong: kiểm tra cú pháp JS (`node --check` cho file api; trích script HTML ra kiểm tra), commit message ngắn tiếng Việt không dấu như lịch sử, push `main`.

## 7. Nhật ký thay đổi
- 2026-08-13 → 08-22 (tài khoản trước): port backend sang Sheets API, Lấp đầy `61_LapDayNew`, RPLD `62_RPlapday`, Đối soát vận tải. Commit cuối: `619549b` (gộp bộ lọc kho RPLD, đổi màu biểu đồ).
- 2026-10-31: tài khoản mới tiếp nhận, đọc toàn bộ code, tạo file CLAUDE.md này. File HTML xuất ngày 31/10 (tuần 2026/40–44) khớp 100% script với repo.
- 2026-11-02: FIX quên mật khẩu — port `requestPasswordReset`/`resetPassword` sang Sheets API + Gmail API (`handleRequestPasswordReset`, `handleResetPassword` trong `api/_sheetsClient.js`, đăng ký ở `api/gas.js`). OTP 10 phút, dùng chung cột OTP/OTPHetHan sheet Main; đặt lại xong reset SoLanSai + KhoaDenLuc.
- 2026-11-02: Quên mật khẩu — giới hạn nhập sai OTP 5 lần (RESET_OTP_MAX_FAILS). Số lần sai lưu ngay trong ô OTP dạng `mã#sốLầnSai` (KHÔNG thêm cột sheet Main); sai đủ 5 lần thì xoá mã → lỗi `otp_too_many`, phải gửi mã mới. Frontend báo "còn N lần thử". OTP xác thực lại phiên 24h không đổi.
- 2026-11-03: BUILD tab Vận hành › Ngày — backend `handleGetDailyReport` (đọc mọi sheet `1xx_`, FORMATTED_VALUE) + frontend phân tích (mục 5b). Test bằng Playwright với dữ liệu mẫu cắt từ sheet thật (100/101/102 + 1 sheet giả 103 để thử tự nhận).
- 2026-11-03 (tối): sheet đổi số + thêm 6 sheet (Capacity, Aging, TikTok Shop, Gán giao, Luân chuyển, Trả hàng) → nâng parser (header nhiều tầng, dòng tổng trên header, ngày dd/mm, cột ID/chữ, bảng TOP header sai), phạm vi mã 100→200, thêm nhận xét tự động mọi bảng, Bảng điểm AM, Toàn cảnh. Test Playwright bằng dữ liệu thật 9 sheet.
- 2026-11-03 (khuya): làm lại tab Ngày theo mẫu báo cáo chuyên gia (file bao-cao-bc-TNT) — chia phần theo nghiệp vụ, mỗi chỉ số 1 mục, chỉ hiện ngoại lệ, bảng đầy đủ đóng sẵn, bảng tín hiệu, điểm nóng, nối chỉ số giữa các sheet, hồ sơ AM/BC.
- 2026-11-03 (22h): Ưu tiên xử lý GTC ghép 3 cấp Tỉnh → AM → Bưu cục trong 1 bảng cây (`dnPriorityHtml`, chỉ hiện nơi thiếu đơn, cột "Tổng thiếu của BC dưới target"); giữ Ma trận Gán × GTC (chủ dự án thích). Chênh lệch của chỉ số % ghi bằng "%" (vd +6,06%), KHÔNG dùng "điểm" (`dnPt`).
- 2026-11-04: FIX ma trận Gán × GTC — bấm Bưu cục/Tỉnh từng tạo thêm 1 ma trận mới đè lên mục bên dưới (do `dnSetScatter` ghi vào `nextElementSibling`, sai từ khi đổi bố cục V2). Nay ma trận nằm trong `#dnMatrixBox`, đổi cấp chỉ vẽ lại đúng khung đó.
- 2026-11-04: THÊM nút [S]-Report (Siêu báo cáo live) ở Vận hành — tạo Google Sheet + Apps Script tự lấy file html mới nhất từ Drive mỗi giờ, backend `getSReport` trả theo phần, frontend nhúng iframe sandbox. GET /api/gas hiện thêm `scopes` của OAuth token.
- 2026-11-04: [S]-Report nới khung full chiều ngang (`#vhSReport` bỏ max-width, iframe cao 100vh−120px). Đã kiểm tra trigger Apps Script `capNhatSReport` (theo giờ) tồn tại.
- 2026-11-04: Tab Ngày — đổi TARGET theo bảng chủ dự án (xem 5b), bảng tín hiệu hiện ≥/≤ + màu đạt/chưa đạt, ô trống = "—". Rút gọn chữ mô tả (bỏ văn viết). Phần VII đổi "Dữ liệu gốc từng sheet" → "Các bảng dữ liệu tham khảo", tên bảng tiếng Việt (`DAY_SHEET_NAMES`), KHÔNG hiện tên/mã sheet ở báo cáo (bảng điểm AM, hồ sơ AM/BC).
