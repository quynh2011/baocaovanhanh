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
| Vận hành › Ngày | Chạy (2026-11-03) | `getDailyReport` — tự đọc MỌI sheet tên `1xx_` (100_ReportGTC, 101_ReportGTCtheoloaihang, 102_ReportGan, sau này 103_… tự hiện). Xem mục 5b. |
| Vận hành › Tháng | Placeholder "sắp ra mắt" | — |
| 💰 Kinh doanh › Tuần | Chạy | `21_KD_HangNangNhe`, `22_KD_HangNang`, `23_KD_HangNhe`, `24_KD_BanMoi`, `24_KD_BanMoiAM` (`loadKinhDoanh`, `KD_TABS`) |
| Kinh doanh › Kế hoạch KD | Chạy | KEHOACH sheet: `Kehoach/Ketqua/Tiendo` (6 tab con `switchKHTab`) |
| Kinh doanh › Báo Cáo Kết Quả KD | Chạy | `BCKQKD_Config/Periods/Submissions/Aggregate`, AI Gemini `gemini-2.5-flash` |
| 🎯 Kế hoạch Event | Chạy | Forecast `31_FC_Lay/32_FC_Giao/33_FC_KTC` + `EVENT_Config/Periods/Submissions` |
| 🚛 Tỷ lệ lấp đầy | Chạy (iframe) | `getLapDayData` ← sheet `61_LapDayNew` (32 cột A..AF); `getRPLapDayData` ← `62_RPlapday` (đọc cả màu ô/merge/bold để tách bảng) |
| 🚚 Đối soát vận tải | Chạy (iframe) | RECON sheet: `Main`, `Tổng hợp`, `GHN_*` |
| 🗓️ Lịch làm việc | **Hỏng** — action chưa port (getTasks, createTask, updateTaskStatus, deleteTask, getAssignableUsers, get/save/deleteCalendarConfig, getCalendarEvents) |
| Truy thu / Capacity / Nhân sự / Sắp ra mắt | Placeholder | — |

### 5b. Vận hành › Ngày — cách hoạt động (code trong `bao_cao_van_hanh_live.html`, khối "VẬN HÀNH › NGÀY", hàm tiền tố `dn`)
- Quy tắc sheet: các bảng trong 1 sheet cách nhau bởi 1 HÀNG TIÊU ĐỀ GỘP (chỉ ô cột A có chữ), ngay dưới là header; bảng đầu có thể không có tiêu đề. `dnParseSheet` tách bảng; cột chữ ở đầu = chiều (Tỉnh/AM/Bưu cục), còn lại là số; cột ngày `dd/mm/yyyy` → bảng theo ngày; cột `2026/45` → tuần; cột có "Diff"/"vs" → chênh lệch.
- Hướng tốt/xấu (`dnDir`): GTC/Gán/Ontime cao là tốt; FD/tồn/backlog/rớt thấp là tốt; sản lượng/hàng mới trung tính. Target ở `DAY_TARGETS` (GTC 65%). Tên hiển thị sheet ở `DAY_SHEET_LABELS`.
- `dnBuildModel` nối các bảng theo TÊN thực thể: 100 (GTC/Gán) + 101 (hàng mới/tồn) theo Tỉnh/AM/Bưu cục, 102 (chuỗi 8 ngày) theo AM; dò cột bằng regex tên cột (đổi thứ tự cột không sao, đổi TÊN cột thì sửa regex trong `dnBuildModel`).
- Các mục: 0 Tổng quan (KPI + nhận xét tự động), 1 Xu hướng (SVG), 2 Ma trận Gán×GTC (4 nhóm), 3 Ưu tiên (đơn thiếu target = (65% − GTC) × SL), 4 Biến động N-1 vs N-2, 5 Cây Tỉnh→AM→Bưu cục, 6 Diễn biến AM theo ngày, 7 Bảng gốc từng sheet (chung, sheet mới tự hiện).
- Thêm sheet mới (103_…): tự hiện ở mục 7. Muốn có phân tích riêng → thêm nhận diện vào `dnBuildModel` + 1 hàm render + 1 dòng `sec(...)` trong `renderVanHanhNgay`.
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
