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

# 3) Gọi API chuyến đi GHN qua backend web (window.QH_GHN_POST do trang vỏ định nghĩa)
rep("    async function ghnApiPost_(path, body) {\n        const token = getGhnBearerToken_();",
    "    async function ghnApiPost_(path, body) {\n        if (typeof window.QH_GHN_POST === 'function') return window.QH_GHN_POST(path, body);\n        const token = getGhnBearerToken_();")

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
rep("            setStaffStatus_(`${label} lúc ${state.staffLastLoadedAt.toLocaleTimeString('vi-VN')}:",
    "            console.log('[Quy hoạch] ' + qhDotDiag_().text);\n            setStaffStatus_(`${qhDotDiag_().text} — ${label} lúc ${state.staffLastLoadedAt.toLocaleTimeString('vi-VN')}:")

# 6) Chèn khối hàm web trước init_
rep("    function init_() {", addon + "\n    function init_() {")

open(os.path.join(D, 'qh_web.js'), 'w', encoding='utf-8').write(
    '// TỰ SINH bởi quyhoach/build.py từ modul6_tuyen_giao.user.js + qh_addon.js — KHÔNG sửa tay.\n' + s + '\n')
print('ok', len(s))
