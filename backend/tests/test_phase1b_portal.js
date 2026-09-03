require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const express = require('express');
const http = require('http');
const portalRoutes = require('../routes/portalRoutes');

async function runTests() {
  console.log('=== PHASE 1B BACKEND VERIFICATION TEST ===\n');

  await connectDB();
  console.log('✓ Connected to MongoDB via connectDB');

  const app = express();
  app.use(express.json());
  app.use('/api/public/portal', portalRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/public/portal`;

  try {
    // 1. Fetch real sample hospitals
    const sampleHospitals = await SuperAdminHospital.find({}).limit(3).lean();
    if (sampleHospitals.length === 0) {
      throw new Error('No hospitals found in database');
    }

    const hosp1 = sampleHospitals[0];
    const hosp2 = sampleHospitals[1] || sampleHospitals[0];

    console.log(`Testing with Hospital 1: [${hosp1.hospitalId}] "${hosp1.name}"`);
    console.log(`Testing with Hospital 2: [${hosp2.hospitalId}] "${hosp2.name}"\n`);

    // Test 1: Valid hospital 1
    const res1 = await fetch(`${baseUrl}/${hosp1.hospitalId}`);
    const data1 = await res1.json();
    console.log('Test 1: Valid hospital lookup status:', res1.status);
    if (res1.status !== 200) throw new Error(`Expected 200, got ${res1.status}`);
    if (data1.hospitalId !== hosp1.hospitalId) throw new Error(`hospitalId mismatch`);
    if (data1.name !== hosp1.name) throw new Error(`name mismatch`);
    console.log('Test 1 Body:', JSON.stringify(data1));
    console.log('✓ Test 1 Passed: Valid hospital returned correct branding');

    // Test 2: Sensitive field leak prevention
    const forbiddenFields = ['_id', 'adminUsername', 'adminEmail', 'password', 'password_hash', 'panNumber', 'gst', 'revenue', 'limits', 'contactEmail', 'phone'];
    const leaked = forbiddenFields.filter(f => data1[f] !== undefined);
    if (leaked.length > 0) {
      throw new Error(`SECURITY LEAK: Found forbidden fields in public branding response: ${leaked.join(', ')}`);
    }
    console.log('✓ Test 2 Passed: Zero sensitive fields exposed in public response');

    // Test 3: Case insensitivity
    const lowerId = hosp1.hospitalId.toLowerCase();
    const resCase = await fetch(`${baseUrl}/${lowerId}`);
    const dataCase = await resCase.json();
    if (resCase.status !== 200 || dataCase.hospitalId !== hosp1.hospitalId) {
      throw new Error(`Case insensitivity check failed`);
    }
    console.log('✓ Test 3 Passed: Case-insensitive URL resolution works');

    // Test 4: Second hospital lookup
    const res2 = await fetch(`${baseUrl}/${hosp2.hospitalId}`);
    const data2 = await res2.json();
    if (res2.status !== 200 || data2.hospitalId !== hosp2.hospitalId) {
      throw new Error(`Second hospital lookup failed`);
    }
    console.log('✓ Test 4 Passed: Multi-hospital resolution distinct and accurate');

    // Test 5: Invalid Non-Existent Hospital ID (Valid format)
    const resNonExistent = await fetch(`${baseUrl}/HSP-ZZZZ99`);
    const dataNonExistent = await resNonExistent.json();
    console.log('Test 5 Non-Existent status:', resNonExistent.status);
    if (resNonExistent.status !== 404) throw new Error(`Expected 404 for non-existent hospital, got ${resNonExistent.status}`);
    if (dataNonExistent.error !== 'Hospital portal not found') throw new Error(`Unexpected error message: ${dataNonExistent.error}`);
    console.log('✓ Test 5 Passed: Non-existent hospital returns clean 404');

    // Test 6: Malformed Hospital ID
    const resMalformed = await fetch(`${baseUrl}/invalid-slug-123`);
    const dataMalformed = await resMalformed.json();
    if (resMalformed.status !== 404) throw new Error(`Expected 404 for malformed hospitalId, got ${resMalformed.status}`);
    console.log('✓ Test 6 Passed: Malformed identifier safely rejected with 404');

    console.log('\n=== ALL PHASE 1B BACKEND TESTS PASSED SUCCESSFULLY ===');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
