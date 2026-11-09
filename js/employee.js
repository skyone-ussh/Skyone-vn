/* =========================================================
   EMPLOYEE — CHẤM CÔNG BẰNG CAMERA (TỐI ƯU)
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

  dateEl.textContent = formatDateVN(todayISO());
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

/* ========== LOAD (chỉ gọi 1 lần khi mở screen) ========== */
async function refreshTodayRecord() {
  if (!currentEmployee || !currentEmployeePassword) return;

  try {
    const { data: rows, error } = await supabaseClient.rpc('get_today_attendance', {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
    });
    if (error) throw error;

    // null = password sai / tài khoản bị khoá
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

/* ========== PHOTO MODAL HELPERS ========== */
function closePhotoModal() {
  const modal = $('photoModal');
  modal.classList.remove('show');
  $('photoLoading').style.display = 'none';

  const preview = $('photoPreview');
  if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
  preview.src = '';

  pendingPhotoBlob = null;
  pendingPhotoAction = null;
}

function setLoadingState(text) {
  $('photoLoadingText').textContent = text;
}

/* ========== HANDLERS ========== */
function initEmployeeHandlers() {
  const photoInput = $('photoInput');
  const modal = $('photoModal');
  const btnRetake = $('btnRetake');
  const btnConfirm = $('btnConfirmPhoto');
  const btnAction = $('btnAction');

  // Mở camera
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

  // Chọn ảnh xong → nén (nhanh, ~500ms) → hiện preview
  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const blob = await compressImage(file, 800, 0.7);
      pendingPhotoBlob = blob;

      const url = URL.createObjectURL(blob);
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

  // Đóng modal khi click nền (chỉ khi không đang loading)
  modal.addEventListener('click', (e) => {
    if (e.target === modal && $('photoLoading').style.display === 'none') {
      closePhotoModal();
    }
  });

  // ========== XÁC NHẬN ==========
  btnConfirm.addEventListener('click', async () => {
    if (!pendingPhotoBlob || !pendingPhotoAction || !currentEmployee) return;

    // Hiện loading overlay
    $('photoLoading').style.display = 'flex';
    btnConfirm.disabled = true;
    btnRetake.disabled = true;

    try {
      // ----- Bước 1: Upload ảnh -----
      setLoadingState('Đang tải ảnh lên...');
      const photoUrl = await uploadPhoto(
        pendingPhotoBlob,
        currentEmployee.username,
        pendingPhotoAction
      );

      // ----- Bước 2: Gọi RPC -----
      setLoadingState('Đang lưu...');
      const rpcName = pendingPhotoAction === 'checkin'
        ? 'employee_checkin'
        : 'employee_checkout';

      const { data: result, error: rpcErr } = await supabaseClient.rpc(rpcName, {
        p_username: currentEmployee.username,
        p_password: currentEmployeePassword,
        p_photo_url: photoUrl,
      });
      if (rpcErr) throw rpcErr;

      const res = result && result[0];
      if (!res) throw new Error('Không nhận được phản hồi từ server.');

      // ----- Bước 3: Xử lý kết quả -----
      if (res.status === 'ok') {
        // OPTIMISTIC UI — không gọi refreshTodayRecord nữa
        if (pendingPhotoAction === 'checkin') {
          currentTodayRecord = {
            id: res.record_id,
            check_in_time: res.check_in_time,
            check_out_time: null,
            check_in_photo_url: photoUrl,
            check_out_photo_url: null,
          };
        } else if (currentTodayRecord) {
          currentTodayRecord.check_out_time = res.check_out_time;
          currentTodayRecord.check_out_photo_url = photoUrl;
        }

        const successMsg = pendingPhotoAction === 'checkin'
          ? `✅ Đã chấm công vào lúc ${formatTime(res.check_in_time)}`
          : `✅ Đã chấm công ra lúc ${formatTime(res.check_out_time)}`;

        closePhotoModal();

        // Cập nhật UI ngay từ data RPC trả về (không cần network)
        updateRecordLine(currentTodayRecord);
        renderPhotos(currentTodayRecord);
        updateActionButton();
        showAlert($('empAlert'), successMsg, 'success');
        return;
      }

      // ----- Các status lỗi -----
      if (res.status === 'auth_failed') {
        closePhotoModal();
        clearEmployeeSession();
        currentEmployee = null;
        showScreen('login');
        showAlert($('loginAlert'), 'Phiên đăng nhập hết hạn.', 'warning');
        return;
      }

      if (res.status === 'already_in' || res.status === 'already_out') {
        closePhotoModal();
        showAlert($('empAlert'), res.message, 'warning');
        await refreshTodayRecord();
        return;
      }

      if (res.status === 'not_found') {
        throw new Error(res.message || 'Không tìm thấy lượt chấm công vào.');
      }

      throw new Error(res.message || 'Không thể chấm công.');
    } catch (err) {
      console.error('Check-in/out error:', err);
      $('photoLoading').style.display = 'none';
      btnConfirm.disabled = false;
      btnRetake.disabled = false;
      showAlert($('empAlert'), 'Lỗi: ' + (err.message || err), 'error');
    }
  });

  // Xem ảnh full
  $('recordPhotos').addEventListener('click', (e) => {
    const img = e.target.closest('img[data-full]');
    if (!img) return;
    if (img.dataset.full) window.open(img.dataset.full, '_blank');
  });

  // Logout
  $('btnEmpLogout').addEventListener('click', () => {
    clearEmployeeSession();
    currentEmployee = null;
    currentTodayRecord = null;
    showScreen('login');
  });
}