/**
 * QUROXA — High-Performance Bulk Migration:
 * LabTest Catalog to Global ItemMaster & HospitalMasterConfig
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const LabTest = require('../models/LabTest');

const DEPARTMENT_MAP = {
  'HAEMATOLOGY': 'Hematology',
  'HEMATOLOGY': 'Hematology',
  'CLINICAL BIOCHEMISTRY AND IMMUNOCHEMISTRY': 'Biochemistry',
  'BIOCHEMISTRY': 'Biochemistry',
  'SPECIAL BIOCHEMISTRY': 'Special Biochemistry',
  'SEROLOGY': 'Serology',
  'HISTOPATHOLOGY': 'Histopathology',
  'MICROBIOLOGY': 'Microbiology',
  'CLINICAL PATHOLOGY': 'Clinical Pathology',
  'CLINICAL PATHOLOGY-II': 'Clinical Pathology',
  'CYTOLOGY': 'Cytology',
  'IMMUNOHISTOCHEMISTRY': 'Immunohistochemistry',
  'IMMUNOLOGY': 'Immunology',
  'FLOWCYTOMETRY': 'Flowcytometry',
  'MOLECULAR BIOLOGY': 'Molecular Biology',
  'GENERAL': 'Miscellaneous',
  'MISCELLANEOUS': 'Miscellaneous'
};

function mapDepartment(rawCategory) {
  if (!rawCategory) return 'Miscellaneous';
  const upper = rawCategory.trim().toUpperCase();
  if (DEPARTMENT_MAP[upper]) return DEPARTMENT_MAP[upper];
  for (const [key, val] of Object.entries(DEPARTMENT_MAP)) {
    if (upper.includes(key)) return val;
  }
  return 'Miscellaneous';
}

function normalize(str) {
  return (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function migrate() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/clinical_management';
  console.log('Connecting to MongoDB at:', uri);
  await mongoose.connect(uri);

  console.log('\n--- PHASE 1: PREPARING CANONICAL DEFINITIONS ---');
  const standardTests = require('../config/laboratory_master.json');
  console.log(`Loaded ${standardTests.length} tests from laboratory_master.json`);

  const canonicalDefinitions = new Map();

  for (const t of standardTests) {
    const code = (t.testCode || '').trim().toUpperCase();
    if (!code) continue;
    canonicalDefinitions.set(code, {
      testCode: code,
      testName: (t.testName || '').trim(),
      category: t.category,
      sampleType: t.sampleType || 'Blood',
      turnaroundTime: t.turnaroundTime || '24 Hours',
      normalRange: t.normalRange || '',
      unit: t.unit || '',
      description: t.description || '',
      price: t.price || 0
    });
  }

  // Also query distinct testCodes from DB to catch any custom ones
  const dbDistinctTests = await LabTest.find({}, 'tenantId testCode testName category sampleType turnaroundTime normalRange unit description price isActive').lean();
  console.log(`Loaded ${dbDistinctTests.length} LabTest records from DB`);

  for (const t of dbDistinctTests) {
    const code = (t.testCode || '').trim().toUpperCase();
    if (!code) continue;
    if (!canonicalDefinitions.has(code)) {
      canonicalDefinitions.set(code, {
        testCode: code,
        testName: (t.testName || '').trim(),
        category: t.category,
        sampleType: t.sampleType || 'Blood',
        turnaroundTime: t.turnaroundTime || '24 Hours',
        normalRange: t.normalRange || '',
        unit: t.unit || '',
        description: t.description || '',
        price: t.price || 0
      });
    }
  }

  console.log(`Total unique canonical tests to ensure in ItemMaster: ${canonicalDefinitions.size}`);

  // Fetch all existing Global ItemMaster items in Lab Operation
  const existingGlobalItems = await ItemMaster.find({
    scope: 'GLOBAL',
    $or: [{ category: 'Lab Operation' }, { categoryType: 'Lab Operation' }]
  }).lean();

  const codeMap = new Map();
  const nameMap = new Map();
  existingGlobalItems.forEach(item => {
    if (item.itemCode) codeMap.set(item.itemCode.toUpperCase(), item);
    if (item.itemName) nameMap.set(normalize(item.itemName), item);
  });

  const itemsToInsert = [];
  for (const def of canonicalDefinitions.values()) {
    const existing = codeMap.get(def.testCode) || nameMap.get(normalize(def.testName));
    if (!existing) {
      const targetDept = mapDepartment(def.category);
      itemsToInsert.push({
        scope: 'GLOBAL',
        tenantId: '__global__',
        itemCode: def.testCode,
        itemName: def.testName,
        genericName: def.testName,
        brandName: def.testName,
        category: 'Lab Operation',
        categoryType: 'Lab Operation',
        department: targetDept,
        departmentType: targetDept,
        itemType: 'Reagent',
        sampleType: def.sampleType || 'Blood',
        itemDescription: def.description || `${def.testName} (${targetDept})`,
        categoryData: {
          sampleType: def.sampleType || 'Blood',
          turnaroundTime: def.turnaroundTime || '24 Hours',
          normalRange: def.normalRange || '',
          unit: def.unit || '',
          originalTestCode: def.testCode
        },
        status: 'Active',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }

  if (itemsToInsert.length > 0) {
    console.log(`Inserting ${itemsToInsert.length} new canonical items into ItemMaster...`);
    // Insert in batches of 500
    for (let i = 0; i < itemsToInsert.length; i += 500) {
      const batch = itemsToInsert.slice(i, i + 500);
      await ItemMaster.insertMany(batch, { ordered: false });
    }
    console.log(`✓ Inserted ${itemsToInsert.length} canonical items.`);
  } else {
    console.log('All canonical items already present in ItemMaster.');
  }

  // Refresh codeMap with all Global Lab Operation items
  const allGlobalItems = await ItemMaster.find({
    scope: 'GLOBAL',
    $or: [{ category: 'Lab Operation' }, { categoryType: 'Lab Operation' }]
  }).lean();
  allGlobalItems.forEach(item => {
    if (item.itemCode) codeMap.set(item.itemCode.toUpperCase(), item);
    if (item.itemName) nameMap.set(normalize(item.itemName), item);
  });

  console.log(`\n--- PHASE 2: ENSURING HOSPITAL CONFIGS (BULK) ---`);
  // Fetch existing HospitalMasterConfig for Lab Operation
  const existingConfigs = await HospitalMasterConfig.find({ category: 'Lab Operation' }, 'tenantId masterItemId').lean();
  const existingConfigSet = new Set(existingConfigs.map(c => `${c.tenantId}:::${c.masterItemId.toString()}`));
  console.log(`Existing HospitalMasterConfig entries for Lab Operation: ${existingConfigs.length}`);

  // Group DB tests by tenantId and code
  const configsToInsert = [];
  const processedKeys = new Set();

  for (const t of dbDistinctTests) {
    const tenantId = (t.tenantId || '').trim().toLowerCase();
    if (!tenantId || tenantId === '__global__') continue;

    const code = (t.testCode || '').trim().toUpperCase();
    const masterItem = codeMap.get(code) || nameMap.get(normalize(t.testName));
    if (!masterItem) continue;

    const key = `${tenantId}:::${masterItem._id.toString()}`;
    if (existingConfigSet.has(key) || processedKeys.has(key)) continue;
    processedKeys.add(key);

    const price = Number(t.price) || 0;
    configsToInsert.push({
      tenantId,
      masterItemId: masterItem._id,
      category: 'Lab Operation',
      department: masterItem.department || 'Miscellaneous',
      mrp: price,
      netRate: price,
      hospitalCost: price,
      status: t.isActive !== false ? 'Active' : 'Inactive',
      approvalStatus: 'Approved',
      assignedVia: 'DIRECT_ADMIN',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  if (configsToInsert.length > 0) {
    console.log(`Inserting ${configsToInsert.length} hospital configurations...`);
    for (let i = 0; i < configsToInsert.length; i += 1000) {
      const batch = configsToInsert.slice(i, i + 1000);
      await HospitalMasterConfig.insertMany(batch, { ordered: false });
    }
    console.log(`✓ Inserted ${configsToInsert.length} hospital configurations.`);
  } else {
    console.log('Hospital configurations already up-to-date.');
  }

  const finalGlobalCount = await ItemMaster.countDocuments({ scope: 'GLOBAL', category: 'Lab Operation' });
  const finalHospCount = await HospitalMasterConfig.countDocuments({ category: 'Lab Operation' });

  console.log('\n================ MIGRATION REPORT ================');
  console.log(`Total Global Lab Operation Items in ItemMaster: ${finalGlobalCount}`);
  console.log(`Total Hospital Lab Operation Configs:          ${finalHospCount}`);
  console.log('==================================================');

  await mongoose.disconnect();
}

if (require.main === module) {
  migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { migrate };
