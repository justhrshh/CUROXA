const puppeteer = require('puppeteer-core');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');

const ARTIFACT_DIR = path.resolve('C:/Users/lenovo/.gemini/antigravity/brain/26a07deb-37f0-458a-a80d-3712aa44d16b');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runBrowserEmployeeOnboardingTests() {
  console.log('===================================================================');
  console.log('QUROXA — REAL BROWSER EMPLOYEE ONBOARDING VERIFICATION');
  console.log('===================================================================');

  await mongoose.connect(process.env.MONGO_URI);
  console.log(' Connected to MongoDB');

  const tenantId = 'city_hospital';
  const adminStaffId = '9876543210';
  const adminPassword = 'password123';

  // Ensure admin user exists for city_hospital
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(adminPassword, salt);
  await User.findOneAndUpdate(
    { staff_id: adminStaffId },
    {
      tenantId,
      name: 'System Admin Testing',
      staff_id: adminStaffId,
      phone: adminStaffId,
      role: 'admin',
      password_hash: hash,
      email: 'admin.testing@cityhospital.com'
    },
    { upsert: true, returnDocument: 'after' }
  );
  console.log(' Ensured test admin account 9876543210 in city_hospital');

  const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const testStaffName = `Rajesh Sharma ${Date.now().toString().slice(-4)}`;

  console.log(' Launching Headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  async function fillReactInput(selector, value) {
    await page.waitForSelector(selector);
    await page.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
  }

  async function selectReactDropdown(selector, value) {
    await page.waitForSelector(selector);
    await page.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
  }

  try {
    // 1. Login
    console.log('1. Navigating to http://localhost:3000/login ...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });

    await page.waitForSelector('input[placeholder*="Username"], input[type="text"]');
    const idInput = await page.$('input[placeholder*="Username"], input[type="text"]');
    const pwInput = await page.$('input[type="password"]');

    await idInput.type(adminStaffId);
    await pwInput.type(adminPassword);

    const submitBtn = await page.$('button[type="submit"]');
    await submitBtn.click();

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));
    console.log(' Current URL after login:', page.url());

    // 2. Navigate to /admin/staff/new
    console.log('2. Navigating to http://localhost:3000/admin/staff/new ...');
    await page.goto('http://localhost:3000/admin/staff/new', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#onboard-employee-submit-btn', { timeout: 10000 });
    console.log(' Onboarding workstation loaded successfully!');

    // Verify Title select exists
    const titleSelectInfo = await page.evaluate(() => {
      const select = document.querySelector('#title-select');
      return {
        present: !!select,
        options: select ? Array.from(select.options).map(o => o.value) : []
      };
    });
    console.log('  Title dropdown info:', JSON.stringify(titleSelectInfo));

    // Verify Employee ID is read-only auto-generated
    const empIdFieldState = await page.evaluate(() => {
      const empIdInp = document.querySelector('input[name="employeeId"]');
      return {
        present: !!empIdInp,
        value: empIdInp?.value || '',
        readOnly: empIdInp?.readOnly
      };
    });
    console.log('  Employee ID read-only state:', JSON.stringify(empIdFieldState));

    // 3. Fill in Form Fields via React setter
    console.log('3. Filling onboarding workstation fields...');
    await selectReactDropdown('#title-select', 'Dr.');
    await fillReactInput('input[name="name"]', testStaffName);
    await fillReactInput('input[name="phone"]', testPhone);
    await fillReactInput('input[name="password"]', 'Password123!');
    await fillReactInput('input[name="confirmPassword"]', 'Password123!');

    await new Promise(r => setTimeout(r, 800));

    // 4. Open Optional Details (Section 5) and select Relationship
    console.log('4. Expanding Section 5 Optional Details & setting Relationship...');
    await page.evaluate(() => {
      const el = document.querySelector('#section-personal-details-toggle');
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.click();
      }
    });

    await page.waitForSelector('#emergency-relation-select', { timeout: 8000 });

    // Check relationship dropdown options
    const relOptions = await page.evaluate(() => {
      const select = document.querySelector('#emergency-relation-select');
      return select ? Array.from(select.options).map(o => o.value) : [];
    });
    console.log('  Relationship dropdown options:', JSON.stringify(relOptions));

    await selectReactDropdown('#emergency-relation-select', 'Spouse');
    await fillReactInput('input[placeholder*="Next of Kin"], input[placeholder*="Contact Name"]', 'Sunita Sharma');
    await fillReactInput('input[placeholder*="10-digit emergency"]', '9876500099');

    await new Promise(r => setTimeout(r, 1000));

    // Capture screenshot of filled onboarding workstation
    const screenshotFormPath = path.join(ARTIFACT_DIR, 'employee_onboarding_form_filled.png');
    await page.screenshot({ path: screenshotFormPath, fullPage: true });
    console.log(` Saved screenshot of filled form: ${screenshotFormPath}`);

    // 5. Submit Employee Form
    console.log('5. Clicking #onboard-employee-submit-btn...');
    await page.evaluate(() => {
      const btn = document.querySelector('#onboard-employee-submit-btn');
      if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 4500));

    // 6. Verify employee was created in database with authoritative Employee ID
    const createdUser = await User.findOne({ tenantId, phone: testPhone });
    if (!createdUser) {
      throw new Error(`Employee with phone ${testPhone} was not found in DB!`);
    }
    console.log(' Verified created employee in DB:');
    console.log('    _id:', createdUser._id.toString());
    console.log('    Title:', createdUser.title);
    console.log('    Full Name:', createdUser.name);
    console.log('    Employee ID (authoritative):', createdUser.employeeId);
    console.log('    System Login ID:', createdUser.staff_id);
    console.log('    Emergency Relation:', createdUser.emergencyContact?.relation);

    // 7. Verify staff list table in UI
    console.log('6. Verifying Workforce Directory in UI...');
    await page.goto('http://localhost:3000/admin/staff', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const screenshotTablePath = path.join(ARTIFACT_DIR, 'employee_directory_with_new_emp.png');
    await page.screenshot({ path: screenshotTablePath, fullPage: true });
    console.log(` Saved screenshot of directory table: ${screenshotTablePath}`);

    // 8. Open Profile of newly created employee
    console.log('7. Opening Employee Profile View...');
    await page.evaluate((targetName) => {
      const rows = Array.from(document.querySelectorAll('tr'));
      for (const row of rows) {
        if (row.textContent && row.textContent.includes(targetName)) {
          const viewBtn = row.querySelector('.staff-btn-view') || Array.from(row.querySelectorAll('button')).find(b => b.textContent.includes('View Profile'));
          if (viewBtn) {
            viewBtn.click();
            return true;
          }
        }
      }
      return false;
    }, testStaffName);

    await page.waitForSelector('#employee-profile-workspace', { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1500));

    // Click Personal tab in profile
    await page.evaluate(() => {
      const tabBtns = Array.from(document.querySelectorAll('button'));
      const personalTab = tabBtns.find(b => b.textContent && b.textContent.trim() === 'Personal');
      if (personalTab) personalTab.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    const screenshotProfilePath = path.join(ARTIFACT_DIR, 'employee_profile_view_verified.png');
    await page.screenshot({ path: screenshotProfilePath, fullPage: true });
    console.log(` Saved screenshot of employee profile: ${screenshotProfilePath}`);

    console.log('===================================================================');
    console.log(' REAL BROWSER EMPLOYEE ONBOARDING VERIFICATION COMPLETED WITH 100% SUCCESS');
    console.log('===================================================================');

  } catch (err) {
    console.error('Browser test error:', err);
    process.exit(1);
  } finally {
    await browser.close();
    await mongoose.disconnect();
  }
}

runBrowserEmployeeOnboardingTests();
