/* =========================================================
   ADMIN — LỊCH SỬ (Ngày/Tháng, Filter NV, Bulk delete) + NHÂN VIÊN
   ========================================================= */

let _adminMode = 'day';       // 'day' | 'month'
let _adminFilterEmp = '';     // username hoặc ''

async function openAdminScreen(email) {
  currentAdminEmail = email;
  showScreen('admin');
  $('adminHeaderEmail').textContent = email;
  $('adminDate').value = todayISO();
  _adminMode = 'day';
  _adminFilterEmp = '';

  await Promise.all([loadHistory(), loadEmployees()]);
}

/* =========================================================
   RENDER — LỊCH SỬ (group theo ngày)
   ========================================================= */
function renderHistoryCard(row) {
  const hasOut = !!row.check_out_time;
  const inTime  = formatTime(row.check_in_time);
  const outTime = hasOut ? formatTime(row.check_out_time) : '—';
  const outClass = hasOut ? 'time-value' : 'time-value muted';
  const statusPill = hasOut
    ? '<span class="pill pill-ok">Đã về</span>'
    : '<span class="pill pill-wait">Đang làm</span>';

  const inPhoto = row.check_in_photo_url
    ? `<div class="photo-caption"><img src="${escapeHtml(row.check_in_photo_url)}" alt="Vào" data-full="${escapeHtml(row.check_in_photo_url)}" /><span>Vào</span></div>`
    : '';
  const outPhoto = row.check_out_photo_url
    ? `<div class="photo-caption"><img src="${escapeHtml(row.check_out_photo_url)}" alt="Ra" data-full="${escapeHtml(row.check_out_photo_url)}" /><span>Ra</span></div>`
    : '';

  return `
    <article class="data-card" data-record-id="${row.id}">
      <header class="attendance-head">
        <div>
          <h3>${escapeHtml(row.employee_name)}</h3>
          <code>${escapeHtml(row.employee_id || '')}</code>
        </div>
        <div class="head-actions">
          ${statusPill}
          <button class="btn-icon-sm"
                  data-action="delete-attendance"
                  data-id="${row.id}"
                  data-name="${escapeHtml(row.employee_name)}"
                  data-date="${escapeHtml(row.work_date || '')}"
                  title="Xoá bản ghi">🗑</button>
        </div>
      </header>
      <div class="attendance-times">
        <div class="time-block">
          <span class="time-label">Vào</span>
          <span class="time-value">${inTime}</span>
        </div>
        <div class="time-divider">→</div>
        <div class="time-block">
          <span class="time-label">Ra</span>
          <span class="${outClass}">${outTime}</span>
        </div>
      </div>
      ${inPhoto || outPhoto ? `<div class="attendance-photos">${inPhoto}${outPhoto}</div>` : ''}
    </article>
  `;
}

function renderHistory(data) {
  const list = $('historyList');
  const bulkBtn = $('btnBulkDelete');

  if (!data || data.length === 0) {
    list.innerHTML = `<p class="empty">Không có dữ liệu${_adminMode === 'month' ? ' trong tháng này' : ' cho ngày này'}.</p>`;
    bulkBtn.style.display = 'none';
    return;
  }

  // Group by work_date
  const byDate = {};
  data.forEach(row => {
    const d = row.work_date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(row);
  });

  const dates = Object.keys(byDate).sort().reverse();
  const today = todayISO();

  let html = '';
  dates.forEach(d => {
    const isToday = d === today;
    const headerLabel = isToday ? 'Hôm nay' : formatDateFullVN(d);
    const count = byDate[d].length;

    html += `<div class="day-group-header${isToday ? ' today' : ''}">`;
    html += `<span>${escapeHtml(headerLabel)}</span>`;
    html += `<span class="day-count">${count} bản ghi</span>`;
    html += `</div>`;

    html += byDate[d].map(row => renderHistoryCard(row)).join('');
  });

  list.innerHTML = html;

  // Bulk delete chỉ hiện ở mode Ngày
  if (_adminMode === 'day' && dates.length === 1) {
    bulkBtn.style.display = 'block';
    bulkBtn.textContent = `🗑 Xoá tất cả ${byDate[dates[0]].length} bản ghi ngày này`;
    bulkBtn.disabled = false;
  } else {
    bulkBtn.style.display = 'none';
  }
}

/* =========================================================
   RENDER — NHÂN VIÊN
   ========================================================= */
function renderEmployeeList(data) {
  const list = $('usersList');

  if (!data || data.length === 0) {
    list.innerHTML = '<p class="empty">Chưa có nhân viên nào.</p>';
    return;
  }

  list.innerHTML = data.map(e => {
    const phonePart = e.phone
      ? `<span class="meta-sep">·</span><span class="meta-phone">${escapeHtml(e.phone)}</span>`
      : '';
    const statusPill = e.active
      ? '<span class="pill pill-ok">Hoạt động</span>'
      : '<span class="pill pill-fail">Đã khoá</span>';

    return `
      <article class="data-card">
        <header class="employee-head">
          <div>
            <h3>${escapeHtml(e.display_name)}</h3>
            <div class="employee-meta">
              <code>${escapeHtml(e.username)}</code>
              ${phonePart}
            </div>
          </div>
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

/* =========================================================
   POPULATE FILTER
   ========================================================= */
function populateFilter(data) {
  const sel = $('adminFilterEmp');
  if (!sel) return;
  const current = sel.value;
  let html = '<option value="">👤 Tất cả nhân viên</option>';
  (data || []).forEach(e => {
    html += `<option value="${escapeHtml(e.username)}">${escapeHtml(e.display_name)}</option>`;
  });
  sel.innerHTML = html;
  if (current) sel.value = current;
}

/* =========================================================
   LOAD
   ========================================================= */
async function loadHistory() {
  const alertEl = $('alertAdmin');
  const btn = $('btnReloadHistory');
  const date = $('adminDate').value;
  const filterEmp = $('adminFilterEmp')?.value || '';
  hideAlert(alertEl);

  if (!date) {
    showAlert(alertEl, 'Vui lòng chọn ngày.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    let query = supabaseClient.from('attendance').select('*');

    if (_adminMode === 'day') {
      query = query.eq('work_date', date);
    } else {
      // Mode tháng: dùng ngày đang chọn để lấy tháng
      const [y, m] = date.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
      query = query.gte('work_date', start).lte('work_date', end);
    }

    if (filterEmp) query = query.eq('employee_id', filterEmp);

    query = query
      .order('work_date', { ascending: false })
      .order('check_in_time', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    renderHistory(data);

    // Update subtitle
    const sub = $('historySubtitle');
    if (sub) {
      if (_adminMode === 'day') sub.textContent = 'Theo ngày ' + formatDateVN(date);
      else sub.textContent = 'Theo tháng ' + date.slice(5, 7) + '/' + date.slice(0, 4);
    }
  } catch (err) {
    console.error(err);
    showAlert(alertEl, 'Lỗi tải dữ liệu: ' + (err.message || err), 'error');
    $('historyList').innerHTML = '<p class="empty">Lỗi tải dữ liệu.</p>';
    $('btnBulkDelete').style.display = 'none';
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
    renderEmployeeList(data);
    populateFilter(data);
  } catch (err) {
    console.error(err);
    showAlert(alertEl, 'Lỗi tải danh sách: ' + (err.message || err), 'error');
    $('usersList').innerHTML = '<p class="empty">Lỗi tải danh sách.</p>';
  }
}

/* =========================================================
   XOÁ 1 RECORD — fetch tươi DB trước, xoá DB trước ảnh
   ========================================================= */
async function deleteAttendance(row, btn) {
  const { id, name, date } = row;
  const alertEl = $('alertAdmin');

  // 1. Fetch tươi từ DB (không dùng cache)
  const { data: fresh, error: fetchErr } = await supabaseClient
    .from('attendance').select('*').eq('id', Number(id)).maybeSingle();

  if (fetchErr) {
    showAlert(alertEl, 'Lỗi tải bản ghi: ' + fetchErr.message, 'error');
    return;
  }
  if (!fresh) {
    showAlert(alertEl, 'Bản ghi không tồn tại (có thể đã bị xoá).', 'warning');
    await loadHistory();
    return;
  }

  const inPhotoUrl  = fresh.check_in_photo_url  || '';
  const outPhotoUrl = fresh.check_out_photo_url || '';
  const dateStr = date ? formatDateVN(date) : '—';

  const confirmMsg =
    `Xoá bản ghi chấm công của "${name}"?\n\n` +
    `Ngày: ${dateStr}\n\n` +
    `⚠️ Ảnh chấm công cũng sẽ bị xoá vĩnh viễn.\n` +
    `Không thể hoàn tác.`;

  if (!confirm(confirmMsg)) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    // 2. Xoá DB trước (an toàn hơn)
    const { error: dbErr } = await supabaseClient
      .from('attendance')
      .delete()
      .eq('id', Number(id));
    if (dbErr) throw dbErr;

    // 3. Xoá ảnh sau
    const paths = [];
    const inPath  = extractStoragePath(inPhotoUrl);
    const outPath = extractStoragePath(outPhotoUrl);
    if (inPath)  paths.push(inPath);
    if (outPath) paths.push(outPath);

    let storageNote = '';
    if (paths.length > 0) {
      const { error: storageErr } = await supabaseClient.storage
        .from(PHOTO_BUCKET)
        .remove(paths);
      if (storageErr) {
        console.warn('Cảnh báo xoá ảnh:', storageErr);
        storageNote = ' (ảnh có thể chưa xoá hết)';
      } else {
        storageNote = ` cùng ${paths.length} ảnh`;
      }
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

/* =========================================================
   BULK XOÁ — tất cả bản ghi của 1 ngày
   ========================================================= */
async function deleteAllOnDate(date) {
  const alertEl = $('alertAdmin');
  const btn = $('btnBulkDelete');
  hideAlert(alertEl);

  if (!date) return;

  // Fetch tươi
  const { data: rows, error: fetchErr } = await supabaseClient
    .from('attendance').select('*').eq('work_date', date);
  if (fetchErr) {
    showAlert(alertEl, 'Lỗi tải dữ liệu: ' + fetchErr.message, 'error');
    return;
  }
  if (!rows || rows.length === 0) {
    showAlert(alertEl, 'Không có bản ghi để xoá.', 'warning');
    return;
  }

  const confirmMsg =
    `Xoá TẤT CẢ ${rows.length} bản ghi chấm công ngày ${formatDateVN(date)}?\n\n` +
    `⚠️ Ảnh chấm công cũng sẽ bị xoá vĩnh viễn.\n` +
    `Không thể hoàn tác.`;
  if (!confirm(confirmMsg)) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Đang xoá...';

  try {
    // 1. Xoá DB trước
    const { error: dbErr } = await supabaseClient
      .from('attendance').delete().eq('work_date', date);
    if (dbErr) throw dbErr;

    // 2. Xoá ảnh sau
    const paths = [];
    rows.forEach(r => {
      const inPath  = extractStoragePath(r.check_in_photo_url);
      const outPath = extractStoragePath(r.check_out_photo_url);
      if (inPath)  paths.push(inPath);
      if (outPath) paths.push(outPath);
    });

    let storageNote = '';
    if (paths.length > 0) {
      const { error: storageErr } = await supabaseClient.storage
        .from(PHOTO_BUCKET).remove(paths);
      if (storageErr) {
        console.warn('Cảnh báo xoá ảnh:', storageErr);
        storageNote = ' (một số ảnh có thể chưa xoá hết)';
      } else {
        storageNote = ` cùng ${paths.length} ảnh`;
      }
    }

    await loadHistory();
    showAlert(alertEl, `Đã xoá ${rows.length} bản ghi${storageNote}.`, 'success');
  } catch (err) {
    console.error('Bulk delete error:', err);
    showAlert(alertEl, 'Lỗi xoá: ' + (err.message || err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/* =========================================================
   HANDLERS
   ========================================================= */
function initAdminHandlers() {
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
      if (name === 'users') loadEmployees();
      if (name === 'history') loadHistory();
    });
  });

  // Date
  $('adminDate').addEventListener('change', loadHistory);
  $('btnReloadHistory').addEventListener('click', loadHistory);

  // Mode toggle
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === _adminMode) return;
      _adminMode = mode;
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
      });
      loadHistory();
    });
  });

  // Filter NV
  $('adminFilterEmp').addEventListener('change', (e) => {
    _adminFilterEmp = e.target.value;
    loadHistory();
  });

  // Bulk delete
  $('btnBulkDelete').addEventListener('click', () => {
    const date = $('adminDate').value;
    deleteAllOnDate(date);
  });

  // Click trong history list
  $('historyList').addEventListener('click', async (e) => {
    const img = e.target.closest('img[data-full]');
    if (img) {
      if (img.dataset.full) window.open(img.dataset.full, '_blank');
      return;
    }

    const delBtn = e.target.closest('[data-action="delete-attendance"]');
    if (delBtn) {
      await deleteAttendance({
        id: delBtn.dataset.id,
        name: delBtn.dataset.name,
        date: delBtn.dataset.date,
      }, delBtn);
    }
  });

  // Employee list actions
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
      const { error } = await supabaseClient.rpc('reset_employee_password', {
        p_id: id, p_password: newPwd,
      });
      if (error) return showAlert(alertEl, 'Lỗi đổi mật khẩu: ' + error.message, 'error');
      showAlert(alertEl, 'Đã đổi mật khẩu.', 'success');
    }
  });

  // Add employee
  $('btnAddEmployee').addEventListener('click', async () => {
    const alertEl = $('alertUsers');
    const btn = $('btnAddEmployee');
    hideAlert(alertEl);

    const username    = $('newUsername').value.trim();
    const password    = $('newPassword').value;
    const displayName = $('newDisplayName').value.trim();
    const phone       = $('newPhone').value.trim();

    if (!username || !password || !displayName) {
      showAlert(alertEl, 'Vui lòng nhập đủ: tên đăng nhập, mật khẩu, tên hiển thị.', 'error');
      return;
    }
    if (password.length < 4) {
      showAlert(alertEl, 'Mật khẩu phải từ 4 ký tự.', 'error');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      showAlert(alertEl, 'Tên đăng nhập chỉ gồm chữ, số, gạch dưới, gạch ngang, dấu chấm.', 'error');
      return;
    }
    if (username === 'admin') {
      showAlert(alertEl, 'Tên "admin" được dành riêng cho quản trị viên.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang thêm...';

    try {
      const { error } = await supabaseClient.rpc('create_employee', {
        p_username: username,
        p_password: password,
        p_display_name: displayName,
        p_phone: phone || null,
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
      const msg = (err.message || '').includes('duplicate')
        ? 'Tên đăng nhập đã tồn tại.'
        : (err.message || 'Lỗi không xác định');
      showAlert(alertEl, 'Lỗi: ' + msg, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '+ Thêm nhân viên';
    }
  });

  // Logout
  $('btnAdminLogout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    currentAdminEmail = null;
    showScreen('login');
  });
}