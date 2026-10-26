const path = require('path');
const fs = require('fs');
const puppeteer = require('../backend/node_modules/puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

const VIEWPORTS = [
  { width: 320, height: 640, label: '320px-Small-Mobile' },
  { width: 360, height: 740, label: '360px-Standard-Mobile' },
  { width: 375, height: 667, label: '375px-iPhone-SE' },
  { width: 390, height: 844, label: '390px-iPhone-14' },
  { width: 430, height: 932, label: '430px-iPhone-14-Pro-Max' },
  { width: 768, height: 1024, label: '768px-iPad-Portrait' },
  { width: 1024, height: 768, label: '1024px-Tablet-Landscape' },
  { width: 1280, height: 800, label: '1280px-Small-Desktop' },
  { width: 1440, height: 900, label: '1440px-Standard-Desktop' },
  { width: 1920, height: 1080, label: '1920px-FHD-Desktop' },
  { width: 2560, height: 1440, label: '2560px-2K-QHD' }
];

const SCREENSHOT_DIR = path.join(__dirname, '../../scratch/responsive_tests');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runTests() {
  console.log('Starting Quroxa Application-Wide Responsive Verification...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];

  const pagesToTest = [
    { url: '/login', name: 'Login Page', role: 'public' },
    { url: '/patient/login', name: 'Patient Portal Login', role: 'public' },
    { url: '/patient-register', name: 'Patient Registration', role: 'public' },
    { url: '/reception-queue/med-harsh-743', name: 'Public Reception Queue Intake', role: 'public' },
    { url: '/reception-display/med-harsh-743', name: 'Public Reception Room Display', role: 'public' },
    { url: '/admin', name: 'Clinic Admin Dashboard', role: 'admin' },
    { url: '/receptionist', name: 'Receptionist Front Desk Portal', role: 'receptionist' },
    { url: '/doctor', name: 'Doctor Consultation Dashboard', role: 'doctor' },
    { url: '/pharmacy', name: 'Pharmacy Overview Portal', role: 'pharmacy' },
    { url: '/procurement', name: 'Procurement Command Center', role: 'inventory' },
    { url: '/lab', name: 'Laboratory Diagnostics Portal', role: 'lab' },
    { url: '/hr', name: 'Hospital HR & Staff Workspace', role: 'hr' },
    { url: '/dpo', name: 'Data Protection Officer Portal', role: 'dpo' },
    { url: '/super-admin', name: 'Super Admin Executive Portal', role: 'superadmin' }
  ];

  for (const pageDef of pagesToTest) {
    console.log(`\n======================================================`);
    console.log(`Testing Route: ${pageDef.name} (${pageDef.url})`);
    console.log(`======================================================`);

    const page = await browser.newPage();

    // Setup session before navigating if role is authenticated
    if (pageDef.role !== 'public') {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((role) => {
        const mockUser = {
          _id: 'usr_mock_123',
          id: 'usr_mock_123',
          staff_id: role === 'superadmin' ? 'superadmin' : `${role}-01`,
          name: `Dr. Verified ${role.toUpperCase()}`,
          role: role,
          tenantId: 'city_hospital',
          tenantName: "Harsh's Hospital",
          email: `${role}@curoxa.com`
        };
        const mockModules = {
          receptionQueue: { enabled: true },
          reception: { enabled: true },
          doctor: { enabled: true },
          pharmacy: { enabled: true },
          laboratory: { enabled: true },
          inventory: { enabled: true }
        };
        localStorage.setItem('user', JSON.stringify(mockUser));
        localStorage.setItem('token', 'mock_jwt_verified_session_token_12345');
        localStorage.setItem('tenantId', 'city_hospital');
        localStorage.setItem('tenantModules', JSON.stringify(mockModules));
        if (role === 'superadmin') {
          localStorage.setItem('curoxa_superadmin_session', 'true');
        }
      }, pageDef.role);
    }

    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      try {
        await page.goto(`${BASE_URL}${pageDef.url}`, { waitUntil: 'networkidle2', timeout: 12000 });
      } catch (e) {
        try {
          await page.goto(`${BASE_URL}${pageDef.url}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
        } catch (e2) {}
      }

      await new Promise(r => setTimeout(r, 600));

      const overflowMetrics = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(root.scrollWidth, body ? body.scrollWidth : 0);
        const innerWidth = window.innerWidth;
        const clientWidth = root.clientWidth;
        const hasHorizontalOverflow = scrollWidth > innerWidth + 1; // 1px rounding tolerance
        return {
          scrollWidth,
          innerWidth,
          clientWidth,
          hasHorizontalOverflow,
          overflowDelta: Math.max(0, scrollWidth - innerWidth)
        };
      });

      const pass = !overflowMetrics.hasHorizontalOverflow;
      const statusStr = pass ? 'PASS' : 'FAIL';
      console.log(`[${statusStr}] ${pageDef.name} @ ${vp.width}x${vp.height} (${vp.label}) — scrollWidth: ${overflowMetrics.scrollWidth}px, innerWidth: ${overflowMetrics.innerWidth}px (delta: ${overflowMetrics.overflowDelta}px)`);

      results.push({
        route: pageDef.url,
        pageName: pageDef.name,
        viewport: vp.label,
        width: vp.width,
        height: vp.height,
        scrollWidth: overflowMetrics.scrollWidth,
        hasOverflow: overflowMetrics.hasHorizontalOverflow,
        overflowDelta: overflowMetrics.overflowDelta,
        status: statusStr
      });

      // Capture representative screenshot for key breakpoints
      if ([360, 768, 1440].includes(vp.width)) {
        const safeName = pageDef.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}_${vp.width}px.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
      }
    }

    await page.close();
  }

  await browser.close();

  // Summary analysis
  console.log('\n======================================================');
  console.log('AUTOMATED RESPONSIVE TEST AUDIT SUMMARY');
  console.log('======================================================');
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total Scenarios Tested: ${total}`);
  console.log(`Passed (No Horizontal Overflow): ${passed}`);
  console.log(`Failed: ${failed}`);

  const reportPath = path.join(SCREENSHOT_DIR, 'responsive_audit_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Results saved to ${reportPath}`);
}

runTests().catch(err => {
  console.error('Fatal testing error:', err);
  process.exit(1);
});
