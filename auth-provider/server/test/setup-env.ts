process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/auth_provider_test';
process.env.SSO_COOKIE_SECRET =
  'e2e-only-cookie-signing-secret-with-32-characters';
process.env.AUTH_LOGIN_URL = 'http://localhost:3000/login';
process.env.CONTROL_PANEL_ADMIN_LOGIN_URL = 'http://localhost:3000/admin/login';
process.env.CONTROL_PANEL_ADMIN_DASHBOARD_URL = 'http://localhost:3000/admin';
process.env.SSO_COOKIE_NAME = 'sso_session';
process.env.SSO_COOKIE_SECURE = 'false';
process.env.SSO_SESSION_TTL_SECONDS = '3600';
process.env.AUTHORIZATION_CODE_TTL_SECONDS = '300';
process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
