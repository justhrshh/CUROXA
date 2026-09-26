/**
 * QUROXA HOSPITAL ERP — AUTHORITATIVE PACKAGING UNITS CONFIGURATION & VALIDATION
 * Controlled packaging vocabulary, dynamic conversion calculations, and semantic unit validation.
 */

// 1. Controlled Packaging / Procurement Units
export const PACKAGING_PURCHASE_UNITS = [
  'Box',
  'Carton',
  'Case',
  'Bottle',
  'Pack',
  'Strip',
  'Tube',
  'Pouch',
  'Roll',
  'Pair',
  'Piece',
  'Unit',
  'Set'
];

// 2. Controlled Intermediate Packaging Units
export const INTERMEDIATE_PACKAGING_UNITS = [
  'Strip',
  'Box',
  'Pack',
  'Pouch',
  'Case',
  'Roll',
  'Set'
];

// 3. Controlled Consumption / Individual Units (NO liquid volume units like ml/Litre)
export const CONSUMPTION_INDIVIDUAL_UNITS = [
  'Tablet',
  'Capsule',
  'Sachet',
  'Piece',
  'Mask',
  'Bandage',
  'Syringe',
  'Vial',
  'Ampoule',
  'Bottle',
  'Tube',
  'Roll',
  'Pair',
  'Unit'
];

// Backward-compatible aliases
export const PROCUREMENT_UNITS = PACKAGING_PURCHASE_UNITS;
export const BREAKDOWN_UNITS = [...new Set([...INTERMEDIATE_PACKAGING_UNITS, ...CONSUMPTION_INDIVIDUAL_UNITS])];
export const CONSUMPTION_UNITS = CONSUMPTION_INDIVIDUAL_UNITS;

/**
 * Calculates authoritative conversion factor from packaging levels.
 * conversionFactor = quantityLevel1 × quantityLevel2 × ... × quantityLevelN
 * Returns 1 for complete unit items (as-is).
 */
export function calculateConversionFactor(isBrokenDown, levels = []) {
  if (!isBrokenDown || !Array.isArray(levels) || levels.length === 0) {
    return 1;
  }
  const factor = levels.reduce((acc, lvl) => {
    const q = Number(lvl.quantity);
    return acc * (Number.isFinite(q) && q > 0 ? q : 1);
  }, 1);
  return Math.max(1, factor);
}

/**
 * Derives the inventory consumption unit.
 * If not broken down: consumption unit === purchased unit.
 * If broken down: consumption unit === last level's child unit.
 */
export function getDerivedConsumptionUnit(purchasedUnit, isBrokenDown, levels = []) {
  const pUnit = (purchasedUnit || 'Unit').trim();
  if (!isBrokenDown || !Array.isArray(levels) || levels.length === 0) {
    return pUnit;
  }
  const lastLevel = levels[levels.length - 1];
  return (lastLevel && lastLevel.childUnit) ? lastLevel.childUnit.trim() : pUnit;
}

/**
 * Validates a packaging chain for adjacent or identical unit errors.
 * Returns null if valid, or an error string if invalid.
 */
export function validatePackagingUnits(purchasedUnit, isBrokenDown, levels = []) {
  if (!isBrokenDown || !Array.isArray(levels) || levels.length === 0) {
    return null;
  }

  const pUnit = (purchasedUnit || '').trim().toLowerCase();
  const chain = [pUnit];

  for (let i = 0; i < levels.length; i++) {
    const lvl = levels[i];
    const parent = (lvl.parentUnit || (i === 0 ? purchasedUnit : levels[i - 1]?.childUnit) || '').trim().toLowerCase();
    const child = (lvl.childUnit || '').trim().toLowerCase();
    const qty = Number(lvl.quantity);

    if (!child) {
      return `Level ${i + 1} unit is required.`;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      return `Level ${i + 1} quantity must be 1 or greater.`;
    }

    // A packaging level must never have the same unit as the level immediately below it
    if (parent && parent === child) {
      return 'Each packaging level must use a different unit.';
    }

    // No duplicate adjacent units in chain
    if (chain.length > 0 && chain[chain.length - 1] === child) {
      return 'Each packaging level must use a different unit.';
    }

    chain.push(child);
  }

  return null;
}

/**
 * Formats unit name with pluralization where appropriate.
 */
function formatUnitPlural(qty, unit) {
  if (!unit) return '';
  const trimmed = unit.trim();
  if (qty === 1) return trimmed;
  if (trimmed.endsWith('s') || trimmed.toLowerCase() === 'set') return trimmed;
  if (trimmed.endsWith('x') || trimmed.endsWith('ch') || trimmed.endsWith('sh')) return `${trimmed}es`;
  return `${trimmed}s`;
}

/**
 * Automatically generates a clean, concise pack size description.
 * Examples:
 * - As-is Bottle: "Bottle — sold as individual unit"
 * - Box -> 50 Masks: "50 Masks / Box"
 * - Box -> 10 Strips -> 10 Tablets: "10 Strips × 10 Tablets (100 Tablets / Box)"
 */
export function generatePackSizeDescription(purchasedUnit, isBrokenDown, levels = []) {
  const pUnit = (purchasedUnit || 'Unit').trim();
  if (!isBrokenDown || !Array.isArray(levels) || levels.length === 0) {
    return `${pUnit} — sold as individual unit`;
  }

  const factor = calculateConversionFactor(true, levels);
  const finalUnit = getDerivedConsumptionUnit(purchasedUnit, true, levels);

  if (levels.length === 1) {
    const l1 = levels[0];
    const qty = Number(l1.quantity) || 1;
    const unitStr = formatUnitPlural(qty, l1.childUnit || 'Unit');
    return `${qty} ${unitStr} / ${pUnit}`;
  }

  const parts = levels.map((lvl) => {
    const q = Number(lvl.quantity) || 1;
    return `${q} ${formatUnitPlural(q, lvl.childUnit || 'Unit')}`;
  });
  const finalPlural = formatUnitPlural(factor, finalUnit);
  return `${parts.join(' × ')} (${factor.toLocaleString()} ${finalPlural} / ${pUnit})`;
}
