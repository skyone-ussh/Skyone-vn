/* =========================================================
   EMPLOYEE — CHẤM CÔNG BẰNG CAMERA
   ========================================================= */

async function openEmployeeScreen(emp) {
  currentEmployee = emp;
  showScreen('employee');

  $('empHeaderName').textContent = emp.display_name || emp.username;
  hideAlert($('empAlert'));

  updateRecordLine(null);
  $('recordPhotos').innerHTML = '';

  await refreshTodayRecord();
}

/* ========== RENDER ========== */
function updateRecordLine(record) {
  const dateEl = $('rlDate');
  const nameEl = $('rlName');
  const inEl   = $('rlIn');
  const outEl  = $('rlOut');

  // Ngày
  dateEl.textContent = formatDateVN(todayISO());

  // Tên
  nameEl.textContent = currentEmployee?.display_name || currentEmployee?.username || '—';

  if (record) {
    inEl.textContent = formatTime(record.check_in_time);
    inEl.classList.remove('missing');

    if (record.check_out_time) {
      outEl.textContent = formatTime(record.check_out_time);
      outEl.classList.remove('missing');
    } else {
      outEl.textContent = 'Chưa ra';
      outEl.classList.add('missing');
    }
  } else {
    inEl.textContent = 'Chưa vào';
    inEl.classList.add('missing');
    outEl.textContent = 'Chưa ra';
    outEl.classList.add('missing');
  }
}

function renderPhotos(record) {
  const wrap = $('recordPhotos');
  const photos = [];
  if (record?.check_in_photo_url) {
    photos.push(`<img src="${escapeHtml(record.check_in_photo_url)}" alt="Vào" data-full="${escapeHtml(record.check_in_photo_url)}" />`);
  }
  if (record?.check_out_photo_url) {
    photos.push(`<img src="${escapeHtml(record.check_out_photo_url)}" alt="Ra" data-full="${escapeHtml(record.check_out_photo_url)}" />`);
  }
  wrap.innerHTML = photos.join('');
}

function updateActionButton() {
  const btn = $('btnAction');
  const rec = currentTodayRecord;

  btn.disabled = false;

  if (!rec) {
    btn.textContent = '📸 Chấm công vào';
    btn.dataset.action = 'checkin';
  } else if (!rec.check_out_time) {
    btn.textContent = '📸 Chấm công ra';
    btn.dataset.action = 'checkout';
  } else {
    btn.textContent = '✅ Đã hoàn thành hôm nay';
    btn.disabled = true;
    delete btn.dataset.action;
  }
}

/* ========== LOAD ========== */
async function refreshTodayRecord() {
  if (!currentEmployee || !currentEmployeePassword) return;

  try {
    const { data: rows, error } = await supabaseClient.rpc('get_today_attendance', {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
    });
    if (error) throw error;

    // null = mật khẩu bị đổi hoặc tài khoản bị khoá
    if (!rows) {
      clearEmployeeSession();
      currentEmployee = null;
      showScreen('login');
      showAlert($('loginAlert'), 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', 'warning');
      return;
    }

    currentTodayRecord = rows[0] || null;
    updateRecordLine(currentTodayRecord);
    renderPhotos(currentTodayRecord);
    updateActionButton();
  } catch (err) {
    console.error('refreshTodayRecord error:', err);
    showAlert($('empAlert'), 'Không tải được dữ liệu: ' + (err.message || err), 'error');
    updateRecordLine(null);
    $('btnAction').disabled = true;
    $('btnAction').textContent = 'Lỗi tải dữ liệu';
  }
}

/* ========== PHOTO FLOW ========== */
function initEmployeeHandlers() {
  const photoInput = $('photoInput');
  const modal = $('photoModal');
  const btnRetake = $('btnRetake');
  const btnConfirm = $('btnConfirmPhoto');
  const btnAction = $('btnAction');

  // Bấm nút → mở camera
  btnAction.addEventListener('click', () => {
    const action = btnAction.dataset.action;
    if (!action) return;
    pendingPhotoAction = action;
    $('photoModalSubtitle').textContent = action === 'checkin'
      ? 'Ảnh xác nhận vào ca'
      : 'Ảnh xác nhận ra ca';
    hideAlert($('empAlert'));
    photoInput.value = '';
    photoInput.click();
  });

  // Chọn/chụp ảnh xong
  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, 1200, 0.8);
      pendingPhotoBlob = compressed;
      const url = URL.createObjectURL(compressed);
      $('photoPreview').src = url;
      modal.classList.add('show');
    } catch (err) {
      console.error(err);
      showAlert($('empAlert'), 'Không xử lý được ảnh: ' + (err.message || err), 'error');
    }
  });

  // Chụp lại
  btnRetake.addEventListener('click', () => {
    modal.classList.remove('show');
    pendingPhotoBlob = null;
    const preview = $('photoPreview');
    if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
    preview.src = '';
    setTimeout(() => photoInput.click(), 100);
  });

  // Đóng modal khi click nền
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      pendingPhotoBlob = null;
      const preview = $('photoPreview');
      if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
      preview.src = '';
    }
  });

  // Xác nhận → upload + ghi record
  btnConfirm.addEventListener('click', async () => {
    if (!pendingPhotoBlob || !pendingPhotoAction || !currentEmployee) return;

    btnConfirm.disabled = true;
    btnConfirm.textContent = 'Đang gửi...';

    try {
      // 1) Upload ảnh
      const photoUrl = await uploadPhoto(
        pendingPhotoBlob,
        currentEmployee.username,
        pendingPhotoAction
      );

      // 2) Gọi RPC
      let rpcName, rpcParams;
      if (pendingPhotoAction === 'checkin') {
        rpcName = 'employee_checkin';
        rpcParams = {
          p_username: currentEmployee.username,
          p_password: currentEmployeePassword,
          p_photo_url: photoUrl,
        };
      } else {
        rpcName = 'employee_checkout';
        rpcParams = {
          p_username: currentEmployee.username,
          p_password: currentEmployeePassword,
          p_photo_url: photoUrl,
        };
      }

      const { data: result, error: rpcErr } = await supabaseClient.rpc(rpcName, rpcParams);
      if (rpcErr) throw rpcErr;

      const res = result && result[0];
      if (!res) throw new Error('Không nhận được phản hồi từ server.');

      // 3) Xử lý kết quả
      if (res.status === 'ok') {
        modal.classList.remove('show');
        const preview = $('photoPreview');
        if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
        preview.src = '';
        pendingPhotoBlob = null;

        const msg = pendingPhotoAction === 'checkin'
          ? `✅ Đã chấm công vào lúc ${formatTime(res.check_in_time || res.check_out_time)}`
          : `✅ Đã chấm công ra lúc ${formatTime(res.check_out_time)}`;
        showAlert($('empAlert'), msg, 'success');

        await refreshTodayRecord();
      } else if (res.status === 'auth_failed') {
        clearEmployeeSession();
        currentEmployee = null;
        modal.classList.remove('show');
        showScreen('login');
        showAlert($('loginAlert'), 'Phiên đăng nhập hết hạn.', 'warning');
      } else if (res.status === 'already_in' || res.status === 'already_out') {
        modal.classList.remove('show');
        pendingPhotoBlob = null;
        showAlert($('empAlert'), res.message, 'warning');
        await refreshTodayRecord();
      } else if (res.status === 'not_found') {
        throw new Error(res.message || 'Không tìm thấy lượt chấm công vào.');
      } else {
        throw new Error(res.message || 'Không thể chấm công.');
      }
    } catch (err) {
      console.error('Check-in/out error:', err);
      showAlert($('empAlert'), 'Lỗi: ' + (err.message || err), 'error');
    } finally {
      btnConfirm.disabled = false;
      btnConfirm.textContent = 'Xác nhận';
    }
  });

  // Xem ảnh full
  $('recordPhotos').addEventListener('click', (e) => {
    const img = e.target.closest('img[data-full]');
    if (!img) return;
    const url = img.dataset.full;
    if (url) window.open(url, '_blank');
  });

  // Logout
  $('btnEmpLogout').addEventListener('click', () => {
    clearEmployeeSession();
    currentEmployee = null;
    currentTodayRecord = null;
    showScreen('login');
  });
}