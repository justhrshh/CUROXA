const puppeteer = require('puppeteer-core');
const jwt = require('jsonwebtoken');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { getJwtSecret } = require('../config/env');
const GlobalVendor = require('../models/GlobalVendor');
const HospitalVendorAssociation = require('../models/HospitalVendorAssociation');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const ItemMaster = require('../models/ItemMaster');
const VendorQuotation = require('../models/VendorQuotation');

const ARTIFACT_DIR = path.resolve('C:/Users/lenovo/.gemini/antigravity/brain/26a07deb-37f0-458a-a80d-3712aa44d16b');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function seedDataForTenant(tenantId) {
  // Ensure active associated vendors for this tenant
  let gv1 = await GlobalVendor.findOne({ supplierCode: 'GV-DEMO-01' });
  if (!gv1) {
    gv1 = await GlobalVendor.create({
      supplierName: 'Apex Health Solutions Ltd',
      supplierCode: 'GV-DEMO-01',
      activeStatus: 'Yes',
      supplierType: 'Pharma Manufacturer',
      supplierCategory: 'Medicines',
      gstNo: '27AABCA1234F1Z9',
      addressLine1: 'Plot 45, Udyog Vihar Phase 4',
      city: 'Gurugram',
      state: 'Haryana',
      primaryContactPerson: 'Rajesh Verma',
      primaryContactPersonMobileNo: '9876543210'
    });
  }

  let gv2 = await GlobalVendor.findOne({ supplierCode: 'GV-DEMO-02' });
  if (!gv2) {
    gv2 = await GlobalVendor.create({
      supplierName: 'Global Biocare Distributors',
      supplierCode: 'GV-DEMO-02',
      activeStatus: 'Yes',
      supplierType: 'Distributor',
      supplierCategory: 'Consumables',
      gstNo: '27BBCDA5678G2Z1',
      addressLine1: 'SCO 12, Sector 14',
      city: 'Gurugram',
      state: 'Haryana',
      primaryContactPerson: 'Sunil Sharma',
      primaryContactPersonMobileNo: '9812345678'
    });
  }

  // Ensure associations exist
  await HospitalVendorAssociation.findOneAndUpdate(
    { tenantId, vendorId: gv1._id },
    { tenantId, vendorId: gv1._id, status: 'ACTIVE' },
    { upsert: true }
  );

  await HospitalVendorAssociation.findOneAndUpdate(
    { tenantId, vendorId: gv2._id },
    { tenantId, vendorId: gv2._id, status: 'ACTIVE' },
    { upsert: true }
  );

  // Ensure items in ItemMaster & HospitalMasterConfig
  let item1 = await ItemMaster.findOne({ genericName: 'Paracetamol 650mg' });
  if (!item1) {
    item1 = await ItemMaster.create({
      itemCode: 'PAR-650',
      genericName: 'Paracetamol 650mg',
      brandName: 'Dolo 650',
      manufacturer: 'Micro Labs',
      purchasedUnit: 'Box',
      consumptionUnit: 'Tablet',
      converterFactor: 100,
      packSizeDescription: '1 Box = 10 Strips x 10 Tablets',
      defaultGst: 12,
      scope: 'GLOBAL',
      status: 'Active'
    });
  }

  let item2 = await ItemMaster.findOne({ genericName: 'Amoxicillin & Clavulanate 625mg' });
  if (!item2) {
    item2 = await ItemMaster.create({
      itemCode: 'AMX-625',
      genericName: 'Amoxicillin & Clavulanate 625mg',
      brandName: 'Augmentin 625',
      manufacturer: 'GSK',
      purchasedUnit: 'Box',
      consumptionUnit: 'Tablet',
      converterFactor: 60,
      packSizeDescription: '1 Box = 6 Strips x 10 Tablets',
      defaultGst: 12,
      scope: 'GLOBAL',
      status: 'Active'
    });
  }

  await HospitalMasterConfig.findOneAndUpdate(
    { tenantId, masterItemId: item1._id },
    {
      tenantId,
      masterItemId: item1._id,
      itemCode: item1.itemCode,
      category: 'Pharmacy',
      department: 'Pharmacy',
      status: 'Active',
      hospitalCost: 1800,
      mrp: 2400
    },
    { upsert: true }
  );

  await HospitalMasterConfig.findOneAndUpdate(
    { tenantId, masterItemId: item2._id },
    {
      tenantId,
      masterItemId: item2._id,
      itemCode: item2.itemCode,
      category: 'Pharmacy',
      department: 'Pharmacy',
      status: 'Active',
      hospitalCost: 1400,
      mrp: 2100
    },
    { upsert: true }
  );

  // Seed sample quotations
  const existingQuote = await VendorQuotation.findOne({ tenantId, itemMasterId: item1._id });
  if (!existingQuote) {
    await VendorQuotation.create({
      tenantId,
      quotationNo: 'VQ-2026-0001',
      referenceNo: 'TND-REF-091',
      vendorId: gv1._id,
      vendorName: gv1.supplierName,
      vendorCode: gv1.supplierCode,
      itemMasterId: item1._id,
      itemCode: item1.itemCode,
      genericName: item1.genericName,
      brandName: item1.brandName,
      purchasedUnit: 'Box',
      consumptionUnit: 'Tablet',
      converterFactor: 100,
      packSize: '1 Box = 10 Strips x 10 Tablets',
      ratePerPurchasedUnit: 1800,
      discountPercent: 5,
      gstPercent: 12,
      netRatePerPurchasedUnit: 1915.2,
      ratePerConsumptionUnit: 18.00,
      netEffectiveRate: 19.152,
      minimumOrderQty: 5,
      leadTimeDays: 2,
      validTill: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      status: 'Active'
    });
  }
}

async function captureVendorQuotationScreenshots() {
  console.log('Connecting to Mongo to seed test vendor quotation demo data...');
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/curoxa';
  await mongoose.connect(mongoUri);

  await seedDataForTenant('HSP-L11PI7');
  await seedDataForTenant('med-harsh-743');
  console.log('Seed demo data ready for HSP-L11PI7 and med-harsh-743');

  let secret;
  try {
    secret = getJwtSecret();
  } catch (e) {
    secret = process.env.JWT_SECRET || 'secret_key';
  }

  const hospitalUser = {
    id: '6a9ba8cfa09625c03036cb55',
    email: 'admin@hospital.com',
    role: 'admin',
    name: 'Hospital Admin',
    tenantId: 'HSP-L11PI7'
  };

  const hospitalToken = jwt.sign(
    {
      id: hospitalUser.id,
      userId: hospitalUser.id,
      email: hospitalUser.email,
      role: hospitalUser.role,
      name: hospitalUser.name,
      tenantId: 'HSP-L11PI7'
    },
    secret,
    { expiresIn: '2h' }
  );

  console.log('Launching Chrome for Puppeteer screenshots...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  try {
    // 1. Navigate to /vendor-master first to establish domain context
    console.log('Navigating to http://localhost:3000/vendor-master to set domain context...');
    await page.goto('http://localhost:3000/vendor-master', { waitUntil: 'domcontentloaded' });

    await page.evaluate((token, userJson) => {
      localStorage.setItem('token', token);
      localStorage.setItem('tenantId', 'HSP-L11PI7');
      localStorage.setItem('user', userJson);
      localStorage.setItem('tenantModules', JSON.stringify({
        inventory: { enabled: true },
        pharmacy: { enabled: true }
      }));
    }, hospitalToken, JSON.stringify(hospitalUser));

    console.log('Navigating to http://localhost:3000/procurement...');
    await page.goto('http://localhost:3000/procurement', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));

    // Click on "Vendor Quotations" tab
    console.log('Switching to Vendor Quotations tab...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="tab"], .proc-sidebar-item'));
      const qTab = buttons.find(b => b.textContent && b.textContent.includes('Vendor Quotations'));
      if (qTab) {
        qTab.click();
      }
    });

    await new Promise(r => setTimeout(r, 1500));

    // Capture 1: Vendor Quotations Table (List View)
    const tableShotPath = path.join(ARTIFACT_DIR, 'vendor_quotations_list.png');
    await page.screenshot({ path: tableShotPath, fullPage: false });
    console.log('Saved screenshot 1 (List View):', tableShotPath);

    // Click on "+ Add Quotation / Rate" button to open IN-PAGE Supplier Quotation Form
    console.log('Opening In-Page Supplier Quotation Form...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const addBtn = buttons.find(b => b.textContent && b.textContent.includes('Add Quotation'));
      if (addBtn) addBtn.click();
    });

    await new Promise(r => setTimeout(r, 1200));

    // Capture 2: In-Page Supplier Quotation Form (Full view without popups)
    const formShotPath = path.join(ARTIFACT_DIR, 'supplier_quotation_inpage_form.png');
    await page.screenshot({ path: formShotPath, fullPage: true });
    console.log('Saved screenshot 2 (In-Page Form):', formShotPath);

    // Type into item search input to show hospital selected catalog dropdown
    console.log('Typing in item search to show hospital catalog dropdown...');
    const searchInput = await page.$('input[placeholder*="Type to search hospital item"]');
    if (searchInput) {
      await searchInput.type('Para');
      await new Promise(r => setTimeout(r, 800));

      // Capture 3: Search results dropdown
      const searchShotPath = path.join(ARTIFACT_DIR, 'supplier_quotation_inpage_search.png');
      await page.screenshot({ path: searchShotPath, fullPage: false });
      console.log('Saved screenshot 3 (Search Dropdown):', searchShotPath);

      // Click the first dropdown item specifically
      await page.evaluate(() => {
        const dropdown = document.querySelector('div[style*="max-height: 220px"]');
        if (dropdown && dropdown.firstElementChild) {
          dropdown.firstElementChild.click();
        }
      });

      await new Promise(r => setTimeout(r, 600));

      // Click "Add" button in Section 2 (Item Detail)
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const addBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'Add');
        if (addBtn) addBtn.click();
      });

      await new Promise(r => setTimeout(r, 600));

      // Add a term in Section 4 (Terms & Conditions)
      const termInput = await page.$('input[placeholder*="Enter term"]');
      if (termInput) {
        await termInput.type('Standard payment terms: 30 days net from invoice date. F.O.R Gurugram Central Store.');
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const termAddBtns = buttons.filter(b => b.textContent && b.textContent.trim() === 'Add');
          if (termAddBtns.length > 1) {
            termAddBtns[1].click();
          }
        });
      }

      await new Promise(r => setTimeout(r, 800));

      // Capture 4: In-page form with added items and terms
      const addedItemsShotPath = path.join(ARTIFACT_DIR, 'supplier_quotation_inpage_added_items.png');
      await page.screenshot({ path: addedItemsShotPath, fullPage: true });
      console.log('Saved screenshot 4 (Added Items Grid):', addedItemsShotPath);
    }

  } catch (err) {
    console.error('Puppeteer screenshot error:', err);
  } finally {
    await browser.close();
    await mongoose.disconnect();
    console.log('Puppeteer finished successfully.');
  }
}

captureVendorQuotationScreenshots();
