/* =========================================================
   ADMIN — LỊCH SỬ CHẤM CÔNG + NHÂN VIÊN
   ========================================================= */

async function openAdminScreen(email) {
  currentAdminEmail = email;
  showScreen('admin');
  $('adminHeaderEmail').textContent = email;
  $('adminDate').value = todayISO();
  await loadHistory();
  await loadEmployees();
}

/* =========================================================
   RENDER — LỊCH SỬ (có nút xoá)
   ========================================================= */
function renderHistory(data) {
  const list = $('historyList');

  if (!data || data.length === 0) {
    list.innerHTML = '<p class="empty">Không có dữ liệu chấm công cho ngày này.</p>';
    return;
  }

  list.innerHTML = data.map(row => {
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
  }).join('');
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
   LOAD
   ========================================================= */
async function loadHistory() {
  const alertEl = $('alertAdmin');
  const btn = $('btnReloadHistory');
  const date = $('adminDate').value;
  hideAlert(alertEl);

  if (!date) {
    showAlert(alertEl, 'Vui lòng chọn ngày.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    const { data, error } = await supabaseClient
      .from('attendance').select('*').eq('work_date', date)
      .order('check_in_time', { ascending: true });
    if (error) throw error;
    renderHistory(data);
  } catch (err) {
    console.error(err);
    showAlert(alertEl, 'Lỗi tải dữ liệu: ' + (err.message || err), 'error');
    $('historyList').innerHTML = '<p class="empty">Lỗi tải dữ liệu.</p>';
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
  } catch (err) {
    console.error(err);
    showAlert(alertEl, 'Lỗi tải danh sách: ' + (err.message || err), 'error');
    $('usersList').innerHTML = '<p class="empty">Lỗi tải danh sách.</p>';
  }
}

/* =========================================================
   XOÁ ATTENDANCE (record + ảnh storage)
   ========================================================= */
async function deleteAttendance(row, btn) {
  const { id, name, date } = row;
  const alertEl = $('alertAdmin');

  // Lấy URL ảnh từ record cache
  const cache = window._attendanceCache || {};
  const record = cache[String(id)];
  const inPhotoUrl  = record?.check_in_photo_url  || '';
  const outPhotoUrl = record?.check_out_photo_url || '';

  const dateStr = date ? formatDateVN(date) : '—';
  const confirmMsg =
    `Xoá bản ghi chấm công của "${name}"?\n\n` +
    `Ngày: ${dateStr}\n\n` +
    `⚠️ Ảnh chấm công cũng sẽ bị xoá vĩnh viễn.\n` +
    `Không thể hoàn tác.`;

  if (!confirm(confirmMsg)) return;

  // Disable nút để tránh double-click
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    // ----- 1) Xoá ảnh khỏi Storage -----
    const paths = [];
    const inPath  = extractStoragePath(inPhotoUrl);
    const outPath = extractStoragePath(outPhotoUrl);
    if (inPath)  paths.push(inPath);
    if (outPath) paths.push(outPath);

    if (paths.length > 0) {
      const { error: storageErr } = await supabaseClient.storage
        .from(PHOTO_BUCKET)
        .remove(paths);

      if (storageErr) {
        // Không chặn xoá record — ưu tiên dọn database
        console.warn('Cảnh báo xoá ảnh:', storageErr);
      }
    }

    // ----- 2) Xoá record khỏi DB -----
    const { error: dbErr } = await supabaseClient
      .from('attendance')
      .delete()
      .eq('id', Number(id));

    if (dbErr) throw dbErr;

    // ----- 3) Refresh + thông báo -----
    const dateVal = $('adminDate').value;
    const { data: refreshed } = await supabaseClient
      .from('attendance').select('*').eq('work_date', dateVal)
      .order('check_in_time', { ascending: true });

    renderHistory(refreshed || []);
    showAlert(alertEl, `Đã xoá bản ghi của "${name}"${paths.length > 0 ? ' cùng ' + paths.length + ' ảnh' : ''}.`, 'success');
  } catch (err) {
    console.error('Delete error:', err);
    showAlert(alertEl, 'Lỗi xoá: ' + (err.message || err), 'error');
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

  // Date change → auto reload
  $('adminDate').addEventListener('change', loadHistory);
  $('btnReloadHistory').addEventListener('click', loadHistory);

  // Click trong history list
  $('historyList').addEventListener('click', async (e) => {
    // Xem ảnh full
    const img = e.target.closest('img[data-full]');
    if (img) {
      if (img.dataset.full) window.open(img.dataset.full, '_blank');
      return;
    }

    // Nút xoá
    const delBtn = e.target.closest('[data-action="delete-attendance"]');
    if (delBtn) {
      await deleteAttendance({
        id: delBtn.dataset.id,
        name: delBtn.dataset.name,
        date: delBtn.dataset.date,
      }, delBtn);
    }
  });

  // Employee actions
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