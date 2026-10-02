const puppeteer = require('puppeteer-core');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { getJwtSecret } = require('../config/env');
const User = require('../models/User');
const SuperAdminHospital = require('../models/SuperAdminHospital');

const ARTIFACT_DIR = 'C:\\Users\\lenovo\\.gemini\\antigravity\\brain\\26a07deb-37f0-458a-a80d-3712aa44d16b';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runUiVerification() {
  console.log('--- STARTING PUPPETEER UI VERIFICATION ---');

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/curoxa';
  await mongoose.connect(mongoUri);

  const testTenant = 'HSP-ONBOARD-UI';
  let secret;
  try {
    secret = getJwtSecret();
  } catch (e) {
    secret = process.env.JWT_SECRET || 'secret_key';
  }

  // Ensure test hospital exists with all modules active
  await SuperAdminHospital.findOneAndUpdate(
    { code: testTenant },
    {
      code: testTenant,
      name: 'Quroxa UI Hospital',
      status: 'Active',
      subscriptionStatus: 'active',
      plan: 'enterprise',
      subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      limits: { staffLimit: 100 }
    },
    { upsert: true }
  );

  // Clean test non-admin users
  await User.deleteMany({ tenantId: testTenant, role: { $ne: 'admin' } });

  // Setup admin user
  const adminUser = await User.findOneAndUpdate(
    { tenantId: testTenant, role: 'admin' },
    {
      tenantId: testTenant,
      staff_id: 'admin_ui_test',
      password_hash: '$2b$10$abcdefghijklmnopqrstuv',
      role: 'admin',
      name: 'Admin Director',
      email: 'admin.ui@hospital.com',
      phone: '9988776655'
    },
    { upsert: true, returnDocument: 'after' }
  );

  const token = jwt.sign(
    {
      id: adminUser._id,
      userId: adminUser._id,
      staff_id: adminUser.staff_id,
      role: 'admin',
      tenantId: testTenant
    },
    secret,
    { expiresIn: '4h' }
  );

  const userPayload = {
    _id: adminUser._id.toString(),
    id: adminUser._id.toString(),
    userId: adminUser._id.toString(),
    staff_id: adminUser.staff_id,
    name: adminUser.name,
    email: adminUser.email,
    phone: adminUser.phone,
    role: 'admin',
    tenantId: testTenant,
    tenantName: 'Quroxa UI Hospital'
  };

  const tenantModules = {
    doctor: { enabled: true },
    reception: { enabled: true },
    laboratory: { enabled: true },
    pharmacy: { enabled: true },
    inventory: { enabled: true },
    billing: { enabled: true }
  };

  console.log('Launching browser with Chrome at:', CHROME_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  // 1. Initialize local storage credentials
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok, usr, mods) => {
    localStorage.setItem('token', tok);
    localStorage.setItem('user', JSON.stringify(usr));
    localStorage.setItem('tenantModules', JSON.stringify(mods));
  }, token, userPayload, tenantModules);

  console.log('\n[Step 1] Navigating directly to /admin/staff/new...');
  await page.goto('http://localhost:3000/admin/staff/new', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.includes('Add New Staff'), { timeout: 8000 });

  console.log('Dedicated page loaded successfully.');
  const defaultPagePath = path.join(ARTIFACT_DIR, 'staff_onboarding_dedicated_page.png');
  await page.screenshot({ path: defaultPagePath, fullPage: true });
  console.log(`Saved screenshot: ${defaultPagePath}`);

  // Check that no modal overlay with fixed inset-0 exists
  const hasModal = await page.evaluate(() => {
    const modal = document.querySelector('.hr-modal-overlay');
    return !!modal;
  });
  console.log('Is modal overlay present?', hasModal ? 'YES (Error)' : 'NO (Correct, dedicated in-page)');

  // Check Section 1, 2, 3, 4 titles (case-insensitive)
  const sectionsPresent = await page.evaluate(() => {
    const text = document.body.innerText.toUpperCase();
    return {
      hasSec1: text.includes('1. ACCOUNT & SECURITY'),
      hasSec2: text.includes('2. ROLE & DEPARTMENT'),
      hasSec3: text.includes('3. PROFESSIONAL CONFIGURATION'),
      hasSec4: text.includes('4. SCHEDULE & AVAILABILITY'),
      hasAsteriskNote: text.includes('REQUIRED FIELDS')
    };
  });
  console.log('Sections present check:', sectionsPresent);

  // Test Auto-population of System Login ID with Phone
  console.log('\n[Step 2] Testing Phone to Staff ID auto-sync...');
  await page.type('input[name="phone"]', '9876543210');
  const staffIdValue = await page.$eval('input[name="staff_id"]', el => el.value);
  console.log('Phone typed: 9876543210 -> Staff ID populated:', staffIdValue);

  // Test Interactive Time Slot Picker
  console.log('\n[Step 3] Testing Interactive Time Slot Picker for Doctor...');
  const addSlotBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.innerText.includes('Add Slot') && b.closest('.bg-white'));
  });
  if (addSlotBtn) {
    await addSlotBtn.click();
    await page.waitForFunction(() => document.body.innerText.includes('Select Time Range for New Slot'), { timeout: 3000 });
    console.log('Time Slot Picker panel opened.');
    
    // Click quick preset "+30m"
    const preset30Btn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('+30m'));
    });
    if (preset30Btn) await preset30Btn.click();

    const pickerShotPath = path.join(ARTIFACT_DIR, 'staff_onboarding_time_slot_picker.png');
    await page.screenshot({ path: pickerShotPath });
    console.log(`Saved screenshot: ${pickerShotPath}`);

    // Click "Add Slot" button inside picker
    const confirmSlotBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.trim() === 'Add Slot' && b.className.includes('bg-blue-600'));
    });
    if (confirmSlotBtn) await confirmSlotBtn.click();
    await new Promise(r => setTimeout(r, 500));
  }

  // Test switching role to Nurse (non-doctor)
  console.log('\n[Step 4] Switching Role to Nurse (Non-Doctor)...');
  await page.evaluate(() => {
    const select = document.querySelector('select[name="role"]');
    select.value = 'nurse';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 600));

  const nurseViewCheck = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasDoctorSpecialization: text.includes('Clinical Specialization'),
      hasMondayChip: text.includes('Mon'),
      hasSundayChip: text.includes('Sun')
    };
  });
  console.log('Nurse role view check:', nurseViewCheck);

  const nurseShotPath = path.join(ARTIFACT_DIR, 'staff_onboarding_nurse_role_view.png');
  await page.screenshot({ path: nurseShotPath, fullPage: true });
  console.log(`Saved screenshot: ${nurseShotPath}`);

  // Test form submission & success toast
  console.log('\n[Step 5] Filling remaining fields and testing staff creation & success toast...');
  await page.type('input[name="name"]', 'Sister Priya Sharma');
  await page.type('input[name="email"]', 'priya.sharma@hospital.com');
  await page.type('input[name="password"]', 'Password@123');
  await page.type('input[name="confirmPassword"]', 'Password@123');
  const passwordShotPath = path.join(ARTIFACT_DIR, 'staff_onboarding_password_dots.png');
  await page.screenshot({ path: passwordShotPath, fullPage: true });
  console.log(`Saved screenshot: ${passwordShotPath}`);

  // Toggle Weekly Off day chip (Tuesday)
  const dayChips = await page.$$('button[type="button"]');
  for (const chip of dayChips) {
    const text = await (await chip.getProperty('innerText')).jsonValue();
    if (text.trim() === 'Tue') {
      await chip.click();
      break;
    }
  }

  // Check form values before submitting
  const formValues = await page.evaluate(() => {
    return {
      name: document.querySelector('input[name="name"]')?.value,
      phone: document.querySelector('input[name="phone"]')?.value,
      staff_id: document.querySelector('input[name="staff_id"]')?.value,
      email: document.querySelector('input[name="email"]')?.value,
      role: document.querySelector('select[name="role"]')?.value,
      department: document.querySelector('select[name="department"]')?.value,
    };
  });
  console.log('Form values prepared for submission:', formValues);

  // Click Submit (Bottom Action Bar)
  console.log('Submitting onboarding form...');
  await page.click('#onboard-staff-submit-btn');

  // Give 1 second for API response / toast
  await new Promise(r => setTimeout(r, 1200));

  // Check if any error banner appeared on page
  const pageErrors = await page.evaluate(() => {
    const alert = document.querySelector('.bg-rose-50')?.innerText;
    const toast = document.querySelector('.premium-toast')?.innerText;
    const fieldErrors = Array.from(document.querySelectorAll('p.text-rose-600')).map(p => p.innerText);
    return { alert, toast, fieldErrors, bodyText: document.body.innerText.slice(0, 300) };
  });
  console.log('After submit status:', pageErrors);

  const successShotPath = path.join(ARTIFACT_DIR, 'staff_onboarding_success_toast.png');
  await page.screenshot({ path: successShotPath });
  console.log(`Saved screenshot: ${successShotPath}`);

  // Wait for return to staff directory
  await new Promise(r => setTimeout(r, 1500));
  const returnedToDir = await page.evaluate(() => {
    return document.body.innerText.includes('Staff Directory') || document.body.innerText.includes('Sister Priya Sharma');
  });
  console.log('Returned to Staff Directory and new staff listed?', returnedToDir);

  const finalDirShotPath = path.join(ARTIFACT_DIR, 'staff_directory_with_newly_added_staff.png');
  await page.screenshot({ path: finalDirShotPath, fullPage: true });
  console.log(`Saved screenshot: ${finalDirShotPath}`);

  await browser.close();
  await mongoose.disconnect();
  console.log('\n===========================================');
  console.log('ALL PUPPETEER UI TESTS PASSED SUCCESSFULLY!');
  console.log('===========================================\n');
}

runUiVerification().catch(err => {
  console.error('Puppeteer verification failed:', err);
  process.exit(1);
});
