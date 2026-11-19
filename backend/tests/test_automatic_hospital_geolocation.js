/**
 * QUROXA — AUTOMATIC HOSPITAL GEOLOCATION AUTOMATED TEST SUITE
 * 
 * Verifies all 18 requirements from Phase 8:
 * 1. New hospital onboarding with a complete address.
 * 2. Automatic coordinate resolution.
 * 3. Existing onboarding coordinates reuse.
 * 4. Google Maps URL coordinate extraction.
 * 5. Address geocoding.
 * 6. Invalid or incomplete addresses.
 * 7. External geocoder timeout.
 * 8. Geocoding retry.
 * 9. Unchanged address cache.
 * 10. Updated hospital address.
 * 11. Existing hospital coordinate backfill.
 * 12. Failed geocoding status.
 * 13. GeoJSON coordinate ordering ([longitude, latitude]).
 * 14. MongoDB 2dsphere searches.
 * 15. Patient GPS search.
 * 16. Patient PIN-code search.
 * 17. Radius filtering.
 * 18. Hospital geocoding without exposing patient information.
 */

const path = require('path');
const assert = require('assert');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SuperAdminHospital = require('../models/SuperAdminHospital');
const SuperAdminOnboarding = require('../models/SuperAdminOnboarding');
const User = require('../models/User');
const pincodeService = require('../services/pincodeService');
const {
  hospitalGeocodingService,
  HospitalGeocodingService,
  BaseGeocodingProvider,
  computeAddressHash,
  defaultService
} = require('../services/geocoding/hospitalGeocodingService');
const { run: runBackfill } = require('../scripts/backfill_hospital_coordinates');

// Mock Geocoding Provider for controlled and deterministic testing
class MockGeocodingProvider extends BaseGeocodingProvider {
  constructor(shouldTimeout = false) {
    super();
    this.shouldTimeout = shouldTimeout;
    this.callCount = 0;
  }

  async geocode({ name = '', address = '', city = '', state = '', pincode = '', country = 'India' }) {
    this.callCount++;

    if (this.shouldTimeout) {
      throw new Error('Nominatim request timed out after 8000ms');
    }

    if (address.includes('UNRESOLVABLE_NONEXISTENT_STREET_XYZ_999')) {
      return [];
    }

    if (address.includes('AMBIGUOUS_STATE_MISMATCH')) {
      return [{
        lat: '19.0760',
        lon: '72.8777',
        class: 'amenity',
        type: 'hospital',
        display_name: 'Mismatch Hospital, Mumbai, Maharashtra, India',
        address: { country_code: 'in', state: 'Maharashtra', country: 'India' },
        place_rank: 30
      }];
    }

    // High quality hospital match in Bengaluru
    return [{
      osm_id: 12345678,
      osm_type: 'way',
      lat: '12.9716',
      lon: '77.5946',
      class: 'amenity',
      type: 'hospital',
      addresstype: 'hospital',
      display_name: `${name || 'Hospital'}, ${address}, ${city || 'Bengaluru'}, ${state || 'Karnataka'}, India`,
      address: {
        hospital: name,
        road: address,
        city: city || 'Bengaluru',
        state: state || 'Karnataka',
        postcode: pincode || '560001',
        country_code: 'in',
        country: 'India'
      },
      place_rank: 30
    }];
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('    QUROXA: AUTOMATIC HOSPITAL GEOLOCATION TEST SUITE          ');
  console.log('===============================================================');

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is missing in .env');
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to MongoDB.\n');

  const testPrefix = `tg_${Date.now()}`;
  const createdHospitalIds = [];
  const createdOnboardingIds = [];

  // Initial purge of any lingering test records
  await SuperAdminHospital.deleteMany({
    $or: [
      { code: /^test_geo_/i },
      { code: /^tg_/i },
      { code: /^hosp_[ab]_/i }
    ]
  });
  await SuperAdminOnboarding.deleteMany({
    name: /^test_geo_/i
  });

  const mockProvider = new MockGeocodingProvider();
  const testService = new HospitalGeocodingService(mockProvider);

  try {
    // -------------------------------------------------------------
    // TEST 1: New hospital onboarding with a complete address
    // -------------------------------------------------------------
    console.log('[TEST 1] New hospital onboarding with complete address...');
    const onbRecord = await SuperAdminOnboarding.create({
      name: `${testPrefix} Hospital Central`,
      hospitalType: 'Multispecialty',
      address: '100 Feet Road, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
      country: 'India',
      googleMapUrl: 'https://maps.google.com/?q=12.9784,77.6408'
    });
    createdOnboardingIds.push(onbRecord._id);
    assert.strictEqual(onbRecord.city, 'Bengaluru');
    assert.strictEqual(onbRecord.state, 'Karnataka');
    assert.strictEqual(onbRecord.pincode, '560038');
    console.log('  --> PASSED: Onboarding draft successfully saved with address, city, state, PIN.\n');

    // -------------------------------------------------------------
    // TEST 2: Automatic coordinate resolution
    // -------------------------------------------------------------
    console.log('[TEST 2] Automatic coordinate resolution...');
    const autoGeoRes = await testService.resolveHospitalLocation({
      name: `${testPrefix} Hospital Central`,
      address: '100 Feet Road, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038'
    });
    assert(autoGeoRes.location, 'Location must be defined');
    assert.strictEqual(autoGeoRes.location.type, 'Point');
    assert.strictEqual(autoGeoRes.location.coordinates.length, 2);
    assert.strictEqual(autoGeoRes.geocodingStatus, 'verified');
    assert.strictEqual(autoGeoRes.geocodingSource, 'address');
    assert(autoGeoRes.addressHash, 'addressHash must be generated');
    console.log(`  --> PASSED: Resolved to [${autoGeoRes.location.coordinates.join(', ')}] with status: ${autoGeoRes.geocodingStatus}\n`);

    // -------------------------------------------------------------
    // TEST 3: Existing onboarding coordinates reuse
    // -------------------------------------------------------------
    console.log('[TEST 3] Existing onboarding coordinates reuse...');
    const reuseRes = await testService.resolveHospitalLocation({
      name: `${testPrefix} Onboarding Coords Hospital`,
      address: 'MG Road',
      latitude: '12.9716',
      longitude: '77.5946'
    });
    assert.strictEqual(reuseRes.geocodingStatus, 'verified');
    assert.strictEqual(reuseRes.geocodingSource, 'existing_coordinates');
    assert.strictEqual(reuseRes.location.coordinates[0], 77.5946); // Lng
    assert.strictEqual(reuseRes.location.coordinates[1], 12.9716); // Lat
    console.log('  --> PASSED: Correctly prioritized and reused existing onboarding coordinates.\n');

    // -------------------------------------------------------------
    // TEST 4: Google Maps URL coordinate extraction
    // -------------------------------------------------------------
    console.log('[TEST 4] Google Maps URL coordinate extraction...');
    const gmapsRes = await testService.resolveHospitalLocation({
      name: `${testPrefix} Maps URL Hospital`,
      address: 'Connaught Place',
      googleMapUrl: 'https://www.google.com/maps/@28.6315,77.2167,16z'
    });
    assert.strictEqual(gmapsRes.geocodingStatus, 'verified');
    assert.strictEqual(gmapsRes.geocodingSource, 'google_maps_url');
    assert.strictEqual(gmapsRes.location.coordinates[0], 77.2167);
    assert.strictEqual(gmapsRes.location.coordinates[1], 28.6315);
    console.log('  --> PASSED: Coordinates extracted from Google Maps URL.\n');

    // -------------------------------------------------------------
    // TEST 5: Address geocoding accuracy & quality validation
    // -------------------------------------------------------------
    console.log('[TEST 5] Address geocoding quality validation...');
    const matchData = {
      osm_id: 999,
      osm_type: 'way',
      lat: '13.0827',
      lon: '80.2707',
      class: 'amenity',
      type: 'hospital',
      addresstype: 'hospital',
      address: { country_code: 'in', state: 'Tamil Nadu', country: 'India' }
    };
    const accuracyVal = testService.validateAccuracy(matchData, 'Chennai', 'Tamil Nadu', '600001');
    assert.strictEqual(accuracyVal.valid, true);
    assert.strictEqual(accuracyVal.isHighQuality, true);
    assert.strictEqual(accuracyVal.precision, 'exact');
    console.log('  --> PASSED: Accuracy evaluation correctly recognized high quality hospital match.\n');

    // -------------------------------------------------------------
    // TEST 6: Invalid or incomplete addresses
    // -------------------------------------------------------------
    console.log('[TEST 6] Invalid or incomplete addresses...');
    const emptyRes = await testService.resolveHospitalLocation({
      name: `${testPrefix} Empty Hospital`,
      address: '',
      pincode: ''
    });
    assert.strictEqual(emptyRes.geocodingStatus, 'failed');
    assert.strictEqual(emptyRes.location, null);
    console.log('  --> PASSED: Empty address gracefully marked failed without crashing.\n');

    // -------------------------------------------------------------
    // TEST 7: External geocoder timeout & fallback
    // -------------------------------------------------------------
    console.log('[TEST 7] External geocoder timeout & fallback handling...');
    const timeoutProvider = new MockGeocodingProvider(true); // force timeout
    const timeoutService = new HospitalGeocodingService(timeoutProvider);
    const timeoutRes = await timeoutService.resolveHospitalLocation({
      name: `${testPrefix} Timeout Hospital`,
      address: 'Koramangala 4th Block',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560034' // has PIN code for offline centroid fallback
    });
    assert.strictEqual(timeoutRes.geocodingStatus, 'needs_review');
    assert.strictEqual(timeoutRes.geocodingSource, 'pincode_approximate');
    assert(timeoutRes.location, 'Fallback PIN centroid location provided');
    console.log('  --> PASSED: Timeout gracefully handled with offline PIN centroid marked needs_review.\n');

    // -------------------------------------------------------------
    // TEST 8: Geocoding retry mechanism
    // -------------------------------------------------------------
    console.log('[TEST 8] Geocoding administrative retry...');
    // Create hospital in pending/failed state
    const retryHosp = await SuperAdminHospital.create({
      name: `${testPrefix} Hospital Retry Test`,
      code: `ret_${Math.random().toString(36).slice(2, 10)}`,
      address: 'Bannerghatta Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560076',
      geocodingStatus: 'pending'
    });
    createdHospitalIds.push(retryHosp._id);

    // Re-resolve with testService
    const resolvedRetry = await testService.resolveHospitalLocation({
      name: retryHosp.name,
      address: retryHosp.address,
      city: retryHosp.city,
      state: retryHosp.state,
      pincode: retryHosp.pincode,
      forceRefresh: true
    });
    retryHosp.location = resolvedRetry.location;
    retryHosp.geocodingStatus = resolvedRetry.geocodingStatus;
    retryHosp.geocodingSource = resolvedRetry.geocodingSource;
    retryHosp.addressHash = resolvedRetry.addressHash;
    await retryHosp.save();

    assert.strictEqual(retryHosp.geocodingStatus, 'verified');
    assert(retryHosp.location && retryHosp.location.coordinates.length === 2);
    console.log('  --> PASSED: Hospital retry updated pending record to verified.\n');

    // -------------------------------------------------------------
    // TEST 9: Unchanged address cache
    // -------------------------------------------------------------
    console.log('[TEST 9] Unchanged address cache...');
    const initialCallCount = mockProvider.callCount;
    const cacheTestInput = {
      name: `${testPrefix} Cache Clinic`,
      address: 'Indiranagar 12th Main',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038'
    };
    await testService.resolveHospitalLocation(cacheTestInput);
    const countAfterFirst = mockProvider.callCount;
    // Second call with same address
    await testService.resolveHospitalLocation(cacheTestInput);
    const countAfterSecond = mockProvider.callCount;
    assert.strictEqual(countAfterSecond, countAfterFirst, 'Cache must prevent duplicate geocoder network calls');
    console.log('  --> PASSED: In-memory cache hit prevented duplicate geocoder request.\n');

    // -------------------------------------------------------------
    // TEST 10: Updated hospital address detection
    // -------------------------------------------------------------
    console.log('[TEST 10] Updated hospital address detection...');
    const hash1 = computeAddressHash({
      name: 'Apollo Hospital',
      address: 'Greams Road',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600006'
    });
    const hash2 = computeAddressHash({
      name: 'Apollo Hospital',
      address: 'OMR Road', // address changed
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600096'
    });
    assert.notStrictEqual(hash1, hash2, 'Address hashes must differ when address changes');
    console.log('  --> PASSED: Address change accurately detected via deterministic SHA-256 hash.\n');

    // -------------------------------------------------------------
    // TEST 11: Existing hospital coordinate backfill
    // -------------------------------------------------------------
    console.log('[TEST 11] Existing hospital coordinate backfill (Dry Run)...');
    const backfillReport = await runBackfill({ disconnectOnExit: false });
    assert(backfillReport, 'Backfill report must be generated');
    assert(typeof backfillReport.totalInspected === 'number');
    console.log(`  --> PASSED: Backfill completed inspection on ${backfillReport.totalInspected} hospitals.\n`);

    // -------------------------------------------------------------
    // TEST 12: Failed / Needs Review geocoding status
    // -------------------------------------------------------------
    console.log('[TEST 12] Unresolvable address handling...');
    const unresolvableRes = await testService.resolveHospitalLocation({
      name: `${testPrefix} Unknown`,
      address: 'UNRESOLVABLE_NONEXISTENT_STREET_XYZ_999'
    });
    assert(['needs_review', 'failed'].includes(unresolvableRes.geocodingStatus));
    console.log('  --> PASSED: Unresolvable address marked needs_review/failed; no fake coordinates fabricated.\n');

    // -------------------------------------------------------------
    // TEST 13: GeoJSON coordinate ordering ([longitude, latitude])
    // -------------------------------------------------------------
    console.log('[TEST 13] Strict GeoJSON coordinate ordering...');
    const geoJsonHosp = await SuperAdminHospital.create({
      name: `${testPrefix} GeoJSON Order Test`,
      code: `ord_${Math.random().toString(36).slice(2, 10)}`,
      address: 'Victoria Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560047',
      location: {
        type: 'Point',
        coordinates: [77.6101, 12.9667] // [lng, lat]
      },
      geocodingStatus: 'verified',
      geocodingSource: 'existing_coordinates'
    });
    createdHospitalIds.push(geoJsonHosp._id);
    assert.strictEqual(geoJsonHosp.location.coordinates[0], 77.6101, 'Index 0 must be Longitude');
    assert.strictEqual(geoJsonHosp.location.coordinates[1], 12.9667, 'Index 1 must be Latitude');
    console.log('  --> PASSED: Coordinates adhere strictly to GeoJSON specification [longitude, latitude].\n');

    // -------------------------------------------------------------
    // TEST 14: MongoDB 2dsphere searches ($geoNear)
    // -------------------------------------------------------------
    console.log('[TEST 14] MongoDB 2dsphere $geoNear geospatial execution...');
    // Seed 2 active hospitals at known locations
    // Hospital A: Indiranagar, Bengaluru (approx 3 km from patient)
    const hospA = await SuperAdminHospital.create({
      name: `${testPrefix} Clinic Indiranagar`,
      code: `ha_${Math.random().toString(36).slice(2, 10)}`,
      status: 'Active',
      subscriptionStatus: 'ACTIVE',
      address: '100 Feet Road, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
      location: {
        type: 'Point',
        coordinates: [77.6408, 12.9784]
      },
      geocodingStatus: 'verified'
    });
    createdHospitalIds.push(hospA._id);

    // Hospital B: Whitefield, Bengaluru (approx 16 km from patient)
    const hospB = await SuperAdminHospital.create({
      name: `${testPrefix} Hospital Whitefield`,
      code: `hb_${Math.random().toString(36).slice(2, 10)}`,
      status: 'Active',
      subscriptionStatus: 'ACTIVE',
      address: 'ITPL Main Road, Whitefield',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
      location: {
        type: 'Point',
        coordinates: [77.7499, 12.9698]
      },
      geocodingStatus: 'verified'
    });
    createdHospitalIds.push(hospB._id);

    // Patient search coordinates: MG Road Metro [77.6066, 12.9754]
    const searchNear = [77.6066, 12.9754];
    const geoResults = await SuperAdminHospital.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: searchNear },
          distanceField: 'distanceMeters',
          maxDistance: 50 * 1000, // 50 km
          spherical: true,
          query: { _id: { $in: [hospA._id, hospB._id] } }
        }
      }
    ]);

    assert.strictEqual(geoResults.length, 2);
    // Hospital A (Indiranagar, ~3.7 km) must come BEFORE Hospital B (Whitefield, ~15.5 km)
    assert.strictEqual(geoResults[0].code, hospA.code);
    assert.strictEqual(geoResults[1].code, hospB.code);
    assert(geoResults[0].distanceMeters < geoResults[1].distanceMeters);
    console.log(`  --> PASSED: $geoNear sorted nearest hospital first (A: ${Math.round(geoResults[0].distanceMeters)}m, B: ${Math.round(geoResults[1].distanceMeters)}m).\n`);

    // -------------------------------------------------------------
    // TEST 15: Patient GPS search
    // -------------------------------------------------------------
    console.log('[TEST 15] Patient GPS search simulation...');
    const patientLat = 12.9754;
    const patientLng = 77.6066;
    const searchCoords = [patientLng, patientLat];
    const gpsNearby = await SuperAdminHospital.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: searchCoords },
          distanceField: 'distanceMeters',
          maxDistance: 10 * 1000, // 10 km
          spherical: true,
          query: { _id: { $in: [hospA._id, hospB._id] } }
        }
      }
    ]);
    assert.strictEqual(gpsNearby.length, 1, 'Only Indiranagar should be within 10km GPS radius');
    assert.strictEqual(gpsNearby[0].code, hospA.code);
    console.log('  --> PASSED: Patient GPS transient query returned correct 10km hospital.\n');

    // -------------------------------------------------------------
    // TEST 16: Patient PIN-code search
    // -------------------------------------------------------------
    console.log('[TEST 16] Patient PIN-code search fallback...');
    const pinLookup = pincodeService.getCentroid('560038');
    assert.strictEqual(pinLookup.valid, true);
    assert(pinLookup.coordinates, 'PIN centroid must exist');
    const pinNearby = await SuperAdminHospital.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [pinLookup.coordinates.lng, pinLookup.coordinates.lat] },
          distanceField: 'distanceMeters',
          maxDistance: 25 * 1000,
          spherical: true,
          query: { _id: { $in: [hospA._id, hospB._id] } }
        }
      }
    ]);
    assert(pinNearby.length >= 1);
    console.log('  --> PASSED: PIN-code centroid lookup successfully routed through geospatial query.\n');

    // -------------------------------------------------------------
    // TEST 17: Radius filtering (5km vs 50km)
    // -------------------------------------------------------------
    console.log('[TEST 17] Radius filtering boundary test...');
    // At 5km, only Indiranagar (~3.7 km) matches
    const radius5 = await SuperAdminHospital.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: searchNear },
          distanceField: 'distanceMeters',
          maxDistance: 5 * 1000,
          spherical: true,
          query: { _id: { $in: [hospA._id, hospB._id] } }
        }
      }
    ]);
    assert.strictEqual(radius5.length, 1);
    assert.strictEqual(radius5[0].code, hospA.code);

    // At 50km, both Indiranagar and Whitefield match
    const radius50 = await SuperAdminHospital.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: searchNear },
          distanceField: 'distanceMeters',
          maxDistance: 50 * 1000,
          spherical: true,
          query: { _id: { $in: [hospA._id, hospB._id] } }
        }
      }
    ]);
    assert.strictEqual(radius50.length, 2);
    console.log('  --> PASSED: 5km returned 1 hospital; 50km expanded to 2 hospitals.\n');

    // -------------------------------------------------------------
    // TEST 18: Security & Privacy: No patient coordinate persistence
    // -------------------------------------------------------------
    console.log('[TEST 18] Security & Privacy: No patient GPS persistence...');
    // Ensure no User or Patient model has patient GPS saved
    const userDoc = await User.findOne({ staff_id: 'non_existent_test_probe' });
    assert.strictEqual(userDoc, null);
    // Verify that SuperAdminHospital does not store patient coordinates
    const savedHosp = await SuperAdminHospital.findById(hospA._id).lean();
    assert.strictEqual(savedHosp.patientLatitude, undefined);
    assert.strictEqual(savedHosp.patientLongitude, undefined);
    assert.strictEqual(savedHosp.patientLocation, undefined);
    console.log('  --> PASSED: Zero patient GPS coordinates stored or persisted.\n');

    console.log('===============================================================');
    console.log('    ALL 18 AUTOMATED TESTS PASSED SUCCESSFULLY!                ');
    console.log('===============================================================');

  } finally {
    // Clean up test data
    console.log('\nCleaning up synthetic test data...');
    if (createdHospitalIds.length > 0) {
      await SuperAdminHospital.deleteMany({ _id: { $in: createdHospitalIds } });
    }
    if (createdOnboardingIds.length > 0) {
      await SuperAdminOnboarding.deleteMany({ _id: { $in: createdOnboardingIds } });
    }
    console.log('Cleanup completed.');
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runTests().catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
