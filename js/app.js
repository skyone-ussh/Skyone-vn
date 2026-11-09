/* =========================================================
   BOOTSTRAP
   ========================================================= */

async function bootstrap() {
  try {
    // 1) Admin — Supabase Auth session
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

    // 2) Employee — session storage (remember me)
    const emp = loadEmployeeSession();
    if (emp && emp.password) {
      currentEmployeePassword = emp.password;
      await openEmployeeScreen(emp);
      return;
    }

    // 3) Login
    showScreen('login');
  } catch (err) {
    console.error('Bootstrap error:', err);
    showScreen('login');
  }
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