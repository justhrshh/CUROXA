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

async function captureReceptionistLabBooking() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const tenantId = 'city_hospital';
  const recStaffId = '9876543211';
  const recPassword = 'password123';

  // 1. Ensure test receptionist account exists
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(recPassword, salt);
  const recUser = await User.findOneAndUpdate(
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

  // 2. Configure affiliate labs for city_hospital
  const masterLabs = await LaboratoryMaster.find({ isActive: true }).sort({ name: 1 });
  if (masterLabs.length >= 2) {
    const apolloLab = masterLabs.find(l => l.name.includes('Apollo')) || masterLabs[0];
    const lalLab = masterLabs.find(l => l.name.includes('Lal')) || masterLabs[1];
    const metropolisLab = masterLabs.find(l => l.name.includes('Metropolis')) || (masterLabs[2] || masterLabs[0]);

    const affIds = [apolloLab._id, lalLab._id, metropolisLab._id];
    await HospitalAffiliateLabConfig.findOneAndUpdate(
      { tenantId },
      {
        tenantId,
        affiliateLabIds: affIds,
        defaultLabId: apolloLab._id,
        updatedByName: 'Administrator'
      },
      { upsert: true, returnDocument: 'after' }
    );
    console.log(`✓ Configured affiliate labs for ${tenantId}: Default Lab is ${apolloLab.name}`);
  }

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
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });

    // Type credentials using keyboard emulation
    await page.type('input[placeholder="Username"], input[type="text"]', recStaffId);
    await page.type('input[type="password"]', recPassword);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const loginBtn = btns.find(b => b.innerText && b.innerText.includes('Login'));
      if (loginBtn) loginBtn.click();
    });

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));

    console.log('Current URL after login:', page.url());

    // Click "Book Lab Test" button
    console.log('Clicking "Book Lab Test" button...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const labBtn = btns.find(b => b.textContent && b.textContent.includes('Book Lab Test'));
      if (labBtn) labBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Click "Select & Book →" or "+ Register New Walk-In Patient"
    console.log('Clicking "Select & Book →"...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const selectBtn = btns.find(b => b.textContent && b.textContent.includes('Select & Book'));
      if (selectBtn) {
        selectBtn.click();
      } else {
        const regBtn = btns.find(b => b.textContent && b.textContent.includes('Register New Walk-In Patient'));
        if (regBtn) regBtn.click();
      }
    });
    await new Promise(r => setTimeout(r, 2000));

    // Audit the Select Laboratory dropdown
    const labDropdownAudit = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const labSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('Apollo Diagnostics') || o.text.includes('Default Lab') || o.text.includes('PathLabs')));
      return {
        found: !!labSelect,
        selectedValue: labSelect ? labSelect.value : null,
        selectedText: labSelect ? labSelect.options[labSelect.selectedIndex]?.text : null,
        options: labSelect ? Array.from(labSelect.options).map(o => o.text) : []
      };
    });
    console.log('✓ Select Laboratory Audit:', JSON.stringify(labDropdownAudit, null, 2));

    // Focus on Search Test input and click the test
    console.log('Adding test item from diagnostic list...');
    await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const testInput = inputs.find(i => i.placeholder && i.placeholder.includes('Search diagnostic test'));
      if (testInput) {
        testInput.focus();
        testInput.click();
      }
    });
    await new Promise(r => setTimeout(r, 1000));

    // Click diagnostic test in the dropdown using physical mouse coordinates
    const clickedCoord = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span')).filter(s => s.textContent && s.textContent.includes('Glucan'));
      if (spans.length > 0) {
        const row = spans[0].closest('div');
        const rect = row.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      return null;
    });
    console.log('Test dropdown coordinates:', clickedCoord);
    if (clickedCoord) {
      await page.mouse.click(clickedCoord.x, clickedCoord.y);
    }
    await new Promise(r => setTimeout(r, 1500));

    // Capture screenshot of Receptionist Lab Booking Form with Default Lab preselected & test added
    const recLabImg = path.join(ARTIFACT_DIR, 'receptionist_lab_booking_workstation.png');
    await page.screenshot({ path: recLabImg });
    console.log(`✓ Receptionist Lab Booking Workstation screenshot saved: ${recLabImg}`);

    // Click "Cash" payment method
    console.log('Selecting Cash payment method...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cashBtn = btns.find(b => b.textContent && b.textContent.trim() === 'Cash');
      if (cashBtn) cashBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Click "Order Lab Tests & Settle" button
    console.log('Submitting lab test booking...');
    const submitted = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submitBtn = btns.find(b => b.textContent && (b.textContent.includes('Order Lab Tests & Settle') || b.textContent.includes('Save & Register Lab Patient')));
      if (submitBtn) {
        submitBtn.click();
        return true;
      }
      return false;
    });
    console.log('Clicked submit button:', submitted);
    await new Promise(r => setTimeout(r, 3500));

    // Check if StandardReceiptModal is displayed and capture screenshot
    const recSlipImg = path.join(ARTIFACT_DIR, 'receptionist_lab_booking_slip.png');
    await page.screenshot({ path: recSlipImg });
    console.log(`✓ Receptionist Lab Booking Slip screenshot saved: ${recSlipImg}`);

  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

captureReceptionistLabBooking().catch(err => {
  console.error(err);
  process.exit(1);
});
