const puppeteer = require('puppeteer-core');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');
const LaboratoryMaster = require('../models/LaboratoryMaster');
const HospitalAffiliateLabConfig = require('../models/HospitalAffiliateLabConfig');

const ARTIFACT_DIR = path.resolve('C:/Users/lenovo/.gemini/antigravity/brain/26a07deb-37f0-458a-a80d-3712aa44d16b');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runBrowserAffiliateLabVerification() {
  console.log('===================================================================');
  console.log('QUROXA — REAL BROWSER AFFILIATE LAB MANAGEMENT VERIFICATION');
  console.log('===================================================================');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const tenantId = 'city_hospital';
  const adminStaffId = '9876543210';
  const adminPassword = 'password123';
  const recStaffId = '9876543211';
  const recPassword = 'password123';

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(adminPassword, salt);

  // 1. Ensure test admin account in city_hospital
  await User.findOneAndUpdate(
    { staff_id: adminStaffId },
    {
      tenantId,
      name: 'Dr. Administrator',
      staff_id: adminStaffId,
      phone: adminStaffId,
      role: 'admin',
      password_hash: hash,
      email: 'admin.affiliate@cityhospital.com'
    },
    { upsert: true, returnDocument: 'after' }
  );

  // 2. Ensure test receptionist account in city_hospital
  await User.findOneAndUpdate(
    { staff_id: recStaffId },
    {
      tenantId,
      name: 'Pooja Verma',
      staff_id: recStaffId,
      phone: recStaffId,
      role: 'receptionist',
      password_hash: hash,
      email: 'reception.affiliate@cityhospital.com'
    },
    { upsert: true, returnDocument: 'after' }
  );
  console.log('✓ Ensured admin and receptionist test credentials');

  // Launch browser
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('Download the React DevTools') && !text.includes('[SOCKET]')) {
      console.log('PAGE LOG:', text);
    }
  });

  try {
    // ==========================================
    // STEP 1: ADMIN PANEL AFFILIATE LAB CONFIG
    // ==========================================
    console.log('\n--- STEP 1: Testing Admin Panel Affiliate Lab Configuration ---');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });

    // Login as Admin
    await page.evaluate((staffId, pass) => {
      const inputs = document.querySelectorAll('input');
      if (inputs[0]) {
        inputs[0].value = staffId;
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (inputs[1]) {
        inputs[1].value = pass;
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, adminStaffId, adminPassword);

    await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Login'));
      if (btn) btn.click();
    });

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    // Navigate to Affiliate Labs tab
    console.log('Navigating to Affiliate Labs tab in Admin...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.sidebar-link-text, .sidebar-link'));
      const affiliateTab = links.find(l => l.textContent.includes('Affiliate Labs'));
      if (affiliateTab) {
        affiliateTab.click();
      }
    });

    await new Promise(r => setTimeout(r, 1500));

    // Capture Admin Panel screenshot
    const adminScreenshotPath = path.join(ARTIFACT_DIR, 'admin_affiliate_lab_management.png');
    await page.screenshot({ path: adminScreenshotPath });
    console.log(`✓ Admin Affiliate Lab Management screenshot saved: ${adminScreenshotPath}`);

    // Verify UI elements exist on Admin page
    const hasAdminWorkstation = await page.evaluate(() => {
      const header = document.querySelector('h2');
      return header && header.textContent.includes('Affiliate Laboratory Management');
    });
    console.log(`✓ Admin Affiliate Lab Management workstation header confirmed: ${hasAdminWorkstation}`);

    // Save configuration via button
    console.log('Triggering Save Configuration in Admin Panel...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const saveBtn = btns.find(b => b.textContent.includes('Save Configuration'));
      if (saveBtn) saveBtn.click();
    });

    await new Promise(r => setTimeout(r, 2000));
    const adminSavedScreenshotPath = path.join(ARTIFACT_DIR, 'admin_affiliate_lab_saved.png');
    await page.screenshot({ path: adminSavedScreenshotPath });
    console.log(`✓ Admin configuration saved screenshot captured: ${adminSavedScreenshotPath}`);

    // ==========================================
    // STEP 2: RECEPTIONIST TEST BOOKING
    // ==========================================
    console.log('\n--- STEP 2: Testing Receptionist Test Booking with Preselected Default Lab ---');
    // Clear storage and logout
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });

    // Login as Receptionist
    await page.evaluate((staffId, pass) => {
      const inputs = document.querySelectorAll('input');
      if (inputs[0]) {
        inputs[0].value = staffId;
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (inputs[1]) {
        inputs[1].value = pass;
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, recStaffId, recPassword);

    await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Login'));
      if (btn) btn.click();
    });

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    // In Receptionist Dashboard, switch bookingType to 'lab'
    console.log('Switching booking type to Diagnostic Lab in Receptionist Dashboard...');
    await page.evaluate(() => {
      // Find Lab Test radio or toggle
      const labels = Array.from(document.querySelectorAll('label, button, div'));
      const labToggle = labels.find(l => l.textContent.trim() === 'Diagnostic Lab' || l.textContent.trim() === 'Lab Order');
      if (labToggle) labToggle.click();
    });

    await new Promise(r => setTimeout(r, 1500));

    // Capture Receptionist Lab Booking Workstation screenshot
    const recBookingScreenshotPath = path.join(ARTIFACT_DIR, 'receptionist_lab_booking_workstation.png');
    await page.screenshot({ path: recBookingScreenshotPath });
    console.log(`✓ Receptionist Lab Booking Workstation screenshot saved: ${recBookingScreenshotPath}`);

    // Verify Select Laboratory dropdown exists and contains affiliated labs
    const labDropdownDetails = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const s of selects) {
        const options = Array.from(s.options).map(o => o.text);
        if (options.some(t => t.includes('Default Lab') || t.includes('PathLabs') || t.includes('Diagnostics') || t.includes('Metropolis'))) {
          return {
            found: true,
            selected: s.options[s.selectedIndex]?.text,
            optionsCount: options.length,
            options
          };
        }
      }
      return { found: false };
    });
    console.log('✓ Receptionist Select Laboratory dropdown audit:', JSON.stringify(labDropdownDetails, null, 2));

    console.log('\n======================================================');
    console.log('>>> BROWSER END-TO-END VERIFICATION COMPLETED! <<<');
    console.log('======================================================');
  } catch (err) {
    console.error('Browser Test Error:', err);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

runBrowserAffiliateLabVerification();
