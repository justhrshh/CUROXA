const Counter = require('../models/Counter');
const ItemMaster = require('../models/ItemMaster');
const { getCategoryConfig } = require('../config/masterSchemaRegistry');

/**
 * Prefix and digit length rules per category
 * Verified against client Excel workbook:
 * - Lab Operation: Prefix 99, 9 digits total (e.g. 990000001)
 * - Pharmacy: Prefix 98, 9 digits total (e.g. 980000001)
 * - Pathology: Prefix 95, 8 digits total (e.g. 95000001)
 * - Service: Prefix 94, 9 digits total (e.g. 940000001)
 * - Assets: Prefix 73, 10 digits total (e.g. 7300000001)
 */
const CATEGORY_CODE_RULES = {
  'Lab Operation': { prefix: '99', totalDigits: 9 },
  'Pharmacy': { prefix: '98', totalDigits: 9 },
  'Pathology': { prefix: '95', totalDigits: 8 },
  'Service': { prefix: '94', totalDigits: 9 },
  'Assets': { prefix: '73', totalDigits: 10 }
};

/**
 * Concurrency-safe atomic ItemCode generator respecting client numbering series
 * @param {string} category - Category name from Master Schema Registry
 * @param {string} tenantId - '__global__' for canonical catalog or specific tenant
 * @returns {Promise<string>} Next unique, non-colliding ItemCode
 */
async function getNextMasterItemCode(category, tenantId = '__global__') {
  const rule = CATEGORY_CODE_RULES[category];
  
  if (!rule) {
    // Fallback to standard Quroxa format: ITM-YYYY-XXXX
    const year = new Date().getFullYear();
    const counterKey = `item_master_${tenantId}_${year}`;
    let counter = await Counter.findOne({ key: counterKey });
    if (!counter) {
      const highest = await ItemMaster.findOne({
        itemCode: new RegExp(`^ITM-${year}-`)
      }).sort({ itemCode: -1 }).lean();

      let init = 0;
      if (highest && highest.itemCode) {
        const parts = highest.itemCode.split('-');
        if (parts.length === 3) {
          const parsed = parseInt(parts[2], 10);
          if (!isNaN(parsed)) init = parsed;
        }
      }
      await Counter.findOneAndUpdate({ key: counterKey }, { $setOnInsert: { seq: init } }, { upsert: true });
    }

    for (let i = 0; i < 20; i++) {
      const c = await Counter.findOneAndUpdate({ key: counterKey }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
      const candidate = `ITM-${year}-${String(c.seq).padStart(4, '0')}`;
      const exists = await ItemMaster.findOne({ itemCode: candidate }).lean();
      if (!exists) return candidate;
    }
    return `ITM-${year}-${Date.now().toString().slice(-4)}`;
  }

  const { prefix, totalDigits } = rule;
  const seqDigits = totalDigits - prefix.length;
  const counterKey = `master_item_seq_${prefix}`;

  // Check if counter document exists; if not, initialize from highest existing item code
  let counter = await Counter.findOne({ key: counterKey });
  if (!counter) {
    const highestItem = await ItemMaster.findOne({
      itemCode: new RegExp(`^${prefix}\\d{${seqDigits}}$`)
    }).sort({ itemCode: -1 }).lean();

    let initialSeq = 0;
    if (highestItem && highestItem.itemCode) {
      const numericSeq = parseInt(highestItem.itemCode.slice(prefix.length), 10);
      if (!isNaN(numericSeq)) initialSeq = numericSeq;
    }

    await Counter.findOneAndUpdate(
      { key: counterKey },
      { $setOnInsert: { seq: initialSeq } },
      { upsert: true }
    );
  }

  // Atomic increment with retry collision check
  for (let attempt = 0; attempt < 25; attempt++) {
    const updatedCounter = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    const candidateCode = `${prefix}${String(updatedCounter.seq).padStart(seqDigits, '0')}`;
    const exists = await ItemMaster.findOne({ itemCode: candidateCode }).lean();
    if (!exists) {
      return candidateCode;
    }
  }

  // Fallback timestamp-based code matching format length
  return `${prefix}${Date.now().toString().slice(-seqDigits)}`;
}

module.exports = {
  CATEGORY_CODE_RULES,
  getNextMasterItemCode
};
