const puppeteer = require('puppeteer-core');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ARTIFACT_DIR = path.resolve('C:/Users/lenovo/.gemini/antigravity/brain/26a07deb-37f0-458a-a80d-3712aa44d16b');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function captureAdminAffiliateTab() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Logging into Admin...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
  await page.type('input[placeholder="Username"], input[type="text"]', '9876543210');
  await page.type('input[type="password"]', 'password123');

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const loginBtn = btns.find(b => b.innerText.includes('Login'));
    if (loginBtn) loginBtn.click();
  });

  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await new Promise(r => setTimeout(r, 2500));

  // Find and click Affiliate Labs
  console.log('Finding Affiliate Labs link...');
  const clicked = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('.sidebar-link-text, .sidebar-link, span'));
    const link = links.find(l => l.innerText && l.innerText.trim() === 'Affiliate Labs');
    if (link) {
      link.click();
      return true;
    }
    return false;
  });
  console.log('Clicked Affiliate Labs link:', clicked);
  await new Promise(r => setTimeout(r, 2000));

  const adminImg = path.join(ARTIFACT_DIR, 'admin_affiliate_lab_management.png');
  await page.screenshot({ path: adminImg });
  console.log(`✓ Admin Affiliate Lab Management screenshot saved: ${adminImg}`);

  // Open Browse All dropdown
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const browse = btns.find(b => b.innerText && b.innerText.includes('Browse All'));
    if (browse) browse.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const adminDropdownImg = path.join(ARTIFACT_DIR, 'admin_affiliate_lab_dropdown.png');
  await page.screenshot({ path: adminDropdownImg });
  console.log(`✓ Admin Affiliate Lab Dropdown screenshot saved: ${adminDropdownImg}`);

  await browser.close();
  process.exit(0);
}

captureAdminAffiliateTab().catch(err => {
  console.error(err);
  process.exit(1);
});
