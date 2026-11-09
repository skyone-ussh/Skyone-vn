/* =========================================================
   BOOTSTRAP
   ========================================================= */

async function bootstrap() {
  // 1) Admin
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    const { data: roleRow } = await supabaseClient
      .from('user_roles').select('role')
      .eq('user_id', session.user.id).maybeSingle();

    if (roleRow?.role === 'admin') {
      await openAdminScreen(session.user.email);
      return;
    }
  }

  // 2) Employee
  const emp = loadEmployeeSession();
  if (emp && emp.password) {
    currentEmployeePassword = emp.password;
    await openEmployeeScreen(emp);
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