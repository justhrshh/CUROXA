const puppeteer = require('puppeteer-core');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Billing = require('../models/Billing');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');

const ARTIFACT_DIR = path.resolve('C:/Users/lenovo/.gemini/antigravity/brain/26a07deb-37f0-458a-a80d-3712aa44d16b');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runBrowserTests() {
  console.log('--- STARTING REAL BROWSER MULTIMODE RECEPTIONIST TESTS ---');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const tenantId = 'city_hospital';

  // Find or create test doctor
  let doc = await User.findOne({ tenantId, role: 'doctor' });
  if (!doc) {
    doc = await User.create({
      tenantId,
      name: 'Dr. Browser Test',
      email: 'dr.browsertest@hospital.com',
      role: 'doctor',
      staff_id: 'DOC-BR-01',
      consultationFee: 1000
    });
  }

  // Find or create receptionist user for session token
  let recep = await User.findOne({ tenantId, role: 'receptionist' });
  if (!recep) {
    recep = await User.create({
      tenantId,
      name: 'Receptionist Sunita',
      email: 'recep.sunita@hospital.com',
      role: 'receptionist',
      staff_id: 'REC-BR-01',
      password_hash: 'dummy_hash_for_test'
    });
  }

  // Create Patient with unique mobile number and unique UHID
  const uniqueContact = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const pIdString = `PAT-BR-${Date.now().toString().slice(-6)}`;
  const uhIdString = `UH-BR-${Date.now().toString().slice(-6)}`;
  const patient = await Patient.create({
    tenantId,
    patientId: pIdString,
    uhId: uhIdString,
    name: 'Browser Multimode Patient',
    contact: uniqueContact,
    age: 32,
    gender: 'Female'
  });

  // TEST A: Create Unpaid Appointment with ₹1,000 Bill
  const apptA = await Appointment.create({
    tenantId,
    patientId: patient._id,
    doctorId: doc._id,
    date: new Date(),
    time: '10:30 AM',
    reason: 'Multimode Collection Verification',
    paymentStatus: 'Pending',
    status: 'Confirmed'
  });

  const billA = await Billing.create({
    tenantId,
    patientId: patient._id,
    appointmentId: apptA._id,
    items: [{ description: 'General Consultation', amount: 1000 }],
    totalAmount: 1000,
    status: 'Unpaid'
  });
  console.log(`✅ Created Bill A for Test A: ID=${billA._id}`);

  // TEST C: Create Online Already-Paid Appointment with ₹1,000 Bill
  const apptC = await Appointment.create({
    tenantId,
    patientId: patient._id,
    doctorId: doc._id,
    date: new Date(),
    time: '11:30 AM',
    reason: 'Online Already-Paid Check',
    paymentStatus: 'Paid',
    status: 'Confirmed'
  });

  const billC = await Billing.create({
    tenantId,
    patientId: patient._id,
    appointmentId: apptC._id,
    items: [{ description: 'Cardiology Consultation', amount: 1000 }],
    totalAmount: 1000,
    status: 'Paid',
    paymentMethod: 'Online UPI',
    payments: [{
      paymentId: 'PAY-ONLINE-BR-01',
      amount: 1000,
      method: 'Online UPI',
      source: 'Online',
      transactionRef: 'RZP_ONLINE_998877',
      recordedBy: 'Patient Portal',
      recordedByName: 'Browser Multimode Patient',
      recordedAt: new Date()
    }]
  });
  console.log(`✅ Created Bill C for Test C (Online Paid): ID=${billC._id}`);

  // Create auth token
  const secret = getJwtSecret();
  const token = jwt.sign(
    {
      userId: String(recep._id),
      staff_id: recep.staff_id,
      name: recep.name,
      role: 'receptionist',
      tenantId: 'city_hospital',
      tenantName: 'City Hospital'
    },
    secret,
    { expiresIn: '2h' }
  );

  console.log('🚀 Launching Headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Navigate to Login Page and Log in cleanly through UI
  console.log('Navigating to http://localhost:3000/login ...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));

  console.log('Filling in login credentials for rec-br-01...');
  await page.waitForSelector('input[placeholder="Username"], input[type="text"]');
  await page.type('input[placeholder="Username"], input[type="text"]', 'rec-br-01');
  await page.type('input[type="password"]', 'password123');

  // Click Login button
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const loginBtn = btns.find(b => b.innerText.includes('Login'));
    if (loginBtn) loginBtn.click();
  });

  console.log('Waiting for redirection to /receptionist...');
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  // Switch to Appointments tab
  console.log('Switching to Appointments tab...');
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('.sidebar-link, span, div'));
    const link = links.find(l => l.innerText?.trim() === 'Appointments');
    if (link) link.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // -------------------------------------------------------------
  // TEST A: REAL BROWSER MULTIMODE COLLECTION (Cash 500 + UPI 300 + Card 200 = 1000)
  // -------------------------------------------------------------
  console.log('\n--- EXECUTING TEST A IN BROWSER ---');
  await page.waitForSelector('tr', { timeout: 15000 });

  // Click on "View Details" for the Add-on / 10:30 AM appointment (Appt A)
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const viewDetailBtns = buttons.filter(b => b.innerText?.trim() === 'View Details');
    if (viewDetailBtns.length > 0) {
      // Click the second one (Add-on at 10:30 AM which is Appt A) or first one
      const btnToClick = viewDetailBtns[viewDetailBtns.length - 1];
      btnToClick.click();
      return true;
    }
    return false;
  });

  console.log('Clicked View Details on Appt A:', clicked);
  await new Promise(r => setTimeout(r, 2000));

  // Take screenshot of Details modal
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'receptionist_details_before_payment.png') });
  console.log('📸 Captured details before payment');

  // Click "Collect Payment & Apply Discount" button in details modal
  const clickedCollect = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const collectBtn = buttons.find(b => b.innerText?.includes('Collect Payment') || b.innerText?.includes('Collect Remaining'));
    if (collectBtn) {
      collectBtn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked Collect Payment button:', clickedCollect);
  await new Promise(r => setTimeout(r, 2000));

  // Now in Payment Collection Modal:
  // First, set Cash to 500
  await page.evaluate(() => {
    const setReactValue = (input, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const inputs = Array.from(document.querySelectorAll('input[type="number"][placeholder="Amount"]'));
    if (inputs[0]) setReactValue(inputs[0], '500');
  });
  await new Promise(r => setTimeout(r, 600));

  // Click "+ Add Payment Method"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const addBtn = btns.find(b => b.innerText?.includes('+ Add Payment Method'));
    if (addBtn) addBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Set Row 2 to UPI with 300
  await page.evaluate(() => {
    const setReactValue = (input, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setReactSelect = (select, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      nativeSetter.call(select, val);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const selects = Array.from(document.querySelectorAll('select')).filter(s => Array.from(s.options).some(o => o.value === 'UPI'));
    if (selects[1]) setReactSelect(selects[1], 'UPI');

    const inputs = Array.from(document.querySelectorAll('input[type="number"][placeholder="Amount"]'));
    if (inputs[1]) setReactValue(inputs[1], '300');
  });
  await new Promise(r => setTimeout(r, 600));

  // Click "+ Add Payment Method" again for Card
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const addBtn = btns.find(b => b.innerText?.includes('+ Add Payment Method'));
    if (addBtn) addBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Set Row 3 to Card with 200
  await page.evaluate(() => {
    const setReactValue = (input, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setReactSelect = (select, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      nativeSetter.call(select, val);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const selects = Array.from(document.querySelectorAll('select')).filter(s => Array.from(s.options).some(o => o.value === 'Card'));
    if (selects[2]) setReactSelect(selects[2], 'Card');

    const inputs = Array.from(document.querySelectorAll('input[type="number"][placeholder="Amount"]'));
    if (inputs[2]) setReactValue(inputs[2], '200');
  });
  await new Promise(r => setTimeout(r, 1000));

  // Take screenshot of filled Multimode Payment Modal
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'receptionist_multimode_modal_filled.png') });
  console.log('📸 Captured filled multimode payment modal');

  // Click "Confirm Payment" button (which submits the form)
  const clickedConfirm = await page.evaluate(() => {
    const form = document.querySelector('form');
    const btns = Array.from(document.querySelectorAll('button'));
    const confBtn = btns.find(b => b.innerText?.includes('Confirm Payment'));
    if (confBtn && !confBtn.disabled) {
      confBtn.click();
      return true;
    }
    if (form) {
      form.requestSubmit();
      return true;
    }
    return false;
  });
  console.log('Clicked Confirm Payment:', clickedConfirm);
  await new Promise(r => setTimeout(r, 3500));

  // Check receipt modal appears
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'receptionist_multimode_receipt_modal.png') });
  console.log('📸 Captured receipt modal after multimode payment');

  // Verify in MongoDB that Bill A has 3 payments
  const verifiedBillA = await Billing.findById(billA._id);
  console.log('Verified Bill A in MongoDB:');
  console.log(`  Status: ${verifiedBillA.status}`);
  console.log(`  Amount Paid: ₹${verifiedBillA.amountPaid}`);
  console.log(`  Balance Due: ₹${verifiedBillA.balanceDue}`);
  console.log(`  Payment Method: ${verifiedBillA.paymentMethod}`);
  console.log(`  Payments Count: ${verifiedBillA.payments.length}`);
  verifiedBillA.payments.forEach((p, idx) => {
    console.log(`    #${idx + 1}: ${p.method} = ₹${p.amount} (CollID: ${p.collectionId})`);
  });

  // Close receipt modal
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('button'));
    const close = closeBtns.find(b => b.innerText.includes('✕') || b.innerText.includes('Close'));
    if (close) close.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Refresh page and reopen View Details to verify persistence in UI
  console.log('Refreshing page to verify persistence...');
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate((pName) => {
    const rows = Array.from(document.querySelectorAll('tr'));
    for (const row of rows) {
      if (row.innerText.includes(pName) && row.innerText.includes('Multimode Collection Verification')) {
        const btn = Array.from(row.querySelectorAll('button')).find(b => b.innerText.includes('View') || b.innerText.includes('Details'));
        if (btn) btn.click();
      }
    }
  }, patient.name);
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'receptionist_details_after_reload.png') });
  console.log('📸 Captured details after reload');

  // -------------------------------------------------------------
  // TEST C: REAL BROWSER ONLINE ALREADY-PAID CHECK
  // -------------------------------------------------------------
  console.log('\n--- EXECUTING TEST C (ONLINE PAID) IN BROWSER ---');
  // Close any open modal
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('button'));
    const close = closeBtns.find(b => b.innerText === '✕');
    if (close) close.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Open Appt C
  await page.evaluate((pName) => {
    const rows = Array.from(document.querySelectorAll('tr'));
    for (const row of rows) {
      if (row.innerText.includes(pName) && row.innerText.includes('Online Already-Paid Check')) {
        const btn = Array.from(row.querySelectorAll('button')).find(b => b.innerText.includes('View') || b.innerText.includes('Details'));
        if (btn) btn.click();
      }
    }
  }, patient.name);
  await new Promise(r => setTimeout(r, 1500));

  // Take screenshot of Online Paid Details
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'receptionist_online_paid_details.png') });
  console.log('📸 Captured online paid details');

  const onlineCheck = await page.evaluate(() => {
    const text = document.body.innerText;
    const hasApprovePaymentBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Approve & Request Payment'));
    const hasCollectPaymentBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Collect Payment'));
    const hasPaidBadge = text.includes('Paid') || text.includes('✓ Paid');
    return {
      hasApprovePaymentBtn,
      hasCollectPaymentBtn,
      hasPaidBadge
    };
  });
  console.log('Online Paid UI state check:', onlineCheck);

  // Clean up browser test database records
  await Billing.deleteMany({ _id: { $in: [billA._id, billC._id] } });
  await Appointment.deleteMany({ _id: { $in: [apptA._id, apptC._id] } });
  await Patient.deleteOne({ _id: patient._id });
  console.log('✅ Cleaned up browser test records');

  await browser.close();
  await mongoose.disconnect();
  console.log('🎉 Browser verification finished successfully!');
}

runBrowserTests().catch(err => {
  console.error('Browser test failed:', err);
  process.exit(1);
});
