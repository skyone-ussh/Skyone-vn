/* =========================================================
   EMPLOYEE — CHẤM CÔNG
   ========================================================= */

async function openEmployeeScreen(emp) {
  currentEmployee = emp;
  showScreen('employee');

  $('empHeaderName').textContent = emp.display_name || emp.username;
  hideAlert($('empAlert'));

  updateRecordLine(null);
  $('recordPhotos').innerHTML = '';

  resetTimesheetUserState();

  await refreshTodayRecord();
}

function updateRecordLine(record) {
  const dateEl = $('rlDate');
  const nameEl = $('rlName');
  const inEl   = $('rlIn');
  const outEl  = $('rlOut');

  dateEl.textContent = formatDateVN(todayISO());
  nameEl.textContent = currentEmployee?.display_name || currentEmployee?.username || '—';

  const isPendingIn  = !!record?._pendingIn;
  const isPendingOut = !!record?._pendingOut;

  if (record) {
    inEl.textContent = formatTime(record.check_in_time);
    inEl.classList.remove('missing');
    inEl.classList.toggle('pending', isPendingIn);
    if (record.check_out_time) {
      outEl.textContent = formatTime(record.check_out_time);
      outEl.classList.remove('missing');
      outEl.classList.toggle('pending', isPendingOut);
    } else {
      outEl.textContent = 'Chưa ra';
      outEl.classList.add('missing');
      outEl.classList.remove('pending');
    }
  } else {
    inEl.textContent = 'Chưa vào';
    inEl.classList.add('missing');
    inEl.classList.remove('pending');
    outEl.textContent = 'Chưa ra';
    outEl.classList.add('missing');
    outEl.classList.remove('pending');
  }
}

function renderPhotos(record) {
  const wrap = $('recordPhotos');
  const photos = [];
  if (record?.check_in_photo_url) {
    const cls = record._pendingIn ? ' class="pending"' : '';
    photos.push(`<figure class="record-photo"><img src="${escapeHtml(record.check_in_photo_url)}" alt="Vào"${cls} /><figcaption>Vào</figcaption></figure>`);
  }
  if (record?.check_out_photo_url) {
    const cls = record._pendingOut ? ' class="pending"' : '';
    photos.push(`<figure class="record-photo"><img src="${escapeHtml(record.check_out_photo_url)}" alt="Ra"${cls} /><figcaption>Ra</figcaption></figure>`);
  }
  wrap.innerHTML = photos.join('');
}

function updateActionButton() {
  const btn = $('btnAction');
  const rec = currentTodayRecord;
  const syncing = !!(rec?._pendingIn || rec?._pendingOut);
  btn.disabled = syncing;
  if (!rec) {
    btn.textContent = '📸 Chấm công vào';
    btn.dataset.action = 'checkin';
  } else if (!rec.check_out_time) {
    btn.textContent = syncing ? '⏳ Đang đồng bộ...' : '📸 Chấm công ra';
    btn.dataset.action = syncing ? '' : 'checkout';
  } else {
    btn.textContent = '✅ Đã hoàn thành hôm nay';
    btn.disabled = true;
    delete btn.dataset.action;
  }
}

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

let _successModalTimer = null;

function showSuccessModal(type, timeISO) {
  let modal = $('successModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'successModal';
    modal.className = 'success-modal';
    modal.innerHTML = `
      <div class="success-modal-box">
        <div class="success-icon">✓</div>
        <div class="success-title" id="successTitle"></div>
        <div class="success-time" id="successTime"></div>
        <div class="success-date" id="successDate"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  const label = type === 'checkin' ? 'VÀO' : 'RA';
  $('successTitle').textContent = `CHẤM CÔNG ${label} THÀNH CÔNG`;
  $('successTime').textContent = formatTime(timeISO);
  $('successDate').textContent = formatDateFullVN(timeISO);
  modal.classList.add('show');
  if (_successModalTimer) clearTimeout(_successModalTimer);
  _successModalTimer = setTimeout(() => { modal.classList.remove('show'); _successModalTimer = null; }, 3500);
}

let toastTimer = null;

function showToast(text, kind) {
  const el = $('floatingToast');
  const spinner = $('toastSpinner');
  const icon = $('toastIcon');
  const textEl = $('toastText');
  el.className = 'floating-toast show ' + (kind || 'syncing');
  textEl.textContent = text;
  if (kind === 'success') {
    icon.textContent = '✅'; icon.style.display = 'inline'; spinner.style.display = 'none';
  } else if (kind === 'error') {
    icon.textContent = '⚠️'; icon.style.display = 'inline'; spinner.style.display = 'none';
  } else {
    icon.style.display = 'none'; spinner.style.display = 'inline-block';
  }
  if (toastTimer) clearTimeout(toastTimer);
  if (kind === 'success' || kind === 'error') {
    toastTimer = setTimeout(() => hideToast(), kind === 'success' ? 2000 : 4000);
  }
}

function hideToast() {
  $('floatingToast').classList.remove('show');
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
}

async function processAndSubmit(file, action) {
  if (!currentEmployee || !currentEmployeePassword) return;

  const localUrl = URL.createObjectURL(file);
  const localTime = new Date().toISOString();
  const prevRecord = currentTodayRecord ? { ...currentTodayRecord } : null;

  if (action === 'checkin') {
    currentTodayRecord = {
      id: 'pending', check_in_time: localTime, check_out_time: null,
      check_in_photo_url: localUrl, check_out_photo_url: null,
      _pendingIn: true, _localUrl: localUrl,
    };
  } else {
    currentTodayRecord = { ...currentTodayRecord, check_out_time: localTime, check_out_photo_url: localUrl, _pendingOut: true };
  }

  updateRecordLine(currentTodayRecord);
  renderPhotos(currentTodayRecord);
  updateActionButton();
  showToast(action === 'checkin' ? 'Đang đồng bộ chấm công vào...' : 'Đang đồng bộ chấm công ra...', 'syncing');

  try {
    const blob = await compressImageWithWatermark(file, {
      maxDim: 600, quality: 0.65,
      name: currentEmployee.display_name || currentEmployee.username,
      type: action === 'checkin' ? 'Vào' : 'Ra',
      timeISO: localTime,
    });

    const photoUrl = await uploadPhoto(blob, currentEmployee.username, action);
    const rpcName = action === 'checkin' ? 'employee_checkin' : 'employee_checkout';
    const { data: result, error: rpcErr } = await supabaseClient.rpc(rpcName, {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
      p_photo_url: photoUrl,
    });
    if (rpcErr) throw rpcErr;

    const res = result && result[0];
    if (!res) throw new Error('Không nhận được phản hồi từ server.');

    if (res.status === 'ok') {
      if (action === 'checkin') {
        currentTodayRecord = {
          id: res.record_id, check_in_time: res.check_in_time, check_out_time: null,
          check_in_photo_url: photoUrl, check_out_photo_url: null,
        };
      } else {
        currentTodayRecord.check_out_time = res.check_out_time;
        currentTodayRecord.check_out_photo_url = photoUrl;
        delete currentTodayRecord._pendingOut;
      }
      delete currentTodayRecord._pendingIn;
      delete currentTodayRecord._localUrl;

      URL.revokeObjectURL(localUrl);
      updateRecordLine(currentTodayRecord);
      renderPhotos(currentTodayRecord);
      updateActionButton();
      hideToast();
      showSuccessModal(action, action === 'checkin' ? res.check_in_time : res.check_out_time);
      return;
    }

    if (res.status === 'auth_failed') {
      URL.revokeObjectURL(localUrl);
      clearEmployeeSession();
      currentEmployee = null;
      showScreen('login');
      showAlert($('loginAlert'), 'Phiên đăng nhập hết hạn.', 'warning');
      return;
    }

    if (res.status === 'already_in' || res.status === 'already_out') {
      URL.revokeObjectURL(localUrl);
      showToast(res.message, 'error');
      await refreshTodayRecord();
      return;
    }

    throw new Error(res.message || 'Không thể chấm công.');
  } catch (err) {
    console.error('Submit error:', err);
    URL.revokeObjectURL(localUrl);
    currentTodayRecord = prevRecord;
    updateRecordLine(currentTodayRecord);
    renderPhotos(currentTodayRecord);
    updateActionButton();
    showToast('Lỗi: ' + (err.message || 'không xác định'), 'error');
  }
}

function initEmployeeHandlers() {
  const photoInput = $('photoInput');
  const btnAction = $('btnAction');

  btnAction.addEventListener('click', () => {
    const action = btnAction.dataset.action;
    if (!action) return;
    pendingPhotoAction = action;
    hideAlert($('empAlert'));
    photoInput.value = '';
    photoInput.click();
  });

  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const action = pendingPhotoAction;
    if (!action) return;
    pendingPhotoAction = null;
    await processAndSubmit(file, action);
  });

  $('btnEmpLogout').addEventListener('click', () => {
    clearEmployeeSession();
    currentEmployee = null;
    currentTodayRecord = null;
    showScreen('login');
  });
}