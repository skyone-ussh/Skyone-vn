/* =========================================================
   ADMIN FLOW
   ========================================================= */

async function openAdminDashboard(email) {
  currentAdminEmail = email;
  showScreen('admin');
  $('adminHeaderEmail').textContent = email;
  $('adminDate').value = todayISO();
  await loadSettingsForAdmin();
  await loadEmployees();
}

/* ========== RENDER CARDS ========== */
function renderAttendanceList(data) {
  const list = $('adminAttendanceList');

  if (!data || data.length === 0) {
    list.innerHTML = '<p class="empty">Không có dữ liệu chấm công cho ngày này.</p>';
    return;
  }

  list.innerHTML = data.map((row, i) => {
    const inPos = row.check_in_lat != null
      ? `<span class="cell-mono">${fmtCoord(row.check_in_lat, row.check_in_lng)}</span>
         ${row.check_in_distance != null ? `<span class="cell-mono">${Math.round(row.check_in_distance)}m</span>` : ''}`
      : '<span class="muted">—</span>';
    const outPos = row.check_out_lat != null
      ? `<span class="cell-mono">${fmtCoord(row.check_out_lat, row.check_out_lng)}</span>
         ${row.check_out_distance != null ? `<span class="cell-mono">${Math.round(row.check_out_distance)}m</span>` : ''}`
      : '<span class="muted">—</span>';

    return `
      <article class="data-card">
        <header class="data-card-head">
          <div class="data-card-title">
            <h3>${escapeHtml(row.employee_name)}</h3>
            <code>${escapeHtml(row.employee_id || '')}</code>
          </div>
          <span class="data-card-index">#${i + 1}</span>
        </header>
        <div class="data-card-body">
          <div class="data-row">
            <span class="data-label">Giờ vào</span>
            <span class="data-value">${fmtTime(row.check_in_time)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Giờ ra</span>
            <span class="data-value">${fmtTime(row.check_out_time)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Vị trí vào</span>
            <span class="data-value">${inPos}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Vị trí ra</span>
            <span class="data-value">${outPos}</span>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderEmployeeList(data) {
  const list = $('usersList');

  if (!data || data.length === 0) {
    list.innerHTML = '<p class="empty">Chưa có nhân viên nào.</p>';
    return;
  }

  list.innerHTML = data.map((e, i) => `
    <article class="data-card">
      <header class="data-card-head">
        <div class="data-card-title">
          <h3>${escapeHtml(e.display_name)}</h3>
          <code>${escapeHtml(e.username)}</code>
        </div>
        <span class="pill ${e.active ? 'pill-ok' : 'pill-fail'}">${e.active ? 'Hoạt động' : 'Đã khoá'}</span>
      </header>
      <div class="data-card-body">
        <div class="data-row">
          <span class="data-label">SĐT</span>
          <span class="data-value">${e.phone ? escapeHtml(e.phone) : '<span class="muted">—</span>'}</span>
        </div>
        <div class="data-row">
          <span class="data-label">STT</span>
          <span class="data-value">${i + 1}</span>
        </div>
      </div>
      <footer class="data-card-actions">
        <button class="btn btn-outline btn-sm" data-action="reset" data-id="${e.id}" data-name="${escapeHtml(e.display_name)}">Mật khẩu</button>
        <button class="btn btn-outline btn-sm" data-action="toggle" data-id="${e.id}" data-active="${e.active}">${e.active ? 'Khoá' : 'Mở'}</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${e.id}" data-name="${escapeHtml(e.display_name)}">Xoá</button>
      </footer>
    </article>
  `).join('');
}

/* ========== DATA LOADERS ========== */
async function loadSettingsForAdmin() {
  try {
    const { data, error } = await supabaseClient
      .from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    if (data && data.university_lat != null && data.university_lng != null) {
      $('savedLoc').textContent =
        `${Number(data.university_lat).toFixed(5)}, ${Number(data.university_lng).toFixed(5)} · Bán kính ${data.radius_meters || 200}m`;
      $('radiusInput').value = data.radius_meters || 200;
      attendanceLocation = {
        lat: data.university_lat,
        lng: data.university_lng,
        radiusMeters: data.radius_meters || 200,
      };
    } else {
      $('savedLoc').textContent = 'Chưa cài đặt';
    }
  } catch (err) {
    console.warn(err);
    $('savedLoc').textContent = 'Lỗi tải';
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

/* ========== HANDLERS ========== */
function initAdminHandlers() {
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
      if (name === 'settings') loadSettingsForAdmin();
      if (name === 'users')    loadEmployees();
    });
  });

  // Đặt vị trí
  $('btnSetLocation').addEventListener('click', async () => {
    const alertEl = $('alertSettings');
    const btn = $('btnSetLocation');
    hideAlert(alertEl);

    const radius = parseInt($('radiusInput').value, 10);
    if (!radius || radius < 10) {
      showAlert(alertEl, 'Bán kính phải là số >= 10 mét.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang lấy vị trí...';

    try {
      const pos = await getPosition();
      const { error } = await supabaseClient.from('settings').update({
        university_lat: pos.lat,
        university_lng: pos.lng,
        radius_meters: radius,
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) throw error;

      attendanceLocation = { lat: pos.lat, lng: pos.lng, radiusMeters: radius };
      $('savedLoc').textContent =
        `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} · Bán kính ${radius}m`;
      showAlert(alertEl, `Đã lưu vị trí: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} (bán kính ${radius}m)`, 'success');
    } catch (err) {
      console.error(err);
      showAlert(alertEl, 'Lỗi: ' + (err.message || err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📍 Đặt vị trí hiện tại';
    }
  });

  // Load dữ liệu chấm công
  $('btnLoadData').addEventListener('click', async () => {
    const alertEl = $('alertAdmin');
    const btn = $('btnLoadData');
    hideAlert(alertEl);

    const date = $('adminDate').value;
    if (!date) {
      showAlert(alertEl, 'Vui lòng chọn ngày.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang tải...';

    try {
      const { data, error } = await supabaseClient
        .from('attendance').select('*').eq('work_date', date)
        .order('check_in_time', { ascending: true });
      if (error) throw error;
      renderAttendanceList(data);
    } catch (err) {
      console.error(err);
      showAlert(alertEl, 'Lỗi tải dữ liệu: ' + (err.message || err), 'error');
      $('adminAttendanceList').innerHTML = '<p class="empty">Lỗi tải dữ liệu.</p>';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Xem dữ liệu';
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

  // Thêm nhân viên
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

  // Logout admin
  $('btnAdminLogout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    currentAdminEmail = null;
    showScreen('login');
  });
}