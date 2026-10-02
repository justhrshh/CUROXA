const Counter = require('../models/Counter');
const GlobalVendor = require('../models/GlobalVendor');
const VendorRequest = require('../models/VendorRequest');

/**
 * Concurrency-safe generator for Global Vendor Codes: VND-YYYY-XXXX
 */
async function getNextGlobalVendorCode() {
  const year = new Date().getFullYear();
  const counterKey = `global_vendor_code_${year}`;

  let counter = await Counter.findOne({ key: counterKey });
  if (!counter) {
    const highestVendor = await GlobalVendor.findOne({
      supplierCode: new RegExp(`^VND-${year}-`)
    }).sort({ supplierCode: -1 }).lean();

    let initialSeq = 0;
    if (highestVendor && highestVendor.supplierCode) {
      const parts = highestVendor.supplierCode.split('-');
      if (parts.length === 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num)) initialSeq = num;
      }
    }

    await Counter.findOneAndUpdate(
      { key: counterKey },
      { $setOnInsert: { seq: initialSeq } },
      { upsert: true }
    );
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    const updatedCounter = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );

    const candidate = `VND-${year}-${String(updatedCounter.seq).padStart(4, '0')}`;
    const exists = await GlobalVendor.findOne({ supplierCode: candidate }).lean();
    if (!exists) {
      return candidate;
    }
  }

  return `VND-${year}-${Date.now().toString().slice(-4)}`;
}

/**
 * Concurrency-safe generator for Vendor Request Numbers: VNR-YYYY-XXXX
 */
async function getNextVendorRequestNo() {
  const year = new Date().getFullYear();
  const counterKey = `vendor_request_no_${year}`;

  let counter = await Counter.findOne({ key: counterKey });
  if (!counter) {
    const highestRequest = await VendorRequest.findOne({
      requestNo: new RegExp(`^VNR-${year}-`)
    }).sort({ requestNo: -1 }).lean();

    let initialSeq = 0;
    if (highestRequest && highestRequest.requestNo) {
      const parts = highestRequest.requestNo.split('-');
      if (parts.length === 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num)) initialSeq = num;
      }
    }

    await Counter.findOneAndUpdate(
      { key: counterKey },
      { $setOnInsert: { seq: initialSeq } },
      { upsert: true }
    );
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    const updatedCounter = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );

    const candidate = `VNR-${year}-${String(updatedCounter.seq).padStart(4, '0')}`;
    const exists = await VendorRequest.findOne({ requestNo: candidate }).lean();
    if (!exists) {
      return candidate;
    }
  }

  return `VNR-${year}-${Date.now().toString().slice(-4)}`;
}

module.exports = {
  getNextGlobalVendorCode,
  getNextVendorRequestNo
};
