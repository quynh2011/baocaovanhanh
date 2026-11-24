    // ===== 16/11 — gọn thanh công cụ trên web (nút chỉ còn biểu tượng, có chú thích khi rê chuột) + toàn màn hình + thu nhỏ bảng bên phải =====
    let qhCompactDone = false;
    function qhWebCompact_() {
        if (qhCompactDone || !document.getElementById('ghn-tg-map-controls')) return;
        qhCompactDone = true;
        const lb = (id, txt, title) => { const b = document.getElementById(id); if (!b) return; const l = b.querySelector('.ghn-tg-combo-trigger-label'); if (l) l.textContent = txt; else b.textContent = txt; b.title = title; };
        lb('ghn-tg-layers-combo-trigger', '🗂️ Lớp hiển thị', 'Bật/tắt ranh giới, nhãn, tuyến giao nhân viên');
        lb('ghn-tg-legend-combo-trigger', 'ℹ️ Chú thích', 'Chú thích màu trên bản đồ');
        lb('ghn-tg-clear-selection-btn', '✖ Bỏ chọn', 'Bỏ chọn — về hiển thị mặc định');
        lb('ghn-tg-reload-btn', '🔄 Tải lại', 'Tải lại dữ liệu bản đồ');
        const rl = document.getElementById('ghn-tg-reload-btn');
        if (rl && !document.getElementById('qh-fs-btn')) {
            const fs = document.createElement('button'); fs.id = 'qh-fs-btn'; fs.type = 'button'; fs.textContent = '⛶ Toàn màn hình'; fs.title = 'Toàn màn hình (Esc để thoát)';
            fs.addEventListener('click', () => {
                try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { /* bỏ qua */ }
            });
            document.addEventListener('fullscreenchange', () => { fs.textContent = document.fullscreenElement ? '🗗 Thoát toàn màn hình' : '⛶ Toàn màn hình'; setTimeout(() => { try { state.map && state.map.resize(); } catch (e) { /* */ } }, 200); });
            rl.after(fs);
        }
        const ip = document.getElementById('ghn-tg-info-panel');
        if (ip && !document.getElementById('qh-info-min')) {
            const mb = document.createElement('button'); mb.id = 'qh-info-min'; mb.type = 'button'; mb.textContent = '–'; mb.title = 'Thu nhỏ / mở bảng';
            mb.addEventListener('click', () => { const m = ip.classList.toggle('qh-min'); mb.textContent = m ? '▢' : '–'; });
            ip.appendChild(mb);
        }
        setTimeout(() => { try { state.map && state.map.resize(); } catch (e) { /* */ } }, 300);
    }

    // ===== Vòng xoay % khi tải bản đồ (web) — để người xem biết web đang chạy, không phải màn hình trắng =====
    // Mỗi bước tải có trọng số (file ranh giới cũ nặng nhất); giữa 2 bước số % tự nhích dần tới mốc kế tiếp.
    const QH_LOAD_W = { getMeta: 3, getWardsOldGeoJson: 32, getWardsGeoJson: 14, getHubs: 5, getWards: 10, getWardCentroids: 3, getRezone: 10, extra: 8 };
    const qhLoad = { on: false, got: 0, shown: 0, target: 0, timer: null };
    function qhLoadEl_() {
        let el = document.getElementById('qh-load');
        if (el) return el;
        if (!document.getElementById('qh-load-css')) {
            const st = document.createElement('style'); st.id = 'qh-load-css';
            st.textContent = '#qh-load{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(248,249,250,.92);transition:opacity .35s}' +
                '#qh-load.hide{opacity:0;pointer-events:none}' +
                '#qh-load .box{display:flex;flex-direction:column;align-items:center;gap:12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}' +
                '#qh-load .ring{position:relative;width:120px;height:120px}' +
                '#qh-load svg{position:absolute;inset:0;transform:rotate(-90deg)}' +
                '#qh-load .spin{position:absolute;inset:0;animation:qhspin 1.1s linear infinite}' +
                '#qh-load .pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#e8590c}' +
                '#qh-load .lab{font-size:13px;color:#495057;max-width:420px;text-align:center}' +
                '@keyframes qhspin{to{transform:rotate(270deg)}}';
            document.head.appendChild(st);
        }
        el = document.createElement('div'); el.id = 'qh-load'; el.className = 'hide';
        el.innerHTML = '<div class="box"><div class="ring">' +
            '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#f1f3f5" stroke-width="10"/>' +
            '<circle id="qh-load-arc" cx="60" cy="60" r="52" fill="none" stroke="#e8590c" stroke-width="10" stroke-linecap="round" stroke-dasharray="0 327"/></svg>' +
            '<svg class="spin" viewBox="0 0 120 120"><circle cx="60" cy="60" r="38" fill="none" stroke="#ffb27a" stroke-width="4" stroke-linecap="round" stroke-dasharray="40 200"/></svg>' +
            '<div class="pct" id="qh-load-pct">0%</div></div><div class="lab" id="qh-load-lab">Đang tải bản đồ quy hoạch…</div></div>';
        document.body.appendChild(el);
        return el;
    }
    function qhLoadPaint_() {
        const p = Math.max(0, Math.min(100, Math.round(qhLoad.shown)));
        const a = document.getElementById('qh-load-arc'), t = document.getElementById('qh-load-pct');
        if (a) a.setAttribute('stroke-dasharray', (327 * p / 100).toFixed(1) + ' 327');
        if (t) t.textContent = p + '%';
    }
    function qhLoadPlace_() {
        const el = document.getElementById('qh-load'), c = document.getElementById('ghn-tg-map-container');
        if (!el) return;
        const top = c ? Math.max(0, c.getBoundingClientRect().top) : 0;
        el.style.top = top + 'px';
    }
    function qhLoadStart_(label) {
        qhWebCompact_();
        const el = qhLoadEl_();
        qhLoad.on = true; qhLoad.got = 0; qhLoad.shown = 0; qhLoad.target = 2;
        el.classList.remove('hide'); qhLoadPlace_(); qhLoadPaint_();
        const lab = document.getElementById('qh-load-lab'); if (lab) lab.textContent = label || 'Đang tải bản đồ quy hoạch…';
        clearInterval(qhLoad.timer);
        qhLoad.timer = setInterval(() => {
            if (!qhLoad.on) return;
            // nhích dần tới sát mốc kế tiếp (không bao giờ tự lên 100%)
            const cap = Math.min(99, qhLoad.target + 9);
            if (qhLoad.shown < qhLoad.target) qhLoad.shown += Math.max(0.6, (qhLoad.target - qhLoad.shown) * 0.25);
            else if (qhLoad.shown < cap) qhLoad.shown += 0.15;
            qhLoadPaint_(); qhLoadPlace_();
        }, 120);
    }
    function qhLoadTick_(step, label) {
        if (!qhLoad.on || !QH_LOAD_W[step]) return;
        qhLoad.got += QH_LOAD_W[step];
        qhLoad.target = Math.min(90, qhLoad.got);
        if (label) { const lab = document.getElementById('qh-load-lab'); if (lab) lab.textContent = label; }
    }
    function qhLoadMsg_(msg) {
        if (!qhLoad.on) return;
        if (/backup|server/i.test(msg || '')) msg = 'Đang tải bản đồ quy hoạch…';
        const lab = document.getElementById('qh-load-lab'); if (lab && msg) lab.textContent = msg;
    }
    function qhLoadDone_(err) {
        if (!qhLoad.on) return;
        qhLoad.on = false; clearInterval(qhLoad.timer);
        const el = document.getElementById('qh-load'); if (!el) return;
        if (err) { el.classList.add('hide'); return; }
        qhLoad.shown = 100; qhLoadPaint_();
        setTimeout(() => el.classList.add('hide'), 250);
    }

    // ===== Ghép dữ liệu bản đồ các vùng bổ sung (file tĩnh trong quyhoach/data, tải 1 lần) =====
    // Mỗi vùng 6 file giống quyhoachbuucuc.info: wards_old (ranh giới phường cũ), wards_new (ranh giới mới),
    // hubs, wards, centroids, rezone. Mã nào đã có trong dữ liệu chính thì giữ bản chính.
    const QH_EXTRA_REGIONS = ['tnt'];
    async function qhMergeExtra_(onProgress) {
        const get = async (r, k) => {
            const res = await fetch('quyhoach/data/' + r + '_' + k + '.json?v=1');
            if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + k);
            return res.json();
        };
        for (const r of QH_EXTRA_REGIONS) {
            try {
                onProgress && onProgress('Đang tải bản đồ vùng ' + r.toUpperCase() + '...');
                qhLoadTick_('extra');
                const [wo, wn, hubs, wards, cen, rz] = await Promise.all(
                    ['wards_old', 'wards_new', 'hubs', 'wards', 'centroids', 'rezone'].map(k => get(r, k).catch(() => null)));
                if (!Array.isArray(hubs) || !Array.isArray(wards)) continue;
                const nHub0 = (state.hubs || []).length;
                // Drive (đang trong state) là bản chính; file tĩnh chỉ bù vùng Drive CHƯA có (regionMergeData_ của Modul 6 v1.7.28)
                const m = regionMergeData_({ wardsOld: state.wardsOldRaw, wardsNew: state.wardsNewRaw, hubs: state.hubs, wards: state.wards,
                    centroids: state.wardCentroids, rezone: state.rezone },
                    { wardsOld: wo, wardsNew: wn, hubs, wards, centroids: cen, rezone: rz });
                state.wardsOldRaw = m.wardsOld; state.wardsNewRaw = m.wardsNew; state.hubs = m.hubs; state.wards = m.wards;
                state.wardCentroids = m.centroids; state.rezone = m.rezone;
                // Drive chưa có vùng này → ghi bản đã gộp lên Drive 1 lần (Tampermonkey v1.7.28 sẽ giữ lại khi tự đồng bộ)
                if (m.hubs.length > nHub0) { onProgress && onProgress('Đang lưu bản đồ vùng ' + r.toUpperCase() + ' lên dữ liệu chung...'); await qhSeedDrive_(r, m); }
            } catch (e) { console.warn('[Quy hoạch] Không ghép được dữ liệu vùng ' + r, e); }
        }
    }
    async function qhSeedDrive_(r, m) {
        try {
            const ss = qhSession_();
            const res = await gasPost_('syncData', {
                syncedBy: 'Web báo cáo [TNT] - Quy hoạch — gộp thêm vùng ' + r.toUpperCase() + ' (' + (ss.email || '?') + ')',
                wardsOldGeoJson: JSON.stringify(m.wardsOld), wardsGeoJson: JSON.stringify(m.wardsNew),
                hubs: JSON.stringify(m.hubs), wards: JSON.stringify(m.wards),
                wardCentroids: JSON.stringify(m.centroids), rezone: JSON.stringify(m.rezone)
            });
            console.log('[Quy hoạch] Đã ghi dữ liệu gộp vùng ' + r + ' lên Drive:', res);
        } catch (e) { console.warn('[Quy hoạch] Ghi Drive thất bại:', e); }
    }

    // ==================== [TNT] - QUY HOẠCH (BẢN WEB) — LỚP TỈNH / AM / BƯU CỤC ====================
    // Chèn vào trong IIFE của Modul 6 khi build bản web (quyhoach/build.py). Ánh xạ bưu cục → Tỉnh (hubs.json
    // province) và → AM (ưu tiên danh mục bưu cục của [TNT]-Report trên trang cha, thiếu thì lấy AM phổ biến
    // nhất của nhân viên thuộc bưu cục theo sheet HRM). Chọn Tỉnh / AM → làm nổi khu vực quản lý (các xã/phường
    // do các bưu cục đó giao), mờ phần còn lại, viền đậm bao quanh cả khu vực + viền từng bưu cục, panel tóm tắt.
    function qhSession_() { try { return JSON.parse(localStorage.getItem('ghn_report_session_v1') || '{}') || {}; } catch (e) { return {}; } }
    // Web tự đồng bộ bản đồ từ quyhoachbuucuc.info: máy chủ web dùng phiên đăng nhập quy hoạch do Tampermonkey gửi lên,
    // tải + gộp theo vùng + ghi Drive (giống Tampermonkey). Dữ liệu Drive cũ hơn 3 giờ mới chạy; xong thì tự tải lại bản đồ.
    let qhAutoSyncStarted = false;
    function qhSyncNote_(t) {
        let el = document.getElementById('qh-sync-note');
        if (!el) {
            const st = document.getElementById('ghn-tg-map-status'); if (!st) return;
            el = document.createElement('span'); el.id = 'qh-sync-note';
            el.style.cssText = 'margin-left:8px;color:#5c5f66;font-size:12px;';
            st.appendChild(el);
        }
        el.textContent = t;
    }
    async function qhAutoSync_() {
        if (qhAutoSyncStarted) return;
        qhAutoSyncStarted = true;
        const ss = qhSession_();
        if (!ss.token) return;
        const admin = ss.role === 'Admin';
        const at = iso => { try { return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch (e) { return iso; } };
        qhSyncNote_('· đang kiểm tra bản đồ mới…');
        try {
            const r = await fetch('/api/gas', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'qhAutoSync', token: ss.token }) });
            const j = await r.json();
            if (j && j.ok && j.synced) {
                qhSyncNote_('· 🔄 vừa tự cập nhật bản đồ mới (' + at(j.dongBoLuc) + ')');
                const reload = () => { const btn = document.getElementById('ghn-tg-reload-btn'); if (btn) btn.click(); };
                if (state.map && state.map.getSource('wards') && state.map.isStyleLoaded()) reload();
                else if (state.map) state.map.once('idle', reload);
            } else if (j && j.ok) {
                qhSyncNote_(j.dongBoLuc ? '· bản đồ tự cập nhật lúc ' + at(j.dongBoLuc) : '');
            } else {
                const why = { chua_co_cookie: 'cần mở Tampermonkey Modul 6 trên nhanh.ghn.vn 1 lần để web nhận phiên đăng nhập quy hoạch',
                    cookie_het_han: 'phiên đăng nhập quy hoạch đã hết hạn — đăng nhập lại quyhoachbuucuc.info rồi mở Tampermonkey Modul 6 1 lần',
                    loi_tai: 'không tải được từ quy hoạch bưu cục, sẽ thử lại sau', loi_ghi_drive: 'không ghi được dữ liệu, sẽ thử lại sau' }[j && j.error] || 'sẽ thử lại sau';
                qhSyncNote_(admin ? '· ⚠️ chưa tự cập nhật được: ' + why : (j && j.dongBoLuc ? '· bản đồ tự cập nhật lúc ' + at(j.dongBoLuc) : ''));
            }
        } catch (e) { qhSyncNote_(''); }
    }

    function qhAfterLoad_() {
        // bản đồ đã có dữ liệu → 92%, chờ bản đồ vẽ xong (idle) thì 100% + ẩn vòng xoay
        if (qhLoad.on) {
            qhLoad.target = 94; qhLoadMsg_('Đang vẽ bản đồ…');
            const fin = () => qhLoadDone_(false);
            if (state.map && state.map.loaded() && !state.map.isMoving()) setTimeout(fin, 300);
            else if (state.map) { state.map.once('idle', fin); setTimeout(fin, 15000); }
            else fin();
        }
        qhAutoSync_();
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

    // ==================== KẾT NỐI GHN TRÊN WEB (bookmarklet "Kết nối báo cáo TNT") ====================
    // Web báo cáo KHÔNG đọc được phiên đăng nhập của nhanh.ghn.vn (trình duyệt chặn khác trang). Luồng:
    // bấm "Kết nối GHN" → mở tab nhanh.ghn.vn → người dùng bấm nút dấu trang → nút lấy token của CHÍNH
    // người đó, gửi về tab báo cáo (postMessage cho cửa sổ đã mở nó, hoặc mở web kèm #qhGhnToken=…).
    // Token lưu localStorage 'qh_ghn_token' của máy người dùng, KHÔNG gửi lên server. API chuyến đi GHN
    // cho phép gọi từ trang khác (CORS *) nên trình duyệt gọi thẳng GHN, không cần proxy.
    const QH_TOKEN_KEY = 'qh_ghn_token';
    function qhGhnToken_() { try { return localStorage.getItem(QH_TOKEN_KEY) || ''; } catch (e) { return ''; } }
    function qhSetGhnToken_(t) {
        try { if (t) localStorage.setItem(QH_TOKEN_KEY, t); else localStorage.removeItem(QH_TOKEN_KEY); } catch (e) { /* bỏ qua */ }
        state.ghnToken = t || null;
        qhGhnUi_();
    }
    function qhTokenWho_(t) {
        try { const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return p.ssoId ? 'mã ' + p.ssoId : ''; } catch (e) { return ''; }
    }
    function qhBookmarklet_() {
        const W = location.origin;
        const js = "(function(){var M=function(t){var d=document.createElement('div');d.style.cssText='position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#fff;color:#212529;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);padding:14px 20px;font:14px -apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;border-left:5px solid #1c7ed6';d.textContent=t;document.body.appendChild(d);setTimeout(function(){d.remove()},6000)};var T=null,re=/eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*/g,f=function(s){if(T||!s)return;var m=String(s).match(re)||[];for(var i=0;i<m.length;i++)if(m[i].length>100){T=m[i];return}};"
            + "if(!/(^|\\.)ghn\\.vn$/.test(location.hostname)){M('Hãy bấm nút này khi đang ở trang nhanh.ghn.vn (đã đăng nhập).');return}"
            + "document.querySelectorAll('script').forEach(function(s){f(s.textContent)});"
            + "[localStorage,sessionStorage].forEach(function(st){try{for(var i=0;i<st.length&&!T;i++)f(st.getItem(st.key(i)))}catch(e){}});f(document.cookie);"
            + "if(!T){M('Chưa thấy phiên đăng nhập GHN. Đăng nhập nhanh.ghn.vn, mở 1 trang bất kỳ rồi bấm lại.');return}"
            + "var W='" + W + "';"
            // Cầu nối (v1.7.54): GHN bắt buộc chữ ký X-Sig do client của trang ký → web nhờ tab này gọi API qua client trang
            + "if(!window.__qhBridge){window.__qhBridge=1;var L=null,Q=Promise.resolve();"
            + "var api=function(){if(L)return L;L=new Promise(function(res,rej){var dl=Date.now()+15000;(function tk(){if(typeof window.__GHN_PAGE_API__==='function')return res(window.__GHN_PAGE_API__);var src=[].map.call(document.querySelectorAll('script[src]'),function(x){return x.src}).filter(function(x){return /\\/nhanh-static\\/lastmile\\/[^\\/]+\\/js\\/index\\.js(\\?|$)/.test(x)})[0];"
            + "if(src&&!window.__GHN_PAGE_API_LOADING__){window.__GHN_PAGE_API_LOADING__=true;var el=document.createElement('script');el.type='module';el.textContent='import * as mod from '+JSON.stringify(src)+';const fn=(typeof mod.In===\"function\")?mod.In:Object.values(mod).find(v=>typeof v===\"function\"&&/X-WarehouseId/.test(Function.prototype.toString.call(v)));window.__GHN_PAGE_API__=fn||null;';(document.head||document.documentElement).appendChild(el)}"
            + "if(Date.now()>dl){L=null;return rej(new Error('Không tải được client Lastmile của trang'))}setTimeout(tk,200)})()});return L};"
            + "var run=function(d){var u=new URL(d.url,location.origin),path=u.pathname+u.search,data=d.body?JSON.parse(d.body):undefined,hub=(data&&(data.hubId||data.hub_id||data.warehouseId))||'';"
            + "var p=Q.then(function(){return api().then(function(fn){var st=localStorage,og=st.getItem.bind(st),once=false;if(hub)st.getItem=function(k){if(k==='CURRENT_HUB'&&!once){once=true;return String(hub)}return og(k)};var cap=0,os=XMLHttpRequest.prototype.send;"
            + "XMLHttpRequest.prototype.send=function(){var x=this;x.addEventListener('loadend',function(){if(String(x.responseURL||'').indexOf(u.pathname)>=0&&x.status)cap=x.status});return os.apply(this,arguments)};"
            + "var done=function(){XMLHttpRequest.prototype.send=os;st.getItem=og};"
            + "return Promise.resolve(fn({url:path,method:d.method||'post',data:data,serviceName:'NHANH_API'})).then(function(b){done();var c=b&&typeof b==='object'?Number(b.code!=null?b.code:b.status):0;return{status:cap||((c===401||c===403||c===429)?c:200),body:b}},function(e){done();return{status:(e&&e.response&&e.response.status)||0,body:e&&e.response?e.response.data:null,err:String((e&&e.message)||e)}})})},function(){});Q=p.then(function(){},function(){});return p};"
            + "window.addEventListener('message',function(ev){if(ev.origin!==W)return;var d=ev.data||{};if(d.type==='qhGhnPing'){ev.source.postMessage({type:'qhGhnPong'},W);return}if(d.type!=='qhGhnCall')return;"
            + "run(d).then(function(r){r=r||{status:0,err:'lỗi cầu nối'};ev.source.postMessage({type:'qhGhnResp',id:d.id,status:r.status,body:r.body,err:r.err},W)},function(e){ev.source.postMessage({type:'qhGhnResp',id:d.id,status:0,err:String((e&&e.message)||e)},W)})});"
            + "api().catch(function(){});var bd=document.createElement('div');bd.style.cssText='position:fixed;bottom:14px;right:14px;z-index:2147483647;background:#0F2B5B;color:#fff;border-radius:10px;padding:8px 14px;font:13px -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3)';bd.textContent='🔗 Đang nối với báo cáo TNT — giữ tab này mở';document.body.appendChild(bd)}"
            + "try{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:'qhGhnToken',token:T,bridge:1},W);M('✅ Đã kết nối GHN với web báo cáo TNT. GIỮ tab này mở (web gọi GHN qua tab này), quay lại tab báo cáo để tải sản lượng.');return}}catch(e){}"
            + "M('Hãy mở tab này bằng nút \"🔗 Kết nối GHN\" trên web báo cáo TNT rồi bấm lại nút này.')})()";
        return 'javascript:' + encodeURIComponent(js);
    }
    function qhGhnUi_() {
        const box = document.getElementById('qh-ghn-box');
        if (!box) return;
        const t = qhGhnToken_();
        const who = t ? qhTokenWho_(t) : '';
        box.innerHTML = t
            ? `<span class="qh-ghn-ok">● Đã kết nối GHN${who ? ' (' + who + ')' : ''}</span>
               <button type="button" id="qh-ghn-btn" class="qh-ghn-btn2">↻ Kết nối lại</button>
               <button type="button" id="qh-ghn-off" class="qh-ghn-btn2">Ngắt</button>`
            : `<span class="qh-ghn-no">● Chưa kết nối GHN</span>
               <button type="button" id="qh-ghn-btn" class="qh-ghn-btn">🔗 Kết nối GHN</button>
               <span class="qh-ghn-help">Bấm → mở trang nhanh.ghn.vn → bấm nút <a class="qh-bm" href="${qhBookmarklet_()}" title="Kéo nút này lên thanh dấu trang (làm 1 lần)">🔗 Kết nối báo cáo TNT</a> trên thanh dấu trang.
               Lần đầu: <b>kéo</b> nút xanh đó lên thanh dấu trang (Ctrl+Shift+B để hiện thanh), hoặc <button type="button" id="qh-bm-copy" class="qh-ghn-btn2">📋 Copy mã nút</button> rồi tạo dấu trang mới, dán vào ô URL.</span>`;
        const b = document.getElementById('qh-ghn-btn');
        if (b) b.addEventListener('click', () => {
            window.__qhGhnWin = window.open('https://nhanh.ghn.vn/', 'qhGhnConnect');
            qhSetStatusHint_('Đã mở nhanh.ghn.vn — bấm nút "🔗 Kết nối báo cáo TNT" trên thanh dấu trang ở tab đó.');
        });
        const o = document.getElementById('qh-ghn-off');
        if (o) o.addEventListener('click', () => qhSetGhnToken_(''));
        const cp = document.getElementById('qh-bm-copy');
        if (cp) cp.addEventListener('click', async () => {
            const url = qhBookmarklet_();
            let copied = true;
            try { await navigator.clipboard.writeText(url); } catch (e) { copied = false; }
            if (!copied) { await qhDialog_({ title: 'Copy mã nút', icon: '📋', msg: 'Trình duyệt không cho copy tự động — bôi đen và copy dòng dưới:', fields: [{ key: 'u', label: 'Mã nút', value: url }], cancel: false, ok: 'Xong' }); }
            qhAlert_('Đã copy mã nút.\n\nCách tạo nút:\n1) Bấm Ctrl+Shift+B để hiện thanh dấu trang\n2) Chuột phải vào thanh dấu trang → "Thêm trang…" (Add page)\n3) Tên: Kết nối báo cáo TNT\n4) URL: dán (Ctrl+V) → Lưu.', 'Tạo nút kết nối GHN');
        });
        const bm = box.querySelector('.qh-bm');
        if (bm) bm.addEventListener('click', (e) => { e.preventDefault(); qhAlert_('Kéo nút này lên thanh dấu trang (không bấm ở đây). Sau đó bấm nó khi đang ở trang nhanh.ghn.vn.'); });
    }
    function qhSetStatusHint_(txt) { try { setStaffStatus_(txt); } catch (e) { /* bỏ qua */ } }
    window.addEventListener('message', (ev) => {
        if (!/^https:\/\/([a-z0-9-]+\.)*ghn\.vn$/.test(ev.origin)) return;
        const d = ev.data || {};
        if (d.type === 'qhGhnToken' && typeof d.token === 'string' && d.token.length > 100) {
            qhSetGhnToken_(d.token);
            if (d.bridge && ev.source) window.__qhGhnBridge = ev.source;
            qhSetStatusHint_('✅ Đã kết nối GHN — GIỮ tab nhanh.ghn.vn mở (GHN bắt buộc ký từ trang của họ), chọn bưu cục, ngày rồi bấm "Tải sản lượng".');
        }
        if (d.type === 'qhGhnPong') window.__qhGhnPong = Date.now();
        if (d.type === 'qhGhnResp' && window.__qhGhnWait && window.__qhGhnWait[d.id]) { const w = window.__qhGhnWait[d.id]; delete window.__qhGhnWait[d.id]; w(d); }
    });
    // Cầu nối gọi API GHN qua tab nhanh.ghn.vn (v1.7.54): GHN nay bắt buộc chữ ký X-Sig do client của trang ký,
    // web báo cáo không tự ký được → gửi yêu cầu sang tab nhanh.ghn.vn (đã bấm nút dấu trang), tab đó gọi qua client
    // của trang rồi trả kết quả về. Mất tham chiếu (F5 web) thì thử lấy lại tab theo tên 'qhGhnConnect'.
    function qhBridgeAlive_(w) {
        return new Promise((res) => {
            if (!w || w.closed) return res(false);
            const t0 = Date.now(); window.__qhGhnPong = 0;
            try { w.postMessage({ type: 'qhGhnPing' }, 'https://nhanh.ghn.vn'); } catch (e) { return res(false); }
            (function wait() { if (window.__qhGhnPong >= t0) return res(true); if (Date.now() - t0 > 1500) return res(false); setTimeout(wait, 100); })();
        });
    }
    async function qhGetBridge_() {
        let w = window.__qhGhnBridge || window.__qhGhnWin;
        if (await qhBridgeAlive_(w)) return (window.__qhGhnBridge = w);
        try {
            const g = window.open('', 'qhGhnConnect');
            if (g) {
                let blank = false; try { blank = g.location.href === 'about:blank'; } catch (e) { blank = false; }
                if (blank) g.close(); else if (await qhBridgeAlive_(g)) return (window.__qhGhnBridge = g);
            }
        } catch (e) { /* bỏ qua */ }
        return null;
    }
    window.qhGhnBridgeCall_ = async function (url, init) {
        const w = await qhGetBridge_();
        if (!w) throw new Error('GHN nay bắt buộc chữ ký từ trang nhanh.ghn.vn: bấm "🔗 Kết nối GHN" (hoặc "Kết nối lại") → trên tab nhanh.ghn.vn vừa mở bấm nút dấu trang "🔗 Kết nối báo cáo TNT" (nút đã cập nhật — tạo lại nút nếu tạo trước 24/11) → GIỮ tab đó mở rồi bấm "Tải sản lượng".');
        const id = 'q' + Date.now() + Math.random().toString(36).slice(2, 8);
        window.__qhGhnWait = window.__qhGhnWait || {};
        const r = await new Promise((res) => {
            const to = setTimeout(() => { delete window.__qhGhnWait[id]; res({ status: 0, err: 'Hết 90 giây chờ tab nhanh.ghn.vn trả lời' }); }, 90000);
            window.__qhGhnWait[id] = (d) => { clearTimeout(to); res(d); };
            w.postMessage({ type: 'qhGhnCall', id, url: String(url), method: (init && init.method) || 'post', body: init && typeof init.body === 'string' ? init.body : (init && init.body ? JSON.stringify(init.body) : '') }, 'https://nhanh.ghn.vn');
        });
        if (!r.status) throw new Error('Cầu nối nhanh.ghn.vn lỗi: ' + (r.err || 'không rõ'));
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
    };
    window.addEventListener('storage', (ev) => { if (ev.key === QH_TOKEN_KEY) { state.ghnToken = ev.newValue || null; qhGhnUi_(); } });
