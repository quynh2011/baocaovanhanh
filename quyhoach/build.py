# Build bản web "[TNT] - Quy hoạch" từ userscript Modul 6 (Tampermonkey).
# Chạy: python3 quyhoach/build.py  → sinh quyhoach/qh_web.js (được quyhoach_view.html nạp).
# Nguyên tắc: KHÔNG sửa tay qh_web.js — sửa userscript gốc / qh_addon.js / patch ở đây rồi build lại.
import os, re
D = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(D, 'modul6_tuyen_giao.user.js'), encoding='utf-8').read()
addon = open(os.path.join(D, 'qh_addon.js'), encoding='utf-8').read()
i = src.index('(function () {\n    \'use strict\';')
s = src[i:]

def rep(old, new, cnt=1):
    global s
    n = s.count(old)
    assert n == cnt, (n, old[:80])
    s = s.replace(old, new)

# 1) Không có Tampermonkey → bỏ qua tải trực tiếp quyhoachbuucuc.info, dùng dữ liệu đồng bộ (GAS)
rep("            await tryLiveSync_(onProgress);\n",
    "            if (typeof GM_xmlhttpRequest !== 'function') throw new Error('web');\n            await tryLiveSync_(onProgress);\n")
rep("            return { text: `OFFLINE — dùng backup lúc ${state.lastSyncAt || '?'} (lý do: ${state.offlineReason}): ${state.wards.length} phường · ${state.hubs.length} bưu cục.${matchInfo}${newInfo}${rezoneInfo}`, dot: 'offline' };",
    "            return { text: `Dữ liệu quy hoạch cập nhật lúc ${state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString('vi-VN') : '?'}: ${state.wards.length} xã/phường · ${state.hubs.length} bưu cục.`, dot: 'online' };")

# 2) Phân quyền: dùng phiên đăng nhập của web báo cáo (không gọi GHN /my-profile)
rep("    async function checkPermissionAndGate_() {\n        let profile;",
    "    async function checkPermissionAndGate_() {\n        const ss = qhSession_();\n        state.currentUser = { ssoId: ss.email || 'web', fullname: ss.name || '' };\n        state.permission = { role: 'ADMIN', hubCodes: [] };\n        state.permissionChecked = true;\n        return { allowed: true, profile: state.currentUser };\n    }\n    async function checkPermissionAndGate_OLD_() {\n        let profile;")

# 3) Token GHN trên web: lấy từ nút "Kết nối GHN" (localStorage), trình duyệt gọi thẳng GHN (CORS *)
rep("    function getGhnBearerToken_() {\n        if (state.ghnToken) return state.ghnToken;",
    "    function getGhnBearerToken_() {\n        if (!state.ghnToken && qhGhnToken_()) state.ghnToken = qhGhnToken_();\n        if (!state.ghnToken) throw new Error('Chưa kết nối GHN — bấm \"🔗 Kết nối GHN\" ở trên rồi bấm nút \"Kết nối báo cáo TNT\" trên trang nhanh.ghn.vn.');\n        if (state.ghnToken) return state.ghnToken;")
rep("            state.ghnToken = null; // token hết hạn — bắt lại ở lần gọi sau\n            throw new Error(`Chưa đăng nhập / hết phiên GHN (HTTP ${res.status}) khi gọi ${path}`);",
    "            state.ghnToken = null; // token hết hạn — bắt lại ở lần gọi sau\n            qhSetGhnToken_('');\n            throw new Error(`Phiên GHN đã hết hạn (HTTP ${res.status}) — bấm \"🔗 Kết nối GHN\" để kết nối lại.`);")
# 1b) Ghép thêm dữ liệu bản đồ vùng khác (file tĩnh quyhoach/data/*) vào dữ liệu GAS — qhMergeExtra_ trong qh_addon.js
rep("        state.lastSyncAt = meta.lastSyncAt || null;\n    }\n\n    async function loadAllData_(",
    "        state.lastSyncAt = meta.lastSyncAt || null;\n        await qhMergeExtra_(onProgress);\n    }\n\n    async function loadAllData_(")
# 1c) Web KHÔNG có tab Đồng Bộ Dữ Liệu (chủ dự án chốt 16/11: không cho ai thấy nút đồng bộ trên web) — xoá hẳn panel
rep("        body.appendChild(buildSyncPanel_());\n", "")
rep("""        const btn = document.getElementById('ghn-tg-sync-btn');
        const statusEl = document.getElementById('ghn-tg-sync-status');
        btn.addEventListener""", """        const btn = document.getElementById('ghn-tg-sync-btn');
        const statusEl = document.getElementById('ghn-tg-sync-status');
        if (!btn) return;
        btn.addEventListener""")
# 1d) Vòng xoay % khi tải bản đồ (qhLoad* trong qh_addon.js)
rep("            setStatus_('Đang tải dữ liệu...', 'loading');\n            await loadAllData_((msg) => { setStatus_(msg, 'loading'); });",
    "            setStatus_('Đang tải dữ liệu...', 'loading');\n            qhLoadStart_();\n            await loadAllData_((msg) => { setStatus_(msg, 'loading'); qhLoadMsg_(msg); });")
rep("        if (!res.ok) throw new Error(`HTTP ${res.status} khi gọi action=${action}`);\n        return res.json();\n    }\n\n    // QUAN TRỌNG",
    "        if (!res.ok) throw new Error(`HTTP ${res.status} khi gọi action=${action}`);\n        const qhJ = await res.json();\n        qhLoadTick_(action);\n        return qhJ;\n    }\n\n    // QUAN TRỌNG")
rep("            setStatus_(`❌ Lỗi: ${err.message || err}`, 'offline');\n            console.error('[Tuyến Giao] Lỗi tải dữ liệu:', err);",
    "            setStatus_(`❌ Lỗi: ${err.message || err}`, 'offline');\n            qhLoadDone_(true);\n            console.error('[Tuyến Giao] Lỗi tải dữ liệu:', err);")
# thanh kết nối GHN ở đầu tab Theo Nhân Viên
rep("""            <div id="ghn-tg-staff-controls">
                <label style="font-size:12px; color:#495057;">Từ ngày:""",
    """            <div id="qh-ghn-box" class="qh-ghn-bar"></div>
            <div id="ghn-tg-staff-controls">
                <label style="font-size:12px; color:#495057;">Từ ngày:""")
rep("        wireMapControls_();\n        wireSyncControls_();\n        wireStaffControls_();",
    "        wireMapControls_();\n        wireSyncControls_();\n        wireStaffControls_();\n        qhGhnUi_();")

# 4) Mở thẳng cửa sổ (full khung) thay cho nút launcher
rep("        injectBaseStyles_();\n        createLauncherButton_();", "        injectBaseStyles_();\n        openWindow_();")

# 5) Thanh điều khiển: thêm Tỉnh / AM / Bưu cục
rep("""                <label style="font-size:12px; color:#495057;">Xem theo:""",
    """                <label class="qh-lab">Tỉnh: <select id="qh-tinh"><option value="">Toàn vùng</option></select></label>
                <label class="qh-lab">AM: <select id="qh-am"><option value="">Tất cả AM</option></select></label>
                <label class="qh-lab">Bưu cục: <select id="qh-bc"><option value="">Tất cả bưu cục</option></select></label>
                <button id="qh-clear" class="qh-clear" title="Bỏ lọc Tỉnh / AM / Bưu cục">✕</button>
                <span class="ghn-tg-controls-sep"></span>
                <label style="font-size:12px; color:#495057;">Xem theo:""")
rep("        infoCloseBtn.addEventListener('click', () => clearSelection_());\n    }",
    "        infoCloseBtn.addEventListener('click', () => clearSelection_());\n        qhWireControls_();\n    }")
rep("            const summary = statusSummary_();\n            setStatus_(summary.text, summary.dot);",
    "            const summary = statusSummary_();\n            setStatus_(summary.text, summary.dot);\n            qhAfterLoad_();")
# applyPaint_ đặt lại fill-opacity → áp lại lớp Tỉnh/AM
rep("            state.map.setPaintProperty('wards-fill', 'fill-opacity', 0.8);\n        }\n    }",
    "            state.map.setPaintProperty('wards-fill', 'fill-opacity', 0.8);\n        }\n        if (state.qhOrg) qhApply_(false);\n    }")
# HRM tải xong → dựng lại AM
rep("            state.hrmLoaded = true;\n", "            state.hrmLoaded = true;\n            if (state.dataLoaded) qhBuildOrg_();\n")

# Dòng trạng thái sau khi tải sản lượng: thêm chẩn đoán chấm

# 6) Chèn khối hàm web trước init_
rep("    function init_() {", addon + "\n    function init_() {")

open(os.path.join(D, 'qh_web.js'), 'w', encoding='utf-8').write(
    '// TỰ SINH bởi quyhoach/build.py từ modul6_tuyen_giao.user.js + qh_addon.js — KHÔNG sửa tay.\n' + s + '\n')
print('ok', len(s))

# Máy chủ web (api/_qhSync.js) dùng CHÍNH hàm gộp vùng của userscript → sinh api/_qhMerge.js (không sửa tay)
_m0 = src.index('    function regionMergeData_(')
_m1 = src.index('    // v1.7.28 — đọc toàn bộ backup')
open(os.path.join(D, '..', 'api', '_qhMerge.js'), 'w', encoding='utf-8').write(
    "// TỰ SINH bởi quyhoach/build.py từ quyhoach/modul6_tuyen_giao.user.js — KHÔNG sửa tay.\n"
    "// Hàm gộp dữ liệu bản đồ theo vùng, dùng chung giữa Tampermonkey, web và máy chủ web.\n"
    + src[_m0:_m1] + "module.exports = { regionMergeData_ };\n")
print('api/_qhMerge.js ok')
