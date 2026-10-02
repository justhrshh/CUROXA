const mongoose = require('mongoose');
const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');

/**
 * masterMatchingEngine.js
 * 
 * Context-Scoped Deterministic Matching Engine.
 * 
 * Strict Invariant:
 * Every match candidate MUST satisfy:
 *   candidate.scope === 'GLOBAL'
 *   AND candidate.category === upload.category
 *   AND (upload.category === 'Assets' ? true : candidate.department === upload.department)
 * 
 * An ItemCode can NEVER cross category or department boundaries.
 */

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function matchParsedRows(parsedRows, tenantIdOrGlobalCandidates, categoryOrExistingConfigs, departmentOrCategory, maybeDepartment) {
  let globalCandidates = [];
  let existingTenantConfigs = [];
  let category = '';
  let department = '';

  if (Array.isArray(tenantIdOrGlobalCandidates)) {
    // In-memory invocation: (parsedRows, globalCandidates, existingConfigs, category, department)
    globalCandidates = tenantIdOrGlobalCandidates;
    existingTenantConfigs = Array.isArray(categoryOrExistingConfigs) ? categoryOrExistingConfigs : [];
    category = departmentOrCategory || '';
    department = maybeDepartment || '';
  } else {
    // Database invocation: (parsedRows, tenantId, category, department)
    const tenantId = tenantIdOrGlobalCandidates;
    category = categoryOrExistingConfigs || '';
    department = departmentOrCategory || '';

    const contextQuery = {
      scope: 'GLOBAL',
      category: category
    };
    const isSpecificDept = category !== 'Assets' && department && department !== 'all' && department.trim() !== '';
    if (isSpecificDept) {
      contextQuery.department = department.trim();
    }
    globalCandidates = await ItemMaster.find(contextQuery).lean();
    existingTenantConfigs = await HospitalMasterConfig.find({ tenantId }).lean();
  }

  const isSpecificContextDept = category !== 'Assets' && department && department !== 'all' && department.trim() !== '';

  // Filter candidates strictly according to category and scope invariants
  const eligibleCandidates = globalCandidates.filter(c => {
    if (c.scope && c.scope !== 'GLOBAL') return false;
    if (c.category && category && c.category.toLowerCase() !== category.toLowerCase()) return false;
    if (isSpecificContextDept && c.department && c.department.toLowerCase() !== department.trim().toLowerCase()) {
      return false;
    }
    return true;
  });

  const existingConfigMap = new Map();
  existingTenantConfigs.forEach(c => {
    if (c.masterItemId) {
      existingConfigMap.set(c.masterItemId.toString(), c);
    }
  });

  const matchedRows = [];

  for (const row of parsedRows) {
    const raw = row.rawRowData || row.sourceData || {};
    let matchType = 'NO_MATCH';
    let matchedItem = null;
    let candidates = [];

    const rowItemCode = (raw.itemCode || raw.testCode || raw.serviceCode || raw.assetCode || row.extractedItemCode || '').toString().trim().toUpperCase();
    const rowItemName = (raw.itemName || raw.testName || raw.serviceName || raw.assetName || raw['Item Name'] || raw['Test Name'] || raw['Service Name'] || raw['Asset Name'] || row.extractedItemName || '').toString().trim();
    const rowPricing = row.importedPricing || row.extractedPricing || {};
    const rowDept = (raw.department || '').toString().trim();

    // Scope candidates for this row: if category has departments and row provides a department,
    // ensure candidate matches that row's department (prevents cross-department matches in category-wide uploads)
    const rowCandidates = eligibleCandidates.filter(c => {
      if (isSpecificContextDept) return true;
      if (category !== 'Assets' && rowDept && c.department) {
        return c.department.toLowerCase() === rowDept.toLowerCase();
      }
      return true;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 1: CANONICAL ItemCode EXACT MATCH (WITHIN CONTEXT)
    // ─────────────────────────────────────────────────────────────────────────
    if (rowItemCode) {
      const codeMatches = rowCandidates.filter(c => c.itemCode && c.itemCode.toUpperCase() === rowItemCode);
      if (codeMatches.length === 1) {
        matchType = 'EXACT_MATCH';
        matchedItem = codeMatches[0];
      } else if (codeMatches.length > 1) {
        matchType = 'AMBIGUOUS_MATCH';
        candidates = codeMatches;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 2 / 3: CATEGORY-SPECIFIC DETERMINISTIC ATTRIBUTES
    // ─────────────────────────────────────────────────────────────────────────
    if (!matchedItem && matchType !== 'AMBIGUOUS_MATCH') {
      if (category === 'Lab Operation') {
        // Tier 2: catalogNo + manufactureName
        if (raw.catalogNo && raw.manufactureName && String(raw.catalogNo).trim() && String(raw.manufactureName).trim()) {
          const catMfgMatches = rowCandidates.filter(c =>
            normalize(c.catalogNo) === normalize(raw.catalogNo) &&
            normalize(c.manufactureName) === normalize(raw.manufactureName)
          );
          if (catMfgMatches.length === 1) {
            matchType = 'SAFE_DETERMINISTIC_MATCH';
            matchedItem = catMfgMatches[0];
          } else if (catMfgMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = catMfgMatches;
          }
        }

        // Tier 3: makeandModelNo + hsnCode
        if (!matchedItem && raw.makeandModelNo && raw.hsnCode && String(raw.makeandModelNo).trim()) {
          const modelHsnMatches = rowCandidates.filter(c =>
            normalize(c.makeandModelNo) === normalize(raw.makeandModelNo) &&
            normalize(c.hsnCode) === normalize(raw.hsnCode)
          );
          if (modelHsnMatches.length === 1) {
            matchType = 'SAFE_DETERMINISTIC_MATCH';
            matchedItem = modelHsnMatches[0];
          } else if (modelHsnMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = modelHsnMatches;
          }
        }

        // Tier 4: Normalized Name
        if (!matchedItem && rowItemName) {
          const nameMatches = rowCandidates.filter(c => normalize(c.itemName) === normalize(rowItemName));
          if (nameMatches.length === 1) {
            matchType = 'SAFE_DETERMINISTIC_MATCH';
            matchedItem = nameMatches[0];
          } else if (nameMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = nameMatches;
          }
        }
      } else if (category === 'Pharmacy') {
        // Tier 2: genericName + strength + dosageForm + manufactureName
        if (raw.genericName && raw.strength) {
          const clinicalMatches = rowCandidates.filter(c =>
            normalize(c.genericName) === normalize(raw.genericName) &&
            normalize(c.strength) === normalize(raw.strength) &&
            (!raw.dosageForm || normalize(c.dosageForm) === normalize(raw.dosageForm)) &&
            (!raw.manufactureName || normalize(c.manufactureName) === normalize(raw.manufactureName))
          );
          if (clinicalMatches.length === 1) {
            matchType = 'SAFE_DETERMINISTIC_MATCH';
            matchedItem = clinicalMatches[0];
          } else if (clinicalMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = clinicalMatches;
          }
        }

        // Tier 3: itemName + manufactureName
        if (!matchedItem && rowItemName) {
          const brandMatches = rowCandidates.filter(c =>
            normalize(c.itemName) === normalize(rowItemName) &&
            (!raw.manufactureName || normalize(c.manufactureName) === normalize(raw.manufactureName))
          );
          if (brandMatches.length === 1) {
            matchType = 'SAFE_DETERMINISTIC_MATCH';
            matchedItem = brandMatches[0];
          } else if (brandMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = brandMatches;
          }
        }
      } else if (category === 'Pathology') {
        // Tier 2: itemName + sampleType within department
        if (rowItemName) {
          const pathMatches = rowCandidates.filter(c =>
            normalize(c.itemName) === normalize(rowItemName) &&
            (!raw.sampleType || normalize(c.sampleType) === normalize(raw.sampleType))
          );
          if (pathMatches.length === 1) {
            matchType = 'SAFE_DETERMINISTIC_MATCH';
            matchedItem = pathMatches[0];
          } else if (pathMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = pathMatches;
          }
        }
      } else if (category === 'Service') {
        // Tier 1: doctorId (only when non-empty)
        if (raw.doctorId && String(raw.doctorId).trim()) {
          const docIdMatches = rowCandidates.filter(c => normalize(c.doctorId) === normalize(raw.doctorId));
          if (docIdMatches.length === 1) {
            matchType = 'EXACT_MATCH';
            matchedItem = docIdMatches[0];
          } else if (docIdMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = docIdMatches;
          }
        }

        // Tier 2: doctorsName + itemTypeName within OPD
        if (!matchedItem && raw.doctorsName && String(raw.doctorsName).trim()) {
          const docNameMatches = rowCandidates.filter(c =>
            normalize(c.doctorsName) === normalize(raw.doctorsName) &&
            (!raw.itemTypeName || normalize(c.itemTypeName) === normalize(raw.itemTypeName))
          );
          if (docNameMatches.length === 1) {
            matchType = 'SAFE_DETERMINISTIC_MATCH';
            matchedItem = docNameMatches[0];
          } else if (docNameMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = docNameMatches;
          }
        }
        
        // Tier 3: Item Name for Services
        if (!matchedItem && rowItemName) {
          const nameMatches = rowCandidates.filter(c => normalize(c.itemName) === normalize(rowItemName));
          if (nameMatches.length === 1) {
            matchType = 'SAFE_DETERMINISTIC_MATCH';
            matchedItem = nameMatches[0];
          } else if (nameMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = nameMatches;
          }
        }
      } else if (category === 'Assets') {
        // Tier 2: itemName + manufactureName + hsnCode
        if (rowItemName) {
          const assetMatches = rowCandidates.filter(c =>
            normalize(c.itemName) === normalize(rowItemName) &&
            (!raw.manufactureName || normalize(c.manufactureName) === normalize(raw.manufactureName)) &&
            (!raw.hsnCode || normalize(c.hsnCode) === normalize(raw.hsnCode))
          );
          if (assetMatches.length === 1) {
            matchType = 'SAFE_DETERMINISTIC_MATCH';
            matchedItem = assetMatches[0];
          } else if (assetMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = assetMatches;
          }
        }
      } else {
        // Default Tier: Name Match
        if (!matchedItem && rowItemName) {
          const nameMatches = eligibleCandidates.filter(c => normalize(c.itemName) === normalize(rowItemName));
          if (nameMatches.length === 1) {
            matchType = 'SAFE_DETERMINISTIC_MATCH';
            matchedItem = nameMatches[0];
          } else if (nameMatches.length > 1) {
            matchType = 'AMBIGUOUS_MATCH';
            candidates = nameMatches;
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. SELECTION STATE & REPRICING INSPECTION
    // ─────────────────────────────────────────────────────────────────────────
    const mrpRaw = rowPricing.mrp;
    const hasPrice = mrpRaw !== undefined && mrpRaw !== null && mrpRaw !== '';
    const isSelected = Boolean(hasPrice);

    let existingPricing = null;
    let isRepricing = false;
    let pricingDiff = { hasDiff: false, diffs: {} };
    let selectionStatus = isSelected ? 'SELECTED' : 'NOT_SELECTED';

    if (matchedItem) {
      const existingConfig = existingConfigMap.get(matchedItem._id.toString());
      if (existingConfig) {
        existingPricing = {
          mrp: existingConfig.mrp !== undefined ? existingConfig.mrp : null,
          netRate: existingConfig.netRate !== undefined ? existingConfig.netRate : null,
          hospitalCost: existingConfig.hospitalCost !== undefined ? existingConfig.hospitalCost : null
        };

        if (isSelected) {
          const mrpDiff = rowPricing.mrp !== undefined && rowPricing.mrp !== null && rowPricing.mrp !== existingConfig.mrp;
          const netRateDiff = rowPricing.netRate !== undefined && rowPricing.netRate !== null && rowPricing.netRate !== existingConfig.netRate;
          const costDiff = rowPricing.hospitalCost !== undefined && rowPricing.hospitalCost !== null && rowPricing.hospitalCost !== existingConfig.hospitalCost;

          if (mrpDiff || netRateDiff || costDiff) {
            isRepricing = true;
            selectionStatus = 'REPRICING';
            pricingDiff = {
              hasDiff: true,
              diffs: {
                mrp: { current: existingConfig.mrp, imported: rowPricing.mrp, changed: mrpDiff },
                netRate: { current: existingConfig.netRate, imported: rowPricing.netRate, changed: netRateDiff },
                hospitalCost: { current: existingConfig.hospitalCost, imported: rowPricing.hospitalCost, changed: costDiff }
              }
            };
          } else {
            selectionStatus = 'EXISTING_UNCHANGED';
          }
        } else {
          // If not selected in workbook, it retains existing config without repricing
          selectionStatus = 'NOT_SELECTED';
          isRepricing = false;
        }
      } else {
        if (isSelected) {
          selectionStatus = 'NEW_SELECTION';
        } else {
          selectionStatus = 'NOT_SELECTED';
        }
      }
    }

    const matchStatus = matchType === 'SAFE_DETERMINISTIC_MATCH' ? 'SAFE_MATCH' : matchType === 'AMBIGUOUS_MATCH' ? 'AMBIGUOUS' : matchType;

    matchedRows.push({
      rowNumber: row.rowNumber,
      sourceRowHash: row.sourceRowHash,
      rawRowData: raw,
      sourceData: row.sourceData || raw,
      matchType,
      matchStatus,
      isSelected,
      selectionStatus,
      masterItemId: matchedItem ? matchedItem._id : null,
      matchedMasterItemId: matchedItem ? matchedItem._id : null,
      matchedItem: matchedItem,
      canonicalItemCode: matchedItem ? matchedItem.itemCode : '',
      canonicalItemName: matchedItem ? (matchedItem.itemName || matchedItem.genericName) : '',
      candidateMasterItemIds: candidates.map(c => c._id),
      candidates: candidates.map(c => ({ masterItemId: c._id, itemCode: c.itemCode, itemName: c.itemName || c.genericName })),
      importedPricing: rowPricing,
      extractedPricing: rowPricing,
      existingPricing,
      isRepricing,
      pricingDiff,
      validationErrors: row.validationErrors || []
    });
  }

  // Summary object attached to array for dual usage
  const summary = {
    totalRows: matchedRows.length,
    selected: matchedRows.filter(r => r.isSelected).length,
    notSelected: matchedRows.filter(r => !r.isSelected).length,
    newSelected: matchedRows.filter(r => r.isSelected && r.selectionStatus === 'NEW_SELECTION').length,
    existingCount: matchedRows.filter(r => r.isSelected && r.selectionStatus === 'EXISTING_UNCHANGED').length,
    repricingDiffs: matchedRows.filter(r => r.isRepricing || (r.pricingDiff && r.pricingDiff.hasDiff)).length,
    exactMatch: matchedRows.filter(r => r.matchType === 'EXACT_MATCH' || r.matchStatus === 'EXACT_MATCH').length,
    safeMatch: matchedRows.filter(r => r.matchType === 'SAFE_DETERMINISTIC_MATCH' || r.matchStatus === 'SAFE_MATCH').length,
    ambiguous: matchedRows.filter(r => r.matchType === 'AMBIGUOUS_MATCH' || r.matchStatus === 'AMBIGUOUS').length,
    unmatched: matchedRows.filter(r => r.matchType === 'NO_MATCH' || r.matchStatus === 'NO_MATCH').length
  };

  matchedRows.summary = summary;
  matchedRows.rows = matchedRows;

  return matchedRows;
}

module.exports = {
  matchParsedRows,
  matchUploadedRows: matchParsedRows
};
