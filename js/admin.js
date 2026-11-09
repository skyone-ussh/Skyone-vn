/* =========================================================
   ADMIN — MENU + LỊCH SỬ + NHÂN VIÊN + BẢNG CÔNG
   ========================================================= */

let _adminMode = 'day';
let _adminFilterEmp = '';
let _bulkDeleting = false;
let _employeesCache = [];

function initAdminMenu() {
  const btn = $('btnAppMenu');
  const dropdown = $('appMenuDropdown');
  if (!btn || !dropdown) return;

  const closeMenu = () => {
    dropdown.classList.remove('show');
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    dropdown.classList.add('show');
    btn.classList.add('active');
    btn.setAttribute('aria-expanded', 'true');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.classList.contains('show')) closeMenu(); else openMenu();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.app-menu-wrapper')) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  dropdown.querySelectorAll('.app-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      switchAdminTab(item.dataset.tab);
      closeMenu();
    });
  });
}

function switchAdminTab(tab) {
  const labelMap = { history: 'Chấm công', timesheet: 'Bảng công', users: 'Nhân viên' };

  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + tab);
  });
  document.querySelectorAll('.app-menu-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });
  const labelEl = $('appMenuLabel');
  if (labelEl) labelEl.textContent = labelMap[tab] || tab;

  if (tab === 'users') loadEmployees();
  else if (tab === 'history') loadHistory();
  else if (tab === 'timesheet') {
    populateTimesheetEmployees(_employeesCache);
    loadAdminTimesheet();
  }
}

async function openAdminScreen(email) {
  currentAdminEmail = email;
  showScreen('admin');
  $('adminHeaderEmail').textContent = email;
  $('adminDate').value = todayISO();
  _adminMode = 'day';
  _adminFilterEmp = '';

  $('appMenuDropdown')?.classList.remove('show');
  $('btnAppMenu')?.classList.remove('active');
  $('btnAppMenu')?.setAttribute('aria-expanded', 'false');
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-history');
  });
  document.querySelectorAll('.app-menu-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === 'history');
  });
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === 'day');
  });
  const labelEl = $('appMenuLabel');
  if (labelEl) labelEl.textContent = 'Chấm công';

  resetTimesheetAdminState();

  await Promise.all([loadHistory(), loadEmployees()]);
}

/* ========== RENDER — ROW ATTENDANCE ========== */
function renderAttendanceRow(row) {
  const hasOut = !!row.check_out_time;
  const inTime = formatTime(row.check_in_time);
  const outTime = hasOut ? formatTime(row.check_out_time) : null;
  const initial = (row.employee_name || '?').charAt(0).toUpperCase();
  const statusPill = hasOut
    ? '<span class="pill pill-ok">Đã về</span>'
    : '<span class="pill pill-wait">Đang làm</span>';
  const inPhoto = row.check_in_photo_url
    ? `<img class="row-photo" src="${escapeHtml(row.check_in_photo_url)}" alt="Vào" data-full="${escapeHtml(row.check_in_photo_url)}" loading="lazy" />` : '';
  const outPhoto = row.check_out_photo_url
    ? `<img class="row-photo" src="${escapeHtml(row.check_out_photo_url)}" alt="Ra" data-full="${escapeHtml(row.check_out_photo_url)}" loading="lazy" />` : '';
  const photos = (inPhoto || outPhoto) ? `<span class="row-photos">${inPhoto}${outPhoto}</span>` : '';
  const timePart = hasOut
    ? `<span class="t-in">${inTime}</span><span class="t-arrow">→</span><span class="t-out">${outTime}</span>`
    : `<span class="t-in">${inTime}</span><span class="t-arrow">→</span><span class="t-missing">Chưa ra</span>`;

  return `
    <article class="attendance-row" data-record-id="${row.id}">
      <div class="att-avatar">${escapeHtml(initial)}</div>
      <div class="row-body">
        <div class="row-top"><span class="row-name">${escapeHtml(row.employee_name)}</span>${statusPill}</div>
        <div class="row-bottom">
          <span class="row-times">${timePart}</span>
          <span class="row-sep">·</span>
          <code class="row-username">${escapeHtml(row.employee_id || '')}</code>
          ${photos}
        </div>
      </div>
      <button class="row-delete" data-action="delete-attendance" data-id="${row.id}" data-name="${escapeHtml(row.employee_name)}" data-date="${escapeHtml(row.work_date || '')}" title="Xoá">🗑</button>
    </article>
  `;
}

function renderStats(data) {
  const statsEl = $('historyStats');
  if (!statsEl) return;
  if (_adminMode !== 'day' || !data || data.length === 0) {
    statsEl.style.display = 'none';
    statsEl.innerHTML = '';
    return;
  }
  const total = data.length;
  const complete = data.filter(r => r.check_out_time).length;
  const inProgress = total - complete;
  let chips = `<span class="stat-chip"><span class="dot total"></span>${total} bản ghi</span>`;
  chips += `<span class="stat-chip"><span class="dot ok"></span>${complete} đã về</span>`;
  if (inProgress > 0) chips += `<span class="stat-chip"><span class="dot wait"></span>${inProgress} đang làm</span>`;
  statsEl.innerHTML = `
    <div class="stats-chips">${chips}</div>
    <button class="btn-bulk-delete" id="btnBulkDelete" type="button" title="Xoá tất cả bản ghi ngày này">🗑 Xoá hết</button>
  `;
  statsEl.style.display = 'flex';
}

function renderHistory(data) {
  const list = $('historyList');
  if (!data || data.length === 0) {
    list.innerHTML = `<p class="empty">Không có dữ liệu${_adminMode === 'month' ? ' trong tháng này' : ' cho ngày này'}.</p>`;
    renderStats(null);
    return;
  }
  const sub = $('historySubtitle');
  const dateVal = $('adminDate').value;
  if (sub) {
    if (_adminMode === 'day') sub.textContent = dateVal === todayISO() ? 'Hôm nay' : formatDateVN(dateVal);
    else sub.textContent = 'Tháng ' + dateVal.slice(5, 7) + '/' + dateVal.slice(0, 4);
  }
  const byDate = {};
  data.forEach(row => {
    if (!byDate[row.work_date]) byDate[row.work_date] = [];
    byDate[row.work_date].push(row);
  });
  const dates = Object.keys(byDate).sort().reverse();
  const today = todayISO();
  let html = '';
  if (_adminMode === 'month') {
    dates.forEach(d => {
      const isToday = d === today;
      const label = isToday ? 'Hôm nay · ' + formatDateFullVN(d) : formatDateFullVN(d);
      html += `<div class="day-separator${isToday ? ' today' : ''}"><span>${escapeHtml(label)}</span><span class="day-separator-count">${byDate[d].length}</span></div>`;
      html += byDate[d].map(r => renderAttendanceRow(r)).join('');
    });
  } else {
    html = data.map(r => renderAttendanceRow(r)).join('');
  }
  list.innerHTML = html;
  renderStats(data);
}

function renderEmployeeList(data) {
  const list = $('usersList');
  if (!data || data.length === 0) {
    list.innerHTML = '<p class="empty">Chưa có nhân viên nào.</p>';
    return;
  }
  list.innerHTML = data.map(e => {
    const phonePart = e.phone ? `<span class="meta-sep">·</span><span class="meta-phone">${escapeHtml(e.phone)}</span>` : '';
    const statusPill = e.active ? '<span class="pill pill-ok">Hoạt động</span>' : '<span class="pill pill-fail">Đã khoá</span>';
    return `
      <article class="data-card">
        <header class="employee-head">
          <div><h3>${escapeHtml(e.display_name)}</h3><div class="employee-meta"><code>${escapeHtml(e.username)}</code>${phonePart}</div></div>
          ${statusPill}
        </header>
        <footer class="data-card-actions">
          <button class="btn btn-outline btn-sm" data-action="reset" data-id="${e.id}" data-name="${escapeHtml(e.display_name)}">Mật khẩu</button>
          <button class="btn btn-outline btn-sm" data-action="toggle" data-id="${e.id}" data-active="${e.active}">${e.active ? 'Khoá' : 'Mở'}</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${e.id}" data-name="${escapeHtml(e.display_name)}">Xoá</button>
        </footer>
      </article>
    `;
  }).join('');
}

function populateFilter(data) {
  const sel = $('adminFilterEmp');
  if (!sel) return;
  const current = sel.value;
  let html = '<option value="">👤 Tất cả nhân viên</option>';
  (data || []).forEach(e => { html += `<option value="${escapeHtml(e.username)}">${escapeHtml(e.display_name)}</option>`; });
  sel.innerHTML = html;
  if (current) sel.value = current;
}

async function loadHistory() {
  const alertEl = $('alertAdmin');
  const btn = $('btnReloadHistory');
  const date = $('adminDate').value;
  const filterEmp = $('adminFilterEmp')?.value || '';
  hideAlert(alertEl);
  if (!date) { showAlert(alertEl, 'Vui lòng chọn ngày.', 'error'); return; }

  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    let query = supabaseClient.from('attendance').select('*');
    if (_adminMode === 'day') {
      query = query.eq('work_date', date);
    } else {
      const [y, m] = date.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
      query = query.gte('work_date', start).lte('work_date', end);
    }
    if (filterEmp) query = query.eq('employee_id', filterEmp);
    query = query.order('work_date', { ascending: false }).order('check_in_time', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;
    renderHistory(data);
  } catch (err) {
    console.error(err);
    showAlert(alertEl, 'Lỗi tải dữ liệu: ' + (err.message || err), 'error');
    $('historyList').innerHTML = '<p class="empty">Lỗi tải dữ liệu.</p>';
    renderStats(null);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄';
  }
}

async function loadEmployees() {
  const alertEl = $('alertUsers');
  hideAlert(alertEl);
  try {
    const { data, error } = await supabaseClient
      .from('employees').select('*').order('display_name', { ascending: true });
    if (error) throw error;
    _employeesCache = data || [];
    renderEmployeeList(data);
    populateFilter(data);
    populateTimesheetEmployees(data);
  } catch (err) {
    console.error(err);
    showAlert(alertEl, 'Lỗi tải danh sách: ' + (err.message || err), 'error');
    $('usersList').innerHTML = '<p class="empty">Lỗi tải danh sách.</p>';
  }
}

async function deleteAttendance(row, btn) {
  const { id, name, date } = row;
  const alertEl = $('alertAdmin');

  const { data: fresh, error: fetchErr } = await supabaseClient
    .from('attendance').select('*').eq('id', Number(id)).maybeSingle();
  if (fetchErr) { showAlert(alertEl, 'Lỗi tải bản ghi: ' + fetchErr.message, 'error'); return; }
  if (!fresh) {
    showAlert(alertEl, 'Bản ghi không tồn tại (có thể đã bị xoá).', 'warning');
    await loadHistory();
    return;
  }

  const inPhotoUrl  = fresh.check_in_photo_url  || '';
  const outPhotoUrl = fresh.check_out_photo_url || '';
  const dateStr = date ? formatDateVN(date) : '—';

  if (!confirm(`Xoá bản ghi chấm công của "${name}"?\n\nNgày: ${dateStr}\n\n⚠️ Ảnh chấm công cũng sẽ bị xoá vĩnh viễn.\nKhông thể hoàn tác.`)) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    const { error: dbErr } = await supabaseClient.from('attendance').delete().eq('id', Number(id));
    if (dbErr) throw dbErr;

    const paths = [];
    const inPath  = extractStoragePath(inPhotoUrl);
    const outPath = extractStoragePath(outPhotoUrl);
    if (inPath)  paths.push(inPath);
    if (outPath) paths.push(outPath);

    let storageNote = '';
    if (paths.length > 0) {
      const { error: storageErr } = await supabaseClient.storage.from(PHOTO_BUCKET).remove(paths);
      if (storageErr) { console.warn(storageErr); storageNote = ' (ảnh có thể chưa xoá hết)'; }
      else storageNote = ` cùng ${paths.length} ảnh`;
    }

    await loadHistory();
    showAlert(alertEl, `Đã xoá bản ghi của "${name}"${storageNote}.`, 'success');
  } catch (err) {
    console.error('Delete error:', err);
    showAlert(alertEl, 'Lỗi xoá: ' + (err.message || err), 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function deleteAllOnDate(date) {
  if (_bulkDeleting) return;
  const alertEl = $('alertAdmin');
  hideAlert(alertEl);
  if (!date) return;

  const { data: rows, error: fetchErr } = await supabaseClient
    .from('attendance').select('*').eq('work_date', date);
  if (fetchErr) { showAlert(alertEl, 'Lỗi tải dữ liệu: ' + fetchErr.message, 'error'); return; }
  if (!rows || rows.length === 0) { showAlert(alertEl, 'Không có bản ghi để xoá.', 'warning'); return; }

  if (!confirm(`Xoá TẤT CẢ ${rows.length} bản ghi chấm công ngày ${formatDateVN(date)}?\n\n⚠️ Ảnh chấm công cũng sẽ bị xoá vĩnh viễn.\nKhông thể hoàn tác.`)) return;

  _bulkDeleting = true;
  try {
    const { error: dbErr } = await supabaseClient.from('attendance').delete().eq('work_date', date);
    if (dbErr) throw dbErr;

    const paths = [];
    rows.forEach(r => {
      const inPath  = extractStoragePath(r.check_in_photo_url);
      const outPath = extractStoragePath(r.check_out_photo_url);
      if (inPath)  paths.push(inPath);
      if (outPath) paths.push(outPath);
    });

    let storageNote = '';
    if (paths.length > 0) {
      const { error: storageErr } = await supabaseClient.storage.from(PHOTO_BUCKET).remove(paths);
      if (storageErr) { console.warn(storageErr); storageNote = ' (một số ảnh có thể chưa xoá hết)'; }
      else storageNote = ` cùng ${paths.length} ảnh`;
    }

    await loadHistory();
    showAlert(alertEl, `Đã xoá ${rows.length} bản ghi${storageNote}.`, 'success');
  } catch (err) {
    console.error('Bulk delete error:', err);
    showAlert(alertEl, 'Lỗi xoá: ' + (err.message || err), 'error');
  } finally {
    _bulkDeleting = false;
  }
}

function initAdminHandlers() {
  initAdminMenu();

  $('adminDate').addEventListener('change', loadHistory);
  $('btnReloadHistory').addEventListener('click', loadHistory);

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === _adminMode) return;
      _adminMode = mode;
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      loadHistory();
    });
  });

  $('adminFilterEmp').addEventListener('change', (e) => {
    _adminFilterEmp = e.target.value;
    loadHistory();
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btnBulkDelete')) deleteAllOnDate($('adminDate').value);
  });

  $('historyList').addEventListener('click', async (e) => {
    const img = e.target.closest('img[data-full]');
    if (img) { if (img.dataset.full) window.open(img.dataset.full, '_blank'); return; }
    const delBtn = e.target.closest('[data-action="delete-attendance"]');
    if (delBtn) {
      await deleteAttendance({
        id: delBtn.dataset.id, name: delBtn.dataset.name, date: delBtn.dataset.date,
      }, delBtn);
    }
  });

  $('usersList').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, active, name } = btn.dataset;
    const alertEl = $('alertUsers');
    hideAlert(alertEl);

    if (action === 'delete') {
      if (!confirm(`Xoá nhân viên "${name}"? Dữ liệu chấm công cũ vẫn được giữ.`)) return;
      const { error } = await supabaseClient.from('employees').delete().eq('id', id);
      if (error) return showAlert(alertEl, 'Lỗi xoá: ' + error.message, 'error');
      showAlert(alertEl, 'Đã xoá nhân viên.', 'success');
      loadEmployees();
    } else if (action === 'toggle') {
      const newActive = active !== 'true';
      const { error } = await supabaseClient.from('employees').update({ active: newActive }).eq('id', id);
      if (error) return showAlert(alertEl, 'Lỗi: ' + error.message, 'error');
      loadEmployees();
    } else if (action === 'reset') {
      const newPwd = prompt(`Nhập mật khẩu mới cho "${name}":`);
      if (!newPwd) return;
      if (newPwd.length < 4) return showAlert(alertEl, 'Mật khẩu phải >= 4 ký tự.', 'error');
      const { error } = await supabaseClient.rpc('reset_employee_password', { p_id: id, p_password: newPwd });
      if (error) return showAlert(alertEl, 'Lỗi đổi mật khẩu: ' + error.message, 'error');
      showAlert(alertEl, 'Đã đổi mật khẩu.', 'success');
    }
  });

  $('btnAddEmployee').addEventListener('click', async () => {
    const alertEl = $('alertUsers');
    const btn = $('btnAddEmployee');
    hideAlert(alertEl);

    const username = $('newUsername').value.trim();
    const password = $('newPassword').value;
    const displayName = $('newDisplayName').value.trim();
    const phone = $('newPhone').value.trim();

    if (!username || !password || !displayName) {
      return showAlert(alertEl, 'Vui lòng nhập đủ: tên đăng nhập, mật khẩu, tên hiển thị.', 'error');
    }
    if (password.length < 4) return showAlert(alertEl, 'Mật khẩu phải từ 4 ký tự.', 'error');
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return showAlert(alertEl, 'Tên đăng nhập chỉ gồm chữ, số, gạch dưới, gạch ngang, dấu chấm.', 'error');
    }
    if (username === 'admin') return showAlert(alertEl, 'Tên "admin" được dành riêng cho quản trị viên.', 'error');

    btn.disabled = true;
    btn.textContent = 'Đang thêm...';
    try {
      const { error } = await supabaseClient.rpc('create_employee', {
        p_username: username, p_password: password,
        p_display_name: displayName, p_phone: phone || null,
      });
      if (error) throw error;
      showAlert(alertEl, `Đã thêm nhân viên "${displayName}".`, 'success');
      $('newUsername').value = '';
      $('newPassword').value = '';
      $('newDisplayName').value = '';
      $('newPhone').value = '';
      loadEmployees();
    } catch (err) {
      console.error(err);
      const msg = (err.message || '').includes('duplicate') ? 'Tên đăng nhập đã tồn tại.' : (err.message || 'Lỗi không xác định');
      showAlert(alertEl, 'Lỗi: ' + msg, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '+ Thêm nhân viên';
    }
  });

  $('btnAdminLogout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    currentAdminEmail = null;
    showScreen('login');
  });
}