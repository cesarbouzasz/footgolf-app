async function verify() {
  try {
    const loginRes = await fetch('http://localhost:3000/login');
    const loginHtml = await loginRes.text();
    const hasEmailInput = loginHtml.includes('type="email"');
    const hasPasswordInput = loginHtml.includes('type="password"');
    const hasButton = loginHtml.includes('ENTRAR');
    
    console.log('✓ /login page:');
    console.log('  - Email input:', hasEmailInput ? '✓' : '✗');
    console.log('  - Password input:', hasPasswordInput ? '✓' : '✗');
    console.log('  - ENTRAR button:', hasButton ? '✓' : '✗');
    
    const dashboardRes = await fetch('http://localhost:3000/dashboard');
    const dashboardHtml = await dashboardRes.text();
    const hasDashTitle = dashboardHtml.includes('FOOTGOLF') || dashboardHtml.includes('dashboard');
    const hasLinks = dashboardHtml.includes('href=');
    
    console.log('\n✓ /dashboard page:');
    console.log('  - Title/content:', hasDashTitle ? '✓' : '✗');
    console.log('  - Has links:', hasLinks ? '✓' : '✗');
    console.log('  - Response status:', dashboardRes.status);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
verify();
