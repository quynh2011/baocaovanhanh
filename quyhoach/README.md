# Bàn giao: Bản đồ quy hoạch tuyến giao — "[TNT] - Quy hoạch" + Tampermonkey "Modul 6 - Tuyến Giao"

> Đọc file này + `CLAUDE.md` (gốc repo, mục 0/5/7/8/9) TRƯỚC khi sửa bất cứ gì của phần bản đồ.
> Cập nhật lần cuối: 18/11/2026 — userscript **v1.7.51**, bản web chống cache **`?v=31`**.
> Mọi thay đổi phần bản đồ: ghi Nhật ký ở `CLAUDE.md` mục 7 **và** cập nhật file này (mục 10 trạng thái/kế hoạch) trong cùng commit.

---

## 1. Mục tiêu (chủ dự án yêu cầu)
- Bản đồ ranh giới xã/phường CŨ + MỚI (sau sáp nhập 2025), tô màu theo bưu cục / sản lượng, ranh giới lãnh thổ BC, tab **Theo Nhân Viên** (sản lượng lấy/giao từng nhân viên GHN, chấm trên bản đồ).
- Chạy ở **2 nơi, CHỨC NĂNG GIỐNG NHAU**:
  1. **Tampermonkey** trên `nhanh.ghn.vn/lastmile` (bản gốc của chủ dự án, file `modul6_tuyen_giao.user.js`).
  2. **Web báo cáo** `baocaovanhanh.vercel.app` › Vận hành › **[TNT] - Quy hoạch** (bản web tự sinh từ userscript).
- Dữ liệu phải đủ **CẢ 2 VÙNG DBB + TNT** ở web, Tampermonkey và Drive.
- Chọn **Tỉnh / AM / Bưu cục** → bản đồ khoanh đúng phạm vi các BC theo **cơ cấu bưu cục** (sheet `999_Cocau`), có cảnh báo khi cơ cấu lệch so với hệ thống, có ô gõ tìm nhanh.
- Web **TỰ ĐỒNG BỘ** dữ liệu từ quyhoachbuucuc.info như Tampermonkey, nhưng **KHÔNG có nút/tab Đồng bộ trên web** (kể cả Admin).

## 2. Kiến trúc tổng thể
```
                     quyhoachbuucuc.info/api/*  (cần cookie phiên "sid" — đăng nhập trang đó)
                       ▲                     ▲
   (1) tải trực tiếp   │                     │ (4) máy chủ web tự tải bằng cookie đã lưu
   bằng GM_xmlhttpReq. │                     │
┌──────────────────────┴───┐   (2) qhSaveSid  ┌┴──────────────────────────────────────┐
│ Tampermonkey Modul 6     │ ───cookie───────▶│ Vercel /api/gas  (api/_qhSync.js)      │
│ (nhanh.ghn.vn/lastmile)  │                  │  qhSaveSid · qhAutoSync · qhCocau      │
│  regionMergeData_ → ghi  │                  │  lưu cookie ở sheet CauHinhQuyHoach    │
└──────────┬───────────────┘                  └──────┬──────────────────▲──────────────┘
           │ (3) POST syncData (đã gộp vùng)          │ POST syncData    │ qhCocau / qhAutoSync
           ▼                                          ▼                  │
     ┌───────────────────────────────────────────────────────┐          │
     │ Apps Script GAS_TUYEN_GIAO (URL công khai) ⇄ Drive     │          │
     │ files tuyen_giao_*.json  (backup ĐỦ MỌI VÙNG)          │          │
     └───────────────────────────▲───────────────────────────┘          │
                                 │ GET getMeta/getHubs/...               │
                      ┌──────────┴───────────────────────────────────────┴──┐
                      │ Web: bao_cao_van_hanh_live.html › iframe qhFrame    │
                      │   → quyhoach_view.html?v=13 → quyhoach/qh_web.js     │
                      │   + file tĩnh quyhoach/data/tnt_*.json (bù vùng TNT) │
                      └─────────────────────────────────────────────────────┘
   Tab "Theo Nhân Viên": trình duyệt gọi THẲNG API chuyến đi GHN (fe-nhanh-api / nhanh-api, CORS *).
```

## 3. Các file
| File | Vai trò | Sửa tay? |
|---|---|---|
| `quyhoach/modul6_tuyen_giao.user.js` | **Bản gốc** userscript Tampermonkey (~10k dòng). Mọi tính năng chung (lớp Tỉnh/AM/BC, cảnh báo cơ cấu, ô tìm, gộp vùng, gửi cookie) nằm ở đây. | CÓ — sửa ở đây, tăng `@version` |
| `quyhoach/qh_addon.js` | Code CHỈ DÀNH CHO WEB: vòng xoay %, giao diện gọn + nút toàn màn hình, ghép vùng tĩnh `qhMergeExtra_`, `qhSeedDrive_`, `qhAutoSync_`, kết nối token GHN (bookmarklet), chẩn đoán chấm. | CÓ |
| `quyhoach/build.py` | Ghép userscript + qh_addon.js + các patch chuỗi (mỗi patch `assert` đúng 1 lần) → sinh `qh_web.js` và `api/_qhMerge.js`. | CÓ |
| `quyhoach/qh_web.js` | **TỰ SINH** — bản web. | **KHÔNG** (chạy build.py) |
| `api/_qhMerge.js` | **TỰ SINH** — hàm `regionMergeData_` trích từ userscript cho máy chủ dùng. | **KHÔNG** |
| `quyhoach_view.html` | Trang trong iframe: nạp maplibre-gl 5.3.0 + turf 6.5.0 + `qh_web.js?v=N`; CSS ép thanh công cụ 1 hàng, ẩn tab Đồng bộ. | CÓ |
| `quyhoach/data/tnt_{wards_old,wards_new,hubs,wards,centroids,rezone}.json` | Dữ liệu vùng TNT (6 file tải từ quyhoachbuucuc.info, minify). | Thay khi có bản mới |
| `api/_qhSync.js` | Backend: `handleQhSaveSid`, `handleQhAutoSync`, `handleQhCocau` + `qhCocauCheck`, bản nháp `handleQhDraftList/Save/Delete` + `qhdAuth`. | CÓ |
| `api/gas.js` | Đăng ký `qhSaveSid`, `qhAutoSync`, `qhCocau`, `qhDraftList`, `qhDraftSave`, `qhDraftDelete` trong `LOCAL_ACTIONS`. | CÓ |
| `bao_cao_van_hanh_live.html` | Tab Vận hành › [TNT] - Quy hoạch (module id `vh_quyhoach`): iframe `qhFrame` (`allow="fullscreen"`), `switchVanHanhTab` đặt `src=quyhoach_view.html?v=N`, `qhFitFrame()` cho khung cao khít đáy màn hình. | CÓ |
| `quyhoach/tests/server_test.js`, `map_test.js`, `draft_server_test.js` | Test backend tự đồng bộ (fetch giả), giao diện Playwright (GAS giả), backend bản nháp (không cần fixtures). | CÓ |

## 4. Nguồn dữ liệu
### 4a. Apps Script GAS_TUYEN_GIAO (backup Drive)
- URL: `https://script.google.com/macros/s/AKfycbx7-gr0yl5Ps9Pn_Ax0nedYCuN3-B9skJ1aSq36ntkltDl_w4SCO86fFnzcYOHQCeb5/exec` (công khai; cũng có trong userscript và `api/_qhSync.js` hằng `QH_GAS`).
- GET `?action=`: `getMeta` (lastSyncAt, has*), `getWardsOldGeoJson`, `getWardsGeoJson`, `getHubs`, `getWards`, `getWardCentroids`, `getRezone`, `getHrm`.
- POST `{action:'syncData', syncedBy, wardsGeoJson, wardsOldGeoJson, hubs, wards, wardCentroids, rezone}` (mỗi trường là CHUỖI JSON) → `{ok, saved, errors}`. Ghi vào Drive các file `tuyen_giao_*.json`.
- Code `.gs` không nằm trong repo này (backend riêng của chủ dự án). Môi trường Claude cloud **không gọi được script.google.com** → mọi test dùng GAS giả.

### 4b. quyhoachbuucuc.info
- API: `/api/wards_new.geojson`, `/api/wards.geojson` (phường cũ), `/api/hubs.json`, `/api/wards.json`, `/api/ward_centroids.json`, `/api/rezone.json`.
- Cần cookie phiên `sid` (đăng nhập trang). Sai/hết hạn → 302/401. Máy chủ Vercel gọi được trang này.
- Mỗi lần tải trực tiếp chỉ trả về VÙNG của tài khoản đang đăng nhập → bắt buộc gộp vùng (mục 5).

### 4c. Google Sheet chính (SHEET_ID trong CLAUDE.md)
| Sheet | Dùng cho |
|---|---|
| `999_Cocau` | Cơ cấu bưu cục chủ dự án tự cập nhật tay. Cột dò theo TÊN: **Mã BC** (= `hub_code`), **Bưu Cục mới**, **ID AM**, **AM**, **Tỉnh** (còn Usertele, Lọc, Note). ~153 dòng, 11 tỉnh. |
| `200_1_GTCTOTAL` | Cơ cấu THEO HỆ THỐNG: cột A "Cấp quản lý" (AM, có thể nhiều tên), cột B "Chi tiết" (BC), "Chuẩn ngày". Lấy AM ở ngày mới nhất. |
| `QuyHoachNhap` | Bản nháp quy hoạch: A ID · B Tên · C Ghi chú · D Người tạo · E Mã người tạo (email web / "GHN ssoId") · F Tạo lúc · G Sửa lúc · H Người sửa · I Xoá (1 = đã xoá mềm) · J..S Dữ liệu JSON cắt 45.000 ký tự/ô, mỗi ô tiền tố `~`. Tự tạo nếu chưa có. |
| `CauHinhQuyHoach` | Cột A khoá / B giá trị: `cookie` (KHÔNG BAO GIỜ trả về trình duyệt), `cookieLuc`, `cookieBoi`, `dongBoLuc`, `thuLuc`, `ketQua`. Tự tạo nếu chưa có. |

### 4d. Quy mô hiện tại (16/11/2026)
DBB 59 BC / 771 phường (Thái Nguyên, Hà Giang, Cao Bằng, Tuyên Quang, Bắc Kạn) + TNT 73 BC / 877 phường cũ / 277 phường mới (Ninh Bình, Nam Định, Hà Nam, Vĩnh Phúc, Phú Thọ, Hòa Bình) = **132–133 BC, 1.648 xã/phường**. Mã phường và mã BC 2 vùng không trùng nhau.

## 5. Quy tắc GỘP VÙNG (quan trọng nhất — không được phá)
- Hàm `regionMergeData_(live, old)` trong userscript (v1.7.28): vùng nào có trong `live` thì **thay toàn bộ** dữ liệu vùng đó; vùng khác lấy từ `old` **giữ nguyên**. Áp cho hubs, wards, wardsOld, wardsNew, centroids, rezone.
- MỌI đường ghi Drive đều phải đi qua hàm này: Tampermonkey tự tải (`tryLiveSync_` → `fetchBackupData_` → gộp → hiển thị + POST), tab Đồng bộ dán tay của Tampermonkey, web (`qhSeedDrive_`), máy chủ (`handleQhAutoSync` dùng `api/_qhMerge.js`).
- ⚠️ Ai còn chạy Tampermonkey **< v1.7.28** sẽ ghi đè Drive còn 1 vùng. Bắt mọi người dùng bản mới.
- Web khi tải: `qhMergeExtra_` (danh sách `QH_EXTRA_REGIONS=['tnt']`) bù vùng TNT từ file tĩnh nếu Drive thiếu; Drive chưa có TNT → `qhSeedDrive_` ghi bản gộp lên Drive 1 lần (được `await` trước tự đồng bộ để không ghi chồng).
- **Thêm vùng mới**: cách 1 — dán 6 file vào tab "Đồng Bộ Dữ Liệu" của Tampermonkey (tự gộp); cách 2 — thêm `quyhoach/data/<vùng>_*.json` + tên vào `QH_EXTRA_REGIONS` rồi build.

## 6. Tự đồng bộ của web (máy chủ)
1. Tampermonkey ≥ v1.7.29, mỗi lần tải trực tiếp thành công: `readQuyhoachCookie_` đọc cookie bằng `GM_cookie` (thử url / url api / domain / domain www / tất cả) → `pushQuyhoachSessionToWeb_` POST `/api/gas {action:'qhSaveSid', cookie, by}` (tối đa 1 lần/2 giờ). Kết quả nối vào dòng trạng thái: "✅ đã gửi phiên cho web báo cáo tự đồng bộ" / "⚠️ chưa gửi được phiên cho web (lý do)".
   - Dự phòng: khi mở trang quyhoachbuucuc.info script đọc `document.cookie` (chỉ được nếu cookie không HttpOnly).
2. `handleQhSaveSid` (công khai, không cần đăng nhập web): chỉ lưu khi cookie tải được `hubs.json` thật.
3. Người dùng mở tab Quy hoạch → `qhAutoSync_` gọi `qhAutoSync` (cần phiên web). Máy chủ chỉ chạy khi Drive cũ hơn **3 giờ** (`QH_SYNC_EVERY_MS`), khoá chống chạy chồng 3 phút: tải 6 file bằng cookie → đọc backup Drive → `regionMergeData_` → POST `syncData` → web tự bấm "Tải lại" khi bản đồ sẵn sàng. Dòng trạng thái ghi "bản đồ tự cập nhật lúc …"; lỗi phiên (`cookie_het_han`, `khong_co_cookie`) **chỉ Admin thấy**.
4. **Cài đặt Tampermonkey BẮT BUỘC** (đã xác nhận thật 16/11): Bảng điều khiển › Cài đặt › Chế độ cấu hình = **Nâng cao** › Bảo mật › **"Cho phép script truy cập cookie" = Tất cả**. Mặc định tắt → GM_cookie trả 0 cookie mọi cách (`khong_co_cookie [url:0 …]`). Lần đầu `@connect baocaovanhanh.vercel.app` hỏi quyền → chọn "Luôn cho phép".
5. Header userscript cần: `@match https://nhanh.ghn.vn/lastmile*`, `@match https://www.quyhoachbuucuc.info/*` (GM_cookie chỉ đọc được cookie trang có trong @match; trên host này script thoát ngay sau phần gửi cookie), `@grant GM_xmlhttpRequest`, `@grant GM_cookie`, `@connect www.quyhoachbuucuc.info`, `@connect baocaovanhanh.vercel.app`.

## 7. Lớp Tỉnh / AM / Bưu cục + kiểm tra cơ cấu + ô tìm (v1.7.32–33, CHUNG Tampermonkey và web)
- Action công khai `qhCocau` (`handleQhCocau`, cache 5 phút, tham số `fresh` bỏ cache) trả `rows:[[bc, ma, am, tinh, idAm]]` + `kiemTra`. Tampermonkey gọi bằng `GM_xmlhttpRequest` (`QH_WEB_API_URL`), web gọi `/api/gas`.
- `qhBuildOrg_`: ưu tiên cơ cấu (khớp Mã BC = hub_code, thiếu thì theo tên không dấu), AM hiển thị "ID AM - Họ tên"; thiếu cơ cấu → danh mục [TNT]-Report của trang cha (`parent.TNT.data.ents`) → AM phổ biến nhất theo HRM.
- Xem theo **AM** (v1.7.43, `currentMode = 'am'`): tô màu theo AM + viền/tên khu vực AM (`qhAmPaint_/qhAmLayer_/qhAmColor_/qhAmOrder_`).
- Điều khiển: `#qh-tinh`, `#qh-am` (chỉ AM của các tỉnh đã chọn), `#qh-bc`, `#qh-clear`. **Từ v1.7.41 cả 3 ô CHỌN NHIỀU** (kiểu [S]-Report: `qhMsSet_/qhMsOpen_/qhMsDraw_/qhMsApply_`, danh sách nổi `#qh-msp` gắn body, position fixed, z-index cao nhất để không bị thanh công cụ/bản đồ che); `state.qhTinh/qhAm/qhBc` là MẢNG (rỗng = tất cả, dùng `qhA_()` khi đọc); đúng 1 BC thì mở popup BC, nhiều thì bảng khu vực; `qhApply_` làm mờ ngoài khu vực, viền cam bao khu vực + viền từng BC, zoom tới; `qhSummary_` bảng BC của khu vực (bấm tên mở popup BC).
- `qhCocauCheck` so `999_Cocau` với `200_1_GTCTOTAL` (AM ngày mới nhất theo "Chuẩn ngày", đọc UNFORMATTED): `thieu` (BC hệ thống có, cơ cấu chưa có), `lechAm` (AM khác — khớp nếu ID AM hoặc họ tên nằm trong chuỗi AM hệ thống), `du` (cơ cấu có, hệ thống không có sản lượng: kho chuyển tiếp/điểm giao — chỉ thông tin).
- Nhãn `#qh-cc-badge` (`qhCcBadge_`/`qhCcPop_`): tick xanh **"Đã xác thực"** hoặc tam giác vàng **"N thay đổi cơ cấu — bấm xem"** → popup 3 mục (BC mới / BC đổi AM / không có sản lượng — thu gọn). Số thật 16/11: 133 BC hệ thống, 0 thiếu, 0 lệch AM, 20 dòng "dư" → Đã xác thực.
- Ô tìm `#qh-search` + datalist `#qh-search-dl` (`qhSearchFill_`/`qhSearchGo_`): gợi ý "Tỉnh: …", "AM: …", "Bưu cục: …"; gõ tự do không dấu + Enter, ưu tiên AM → Tỉnh → BC.
- Bản đồ VẪN chạy theo `999_Cocau` (chủ dự án tự cập nhật); hệ thống chỉ dùng để cảnh báo.

## 8. Giao diện web (chỉ web)
- Vòng xoay % khi tải (`qhLoadStart_/qhLoadTick_/qhLoadMsg_/qhLoadDone_`, trọng số `QH_LOAD_W`, ranh giới cũ nặng nhất): tự nhích giữa các phần, 94% "Đang vẽ bản đồ…", 100% khi map idle (tối đa 15s), lỗi thì ẩn ngay.
- `qhWebCompact_`: thanh công cụ 1 hàng (thừa thì cuộn ngang, ẩn ô Vùng, ô chọn không nhãn), nút Lớp/Chú thích/Bỏ chọn/Tải lại chỉ còn biểu tượng (có tooltip), nút ⛶ toàn màn hình `#qh-fs-btn`, bảng thông tin phải 340/430px + nút thu nhỏ `#qh-info-min`. Trang cha `qhFitFrame()` cho iframe cao khít đáy màn hình.
- Tab "Theo Nhân Viên": token GHN lấy bằng nút dấu trang "🔗 Kết nối báo cáo TNT" (`qhBookmarklet_`): bấm "🔗 Kết nối GHN" trên web → mở nhanh.ghn.vn → bấm dấu trang → token gửi về bằng `postMessage({type:'qhGhnToken'})` (chỉ nhận origin *.ghn.vn) hoặc mở web kèm `#qhGhnToken=…` → localStorage `qh_ghn_token` (chỉ trên máy người dùng). 401/403 → tự xoá + báo kết nối lại. Có nút "📋 Copy mã nút" để tạo dấu trang thủ công.
- Vị trí đơn GHN (đã xác nhận bằng phản hồi API thật, v1.7.27): `senderContact/receiverContact` bị che; vị trí nằm ở `pickInfo` (đơn lấy) / `deliverInfo` (đơn giao) / `returnInfo` (đơn trả), có wardName/districtName/cityName/lat/lng, không có wardCode → khớp phường bằng GPS (`locFromItem_`, `vnLatLng_` tự đảo lat/lng).

## 8b. Bản nháp quy hoạch (v1.7.34 — CHUNG Tampermonkey và web, hàm tiền tố `qhd`)
- Mục đích (chủ dự án yêu cầu 16/11): tạo quy hoạch mới để xem thử, KHÔNG đụng dữ liệu thật: (1) gộp các bưu cục đang có cho 1 AM → quy hoạch mới; (2) gộp thêm xã/phường vào 1 bưu cục có sẵn; (3) gộp xã/phường của nhiều bưu cục thành 1 bưu cục mới.
- Chủ dự án chốt: lưu CHUNG lên sheet (mọi người xem được) · Admin + Quản lý mới tạo/sửa · bảng so sánh có đủ số xã/phường + diện tích, giao/lấy, nhân sự/định biên, khoảng cách tới BC · chạy cả Tampermonkey và web.
- Dữ liệu 1 bản nháp (`qhdToData_`): `{v:1, wh:{khoáBC:[mã xã...]}, nh:[{id:'N1', name, lat, lng, am}], ham:{khoáBC: 'AM mới'}}` — chỉ lưu phần GHI ĐÈ so với quy hoạch thật (xã/phường đổi BC, BC mới, BC đổi AM). Khoá BC = `hub_code` hoặc `N1, N2…` cho BC mới. Trong trình duyệt dùng dạng `cur.wm = {mã xã: khoáBC}`.
- Giao diện: nút `#qhd-btn` "📝 Bản nháp" → panel trái `#qhd-panel` (`qhdPanel_`/`qhdWire_`): chọn bản đã lưu / ＋ Tạo mới / Lưu / Lưu thành bản mới / Hoàn tác (`qhdUndo_`, 40 bước) / Xoá. Tab "✏️ Thao tác": 1. chọn xã/phường (bấm bản đồ — `qhdMapClick_` chèn đầu `map.on('click')`; bấm chấm BC = chọn cả BC; thêm cả 1 BC; thêm vùng đang lọc Tỉnh/AM/BC), 2. gộp vào BC (`qhdAssign_`) / tạo BC mới (`qhdNewHub_`, vị trí = trọng tâm theo đơn giao, AM chọn ở ô `#qhd-newam` — để trống = AM chiếm nhiều đơn nhất, đổi sau ở ô AM của danh sách BC mới; "📍 Vị trí" rồi bấm bản đồ để đặt lại) / trả về BC cũ, 3. gán BC cho AM có sẵn hoặc tên quy hoạch mới (`qhdSetAm_`); danh sách thay đổi, bấm ✕ để bỏ từng nhóm. Tab "📊 So sánh trước → sau" (`qhdCmpHtml_`): theo bưu cục và theo AM; ô = số sau (đậm) + "trước x ▲▼Δ" (khoảng cách/thiếu người tăng = đỏ, giảm = xanh; sản lượng trung tính).
- Công thức (`qhdStats_`): giao/lấy = Σ dv/pv của xã/phường (số liệu quy hoạch); diện tích = turf.area; định biên cần = Σ đơn giao xã ÷ năng lực ổn định (`THRESHOLDS_` yellowMin: 70 xã / 90 phường), làm tròn lên; nhân sự hiện có = `hub.staff` (giữ nguyên, chưa tính điều chuyển người; BC mới = 0); khoảng cách = chim bay từ BC tới tâm xã/phường, TB theo trọng số đơn giao + xã xa nhất.
- **Đang mở 1 bản nháp = xem CẢ VÙNG theo bản nháp** (v1.7.36, chủ dự án chốt): bộ lọc Tỉnh/AM/Bưu cục, ô tìm, bảng khu vực, viền cam khu vực đều dùng cơ cấu của bản nháp (`qhOrgV_()` trả `state.qhdOrg` do `qhdBuildOrg_` dựng mỗi lần `qhdRefresh_`; mọi hàm lớp Tỉnh/AM/BC đọc qua `qhOrgV_()`, KHÔNG đọc thẳng `state.qhOrg`). Nút — thu nhỏ bảng nháp; đóng bản nháp là về quy hoạch thật.
- Bản đồ (lớp `qhd-*`, `qhdRender_`): tô xã/phường theo BC của bản nháp, viền đỏ đứt = xã/phường đổi BC, viền xanh đen = ranh giới BC bị ảnh hưởng, viền tím đứt = ranh giới AM bị ảnh hưởng, vàng = đang chọn, ★ = BC mới. Đóng panel là bản đồ về quy hoạch thật.
- Backend (`api/_qhSync.js`): `qhDraftList` (ai đã đăng nhập cũng xem; trả `canEdit`), `qhDraftSave` (Admin/Quản lý; chặn ghi đè nếu `suaLuc` khác — người khác vừa sửa), `qhDraftDelete` (xoá mềm; chỉ người tạo hoặc Admin). Xác thực `qhdAuth`: web gửi `token` phiên (vai trò Admin / Quản lý ở sheet Main); Tampermonkey gửi `ghnToken` → máy chủ gọi GHN `/user/my-profile` lấy ssoId → GAS `getPermission` (ADMIN / QUAN_LY được sửa). Token GHN chỉ dùng xác thực, không lưu; cache 10 phút theo mã băm.
- Trong Tampermonkey gọi `/api/gas` bằng `GM_xmlhttpRequest` (header đã có `@connect baocaovanhanh.vercel.app`).
- Chưa làm (hỏi chủ dự án nếu cần): áp bản nháp thành quy hoạch thật, điều chuyển nhân sự theo bản nháp, xuất Excel bảng so sánh, so 2 bản nháp với nhau.

## 8c. Khoảng cách BC → xã/phường + km giao 1 nhân viên (v1.7.45 — CHUNG Tampermonkey và web, hàm tiền tố `qhKm`)
- Tab Theo Nhân Viên: bảng thêm cột **Km giao (ước tính)** và **BC → xã xa nhất (km)**, hàng TỔNG ghi TB km/NV/ngày; nút "+" ghi khoảng cách BC → từng xã/phường + dòng km giao; popup chấm nhân viên có "cách BC x km" từng xã + Km giao ước tính (gộp nhiều ngày = TB/ngày).
- Điểm xã/phường = TÂM xã/phường (`centroidForWard_`), điểm BC = lat/lng trong hubs.json. Km giao = BC → lần lượt tâm các xã/phường có đơn giao (gần nhất đi trước, bỏ xã < 3% đơn — `QH_KM_MIN_SHARE_`) → về BC (`qhKmTrip_`).
- Đường bộ: OSRM công khai `router.project-osrm.org` (CORS `*`, Tampermonkey cần `@connect router.project-osrm.org`), mỗi BC 1 lần gọi `table` (BC + mọi xã có đơn, tối đa 96 điểm) → `state.qhKmRoad[hub]`, gọi lần lượt cách 1,1s (`qhKmPrefetch_`, chạy sau mỗi lần vẽ bảng), xong vẽ lại bảng. Lỗi/không gọi được → đường chim bay (`qhKmHav_`), ghi "*"/"(chim bay)". Chỉ gửi toạ độ BC + tâm xã, không gửi dữ liệu đơn/nhân viên.
- v1.7.46: bảng còn có Cần lấy (Lấy TC + thất bại) + % LTC, Cần giao (Giao TC + thất bại) + % GTC, % Trả hàng = đơn trả ÷ (Giao TC + đơn trả); hàng TỔNG tính trên tổng (`qhCanCells_` trong `renderStaffTable_`).
- v1.7.47: thêm cột Đang lấy / Đang giao (đơn chưa cập nhật kết quả, `pickPending`/`deliverPending`); Cần lấy/Cần giao + % LTC/% GTC tính CẢ đơn đang lấy/đang giao (chủ dự án chốt: đều là đơn chưa thành công). Dòng "Tổng đơn giao" cũng gồm đơn đang giao.
- v1.7.48: chọn NHIỀU ngày → bảng GỘP mỗi (bưu cục, nhân viên) còn 1 dòng (cộng đơn cả khoảng; cột Ngày ghi khoảng + "làm x/N ngày"; Km giao = TB/ngày các ngày làm; xã xa nhất = xa nhất các ngày; "+" dùng phân bổ xã/phường gộp `buildDotComputationRows_`).
- v1.7.49: bảng thứ 2 "📍 Chi tiết xã/phường từng nhân viên đang chạy" dưới bảng nhân viên (`qhWardTblHtml` trong `renderStaffTable_`): mỗi dòng = ngày × bưu cục × xã/phường × nhân viên (nhiều ngày thì gộp), xã/phường của MỌI đơn (lấy/giao/trả) theo `resolveOldWardCode_`, đủ cột Lấy/Giao/Trả như bảng trên + Km BC → xã/phường; theo bộ lọc nhân viên/nhóm KH; tối đa 1.000 dòng, khung cuộn + tiêu đề dính. `qhKmPrefetch_` lấy đường bộ cho cả xã/phường có đơn lấy/trả.
- v1.7.50: bảng 2 có nút lọc Loại đơn Tất cả / Giao / Lấy / Trả (`state.qhWtType`, lọc đơn trước khi gộp, ẩn cột của loại khác) + Xếp theo Nhân viên / Xã-phường (`state.qhWtBy`, xếp theo xã để xem xã đó NV nào chạy).
- v1.7.51: XÃ/PHƯỜNG CHÍNH của mỗi nhân viên (chủ dự án chốt): xếp xã theo số đơn GTC của NV đó cao → thấp, cộng dồn tới khi đạt ngưỡng (mặc định 80%, chọn 60/70/80/90%) → các xã đó là chính (1 xã ≥ 80% → 1 xã; 2 xã mỗi xã 40% → 2 xã). Cột "% GTC của NV" (⭐ = chính) + nút "Tất cả / ⭐ Chỉ xã/phường chính" (`state.qhWtMain`, `state.qhWtThr`); tính trên đơn giao thành công, không phụ thuộc nút Loại đơn.
- Hạn chế: là ƯỚC TÍNH theo tâm xã/phường, không phải quãng đường GPS thật của shipper (không tính đi lại giữa các điểm giao trong cùng xã).

## 9. Quy trình sửa → build → test → deploy
1. Sửa `modul6_tuyen_giao.user.js` (tăng `@version` + ghi changelog đầu file theo kiểu các bản trước) và/hoặc `qh_addon.js` / `build.py` / `api/_qhSync.js`.
2. Build: `python3 quyhoach/build.py` (patch nào không khớp đúng 1 lần là `assert` báo lỗi → sửa chuỗi patch theo code mới).
3. Kiểm cú pháp: `node --check quyhoach/qh_web.js && node --check quyhoach/modul6_tuyen_giao.user.js && node --check api/_qhSync.js && node --check api/_qhMerge.js`.
4. **Tăng `?v=N`** ở CẢ `quyhoach_view.html` (thẻ script qh_web.js) và `bao_cao_van_hanh_live.html` (`switchVanHanhTab` đặt src iframe) — không tăng thì người dùng giữ bản cũ trong cache.
5. Test (fixtures KHÔNG nằm trong repo vì có họ tên nhân sự/AM — repo công khai):
   - Tạo `quyhoach/tests/fixtures/` (đã nằm trong `.gitignore`) gồm: `getHubs.json, getWards.json, getWardsGeoJson.json, getWardsOldGeoJson.json, getWardCentroids.json, getRezone.json` (lưu nguyên phản hồi GAS `{ok,data}` — mở URL GAS `?action=…` bằng trình duyệt của chủ dự án), `hrm.json` (`?action=getHrm`), `cocau.json` (phản hồi `/api/gas {action:'qhCocau'}`), và bản tải về `maplibre-gl.js`, `maplibre-gl.css` (5.3.0), `turf.min.js` (6.5.0).
   - Backend: `node quyhoach/tests/server_test.js [thư mục fixtures]` → cookie sai bị từ chối, đồng bộ ra ~132 BC/1.648 phường "vùng DBB, TNT", lần 2 bỏ qua, cookie hết hạn → `cookie_het_han`.
   - Giao diện: `cd <repo> && python3 -m http.server 8765` rồi `node quyhoach/tests/map_test.js [fixtures]` (Playwright; proxy `bypass:'localhost,127.0.0.1'`) → in số BC/phường, danh sách tỉnh/AM, chụp `t1.png/c1.png/c2.png` trong thư mục fixtures — XEM ảnh trước khi báo xong.
   - Nói rõ với chủ dự án "chưa thử với GAS/Drive/GHN thật" nếu chỉ test bằng dữ liệu giả.
6. Ghi `CLAUDE.md` mục 7 (+ mục 5 nếu đổi cấu trúc) + cập nhật file này → commit (tiếng Việt không dấu) → `git push origin main` → kiểm bản live: `curl -s https://baocaovanhanh.vercel.app/quyhoach_view.html | grep "qh_web.js?v=N"`.
7. Đổi userscript → gửi file `.user.js` cho chủ dự án cài lại vào Tampermonkey (đặt tên `modul6_tuyen_giao_v1.7.xx.user.js`), nhắc người khác trong vùng cập nhật.

## 10. Lưu ý & quy tắc chủ dự án đã chốt
- KHÔNG làm xuất file HTML cho tab Quy hoạch (chủ dự án chốt 16/11) — bản nháp, tuyến giao nhân viên chỉ dùng trên web + Tampermonkey.
- KHÔNG dùng alert/confirm/prompt của trình duyệt — mọi thông báo/xác nhận/nhập liệu dùng popup `qhDialog_` (`qhAlert_`, `qhConfirm_`). AM mới chưa có trong cơ cấu nhập qua `qhdNewAm_` (ID + Họ tên → "ID - Họ tên").
- Thanh công cụ web giữ ô chọn Vùng và các nút có chữ ngắn (không chỉ biểu tượng).
- Web **KHÔNG** có tab/nút Đồng Bộ Dữ Liệu (kể cả Admin) — build.py xoá `buildSyncPanel_`, CSS ẩn tab. Ghi Drive trên web chỉ tự động.
- Tính năng nào cũng phải có ở **cả Tampermonkey lẫn web** → viết trong userscript; `qh_addon.js` chỉ cho thứ riêng web.
- Không hiện tên sheet / tên cột kỹ thuật trên giao diện.
- **Bảo mật**: KHÔNG ghi token GHN, cookie `sid` hay bí mật nào vào file/commit/log (chủ dự án từng dán trong chat — nhắc anh ấy đừng dán). Cookie chỉ nằm trong sheet `CauHinhQuyHoach`, không trả về trình duyệt; console chỉ in TÊN cookie. Repo GitHub công khai → `quyhoach/data/*` (có giá thuê mặt bằng BC) xem được công khai, giống dữ liệu GAS.
- Không tải trực tiếp quyhoachbuucuc.info từ trình duyệt web (cần cookie + CORS) — chỉ Tampermonkey hoặc máy chủ.

## 11. Hạn chế đã biết
- Dữ liệu quy hoạch chỉ có các vùng đã tải (DBB, TNT). BC không có trên quyhoachbuucuc.info thì không có ranh giới.
- Tự đồng bộ của máy chủ phụ thuộc cookie Tampermonkey gửi lên; cookie hết hạn mà không ai mở Tampermonkey → web giữ dữ liệu Drive cũ (Admin thấy cảnh báo).
- Tự đồng bộ chỉ chạy khi có người mở tab Quy hoạch (không có lịch chạy nền).
- Vercel giới hạn 60s/lượt (`maxDuration`) và body ~4,5MB; 6 file hiện ~vài MB — vùng tăng nhiều có thể chạm giới hạn.
- Token GHN của tab Theo Nhân Viên nằm ở localStorage từng máy; mỗi người phải tự kết nối.

## 12. Trạng thái & kế hoạch tiếp theo
| # | Việc | Trạng thái |
|---|---|---|
| 1 | Gộp vùng TNT, Drive/web/Tampermonkey đủ 2 vùng | ✅ Xong (Drive thật 133 BC / 1.648 phường) |
| 2 | Tampermonkey gửi cookie cho máy chủ | ✅ Xác nhận thật 16/11 ("đã gửi phiên…") |
| 3 | Lượt máy chủ tự đồng bộ đầu tiên | ⏳ Chưa thấy chạy thật — chờ Drive cũ > 3h + có người mở tab; kiểm sheet `CauHinhQuyHoach` khoá `ketQua`/`dongBoLuc` |
| 4 | Lớp Tỉnh/AM/BC theo cơ cấu, cảnh báo cơ cấu, ô tìm | ✅ Xong (test Playwright dữ liệu giả + cơ cấu thật) |
| 5 | Giao diện web gọn, bản đồ to, toàn màn hình | ✅ Xong (`?v=13`) |
| 6 | Tự động lấy token GHN trên web cho tab Theo Nhân Viên (không cần bookmarklet) | ⏸ Chủ dự án hoãn ("để tý xử") |
| 7 | (Tuỳ chọn) Giao diện gọn tương tự cho bản Tampermonkey | Chưa làm — hỏi chủ dự án trước |
| 9 | Bản nháp quy hoạch (gộp xã/phường, BC, AM + so sánh trước → sau) | ✅ Xong v1.7.34 (test backend 12/12 + Playwright dữ liệu giả) — chưa thử sheet/GHN thật |
| 8 | (Tuỳ chọn) Lịch chạy nền đồng bộ không cần người mở tab (Vercel cron gọi `qhAutoSync` với quyền hệ thống) | Chưa làm — hỏi trước |
