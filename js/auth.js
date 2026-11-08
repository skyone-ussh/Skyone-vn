/* =========================================================
   STORAGE + LOGIN
   ========================================================= */

/* ========== SESSION STORAGE ========== */
function saveEmployeeSession(emp, password) {
  const base = {
    id: emp.id,
    username: emp.username,
    display_name: emp.display_name,
    phone: emp.phone,
    login_at: Date.now(),
    expires_at: Date.now() + EMP_SESSION_TTL,
  };
  if (password) {
    localStorage.setItem(EMP_SESSION_KEY, JSON.stringify({ ...base, password }));
    sessionStorage.removeItem(EMP_SESSION_KEY);
  } else {
    sessionStorage.setItem(EMP_SESSION_KEY, JSON.stringify(base));
    localStorage.removeItem(EMP_SESSION_KEY);
  }
}

function loadEmployeeSession() {
  try {
    let s = localStorage.getItem(EMP_SESSION_KEY);
    if (s) {
      const data = JSON.parse(s);
      if (data.expires_at && data.expires_at < Date.now()) {
        localStorage.removeItem(EMP_SESSION_KEY);
        return null;
      }
      return data.password ? data : null;
    }
    s = sessionStorage.getItem(EMP_SESSION_KEY);
    if (s) {
      const data = JSON.parse(s);
      if (data.expires_at && data.expires_at < Date.now()) {
        sessionStorage.removeItem(EMP_SESSION_KEY);
        return null;
      }
      return data;
    }
    return null;
  } catch { return null; }
}

function clearEmployeeSession() {
  localStorage.removeItem(EMP_SESSION_KEY);
  sessionStorage.removeItem(EMP_SESSION_KEY);
  currentEmployeePassword = null;
}

/* ========== REMEMBER ME ========== */
function saveRememberedLogin(username, password) {
  try {
    localStorage.setItem(REMEMBER_KEY, btoa(unescape(encodeURIComponent(
      JSON.stringify({ u: username, p: password })
    ))));
  } catch {}
}
function loadRememberedLogin() {
  try {
    const s = localStorage.getItem(REMEMBER_KEY);
    if (!s) return null;
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch { return null; }
}
function clearRememberedLogin() { localStorage.removeItem(REMEMBER_KEY); }

/* ========== LOGIN FLOW ========== */
function initLoginForm() {
  const loginForm  = $('loginForm');
  const loginAlert = $('loginAlert');
  const btnLogin   = $('btnLogin');

  const remembered = loadRememberedLogin();
  if (remembered) {
    $('loginUsername').value = remembered.u || '';
    $('loginPassword').value = remembered.p || '';
    $('rememberMe').checked = true;
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(loginAlert);

    const rawUsername = $('loginUsername').value.trim();
    const password    = $('loginPassword').value;
    const remember    = $('rememberMe').checked;

    if (!rawUsername || !password) {
      showAlert(loginAlert, 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.', 'error');
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Đang đăng nhập...';

    try {
      // 1) Thử nhân viên trước
      const { data: empRows, error: empErr } = await supabaseClient.rpc('verify_employee', {
        p_username: rawUsername,
        p_password: password,
      });
      if (empErr) throw empErr;

      if (empRows && empRows.length > 0) {
        const emp = empRows[0];
        currentEmployeePassword = password;

        if (remember) {
          saveRememberedLogin(rawUsername, password);
          saveEmployeeSession(emp, password);
        } else {
          clearRememberedLogin();
          saveEmployeeSession(emp, null);
        }

        $('loginPassword').value = '';
        if (!remember) loginForm.reset();

        await openEmployeeDashboard(emp);
        return;
      }

      // 2) Thử admin
      const email = rawUsername.includes('@')
        ? rawUsername
        : `${rawUsername}@${ADMIN_EMAIL_DOMAIN}`;

      const { data: authData, error: authErr } = await supabaseClient.auth.signInWithPassword({
        email, password,
      });

      if (!authErr && authData?.user) {
        const { data: roleRow } = await supabaseClient
          .from('user_roles').select('role')
          .eq('user_id', authData.user.id).maybeSingle();

        if (roleRow?.role === 'admin') {
          if (remember) saveRememberedLogin(rawUsername, password);
          else clearRememberedLogin();

          $('loginPassword').value = '';
          if (!remember) loginForm.reset();

          await openAdminDashboard(authData.user.email);
          return;
        }
        await supabaseClient.auth.signOut();
      }

      throw new Error('Sai tên đăng nhập hoặc mật khẩu.');
    } catch (err) {
      console.error(err);
      showAlert(loginAlert, err.message || 'Đăng nhập thất bại.', 'error');
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Đăng nhập';
    }
  });
}