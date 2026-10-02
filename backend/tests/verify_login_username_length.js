const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function verify() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    defaultViewport: { width: 1200, height: 800 }
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });

  // Clear localStorage so we see login form cleanly
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });

  // Find the username input
  const usernameInput = await page.$('input[placeholder="Username"]');
  if (!usernameInput) {
    console.error('Username input not found!');
    process.exit(1);
  }

  // Type 15 digits
  await usernameInput.type('999999999999999');
  const val = await page.evaluate(el => el.value, usernameInput);
  console.log('Typed: 999999999999999 (15 chars) -> Actual input value:', val, 'Length:', val.length);

  const shotPath = 'C:\\Users\\lenovo\\.gemini\\antigravity\\brain\\26a07deb-37f0-458a-a80d-3712aa44d16b\\login_username_max_10_chars.png';
  await page.screenshot({ path: shotPath });
  console.log('Saved screenshot to:', shotPath);

  await browser.close();
  if (val.length === 10) {
    console.log('SUCCESS: Input is strictly restricted to 10 characters!');
  } else {
    console.error('FAILURE: Input length is ' + val.length);
    process.exit(1);
  }
}
verify().catch(console.error);
