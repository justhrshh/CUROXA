const puppeteer = require('puppeteer-core');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const { getJwtSecret } = require('../config/env');

const ARTIFACT_DIR = path.resolve('C:/Users/lenovo/.gemini/antigravity/brain/26a07deb-37f0-458a-a80d-3712aa44d16b');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function captureScreenshots() {
  console.log('Starting Puppeteer for in-page Vendor Master screenshots...');

  let secret;
  try {
    secret = getJwtSecret();
  } catch (e) {
    secret = process.env.JWT_SECRET || 'secret_key';
  }

  const superAdminToken = jwt.sign(
    { id: '6a607c41794cf6e12b9a2268', email: 'super.admin@curoxa.com', role: 'superadmin', name: 'Super Admin', tenantId: 'curoxa' },
    secret,
    { expiresIn: '1h' }
  );

  const hospitalToken = jwt.sign(
    { id: '6a9ba8cfa09625c03036cb55', email: 'admin@hospital.com', role: 'admin', name: 'Hospital Admin', tenantId: 'HSP-L11PI7' },
    secret,
    { expiresIn: '1h' }
  );

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. SUPERADMIN IN-PAGE ADD VENDOR FORM
    // ─────────────────────────────────────────────────────────────────────────
    console.log('Navigating to SuperAdmin Vendor Master...');
    await page.goto('http://localhost:3000/vendor-master', { waitUntil: 'domcontentloaded' });

    await page.evaluate((token) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({
        id: '6a607c41794cf6e12b9a2268',
        email: 'super.admin@curoxa.com',
        role: 'superadmin',
        name: 'Super Admin'
      }));
    }, superAdminToken);

    await page.goto('http://localhost:3000/vendor-master', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));

    // Capture Catalog with single plus Add Vendor button
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'vendor_master_catalog.png'), fullPage: false });
    console.log('Captured: vendor_master_catalog.png');

    // Click "Add Vendor"
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const addBtn = buttons.find(b => b.textContent && b.textContent.includes('Add Vendor'));
      if (addBtn) addBtn.click();
    });

    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'vendor_master_step1.png'), fullPage: false });
    console.log('Captured: vendor_master_step1.png');

    // Click Next Step to go to Step 2
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const nextBtn = buttons.find(b => b.textContent && b.textContent.includes('Next Step'));
      if (nextBtn) nextBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'vendor_master_step2.png'), fullPage: false });
    console.log('Captured: vendor_master_step2.png');

    // Click "All Sections" tab
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const allBtn = buttons.find(b => b.textContent && b.textContent.includes('All Sections'));
      if (allBtn) allBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'vendor_master_all_sections.png'), fullPage: false });
    console.log('Captured: vendor_master_all_sections.png');

    // ─────────────────────────────────────────────────────────────────────────
    // 2. HOSPITAL IN-PAGE GLOBAL VENDOR PICKER
    // ─────────────────────────────────────────────────────────────────────────
    console.log('Navigating to Hospital Procurement Portal...');
    await page.evaluate((token) => {
      localStorage.setItem('token', token);
      localStorage.setItem('tenantId', 'HSP-L11PI7');
      localStorage.setItem('user', JSON.stringify({
        id: '6a9ba8cfa09625c03036cb55',
        email: 'admin@hospital.com',
        role: 'admin',
        name: 'Hospital Admin',
        tenantId: 'HSP-L11PI7'
      }));
    }, hospitalToken);

    await page.goto('http://localhost:3000/procurement', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));

    // Click "Vendor Master" tab in sidebar
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const vTab = buttons.find(b => b.textContent && b.textContent.includes('Vendor Master'));
      if (vTab) vTab.click();
    });

    await new Promise(r => setTimeout(r, 1500));

    // Click "Add Existing Vendor" (opens in-page picker)
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const pickerBtn = buttons.find(b => b.textContent && b.textContent.includes('Add Existing Vendor'));
      if (pickerBtn) pickerBtn.click();
    });

    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'hospital_vendor_master_inpage_picker.png'), fullPage: false });
    console.log('Captured: hospital_vendor_master_inpage_picker.png');

    // ─────────────────────────────────────────────────────────────────────────
    // 3. HOSPITAL IN-PAGE REQUEST NEW VENDOR FORM
    // ─────────────────────────────────────────────────────────────────────────
    // Click Cancel/Back to return to My Vendors
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const backBtn = buttons.find(b => b.textContent && (b.textContent.includes('Back') || b.textContent.includes('Cancel')));
      if (backBtn) backBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Click "Request New Vendor" (opens in-page form)
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const reqBtn = buttons.find(b => b.textContent && b.textContent.includes('Request New Vendor'));
      if (reqBtn) reqBtn.click();
    });

    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'hospital_vendor_master_inpage_request.png'), fullPage: false });
    console.log('Captured: hospital_vendor_master_inpage_request.png');

  } catch (err) {
    console.error('Puppeteer error:', err);
  } finally {
    await browser.close();
    console.log('Puppeteer finished successfully.');
  }
}

captureScreenshots();
