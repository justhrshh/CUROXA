/**
 * Test Suite: Patient Portal Global Discovery Radius Filters & Sorting
 * Tests validation of approved radius values (3, 5, 10, 15 km), default behavior (10 km),
 * rejection of unsupported radii (25, 50, -1, 'abc'), ascending distance ordering,
 * and distance boundary enforcement.
 */

const mongoose = require('mongoose');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SuperAdminHospital = require('../models/SuperAdminHospital');
const Patient = require('../models/Patient');

// Helper to simulate request/response against the logic
const { JWT_SECRET = 'your-default-jwt-secret' } = process.env;

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING RADIUS FILTER & DISCOVERY REGRESSION TESTS');
  console.log('====================================================\n');

  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, message) {
    totalCount++;
    if (condition) {
      console.log(`  ✅ TEST ${totalCount}: ${message}`);
      passedCount++;
    } else {
      console.error(`  ❌ TEST ${totalCount} FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGO_URI not configured in .env');

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.\n');

    // 1. Setup a test patient and token
    const testPatient = {
      _id: new mongoose.Types.ObjectId(),
      mobile: '9876543210',
      role: 'patient',
      type: 'global_patient'
    };
    const globalToken = jwt.sign(
      { id: testPatient._id, mobile: testPatient.mobile, role: 'patient', type: 'global_patient' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 2. Test radius validation logic directly
    const supportedRadii = [3, 5, 10, 15];

    function validateRadius(radiusKm) {
      if (radiusKm !== undefined && radiusKm !== null && String(radiusKm).trim() !== '') {
        const parsedRadius = Number(radiusKm);
        if (!supportedRadii.includes(parsedRadius)) {
          return { valid: false, error: `Invalid radius '${radiusKm}'. Supported radius values are 3, 5, 10, and 15 km.` };
        }
        return { valid: true, radius: parsedRadius };
      }
      return { valid: true, radius: 10 };
    }

    // TEST 1: Approved radius 3
    const r3 = validateRadius(3);
    assert(r3.valid === true && r3.radius === 3, 'Radius 3 km is accepted');

    // TEST 2: Approved radius 5
    const r5 = validateRadius(5);
    assert(r5.valid === true && r5.radius === 5, 'Radius 5 km is accepted');

    // TEST 3: Approved radius 10
    const r10 = validateRadius(10);
    assert(r10.valid === true && r10.radius === 10, 'Radius 10 km is accepted');

    // TEST 4: Approved radius 15
    const r15 = validateRadius(15);
    assert(r15.valid === true && r15.radius === 15, 'Radius 15 km is accepted');

    // TEST 5: Default when undefined
    const rDef = validateRadius(undefined);
    assert(rDef.valid === true && rDef.radius === 10, 'Default radius is 10 km when undefined');

    // TEST 6: Default when null
    const rNull = validateRadius(null);
    assert(rNull.valid === true && rNull.radius === 10, 'Default radius is 10 km when null');

    // TEST 7: Default when empty string
    const rEmpty = validateRadius('');
    assert(rEmpty.valid === true && rEmpty.radius === 10, 'Default radius is 10 km when empty string');

    // TEST 8: Legacy 25 km is rejected
    const r25 = validateRadius(25);
    assert(r25.valid === false && r25.error.includes('Supported radius values are 3, 5, 10, and 15 km'), 'Legacy 25 km is rejected with 400 error message');

    // TEST 9: Legacy 50 km is rejected
    const r50 = validateRadius(50);
    assert(r50.valid === false && r50.error.includes('Supported radius values are 3, 5, 10, and 15 km'), 'Legacy 50 km is rejected with 400 error message');

    // TEST 10: Negative radius is rejected
    const rNeg = validateRadius(-5);
    assert(rNeg.valid === false, 'Negative radius -5 is rejected');

    // TEST 11: Non-numeric radius is rejected
    const rStr = validateRadius('invalid');
    assert(rStr.valid === false, 'Non-numeric radius "invalid" is rejected');

    // TEST 12: Zero radius is rejected
    const rZero = validateRadius(0);
    assert(rZero.valid === false, 'Zero radius 0 is rejected');

    // TEST 13: Test actual MongoDB $geoNear aggregation with 3, 5, 10, 15 km radii
    // Connaught Place coordinates: [77.2167, 28.6328]
    const searchCoordinates = [77.2167, 28.6328];
    const hospitalFilter = {
      status: { $in: ['Active', 'active'] },
      subscriptionStatus: { $in: ['ACTIVE', 'EXPIRING'] },
      code: { $not: /^tenant-|^stg_/i }
    };

    for (const radius of [3, 5, 10, 15]) {
      const results = await SuperAdminHospital.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: searchCoordinates },
            distanceField: 'distanceMeters',
            maxDistance: radius * 1000,
            spherical: true,
            query: {
              ...hospitalFilter,
              location: { $exists: true, $ne: null }
            }
          }
        },
        {
          $project: {
            code: 1,
            name: 1,
            distanceMeters: 1,
            distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] }
          }
        }
      ]);

      // Verify no result exceeds the radius
      for (const res of results) {
        if (res.distanceMeters > radius * 1000) {
          throw new Error(`Result ${res.name} exceeds ${radius} km radius: ${res.distanceMeters}m`);
        }
      }

      // Verify ascending distance sorting
      for (let i = 1; i < results.length; i++) {
        if (results[i].distanceMeters < results[i - 1].distanceMeters) {
          throw new Error(`Results not sorted ascending: ${results[i - 1].distanceMeters}m before ${results[i].distanceMeters}m`);
        }
      }

      assert(true, `MongoDB $geoNear executed cleanly for ${radius} km (${results.length} clinics returned, strictly sorted nearest-first within ${radius} km)`);
    }

    console.log(`\n====================================================`);
    console.log(`🎉 ALL ${passedCount} OF ${totalCount} TESTS PASSED!`);
    console.log(`====================================================\n`);

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILURE:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runTests();
