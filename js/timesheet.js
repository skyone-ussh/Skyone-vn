/* =========================================================
   TIMESHEET — Bottom Sheet, Quick Actions & Grid Keyboard Navigation
   ========================================================= */

let _tsAdminYear  = new Date().getFullYear();
let _tsAdminMonth = new Date().getMonth() + 1;
let _tsAdminEmpId = '';
let _tsAdminData  = {};        
let _tsAdminSelected = null;
let _tsAdminComplaints = [];

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
function _tsFormatMonth(y, m) { return `${String(m).padStart(2,'0')}/${y}`; }
function _tsFmtNum(n) {
  if (n === null || n === undefined) return '';
  return n % 1 === 0 ? String(n) : Number(n).toFixed(1);
}
function _tsNowString() {
  const now = new Date();
  return `${formatDateVN(todayISO())} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

/* =========================================================
   RENDER GRID
   ========================================================= */
function _renderTsGridPart(startDay, endDay, isAdmin, isCurrentMonth) {
  let html = '<div class="ts-compact-grid">';
  const year = isAdmin ? _tsAdminYear : _tsUserYear;
  const month = isAdmin ? _tsAdminMonth : _tsUserMonth;
  const dataMap = isAdmin ? _tsAdminData : _tsUserData;
  
  // Header Row
  html += '<div class="ts-grid-row">';
  html += '<div class="ts-label-col" style="background:transparent; border:none;"></div>'; 
  for (let d = startDay; d <= endDay; d++) {
    const ds = _tsDateStr(year, month, d);
    const isSun = _tsDow(ds) === 'CN';
    const isToday = isCurrentMonth && (d === new Date().getDate());
    const cellData = dataMap[ds] || {};
    const hasComplaint = (cellData.complaint_count || 0) > 0;
    
    const headCls = `ts-day-head${isSun ? ' sun' : ''}${isToday ? ' is-today' : ''}${hasComplaint ? ' has-complaint' : ''}`;
    html += `<div class="${headCls}" data-date="${ds}">${d}</div>`;
  }
  html += '</div>';

  // NC Row
  html += '<div class="ts-grid-row">';
  html += '<div class="ts-label-col">NC</div>';
  for (let d = startDay; d <= endDay; d++) {
    const ds = _tsDateStr(year, month, d);
    const isSun = _tsDow(ds) === 'CN';
    const isToday = isCurrentMonth && (d === new Date().getDate());
    const cellData = dataMap[ds] || {};
    const valWork = cellData.work_days;
    const hasComplaint = (cellData.complaint_count || 0) > 0;

    const readonlyCls = isAdmin ? '' : ' readonly';
    const dayCellCls = `ts-day-cell${readonlyCls}${isSun ? ' sun' : ''}${hasComplaint ? ' has-complaint' : ''}${valWork === null ? ' empty' : ''}${isToday ? ' is-today' : ''}`;
    
    let txt = _tsFmtNum(valWork);
    if (isSun && (valWork === null || valWork === undefined || valWork === 0)) txt = 'O';

    const inner = isAdmin 
      ? `<input class="ts-cell-input" type="text" inputmode="decimal" autocomplete="off" value="${valWork !== null ? _tsFmtNum(valWork) : ''}" placeholder="${isSun ? 'O' : ''}" data-date="${ds}" data-type="work_days" />`
      : txt;

    html += `<div class="${dayCellCls}" data-date="${ds}">${inner}</div>`;
  }
  html += '</div>';

  // OT Row
  html += '<div class="ts-grid-row">';
  html += '<div class="ts-label-col" style="background:#fffaf0; color:#b45309; border-bottom:none;">OT</div>';
  for (let d = startDay; d <= endDay; d++) {
    const ds = _tsDateStr(year, month, d);
    const isSun = _tsDow(ds) === 'CN';
    const isToday = isCurrentMonth && (d === new Date().getDate());
    const cellData = dataMap[ds] || {};
    const valOT = cellData.overtime_hours;
    const hasComplaint = (cellData.complaint_count || 0) > 0;

    const readonlyCls = isAdmin ? '' : ' readonly';
    const otCellCls = `ts-ot-cell${readonlyCls}${isSun ? ' sun' : ''}${hasComplaint ? ' has-complaint' : ''}${valOT === null ? ' empty' : ''}${isToday ? ' is-today' : ''}`;
    
    let txt = _tsFmtNum(valOT);
    const inner = isAdmin 
      ? `<input class="ts-cell-input" type="text" inputmode="decimal" autocomplete="off" value="${valOT !== null ? _tsFmtNum(valOT) : ''}" data-date="${ds}" data-type="overtime_hours" />`
      : txt;

    html += `<div class="${otCellCls}" data-date="${ds}">${inner}</div>`;
  }
  html += '</div></div>';
  return html;
}

/* =========================================================
   ADMIN — LOAD & RENDER
   ========================================================= */
async function loadAdminTimesheet() {
  const wrap = $('tsAdminGrid');
  const alertEl = $('tsAdminAlert');
  if (!wrap) return;

  hideAlert(alertEl);

  if (!_tsAdminEmpId) {
    wrap.innerHTML = '<p style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">Chọn nhân viên để xem bảng công.</p>';
    closeBottomSheet();
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
    wrap.innerHTML = `<p style="text-align:center;padding:40px 20px;color:var(--danger);font-size:13px;">Lỗi tải dữ liệu: ${escapeHtml(err.message || 'không xác định')}</p>`;
  }
}

function renderAdminTimesheetGrid() {
  const wrap = $('tsAdminGrid');
  const days = _tsDaysInMonth(_tsAdminYear, _tsAdminMonth);
  
  let totalWork = 0, totalOT = 0;
  Object.values(_tsAdminData).forEach(d => {
    if (typeof d.work_days === 'number') totalWork += d.work_days;
    if (typeof d.overtime_hours === 'number') totalOT += d.overtime_hours;
  });

  const today = todayISO();
  const todayMonth = today.slice(0, 7);
  const curMonthStr = `${_tsAdminYear}-${String(_tsAdminMonth).padStart(2, '0')}`;
  const isCurrentMonth = todayMonth === curMonthStr;

  let html = '<div class="ts-compact-wrap">';
  
  html += `<div class="ts-compact-header" id="tsHeaderTotals">
    <span>Tổng: <span style="color: var(--primary); font-weight: 700;">${_tsFmtNum(totalWork)}</span> NC</span>
    <span>OT: <span style="color: var(--warning); font-weight: 700;">${_tsFmtNum(totalOT)}</span> giờ</span>
  </div>`;

  html += _renderTsGridPart(1, 15, true, isCurrentMonth);
  html += '<div class="ts-split-gap"></div>'; 
  html += _renderTsGridPart(16, days, true, isCurrentMonth);

  html += `<div class="ts-compact-footer">Xuất lúc ${_tsNowString()} · NC = Ngày công (8h) · OT = Tăng ca</div>`;
  html += '</div>';

  wrap.innerHTML = html;

  // 1. Bind sự kiện CLICK vào HEADER NGÀY để mở Bottom Sheet
  wrap.querySelectorAll('.ts-day-head').forEach(head => {
    head.addEventListener('click', () => {
      if (head.dataset.date) selectAdminDate(head.dataset.date);
    });
  });

  // 2. Bind sự kiện cho INPUT
  wrap.querySelectorAll('.ts-cell-input').forEach(inp => {
    inp.addEventListener('focus', (e) => {
      e.target.select();
      const ds = e.target.dataset.date;
      wrap.querySelectorAll('.ts-day-head').forEach(h => h.classList.remove('active-head'));
      wrap.querySelectorAll(`.ts-day-head[data-date="${ds}"]`).forEach(h => h.classList.add('active-head'));
    });

    inp.addEventListener('change', (e) => {
      saveAdminCellValue(e.target.dataset.date, e.target.dataset.type, e.target.value);
    });

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEnterNavigation(e.target.dataset.date, e.target.dataset.type);
      }
    });
  });

  const sub = $('tsAdminSubtitle');
  if (sub) {
    const emp = (_employeesCache || []).find(e => e.username === _tsAdminEmpId);
    sub.textContent = (emp?.display_name || _tsAdminEmpId) + ' · Tháng ' + _tsFormatMonth(_tsAdminYear, _tsAdminMonth);
  }
}

/* ========== KEYBOARD NAVIGATION ========== */
function handleEnterNavigation(dateStr, type) {
  const d = new Date(dateStr + 'T00:00:00');
  let nextInput = null;

  if (type === 'work_days') {
    nextInput = document.querySelector(`.ts-cell-input[data-date="${dateStr}"][data-type="overtime_hours"]`);
  } else {
    d.setDate(d.getDate() + 1);
    const nextDateStr = d.toISOString().slice(0, 10);
    nextInput = document.querySelector(`.ts-cell-input[data-date="${nextDateStr}"][data-type="work_days"]`);
  }

  if (nextInput) {
    nextInput.focus();
  } else {
    document.activeElement.blur();
  }
}

/* ========== SAVE ========== */
async function saveAdminCellValue(dateStr, type, rawValue) {
  if (!_tsAdminEmpId || !dateStr) return;

  const oldVal = _tsAdminData[dateStr]?.[type] ?? null;
  let val = rawValue.trim().replace(',', '.');
  let num = val === '' ? null : Number(val);
  if (num !== null && isNaN(num)) num = null;

  if (num !== null) {
    if (num < 0) num = 0;
    if (type === 'work_days' && num > 1) num = 1;
    num = Math.round(num * 2) / 2;
  }

  if (num === oldVal) {
    const input = document.querySelector(`.ts-cell-input[data-date="${dateStr}"][data-type="${type}"]`);
    if (input) input.value = num === null ? '' : _tsFmtNum(num);
    return;
  }

  if (!_tsAdminData[dateStr]) _tsAdminData[dateStr] = { work_days: null, overtime_hours: null, complaint_count: 0 };
  _tsAdminData[dateStr][type] = num;

  const input = document.querySelector(`.ts-cell-input[data-date="${dateStr}"][data-type="${type}"]`);
  if (input) {
    input.value = num === null ? '' : _tsFmtNum(num);
    const parentCell = input.closest('.ts-day-cell, .ts-ot-cell');
    if (parentCell) parentCell.classList.toggle('empty', num === null);
  }
  updateAdminTotals();

  const wd = _tsAdminData[dateStr].work_days ?? 0;
  const ot = _tsAdminData[dateStr].overtime_hours ?? 0;

  try {
    const { error } = await supabaseClient.from('timesheet').upsert({
      employee_id: _tsAdminEmpId,
      work_date: dateStr,
      work_days: wd,
      overtime_hours: ot,
      updated_by: currentAdminEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'employee_id,work_date' });
    if (error) throw error;
  } catch (err) {
    console.error('Lưu ô thất bại:', err);
    showToast('Lỗi lưu: ' + err.message, 'error');
    _tsAdminData[dateStr][type] = oldVal;
    if (input) {
      input.value = oldVal === null ? '' : _tsFmtNum(oldVal);
      const parentCell = input.closest('.ts-day-cell, .ts-ot-cell');
      if (parentCell) parentCell.classList.toggle('empty', oldVal === null);
    }
    updateAdminTotals();
  }
}

function updateAdminTotals() {
  const header = $('tsHeaderTotals');
  if (!header) return;
  let totalWork = 0, totalOT = 0;
  Object.values(_tsAdminData).forEach(d => {
    if (typeof d.work_days === 'number') totalWork += d.work_days;
    if (typeof d.overtime_hours === 'number') totalOT += d.overtime_hours;
  });
  header.innerHTML = `
    <span>Tổng: <span style="color: var(--primary); font-weight: 700;">${_tsFmtNum(totalWork)}</span> NC</span>
    <span>OT: <span style="color: var(--warning); font-weight: 700;">${_tsFmtNum(totalOT)}</span> giờ</span>
  `;
}

/* =========================================================
   BOTTOM SHEET LOGIC
   ========================================================= */
function getBottomSheet() {
  let sheet = $('tsBottomSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'tsBottomSheet';
    sheet.className = 'bottom-sheet-overlay';
    sheet.innerHTML = `
      <div class="bottom-sheet-content">
        <div class="bs-header">
          <div class="bs-title" id="bsDateTitle"></div>
          <button class="bs-close" id="bsCloseBtn" type="button">✕</button>
        </div>
        <div class="bs-body">
          <div class="bs-action-group">
            <label>Ngày công</label>
            <button class="bs-action-btn" data-action="nc" data-val="0">0</button>
            <button class="bs-action-btn" data-action="nc" data-val="0.5">0.5</button>
            <button class="bs-action-btn" data-action="nc" data-val="1">1</button>
          </div>
          <div class="bs-action-group">
            <label>Tăng ca</label>
            <button class="bs-action-btn" data-action="ot" data-val="0">0</button>
            <button class="bs-action-btn" data-action="ot" data-val="2">2</button>
            <button class="bs-action-btn" data-action="ot" data-val="4">4</button>
          </div>

          <div class="bs-accordion" id="bsComplaintAcc">
            <div class="bs-acc-header" id="bsComplaintHeader">
              <div class="bs-acc-title-group">
                <div class="bs-acc-title">Phản ánh</div>
                <span class="bs-acc-count zero" id="bsComplaintCount">0</span>
              </div>
              <span class="bs-acc-chevron">▼</span>
            </div>
            <div class="bs-acc-body">
              <div id="tsComplaintList"></div>
              <div class="ts-add-form" id="tsAddForm">
                <div class="field-row">
                  <div class="field">
                    <label>Người phản ánh *</label>
                    <input type="text" id="tsReporter" placeholder="Tên người" />
                  </div>
                  <div class="field">
                    <label>Khu vực</label>
                    <input type="text" id="tsArea" placeholder="Khu A, B..." />
                  </div>
                </div>
                <div class="field">
                  <label>Nội dung *</label>
                  <textarea id="tsContent" placeholder="Mô tả phản ánh..."></textarea>
                </div>
                <button class="ts-add-btn" id="tsAddComplaint" type="button">+ Thêm phản ánh</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);

    $('bsCloseBtn').onclick = closeBottomSheet;
    $('bsComplaintHeader').onclick = () => {
      $('bsComplaintAcc').classList.toggle('is-open');
    };

    sheet.querySelectorAll('.bs-action-btn').forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.action;
        const val = btn.dataset.val;
        const type = action === 'nc' ? 'work_days' : 'overtime_hours';
        saveAdminCellValue(_tsAdminSelected, type, val);
        
        const input = document.querySelector(`.ts-cell-input[data-date="${_tsAdminSelected}"][data-type="${type}"]`);
        if (input) input.value = val;
        
        closeBottomSheet();
      };
    });

    $('tsAddComplaint').onclick = addAdminComplaint;
  }
  return sheet;
}

async function selectAdminDate(dateStr) {
  _tsAdminSelected = dateStr;

  const sheet = getBottomSheet();
  $('bsDateTitle').textContent = `${_tsDowFull(dateStr)}, ${formatDateVN(dateStr)}`;
  $('bsComplaintAcc').classList.remove('is-open');
  sheet.classList.add('show');

  if ($('tsReporter')) $('tsReporter').value = '';
  if ($('tsArea')) $('tsArea').value = '';
  if ($('tsContent')) $('tsContent').value = '';

  const listEl = $('tsComplaintList');
  listEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);">⏳ Đang tải...</div>';

  try {
    const { data, error } = await supabaseClient
      .from('complaints')
      .select('id, reporter, content, area, created_at')
      .eq('employee_id', _tsAdminEmpId)
      .eq('work_date', dateStr)
      .order('created_at', { ascending: true });
    if (error) throw error;
    _tsAdminComplaints = data || [];
    renderAdminComplaintList();
  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<p style="color:var(--danger);text-align:center;padding:16px;">Lỗi: ${escapeHtml(err.message)}</p>`;
  }
}

function closeBottomSheet() {
  const sheet = $('tsBottomSheet');
  if (sheet) sheet.classList.remove('show');
  document.activeElement?.blur();
}

function renderAdminComplaintList() {
  const listEl = $('tsComplaintList');
  const countEl = $('bsComplaintCount');
  if (!listEl) return;
  
  const items = _tsAdminComplaints;
  if (countEl) {
    countEl.textContent = items.length;
    countEl.classList.toggle('zero', items.length === 0);
  }

  if (items.length === 0) {
    listEl.innerHTML = '<div class="ts-empty">Chưa có phản ánh</div>';
    return;
  }
  
  listEl.innerHTML = items.map(c => `
    <div class="ts-complaint-item">
      <div class="ts-complaint-body">
        <div class="ts-complaint-meta">
          ${escapeHtml(c.reporter)}
          ${c.area ? `<span class="ts-complaint-sep">·</span>${escapeHtml(c.area)}` : ''}
        </div>
        <div class="ts-complaint-content">${escapeHtml(c.content)}</div>
      </div>
      <button class="ts-complaint-delete" data-id="${c.id}" title="Xoá" type="button">🗑</button>
    </div>
  `).join('');
  
  listEl.querySelectorAll('.ts-complaint-delete').forEach(btn => {
    btn.onclick = () => deleteAdminComplaint(Number(btn.dataset.id));
  });
}

async function addAdminComplaint() {
  const reporter = ($('tsReporter')?.value || '').trim();
  const area = ($('tsArea')?.value || '').trim();
  const content = ($('tsContent')?.value || '').trim();

  if (!reporter || !content) {
    showToast('Vui lòng nhập người phản ánh và nội dung', 'error');
    return;
  }

  const btn = $('tsAddComplaint');
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

  try {
    const { data, error } = await supabaseClient
      .from('complaints')
      .insert({
        employee_id: _tsAdminEmpId,
        work_date: _tsAdminSelected,
        reporter, content,
        area: area || null,
        created_by: currentAdminEmail,
      })
      .select('id, reporter, content, area, created_at')
      .single();
    if (error) throw error;

    _tsAdminComplaints.push(data);
    if (!_tsAdminData[_tsAdminSelected]) _tsAdminData[_tsAdminSelected] = {};
    _tsAdminData[_tsAdminSelected].complaint_count = (_tsAdminData[_tsAdminSelected].complaint_count || 0) + 1;

    const count = _tsAdminData[_tsAdminSelected].complaint_count;
    
    document.querySelectorAll(`.ts-day-head[data-date="${_tsAdminSelected}"]`).forEach(el => el.classList.add('has-complaint'));
    document.querySelectorAll(`.ts-day-cell[data-date="${_tsAdminSelected}"], .ts-ot-cell[data-date="${_tsAdminSelected}"]`).forEach(el => {
      el.classList.toggle('has-complaint', count > 0);
    });

    renderAdminComplaintList();
    
    if ($('tsReporter')) $('tsReporter').value = '';
    if ($('tsArea')) $('tsArea').value = '';
    if ($('tsContent')) $('tsContent').value = '';

    showToast('Đã thêm phản ánh', 'success');
  } catch (err) {
    console.error('addAdminComplaint:', err);
    showToast('Lỗi thêm: ' + (err.message || 'không xác định'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ Thêm phản ánh'; }
  }
}

async function deleteAdminComplaint(id) {
  if (!confirm('Xoá phản ánh này?')) return;
  try {
    const { error } = await supabaseClient.from('complaints').delete().eq('id', id);
    if (error) throw error;

    _tsAdminComplaints = _tsAdminComplaints.filter(c => c.id !== id);
    if (_tsAdminData[_tsAdminSelected]) {
      _tsAdminData[_tsAdminSelected].complaint_count = Math.max(0, (_tsAdminData[_tsAdminSelected].complaint_count || 0) - 1);
    }
    
    const count = _tsAdminData[_tsAdminSelected]?.complaint_count || 0;
    
    document.querySelectorAll(`.ts-day-head[data-date="${_tsAdminSelected}"]`).forEach(el => el.classList.toggle('has-complaint', count > 0));
    document.querySelectorAll(`.ts-day-cell[data-date="${_tsAdminSelected}"], .ts-ot-cell[data-date="${_tsAdminSelected}"]`).forEach(el => {
      el.classList.toggle('has-complaint', count > 0);
    });

    renderAdminComplaintList();
    showToast('Đã xoá phản ánh', 'success');
  } catch (err) {
    console.error('deleteAdminComplaint:', err);
    showToast('Lỗi xoá: ' + (err.message || 'không xác định'), 'error');
  }
}

function populateTimesheetEmployees(employees) {
  const sel = $('tsAdminEmployee');
  if (!sel) return;
  const current = sel.value;
  let html = '<option value="">👤 Chọn nhân viên</option>';
  (employees || []).forEach(e => {
    html += `<option value="${escapeHtml(e.username)}">${escapeHtml(e.display_name)}</option>`;
  });
  sel.innerHTML = html;
  if (current) sel.value = current;
}

/* =========================================================
   USER — READ ONLY
   ========================================================= */
async function loadUserTimesheet() {
  const wrap = $('tsUserGrid');
  const alertEl = $('tsUserAlert');
  if (!wrap) return;

  if (!currentEmployee) {
    wrap.innerHTML = '<p style="text-align:center;padding:40px 20px;color:var(--danger);font-size:13px;">Chưa đăng nhập.</p>';
    return;
  }
  
  if (!currentEmployeePassword) {
    wrap.innerHTML = '<p style="text-align:center;padding:40px 20px;color:var(--danger);font-size:13px;">Phiên đăng nhập không có mật khẩu. Vui lòng đăng xuất và đăng nhập lại.</p>';
    return;
  }

  hideAlert(alertEl);
  wrap.innerHTML = '<p style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">⏳ Đang tải dữ liệu...</p>';

  try {
    const { data, error } = await supabaseClient.rpc('get_my_month_timesheet', {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
      p_year: _tsUserYear,
      p_month: _tsUserMonth,
    });
    
    if (error) throw error;
    
    // Nếu data là null (hiếm khi xảy ra với TABLE)
    if (data === null) {
      wrap.innerHTML = '<p style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">Phiên đăng nhập hết hạn.</p>';
      return;
    }

    const map = {};
    (data || []).forEach(row => {
      const ds = (row.work_date || '').split('T')[0];
      map[ds] = {
        work_days: row.work_days != null ? Number(row.work_days) : null,
        overtime_hours: row.overtime_hours != null ? Number(row.overtime_hours) : null,
        complaint_count: Number(row.complaint_count) || 0,
      };
    });
    _tsUserData = map;
    renderUserTimesheetGrid();
  } catch (err) {
    console.error('loadUserTimesheet:', err);
    wrap.innerHTML = `<p style="text-align:center;padding:40px 20px;color:var(--danger);font-size:13px;">Lỗi: ${escapeHtml(err.message || 'không xác định')}</p>`;
  }
}

function renderUserTimesheetGrid() {
  const wrap = $('tsUserGrid');
  const days = _tsDaysInMonth(_tsUserYear, _tsUserMonth);
  
  let totalWork = 0, totalOT = 0;
  Object.values(_tsUserData).forEach(d => {
    if (typeof d.work_days === 'number') totalWork += d.work_days;
    if (typeof d.overtime_hours === 'number') totalOT += d.overtime_hours;
  });

  const today = todayISO();
  const todayMonth = today.slice(0, 7);
  const curMonthStr = `${_tsUserYear}-${String(_tsUserMonth).padStart(2, '0')}`;
  const isCurrentMonth = todayMonth === curMonthStr;

  let html = '<div class="ts-compact-wrap">';
  
  html += `<div class="ts-compact-header">
    <span>Tổng: <span style="color: var(--primary); font-weight: 700;">${_tsFmtNum(totalWork)}</span> NC</span>
    <span>OT: <span style="color: var(--warning); font-weight: 700;">${_tsFmtNum(totalOT)}</span> giờ</span>
  </div>`;

  html += _renderTsGridPart(1, 15, false, isCurrentMonth);
  html += '<div class="ts-split-gap"></div>'; 
  html += _renderTsGridPart(16, days, false, isCurrentMonth);

  html += `<div class="ts-compact-footer">Xuất lúc ${_tsNowString()} · NC = Ngày công (8h) · OT = Tăng ca</div>`;
  html += '</div>';

  wrap.innerHTML = html;

  wrap.querySelectorAll('.has-complaint').forEach(cell => {
    cell.addEventListener('click', () => openUserComplaintModal(cell.dataset.date));
  });

  const sub = $('tsUserSubtitle');
  if (sub) sub.textContent = 'Tháng ' + _tsFormatMonth(_tsUserYear, _tsUserMonth);
}

async function openUserComplaintModal(dateStr) {
  if (!currentEmployee || !currentEmployeePassword) return;

  let modal = $('userComplaintModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'userComplaintModal';
    modal.className = 'success-modal';
    modal.innerHTML = `
      <div class="success-modal-box" style="text-align:left;max-width:420px;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border);">
          <div style="font-size:15px;font-weight:700;color:var(--text);">⚠️ Phản ánh ngày <span id="ucmDate"></span></div>
          <button id="ucmClose" type="button" style="background:transparent;border:none;font-size:16px;cursor:pointer;color:var(--text-muted);width:30px;height:30px;border-radius:6px;">✕</button>
        </div>
        <div id="ucmBody" style="color:var(--text-muted);text-align:center;padding:20px;">⏳ Đang tải...</div>
      </div>
    `;
    document.body.appendChild(modal);
    $('ucmClose').onclick = () => modal.classList.remove('show');
  }
  $('ucmDate').textContent = formatDateVN(dateStr);
  modal.classList.add('show');

  const body = $('ucmBody');
  body.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">⏳ Đang tải...</div>';

  try {
    const { data, error } = await supabaseClient.rpc('get_my_complaints', {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
      p_work_date: dateStr,
    });
    if (error) throw error;
    if (!data || data.length === 0) {
      body.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">Không có phản ánh.</div>';
      return;
    }
    body.innerHTML = data.map(c => `
      <div class="ts-complaint-item">
        <div class="ts-complaint-body">
          <div class="ts-complaint-meta">
            ${escapeHtml(c.reporter)}
            ${c.area ? `<span class="ts-complaint-sep">·</span>${escapeHtml(c.area)}` : ''}
          </div>
          <div class="ts-complaint-content">${escapeHtml(c.content)}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('openUserComplaintModal:', err);
    body.innerHTML = `<div style="color:var(--danger);text-align:center;padding:20px;">Lỗi: ${escapeHtml(err.message || 'không xác định')}</div>`;
  }
}

/* =========================================================
   INIT
   ========================================================= */
function initTimesheetHandlers() {
  $('tsAdminEmployee')?.addEventListener('change', (e) => {
    _tsAdminEmpId = e.target.value;
    _tsAdminSelected = null;
    closeBottomSheet();
    loadAdminTimesheet();
  });

  $('tsAdminPrevMonth')?.addEventListener('click', () => {
    _tsAdminMonth--;
    if (_tsAdminMonth < 1) { _tsAdminMonth = 12; _tsAdminYear--; }
    _tsAdminSelected = null;
    closeBottomSheet();
    updateAdminMonthLabel();
    loadAdminTimesheet();
  });
  $('tsAdminNextMonth')?.addEventListener('click', () => {
    _tsAdminMonth++;
    if (_tsAdminMonth > 12) { _tsAdminMonth = 1; _tsAdminYear++; }
    _tsAdminSelected = null;
    closeBottomSheet();
    updateAdminMonthLabel();
    loadAdminTimesheet();
  });

  $('tsUserPrevMonth')?.addEventListener('click', () => {
    _tsUserMonth--;
    if (_tsUserMonth < 1) { _tsUserMonth = 12; _tsUserYear--; }
    updateUserMonthLabel();
    loadUserTimesheet();
  });
  $('tsUserNextMonth')?.addEventListener('click', () => {
    _tsUserMonth++;
    if (_tsUserMonth > 12) { _tsUserMonth = 1; _tsUserYear++; }
    updateUserMonthLabel();
    loadUserTimesheet();
  });

  document.querySelectorAll('.emp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.empTab;
      document.querySelectorAll('.emp-tab').forEach(t => t.classList.toggle('active', t.dataset.empTab === name));
      document.querySelectorAll('.emp-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'emp-panel-' + name));
      if (name === 'timesheet') loadUserTimesheet();
    });
  });

  document.addEventListener('click', (e) => {
    const sheet = $('tsBottomSheet');
    if (sheet && sheet.classList.contains('show')) {
      if (e.target === sheet) closeBottomSheet();
    }
  });

  updateAdminMonthLabel();
  updateUserMonthLabel();
}

function updateAdminMonthLabel() {
  const el = $('tsAdminMonthLabel');
  if (el) el.textContent = _tsFormatMonth(_tsAdminYear, _tsAdminMonth);
}

function updateUserMonthLabel() {
  const el = $('tsUserMonthLabel');
  if (el) el.textContent = _tsFormatMonth(_tsUserYear, _tsUserMonth);
}

function resetTimesheetAdminState() {
  _tsAdminYear = new Date().getFullYear();
  _tsAdminMonth = new Date().getMonth() + 1;
  _tsAdminEmpId = '';
  _tsAdminData = {};
  _tsAdminSelected = null;
  _tsAdminComplaints = [];
  updateAdminMonthLabel();
  const sel = $('tsAdminEmployee'); if (sel) sel.value = '';
  closeBottomSheet();
  const grid = $('tsAdminGrid');
  if (grid) grid.innerHTML = '<p style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">Chọn nhân viên để xem bảng công.</p>';
}

function resetTimesheetUserState() {
  _tsUserYear = new Date().getFullYear();
  _tsUserMonth = new Date().getMonth() + 1;
  _tsUserData = {};
  updateUserMonthLabel();
  const grid = $('tsUserGrid'); if (grid) grid.innerHTML = '';
  document.querySelectorAll('.emp-tab').forEach(t => t.classList.toggle('active', t.dataset.empTab === 'checkin'));
  document.querySelectorAll('.emp-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'emp-panel-checkin'));
}