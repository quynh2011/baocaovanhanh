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
| Vận hành › Ngày/Tháng | Placeholder "sắp ra mắt" | — |
| 💰 Kinh doanh › Tuần | Chạy | `21_KD_HangNangNhe`, `22_KD_HangNang`, `23_KD_HangNhe`, `24_KD_BanMoi`, `24_KD_BanMoiAM` (`loadKinhDoanh`, `KD_TABS`) |
| Kinh doanh › Kế hoạch KD | Chạy | KEHOACH sheet: `Kehoach/Ketqua/Tiendo` (6 tab con `switchKHTab`) |
| Kinh doanh › Báo Cáo Kết Quả KD | Chạy | `BCKQKD_Config/Periods/Submissions/Aggregate`, AI Gemini `gemini-2.5-flash` |
| 🎯 Kế hoạch Event | Chạy | Forecast `31_FC_Lay/32_FC_Giao/33_FC_KTC` + `EVENT_Config/Periods/Submissions` |
| 🚛 Tỷ lệ lấp đầy | Chạy (iframe) | `getLapDayData` ← sheet `61_LapDayNew` (32 cột A..AF); `getRPLapDayData` ← `62_RPlapday` (đọc cả màu ô/merge/bold để tách bảng) |
| 🚚 Đối soát vận tải | Chạy (iframe) | RECON sheet: `Main`, `Tổng hợp`, `GHN_*` |
| 🗓️ Lịch làm việc | **Hỏng** — action chưa port (getTasks, createTask, updateTaskStatus, deleteTask, getAssignableUsers, get/save/deleteCalendarConfig, getCalendarEvents) |
| Truy thu / Capacity / Nhân sự / Sắp ra mắt | Placeholder | — |

### Action frontend gọi nhưng CHƯA port (rơi xuống Apps Script → lỗi)
`requestPasswordReset`, `resetPassword` (quên mật khẩu), `getOpsAnalysis`, `getKDAnalysis` (nhận xét AI Vận hành/KD — lỗi im lặng, web giữ nhận xét rule-based), toàn bộ Lịch làm việc ở trên.

## 6. Quy ước khi sửa
- Thêm tính năng backend: viết `async function handleXxx(body)` trong `_sheetsClient.js` (kiểm tra `requireActiveUser`/`requireAdmin`), export ở `module.exports`, đăng ký trong `LOCAL_ACTIONS` của `api/gas.js`.
- Ngày giờ trong Sheet là serial number theo giờ VN (UTC+7): dùng `serialToDate` / `dateToSheetString`.
- Số kiểu VN "1.234,5" → `ldVnNum`/`parseVNNum`; regex trong chuỗi template phải giữ đúng backslash (đã từng lỗi, xem commit 01c47ed).
- "Xuất file HTML" (`exportStaticHtml`) đóng gói pane đang xem + snapshot dữ liệu (`window.__STATIC_SNAPSHOT__`) + nguyên script → file mở offline. Biến store mới nào cần chạy trong file xuất thì phải thêm vào snapshot + `hydrateFromSnapshot`.
- Sửa xong: kiểm tra cú pháp JS (`node --check` cho file api; trích script HTML ra kiểm tra), commit message ngắn tiếng Việt không dấu như lịch sử, push `main`.

## 7. Nhật ký thay đổi
- 2026-08-13 → 08-22 (tài khoản trước): port backend sang Sheets API, Lấp đầy `61_LapDayNew`, RPLD `62_RPlapday`, Đối soát vận tải. Commit cuối: `619549b` (gộp bộ lọc kho RPLD, đổi màu biểu đồ).
- 2026-10-31: tài khoản mới tiếp nhận, đọc toàn bộ code, tạo file CLAUDE.md này. File HTML xuất ngày 31/10 (tuần 2026/40–44) khớp 100% script với repo.
