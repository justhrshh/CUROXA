/**
 * QUROXA: HOSPITAL GEOLOCATION BACKFILL MECHANISM
 * 
 * Safely backfills hospital coordinates, PIN codes, city, and state:
 * - Inspects existing SuperAdminHospital records.
 * - Cross-references SuperAdminOnboarding for verified coordinates or Google Maps URLs.
 * - Extracts 6-digit Indian PIN codes from address strings where present.
 * - Resolves PIN codes to official Department of Posts centroids via pincodeService.
 * - Never fabricates fake coordinates.
 * - Does not overwrite existing valid coordinates.
 * - Ensures MongoDB 2dsphere index is active.
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SuperAdminHospital = require('../models/SuperAdminHospital');
const SuperAdminOnboarding = require('../models/SuperAdminOnboarding');
const pincodeService = require('../services/pincodeService');

async function run() {
  console.log('=== QUROXA: HOSPITAL GEOLOCATION BACKFILL ===\n');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const hospitals = await SuperAdminHospital.find({});
  console.log(`Discovered ${hospitals.length} total hospital records.`);

  let updatedCount = 0;
  let skippedCount = 0;
  let noLocationCount = 0;

  for (const hosp of hospitals) {
    const hasValidCoords = hosp.location && 
      Array.isArray(hosp.location.coordinates) && 
      hosp.location.coordinates.length === 2 && 
      pincodeService.isValidCoordinates(hosp.location.coordinates[1], hosp.location.coordinates[0]);

    if (hasValidCoords && hosp.pincode) {
      console.log(`  [SKIP] ${hosp.code} already has valid coordinates and PIN.`);
      skippedCount++;
      continue;
    }

    let coords = hasValidCoords ? hosp.location.coordinates : null;
    let pincode = hosp.pincode || '';
    let city = hosp.city || '';
    let state = hosp.state || '';

    // 1. Check matching onboarding document
    const onb = await SuperAdminOnboarding.findOne({
      $or: [{ code: hosp.code }, { name: hosp.name }]
    });

    if (onb) {
      if (!city && onb.city) city = onb.city;
      if (!coords && onb.latitude && onb.longitude) {
        const lat = parseFloat(onb.latitude);
        const lng = parseFloat(onb.longitude);
        if (pincodeService.isValidCoordinates(lat, lng)) {
          coords = [lng, lat];
        }
      }
      if (!coords && onb.googleMapUrl) {
        const gCoords = pincodeService.extractCoordinatesFromGoogleMapsUrl(onb.googleMapUrl);
        if (gCoords) coords = gCoords.coordinates;
      }
    }

    // 2. Extract PIN code from address if not present
    if (!pincode && hosp.address) {
      const match = hosp.address.match(/\b[1-9][0-9]{5}\b/);
      if (match) {
        pincode = match[0];
      }
    }

    // 3. Resolve PIN code centroid if coordinates are missing
    if (!coords && pincode) {
      const pinRes = await pincodeService.resolvePincode(pincode);
      if (pinRes && pinRes.coordinates) {
        coords = pinRes.coordinates;
        if (!city && pinRes.district) city = pinRes.district;
        if (!state && pinRes.state) state = pinRes.state;
      }
    }

    let modified = false;
    if (pincode && hosp.pincode !== pincode) {
      hosp.pincode = pincode;
      modified = true;
    }
    if (city && hosp.city !== city) {
      hosp.city = city;
      modified = true;
    }
    if (state && hosp.state !== state) {
      hosp.state = state;
      modified = true;
    }
    if (coords && (!hosp.location || !hosp.location.coordinates || hosp.location.coordinates[0] !== coords[0])) {
      hosp.location = {
        type: 'Point',
        coordinates: coords
      };
      modified = true;
    }

    if (modified) {
      await hosp.save();
      console.log(`  [UPDATED] ${hosp.code} (${hosp.name}): PIN=${pincode || 'N/A'}, Coords=${coords ? coords.join(', ') : 'None'}`);
      updatedCount++;
    } else if (!coords) {
      console.log(`  [NO_COORDS] ${hosp.code} has no coordinates or PIN code available in record.`);
      noLocationCount++;
    } else {
      skippedCount++;
    }
  }

  // Ensure index creation
  console.log('\nEnsuring 2dsphere index on SuperAdminHospital collection...');
  await SuperAdminHospital.collection.createIndex({ location: '2dsphere' });
  await SuperAdminHospital.collection.createIndex({ pincode: 1 });
  console.log('2dsphere and pincode indexes verified.');

  console.log(`\n=== BACKFILL SUMMARY ===`);
  console.log(`Total: ${hospitals.length} | Updated: ${updatedCount} | Skipped: ${skippedCount} | No Coordinates Available: ${noLocationCount}\n`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Backfill error:', err);
  process.exit(1);
});
