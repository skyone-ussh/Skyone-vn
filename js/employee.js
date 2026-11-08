/* =========================================================
   EMPLOYEE FLOW
   ========================================================= */

async function openEmployeeDashboard(emp) {
  currentEmployee = emp;
  showScreen('employee');

  $('empHeaderName').textContent   = emp.display_name || emp.username;
  $('empGreetingName').textContent = emp.display_name || emp.username;
  $('infoName').textContent        = emp.display_name || emp.username;
  $('infoUsername').textContent    = emp.username;
  $('infoDate').textContent        = todayVN();
  $('infoCheckin').textContent     = '—';
  $('infoCheckout').textContent    = '—';
  $('infoDistance').textContent    = '—';
  $('infoDurationItem').style.display = 'none';
  $('btnEmpCheckout').style.display = 'none';
  $('btnEmpCheckout').disabled      = false;
  $('btnEmpCheckout').textContent   = 'Check-out';
  $('lastUpdate').textContent       = '';

  setEmployeeStatus('loading', '⏳', 'Đang kiểm tra vị trí...', 'Vui lòng chờ trong giây lát');
  await loadSchoolLocation();
  await runAutoCheckin();
  startAutoRefresh();
}

function setEmployeeStatus(kind, icon, title, desc) {
  const iconEl = $('statusIcon');
  iconEl.className = 'status-icon ' + kind;
  iconEl.textContent = icon;
  $('statusTitle').textContent = title;
  $('statusDesc').textContent = desc;
}

async function loadSchoolLocation() {
  try {
    const { data, error } = await supabaseClient
      .from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    if (data && data.university_lat != null && data.university_lng != null) {
      attendanceLocation = {
        lat: data.university_lat,
        lng: data.university_lng,
        radiusMeters: data.radius_meters || 200,
      };
    } else {
      attendanceLocation = { lat: null, lng: null, radiusMeters: 200 };
    }
  } catch (err) {
    console.warn('Không load được settings:', err);
  }
}

async function runAutoCheckin() {
  if (employeeGeoState.busy) return;
  if (!currentEmployee || !currentEmployeePassword) return;
  employeeGeoState.busy = true;

  try {
    // 1) Re-verify session
    const { data: verifyData, error: verifyErr } = await supabaseClient.rpc('verify_employee', {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
    });
    if (verifyErr) throw verifyErr;
    if (!verifyData || verifyData.length === 0) {
      clearEmployeeSession();
      currentEmployee = null;
      showScreen('login');
      showAlert($('loginAlert'), 'Tài khoản đã bị khoá hoặc mật khẩu đã thay đổi. Vui lòng đăng nhập lại.', 'warning');
      return;
    }

    // 2) Lấy vị trí
    setEmployeeStatus('loading', '⏳', 'Đang kiểm tra vị trí...', 'Xác định vị trí GPS của bạn');
    const pos = await getPosition();
    employeeGeoState.pos = pos;

    if (attendanceLocation.lat == null) await loadSchoolLocation();
    if (attendanceLocation.lat == null) {
      setEmployeeStatus('error', '⚠️', 'Chưa cấu hình vị trí chấm công',
        'Admin chưa đặt vị trí trường. Vui lòng liên hệ quản lý.');
      return;
    }

    const dist = haversine(pos.lat, pos.lng, attendanceLocation.lat, attendanceLocation.lng);
    employeeGeoState.distance = dist;
    $('infoDistance').textContent = `${Math.round(dist)} m / ${attendanceLocation.radiusMeters} m`;
    $('lastUpdate').textContent = 'Cập nhật lúc ' + nowVNTime();

    const inRange = dist <= attendanceLocation.radiusMeters;

    // 3) Lấy bản ghi hôm nay qua RPC
    const { data: todayRows, error: qErr } = await supabaseClient.rpc('get_today_attendance', {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
    });
    if (qErr) throw qErr;

    const record = todayRows && todayRows[0];

    if (record) {
      currentCheckinTime = record.check_in_time;
      $('infoCheckin').textContent  = fmtTime(record.check_in_time);
      $('infoCheckout').textContent = record.check_out_time ? fmtTime(record.check_out_time) : '—';

      if (record.check_out_time) {
        const duration = new Date(record.check_out_time) - new Date(record.check_in_time);
        $('infoDurationItem').style.display = 'block';
        $('infoDuration').textContent = formatDuration(duration);
        $('btnEmpCheckout').style.display = 'none';

        setEmployeeStatus('success', '✅', 'Đã hoàn thành ca làm việc',
          `Vào ${fmtTime(record.check_in_time)} · Ra ${fmtTime(record.check_out_time)} · Tổng ${formatDuration(duration)}`);
        return;
      }

      $('btnEmpCheckout').style.display = 'inline-flex';
      $('btnEmpCheckout').disabled = false;

      if (inRange) {
        setEmployeeStatus('success', '✅',
          `Đã chấm công vào lúc ${fmtTime(record.check_in_time)}`,
          `Bạn đang trong phạm vi (cách ${Math.round(dist)}m). Bấm Check-out khi kết thúc ca làm việc.`);
      } else {
        setEmployeeStatus('warning', '📍',
          `Đã chấm công vào lúc ${fmtTime(record.check_in_time)}`,
          `Bạn đang ở ngoài phạm vi (cách ${Math.round(dist)}m, bán kính ${attendanceLocation.radiusMeters}m). Di chuyển vào trong phạm vi rồi bấm Check-out.`);
      }
      return;
    }

    // Chưa check-in
    if (!inRange) {
      setEmployeeStatus('warning', '📍', 'Bạn đang ở ngoài phạm vi chấm công',
        `Khoảng cách: ${Math.round(dist)}m · Bán kính: ${attendanceLocation.radiusMeters}m. Di chuyển vào phạm vi để tự động chấm công.`);
      $('btnEmpCheckout').style.display = 'none';
      return;
    }

    // Tự động check-in
    setEmployeeStatus('loading', '⏳', 'Đang chấm công...', 'Xác nhận vị trí và ghi nhận giờ vào');

    const { data: insResult, error: insErr } = await supabaseClient.rpc('employee_checkin', {
      p_username: currentEmployee.username,
      p_password: currentEmployeePassword,
      p_lat: pos.lat,
      p_lng: pos.lng,
      p_distance: dist,
    });
    if (insErr) throw insErr;

    const result = insResult && insResult[0];
    if (!result) throw new Error('Không nhận được phản hồi từ server.');

    if (result.status === 'ok') {
      currentCheckinTime = result.check_in_time;
      $('infoCheckin').textContent  = fmtTime(result.check_in_time);
      $('infoCheckout').textContent = '—';
      $('btnEmpCheckout').style.display = 'inline-flex';
      $('btnEmpCheckout').disabled = false;

      setEmployeeStatus('success', '✅', 'Chấm công thành công',
        `Đã tự động check-in lúc ${fmtTime(result.check_in_time)} · Cách vị trí ${Math.round(dist)}m`);
    } else if (result.status === 'already_in') {
      currentCheckinTime = result.check_in_time;
      $('infoCheckin').textContent = fmtTime(result.check_in_time);
      $('btnEmpCheckout').style.display = 'inline-flex';
      $('btnEmpCheckout').disabled = false;
      setEmployeeStatus('success', '✅',
        `Đã chấm công vào lúc ${fmtTime(result.check_in_time)}`,
        'Bấm Check-out khi kết thúc ca làm việc.');
    } else if (result.status === 'auth_failed') {
      clearEmployeeSession();
      currentEmployee = null;
      showScreen('login');
      showAlert($('loginAlert'), 'Phiên đăng nhập hết hạn.', 'warning');
    } else {
      throw new Error(result.message || 'Không thể check-in.');
    }
  } catch (err) {
    console.error('Auto check-in error:', err);
    setEmployeeStatus('error', '❌', 'Không thể chấm công', err.message || 'Đã có lỗi xảy ra.');
  } finally {
    employeeGeoState.busy = false;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => {
    if ($('screen-employee').classList.contains('active')
        && currentEmployee
        && !employeeGeoState.busy) {
      runAutoCheckin();
    }
  }, 30000);
}
function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

/* ========== HANDLERS ========== */
function initEmployeeHandlers() {
  $('btnRefreshLoc').addEventListener('click', () => runAutoCheckin());

  $('btnEmpCheckout').addEventListener('click', async () => {
    if (!currentEmployee || !currentEmployeePassword) return;
    if (employeeGeoState.busy) return;
    employeeGeoState.busy = true;

    const btn = $('btnEmpCheckout');
    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';

    try {
      if (attendanceLocation.lat == null) await loadSchoolLocation();
      if (attendanceLocation.lat == null) {
        throw new Error('Chưa có cấu hình vị trí trường. Vui lòng liên hệ quản lý.');
      }

      setEmployeeStatus('loading', '⏳', 'Đang check-out...', 'Đang xác định vị trí của bạn');

      const pos = await getPosition();
      const dist = haversine(pos.lat, pos.lng, attendanceLocation.lat, attendanceLocation.lng);
      $('infoDistance').textContent = `${Math.round(dist)} m / ${attendanceLocation.radiusMeters} m`;

      if (dist > attendanceLocation.radiusMeters) {
        setEmployeeStatus('warning', '📍', 'Bạn đang ngoài phạm vi',
          `Hiện cách ${Math.round(dist)}m, cần ở trong bán kính ${attendanceLocation.radiusMeters}m. Di chuyển lại gần và bấm Check-out lại.`);
        btn.disabled = false;
        btn.textContent = 'Check-out';
        return;
      }

      const { data: outResult, error: outErr } = await supabaseClient.rpc('employee_checkout', {
        p_username: currentEmployee.username,
        p_password: currentEmployeePassword,
        p_lat: pos.lat,
        p_lng: pos.lng,
        p_distance: dist,
      });
      if (outErr) throw outErr;

      const result = outResult && outResult[0];
      if (!result) throw new Error('Không nhận được phản hồi từ server.');

      if (result.status === 'ok') {
        $('infoCheckout').textContent = fmtTime(result.check_out_time);
        btn.style.display = 'none';

        if (currentCheckinTime) {
          const duration = new Date(result.check_out_time) - new Date(currentCheckinTime);
          if (duration > 0) {
            $('infoDurationItem').style.display = 'block';
            $('infoDuration').textContent = formatDuration(duration);
          }
        }

        setEmployeeStatus('success', '✅', 'Check-out thành công',
          `Đã kết thúc ca làm việc lúc ${fmtTime(result.check_out_time)}. Hẹn gặp lại!`);
      } else if (result.status === 'already_out') {
        $('infoCheckout').textContent = fmtTime(result.check_out_time);
        btn.style.display = 'none';
        setEmployeeStatus('success', '✅', 'Đã check-out trước đó',
          `Ca làm việc kết thúc lúc ${fmtTime(result.check_out_time)}.`);
      } else if (result.status === 'not_found') {
        throw new Error('Không tìm thấy lượt check-in hôm nay. Bấm "Kiểm tra lại vị trí" để đồng bộ.');
      } else if (result.status === 'auth_failed') {
        clearEmployeeSession();
        currentEmployee = null;
        showScreen('login');
        showAlert($('loginAlert'), 'Phiên đăng nhập hết hạn.', 'warning');
      } else {
        throw new Error(result.message || 'Không thể check-out.');
      }
    } catch (err) {
      console.error('Check-out error:', err);
      let msg = err.message || 'Đã có lỗi xảy ra.';
      if (/denied/i.test(msg)) {
        msg = 'Bạn đã từ chối quyền định vị. Vào Cài đặt trình duyệt → bật lại quyền Location.';
      }
      setEmployeeStatus('error', '❌', 'Không thể check-out', msg);
      btn.disabled = false;
    } finally {
      btn.textContent = 'Check-out';
      employeeGeoState.busy = false;
    }
  });

  $('btnEmpLogout').addEventListener('click', () => {
    stopAutoRefresh();
    clearEmployeeSession();
    currentEmployee = null;
    currentCheckinTime = null;
    employeeGeoState = { busy: false, pos: null, distance: null };
    showScreen('login');
  });
}