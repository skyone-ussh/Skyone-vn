/* =========================================================
   BOOTSTRAP + SCREEN ROUTER
   ========================================================= */

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = $('screen-' + name);
  if (target) target.classList.add('active');
}

async function bootstrap() {
  // 1) Admin session
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    const { data: roleRow } = await supabaseClient
      .from('user_roles').select('role')
      .eq('user_id', session.user.id).maybeSingle();

    if (roleRow?.role === 'admin') {
      await loadSchoolLocation();
      await openAdminDashboard(session.user.email);
      return;
    }
  }

  // 2) Employee session
  const emp = loadEmployeeSession();
  if (emp && emp.password) {
    currentEmployeePassword = emp.password;
    await loadSchoolLocation();
    await openEmployeeDashboard(emp);
    return;
  }

  // 3) Login
  showScreen('login');
}

function initApp() {
  initLoginForm();
  initEmployeeHandlers();
  initAdminHandlers();

  supabaseClient.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT' && !currentEmployee) {
      showScreen('login');
    }
  });

  bootstrap();
}

initApp();