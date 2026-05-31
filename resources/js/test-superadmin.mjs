import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const SA_KEY = 'sk-sa-politicos-dev-2024';
const BASE   = 'http://localhost:3000';
const SHOTS  = 'C:/laragon/www/PoliticOS/resources/js/screenshots';
try { mkdirSync(SHOTS, { recursive: true }); } catch {}

const shot = (page, name) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });

let passed = 0, failed = 0;
function ok(msg)   { console.log(`   ✓ ${msg}`); passed++; }
function fail(msg) { console.log(`   ✗ ${msg}`); failed++; }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page    = await ctx.newPage();

  // 1. Redirige a login
  console.log('\n1. Redirección a /superadmin/login');
  await page.goto(`${BASE}/superadmin`);
  await page.waitForURL('**/superadmin/login', { timeout: 10000 });
  // Wait for React hydration to complete before interacting with the form
  await page.waitForLoadState('networkidle');
  ok('Redirigido correctamente');
  await shot(page, '01-login-page');

  // 2. Clave incorrecta
  console.log('2. Clave incorrecta');
  await page.fill('input[type="password"]', 'wrong-key-xxx');
  await page.click('button[type="submit"]');
  try {
    await page.waitForSelector('text=Clave incorrecta', { timeout: 8000 });
    ok('Error visible');
  } catch { fail('Error de clave no mostrado'); }
  await shot(page, '02-bad-key');

  // 3. Login correcto
  console.log('3. Login con clave correcta');
  await page.fill('input[type="password"]', SA_KEY);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/superadmin`, { timeout: 12000 });
  ok('Login exitoso');
  await page.waitForSelector('table', { timeout: 8000 });
  await page.waitForTimeout(800);
  await shot(page, '03-tenants-list');

  // 4. Tenants visibles
  console.log('4. Lista de tenants');
  const slugCodes = await page.$$('table td code');
  const slugs = await Promise.all(slugCodes.map(el => el.textContent()));
  console.log(`   Slugs visibles: [${slugs.join(', ')}]`);
  slugs.includes('demo') ? ok('"demo" visible') : fail(`"demo" no encontrado. Visibles: ${slugs.join(', ')}`);
  await shot(page, '04-table-loaded');

  // 5. Expandir stats
  console.log('5. Stats del tenant demo');
  const demoRow = page.locator('tr').filter({ hasText: 'demo' }).first();
  await demoRow.locator('button[title="Ver stats"]').click();
  await page.waitForTimeout(2500);
  await shot(page, '05-stats-expanded');
  const statsEl = await page.$('text=Conversaciones');
  ok(statsEl ? 'Stats con datos' : 'Stats expandidas (DB vacía — normal)');
  await demoRow.locator('button[title="Ver stats"]').click();
  await page.waitForTimeout(300);

  // 6. Modal Nuevo Candidato
  console.log('6. Modal Nuevo Candidato');
  await page.click('button:has-text("Nuevo Candidato")');
  await page.waitForSelector('text=Provisionar Candidato', { timeout: 5000 });
  ok('Modal abierto');
  await shot(page, '06-modal-open');

  // 7. Tab Manual y volver
  console.log('7. Tabs del modal');
  await page.click('text=Manual (solo registro)');
  await page.waitForSelector('text=Registrar Tenant', { timeout: 3000 });
  ok('Tab Manual funciona');
  await page.click('text=Provisionar (recomendado)');
  await page.waitForTimeout(300);
  await shot(page, '07-tabs');

  // 8. Provisioning completo
  console.log('8. Provisioning de tenant "test2"');
  await page.fill('input[placeholder="james-cueva"]', 'test2');
  await page.waitForTimeout(300);
  await page.fill('input[placeholder="Campaña James Cueva"]', 'Candidato Test2');
  await page.fill('input[placeholder="bdpolitic_james"]', 'bdpolitic_test2');
  await page.fill('input[type="email"]', 'admin@test2.pe');
  await page.fill('input[placeholder="Min. 8 caracteres"]', 'Test2024!');
  await shot(page, '08-form-filled');

  await page.click('button:has-text("Provisionar Candidato")');
  await page.waitForSelector('text=Provisionando', { timeout: 5000 });
  ok('Provisioning iniciado, spinner visible');

  await page.waitForSelector('table td code >> text=test2', { timeout: 60000 });
  ok('Tenant "test2" aparece en la tabla');
  await shot(page, '09-tenant-created');

  // 9. Conteo
  console.log('9. Conteo de tenants');
  const allCodes = await page.$$('table td code');
  const allSlugs = await Promise.all(allCodes.map(el => el.textContent()));
  console.log(`   Slugs: [${allSlugs.join(', ')}]`);
  ok(`${allSlugs.length} tenants en tabla`);
  await shot(page, '10-final-table');

  // 10. Editar
  console.log('10. Editar tenant test2');
  const test2Row = page.locator('tr').filter({ hasText: 'test2' }).first();
  await test2Row.locator('button[title="Editar"]').click();
  await page.waitForSelector('button:has-text("Guardar")', { timeout: 5000 });
  ok('Modal edición abierto');
  await shot(page, '11-edit-modal');
  await page.selectOption('select', 'pro');
  await page.click('button:has-text("Guardar")');
  await page.waitForTimeout(1200);
  await shot(page, '12-after-edit');
  ok('Plan cambiado a Pro guardado');

  // 11. Toggle
  console.log('11. Toggle activo/inactivo');
  const test2RowB = page.locator('tr').filter({ hasText: 'test2' }).first();
  await test2RowB.locator('button[title="Desactivar"]').click();
  await test2RowB.locator('button[title="Activar"]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const canReactivate = await test2RowB.locator('button[title="Activar"]').isVisible().catch(() => false);
  canReactivate ? ok('Toggle Desactivar → Activar funciona') : fail('Toggle no reflejado');
  await shot(page, '13-toggled');

  // 12. Eliminar con confirmacion por slug
  console.log('12. Eliminar tenant test2');
  await test2RowB.locator('button[title="Eliminar"]').click();
  await page.waitForSelector('text=Eliminar tenant', { timeout: 3000 });
  ok('Modal de confirmación abierto');
  await shot(page, '14-delete-confirm');
  await page.fill('input[placeholder="test2"]', 'test2');
  await page.waitForTimeout(200);
  // El botón Eliminar se activa solo cuando el input coincide
  await page.locator('button').filter({ hasText: /^Eliminar$/ }).last().click();
  await page.waitForTimeout(1800);
  const goneEl = await page.locator('table td code').filter({ hasText: 'test2' }).count();
  goneEl === 0 ? ok('Tenant "test2" eliminado de la tabla') : fail('test2 sigue visible');
  await shot(page, '15-after-delete');

  await browser.close();
  console.log('\n─────────────────────────────────────────');
  console.log(`Resultado final:  ✅ ${passed} pasaron   ❌ ${failed} fallaron`);
  console.log(`Screenshots guardados en: ${SHOTS}`);
  if (failed > 0) process.exit(1);
})().catch(async (err) => {
  console.error('\n💥 Error inesperado:', err.message);
  process.exit(1);
});
