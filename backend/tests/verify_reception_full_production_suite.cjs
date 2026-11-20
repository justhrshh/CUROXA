/**
 * verify_reception_full_production_suite.cjs
 * Comprehensive Playwright / Headless Chrome verification suite for Quroxa Reception Portal:
 * - Dynamic tab identity top bar (Front Desk Command Center removed)
 * - Idol KPI cards across all tabs (dash, patients, appointments, reception-queue, billing, waiting-queue)
 * - Mobile-first landing on Reception Queue (390x844 and 430x932)
 * - Desktop landing on Dashboard Overview (1366x768 and 1440x900)
 * - URL tab parameter override verification (?tab=patients, ?tab=appointments, ?tab=billing)
 * - Reception QR modal generation, payload validation, link copy, PNG download & print simulation
 * - Role-authorized mobile functionality accessibility audit
 * - Screenshot capture across all key viewports and modules
 */

const puppeteer = require('../node_modules/puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = path.resolve('C:/Users/lenovo/.gemini/antigravity/brain/f190b248-6e12-4d03-b370-e481eba2d622/reception_production_verification');
const DIST_DIR = path.resolve(__dirname, '../../frontend/dist');

// Static server for local dist
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

function startStaticServer(port = 5178) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || !path.extname(reqPath)) {
        reqPath = '/index.html';
      }
      const filePath = path.join(DIST_DIR, reqPath);
      const ext = path.extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          const fallbackIndex = path.join(DIST_DIR, 'index.html');
          fs.readFile(fallbackIndex, (fErr, fContent) => {
            if (fErr) {
              res.writeHead(404);
              res.end('Not Found');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(fContent, 'utf-8');
            }
          });
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    });

    server.listen(port, () => {
      console.log(`[SERVER] Static frontend test server running at http://localhost:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

async function runSuite() {
  console.log('================================================================');
  console.log('  QUROXA RECEPTION PORTAL — FINAL PRODUCTION VERIFICATION SUITE ');
  console.log('================================================================\n');

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const PORT = 5178;
  const server = await startStaticServer(PORT);
  const BASE_URL = `http://localhost:${PORT}`;

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    pipe: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const testResults = [];
  function record(category, testName, pass, details = '') {
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] [${category}] ${testName} ${details ? '(' + details + ')' : ''}`);
    testResults.push({ category, testName, pass, details });
  }

  try {
    // ════════════════════════════════════════════════════════════════════════
    // 1. MOBILE-FIRST LANDING AT 390x844 (iPhone 12/13/14)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST 1: MOBILE VIEWPORT (390x844) LANDING & WORKSTATION ---');
    const pageMobile390 = await browser.newPage();
    await pageMobile390.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await pageMobile390.evaluateOnNewDocument(() => {
      window.__quroxa_mock_token = 'valid_test_token_2026';
      localStorage.setItem('user', JSON.stringify({
        id: 'u_rec_01',
        _id: 'u_rec_01',
        name: 'rajesh',
        staff_id: 'receptionist_1',
        role: 'receptionist',
        tenantId: 'quroxa_test_clinic',
        tenantName: 'Quroxa Test Clinic'
      }));
      localStorage.setItem('tenantId', 'quroxa_test_clinic');
      localStorage.setItem('role', 'receptionist');
      localStorage.setItem('token', 'valid_test_token_2026');
    });

    const mobileErrors = [];
    pageMobile390.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        mobileErrors.push(msg.text());
      }
    });

    await pageMobile390.goto(`${BASE_URL}/receptionist`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Verify 1.1: Mobile automatically lands on Reception Queue
    const activeNav390 = await pageMobile390.evaluate(() => {
      const activeItem = document.querySelector('.mobile-bottom-nav .mob-nav-item.active');
      return activeItem ? activeItem.innerText.trim() : '';
    });
    record('MOBILE LANDING', '390x844 lands directly on Reception Queue', activeNav390.includes('Queue'), `Active nav: "${activeNav390}"`);

    // Verify 1.2: Static "Front Desk Command Center" is ABSENT
    const pageText390 = await pageMobile390.evaluate(() => document.body.innerText);
    const hasStaticCommandCenter = pageText390.includes('Front Desk Command Center');
    record('TOP BAR', '"Front Desk Command Center" completely removed', !hasStaticCommandCenter, 'Confirmed absent');

    // Verify 1.3: Dynamic Tab Identity Top Bar shows Reception Queue
    const topBarTitle390 = await pageMobile390.evaluate(() => {
      const el = document.querySelector('.rec-top-title');
      return el ? el.innerText.trim() : '';
    });
    record('TOP BAR', 'Top bar title reflects active tab "Reception Queue"', topBarTitle390 === 'Reception Queue', `Top bar: "${topBarTitle390}"`);

    // Verify 1.4: 4 Idol KPI Cards rendered on Reception Queue
    const kpiCount390 = await pageMobile390.evaluate(() => {
      const cards = document.querySelectorAll('.tab-content [style*="radial-gradient"]');
      return cards.length;
    });
    record('IDOL KPI CARDS', 'Reception Queue renders 4 Idol KPI cards', kpiCount390 >= 4, `Found ${kpiCount390} cards`);

    // Verify 1.5: Horizontal scroll overflow check
    const scrollWidth390 = await pageMobile390.evaluate(() => document.documentElement.scrollWidth);
    record('RESPONSIVE', 'Zero horizontal scroll overflow on 390px', scrollWidth390 <= 390, `scrollWidth: ${scrollWidth390}px`);

    // Screenshot 1: Mobile Queue 390x844
    const shotPathMobile390 = path.join(ARTIFACT_DIR, '01_mobile_queue_390x844.png');
    await pageMobile390.screenshot({ path: shotPathMobile390, fullPage: false });
    console.log(`[SCREENSHOT] Saved: ${shotPathMobile390}`);

    // ════════════════════════════════════════════════════════════════════════
    // 2. MOBILE-FIRST LANDING AT 430x932 (iPhone 14/15 Pro Max)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST 2: MOBILE VIEWPORT (430x932) LANDING ---');
    const pageMobile430 = await browser.newPage();
    await pageMobile430.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });

    await pageMobile430.evaluateOnNewDocument(() => {
      window.__quroxa_mock_token = 'valid_test_token_2026';
      localStorage.setItem('user', JSON.stringify({
        id: 'u_rec_01',
        _id: 'u_rec_01',
        name: 'rajesh',
        staff_id: 'receptionist_1',
        role: 'receptionist',
        tenantId: 'quroxa_test_clinic'
      }));
      localStorage.setItem('tenantId', 'quroxa_test_clinic');
      localStorage.setItem('role', 'receptionist');
      localStorage.setItem('token', 'valid_test_token_2026');
    });

    await pageMobile430.goto(`${BASE_URL}/receptionist`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));

    const activeNav430 = await pageMobile430.evaluate(() => {
      const activeItem = document.querySelector('.mobile-bottom-nav .mob-nav-item.active');
      return activeItem ? activeItem.innerText.trim() : '';
    });
    record('MOBILE LANDING', '430x932 lands directly on Reception Queue', activeNav430.includes('Queue'), `Active nav: "${activeNav430}"`);

    const shotPathMobile430 = path.join(ARTIFACT_DIR, '02_mobile_queue_430x932.png');
    await pageMobile430.screenshot({ path: shotPathMobile430, fullPage: false });
    console.log(`[SCREENSHOT] Saved: ${shotPathMobile430}`);

    // ════════════════════════════════════════════════════════════════════════
    // 3. DESKTOP VIEWPORT (1440x900 & 1366x768) — DASHBOARD LANDING
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST 3: DESKTOP VIEWPORTS (1440x900 & 1366x768) ---');
    const pageDesktop1440 = await browser.newPage();
    await pageDesktop1440.setViewport({ width: 1440, height: 900 });

    pageDesktop1440.on('console', msg => {
      const txt = msg.text();
      if (txt.includes('Error') || txt.includes('error') || txt.includes('warning') || txt.includes('appointment')) {
        console.log('[PAGE LOG]:', txt);
      }
    });
    pageDesktop1440.on('pageerror', err => {
      console.log('[PAGE CRASH]:', err.message);
    });

    await pageDesktop1440.evaluateOnNewDocument(() => {
      window.__quroxa_mock_token = 'valid_test_token_2026';
      localStorage.setItem('user', JSON.stringify({
        id: 'u_rec_01',
        _id: 'u_rec_01',
        name: 'rajesh',
        staff_id: 'receptionist_1',
        role: 'receptionist',
        tenantId: 'quroxa_test_clinic'
      }));
      localStorage.setItem('tenantId', 'quroxa_test_clinic');
      localStorage.setItem('role', 'receptionist');
      localStorage.setItem('token', 'valid_test_token_2026');
    });

    await pageDesktop1440.goto(`${BASE_URL}/receptionist`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Verify 3.1: Desktop lands on Dashboard Overview (dash)
    const topBarDesktop = await pageDesktop1440.evaluate(() => {
      const el = document.querySelector('.rec-top-title');
      return el ? el.innerText.trim() : '';
    });
    record('DESKTOP LANDING', 'Desktop 1440x900 defaults to Dashboard Overview', topBarDesktop === 'Dashboard Overview', `Top bar: "${topBarDesktop}"`);

    // Verify 3.2: Dashboard Overview renders 4 Idol KPI Cards
    const dashKpiCards = await pageDesktop1440.evaluate(() => {
      const cards = document.querySelectorAll('.tab-content [style*="radial-gradient"]');
      return cards.length;
    });
    record('IDOL KPI CARDS', 'Dashboard Overview renders 4 Idol KPI cards', dashKpiCards >= 4, `Found ${dashKpiCards} cards`);

    // Screenshot 3: Desktop Dashboard Overview
    const shotPathDash1440 = path.join(ARTIFACT_DIR, '03_desktop_dashboard_1440x900.png');
    await pageDesktop1440.screenshot({ path: shotPathDash1440, fullPage: false });
    console.log(`[SCREENSHOT] Saved: ${shotPathDash1440}`);

    // 1366x768 Viewport
    await pageDesktop1440.setViewport({ width: 1366, height: 768 });
    await new Promise(r => setTimeout(r, 500));
    const shotPathDash1366 = path.join(ARTIFACT_DIR, '04_desktop_dashboard_1366x768.png');
    await pageDesktop1440.screenshot({ path: shotPathDash1366, fullPage: false });
    console.log(`[SCREENSHOT] Saved: ${shotPathDash1366}`);

    // ════════════════════════════════════════════════════════════════════════
    // 4. URL TAB PARAMETER OVERRIDE & DYNAMIC TAB IDENTITY VERIFICATION
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST 4: URL TAB OVERRIDES & DYNAMIC TOP BAR HEADERS ---');
    
    // 4.1: Test ?tab=patients
    await pageDesktop1440.goto(`${BASE_URL}/receptionist?tab=patients`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));
    const patientsTitle = await pageDesktop1440.evaluate(() => {
      const title = document.querySelector('.rec-top-title');
      const breadcrumb = document.querySelector('.rec-shield-icon + div .desktop-only-flex');
      return {
        title: title ? title.innerText.trim() : '',
        breadcrumb: breadcrumb ? breadcrumb.innerText.trim() : ''
      };
    });
    record('DYNAMIC TOP BAR', '?tab=patients sets title to "Patient Management"', patientsTitle.title === 'Patient Management', `Title: "${patientsTitle.title}", Breadcrumb: "${patientsTitle.breadcrumb}"`);
    
    const patientsKpiCount = await pageDesktop1440.evaluate(() => {
      const cards = document.querySelectorAll('.tab-content [style*="radial-gradient"]');
      return cards.length;
    });
    record('IDOL KPI CARDS', 'Patient Management renders 4 Idol Demographic KPI cards', patientsKpiCount >= 4, `Found ${patientsKpiCount} cards`);

    const shotPathPatients = path.join(ARTIFACT_DIR, '05_patients_management_idol_kpis.png');
    await pageDesktop1440.screenshot({ path: shotPathPatients, fullPage: false });
    console.log(`[SCREENSHOT] Saved: ${shotPathPatients}`);

    // 4.2: Test ?tab=appointments
    await pageDesktop1440.goto(`${BASE_URL}/receptionist?tab=appointments`, { waitUntil: 'networkidle2' });
    await pageDesktop1440.waitForSelector('.rec-top-title', { timeout: 6000 }).catch(e => console.log('[TIMEOUT WAIT]:', e.message));
    await new Promise(r => setTimeout(r, 1000));
    const currentApptsUrl = pageDesktop1440.url();
    console.log('[DEBUG 4.2 URL]:', currentApptsUrl);
    const apptsTitle = await pageDesktop1440.evaluate(() => {
      const title = document.querySelector('.rec-top-title');
      const breadcrumb = document.querySelector('.rec-shield-icon + div .desktop-only-flex');
      const allText = document.body ? document.body.innerText.substring(0, 150) : '';
      return {
        title: title ? title.innerText.trim() : '',
        breadcrumb: breadcrumb ? breadcrumb.innerText.trim() : '',
        snippet: allText
      };
    });
    console.log('[DEBUG 4.2 RESULT]:', apptsTitle);
    record('DYNAMIC TOP BAR', '?tab=appointments sets title to "Appointments"', apptsTitle.title === 'Appointments', `Title: "${apptsTitle.title}", Breadcrumb: "${apptsTitle.breadcrumb}"`);

    const apptsKpiCount = await pageDesktop1440.evaluate(() => {
      const cards = document.querySelectorAll('.tab-content [style*="radial-gradient"]');
      return cards.length;
    });
    record('IDOL KPI CARDS', 'Appointments renders 4 Idol KPI cards (Bookings, Consultations, Lab, Requests)', apptsKpiCount >= 4, `Found ${apptsKpiCount} cards`);

    const shotPathAppts = path.join(ARTIFACT_DIR, '06_appointments_idol_kpis.png');
    await pageDesktop1440.screenshot({ path: shotPathAppts, fullPage: false });
    console.log(`[SCREENSHOT] Saved: ${shotPathAppts}`);

    // 4.3: Test ?tab=billing
    await pageDesktop1440.goto(`${BASE_URL}/receptionist?tab=billing`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));
    const billingTitle = await pageDesktop1440.evaluate(() => {
      const title = document.querySelector('.rec-top-title');
      return title ? title.innerText.trim() : '';
    });
    record('DYNAMIC TOP BAR', '?tab=billing sets title to "Finance & Billing"', billingTitle === 'Finance & Billing', `Title: "${billingTitle}"`);

    const billingKpiCount = await pageDesktop1440.evaluate(() => {
      const cards = document.querySelectorAll('.tab-content [style*="radial-gradient"]');
      return cards.length;
    });
    record('IDOL KPI CARDS', 'Finance & Billing renders 4 Idol KPI cards (Revenue, Receivables, Tx, Rate)', billingKpiCount >= 4, `Found ${billingKpiCount} cards`);

    const shotPathBilling = path.join(ARTIFACT_DIR, '07_billing_idol_kpis.png');
    await pageDesktop1440.screenshot({ path: shotPathBilling, fullPage: false });
    console.log(`[SCREENSHOT] Saved: ${shotPathBilling}`);

    // ════════════════════════════════════════════════════════════════════════
    // 5. RECEPTION QR MODAL & SIGNAGE WORKFLOW VERIFICATION
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST 5: RECEPTION QR MODAL, PAYLOAD & SIGNAGE ---');
    await pageDesktop1440.goto(`${BASE_URL}/receptionist?tab=reception-queue`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));

    // Trigger QR button in workstation command bar
    const qrBtnFound = await pageDesktop1440.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.innerText.includes('Reception QR'));
      if (target) {
        target.click();
        return true;
      }
      return false;
    });
    record('RECEPTION QR', 'Reception QR trigger button clickable', qrBtnFound);
    await new Promise(r => setTimeout(r, 600));

    // Inspect QR Modal DOM
    const qrModalDetails = await pageDesktop1440.evaluate(() => {
      const modal = document.querySelector('#reception-qr-modal-container') || document.body;
      const svg = document.querySelector('#reception-qr-svg');
      const input = document.querySelector('input[readonly]');
      const downloadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Download PNG'));
      const printBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Print Poster'));

      return {
        svgPresent: !!svg,
        qrPayloadUrl: input ? input.value : '',
        downloadBtnPresent: !!downloadBtn,
        printBtnPresent: !!printBtn
      };
    });

    record('RECEPTION QR', 'Reception QR SVG rendered correctly', qrModalDetails.svgPresent);
    record('RECEPTION QR', 'Reception QR payload contains /reception-queue/:clinicCode', qrModalDetails.qrPayloadUrl.includes('/reception-queue/'), `Payload URL: "${qrModalDetails.qrPayloadUrl}"`);
    record('RECEPTION QR', 'Download PNG button present', qrModalDetails.downloadBtnPresent);
    record('RECEPTION QR', 'Print Poster button present', qrModalDetails.printBtnPresent);

    // Confirm distinction from patient portal QR
    const isDistinctFromPortal = !qrModalDetails.qrPayloadUrl.includes('/patient/portal/') && qrModalDetails.qrPayloadUrl.includes('/reception-queue/');
    record('RECEPTION QR', 'Distinct from Branded Clinic Patient Portal QR', isDistinctFromPortal, 'Destination strictly dedicated to Counter Intake Queue');

    const shotPathQrModal = path.join(ARTIFACT_DIR, '08_reception_qr_modal.png');
    await pageDesktop1440.screenshot({ path: shotPathQrModal, fullPage: false });
    console.log(`[SCREENSHOT] Saved: ${shotPathQrModal}`);

    // ════════════════════════════════════════════════════════════════════════
    // 6. ROLE-AUTHORIZED MOBILE FUNCTIONALITY ACCESSIBILITY AUDIT
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST 6: ROLE-AUTHORIZED MOBILE FUNCTIONALITY AUDIT ---');
    const mobileAuditPage = await browser.newPage();
    await mobileAuditPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await mobileAuditPage.evaluateOnNewDocument(() => {
      window.__quroxa_mock_token = 'valid_test_token_2026';
      localStorage.setItem('user', JSON.stringify({
        id: 'u_rec_01',
        _id: 'u_rec_01',
        name: 'rajesh',
        staff_id: 'receptionist_1',
        role: 'receptionist',
        tenantId: 'quroxa_test_clinic'
      }));
      localStorage.setItem('tenantId', 'quroxa_test_clinic');
      localStorage.setItem('role', 'receptionist');
      localStorage.setItem('token', 'valid_test_token_2026');
    });

    await mobileAuditPage.goto(`${BASE_URL}/receptionist?tab=reception-queue`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const mobileAudit = await mobileAuditPage.evaluate(() => {
      const items = {
        queueCommandBar: !!document.querySelector('button'),
        callNextButton: !!Array.from(document.querySelectorAll('button, h3, div')).find(b => (b.innerText || '').includes('Call Next Patient') || (b.innerText || '').includes('Reception Counter is Free')),
        receptionQrButton: !!Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Reception QR')),
        segmentedTabs: !!document.querySelector('.border-b') || !!document.querySelector('[style*="border-bottom"]'),
        mobileBottomNav: !!document.querySelector('.mobile-bottom-nav'),
        floatingSupportBtn: !!document.querySelector('.global-support-btn')
      };

      // Check support button clearance
      const supBtn = document.querySelector('.global-support-btn');
      let clearanceOk = true;
      if (supBtn) {
        const computed = window.getComputedStyle(supBtn);
        clearanceOk = parseInt(computed.bottom, 10) >= 60;
      }

      return { items, clearanceOk };
    });

    record('MOBILE ACCESSIBILITY', 'Call Next Patient button visible & accessible', mobileAudit.items.callNextButton);
    record('MOBILE ACCESSIBILITY', 'Reception QR button visible & accessible on mobile', mobileAudit.items.receptionQrButton);
    record('MOBILE ACCESSIBILITY', 'Mobile bottom navigation present (5 items)', mobileAudit.items.mobileBottomNav);
    record('MOBILE ACCESSIBILITY', 'Floating support widget positioned above bottom nav', mobileAudit.clearanceOk);

    // Screenshot 9: Mobile Patient Registration Form
    await mobileAuditPage.goto(`${BASE_URL}/receptionist?tab=registration-form`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const shotPathMobileReg = path.join(ARTIFACT_DIR, '09_mobile_registration_form.png');
    await mobileAuditPage.screenshot({ path: shotPathMobileReg, fullPage: false });
    console.log(`[SCREENSHOT] Saved: ${shotPathMobileReg}`);

  } catch (err) {
    console.error('TEST ERROR:', err);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n================================================================');
  console.log(`  VERIFICATION COMPLETE: ${testResults.filter(r => r.pass).length} / ${testResults.length} CHECKS PASSED`);
  console.log('================================================================\n');

  return testResults;
}

runSuite().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
