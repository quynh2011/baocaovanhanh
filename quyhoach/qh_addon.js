    // ==================== [TNT] - QUY HOẠCH (BẢN WEB) — LỚP TỈNH / AM / BƯU CỤC ====================
    // Chèn vào trong IIFE của Modul 6 khi build bản web (quyhoach/build.py). Ánh xạ bưu cục → Tỉnh (hubs.json
    // province) và → AM (ưu tiên danh mục bưu cục của [TNT]-Report trên trang cha, thiếu thì lấy AM phổ biến
    // nhất của nhân viên thuộc bưu cục theo sheet HRM). Chọn Tỉnh / AM → làm nổi khu vực quản lý (các xã/phường
    // do các bưu cục đó giao), mờ phần còn lại, viền đậm bao quanh cả khu vực + viền từng bưu cục, panel tóm tắt.
    function qhSession_() { try { return JSON.parse(localStorage.getItem('ghn_report_session_v1') || '{}') || {}; } catch (e) { return {}; } }
    function qhParentEnts_() {
        try { const T = window.parent && window.parent !== window && window.parent.TNT; return (T && T.data && T.data.ents) || null; } catch (e) { return null; }
    }
    function qhBuildOrg_() {
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
        (state.hubs || []).forEach(h => {
            const code = String(h.hub_code);
            const t = byName[normalizeVn_(h.name)];
            let am = t && t.am && !/^loai$/.test(normalizeVn_(t.am)) ? t.am : '';
            if (!am && cnt[code]) am = Object.entries(cnt[code]).sort((a, b) => b[1] - a[1])[0][0];
            org[code] = { tinh: h.province || '(chưa rõ tỉnh)', am: am || '(chưa rõ AM)', name: h.name || code };
        });
        state.qhOrg = org;
        state.qhHubShape = state.qhHubShape || {};
        qhFillSelects_();
    }
    function qhOpt_(v, l, sel) { return `<option value="${escapeHtml_(v)}"${v === sel ? ' selected' : ''}>${escapeHtml_(l)}</option>`; }
    function qhFillSelects_() {
        const org = state.qhOrg || {};
        const codes = Object.keys(org);
        const tSel = document.getElementById('qh-tinh'), aSel = document.getElementById('qh-am'), bSel = document.getElementById('qh-bc');
        if (!tSel || !aSel || !bSel) return;
        const tinhs = Array.from(new Set(codes.map(c => org[c].tinh))).sort((a, b) => a.localeCompare(b, 'vi'));
        if (state.qhTinh && !tinhs.includes(state.qhTinh)) state.qhTinh = '';
        tSel.innerHTML = qhOpt_('', 'Toàn vùng', state.qhTinh || '') + tinhs.map(t => qhOpt_(t, `${t} (${codes.filter(c => org[c].tinh === t).length} BC)`, state.qhTinh)).join('');
        const inT = codes.filter(c => !state.qhTinh || org[c].tinh === state.qhTinh);
        const ams = Array.from(new Set(inT.map(c => org[c].am))).sort((a, b) => a.localeCompare(b, 'vi'));
        if (state.qhAm && !ams.includes(state.qhAm)) state.qhAm = '';
        aSel.innerHTML = qhOpt_('', 'Tất cả AM', state.qhAm || '') + ams.map(a => qhOpt_(a, `${a} (${inT.filter(c => org[c].am === a).length} BC)`, state.qhAm)).join('');
        const inA = inT.filter(c => !state.qhAm || org[c].am === state.qhAm).sort((a, b) => org[a].name.localeCompare(org[b].name, 'vi'));
        if (state.qhBc && !inA.includes(state.qhBc)) state.qhBc = '';
        bSel.innerHTML = qhOpt_('', 'Tất cả bưu cục', state.qhBc || '') + inA.map(c => qhOpt_(c, org[c].name, state.qhBc)).join('');
    }
    function qhSelectedHubs_() {
        const org = state.qhOrg || {};
        if (state.qhBc) return [state.qhBc];
        if (!state.qhTinh && !state.qhAm) return null;
        return Object.keys(org).filter(c => (!state.qhTinh || org[c].tinh === state.qhTinh) && (!state.qhAm || org[c].am === state.qhAm));
    }
    function qhHubShape_(code) {
        state.qhHubShape = state.qhHubShape || {};
        if (state.qhHubShape[code] !== undefined) return state.qhHubShape[code];
        const feats = ((state.wardsOldEnriched && state.wardsOldEnriched.features) || []).filter(f => String(f.properties.delivery_hub) === code);
        let u = null;
        try { u = unionFeatures_(feats.map(f => ({ type: 'Feature', properties: {}, geometry: f.geometry }))); } catch (e) { u = null; }
        if (u) u.properties = { hub_code: code, name: (state.qhOrg[code] || {}).name || code };
        state.qhHubShape[code] = u;
        return u;
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
        const baseOpacity = state.currentMode === 'hub' ? 0.65 : 0.8;
        const empty = { type: 'FeatureCollection', features: [] };
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
        if (state.qhBc) {
            const h = state.hubsByCode[state.qhBc];
            const pf = hubsToPointsGeoJson_().features.find(f => String(f.properties.hub_code) === state.qhBc);
            selectHubTerritory_(state.qhBc);
            if (h && pf) { showInfoPanel_(hubPopupHtml_(pf.properties), true); wireHubStaffingTable_(); }
        } else {
            qhSummary_(set);
        }
    }
    function qhFmt_(n) { return (Math.round(n || 0)).toLocaleString('vi-VN'); }
    function qhSummary_(set) {
        if (!set) return;
        const org = state.qhOrg || {};
        const rows = set.map(c => {
            const h = state.hubsByCode[c] || {};
            const a = h.actual || {};
            const nW = ((state.wardsOldEnriched && state.wardsOldEnriched.features) || []).filter(f => String(f.properties.delivery_hub) === c).length;
            return { c, name: org[c] ? org[c].name : c, am: org[c] ? org[c].am : '', tinh: org[c] ? org[c].tinh : '', nW, staff: h.staff || 0, dv: a.dv || 0, pv: a.pv || 0 };
        }).sort((x, y) => y.dv - x.dv);
        const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
        const title = state.qhAm ? `AM ${state.qhAm}${state.qhTinh ? ' · ' + state.qhTinh : ''}` : `Tỉnh ${state.qhTinh}`;
        const showAm = !state.qhAm;
        let html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif">
            <div style="font-weight:700;font-size:14px;color:#212529">${escapeHtml_(title)}</div>
            <div style="font-size:12px;color:#6c757d;margin:2px 0 8px">Khu vực quản lý: <b>${rows.length}</b> bưu cục · <b>${qhFmt_(sum('nW'))}</b> xã/phường · nhân sự <b>${qhFmt_(sum('staff'))}</b> · giao <b>${qhFmt_(sum('dv'))}</b> đơn · lấy <b>${qhFmt_(sum('pv'))}</b> đơn (số liệu quy hoạch)</div>
            <table class="qh-sum"><thead><tr><th>Bưu cục</th>${showAm ? '<th>AM</th>' : ''}<th>Xã/phường</th><th>Nhân sự</th><th>Giao</th><th>Lấy</th></tr></thead><tbody>`;
        rows.forEach(r => {
            html += `<tr><td><a href="#" class="qh-bc-link" data-hub="${escapeHtml_(r.c)}">${escapeHtml_(r.name)}</a></td>${showAm ? `<td>${escapeHtml_(r.am)}</td>` : ''}<td>${r.nW}</td><td>${qhFmt_(r.staff)}</td><td>${qhFmt_(r.dv)}</td><td>${qhFmt_(r.pv)}</td></tr>`;
        });
        html += `</tbody></table><div style="font-size:11px;color:#868e96;margin-top:6px">Viền cam = ranh giới cả khu vực · viền xanh đen = ranh giới từng bưu cục. Bấm tên bưu cục để xem chi tiết.</div></div>`;
        showInfoPanel_(html, true);
        document.querySelectorAll('#ghn-tg-info-content .qh-bc-link').forEach(a => a.addEventListener('click', (e) => {
            e.preventDefault();
            state.qhBc = a.dataset.hub;
            qhFillSelects_();
            qhApply_(true);
        }));
    }
    function qhWireControls_() {
        const tSel = document.getElementById('qh-tinh'), aSel = document.getElementById('qh-am'), bSel = document.getElementById('qh-bc');
        if (!tSel) return;
        tSel.addEventListener('change', () => { state.qhTinh = tSel.value; state.qhAm = ''; state.qhBc = ''; clearSelection_(); qhFillSelects_(); qhApply_(true); });
        aSel.addEventListener('change', () => {
            state.qhAm = aSel.value; state.qhBc = '';
            if (state.qhAm && !state.qhTinh) {
                const ts = Array.from(new Set(Object.values(state.qhOrg || {}).filter(o => o.am === state.qhAm).map(o => o.tinh)));
                if (ts.length === 1) state.qhTinh = ts[0];
            }
            clearSelection_(); qhFillSelects_(); qhApply_(true);
        });
        bSel.addEventListener('change', () => {
            state.qhBc = bSel.value;
            if (state.qhBc) { const o = state.qhOrg[state.qhBc]; if (o) { state.qhTinh = o.tinh; state.qhAm = o.am; } }
            clearSelection_(); qhFillSelects_(); qhApply_(true);
        });
        const clr = document.getElementById('qh-clear');
        if (clr) clr.addEventListener('click', () => { state.qhTinh = ''; state.qhAm = ''; state.qhBc = ''; clearSelection_(); qhFillSelects_(); qhApply_(false); fitToData_(); });
    }
    function qhAfterLoad_() {
        state.qhHubShape = {};
        qhBuildOrg_();
        const go = () => qhApply_(!!qhSelectedHubs_());
        if (state.map && state.map.getLayer('wards-fill')) go();
        else if (state.map) state.map.once('idle', go);
    }

    // Chẩn đoán vì sao chấm nhân viên không hiện (đếm từng bước của luồng dữ liệu → chấm).
    function qhDotDiag_() {
        const rows = state.staffRawRows || [];
        const del = rows.filter(r => r.type === 'DELIVER');
        const withWard = del.filter(r => r.wardCode);
        const wardKnown = withWard.filter(r => state.wardsByCode && state.wardsByCode[r.wardCode]);
        const withGps = del.filter(r => typeof r.lat === 'number' && typeof r.lng === 'number');
        const feats = (state.staffDotFeatures && state.staffDotFeatures.features) || [];
        const hidden = feats.filter(f => !staffStatusAllowed_(f.properties.workStatusCategory));
        const byCat = {};
        feats.forEach(f => { const k = f.properties.workStatusCategory || '?'; byCat[k] = (byCat[k] || 0) + 1; });
        const catLabel = { ACTIVE: 'đang làm việc', RESIGNED: 'nghỉ việc', ON_LEAVE: 'tạm nghỉ', SUPPORT: 'hỗ trợ/điều chuyển' };
        return {
            text: `Chẩn đoán chấm: ${del.length.toLocaleString()} đơn giao · có mã xã/phường ${withWard.length.toLocaleString()} (khớp bản đồ ${wardKnown.length.toLocaleString()}) · có GPS ${withGps.length.toLocaleString()} · ${feats.length} chấm`
                + (feats.length ? ` (${Object.keys(byCat).map(k => `${catLabel[k] || k} ${byCat[k]}`).join(', ')})` : '')
                + (hidden.length ? ` · ⚠️ ${hidden.length} chấm đang bị ẨN do bộ lọc trạng thái (Lớp hiển thị › Tuyến giao nhân viên)` : ''),
            del: del.length, withWard: withWard.length, wardKnown: wardKnown.length, withGps: withGps.length, dots: feats.length, hidden: hidden.length
        };
    }
    window.__qh = { state, qhApply_, qhBuildOrg_, qhDotDiag_, updateStaffDotsOnMap_, computeStaffDotFeatures_ };
