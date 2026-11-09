/* =========================================================
   EMPLOYEE — CHẤM CÔNG BẰNG CAMERA (AUTO SUBMIT)
   Bấm nút → chụp → tự động gửi, không xác nhận
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

/* ========== LOAD ========== */
async function refreshTodayRecord() {
  if (!currentEmployee || !currentEmployeePassword) return;

  try {
    const { data: rows, error } = await supabaseClient.rpc('get_today_attendance', {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
    });
    if (error) throw error;

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

/* ========== LOADING OVERLAY ========== */
let loadingCancelled = false;

function showLoading(text, sub) {
  loadingCancelled = false;
  $('loadingText').textContent = text || 'Đang xử lý...';
  $('loadingSub').textContent = sub || 'Vui lòng không tắt trình duyệt';
  $('loadingOverlay').classList.add('show');
  $('btnCancelLoading').disabled = false;
  $('btnCancelLoading').textContent = 'Huỷ';
}
function setLoadingText(text, sub) {
  $('loadingText').textContent = text;
  if (sub !== undefined) $('loadingSub').textContent = sub;
}
function hideLoading() {
  $('loadingOverlay').classList.remove('show');
}

/* ========== XỬ LÝ ẢNH + GỬI ========== */
async function processAndSubmit(file, action) {
  if (!currentEmployee || !currentEmployeePassword) return;

  showLoading(
    action === 'checkin' ? 'Đang chấm công vào...' : 'Đang chấm công ra...',
    'Đang xử lý ảnh...'
  );

  try {
    // ----- Bước 1: Nén ảnh (rất nhanh, ~300-500ms) -----
    const blob = await compressImage(file, 800, 0.7);

    if (loadingCancelled) {
      hideLoading();
      return;
    }

    // ----- Bước 2: Upload -----
    setLoadingText('Đang tải ảnh lên...', 'Vui lòng chờ trong giây lát');
    const photoUrl = await uploadPhoto(blob, currentEmployee.username, action);

    if (loadingCancelled) {
      // Ảnh đã upload nhưng user huỷ → orphan file, không nghiêm trọng
      hideLoading();
      return;
    }

    // ----- Bước 3: Gọi RPC lưu record -----
    setLoadingText('Đang lưu...', 'Sắp xong rồi');
    const rpcName = action === 'checkin' ? 'employee_checkin' : 'employee_checkout';

    const { data: result, error: rpcErr } = await supabaseClient.rpc(rpcName, {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
      p_photo_url: photoUrl,
    });
    if (rpcErr) throw rpcErr;

    const res = result && result[0];
    if (!res) throw new Error('Không nhận được phản hồi từ server.');

    // ----- Bước 4: Xử lý kết quả -----
    if (res.status === 'ok') {
      // Optimistic UI
      if (action === 'checkin') {
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

      hideLoading();
      updateRecordLine(currentTodayRecord);
      renderPhotos(currentTodayRecord);
      updateActionButton();

      const successMsg = action === 'checkin'
        ? `✅ Đã chấm công vào lúc ${formatTime(res.check_in_time)}`
        : `✅ Đã chấm công ra lúc ${formatTime(res.check_out_time)}`;
      showAlert($('empAlert'), successMsg, 'success');
      return;
    }

    if (res.status === 'auth_failed') {
      hideLoading();
      clearEmployeeSession();
      currentEmployee = null;
      showScreen('login');
      showAlert($('loginAlert'), 'Phiên đăng nhập hết hạn.', 'warning');
      return;
    }

    if (res.status === 'already_in' || res.status === 'already_out') {
      hideLoading();
      showAlert($('empAlert'), res.message, 'warning');
      await refreshTodayRecord();
      return;
    }

    if (res.status === 'not_found') {
      throw new Error(res.message || 'Không tìm thấy lượt chấm công vào.');
    }

    throw new Error(res.message || 'Không thể chấm công.');
  } catch (err) {
    console.error('Submit error:', err);
    hideLoading();
    showAlert($('empAlert'), 'Lỗi: ' + (err.message || err), 'error');
    // Cho user thử lại — không reset action button
    updateActionButton();
  }
}

/* ========== HANDLERS ========== */
function initEmployeeHandlers() {
  const photoInput = $('photoInput');
  const btnAction = $('btnAction');
  const btnCancel = $('btnCancelLoading');

  // Bấm nút → mở camera
  btnAction.addEventListener('click', () => {
    const action = btnAction.dataset.action;
    if (!action) return;

    pendingPhotoAction = action;
    hideAlert($('empAlert'));
    photoInput.value = '';
    photoInput.click();
  });

  // Chọn/chụp ảnh xong → GỬI LUÔN (không modal xác nhận)
  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const action = pendingPhotoAction;
    if (!action) return;

    // Reset input để có thể chụp lại nếu cần
    pendingPhotoAction = null;

    await processAndSubmit(file, action);
  });

  // Nút huỷ loading
  btnCancel.addEventListener('click', () => {
    loadingCancelled = true;
    btnCancel.disabled = true;
    btnCancel.textContent = 'Đang huỷ...';
    setLoadingText('Đang huỷ...', 'Vui lòng chờ');
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