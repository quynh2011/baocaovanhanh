// Test backend bản nháp quy hoạch (qhDraftList/Save/Delete) với sheet + GHN + GAS giả. Chạy: node quyhoach/tests/draft_server_test.js
const R = require('path').resolve(__dirname, '../..') + '/';
const sc = require(R + 'api/_sheetsClient.js');
let sheet = [];
sc.ensureSheetWithHeaders = async (id, t, h) => { if (!sheet.length && h) sheet = [h.slice()]; return {}; };
sc.getValues = async () => sheet.map(r => r.slice());
sc.putValues = async (id, rg, rows) => { const m = /!A(\d+):[A-Z]+\d+$/.exec(rg) || /!G(\d+):I\d+$/.exec(rg); const r = +m[1] - 1; const off = /!G/.test(rg) ? 6 : 0; sheet[r] = sheet[r] || []; rows[0].forEach((v, i) => { sheet[r][off + i] = v; }); };
const users = { web_admin: 'Admin', web_nv: 'Nhân viên' };
sc.requireActiveUser = async (t) => users[t] ? { email: t + '@ghn.vn', name: t, role: users[t] } : { error: 'session_expired' };
global.fetch = async (url, opt = {}) => {
  url = String(url);
  const resp = (st, o) => ({ status: st, ok: st === 200, json: async () => o, text: async () => JSON.stringify(o) });
  if (url.includes('my-profile')) { const t = opt.headers.authorization.split(' ')[1]; return t === 'ghnQL' ? resp(200, { data: { userInfo: { ssoId: '111', profile: { fullname: 'Quản lý A' } } } }) : resp(401, {}); }
  if (url.includes('script.google')) { const u = new URL(url); const ok = u.searchParams.get('action') === 'getPermission' && u.searchParams.get('ssoId') === '111'; return resp(200, ok ? { ok: true, found: true, role: 'QUAN_LY' } : { ok: true, found: false }); }
  throw new Error('url ' + url);
};
const q = require(R + 'api/_qhSync.js');
const big = { v: 1, wh: { N1: Array.from({ length: 9000 }, (_, i) => String(100000 + i)) }, nh: [{ id: 'N1', name: 'BC mới', lat: 21, lng: 105, am: 'X' }], ham: { '123': 'AM mới' } };
(async () => {
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  ok((await q.handleQhDraftList({})).error === 'session_expired', 'không đăng nhập bị chặn');
  const nv = await q.handleQhDraftList({ token: 'web_nv' }); ok(nv.ok && !nv.canEdit, 'nhân viên xem được, không sửa');
  ok((await q.handleQhDraftSave({ token: 'web_nv', draft: { data: big } })).error === 'khong_co_quyen_sua', 'nhân viên không lưu được');
  const s1 = await q.handleQhDraftSave({ token: 'web_admin', draft: { ten: '=Bản A', data: big } }); ok(s1.ok, 'admin lưu được (dữ liệu ' + JSON.stringify(big).length + ' ký tự)');
  const l1 = await q.handleQhDraftList({ token: 'web_nv' }); ok(l1.drafts.length === 1 && l1.drafts[0].data.wh.N1.length === 9000 && l1.drafts[0].ten === 'Bản A', 'đọc lại đủ dữ liệu cắt nhiều ô, tên bỏ dấu =');
  const g = await q.handleQhDraftList({ ghnToken: 'ghnQL' }); ok(g.ok && g.canEdit && g.who === 'Quản lý A', 'Tampermonkey: token GHN quản lý được sửa');
  ok((await q.handleQhDraftList({ ghnToken: 'sai' })).error === 'ghn_token_het_han', 'token GHN sai bị chặn');
  ok((await q.handleQhDraftSave({ ghnToken: 'ghnQL', draft: { id: s1.id, suaLuc: 'cu', data: big } })).error === 'ban_nhap_da_bi_sua', 'chặn ghi đè khi người khác vừa sửa');
  const s2 = await q.handleQhDraftSave({ ghnToken: 'ghnQL', draft: { id: s1.id, suaLuc: s1.suaLuc, ten: 'Bản A2', data: { v: 1, wh: {}, nh: [], ham: {} } } }); ok(s2.ok && s2.id === s1.id, 'sửa đúng bản');
  ok((await q.handleQhDraftDelete({ ghnToken: 'ghnQL', id: s1.id })).error === 'chi_nguoi_tao_hoac_admin_duoc_xoa', 'quản lý không xoá bản người khác');
  ok((await q.handleQhDraftDelete({ token: 'web_admin', id: s1.id })).ok, 'admin xoá được');
  ok((await q.handleQhDraftList({ token: 'web_admin' })).drafts.length === 0, 'bản đã xoá không còn trong danh sách');
})();
