/* =========================================================
   TIMESHEET — Bảng công tháng + Complaints
   ========================================================= */

let _tsAdminYear  = new Date().getFullYear();
let _tsAdminMonth = new Date().getMonth() + 1;
let _tsAdminEmpId = '';
let _tsAdminData  = {};        // dateStr -> { work_days, overtime_hours, complaint_count }
let _tsAdminSelected = null;
let _tsAdminComplaints = [];
let _tsAdminSaving = false;

let _tsUserYear  = new Date().getFullYear();
let _tsUserMonth = new Date().getMonth() + 1;
let _tsUserData  = {};

/* ========== HELPERS ========== */
function _tsDaysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function _tsDateStr(y, m, d) { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function _tsDow(dateStr) {
  const d = new Date(dateStr + 'T00:00:00').getDay();
  return ['CN','T2','T3','T4','T5','T6','T7'][d];
}
function _tsDowFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'][d.getDay()];
}
function _tsIsWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00').getDay();
  return d === 0 || d === 6;
}
function _tsFormatMonth(y, m) { return `${String(m).padStart(2,'0')}/${y}`; }
function _tsFmtNum(n) {
  if (n === null || n === undefined) return '–';
  return n % 1 === 0 ? String(n) : Number(n).toFixed(1);
}

/* =========================================================
   ADMIN — LOAD
   ========================================================= */
async function loadAdminTimesheet() {
  const wrap = $('tsAdminGrid');
  const alertEl = $('tsAdminAlert');
  if (!wrap) return;

  hideAlert(alertEl);

  if (!_tsAdminEmpId) {
    wrap.innerHTML = '<p style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">Chọn nhân viên để xem bảng công.</p>';
    return;
  }

  wrap.innerHTML = '<p style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">⏳ Đang tải...</p>';

  try {
    const days = _tsDaysInMonth(_tsAdminYear, _tsAdminMonth);
    const start = _tsDateStr(_tsAdminYear, _tsAdminMonth, 1);
    const end = _tsDateStr(_tsAdminYear, _tsAdminMonth, days);

    const [tsRes, compRes] = await Promise.all([
      supabaseClient.from('timesheet').select('*')
        .eq('employee_id', _tsAdminEmpId).gte('work_date', start).lte('work_date', end),
      supabaseClient.from('complaints').select('work_date')
        .eq('employee_id', _tsAdminEmpId).gte('work_date', start).lte('work_date', end),
    ]);

    if (tsRes.error) throw tsRes.error;
    if (compRes.error) throw compRes.error;

    const data = {};
    for (let d = 1; d <= days; d++) {
      const ds = _tsDateStr(_tsAdminYear, _tsAdminMonth, d);
      data[ds] = { work_days: null, overtime_hours: null, complaint_count: 0 };
    }

    (tsRes.data || []).forEach(row => {
      const ds = (row.work_date || '').split('T')[0];
      if (data[ds]) {
        data[ds].work_days = row.work_days != null ? Number(row.work_days) : null;
        data[ds].overtime_hours = row.overtime_hours != null ? Number(row.overtime_hours) : null;
      }
    });

    (compRes.data || []).forEach(row => {
      const ds = (row.work_date || '').split('T')[0];
      if (data[ds]) data[ds].complaint_count++;
    });

    _tsAdminData = data;
    renderAdminTimesheetGrid();
  } catch (err) {
    console.error('loadAdminTimesheet:', err);
    wrap.innerHTML = `<p style="text-align:center;padding:40px 20px;color:var(--error);font-size:13px;">Lỗi: ${escapeHtml(err.message || 'không xác định')}</p>`;
  }
}

/* ========== ADMIN — RENDER GRID ========== */
function renderAdminTimesheetGrid() {
  const wrap = $('tsAdminGrid');
  const days = _tsDaysInMonth(_tsAdminYear, _tsAdminMonth);
  const today = todayISO();

  let totalWork = 0, totalOT = 0;
  Object.values(_tsAdminData).forEach(d => {
    if (typeof d.work_days === 'number') totalWork += d.work_days;
    if (typeof d.overtime_hours === 'number') totalOT += d.overtime_hours;
  });

  let html = '<div class="ts-scroll"><table class="ts-grid"><thead><tr>';
  html += '<th class="ts-th-label">Ngày</th>';
  for (let d = 1; d <= days; d++) {
    const ds = _tsDateStr(_tsAdminYear, _tsAdminMonth, d);
    const w = _tsIsWeekend(ds) ? ' weekend' : '';
    const t = ds === today ? ' is-today' : '';
    const c = _tsAdminData[ds]?.complaint_count > 0 ? ' has-complaint' : '';
    html += `<th class="ts-th-day${w}${t}${c}"><div>${d}</div><div class="ts-dow">${_tsDow(ds)}</div></th>`;
  }
  html += '<th class="ts-th-total">Tổng</th></tr></thead><tbody>';

  // Row 1 — Ngày công
  html += '<tr><td class="ts-td-label">Ngày công</td>';
  for (let d = 1; d <= days; d++) {
    const ds = _tsDateStr(_tsAdminYear, _tsAdminMonth, d);
    const w = _tsIsWeekend(ds) ? ' weekend' : '';
    const t = ds === today ? ' is-today' : '';
    const c = _tsAdminData[ds]?.complaint_count > 0 ? ' has-complaint' : '';
    const s = ds === _tsAdminSelected ? ' selected' : '';
    const v = _tsAdminData[ds]?.work_days;
    const txt = _tsFmtNum(v);
    const e = (v === null || v === undefined) ? ' empty' : '';
    html += `<td class="ts-cell${w}${t}${c}${s}" data-date="${ds}"><span class="ts-val${e}">${txt}</span></td>`;
  }
  html += `<td class="ts-td-total">${_tsFmtNum(totalWork)}</td></tr>`;

  // Row 2 — Tăng ca
  html += '<tr><td class="ts-td-label">Tăng ca</td>';
  for (let d = 1; d <= days; d++) {
    const ds = _tsDateStr(_tsAdminYear, _tsAdminMonth, d);
    const w = _tsIsWeekend(ds) ? ' weekend' : '';
    const t = ds === today ? ' is-today' : '';
    const c = _tsAdminData[ds]?.complaint_count > 0 ? ' has-complaint' : '';
    const s = ds === _tsAdminSelected ? ' selected' : '';
    const v = _tsAdminData[ds]?.overtime_hours;
    const txt = _tsFmtNum(v);
    const e = (v === null || v === undefined) ? ' empty' : '';
    html += `<td class="ts-cell${w}${t}${c}${s}" data-date="${ds}"><