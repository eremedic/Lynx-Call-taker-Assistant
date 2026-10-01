import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;

if (!process.env.ADMIN_PASSWORD) {
  console.warn('WARNING: ADMIN_PASSWORD is not set — the admin dashboard password is "admin". Set it before real use.');
}

createApp().listen(port, () => {
  console.log(`Lynx Call-Taker Assistant running at http://localhost:${port}`);
  console.log(`  Call-taker console: http://localhost:${port}/`);
  console.log(`  Admin dashboard:    http://localhost:${port}/admin.html`);
});
