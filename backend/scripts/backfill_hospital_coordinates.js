/**
 * QUROXA: HOSPITAL GEOLOCATION BACKFILL MECHANISM
 * 
 * Flags supported:
 *   --dry-run       : Show proposed geocoding and address match without modifying database (default if --apply is omitted)
 *   --apply         : Commit verified geocoded coordinates and metadata to MongoDB
 *   --limit <n>     : Limit maximum number of records processed
 *   --retry-failed  : Re-process hospitals with geocodingStatus 'failed' or 'needs_review'
 *   --only-missing  : Process only hospitals with missing coordinates or 'pending' status
 * 
 * Rules:
 *   1. Excludes inactive, suspended and staging/test records from active patient discovery.
 *   2. Reuses existing onboarding coordinates or Google Maps URL coordinates when valid.
 *   3. Geocodes missing addresses sequentially (1 req/sec rate limit).
 *   4. Never assigns PIN-code centroids as exact hospital coordinates (identifies as approximate / needs_review).
 *   5. Never overwrites valid coordinates without a verified address change.
 *   6. Ensures MongoDB 2dsphere and pincode indexes are created.
 *   7. Generates a comprehensive summary report.
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SuperAdminHospital = require('../models/SuperAdminHospital');
const SuperAdminOnboarding = require('../models/SuperAdminOnboarding');
const pincodeService = require('../services/pincodeService');
const hospitalGeocodingService = require('../services/geocoding/hospitalGeocodingService');

// Parse CLI Arguments
const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isDryRun = args.includes('--dry-run') || !isApply;
const isRetryFailed = args.includes('--retry-failed');
const isOnlyMissing = args.includes('--only-missing');

let limitCount = Infinity;
const limitIdx = args.indexOf('--limit');
if (limitIdx !== -1 && args[limitIdx + 1]) {
  const parsedLimit = parseInt(args[limitIdx + 1], 10);
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    limitCount = parsedLimit;
  }
}

function isDiscoveryEligible(hosp) {
  const statusActive = hosp.status && hosp.status.toLowerCase() === 'active';
  const subActive = hosp.subscriptionStatus && ['active', 'expiring'].includes(hosp.subscriptionStatus.toLowerCase());
  const notStaging = hosp.code && !/^stg_/i.test(hosp.code) && !/^tenant-/i.test(hosp.code);
  return statusActive && subActive && notStaging;
}

async function run(options = {}) {
  const shouldDisconnect = options.disconnectOnExit !== undefined ? options.disconnectOnExit : (require.main === module);
  console.log('===============================================================');
  console.log('       QUROXA: AUTOMATIC HOSPITAL GEOLOCATION BACKFILL         ');
  console.log('===============================================================');
  console.log(`Mode         : ${isApply ? 'APPLY (Writing changes to DB)' : 'DRY-RUN (Simulating only, no writes)'}`);
  console.log(`Limit        : ${limitCount === Infinity ? 'None' : limitCount}`);
  console.log(`Retry Failed : ${isRetryFailed ? 'YES' : 'NO'}`);
  console.log(`Only Missing : ${isOnlyMissing ? 'YES' : 'NO'}`);
  console.log('---------------------------------------------------------------\n');

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI is missing in environment (.env).');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to MongoDB.\n');

  const allHospitals = await SuperAdminHospital.find({});
  console.log(`Total SuperAdminHospital records found in database: ${allHospitals.length}\n`);

  let candidateHospitals = [];
  let excludedFromDiscovery = 0;

  for (const hosp of allHospitals) {
    const eligible = isDiscoveryEligible(hosp);
    if (!eligible) {
      excludedFromDiscovery++;
    }

    const hasCoords = hosp.location &&
      Array.isArray(hosp.location.coordinates) &&
      hosp.location.coordinates.length === 2 &&
      pincodeService.isValidCoordinates(hosp.location.coordinates[1], hosp.location.coordinates[0]);

    if (isOnlyMissing) {
      if (hasCoords && hosp.geocodingStatus === 'verified') {
        continue;
      }
    }

    if (!isRetryFailed && (hosp.geocodingStatus === 'failed' || hosp.geocodingStatus === 'needs_review') && hasCoords) {
      continue;
    }

    candidateHospitals.push(hosp);
  }

  if (limitCount < candidateHospitals.length) {
    candidateHospitals = candidateHospitals.slice(0, limitCount);
  }

  console.log(`Candidate hospitals for processing: ${candidateHospitals.length}`);
  console.log(`Records excluded from patient discovery (inactive/suspended/staging): ${excludedFromDiscovery}\n`);

  const report = {
    totalInspected: candidateHospitals.length,
    alreadyVerifiedSkipped: 0,
    resolvedExistingCoords: 0,
    resolvedGoogleMaps: 0,
    resolvedNominatimAddress: 0,
    approximatePinCentroid: 0,
    needsReview: 0,
    failed: 0,
    appliedUpdates: 0,
    hospitals: []
  };

  for (let i = 0; i < candidateHospitals.length; i++) {
    const hosp = candidateHospitals[i];
    const prefix = `[${i + 1}/${candidateHospitals.length}] ${hosp.code} (${hosp.name}):`;

    const hasCoords = hosp.location &&
      Array.isArray(hosp.location.coordinates) &&
      hosp.location.coordinates.length === 2 &&
      pincodeService.isValidCoordinates(hosp.location.coordinates[1], hosp.location.coordinates[0]);

    // Check if address is already hashed and verified with unchanged address
    const currentHash = hospitalGeocodingService.computeAddressHash({
      name: hosp.name,
      address: hosp.address,
      city: hosp.city,
      state: hosp.state,
      pincode: hosp.pincode
    });

    if (hasCoords && hosp.geocodingStatus === 'verified' && hosp.addressHash === currentHash && !isRetryFailed) {
      console.log(`${prefix} Already verified with matching address hash. Skipping.`);
      report.alreadyVerifiedSkipped++;
      report.hospitals.push({
        code: hosp.code,
        name: hosp.name,
        status: 'ALREADY_VERIFIED',
        coordinates: hosp.location.coordinates,
        source: hosp.geocodingSource || 'existing_coordinates',
        geocodingStatus: 'verified'
      });
      continue;
    }

    // Inspect matching onboarding draft for additional data
    let onb = await SuperAdminOnboarding.findOne({
      $or: [{ code: hosp.code }, { name: hosp.name }]
    });

    const targetAddress = hosp.address || (onb && (onb.address || onb.addressLine1)) || '';
    const targetCity = hosp.city || (onb && onb.city) || '';
    const targetState = hosp.state || (onb && onb.state) || '';
    let targetPin = hosp.pincode || (onb && onb.pincode) || '';
    if (!targetPin && targetAddress) {
      const m = targetAddress.match(/\b[1-9][0-9]{5}\b/);
      if (m) targetPin = m[0];
    }
    const targetGoogleMapUrl = (onb && onb.googleMapUrl) || '';
    const targetLat = (onb && onb.latitude) || (hasCoords ? hosp.location.coordinates[1] : null);
    const targetLng = (onb && onb.longitude) || (hasCoords ? hosp.location.coordinates[0] : null);

    // Call geocoding service
    const geoResult = await hospitalGeocodingService.resolveHospitalLocation({
      name: hosp.name,
      address: targetAddress,
      city: targetCity,
      state: targetState,
      pincode: targetPin,
      googleMapUrl: targetGoogleMapUrl,
      latitude: targetLat,
      longitude: targetLng,
      existingRecord: hosp
    });

    let actionLabel = 'UNRESOLVED';
    let proposedCoords = geoResult.location ? geoResult.location.coordinates : null;

    if (geoResult.geocodingStatus === 'verified') {
      if (geoResult.geocodingSource === 'existing_coordinates') {
        report.resolvedExistingCoords++;
        actionLabel = 'REUSED_ONBOARDING_COORDS';
      } else if (geoResult.geocodingSource === 'google_maps_url') {
        report.resolvedGoogleMaps++;
        actionLabel = 'RESOLVED_GOOGLE_MAPS_URL';
      } else if (geoResult.geocodingSource === 'address') {
        report.resolvedNominatimAddress++;
        actionLabel = 'RESOLVED_ADDRESS_GEOCODER';
      }
    } else if (geoResult.geocodingStatus === 'needs_review') {
      if (geoResult.geocodingSource === 'pincode_approximate') {
        report.approximatePinCentroid++;
        actionLabel = 'PINCODE_CENTROID_APPROXIMATE (NEEDS_REVIEW)';
      } else {
        report.needsReview++;
        actionLabel = 'AMBIGUOUS_ADDRESS (NEEDS_REVIEW)';
      }
    } else {
      report.failed++;
      actionLabel = 'FAILED';
    }

    console.log(`${prefix} Result: ${actionLabel}`);
    console.log(`    Address : "${targetAddress || 'N/A'}", PIN: ${targetPin || 'N/A'}, City: ${targetCity || 'N/A'}`);
    console.log(`    Coords  : ${proposedCoords ? `[lng: ${proposedCoords[0]}, lat: ${proposedCoords[1]}]` : 'None'}`);
    console.log(`    Status  : ${geoResult.geocodingStatus}, Source: ${geoResult.geocodingSource || 'none'}, Precision: ${geoResult.geocodingPrecision}`);

    report.hospitals.push({
      code: hosp.code,
      name: hosp.name,
      address: targetAddress,
      pincode: targetPin,
      proposedCoordinates: proposedCoords,
      geocodingStatus: geoResult.geocodingStatus,
      geocodingSource: geoResult.geocodingSource,
      precision: geoResult.geocodingPrecision,
      action: actionLabel
    });

    if (isApply) {
      const updateFields = {
        geocodingStatus: geoResult.geocodingStatus,
        geocodingSource: geoResult.geocodingSource || hosp.geocodingSource || null,
        geocodingPrecision: geoResult.geocodingPrecision || 'unknown',
        geocodedAt: geoResult.geocodedAt || new Date(),
        addressHash: geoResult.addressHash || ''
      };

      if (targetPin && hosp.pincode !== targetPin) updateFields.pincode = targetPin;
      if (targetCity && hosp.city !== targetCity) updateFields.city = targetCity;
      if (targetState && hosp.state !== targetState) updateFields.state = targetState;

      if (geoResult.location && geoResult.geocodingStatus === 'verified') {
        updateFields.location = geoResult.location;
      } else if (geoResult.location && geoResult.geocodingStatus === 'needs_review' && (!hosp.location || !hosp.location.coordinates || hosp.location.coordinates.length < 2)) {
        // If hospital had no coordinates at all, set approximate location but flag needs_review
        updateFields.location = geoResult.location;
      }

      await SuperAdminHospital.updateOne({ _id: hosp._id }, { $set: updateFields });
      report.appliedUpdates++;
      console.log(`    --> Saved to database.`);
    }
  }

  // Ensure 2dsphere and pincode indexes are built
  console.log('\nEnsuring MongoDB indexes on SuperAdminHospital collection...');
  await SuperAdminHospital.collection.createIndex({ location: '2dsphere' });
  await SuperAdminHospital.collection.createIndex({ pincode: 1 });
  await SuperAdminHospital.collection.createIndex({ geocodingStatus: 1 });
  console.log('MongoDB 2dsphere, pincode, and geocodingStatus indexes verified.');

  console.log('\n===============================================================');
  console.log('                   BACKFILL EXECUTION REPORT                   ');
  console.log('===============================================================');
  console.log(`Execution Mode              : ${isApply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Total Hospitals Inspected   : ${report.totalInspected}`);
  console.log(`Already Verified & Skipped  : ${report.alreadyVerifiedSkipped}`);
  console.log(`Resolved via Onboarding    : ${report.resolvedExistingCoords}`);
  console.log(`Resolved via Google Maps    : ${report.resolvedGoogleMaps}`);
  console.log(`Resolved via Nominatim Addr : ${report.resolvedNominatimAddress}`);
  console.log(`Approximate PIN Centroids   : ${report.approximatePinCentroid} (Marked needs_review)`);
  console.log(`Ambiguous / Needs Review    : ${report.needsReview}`);
  console.log(`Failed Geocoding            : ${report.failed}`);
  console.log(`Excluded from Discovery     : ${excludedFromDiscovery} (Inactive/Suspended/Staging)`);
  if (isApply) {
    console.log(`Database Records Updated    : ${report.appliedUpdates}`);
  } else {
    console.log(`Proposed Updates (Dry Run)  : ${report.totalInspected - report.alreadyVerifiedSkipped}`);
  }
  console.log('===============================================================\n');

  if (shouldDisconnect) {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB. Complete.');
  }
  return report;
}

if (require.main === module) {
  run().catch(err => {
    console.error('Backfill script error:', err);
    process.exit(1);
  });
}

module.exports = { run, isDiscoveryEligible };
