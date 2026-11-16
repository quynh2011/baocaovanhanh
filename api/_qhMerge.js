// TỰ SINH bởi quyhoach/build.py từ quyhoach/modul6_tuyen_giao.user.js — KHÔNG sửa tay.
// Hàm gộp dữ liệu bản đồ theo vùng, dùng chung giữa Tampermonkey, web và máy chủ web.
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

module.exports = { regionMergeData_ };
