async function bootstrap() {
  try {
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
    const emp = loadEmployeeSession();
    if (emp && emp.password) {
      currentEmployeePassword = emp.password;
      await openEmployeeScreen(emp);
      return;
    }
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
  initTimesheetHandlers();

  supabaseClient.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT' && !currentEmployee) {
      showScreen('login');
    }
  });

  bootstrap();
}

initApp();