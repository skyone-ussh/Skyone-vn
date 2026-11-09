/* =========================================================
   TIMESHEET — Inline Edit & Collapsible Complaints
   ========================================================= */

let _tsAdminYear  = new Date().getFullYear();
let _tsAdminMonth = new Date().getMonth() + 1;
let _tsAdminEmpId = '';
let _tsAdminData  = {};        // dateStr -> { work_days, overtime_hours, complaint_count }
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
   RENDER GRID (Dùng chung cho cả Admin & User)
   ========================================================= */
function _renderTsGridPart(startDay, endDay, isAdmin, isCurrentMonth) {
  let html = '<div class="ts-compact-grid">';
  const year = isAdmin ? _tsAdminYear : _tsUserYear;
  const month = isAdmin ? _tsAdminMonth : _tsUserMonth;
  const dataMap = isAdmin ? _tsAdminData : _tsUserData;
  
  for (let d = startDay; d <= endDay; d++) {
    const ds = _tsDateStr(year, month, d);
    const isSun = _tsDow(ds) === 'CN';
    const isToday = isCurrentMonth && (d === new Date().getDate());
    const cellData = dataMap[ds] || {};
    const hasComplaint = (cellData.complaint_count || 0) > 0;
    const isSelected = isAdmin && ds === _tsAdminSelected;

    const valWork = cellData.work_days;
    const valOT = cellData.overtime_hours;

    let txtWork = _tsFmtNum(valWork);
    if (isSun && (valWork === null || valWork === undefined || valWork === 0)) txtWork = 'O';
    let txtOT = _tsFmtNum(valOT);

    const headCls = isSun ? ' sun' : '';
    const readonlyCls = isAdmin ? '' : ' readonly';
    const dayCellCls = `ts-day-cell${readonlyCls}${isSun ? ' sun' : ''}${hasComplaint ? ' has-complaint' : ''}${valWork === null ? ' empty' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' selected' : ''}`;
    const otCellCls = `ts-ot-cell${readonlyCls}${isSun ? ' sun' : ''}${hasComplaint ? ' has-complaint' : ''}${valOT === null ? ' empty' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' selected' : ''}`;

    // Admin dùng input, User dùng text
    const dayInner = isAdmin 
      ? `<input class="ts-cell-input" type="text" inputmode="decimal" autocomplete="off" 
           value="${valWork !== null ? _tsFmtNum(valWork) : ''}" 
           placeholder="${isSun ? 'O' : ''}" 
           data-date="${ds}" data-type="work_days" />`
      : txtWork;

    const otInner = isAdmin 
      ? `<input class="ts-cell-input" type="text" inputmode="decimal" autocomplete="off" 
           value="${valOT !== null ? _tsFmtNum(valOT) : ''}" 
           data-date="${ds}" data-type="overtime_hours" />`
      : txtOT;

    html += `<div class="ts-col">`;
    html += `<div class="ts-day-head${headCls}${isToday ? ' is-today' : ''}">${d}</div>`;
    html += `<div class="${dayCellCls}" data-date="${ds}">${dayInner}</div>`;
    html += `<div class="${otCellCls}" data-date="${ds}">${otInner}</div>`;
    html += `</div>`;
  }
  html += '</div>';
  return html;
}

/* =========================================================
   ADMIN — LOAD & RENDER GRID
   ========================================================= */
async function loadAdminTimesheet() {
  const wrap = $('tsAdminGrid');
  const alertEl = $('tsAdminAlert');
  if (!wrap) return;

  hideAlert(alertEl);

  if (!_tsAdminEmpId) {
    wrap.innerHTML = '<p style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">Chọn nhân viên để xem bảng công.</p>';
    const panel = $('tsAdminPanel'); if (panel) panel.innerHTML = '';
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
  
  html += `<div class="ts-compact-header">
    <span>Tổng: <span style="color: var(--primary); font-weight: 700;">${_tsFmtNum(totalWork)}</span> NC</span>
    <span>OT: <span style="color: var(--warning); font-weight: 700;">${_tsFmtNum(totalOT)}</span> giờ</span>
  </div>`;

  html += _renderTsGridPart(1, 15, true, isCurrentMonth);
  html += '<div class="ts-split-gap"></div>'; 
  html += _renderTsGridPart(16, days, true, isCurrentMonth);

  html += `<div class="ts-compact-footer">Xuất lúc ${_tsNowString()} · NC = Ngày công (8h) · OT = Tăng ca</div>`;
  html += '</div>';

  wrap.innerHTML = html;

  // Bind sự kiện cho các ô input
  wrap.querySelectorAll('.ts-cell-input').forEach(inp => {
    // Khi focus vào ô -> cập nhật panel phản ánh bên dưới
    inp.addEventListener('focus', (e) => {
      selectAdminDate(e.target.dataset.date);
    });

    // Khi gõ xong (blur hoặc Enter) -> Lưu
    inp.addEventListener('change', (e) => {
      saveAdminCellValue(e.target.dataset.date, e.target.dataset.type, e.target.value);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
  });

  const sub = $('tsAdminSubtitle');
  if (sub) {
    const emp = (_employeesCache || []).find(e => e.username === _tsAdminEmpId);
    sub.textContent = (emp?.display_name || _tsAdminEmpId) + ' · Tháng ' + _tsFormatMonth(_tsAdminYear, _tsAdminMonth);
  }
}

/* ========== ADMIN — LOGIC LƯU Ô (INLINE EDIT) ========== */
async function saveAdminCellValue(dateStr, type, rawValue) {
  if (!_tsAdminEmpId || !dateStr) return;

  const oldVal = _tsAdminData[dateStr]?.[type] ?? null;
  
  // Chuẩn hoá dữ liệu nhập (chấp nhận dấu phẩy)
  let val = rawValue.trim().replace(',', '.');
  let num = val === '' ? null : Number(val);
  if (num !== null && isNaN(num)) num = null;

  // Giới hạn: Ngày công (0-1), OT (>=0). Làm tròn 0.5
  if (num !== null) {
    if (num < 0) num = 0;
    if (type === 'work_days' && num > 1) num = 1;
    num = Math.round(num * 2) / 2;
  }

  if (num === oldVal) {
    // Nếu không đổi giá trị (hoặc chỉ đổi format), reset lại value hiển thị
    const input = document.querySelector(`.ts-cell-input[data-date="${dateStr}"][data-type="${type}"]`);
    if (input) input.value = num === null ? '' : _tsFmtNum(num);
    return;
  }

  // Cập nhật local
  if (!_tsAdminData[dateStr]) _tsAdminData[dateStr] = { work_days: null, overtime_hours: null, complaint_count: 0 };
  _tsAdminData[dateStr][type] = num;

  // Cập nhật UI (không render lại bảng)
  const input = document.querySelector(`.ts-cell-input[data-date="${dateStr}"][data-type="${type}"]`);
  if (input) {
    input.value = num === null ? '' : _tsFmtNum(num);
    const parentCell = input.closest('.ts-day-cell, .ts-ot-cell');
    if (parentCell) parentCell.classList.toggle('empty', num === null);
  }
  updateAdminTotals();

  // Lưu ngầm xuống DB
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
    // Revert nếu lỗi
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
  const header = document.querySelector('#tsAdminGrid .ts-compact-header');
  if (!header) return;
  let totalWork = 0, totalOT = 0;
  Object.values(_tsAdminData).forEach(d => {
    if (typeof d.work_days === 'number') totalWork += d.work_days;
    if (typeof d.overtime_hours === 'number') totalOT += d.overtime_hours;
  });
  const spans = header.querySelectorAll('span');
  if (spans.length === 2) {
    spans[0].innerHTML = `Tổng: <span style="color: var(--primary); font-weight: 700;">${_tsFmtNum(totalWork)}</span> NC`;
    spans[1].innerHTML = `OT: <span style="color: var(--warning); font-weight: 700;">${_tsFmtNum(totalOT)}</span> giờ`;
  }
}

/* ========== ADMIN — PANEL PHẢN ÁNH (THU GỌN) ========== */
async function selectAdminDate(dateStr) {
  if (_tsAdminSelected === dateStr) return;
  _tsAdminSelected = dateStr;

  // Highlight cột
  document.querySelectorAll('.ts-day-cell.selected, .ts-ot-cell.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll(`.ts-day-cell[data-date="${dateStr}"], .ts-ot-cell[data-date="${dateStr}"]`).forEach(el => el.classList.add('selected'));

  const panel = $('tsAdminPanel');
  if (!panel) return;

  // Khởi tạo khung Panel nếu chưa có
  if (!panel.querySelector('.ts-panel')) {
    panel.innerHTML = `
      <div class="ts-panel">
        <div class="ts-panel-header" id="tsPanelToggle" style="cursor:pointer">
          <div class="ts-panel-title-group">
            <span class="ts-panel-title" id="tsPanelTitle"></span>
            <span class="ts-complaints-count zero" id="tsPanelCount">0</span>
          </div>
          <div class="ts-panel-header-right">
            <span class="ts-chevron">▼</span>
            <button class="ts-panel-close" id="tsPanelClose" type="button">✕</button>
          </div>
        </div>
        <div class="ts-panel-body" id="tsPanelBody" style="display:none">
          <div id="tsComplaintList"></div>
          <div class="ts-add-form" id="tsAddForm">
            <div class="field-row">
              <div class="field">
                <label for="tsReporter">Người phản ánh *</label>
                <input type="text" id="tsReporter" placeholder="Tên người" />
              </div>
              <div class="field">
                <label for="tsArea">Khu vực</label>
                <input type="text" id="tsArea" placeholder="Khu A, B..." />
              </div>
            </div>
            <div class="field">
              <label for="tsContent">Nội dung *</label>
              <textarea id="tsContent" placeholder="Mô tả phản ánh..."></textarea>
            </div>
            <button class="ts-add-btn" id="tsAddComplaint" type="button">+ Thêm phản ánh</button>
          </div>
        </div>
      </div>
    `;
    $('tsPanelToggle').addEventListener('click', (e) => {
      if (e.target.closest('#tsPanelClose')) return;
      toggleTsPanel();
    });
    $('tsPanelClose').addEventListener('click', closeAdminTimesheetPanel);
    $('tsAddComplaint').addEventListener('click', addAdminComplaint);
  }

  // Reset form
  if ($('tsReporter')) $('tsReporter').value = '';
  if ($('tsArea')) $('tsArea').value = '';
  if ($('tsContent')) $('tsContent').value = '';

  // Update title
  $('tsPanelTitle').textContent = `${_tsDowFull(dateStr)}, ${formatDateVN(dateStr)}`;

  // Tải list phản ánh
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
    listEl.innerHTML = `<p style="color:var(--error);text-align:center;padding:16px;">Lỗi: ${escapeHtml(err.message)}</p>`;
  }
}

function toggleTsPanel() {
  const body = $('tsPanelBody');
  const header = $('tsPanelToggle');
  if (!body || !header) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  header.classList.toggle('is-open', isHidden);
}

function closeAdminTimesheetPanel() {
  _tsAdminSelected = null;
  _tsAdminComplaints = [];
  document.querySelectorAll('.ts-day-cell.selected, .ts-ot-cell.selected').forEach(el => el.classList.remove('selected'));
  const panel = $('tsAdminPanel');
  if (panel) panel.innerHTML = '';
}

function renderAdminComplaintList() {
  const listEl = $('tsComplaintList');
  const countEl = $('tsPanelCount');
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

    // Cập nhật class has-complaint trên lưới
    const count = _tsAdminData[_tsAdminSelected].complaint_count;
    document.querySelectorAll(`.ts-day-cell[data-date="${_tsAdminSelected}"], .ts-ot-cell[data-date="${_tsAdminSelected}"]`).forEach(el => {
      el.classList.toggle('has-complaint', count > 0);
    });

    renderAdminComplaintList();
    
    // Reset form
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
  if (!wrap || !currentEmployee || !currentEmployeePassword) return;

  hideAlert(alertEl);
  wrap.innerHTML = '<p style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">⏳ Đang tải...</p>';

  try {
    const { data, error } = await supabaseClient.rpc('get_my_month_timesheet', {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
      p_year: _tsUserYear,
      p_month: _tsUserMonth,
    });
    if (error) throw error;
    if (!data) {
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
    wrap.innerHTML = `<p style="text-align:center;padding:40px 20px;color:var(--error);font-size:13px;">Lỗi: ${escapeHtml(err.message || 'không xác định')}</p>`;
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
    body.innerHTML = `<div style="color:var(--error);text-align:center;padding:20px;">Lỗi: ${escapeHtml(err.message || 'không xác định')}</div>`;
  }
}

/* =========================================================
   INIT
   ========================================================= */
function initTimesheetHandlers() {
  $('tsAdminEmployee')?.addEventListener('change', (e) => {
    _tsAdminEmpId = e.target.value;
    _tsAdminSelected = null;
    const p = $('tsAdminPanel'); if (p) p.innerHTML = '';
    loadAdminTimesheet();
  });

  $('tsAdminPrevMonth')?.addEventListener('click', () => {
    _tsAdminMonth--;
    if (_tsAdminMonth < 1) { _tsAdminMonth = 12; _tsAdminYear--; }
    _tsAdminSelected = null;
    const p = $('tsAdminPanel'); if (p) p.innerHTML = '';
    updateAdminMonthLabel();
    loadAdminTimesheet();
  });
  $('tsAdminNextMonth')?.addEventListener('click', () => {
    _tsAdminMonth++;
    if (_tsAdminMonth > 12) { _tsAdminMonth = 1; _tsAdminYear++; }
    _tsAdminSelected = null;
    const p = $('tsAdminPanel'); if (p) p.innerHTML = '';
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
  const panel = $('tsAdminPanel'); if (panel) panel.innerHTML = '';
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