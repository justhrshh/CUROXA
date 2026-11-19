/**
 * QUROXA AUTOMATIC HOSPITAL GEOCODING SERVICE
 * 
 * Complies with OpenStreetMap Nominatim Usage Policy:
 * - Rate limit: Strictly max 1 request/second application-wide via serial queue.
 * - Custom identifying User-Agent.
 * - Caches successful and failed address lookups.
 * - Common replaceable provider interface (defaults to Nominatim).
 * - No paid API dependencies.
 * - Strict Indian boundary (6°-38°N, 68°-98°E) and quality validation.
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const pincodeService = require('../pincodeService');

/**
 * Normalizes an address string for hashing and comparison.
 */
function normalizeAddressString(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes a deterministic SHA-256 hash for hospital address inputs.
 */
function computeAddressHash({ name = '', address = '', city = '', state = '', pincode = '', country = 'India' } = {}) {
  const normName = normalizeAddressString(name);
  const normAddr = normalizeAddressString(address);
  const normCity = normalizeAddressString(city);
  const normState = normalizeAddressString(state);
  const cleanPin = (pincode || '').toString().trim();
  const normCountry = normalizeAddressString(country || 'India');

  const canonical = `name:${normName}|addr:${normAddr}|city:${normCity}|state:${normState}|pin:${cleanPin}|country:${normCountry}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Abstract / Base Geocoding Provider Interface
 */
class BaseGeocodingProvider {
  async geocode({ query, name, address, city, state, pincode, country }) {
    throw new Error('geocode() must be implemented by concrete geocoding provider');
  }
}

/**
 * OpenStreetMap Nominatim Provider Implementation
 * Adheres strictly to: https://operations.osmfoundation.org/policies/nominatim/
 */
class NominatimGeocodingProvider extends BaseGeocodingProvider {
  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org/search';
    this.userAgent = options.userAgent || process.env.GEOCODING_USER_AGENT || 'QuroxaHealth-HospitalGeolocation/1.0 (healthcare-management@quroxa.com; +https://quroxa.com)';
    this.timeoutMs = options.timeoutMs || 8000;

    // Rate limiter: 1 request every 1100ms (to stay strictly within 1 req/sec limit)
    this.lastRequestTimestamp = 0;
    this.minIntervalMs = 1100;
    this.queue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Enqueues an HTTP request to guarantee maximum 1 request/second sequentially application-wide.
   */
  _scheduleRequest(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.isProcessingQueue || this.queue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();
      const elapsed = Date.now() - this.lastRequestTimestamp;
      if (elapsed < this.minIntervalMs) {
        await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
      }
      this.lastRequestTimestamp = Date.now();

      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Executes HTTP GET with custom User-Agent and JSON parsing.
   */
  _fetchJson(url) {
    return this._scheduleRequest(() => {
      return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const req = protocol.get(parsedUrl, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'application/json',
            'Accept-Language': 'en'
          },
          timeout: this.timeoutMs
        }, (res) => {
          if (res.statusCode === 429) {
            return reject(new Error('Nominatim rate limit exceeded (HTTP 429)'));
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Nominatim responded with HTTP status ${res.statusCode}`));
          }

          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (parseErr) {
              reject(new Error(`Invalid JSON received from Nominatim: ${parseErr.message}`));
            }
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`Nominatim request timed out after ${this.timeoutMs}ms`));
        });

        req.on('error', (err) => {
          reject(err);
        });
      });
    });
  }

  /**
   * Geocodes the address using structured parameters and query fallback.
   */
  async geocode({ name = '', address = '', city = '', state = '', pincode = '', country = 'India' }) {
    // 1. Primary search: Full query with hospital name + address + city + pincode + country
    const queryParts = [name, address, city, state, pincode, country].filter(Boolean);
    const queryString = queryParts.join(', ');

    const params = new URLSearchParams({
      q: queryString,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      countrycodes: 'in'
    });

    let results = await this._fetchJson(`${this.baseUrl}?${params.toString()}`);

    // 2. Fallback search: If no result, try address + city + pincode without hospital name (in case name is not in OSM)
    if (!results || results.length === 0) {
      if (address || city || pincode) {
        const fallbackParts = [address, city, state, pincode, country].filter(Boolean);
        const fallbackQuery = fallbackParts.join(', ');
        const fallbackParams = new URLSearchParams({
          q: fallbackQuery,
          format: 'jsonv2',
          addressdetails: '1',
          limit: '5',
          countrycodes: 'in'
        });
        results = await this._fetchJson(`${this.baseUrl}?${fallbackParams.toString()}`);
      }
    }

    return results;
  }
}

/**
 * Hospital Geocoding Service
 * Orchestrates lookup, caching, rate limiting, and accuracy validation.
 */
class HospitalGeocodingService {
  constructor(provider = null) {
    this.provider = provider || new NominatimGeocodingProvider();
    // In-memory cache for address lookups (keyed by addressHash)
    this.cache = new Map();
  }

  /**
   * Set or replace the geocoding provider (e.g. for testing or switching to self-hosted).
   */
  setProvider(provider) {
    this.provider = provider;
  }

  /**
   * Clears in-memory lookup cache.
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Validates result accuracy against Indian standards (Phase 6).
   */
  validateAccuracy(match, inputCity = '', inputState = '', inputPincode = '') {
    if (!match || !match.lat || !match.lon) {
      return { valid: false, reason: 'Missing coordinates in geocoder response' };
    }

    const lat = parseFloat(match.lat);
    const lon = parseFloat(match.lon);

    // 1. Geographically plausible Indian coordinates (6°-38°N, 68°-98°E)
    const coordVal = pincodeService.validateCoordinates(lat, lon);
    if (!coordVal.valid) {
      return { valid: false, reason: coordVal.error };
    }

    // 2. Country must be India
    const addr = match.address || {};
    const countryCode = (addr.country_code || '').toLowerCase();
    const country = (addr.country || '').toLowerCase();
    if (countryCode && countryCode !== 'in' && country && !country.includes('india')) {
      return { valid: false, reason: 'Returned location is outside India' };
    }

    // 3. Granularity & Precision evaluation
    const osmClass = (match.class || '').toLowerCase();
    const osmType = (match.type || '').toLowerCase();
    const placeRank = Number(match.place_rank) || 0;
    const addresstype = (match.addresstype || '').toLowerCase();

    // Reject country or state-level broad matches (do NOT assign as hospital coordinates)
    if (['country', 'state', 'continent'].includes(addresstype) || (match.place_rank !== undefined && placeRank <= 8)) {
      return {
        valid: false,
        reason: 'Geocoder matched country or state level only; cannot be used for hospital coordinates',
        tooBroad: true
      };
    }

    // 4. State consistency check
    if (inputState && addr.state) {
      const normInputState = normalizeAddressString(inputState);
      const normReturnedState = normalizeAddressString(addr.state);
      if (normInputState && normReturnedState && !normInputState.includes(normReturnedState) && !normReturnedState.includes(normInputState)) {
        return {
          valid: false,
          reason: `State mismatch: expected '${inputState}', received '${addr.state}'`,
          ambiguous: true
        };
      }
    }

    // 5. PIN code consistency check (if returned by Nominatim)
    if (inputPincode && addr.postcode) {
      const cleanInputPin = inputPincode.toString().trim();
      const cleanReturnedPin = addr.postcode.toString().trim();
      // First 2 digits indicate postal circle (e.g. 56 for Bangalore, 11 for Delhi)
      if (cleanInputPin.length === 6 && cleanReturnedPin.length === 6) {
        if (cleanInputPin.substring(0, 2) !== cleanReturnedPin.substring(0, 2)) {
          return {
            valid: false,
            reason: `PIN postal circle mismatch: input ${cleanInputPin} vs geocoder ${cleanReturnedPin}`,
            ambiguous: true
          };
        }
      }
    }

    // 6. Determine precision
    let precision = 'approximate';
    let isHighQuality = false;

    const highQualityClasses = ['amenity', 'building', 'healthcare', 'shop', 'office', 'highway', 'tourism'];
    const highQualityTypes = ['hospital', 'clinic', 'doctors', 'pharmacy', 'building', 'house', 'commercial'];

    if (highQualityClasses.includes(osmClass) || highQualityTypes.includes(osmType) || placeRank >= 26) {
      precision = 'exact';
      isHighQuality = true;
    } else if (['neighbourhood', 'suburb', 'residential', 'road', 'street', 'quarter'].includes(addresstype) || placeRank >= 20) {
      precision = 'interpolated';
      isHighQuality = true;
    } else if (addresstype === 'postcode' || osmType === 'postcode') {
      precision = 'approximate';
      isHighQuality = false;
    }

    return {
      valid: true,
      lat,
      lng: lon,
      precision,
      isHighQuality,
      details: {
        osmId: match.osm_id,
        osmType: match.osm_type,
        class: match.class,
        type: match.type,
        displayName: match.display_name,
        addresstype: match.addresstype,
        placeRank
      }
    };
  }

  /**
   * Master resolution method.
   * Priority:
   * 1. Manual correction (if flagged)
   * 2. Unchanged address check (cache / existingRecord verified match)
   * 3. Direct coordinates from onboarding / body (if valid)
   * 4. Google Maps URL coordinates extraction
   * 5. Address geocoding via configured provider (Nominatim)
   * 6. Graceful failure / pending without blocking creation
   */
  async resolveHospitalLocation(data = {}, options = {}) {
    const {
      name = '',
      address = '',
      city = '',
      state = '',
      pincode = '',
      country = 'India',
      googleMapUrl = '',
      latitude = null,
      longitude = null,
      existingRecord = null,
      isManualCorrection = false,
      forceRefresh = false
    } = data;

    const addressHash = computeAddressHash({ name, address, city, state, pincode, country });

    // Step 1: Manual Correction
    if (isManualCorrection && latitude !== null && longitude !== null && latitude !== '' && longitude !== '') {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const val = pincodeService.validateCoordinates(lat, lng);
      if (val.valid) {
        return {
          location: { type: 'Point', coordinates: [val.lng, val.lat] },
          geocodingStatus: 'verified',
          geocodingSource: 'manual_correction',
          geocodingPrecision: 'exact',
          geocodedAt: new Date(),
          addressHash
        };
      }
    }

    // Step 2: Unchanged address check with existing verified record
    if (!forceRefresh && existingRecord) {
      const existingHasCoords = existingRecord.location &&
        Array.isArray(existingRecord.location.coordinates) &&
        existingRecord.location.coordinates.length === 2 &&
        pincodeService.isValidCoordinates(existingRecord.location.coordinates[1], existingRecord.location.coordinates[0]);

      if (existingRecord.addressHash === addressHash && existingRecord.geocodingStatus === 'verified' && existingHasCoords) {
        return {
          location: existingRecord.location,
          geocodingStatus: 'verified',
          geocodingSource: existingRecord.geocodingSource || 'existing_coordinates',
          geocodingPrecision: existingRecord.geocodingPrecision || 'exact',
          geocodedAt: existingRecord.geocodedAt || new Date(),
          addressHash
        };
      }
    }

    // Step 3: Check in-memory cache for unchanged address
    if (!forceRefresh && this.cache.has(addressHash)) {
      const cached = this.cache.get(addressHash);
      if (cached && cached.geocodingStatus === 'verified') {
        return { ...cached, geocodedAt: new Date() };
      }
    }

    // Step 4: Existing / Direct Coordinates from Onboarding or Payload
    if (latitude !== null && longitude !== null && latitude !== '' && longitude !== '') {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const val = pincodeService.validateCoordinates(lat, lng);
      if (val.valid) {
        const result = {
          location: { type: 'Point', coordinates: [val.lng, val.lat] },
          geocodingStatus: 'verified',
          geocodingSource: 'existing_coordinates',
          geocodingPrecision: 'exact',
          geocodedAt: new Date(),
          addressHash
        };
        this.cache.set(addressHash, result);
        return result;
      }
    }

    // Step 5: Google Maps URL Coordinate Extraction
    if (googleMapUrl && typeof googleMapUrl === 'string' && googleMapUrl.trim()) {
      const extracted = pincodeService.extractCoordinatesFromGoogleMapsUrl(googleMapUrl.trim());
      if (extracted) {
        const val = pincodeService.validateCoordinates(extracted.latitude, extracted.longitude);
        if (val.valid) {
          const result = {
            location: { type: 'Point', coordinates: [val.lng, val.lat] },
            geocodingStatus: 'verified',
            geocodingSource: 'google_maps_url',
            geocodingPrecision: 'exact',
            geocodedAt: new Date(),
            addressHash
          };
          this.cache.set(addressHash, result);
          return result;
        }
      }
    }

    // Step 6: Address Geocoding via Configured Provider
    const hasAddress = Boolean(address && address.trim());
    const hasPin = Boolean(pincode && pincode.toString().trim());

    if (!hasAddress && !hasPin) {
      return {
        location: null,
        geocodingStatus: 'failed',
        geocodingSource: null,
        geocodingPrecision: 'unknown',
        geocodedAt: new Date(),
        addressHash,
        error: 'Address and PIN code are empty'
      };
    }

    try {
      const matches = await this.provider.geocode({
        name,
        address,
        city,
        state,
        pincode,
        country
      });

      if (Array.isArray(matches) && matches.length > 0) {
        // Evaluate candidates
        let bestCandidate = null;
        let bestAccuracy = null;

        for (const candidate of matches) {
          const acc = this.validateAccuracy(candidate, city, state, pincode);
          if (acc.valid) {
            if (acc.isHighQuality) {
              bestCandidate = candidate;
              bestAccuracy = acc;
              break;
            } else if (!bestCandidate) {
              bestCandidate = candidate;
              bestAccuracy = acc;
            }
          }
        }

        if (bestCandidate && bestAccuracy) {
          // If high quality match (exact or street/neighbourhood level)
          if (bestAccuracy.isHighQuality) {
            const result = {
              location: { type: 'Point', coordinates: [bestAccuracy.lng, bestAccuracy.lat] },
              geocodingStatus: 'verified',
              geocodingSource: 'address',
              geocodingPrecision: bestAccuracy.precision,
              geocodedAt: new Date(),
              addressHash,
              geocodingDetails: bestAccuracy.details
            };
            this.cache.set(addressHash, result);
            return result;
          }

          // If result was only approximate (postcode level centroid)
          const result = {
            location: { type: 'Point', coordinates: [bestAccuracy.lng, bestAccuracy.lat] },
            geocodingStatus: 'needs_review',
            geocodingSource: 'pincode_approximate',
            geocodingPrecision: 'approximate',
            geocodedAt: new Date(),
            addressHash,
            geocodingDetails: bestAccuracy.details,
            notice: 'Matched at postal code / locality centroid; flagged for administrative review'
          };
          this.cache.set(addressHash, result);
          return result;
        }
      }

      // No confident geocoder match. Check if PIN centroid fallback is available.
      // NOTE: Phase 5 & 6 requirement: Do not assign PIN centroid as exact hospital coordinates; mark needs_review.
      if (hasPin) {
        const pinCentroid = await pincodeService.resolvePincode(pincode);
        if (pinCentroid && pinCentroid.coordinates) {
          const result = {
            location: { type: 'Point', coordinates: pinCentroid.coordinates },
            geocodingStatus: 'needs_review',
            geocodingSource: 'pincode_approximate',
            geocodingPrecision: 'approximate',
            geocodedAt: new Date(),
            addressHash,
            notice: 'Offline PIN code centroid fallback; flagged for administrative review'
          };
          this.cache.set(addressHash, result);
          return result;
        }
      }

      // Completely unresolvable
      const failedResult = {
        location: null,
        geocodingStatus: 'needs_review',
        geocodingSource: null,
        geocodingPrecision: 'unknown',
        geocodedAt: new Date(),
        addressHash,
        error: 'Address could not be resolved reliably by geocoder'
      };
      this.cache.set(addressHash, failedResult);
      return failedResult;

    } catch (geoErr) {
      // Temporary network or timeout failure: do NOT crash or block hospital creation
      console.warn(`[HospitalGeocoding] Provider lookup failed: ${geoErr.message}`);

      // If we have an offline PIN code centroid, we can provide approximate coordinates with 'needs_review'
      if (hasPin) {
        const pinCentroid = await pincodeService.resolvePincode(pincode);
        if (pinCentroid && pinCentroid.coordinates) {
          return {
            location: { type: 'Point', coordinates: pinCentroid.coordinates },
            geocodingStatus: 'needs_review',
            geocodingSource: 'pincode_approximate',
            geocodingPrecision: 'approximate',
            geocodedAt: new Date(),
            addressHash,
            notice: `External geocoder temporary failure (${geoErr.message}); used approximate PIN centroid`
          };
        }
      }

      return {
        location: null,
        geocodingStatus: 'failed',
        geocodingSource: null,
        geocodingPrecision: 'unknown',
        geocodedAt: new Date(),
        addressHash,
        error: geoErr.message
      };
    }
  }
}

// Singleton instance
const defaultService = new HospitalGeocodingService();

module.exports = {
  HospitalGeocodingService,
  NominatimGeocodingProvider,
  BaseGeocodingProvider,
  computeAddressHash,
  normalizeAddressString,
  resolveHospitalLocation: (data, opts) => defaultService.resolveHospitalLocation(data, opts),
  clearCache: () => defaultService.clearCache(),
  setProvider: (p) => defaultService.setProvider(p),
  defaultService
};
