/* =========================================================
   TIMESHEET — Bảng công tháng + Complaints (Fixed Jumping)
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

    html += `<div class="ts-col">`;
    html += `<div class="ts-day-head${headCls}${isToday ? ' is-today' : ''}">${d}</div>`;
    html += `<div class="${dayCellCls}" data-date="${ds}">${txtWork}</div>`;
    html += `<div class="${otCellCls}" data-date="${ds}">${txtOT}</div>`;
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

  wrap.querySelectorAll('.ts-day-cell, .ts-ot-cell').forEach(cell => {
    cell.addEventListener('click', () => openAdminTimesheetPanel(cell.dataset.date));
  });

  const sub = $('tsAdminSubtitle');
  if (sub) {
    const emp = (_employeesCache || []).find(e => e.username === _tsAdminEmpId);
    sub.textContent = (emp?.display_name || _tsAdminEmpId) + ' · Tháng ' + _tsFormatMonth(_tsAdminYear, _tsAdminMonth);
  }
}

/* ========== ADMIN — PANEL (ĐÃ FIX GIẬT TRANG) ========== */
async function openAdminTimesheetPanel(dateStr) {
  if (!_tsAdminEmpId) return;
  
  // 1. Cập nhật giao diện chọn ô (Không vẽ lại toàn bộ bảng)
  document.querySelectorAll('.ts-day-cell.selected, .ts-ot-cell.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll(`.ts-day-cell[data-date="${dateStr}"], .ts-ot-cell[data-date="${dateStr}"]`).forEach(el => el.classList.add('selected'));
  
  _tsAdminSelected = dateStr;

  const panel = $('tsAdminPanel');
  if (!panel) return;

  // 2. Tạo khung Panel 1 lần duy nhất (nếu chưa có), giữ cố định chiều cao
  if (!panel.querySelector('.ts-panel')) {
    panel.innerHTML = `
      <div class="ts-panel">
        <div class="ts-panel-header">
          <div class="ts-panel-title" id="tsPanelTitle"></div>
          <button class="ts-panel-close" id="tsPanelClose" type="button">✕</button>
        </div>
        <div class="ts-panel-body" id="tsPanelBody"></div>
      </div>
    `;
    $('tsPanelClose').onclick = closeAdminTimesheetPanel;
  }

  $('tsPanelTitle').textContent = `${_tsDowFull(dateStr)}, ${formatDateVN(dateStr)}`;
  
  // 3. Hiện trạng thái loading bên trong Body (không xoá Panel)
  const body = $('tsPanelBody');
  body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">⏳ Đang tải...</div>';

  try {
    const { data, error } = await supabaseClient
      .from('complaints')
      .select('id, reporter, content, area, created_at')
      .eq('employee_id', _tsAdminEmpId)
      .eq('work_date', dateStr)
      .order('created_at', { ascending: true });
    if (error) throw error;
    
    _tsAdminComplaints = data || [];
    renderAdminPanelBody();
    
  } catch (err) {
    console.error('openAdminTimesheetPanel:', err);
    body.innerHTML = `<p style="color:var(--error);text-align:center;">Lỗi tải phản ánh: ${escapeHtml(err.message)}</p>`;
  }
}

function closeAdminTimesheetPanel() {
  _tsAdminSelected = null;
  _tsAdminComplaints = [];
  
  // Bỏ chọn trên lưới
  document.querySelectorAll('.ts-day-cell.selected, .ts-ot-cell.selected').forEach(el => el.classList.remove('selected'));
  
  // Xoá panel
  const panel = $('tsAdminPanel');
  if (panel) panel.innerHTML = '';
}

function renderAdminPanelBody() {
  const body = $('tsPanelBody');
  if (!body || !_tsAdminSelected) return;

  const dateStr = _tsAdminSelected;
  const data = _tsAdminData[dateStr] || {};
  const workDays = data.work_days ?? 0;
  const ot = data.overtime_hours ?? 0;
  const complaints = _tsAdminComplaints;

  body.innerHTML = `
    <div class="ts-inputs">
      <div class="field">
        <label for="tsWorkDays">Ngày công (0 – 1)</label>
        <input type="number" id="tsWorkDays" min="0" max="1" step="0.5" value="${workDays}" />
      </div>
      <div class="field">
        <label for="tsOT">Tăng ca (giờ)</label>
        <input type="number" id="tsOT" min="0" step="0.5" value="${ot}" />
      </div>
    </div>
    <button class="ts-save-btn" id="tsSaveData" type="button">💾 Lưu số liệu</button>
    <div class="ts-complaints-header">
      <div class="ts-complaints-title">Phản ánh</div>
      <span class="ts-complaints-count${complaints.length === 0 ? ' zero' : ''}">${complaints.length}</span>
    </div>
    <div id="tsComplaintList"></div>
    <div class="ts-add-form">
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
  `;
  $('tsSaveData').onclick = saveAdminTimesheetData;
  $('tsAddComplaint').onclick = addAdminComplaint;
  renderAdminComplaintList();
}

function renderAdminComplaintList() {
  const listEl = $('tsComplaintList');
  if (!listEl) return;
  const items = _tsAdminComplaints;
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

async function saveAdminTimesheetData() {
  if (_tsAdminSaving) return;
  const btn = $('tsSaveData');
  const alertEl = $('tsAdminAlert');
  const wIn = $('tsWorkDays');
  const oIn = $('tsOT');
  if (!wIn || !oIn) return;

  let wd = Number(wIn.value) || 0;
  let ot = Number(oIn.value) || 0;
  if (wd < 0) wd = 0; if (wd > 1) wd = 1;
  if (ot < 0) ot = 0;
  wd = Math.round(wd * 2) / 2;
  ot = Math.round(ot * 2) / 2;
  wIn.value = wd; oIn.value = ot;

  _tsAdminSaving = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang lưu...'; }
  hideAlert(alertEl);

  try {
    const { error } = await supabaseClient.from('timesheet').upsert({
      employee_id: _tsAdminEmpId,
      work_date: _tsAdminSelected,
      work_days: wd,
      overtime_hours: ot,
      updated_by: currentAdminEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'employee_id,work_date' });
    if (error) throw error;

    if (!_tsAdminData[_tsAdminSelected]) _tsAdminData[_tsAdminSelected] = {};
    _tsAdminData[_tsAdminSelected].work_days = wd;
    _tsAdminData[_tsAdminSelected].overtime_hours = ot;

    renderAdminTimesheetGrid(); // Cập nhật lại số tổng trên cùng
    renderAdminPanelBody();     // Cập nhật lại input
    
    // Set lại class selected sau khi render grid
    document.querySelectorAll(`.ts-day-cell[data-date="${_tsAdminSelected}"], .ts-ot-cell[data-date="${_tsAdminSelected}"]`).forEach(el => el.classList.add('selected'));
    
    showToast('Đã lưu số liệu', 'success');
  } catch (err) {
    console.error('saveAdminTimesheetData:', err);
    showAlert(alertEl, 'Lỗi lưu: ' + (err.message || 'không xác định'), 'error');
  } finally {
    _tsAdminSaving = false;
    if (btn) { btn.disabled = false; btn.textContent = '💾 Lưu số liệu'; }
  }
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

    renderAdminTimesheetGrid();
    renderAdminPanelBody();
    document.querySelectorAll(`.ts-day-cell[data-date="${_tsAdminSelected}"], .ts-ot-cell[data-date="${_tsAdminSelected}"]`).forEach(el => el.classList.add('selected'));
    
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
      _tsAdminData[_tsAdminSelected].complaint_count =
        Math.max(0, (_tsAdminData[_tsAdminSelected].complaint_count || 0) - 1);
    }
    
    renderAdminTimesheetGrid();
    renderAdminPanelBody();
    document.querySelectorAll(`.ts-day-cell[data-date="${_tsAdminSelected}"], .ts-ot-cell[data-date="${_tsAdminSelected}"]`).forEach(el => el.classList.add('selected'));
    
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