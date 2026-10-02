const puppeteer = require('puppeteer-core');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { getJwtSecret } = require('../config/env');
const User = require('../models/User');

const ARTIFACT_DIR = path.resolve('C:/Users/lenovo/.gemini/antigravity/brain/26a07deb-37f0-458a-a80d-3712aa44d16b');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/clinical_management');
  const secret = getJwtSecret();

  const ishita = await User.findOne({ tenantId: 'med-clini-156', role: 'admin' });
  if (!ishita) {
    console.error('Ishita not found');
    process.exit(1);
  }

  const token = jwt.sign(
    {
      id: ishita._id,
      userId: ishita._id,
      staff_id: ishita.staff_id,
      role: 'admin',
      tenantId: 'med-clini-156'
    },
    secret,
    { expiresIn: '4h' }
  );

  const userPayload = {
    _id: ishita._id.toString(),
    id: ishita._id.toString(),
    name: ishita.name,
    email: ishita.email,
    role: 'admin',
    staff_id: ishita.staff_id,
    tenantId: 'med-clini-156',
    hospitalName: 'clinic-1'
  };

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
  await page.evaluate((tok, usr) => {
    localStorage.clear();
    localStorage.setItem('token', tok);
    localStorage.setItem('user', JSON.stringify(usr));
  }, token, userPayload);

  // Navigate directly to staff directory
  await page.goto('http://localhost:3000/admin/staff', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Click View Profile on Brosky
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const viewBtn = btns.find(b => b.innerText && b.innerText.trim() === 'View Profile');
    if (viewBtn) viewBtn.click();
  });

  await new Promise(r => setTimeout(r, 2000));

  // Click Leave & Balance tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const leaveTab = btns.find(b => b.innerText && b.innerText.includes('Leave & Balance'));
    if (leaveTab) leaveTab.click();
  });

  await new Promise(r => setTimeout(r, 1500));

  const shotPath = path.join(ARTIFACT_DIR, 'leave_and_balance_updated_design.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log('Saved screenshot to:', shotPath);

  await browser.close();
  await mongoose.disconnect();
}

run().catch(console.error);
