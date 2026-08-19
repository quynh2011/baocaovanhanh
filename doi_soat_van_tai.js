/* ================= Đối soát NCC <-> GHN — logic client-side (bản WEB, dữ liệu sống qua /api/gas) ================= */
(function () {
    'use strict';

    // ---------- Dữ liệu bắt đầu RỖNG — nạp thật sau khi đăng nhập, xem loadLiveData() cuối file ----------
    var DATA = { field_map: [], suppliers: [], overall_summary: {} };

    var FIELD_MAP = DATA.field_map; // [{field_ncc,field_ghn,type,severity}]

    // ---------- Phiên đăng nhập — dùng chung backend /api/gas với Báo Cáo Vận Hành (tài khoản @ghn.vn) ----------
    var TOKEN_KEY = 'doisoat_token';
    var TOKEN = null;
    try { TOKEN = localStorage.getItem(TOKEN_KEY) || null; } catch (e) { TOKEN = null; }
    function apiPost(action, extra) {
          var payload = Object.assign({ action: action, token: TOKEN }, extra || {});
          return fetch('/api/gas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                  .then(function (r) { return r.json(); });
    }

    // ---------- Normalization helpers (mirror server-side Python logic) ----------
    function normWs(s) {
          if (s === null || s === undefined) return '';
          s = String(s);
          if (s.normalize) s = s.normalize('NFC');
          s = s.replace(/ /g, ' ');
          return s.replace(/\s+/g, ' ').trim();
    }
    function normKey(s) { return normWs(s).toUpperCase(); }
    function normPlate(s) { return normWs(s).replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
    function normRoute(s) {
          var t = normWs(s);
          return t.replace(/\s*->\s*/g, ' -> ');
    }
    function parseVNNumber(s) {
          s = normWs(s);
          if (s === '') return null;
          s = s.replace(/%/g, '').trim();
          if (s === '') return null;
          var s2 = s.replace(/\./g, '').replace(/,/g, '.');
          var n = parseFloat(s2);
          return isNaN(n) ? null : n;
    }
    function parseDateISO(s, fmt) {
          s = normWs(s);
          var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (!m) return null;
          var a = parseInt(m[1], 10), b = parseInt(m[2], 10), y = parseInt(m[3], 10);
          var day, month;
          if (fmt === 'MDY') { month = a; day = b; } else { day = a; month = b; }
          if (month < 1 || month > 12 || day < 1 || day > 31) return null;
          return y + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }

    var EPS_LARGE = 1.0, EPS_SMALL = 0.05;

    // "Giá gốc" quy đổi Đơn giá theo Hình thức tính giá (Cost/chuyến = Đơn giá;
    // Cost/km = Đơn giá * Số km) — dùng để so "Số tiền" công bằng giữa NCC/GHN,
    // vì NCC cộng phí cầu đường/dừng tải vào Số tiền khai báo còn GHN chưa import
    // 2 khoản phí này. Mirror đúng compute_gia_goc() bên Python.
    function computeGiaGoc(rec) {
          if (!rec) return { val: null, note: 'missing_don_gia' };
          var dg = parseVNNumber(rec['Đơn giá']);
          if (dg === null) return { val: null, note: 'missing_don_gia' };
          var ht = normWs(rec['Hình thức tính giá'] || '').toLowerCase();
          if (ht.indexOf('km') !== -1) {
                  var km = parseVNNumber(rec['Số km']);
                  if (km === null) return { val: null, note: 'missing_km' };
                  return { val: dg * km, note: null };
          }
          if (ht.indexOf('chuy') !== -1) return { val: dg, note: null };
          return { val: dg, note: 'unknown_hinh_thuc' };
    }

    function compareField(ftype, nccVal, ghnVal, nccFmt, ghnFmt) {
          var a = normWs(nccVal), b = normWs(ghnVal);
          if (ftype === 'date') {
                  if (a === '' && b === '') return 'match';
                  if (a === '') return 'missing_ncc';
                  if (b === '') return 'missing_ghn';
                  var da = parseDateISO(a, nccFmt), db = parseDateISO(b, ghnFmt);
                  if (da !== null && db !== null) return da === db ? 'match' : 'conflict';
                  return a.toLowerCase() === b.toLowerCase() ? 'match' : 'conflict';
          }
          if (ftype === 'number') {
                  var na = parseVNNumber(nccVal), nb = parseVNNumber(ghnVal);
                  if (na === null && nb === null) return 'match';
                  if (na === null && nb === 0) return 'match';
                  if (nb === null && na === 0) return 'match';
                  if (na === null) return 'missing_ncc';
                  if (nb === null) return 'missing_ghn';
                  var eps = (Math.abs(na) > 1000 || Math.abs(nb) > 1000) ? EPS_LARGE : EPS_SMALL;
                  return Math.abs(na - nb) <= eps ? 'match' : 'conflict';
          }
          if (ftype === 'plate') {
                  var pa = normPlate(nccVal), pb = normPlate(ghnVal);
                  if (pa === '' && pb === '') return 'match';
                  if (pa === '') return 'missing_ncc';
                  if (pb === '') return 'missing_ghn';
                  return pa === pb ? 'match' : 'conflict';
          }
          if (ftype === 'route') {
                  var ra = normRoute(nccVal), rb = normRoute(ghnVal);
                  if (ra === '' && rb === '') return 'match';
                  if (ra === '') return 'missing_ncc';
                  if (rb === '') return 'missing_ghn';
                  return ra.toLowerCase() === rb.toLowerCase() ? 'match' : 'conflict';
          }
          // text
          if (a === '' && b === '') return 'match';
          if (a === '') return 'missing_ncc';
          if (b === '') return 'missing_ghn';
          return a.toLowerCase() === b.toLowerCase() ? 'match' : 'conflict';
    }

    // ---------- Edits store (localStorage) ----------
    var EDITS_KEY = 'reconEditsV2';
    var edits = {};
    try { edits = JSON.parse(localStorage.getItem(EDITS_KEY) || '{}'); } catch (e) { edits = {}; }
    function saveEdits() { localStorage.setItem(EDITS_KEY, JSON.stringify(edits)); }
    function tripId(supIdx, tripIdx) { return supIdx + '#' + tripIdx; }
    function getEdit(id) { return edits[id] || null; }
    function ensureEdit(id) { if (!edits[id]) edits[id] = { ncc: {}, ghn: {} }; return edits[id]; }

    // ---------- Merge helpers ----------
    function blankRecordFromHeader(header) {
          var o = {};
          header.forEach(function (h) { if (h) o[h] = ''; });
          return o;
    }
    function mergeRecord(baseRecord, header, editOverlay) {
          var merged = baseRecord ? Object.assign({}, baseRecord) : blankRecordFromHeader(header);
          if (editOverlay) {
                  Object.keys(editOverlay).forEach(function (k) { merged[k] = editOverlay[k]; });
          }
          return merged;
    }

    function sidePresent(trip, side, ed) {
          if (side === 'ncc') return !!trip.ncc_record || (ed && ed.addedNcc);
          return !!trip.ghn_record || (ed && ed.addedGhn);
    }

    function recomputeTrip(sup, trip, id) {
          var ed = getEdit(id);
          var nccPresent = sidePresent(trip, 'ncc', ed);
          var ghnPresent = sidePresent(trip, 'ghn', ed);
          var mergedNcc = mergeRecord(trip.ncc_record, sup.ncc_header, ed && ed.ncc);
          var mergedGhn = mergeRecord(trip.ghn_record, sup.ghn_header, ed && ed.ghn);

          if (!nccPresent || !ghnPresent) {
                  return {
                            status: nccPresent ? 'ncc_only' : 'ghn_only',
                            mergedNcc: mergedNcc, mergedGhn: mergedGhn,
                            fieldDiffs: [], nccPresent: nccPresent, ghnPresent: ghnPresent,
                            edited: !!(ed && (Object.keys(ed.ncc || {}).length || Object.keys(ed.ghn || {}).length)),
                  };
          }

          var fmts = sup.summary.date_formats_detected || {};
          var diffs = [];
          var hasCritical = false, hasInfo = false;
          FIELD_MAP.forEach(function (f) {
                  if (f.field_ncc === 'Số tiền') {
                            var gN = computeGiaGoc(mergedNcc), gG = computeGiaGoc(mergedGhn);
                            var res2;
                            if (gN.val === null && gG.val === null) res2 = 'match';
                            else if (gN.val === null) res2 = 'missing_ncc';
                                      else if (gG.val === null) res2 = 'missing_ghn';
                                      else {
                                        var eps2 = (Math.abs(gN.val) > 1000 || Math.abs(gG.val) > 1000) ? EPS_LARGE : EPS_SMALL;
                                        res2 = Math.abs(gN.val - gG.val) <= eps2 ? 'match' : 'conflict';
                            }
                            if (res2 !== 'match') {
                                        diffs.push({
                                                      field_ncc: f.field_ncc, field_ghn: f.field_ghn, type: f.type, severity: f.severity, result: res2,
                                                      ncc_value: gN.val !== null ? String(Math.round(gN.val)) : '',
                                                      ghn_value: gG.val !== null ? String(Math.round(gG.val)) : '',
                                                      note: 'Giá trị đã quy đổi theo công thức Hình thức tính giá (Cost/chuyến = Đơn giá; Cost/km = Đơn giá × Số km) — chưa gồm phí cầu đường/dừng tải.',
                                        });
                                        if (f.severity === 'critical') hasCritical = true; else hasInfo = true;
                            }
                            return;
                  }
                  var nccFmt = fmts['ncc:' + f.field_ncc] || 'DMY';
                  var ghnFmt = fmts['ghn:' + f.field_ghn] || 'DMY';
                  var nccV = mergedNcc[f.field_ncc] || '';
                  var ghnV = mergedGhn[f.field_ghn] || '';
                  var res = compareField(f.type, nccV, ghnV, nccFmt, ghnFmt);
                  if (res !== 'match') {
                            diffs.push({ field_ncc: f.field_ncc, field_ghn: f.field_ghn, type: f.type, severity: f.severity, result: res, ncc_value: nccV, ghn_value: ghnV });
                            if (f.severity === 'critical') hasCritical = true; else hasInfo = true;
                  }
          });
          var status = hasCritical ? 'critical' : (hasInfo ? 'info' : 'match');
          return {
                  status: status, mergedNcc: mergedNcc, mergedGhn: mergedGhn,
                  fieldDiffs: diffs, nccPresent: true, ghnPresent: true,
                  edited: !!(ed && (Object.keys(ed.ncc || {}).length || Object.keys(ed.ghn || {}).length)),
          };
    }

    // ---------- Build working dataset: attach computed state to every trip ----------
    DATA.suppliers.forEach(function (sup, sIdx) {
          if (!sup.trips) return;
          sup.trips.forEach(function (trip, tIdx) {
                  trip._id = tripId(sIdx, tIdx);
                  trip._sup = sIdx;
          });
    });

    function liveState(sIdx, tIdx) {
          var sup = DATA.suppliers[sIdx];
          var trip = sup.trips[tIdx];
          return recomputeTrip(sup, trip, trip._id);
    }

    // ---------- App state ----------
    var state = {
          supplierIdx: 'all', // 'all' or index
          statusFilter: 'all', // all|critical|info|ncc_only|ghn_only|match
          fieldFilter: null, // tên tiêu chí đang lọc (vd 'Số tiền'), null = không lọc
          search: '',
          page: 1,
          pageSize: 50,
          expandedId: null,
    };

    var STATUS_LABEL = {
          critical: 'Sai lệch nghiêm trọng', info: 'Khác thông tin phụ',
          match: 'Khớp hoàn toàn', ncc_only: 'Chỉ NCC có', ghn_only: 'Chỉ GHN có',
    };
    var FIELD_LABEL_MAP = {};
    FIELD_MAP.forEach(function (f) { FIELD_LABEL_MAP[f.field_ncc] = f.field_ncc; });

    // ---------- Collect all trips flattened with supplier ref ----------
    function allTripsFlat() {
          var out = [];
                DATA.suppliers.forEach(function (sup, sIdx) {
                        if (!sup.trips) return;
                        sup.trips.forEach(function (trip, tIdx) { out.push({ sIdx: sIdx, tIdx: tIdx, trip: trip }); });
                });
          return out;
    }

    function getFilteredList() {
          var list;
          if (state.supplierIdx === 'all') {
                  list = allTripsFlat();
          } else {
                  var sIdx = state.supplierIdx;
                  var sup = DATA.suppliers[sIdx];
                  list = (sup.trips || []).map(function (trip, tIdx) { return { sIdx: sIdx, tIdx: tIdx, trip: trip }; });
          }
          var q = normWs(state.search).toLowerCase();
          var out = [];
                list.forEach(function (item) {
                        var st = liveState(item.sIdx, item.tIdx);
                        if (state.statusFilter !== 'all' && st.status !== state.statusFilter) return;
                        if (state.fieldFilter) {
                                  var hasField = st.fieldDiffs.some(function (d) { return d.field_ncc === state.fieldFilter; });
                                  if (!hasField) return;
                        }
                        if (q) {
                                  var hay = (item.trip.ma_chuyen + ' ' +
                                                       (st.mergedNcc['Biển số xe'] || '') + ' ' + (st.mergedGhn['Biển số xe'] || '') + ' ' +
                                                       (st.mergedNcc['Mã tuyến'] || '') + ' ' + (st.mergedGhn['Mã tuyến'] || '')).toLowerCase();
                                  if (hay.indexOf(q) === -1) return;
                        }
                        out.push({ sIdx: item.sIdx, tIdx: item.tIdx, trip: item.trip, st: st });
                });
          return out;
    }

    // ---------- Rendering ----------
    var el = {};
    function $(id) { return document.getElementById(id); }

    function computeOverallCounts() {
          var c = { critical: 0, info: 0, match: 0, ncc_only: 0, ghn_only: 0, total: 0 };
          DATA.suppliers.forEach(function (sup, sIdx) {
                  (sup.trips || []).forEach(function (trip, tIdx) {
                            var st = liveState(sIdx, tIdx);
                            c[st.status] = (c[st.status] || 0) + 1;
                            c.total++;
                  });
          });
          return c;
    }

    function fmtNum(n) { return n.toLocaleString('vi-VN'); }

    function renderSummary() {
          var c = computeOverallCounts();
          var oneside = c.ncc_only + c.ghn_only;
          el.summaryGrid.innerHTML =
                  '<div class="stat-card total"><div class="num">' + fmtNum(c.total) + '</div><div class="label">Tổng số chuyến đối soát</div></div>' +
                  '<div class="stat-card critical"><div class="num">' + fmtNum(c.critical) + '</div><div class="label">Sai lệch nghiêm trọng (tài chính/vận hành)</div></div>' +
                  '<div class="stat-card info"><div class="num">' + fmtNum(c.info) + '</div><div class="label">Chỉ khác thông tin phụ</div></div>' +
                  '<div class="stat-card ok"><div class="num">' + fmtNum(c.match) + '</div><div class="label">Khớp hoàn toàn</div></div>' +
                  '<div class="stat-card oneside"><div class="num">' + fmtNum(oneside) + '</div><div class="label">Chỉ 1 bên có dữ liệu (NCC ' + c.ncc_only + ' / GHN ' + c.ghn_only + ')</div></div>';
    }

    function renderSupplierTabs() {
          var html = '';
          html += '<div class="supplier-tab' + (state.supplierIdx === 'all' ? ' active' : '') + '" data-sup="all">' +
                  '<div class="name">Tất cả NCC</div><div class="mini">' + fmtNum(DATA.overall_summary.total_ncc_trips) + ' chuyến NCC</div></div>';
          DATA.suppliers.forEach(function (sup, idx) {
                  if (!sup.summary) return;
                  var s = sup.summary;
                  var critNow = 0, infoNow = 0;
                  (sup.trips || []).forEach(function (trip, tIdx) {
                            var st = liveState(idx, tIdx);
                            if (st.status === 'critical' || st.status === 'ncc_only' || st.status === 'ghn_only') critNow++;
                            else if (st.status === 'info') infoNow++;
                  });
                  html += '<div class="supplier-tab' + (state.supplierIdx === idx ? ' active' : '') + '" data-sup="' + idx + '">' +
                            '<div class="name" title="' + escAttr(sup.ten_ncc) + '">' + escHtml(sup.ten_ncc) + '</div>' +
                            '<div class="mini">' + fmtNum(s.total_ncc_trips) + ' chuyến &middot; <b class="crit">' + critNow + ' lệch</b> &middot; <b class="info">' + infoNow + ' TT</b></div></div>';
          });
          el.supplierTabs.innerHTML = html;
          el.supplierTabs.querySelectorAll('.supplier-tab').forEach(function (elm) {
                  elm.addEventListener('click', function () {
                            var v = elm.getAttribute('data-sup');
                            state.supplierIdx = (v === 'all') ? 'all' : parseInt(v, 10);
                            state.page = 1; state.expandedId = null;
                            renderAll();
                  });
          });
    }

    function statusChipsCounts() {
          var list = (state.supplierIdx === 'all') ? allTripsFlat() :
            (DATA.suppliers[state.supplierIdx].trips || []).map(function (t, i) { return { sIdx: state.supplierIdx, tIdx: i }; });
          var c = { all: list.length, critical: 0, info: 0, match: 0, ncc_only: 0, ghn_only: 0 };
          list.forEach(function (item) {
                  var st = liveState(item.sIdx, item.tIdx);
                  c[st.status] = (c[st.status] || 0) + 1;
          });
          return c;
    }

    function renderToolbar() {
          var c = statusChipsCounts();
          var chips = [
                  ['all', 'Tất cả'], ['critical', 'Sai lệch nghiêm trọng'], ['info', 'Khác thông tin phụ'],
                  ['ncc_only', 'Chỉ NCC có'], ['ghn_only', 'Chỉ GHN có'], ['match', 'Khớp hoàn toàn'],
                ];
          el.statusFilters.innerHTML = chips.map(function (c2) {
                  return '<div class="chip' + (state.statusFilter === c2[0] ? ' active' : '') + '" data-status="' + c2[0] + '">' + c2[1] + ' <span class="cnt">' + (c[c2[0]] || 0) + '</span></div>';
          }).join('');
          el.statusFilters.querySelectorAll('.chip').forEach(function (chip) {
                  chip.addEventListener('click', function () {
                            state.statusFilter = chip.getAttribute('data-status');
                            state.page = 1; renderAll();
                  });
          });
    }

    // ---------- Breakdown theo từng tiêu chí — bấm vào để lọc nhanh các chuyến sai đúng tiêu chí đó ----------
    function computeFieldBreakdown() {
          var list = (state.supplierIdx === 'all') ? allTripsFlat() :
            (DATA.suppliers[state.supplierIdx].trips || []).map(function (t, i) { return { sIdx: state.supplierIdx, tIdx: i }; });
          var counts = {};
          FIELD_MAP.forEach(function (f) { counts[f.field_ncc] = { conflict: 0, missing: 0 }; });
          list.forEach(function (item) {
                  var st = liveState(item.sIdx, item.tIdx);
                  st.fieldDiffs.forEach(function (d) {
                            if (!counts[d.field_ncc]) counts[d.field_ncc] = { conflict: 0, missing: 0 };
                            if (d.result === 'conflict') counts[d.field_ncc].conflict++;
                            else counts[d.field_ncc].missing++;
                  });
          });
          return counts;
    }

    function renderFieldBreakdown() {
          if (!el.fieldBreakdown) return;
          var counts = computeFieldBreakdown();
          var items = FIELD_MAP.map(function (f) {
                  var c = counts[f.field_ncc] || { conflict: 0, missing: 0 };
                  return { name: f.field_ncc, severity: f.severity, total: c.conflict + c.missing, conflict: c.conflict, missing: c.missing };
          });
          items.sort(function (a, b) { return b.total - a.total; });
          var html = '<div class="field-breakdown-label">Lọc nhanh theo tiêu chí sai lệch:</div>' +
                  '<div class="field-breakdown-chips">' +
                  items.map(function (it) {
                            var active = state.fieldFilter === it.name;
                            var sevCls = it.severity === 'critical' ? 'sev-critical' : 'sev-info';
                            var detail = it.conflict ? (it.conflict + ' lệch giá trị') : '';
                            if (it.missing) detail += (detail ? ', ' : '') + it.missing + ' thiếu 1 bên';
                            return '<div class="field-chip ' + sevCls + (active ? ' active' : '') + (it.total === 0 ? ' zero' : '') +
                                        '" data-field="' + escAttr(it.name) + '" title="' + escAttr(detail || 'Không có sai lệch') + '">' +
                                        '<span class="fname">' + escHtml(it.name) + '</span>' +
                                        '<span class="fcnt">' + it.total + '</span></div>';
                  }).join('') +
                  (state.fieldFilter ? '<div class="field-chip clear" data-field="__clear__">&times; Bỏ lọc</div>' : '') +
                  '</div>';
          el.fieldBreakdown.innerHTML = html;
          el.fieldBreakdown.querySelectorAll('.field-chip').forEach(function (chip) {
                  chip.addEventListener('click', function () {
                            var f = chip.getAttribute('data-field');
                            if (f === '__clear__') {
                                        state.fieldFilter = null;
                            } else {
                                        state.fieldFilter = (state.fieldFilter === f) ? null : f;
                            }
                            state.page = 1; state.expandedId = null;
                            renderAll();
                  });
          });
    }

    function escHtml(s) {
          return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
                                                            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
                                                      });
                                                      }
                                                        function escAttr(s) { return escHtml(s); }

                                                        function badgeHtml(status) {
                                                              return '<span class="badge ' + status + '">' + STATUS_LABEL[status] + '</span>';
                                                        }

                                                        function renderTable() {
                                                              var filtered = getFilteredList();
                                                              var total = filtered.length;
                                                              var pages = Math.max(1, Math.ceil(total / state.pageSize));
                                                              if (state.page > pages) state.page = pages;
                                                              var startI = (state.page - 1) * state.pageSize;
                                                              var pageItems = filtered.slice(startI, startI + state.pageSize);

                                                              var rowsHtml = pageItems.map(function (item) {
                                                                      var sup = DATA.suppliers[item.sIdx];
                                                                      var st = item.st;
                                                                      var dupWarn = '';
                                                                      if (item.trip.dup_total_ncc > 1 || item.trip.dup_total_ghn > 1) {
                                                                                dupWarn = '<span class="dup-warn" title="Mã chuyến bị trùng nhiều dòng">&#9888; trùng ' + item.trip.dup_total_ncc + '/' + item.trip.dup_total_ghn + '</span>';
                                                                      }
                                                                      var nCrit = st.fieldDiffs.filter(function (d) { return d.severity === 'critical'; }).length;
                                                                      var nInfo = st.fieldDiffs.filter(function (d) { return d.severity === 'info'; }).length;
                                                                      var editedTag = st.edited ? ' <span class="badge match" style="background:#eef3ff;color:#1447e6">đã sửa</span>' : '';
                                                                      var noteTag = normWs(item.trip.ghi_chu_ncc) ? ' <span title="NCC có ghi chú" style="cursor:help">&#128221;</span>' : '';
                                                                      return '<tr data-id="' + item.trip._id + '" class="' + (state.expandedId === item.trip._id ? 'expanded' : '') + '">' +
                                                                                '<td class="mono">' + escHtml(item.trip.ma_chuyen) + dupWarn + noteTag + '</td>' +
                                                                                '<td class="col-ncc-name" title="' + escAttr(sup.ten_ncc) + '">' + escHtml(sup.ten_ncc) + '</td>' +
                                                                                '<td>' + badgeHtml(st.status) + editedTag + '</td>' +
                                                                                '<td>' + (nCrit ? ('<b style="color:#dc2626">' + nCrit + '</b>') : '0') + '</td>' +
                                                                                '<td>' + (nInfo ? nInfo : 0) + '</td>' +
                                                                                '<td class="mono">' + escHtml((st.mergedNcc['Biển số xe'] || st.mergedGhn['Biển số xe'] || '')) + '</td>' +
                                                                                '<td>' + escHtml((st.mergedNcc['Ngày kết thúc'] || st.mergedGhn['Ngày kết thúc'] || '')) + '</td>' +
                                                                                '</tr>' +
                                                                                (state.expandedId === item.trip._id ? '<tr class="detail-row"><td colspan="7">' + renderDetail(item) + '</td></tr>' : '');
                                                              }).join('');

                                                              el.tableBody.innerHTML = rowsHtml || '';
                                                              if (!pageItems.length) {
                                                                      el.tableBody.innerHTML = '<tr><td colspan="7"><div class="empty-note">Không có chuyến nào khớp bộ lọc hiện tại.</div></td></tr>';
                                                              }

                                                              el.tableBody.querySelectorAll('tr[data-id]').forEach(function (tr) {
                                                                      tr.addEventListener('click', function () {
                                                                                var id = tr.getAttribute('data-id');
                                                                                state.expandedId = (state.expandedId === id) ? null : id;
                                                                                renderTable();
                                                                                if (state.expandedId) {
                                                                                            setTimeout(function () {
                                                                                                          var target = el.tableBody.querySelector('tr.detail-row');
                                                                                                          if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                                                                                            }, 30);
                                                                                }
                                                                      });
                                                              });
                                                              bindDetailEvents();

                                                              el.pagination.innerHTML =
                                                                      '<button class="btn small" id="pgPrev" ' + (state.page <= 1 ? 'disabled' : '') + '>&laquo; Trước</button>' +
                                                                      '<span>Trang ' + state.page + ' / ' + pages + ' &middot; ' + fmtNum(total) + ' chuyến</span>' +
                                                                      '<button class="btn small" id="pgNext" ' + (state.page >= pages ? 'disabled' : '') + '>Sau &raquo;</button>';
                                                              var pv = $('pgPrev'), nx = $('pgNext');
                                                              if (pv) pv.addEventListener('click', function () { state.page--; state.expandedId = null; renderTable(); });
                                                              if (nx) nx.addEventListener('click', function () { state.page++; state.expandedId = null; renderTable(); });
                                                        }

                                                        function fieldRowClass(res) {
                                                              if (res === 'conflict') return 'conflict';
                                                              if (res === 'missing_ncc' || res === 'missing_ghn') return 'missing';
                                                              return 'ok';
                                                        }

                                                        function renderPanel(side, sup, header, record, diffsByField, id, present, addedFlagName) {
                                                              if (!present) {
                                                                      return '<div class="panel ' + side + '"><h4><span class="src-dot"></span>Dữ liệu ' + (side === 'ncc' ? 'NCC nhập' : 'GHN hệ thống') + '</h4>' +
                                                                                '<div class="empty-note">Bên này chưa có dữ liệu cho Mã chuyến này.<br><button class="btn small primary" data-add="' + side + '" data-id="' + id + '" style="margin-top:8px">+ Thêm dữ liệu ' + (side === 'ncc' ? 'NCC' : 'GHN') + ' cho chuyến này</button></div></div>';
                                                              }
                                                              var rows = header.filter(function (h) { return h; }).map(function (h) {
                                                                      var res = diffsByField[h];
                                                                      var cls = res ? fieldRowClass(res) : '';
                                                                      var val = record[h] === undefined ? '' : record[h];
                                                                      return '<div class="field-row ' + cls + '"><label title="' + escAttr(h) + '">' + escHtml(h) + '</label>' +
                                                                                '<input type="text" data-side="' + side + '" data-field="' + escAttr(h) + '" data-id="' + id + '" value="' + escAttr(val) + '"></div>';
                                                              }).join('');
                                                              return '<div class="panel ' + side + '"><h4><span class="src-dot"></span>Dữ liệu ' + (side === 'ncc' ? 'NCC nhập (giữ nguyên ' + header.filter(function(h){return h;}).length + ' cột gốc)' : 'GHN hệ thống (giữ nguyên ' + header.filter(function(h){return h;}).length + ' cột gốc)') + '</h4>' + rows + '</div>';
                                                        }

                                                        function renderDetail(item) {
                                                              var sup = DATA.suppliers[item.sIdx];
                                                              var st = item.st;
                                                              var id = item.trip._id;

                                                              var diffsByFieldNcc = {}, diffsByFieldGhn = {};
                                                              st.fieldDiffs.forEach(function (d) {
                                                                      diffsByFieldNcc[d.field_ncc] = d.result;
                                                                      diffsByFieldGhn[d.field_ghn] = d.result;
                                                              });

                                                              var nccPanel = renderPanel('ncc', sup, sup.ncc_header, st.mergedNcc, diffsByFieldNcc, id, st.nccPresent);
                                                              var ghnPanel = renderPanel('ghn', sup, sup.ghn_header, st.mergedGhn, diffsByFieldGhn, id, st.ghnPresent);

                                                              var diffList = '';
                                                              if (st.fieldDiffs.length) {
                                                                      diffList = '<div class="diff-summary"><h4>Chi tiết sai lệch từng trường (Mã chuyến ' + escHtml(item.trip.ma_chuyen) + ')</h4>' +
                                                                                st.fieldDiffs.map(function (d) {
                                                                                            var label = d.result === 'conflict' ? 'Sai lệch giá trị' : (d.result === 'missing_ncc' ? 'NCC chưa nhập' : 'GHN không có');
                                                                                            return '<div class="diff-item ' + d.result + '"><div class="fname">' + escHtml(d.field_ncc) + '</div>' +
                                                                                                          '<div class="vals">' + label + ': <span class="v">NCC: ' + (escHtml(d.ncc_value) || '<i>(trống)</i>') + '</span>' +
                                                                                                          '<span class="v">GHN: ' + (escHtml(d.ghn_value) || '<i>(trống)</i>') + '</span></div>' +
                                                                                                          '<div class="sev-tag ' + d.severity + '">' + (d.severity === 'critical' ? 'Tài chính/vận hành' : 'Thông tin phụ') + '</div></div>';
                                                                                }).join('') + '</div>';
                                                              } else if (st.nccPresent && st.ghnPresent) {
                                                                      diffList = '<div class="diff-summary"><div class="empty-note">Không phát hiện sai lệch nào ở các trường được đối soát.</div></div>';
                                                              }

                                                              var dupNote = '';
                                                              if (item.trip.dup_total_ncc > 1 || item.trip.dup_total_ghn > 1) {
                                                                      dupNote = '<div class="empty-note" style="margin-bottom:10px;border-color:#dc2626;color:#dc2626">&#9888; Mã chuyến "' + escHtml(item.trip.ma_chuyen) + '" xuất hiện ' + item.trip.dup_total_ncc + ' lần bên NCC và ' + item.trip.dup_total_ghn + ' lần bên GHN — kiểm tra trùng lặp/ghép chuyến trước khi kết luận.</div>';
                                                              }

                                                              var ghiChuNote = '';
                                                              var ghiChuVal = normWs(item.trip.ghi_chu_ncc || (st.mergedNcc && st.mergedNcc['Ghi chú']) || '');
                                                              if (ghiChuVal) {
                                                                      ghiChuNote = '<div class="note-callout"><b>&#128221; Ghi chú của NCC (ngữ cảnh — không dùng để đối soát tự động):</b><div class="note-text">' + escHtml(ghiChuVal) + '</div></div>';
                                                              }

                                                              var canhBaoGiaNote = '';
                                                              var canhBaoGiaVal = normWs(item.trip.canh_bao_gia || '');
                                                              if (canhBaoGiaVal) {
                                                                      canhBaoGiaNote = '<div class="note-callout price"><b>&#128176; Lưu ý về giá (không phải lỗi đối soát):</b><div class="note-text">' + escHtml(canhBaoGiaVal) + '</div></div>';
                                                              }

                                                              return '<div class="detail">' + dupNote + ghiChuNote + canhBaoGiaNote +
                                                                      '<div class="detail-cols">' + nccPanel + ghnPanel + '</div>' +
                                                                      diffList +
                                                                      '<div class="detail-actions">' +
                                                                      '<button class="btn small" data-revert="' + id + '">Hoàn tác chỉnh sửa dòng này</button>' +
                                                                      '<button class="btn small primary" data-save="' + id + '">Lưu chỉnh sửa</button>' +
                                                                      '</div></div>';
                                                        }

                                                        function bindDetailEvents() {
                                                              el.tableBody.querySelectorAll('input[data-field]').forEach(function (inp) {
                                                                      inp.addEventListener('click', function (e) { e.stopPropagation(); });
                                                                      inp.addEventListener('change', function () {
                                                                                var id = inp.getAttribute('data-id'), side = inp.getAttribute('data-side'), field = inp.getAttribute('data-field');
                                                                                var ed = ensureEdit(id);
                                                                                ed[side][field] = inp.value;
                                                                                inp.closest('.field-row').classList.add('edited');
                                                                      });
                                                              });
                                                              el.tableBody.querySelectorAll('[data-add]').forEach(function (btn) {
                                                                      btn.addEventListener('click', function (e) {
                                                                                e.stopPropagation();
                                                                                var side = btn.getAttribute('data-add'), id = btn.getAttribute('data-id');
                                                                                var ed = ensureEdit(id);
                                                                                if (side === 'ncc') ed.addedNcc = true; else ed.addedGhn = true;
                                                                                saveEdits();
                                                                                renderAll();
                                                                      });
                                                              });
                                                              el.tableBody.querySelectorAll('[data-save]').forEach(function (btn) {
                                                                      btn.addEventListener('click', function (e) {
                                                                                e.stopPropagation();
                                                                                saveEdits();
                                                                                flash('Đã lưu chỉnh sửa (lưu trong trình duyệt này).');
                                                                                renderAll();
                                                                      });
                                                              });
                                                              el.tableBody.querySelectorAll('[data-revert]').forEach(function (btn) {
                                                                      btn.addEventListener('click', function (e) {
                                                                                e.stopPropagation();
                                                                                var id = btn.getAttribute('data-revert');
                                                                                delete edits[id];
                                                                                saveEdits();
                                                                                flash('Đã hoàn tác chỉnh sửa.');
                                                                                renderAll();
                                                                      });
                                                              });
                                                        }

                                                        function flash(msg) {
                                                              el.flash.textContent = msg;
                                                              el.flash.classList.add('show');
                                                              clearTimeout(el.flash._t);
                                                              el.flash._t = setTimeout(function () { el.flash.classList.remove('show'); }, 2600);
                                                        }

                                                        function renderAll() {
                                                              renderSummary();
                                                              renderSupplierTabs();
                                                              renderToolbar();
                                                              renderFieldBreakdown();
                                                              renderTable();
                                                              updateExportButtons();
                                                        }

                                                        // ---------- CSV export ----------
                                                        function csvEscape(v) {
                                                              v = v === undefined || v === null ? '' : String(v);
                                                              if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
                                                                        return v;
                                                                    }
                                                                      function downloadBlob(filename, content, mime) {
                                                                            var blob = new Blob(["﻿" + content], { type: mime || 'text/csv;charset=utf-8' });
                                                                            var url = URL.createObjectURL(blob);
                                                                            var a = document.createElement('a');
                                                                            a.href = url; a.download = filename;
                                                                            document.body.appendChild(a); a.click();
                                                                            setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 800);
                                                                      }

                                                                      function exportSupplierCsv(sIdx, side) {
                                                                            var sup = DATA.suppliers[sIdx];
                                                                            var header = side === 'ncc' ? sup.ncc_header : sup.ghn_header;
                                                                            var cols = header.filter(function (h) { return h; });
                                                                            var lines = [cols.map(csvEscape).join(',')];
                                                                            (sup.trips || []).forEach(function (trip, tIdx) {
                                                                                    var st = liveState(sIdx, tIdx);
                                                                                    var present = side === 'ncc' ? st.nccPresent : st.ghnPresent;
                                                                                    if (!present) return;
                                                                                    var rec = side === 'ncc' ? st.mergedNcc : st.mergedGhn;
                                                                                    lines.push(cols.map(function (c) { return csvEscape(rec[c]); }).join(','));
                                                                            });
                                                                            downloadBlob((side === 'ncc' ? 'NCC_' : 'GHN_') + sup.sheet_ncc.replace('NCC_', '').replace(/\s+/g, '_') + '_capnhat.csv', lines.join('\r\n'));
                                                                      }

                                                                      function exportDiffReportCsv() {
                                                                            var cols = ['Tên NCC', 'Mã chuyến', 'Trạng thái', 'Số trường sai lệch nghiêm trọng', 'Số trường thiếu/khác thông tin', 'Chi tiết sai lệch', 'Ghi chú NCC (ngữ cảnh, không đối soát)'];
                                                                            var lines = [cols.map(csvEscape).join(',')];
                                                                            DATA.suppliers.forEach(function (sup, sIdx) {
                                                                                    (sup.trips || []).forEach(function (trip, tIdx) {
                                                                                              var st = liveState(sIdx, tIdx);
                                                                                              if (st.status === 'match') return;
                                                                                              var nCrit = st.fieldDiffs.filter(function (d) { return d.severity === 'critical'; }).length;
                                                                                              var nInfo = st.fieldDiffs.filter(function (d) { return d.severity === 'info'; }).length;
                                                                                              var detail = st.fieldDiffs.map(function (d) {
                                                                                                          return d.field_ncc + ' [NCC:' + (d.ncc_value || '(trống)') + ' | GHN:' + (d.ghn_value || '(trống)') + ']';
                                                                                              }).join('; ');
                                                                                              if (st.status === 'ncc_only') detail = 'Chuyến chỉ có bên NCC, GHN chưa có dữ liệu.';
                                                                                              if (st.status === 'ghn_only') detail = 'Chuyến chỉ có bên GHN, NCC chưa nhập.';
                                                                                              var ghiChu = normWs(trip.ghi_chu_ncc || (st.mergedNcc && st.mergedNcc['Ghi chú']) || '');
                                                                                              lines.push([sup.ten_ncc, trip.ma_chuyen, STATUS_LABEL[st.status], nCrit, nInfo, detail, ghiChu].map(csvEscape).join(','));
                                                                                    });
                                                                            });
                                                                            downloadBlob('BaoCao_DoiSoat_SaiLech_' + (new Date().toISOString().slice(0, 10)) + '.csv', lines.join('\r\n'));
                                                                      }

                                                                      function updateExportButtons() {
                                                                            el.exportButtons.innerHTML = DATA.suppliers.map(function (sup, idx) {
                                                                                    var short = sup.ten_ncc.split(' ').slice(-2).join(' ');
                                                                                    return '<button class="btn small" data-exp-ncc="' + idx + '">Xuất CSV NCC – ' + escHtml(short) + '</button>' +
                                                                                              '<button class="btn small" data-exp-ghn="' + idx + '">Xuất CSV GHN – ' + escHtml(short) + '</button>';
                                                                            }).join('');
                                                                            el.exportButtons.querySelectorAll('[data-exp-ncc]').forEach(function (b) {
                                                                                    b.addEventListener('click', function () { exportSupplierCsv(parseInt(b.getAttribute('data-exp-ncc'), 10), 'ncc'); });
                                                                            });
                                                                            el.exportButtons.querySelectorAll('[data-exp-ghn]').forEach(function (b) {
                                                                                    b.addEventListener('click', function () { exportSupplierCsv(parseInt(b.getAttribute('data-exp-ghn'), 10), 'ghn'); });
                                                                            });
                                                                      }

                                                                      // ================= Nạp dữ liệu sống từ /api/gas (action getReconData) =================
                                                                      // Dùng lại đúng logic đối soát (compareField...) đã verify khớp 100% với build_recon.py.
                                                                      function parseCSV(text) {
                                                                            var rows = [], row = [], field = '', inQuotes = false;
                                                                            for (var i = 0; i < text.length; i++) {
                                                                                    var c = text[i];
                                                                                    if (inQuotes) {
                                                                                              if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
                                                                                              else field += c;
                                                                                    } else {
                                                                                              if (c === '"') inQuotes = true;
                                                                                              else if (c === ',') { row.push(field); field = ''; }
                                                                                              else if (c === '\r') { /* skip */ }
                                                                                              else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
                                                                                              else field += c;
                                                                                    }
                                                                            }
                                                                            if (field.length || row.length) { row.push(field); rows.push(row); }
                                                                            return rows;
                                                                      }

                                                                      function rowsToRecordsJS(rows) {
                                                                            if (!rows || !rows.length) return { header: [], records: [] };
                                                                            var header = rows[0].slice();
                                                                            var lastReal = -1;
                                                                            header.forEach(function (h, i) { if (normWs(h) !== '') lastReal = i; });
                                                                            header = header.slice(0, lastReal + 1).map(function (h) { return normWs(h); });
                                                                            var records = [];
                                                                            for (var r = 1; r < rows.length; r++) {
                                                                                    var row = rows[r];
                                                                                    if (row.every(function (c) { return normWs(c) === ''; })) continue;
                                                                                    var rec = {};
                                                                                    header.forEach(function (h, i) { rec[h] = row[i] !== undefined ? row[i] : ''; });
                                                                                    records.push(rec);
                                                                            }
                                                                            return { header: header, records: records };
                                                                      }

                                                                      function detectDateFormatJS(values) {
                                                                            var sawMdy = false;
                                                                            for (var i = 0; i < values.length; i++) {
                                                                                    var s = normWs(values[i]);
                                                                                    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                                                                                    if (!m) continue;
                                                                                    var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
                                                                                    if (a > 12) return 'DMY';
                                                                                    if (b > 12) sawMdy = true;
                                                                            }
                                                                            return sawMdy ? 'MDY' : 'DMY';
                                                                      }

                                                                      var MASTER_FIELD_META_JS = {
                                                                            'Ngày kết thúc': ['date', 'critical'], 'Biển số xe': ['plate', 'critical'],
                                                                                  'Tải trọng': ['number', 'critical'], 'Hình thức tính giá': ['text', 'critical'],
                                                                                        'Lộ trình kết thúc': ['route', 'info'], 'Số km': ['number', 'critical'],
                                                                                              'Đơn giá': ['number', 'critical'], 'Phí cầu đường': ['number', 'critical'],
                                                                                                    'Phí dừng tải': ['number', 'critical'], 'Tỉ lệ Ontime': ['number', 'info'],
                                                                                                          'Số tiền': ['number', 'critical'], 'Mã tuyến': ['text', 'critical'],
                                                                                                                'Ghi chú': ['text', 'info'], 'Ngày bắt đầu chuyến': ['date', 'info'],
                                                                      };

                                                                      function collectNccSamplesJS(rawData, fieldName, limit) {
                                                                            limit = limit || 200;
                                                                            var samples = [];
                                                                            for (var key in rawData) {
                                                                                    if (key.indexOf('NCC_') !== 0) continue;
                                                                                    var rr = rowsToRecordsJS(rawData[key]);
                                                                                    if (rr.header.indexOf(fieldName) === -1) continue;
                                                                                    for (var i = 0; i < rr.records.length; i++) {
                                                                                              samples.push(rr.records[i][fieldName] || '');
                                                                                              if (samples.length >= limit) return samples;
                                                                                    }
                                                                            }
                                                                            return samples;
                                                                      }

                                                                      function inferFieldTypeJS(name, samples) {
                                                                            var nonEmpty = samples.map(normWs).filter(function (v) { return v !== ''; });
                                                                            if (!nonEmpty.length) return 'text';
                                                                            var n = nonEmpty.length;
                                                                            var dateRe = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
                                                                            var dateCnt = nonEmpty.filter(function (v) { return dateRe.test(v); }).length;
                                                                            if (dateCnt / n > 0.6) return 'date';
                                                                            var lname = name.toLowerCase();
                                                                            if (lname.indexOf('biển số') !== -1 || lname.indexOf('bien so') !== -1) return 'plate';
                                                                            if (lname.indexOf('lộ trình') !== -1 || lname.indexOf('tuyến đường') !== -1 || lname.indexOf('route') !== -1) return 'route';
                                                                            var numCnt = nonEmpty.filter(function (v) { return parseVNNumber(v) !== null; }).length;
                                                                            if (numCnt / n > 0.6) return 'number';
                                                                            return 'text';
                                                                      }

                                                                      function buildFieldMapFromSettingJS(rawData) {
                                                                            var settingRows = rawData['Setting'];
                                                                            if (!settingRows) return null;
                                                                            var rr = rowsToRecordsJS(settingRows);
                                                                            var fieldMap = [];
                                                                            rr.records.forEach(function (rec) {
                                                                                    var name = normWs(rec['Tiêu chí'] || '');
                                                                                    var cfg = normWs(rec['Config'] || '').toUpperCase();
                                                                                    if (!name) return;
                                                                                    var enabled = ['TRUE', '1', 'YES', 'CÓ', 'X', 'ON'].indexOf(cfg) !== -1;
                                                                                    if (!enabled) return;
                                                                                    if (normKey(name) === normKey('Mã chuyến')) return;
                                                                                    var ftype, sev;
                                                                                    if (MASTER_FIELD_META_JS[name]) { ftype = MASTER_FIELD_META_JS[name][0]; sev = MASTER_FIELD_META_JS[name][1]; }
                                                                                    else { ftype = inferFieldTypeJS(name, collectNccSamplesJS(rawData, name)); sev = 'critical'; }
                                                                                    fieldMap.push({ field_ncc: name, field_ghn: name, type: ftype, severity: sev });
                                                                            });
                                                                            return fieldMap;
                                                                      }

                                                                      function groupByKeyJS(records, keyField) {
                                                                            var groups = {};
                                                                            records.forEach(function (rec) {
                                                                                    var k = normKey(rec[keyField] || '');
                                                                                    if (!k) return;
                                                                                    (groups[k] = groups[k] || []).push(rec);
                                                                            });
                                                                            return groups;
                                                                      }

                                                                      function rebuildDiffData(rawData) {
                                                                            var mainRR = rowsToRecordsJS(rawData['Main']);
                                                                            var suppliersMeta = mainRR.records.map(function (m) {
                                                                                    return {
                                                                                              ten_ncc: normWs(m['Tên NCC'] || ''), partner_id: normWs(m['Partner ID'] || ''),
                                                                                              sheet_ncc: normWs(m['Sheet Name NCC'] || ''), sheet_ghn: normWs(m['Sheet Name GHN'] || ''),
                                                                                    };
                                                                            });

                                                                            var newFieldMap = buildFieldMapFromSettingJS(rawData) || FIELD_MAP;

                                                                            var overall = { total_ncc_trips: 0, total_ghn_trips: 0, matched_no_diff: 0, matched_with_diff: 0,
                                                                                                 ncc_only: 0, ghn_only: 0, total_field_conflicts: 0, total_field_missing: 0, critical_conflicts: 0 };
                                                                            var suppliersOut = [];

                                                                            suppliersMeta.forEach(function (sup) {
                                                                                    var nccRaw = rawData[sup.sheet_ncc], ghnRaw = rawData[sup.sheet_ghn];
                                                                                    if (!nccRaw || !ghnRaw) {
                                                                                              suppliersOut.push({ ten_ncc: sup.ten_ncc, partner_id: sup.partner_id, sheet_ncc: sup.sheet_ncc, sheet_ghn: sup.sheet_ghn, error: 'Không tìm thấy sheet' });
                                                                                              return;
                                                                                    }
                                                                                    var nccRR = rowsToRecordsJS(nccRaw), ghnRR = rowsToRecordsJS(ghnRaw);
                                                                                    var nccGroups = groupByKeyJS(nccRR.records, 'Mã chuyến');
                                                                                    var ghnGroups = groupByKeyJS(ghnRR.records, 'Mã chuyến');
                                                                                    var allKeysSet = {};
                                                                                    Object.keys(nccGroups).forEach(function (k) { allKeysSet[k] = 1; });
                                                                                    Object.keys(ghnGroups).forEach(function (k) { allKeysSet[k] = 1; });
                                                                                    var allKeys = Object.keys(allKeysSet).sort();

                                                                                    var dateFmtCache = {};
                                                                                    newFieldMap.forEach(function (f) {
                                                                                              if (f.type !== 'date') return;
                                                                                              dateFmtCache['ncc:' + f.field_ncc] = detectDateFormatJS(nccRR.records.map(function (r) { return r[f.field_ncc] || ''; }));
                                                                                              dateFmtCache['ghn:' + f.field_ghn] = detectDateFormatJS(ghnRR.records.map(function (r) { return r[f.field_ghn] || ''; }));
                                                                                    });

                                                                                    var trips = [];
                                                                                    var nccOnlyCount = 0, ghnOnlyCount = 0, matchedNoDiff = 0, matchedWithDiff = 0, fieldConflicts = 0, fieldMissing = 0, criticalConflicts = 0;

                                                                                    allKeys.forEach(function (key) {
                                                                                              var nccList = nccGroups[key] || [], ghnList = ghnGroups[key] || [];
                                                                                              var nNcc = nccList.length, nGhn = ghnList.length, pairCount = Math.min(nNcc, nGhn);
                                                                                              for (var i = 0; i < pairCount; i++) {
                                                                                                          var nccRec = nccList[i], ghnRec = ghnList[i];
                                                                                                          var diffs = [], hasCritical = false, hasInfo = false;
                                                                                                          var gN0 = computeGiaGoc(nccRec), gG0 = computeGiaGoc(ghnRec);
                                                                                                          newFieldMap.forEach(function (f) {
                                                                                                                        if (f.field_ncc === 'Số tiền') {
                                                                                                                                        var res3;
                                                                                                                                        if (gN0.val === null && gG0.val === null) res3 = 'match';
                                                                                                                                        else if (gN0.val === null) res3 = 'missing_ncc';
                                                                                                                                                        else if (gG0.val === null) res3 = 'missing_ghn';
                                                                                                                                                        else {
                                                                                                                                                          var eps3 = (Math.abs(gN0.val) > 1000 || Math.abs(gG0.val) > 1000) ? EPS_LARGE : EPS_SMALL;
                                                                                                                                                          res3 = Math.abs(gN0.val - gG0.val) <= eps3 ? 'match' : 'conflict';
                                                                                                                                        }
                                                                                                                                        if (res3 !== 'match') {
                                                                                                                                                          diffs.push({
                                                                                                                                                                              field_ncc: f.field_ncc, field_ghn: f.field_ghn, type: f.type, severity: f.severity, result: res3,
                                                                                                                                                                              ncc_value: gN0.val !== null ? String(Math.round(gN0.val)) : '',
                                                                                                                                                                              ghn_value: gG0.val !== null ? String(Math.round(gG0.val)) : '',
                                                                                                                                                                              note: 'Giá trị đã quy đổi theo công thức Hình thức tính giá (Cost/chuyến = Đơn giá; Cost/km = Đơn giá × Số km) — chưa gồm phí cầu đường/dừng tải.',
                                                                                                                                                          });
                                                                                                                                                          if (res3 === 'conflict') fieldConflicts++; else fieldMissing++;
                                                                                                                                                          if (f.severity === 'critical') hasCritical = true; else hasInfo = true;
                                                                                                                                        }
                                                                                                                                        return;
                                                                                                                        }
                                                                                                                        var nccFmt = dateFmtCache['ncc:' + f.field_ncc] || 'DMY';
                                                                                                                        var ghnFmt = dateFmtCache['ghn:' + f.field_ghn] || 'DMY';
                                                                                                                        var nccV = nccRec[f.field_ncc] || '', ghnV = ghnRec[f.field_ghn] || '';
                                                                                                                        var res = compareField(f.type, nccV, ghnV, nccFmt, ghnFmt);
                                                                                                                        if (res !== 'match') {
                                                                                                                                        diffs.push({ field_ncc: f.field_ncc, field_ghn: f.field_ghn, type: f.type, severity: f.severity, result: res, ncc_value: nccV, ghn_value: ghnV });
                                                                                                                                        if (res === 'conflict') fieldConflicts++; else fieldMissing++;
                                                                                                                                        if (f.severity === 'critical') hasCritical = true; else hasInfo = true;
                                                                                                                        }
                                                                                                          });
                                                                                                          var status = hasCritical ? 'critical' : (hasInfo ? 'info' : 'match');
                                                                                                          if (status === 'match') matchedNoDiff++; else matchedWithDiff++;
                                                                                                          if (hasCritical) criticalConflicts++;
                                                                                                          var priceNote0 = [];
                                                                                                          var pcd0 = parseVNNumber(nccRec['Phí cầu đường']), pdt0 = parseVNNumber(nccRec['Phí dừng tải']);
                                                                                                          var extra0 = [];
                                                                                                          if (pcd0 && pcd0 > 0) extra0.push('phí cầu đường ' + nccRec['Phí cầu đường']);
                                                                                                          if (pdt0 && pdt0 > 0) extra0.push('phí dừng tải ' + nccRec['Phí dừng tải']);
                                                                                                          if (extra0.length) priceNote0.push('NCC có cộng thêm ' + extra0.join(' + ') + ' vào "Số tiền" khai báo — GHN hiện CHƯA import khoản phí này, cần cộng bù khi đối soát thanh toán (không phải lỗi NCC).');
                                                                                                          if (gN0.note === 'unknown_hinh_thuc') priceNote0.push('Không xác định được "Hình thức tính giá" bên NCC — đang tạm dùng Đơn giá làm giá gốc, cần kiểm tra thủ công.');
                                                                                                          if (gG0.note === 'unknown_hinh_thuc') priceNote0.push('Không xác định được "Hình thức tính giá" bên GHN — đang tạm dùng Đơn giá làm giá gốc, cần kiểm tra thủ công.');
                                                                                                          trips.push({
                                                                                                                        ma_chuyen: key, status: status, has_critical_conflict: hasCritical,
                                                                                                                        ncc_record: nccRec, ghn_record: ghnRec, field_diffs: diffs,
                                                                                                                        ghi_chu_ncc: normWs(nccRec['Ghi chú'] || ''),
                                                                                                                        canh_bao_gia: priceNote0.join(' | '),
                                                                                                                        dup_index: i, dup_total_ncc: nNcc, dup_total_ghn: nGhn,
                                                                                                          });
                                                                                              }
                                                                                              for (var j = pairCount; j < nNcc; j++) {
                                                                                                          nccOnlyCount++;
                                                                                                          trips.push({
                                                                                                                        ma_chuyen: key, status: 'ncc_only', has_critical_conflict: true,
                                                                                                                        ncc_record: nccList[j], ghn_record: null, field_diffs: [],
                                                                                                                                      ghi_chu_ncc: normWs(nccList[j]['Ghi chú'] || ''),
                                                                                                                        dup_index: j, dup_total_ncc: nNcc, dup_total_ghn: nGhn,
                                                                                                          });
                                                                                              }
                                                                                              for (var k2 = pairCount; k2 < nGhn; k2++) {
                                                                                                          ghnOnlyCount++;
                                                                                                          trips.push({
                                                                                                                        ma_chuyen: key, status: 'ghn_only', has_critical_conflict: true,
                                                                                                                        ncc_record: null, ghn_record: ghnList[k2], field_diffs: [], ghi_chu_ncc: '',
                                                                                                                        dup_index: k2, dup_total_ncc: nNcc, dup_total_ghn: nGhn,
                                                                                                          });
                                                                                              }
                                                                                    });

                                                                                    var statusRank = { ncc_only: 0, ghn_only: 0, critical: 1, info: 2, match: 3 };
                                                                                    trips.sort(function (a, b) {
                                                                                              var ra = statusRank[a.status] != null ? statusRank[a.status] : 9;
                                                                                              var rb = statusRank[b.status] != null ? statusRank[b.status] : 9;
                                                                                              if (ra !== rb) return ra - rb;
                                                                                              return a.ma_chuyen < b.ma_chuyen ? -1 : (a.ma_chuyen > b.ma_chuyen ? 1 : 0);
                                                                                    });

                                                                                    var summary = {
                                                                                              total_ncc_trips: nccRR.records.length, total_ghn_trips: ghnRR.records.length,
                                                                                              unique_ma_chuyen: allKeys.length, matched_no_diff: matchedNoDiff, matched_with_diff: matchedWithDiff,
                                                                                              ncc_only: nccOnlyCount, ghn_only: ghnOnlyCount, total_field_conflicts: fieldConflicts,
                                                                                              total_field_missing: fieldMissing, critical_conflicts: criticalConflicts,
                                                                                              date_formats_detected: dateFmtCache,
                                                                                    };

                                                                                    ['total_ncc_trips', 'total_ghn_trips', 'matched_no_diff', 'matched_with_diff', 'ncc_only', 'ghn_only'].forEach(function (k) { overall[k] += summary[k]; });
                                                                                    overall.total_field_conflicts += fieldConflicts;
                                                                                    overall.total_field_missing += fieldMissing;
                                                                                    overall.critical_conflicts += criticalConflicts;

                                                                                    suppliersOut.push({
                                                                                              ten_ncc: sup.ten_ncc, partner_id: sup.partner_id, sheet_ncc: sup.sheet_ncc, sheet_ghn: sup.sheet_ghn,
                                                                                              ncc_header: nccRR.header, ghn_header: ghnRR.header, summary: summary, trips: trips,
                                                                                    });
                                                                            });

                                                                            overall.matched_trips = overall.matched_no_diff + overall.matched_with_diff;
                                                                            return { field_map: newFieldMap, suppliers: suppliersOut, overall_summary: overall };
                                                                      }

                                                                      function collectSheetNamesNeeded() {
                                                                            var names = ['Main', 'Setting', 'Tổng hợp'];
                                                                            DATA.suppliers.forEach(function (sup) {
                                                                                    if (sup.sheet_ncc) names.push(sup.sheet_ncc);
                                                                                    if (sup.sheet_ghn) names.push(sup.sheet_ghn);
                                                                            });
                                                                            return names;
                                                                      }

                                                                      function fetchAllSheetsAnonymous() {
                                                                            return apiPost('getReconData').then(function (res) {
                                                                                    if (!res || !res.ok) {
                                                                                              throw new Error((res && res.error) || 'khong_ket_noi_duoc_may_chu');
                                                                                    }
                                                                                    return res.raw;
                                                                            });
                                                                      }

                                                                      function handleRefreshData() {
                                                                            var btn = $('btnRefreshData');
                                                                            var originalText = btn.textContent;
                                                                            btn.disabled = true;
                                                                            btn.textContent = 'Đang tải dữ liệu mới…';
                                                                            fetchAllSheetsAnonymous().then(function (rawData) {
                                                                                    var newData = rebuildDiffData(rawData);
                                                                                    DATA.field_map = newData.field_map;
                                                                                    DATA.suppliers = newData.suppliers;
                                                                                    DATA.overall_summary = newData.overall_summary;
                                                                                    FIELD_MAP = DATA.field_map;
                                                                                    FIELD_LABEL_MAP = {};
                                                                                    FIELD_MAP.forEach(function (f) { FIELD_LABEL_MAP[f.field_ncc] = f.field_ncc; });
                                                                                    DATA.suppliers.forEach(function (sup, sIdx) {
                                                                                              if (!sup.trips) return;
                                                                                              sup.trips.forEach(function (trip, tIdx) { trip._id = tripId(sIdx, tIdx); trip._sup = sIdx; });
                                                                                    });
                                                                                    state.page = 1; state.expandedId = null;
                                                                                    renderAll();
                                                                                    flash('Đã cập nhật dữ liệu mới nhất từ Google Sheet lúc ' + new Date().toLocaleString('vi-VN') + '.');
                                                                            }).catch(function (err) {
                                                                                    var msg = err && err.message ? err.message : String(err);
                                                                                    if (msg === 'session_expired') {
                                                                                              alert('Phiên đăng nhập đã hết hạn. Trang sẽ tải lại để bạn đăng nhập lại.');
                                                                                              try { localStorage.removeItem(TOKEN_KEY); } catch (e2) {}
                                                                                              location.reload();
                                                                                              return;
                                                                                    }
                                                                                    alert('Không tải được dữ liệu mới nhất từ Google Sheet.\n\nChi tiết lỗi kỹ thuật: ' + msg);
                                                                            }).finally(function () {
                                                                                    btn.disabled = false;
                                                                                    btn.textContent = originalText;
                                                                            });
                                                                      }

                                                                      // ---------- Đăng nhập (tài khoản @ghn.vn, cùng backend với Báo Cáo Vận Hành) + nạp dữ liệu sống ----------
                                                                      function showLogin(errMsg) {
                                                                            $('loadingGate').style.display = 'none';
                                                                            $('appRoot').style.display = 'none';
                                                                            $('loginGate').style.display = '';
                                                                            var errEl = $('loginError');
                                                                            if (errMsg) { errEl.textContent = errMsg; errEl.style.display = ''; } else { errEl.style.display = 'none'; }
                                                                      }

                                                                      function doLogin() {
                                                                            var email = $('loginEmail').value.trim();
                                                                            var password = $('loginPassword').value;
                                                                            var btn = $('loginBtn');
                                                                            btn.disabled = true; btn.textContent = 'Đang đăng nhập…';
                                                                            apiPost('login', { email: email, password: password }).then(function (res) {
                                                                                    if (!res || !res.ok || !res.token) {
                                                                                              showLogin((res && res.error) || 'Đăng nhập thất bại — kiểm tra lại email/mật khẩu.');
                                                                                              return;
                                                                                    }
                                                                                    TOKEN = res.token;
                                                                                    try { localStorage.setItem(TOKEN_KEY, TOKEN); } catch (e) {}
                                                                                    loadLiveData();
                                                                            }).catch(function (err) {
                                                                                    showLogin('Lỗi kết nối: ' + (err && err.message ? err.message : err));
                                                                            }).finally(function () {
                                                                                    btn.disabled = false; btn.textContent = 'Đăng nhập';
                                                                            });
                                                                      }

                                                                      function loadLiveData() {
                                                                            $('loginGate').style.display = 'none';
                                                                            $('appRoot').style.display = 'none';
                                                                            $('loadingGate').style.display = '';
                                                                            fetchAllSheetsAnonymous().then(function (rawData) {
                                                                                    var newData = rebuildDiffData(rawData);
                                                                                    DATA.field_map = newData.field_map;
                                                                                    DATA.suppliers = newData.suppliers;
                                                                                    DATA.overall_summary = newData.overall_summary;
                                                                                    FIELD_MAP = DATA.field_map;
                                                                                    FIELD_LABEL_MAP = {};
                                                                                    FIELD_MAP.forEach(function (f) { FIELD_LABEL_MAP[f.field_ncc] = f.field_ncc; });
                                                                                    DATA.suppliers.forEach(function (sup, sIdx) {
                                                                                              if (!sup.trips) return;
                                                                                              sup.trips.forEach(function (trip, tIdx) { trip._id = tripId(sIdx, tIdx); trip._sup = sIdx; });
                                                                                    });
                                                                                    $('loadingGate').style.display = 'none';
                                                                                    $('appRoot').style.display = '';
                                                                                    state.page = 1; state.expandedId = null;
                                                                                    renderAll();
                                                                            }).catch(function (err) {
                                                                                    var msg = err && err.message ? err.message : String(err);
                                                                                    if (msg === 'session_expired') {
                                                                                              try { localStorage.removeItem(TOKEN_KEY); } catch (e2) {}
                                                                                              TOKEN = null;
                                                                                              showLogin('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
                                                                                              return;
                                                                                    }
                                                                                    showLogin('Không tải được dữ liệu đối soát: ' + msg);
                                                                            });
                                                                      }

                                                                      // ---------- Init ----------
                                                                      document.addEventListener('DOMContentLoaded', function () {
                                                                            el.summaryGrid = $('summaryGrid');
                                                                            el.supplierTabs = $('supplierTabs');
                                                                            el.statusFilters = $('statusFilters');
                                                                            el.searchBox = $('searchBox');
                                                                            el.tableBody = $('tableBody');
                                                                            el.pagination = $('pagination');
                                                                            el.flash = $('flash');
                                                                            el.exportButtons = $('exportButtons');
                                                                            el.fieldBreakdown = $('fieldBreakdown');

                                                                            el.searchBox.addEventListener('input', function () {
                                                                                    state.search = el.searchBox.value; state.page = 1; state.expandedId = null; renderTable();
                                                                            });

                                                                            $('btnExportDiff').addEventListener('click', exportDiffReportCsv);
                                                                            $('btnRefreshData').addEventListener('click', handleRefreshData);
                                                                            $('btnResetEdits').addEventListener('click', function () {
                                                                                    if (confirm('Xoá toàn bộ chỉnh sửa đã lưu trong trình duyệt này? Không ảnh hưởng dữ liệu gốc trên Google Sheet.')) {
                                                                                              edits = {}; saveEdits(); flash('Đã xoá toàn bộ chỉnh sửa.'); renderAll();
                                                                                    }
                                                                            });
                                                                            $('loginBtn').addEventListener('click', doLogin);
                                                                            $('loginPassword').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

                                                                            if (TOKEN) { loadLiveData(); } else { showLogin(); }
                                                                      });
                                                                    })();
                                                                    
