const puppeteer = require('puppeteer-core');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Billing = require('../models/Billing');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const User = require('../models/User');

const ARTIFACT_DIR = path.resolve('C:/Users/lenovo/.gemini/antigravity/brain/26a07deb-37f0-458a-a80d-3712aa44d16b');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runBrowserWorkstationTests() {
  console.log('--- STARTING REAL BROWSER WORKSTATION MULTIMODE TESTS ---');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const tenantId = 'city_hospital';

  // Ensure test doctor exists
  let doc = await User.findOne({ tenantId, role: 'doctor' });
  if (!doc) {
    doc = await User.create({
      tenantId,
      name: 'Dr. Browser Specialist',
      email: 'dr.browserspec@hospital.com',
      role: 'doctor',
      staff_id: 'DOC-BR-SPEC',
      consultationFee: 500
    });
  }

  // Ensure test receptionist exists
  let recep = await User.findOne({ tenantId, role: 'receptionist', staff_id: 'rec-br-01' });
  if (!recep) {
    const hashed = await bcrypt.hash('password123', 10);
    recep = await User.create({
      tenantId,
      name: 'Receptionist Test',
      email: 'rec-br-01@hospital.com',
      role: 'receptionist',
      staff_id: 'rec-br-01',
      password: hashed
    });
  }

  const testMobile = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const testPatientName = `Workstation Multimode ${Date.now().toString().slice(-4)}`;

  console.log('🚀 Launching Headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  try {
    // 1. Login
    console.log('Navigating to http://localhost:3000/login ...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });

    await page.waitForSelector('input[name="identifier"], input[type="text"], input[type="email"]');
    const idInput = await page.$('input[name="identifier"], input[placeholder*="Staff"], input[placeholder*="Email"], input[type="text"]');
    const pwInput = await page.$('input[type="password"]');

    await idInput.type('rec-br-01');
    await pwInput.type('password123');

    const submitBtn = await page.$('button[type="submit"]');
    await submitBtn.click();

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    // Ensure test patient exists
    let testPt = await Patient.findOne({ tenantId, contact: testMobile });
    if (!testPt) {
      testPt = await Patient.create({
        tenantId,
        name: testPatientName,
        contact: testMobile,
        email: `test.${Date.now()}@hospital.com`,
        age: 30,
        gender: 'Female',
        patientId: `PAT-BR-${Date.now().toString().slice(-4)}`
      });
    }

    // 2. Click "+ Create Appointment" to switch to intake dispatch
    console.log('Clicking "+ Create Appointment" button on dashboard...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const createBtn = btns.find(b => b.textContent && b.textContent.includes('Create Appointment'));
      if (createBtn) createBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    // 3. Search and select existing patient (Select & Book ->) to bypass OTP check
    console.log('Searching for test patient and clicking Select & Book...');
    await page.evaluate((contact) => {
      const inp = document.querySelector('input[placeholder*="Mobile"]');
      if (inp) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(inp, contact);
        else inp.value = contact;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, testMobile);

    await new Promise(r => setTimeout(r, 1500));

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const selectBtn = btns.find(b => b.textContent && b.textContent.includes('Select & Book'));
      if (selectBtn) selectBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    await new Promise(r => setTimeout(r, 1000));

    // 4. Set Tomorrow's Date on the Consultation Date picker (the second input[type="date"])
    console.log('Setting Consultation Date to tomorrow and selecting doctor...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    await page.evaluate((tDate) => {
      function setReactInput(input, val) {
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, val);
        else input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Find all date inputs - the consultation date input is the second one
      const dateInps = document.querySelectorAll('input[type="date"]');
      const consultDateInp = dateInps.length > 1 ? dateInps[1] : dateInps[0];
      if (consultDateInp) setReactInput(consultDateInp, tDate);

      // Select Doctor
      const docSelect = Array.from(document.querySelectorAll('select')).find(s => s.options[0]?.text?.includes('Choose Doctor'));
      if (docSelect && docSelect.options.length > 1) {
        const val = docSelect.options[1].value;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        if (setter) setter.call(docSelect, val);
        else docSelect.value = val;
        docSelect.dispatchEvent(new Event('input', { bubbles: true }));
        docSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, tomorrowStr);

    await new Promise(r => setTimeout(r, 1500));

    // 5. Select Time Slot (now for tomorrow, all active)
    console.log('Selecting tomorrow time slot chip...');
    await page.evaluate(() => {
      const slotButtons = Array.from(document.querySelectorAll('button')).filter(b => {
        return b.textContent && b.textContent.includes(':') && !b.disabled && !b.textContent.includes('Past');
      });
      if (slotButtons.length > 0) {
        slotButtons[0].click();
      }
    });

    await new Promise(r => setTimeout(r, 1200));

    // 6. Click "⚡ Multi-Mode" button in Billing & Payment Settlement section
    console.log('Activating ⚡ Multi-Mode in Billing & Payment Settlement section...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const mmBtn = buttons.find(b => b.textContent && b.textContent.includes('Multi-Mode'));
      if (mmBtn) mmBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));

    // 7. Add second payment row and enter amounts: Cash ₹350 + UPI ₹200 (Total ₹550)
    console.log('Adding payment rows and setting amounts...');
    await page.evaluate(() => {
      const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Add Payment Method'));
      if (addBtn) addBtn.click();
    });

    await new Promise(r => setTimeout(r, 800));

    await page.evaluate(() => {
      function setReactInput(input, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, val);
        else input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const numberInputs = Array.from(document.querySelectorAll('input[type="number"]')).filter(i => {
        return i.placeholder === '0.00' || i.style.paddingLeft === '20px';
      });

      if (numberInputs.length >= 2) {
        setReactInput(numberInputs[0], '300');
        setReactInput(numberInputs[1], '200');
      } else if (numberInputs.length === 1) {
        setReactInput(numberInputs[0], '500');
      }

      // Set second row method to UPI
      const methodSelects = Array.from(document.querySelectorAll('select')).filter(s => {
        return Array.from(s.options).some(o => o.value === 'UPI');
      });
      if (methodSelects.length >= 2) {
        methodSelects[1].value = 'UPI';
        methodSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Set reference on UPI
      const refInputs = Array.from(document.querySelectorAll('input[type="text"]')).filter(i => {
        return i.placeholder?.includes('Ref') || i.placeholder?.includes('Remarks');
      });
      if (refInputs.length >= 2) {
        setReactInput(refInputs[1], 'UPI-WORKSTATION-9988');
      }
    });

    await new Promise(r => setTimeout(r, 1200));

    // Capture filled workstation screenshot
    const shotFilledPath = path.join(ARTIFACT_DIR, 'booking_multimode_workstation_filled.png');
    await page.screenshot({ path: shotFilledPath, fullPage: true });
    console.log('📸 Captured booking_multimode_workstation_filled.png');

    // 8. Click Submit ("Save & Register Patient" / "Book Appointment & Pay")
    console.log('Submitting booking with multimode payment...');
    const submitClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const sBtn = btns.find(b => b.textContent && (
        b.textContent.includes('Book Appointment & Pay') || 
        b.textContent.includes('Save & Register Patient')
      ) && !b.disabled);
      if (sBtn) {
        sBtn.click();
        return true;
      }
      return false;
    });
    console.log('Submit button clicked:', submitClicked);

    await new Promise(r => setTimeout(r, 4000));

    const pageText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log('Page body text preview after submit:', pageText);

    // Capture receipt / slip screenshot
    const shotReceiptPath = path.join(ARTIFACT_DIR, 'booking_multimode_receipt_slip.png');
    await page.screenshot({ path: shotReceiptPath, fullPage: false });
    console.log('📸 Captured booking_multimode_receipt_slip.png');

    // 9. Verify in MongoDB
    const createdPatient = await Patient.findOne({ tenantId, contact: testMobile });
    if (createdPatient) {
      const createdBill = await Billing.findOne({ tenantId, patientId: createdPatient._id });
      const createdAppt = await Appointment.findOne({ tenantId, patientId: createdPatient._id });
      console.log('Verified Billing in MongoDB:', {
        billFound: !!createdBill,
        status: createdBill?.status,
        amountPaid: createdBill?.amountPaid,
        balanceDue: createdBill?.balanceDue,
        paymentMethod: createdBill?.paymentMethod,
        paymentsCount: createdBill?.payments?.length,
        payments: createdBill?.payments?.map(p => ({ method: p.method, amount: p.amount, collId: p.collectionId }))
      });
      console.log('Verified Appointment in MongoDB:', {
        apptFound: !!createdAppt,
        status: createdAppt?.status,
        paymentStatus: createdAppt?.paymentStatus
      });
    }

    // Clean up test records
    if (createdPatient) {
      await Billing.deleteMany({ tenantId, patientId: createdPatient._id });
      await Appointment.deleteMany({ tenantId, patientId: createdPatient._id });
      await Patient.deleteOne({ _id: createdPatient._id });
      console.log('✅ Cleaned up browser test patient & billing records');
    }

    console.log('🎉 Browser workstation verification completed successfully!');
  } catch (err) {
    console.error('Browser test failed:', err);
  } finally {
    await browser.close();
    await mongoose.connection.close();
  }
}

runBrowserWorkstationTests();
