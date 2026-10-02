const mongoose = require('mongoose');
const HospitalMasterImportSession = require('../models/HospitalMasterImportSession');
const HospitalMasterImportAudit = require('../models/HospitalMasterImportAudit');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const ItemMaster = require('../models/ItemMaster');
const Counter = require('../models/Counter');
const SuperAdminAudit = require('../models/SuperAdminAudit');

/**
 * hospitalCatalogIngestionService.js
 * 
 * Server-authoritative transactional ingestion service.
 * Enforces:
 * 1. Revalidation of server session snapshot (rejects expired/committed sessions).
 * 2. Strict tamper prevention: prices and canonical IDs pulled exclusively from server snapshot.
 * 3. Ambiguous resolution whitelist validation against candidateMasterItemIds.
 * 4. Repricing policy enforcement (requires explicit allowRepricing flag).
 * 5. Multi-dimensional pricing audit snapshot.
 * 6. ACID transaction across config writes, audit creation, and session transition.
 */

async function getNextBatchId(year = new Date().getFullYear()) {
  const key = `hospital_import_${year}`;
  const c = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return `IMP-${year}-${String(c.seq).padStart(4, '0')}`;
}

async function confirmImportSession({
  previewId,
  tenantId,
  category,
  department,
  allowRepricing = false,
  ambiguousResolutions = {},
  superAdminUser = {}
}) {
  if (!previewId) {
    throw new Error('previewId is required for import confirmation.');
  }

  // 1. Fetch Session Snapshot from DB
  const session = await HospitalMasterImportSession.findOne({ previewId });
  if (!session) {
    const err = new Error('Preview session not found.');
    err.statusCode = 404;
    throw err;
  }

  // 2. Validate Session Ownership & Context Binding
  if (session.tenantId !== tenantId) {
    const mismatchErr = new Error(`Tenant mismatch: Session belongs to "${session.tenantId}", requested "${tenantId}".`);
    mismatchErr.statusCode = 400;
    throw mismatchErr;
  }

  if (category && session.category !== category) {
    const catMismatchErr = new Error(`Category mismatch: Session was created for "${session.category}", requested "${category}".`);
    catMismatchErr.statusCode = 400;
    throw catMismatchErr;
  }

  if (department !== undefined && session.department !== department) {
    const deptMismatchErr = new Error(`Department mismatch: Session was created for "${session.department || ''}", requested "${department || ''}".`);
    deptMismatchErr.statusCode = 400;
    throw deptMismatchErr;
  }

  // 3. Status Guard
  if (session.status === 'COMMITTED') {
    const committedErr = new Error('This preview session has already been committed and cannot be replayed.');
    committedErr.statusCode = 400;
    throw committedErr;
  }
  if (session.status === 'DISCARDED') {
    const discardedErr = new Error('This preview session has been discarded.');
    discardedErr.statusCode = 400;
    throw discardedErr;
  }

  // 4. Expiration Guard (now >= expiresAt)
  const now = Date.now();
  if (now >= session.expiresAt.getTime() || session.status === 'EXPIRED') {
    session.status = 'EXPIRED';
    await session.save();
    const expiredErr = new Error('Preview session has expired. Please re-upload the workbook to generate a fresh preview.');
    expiredErr.statusCode = 410;
    expiredErr.code = 'ERR_PREVIEW_EXPIRED';
    throw expiredErr;
  }

  // 5. Revalidate Ambiguous Selections
  // Whitelist guard: Each resolved candidate must strictly belong to that row's candidateMasterItemIds
  const resolvedMasterItemMap = new Map();
  if (ambiguousResolutions && typeof ambiguousResolutions === 'object') {
    for (const [rowNumStr, chosenId] of Object.entries(ambiguousResolutions)) {
      const rowNum = parseInt(rowNumStr, 10);
      const rowObj = session.rows.find(r => r.rowNumber === rowNum);
      if (!rowObj) continue;

      const isCandidateValid = (rowObj.candidateMasterItemIds || []).some(cid => cid.toString() === chosenId);
      if (!isCandidateValid) {
        const tamperedErr = new Error(`Security Exception: Selected master item "${chosenId}" for Row ${rowNum} is not a valid server candidate.`);
        tamperedErr.statusCode = 400;
        throw tamperedErr;
      }

      // Verify that chosen candidate exists in GLOBAL scope
      const globalItem = await ItemMaster.findOne({ _id: chosenId, scope: 'GLOBAL' }).lean();
      if (!globalItem) {
        const notFoundErr = new Error(`Selected master item "${chosenId}" does not exist in GLOBAL scope.`);
        notFoundErr.statusCode = 404;
        throw notFoundErr;
      }

      resolvedMasterItemMap.set(rowNum, globalItem);
    }
  }

  // 6. Execute Ingestion Transaction
  const isProduction = process.env.NODE_ENV === 'production';
  let dbSession = null;

  try {
    dbSession = await mongoose.startSession();
    dbSession.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    });
  } catch (err) {
    if (isProduction) {
      throw new Error('FATAL: Production database must support multi-document replica set transactions.');
    }
    console.warn('[WARN-DEV-ONLY] Non-transactional fallback active in ingestion service — standalone MongoDB.');
    dbSession = null;
  }

  try {
    const importBatchId = await getNextBatchId();
    let newConfigsCreated = 0;
    let existingConfigsRepriced = 0;
    let skippedCount = 0;
    let unmatchedCount = 0;
    const rowAuditTrail = [];

    // Map existing hospital configs inside session
    const existingConfigQ = HospitalMasterConfig.find({ tenantId });
    if (dbSession) existingConfigQ.session(dbSession);
    const existingConfigs = await existingConfigQ.lean();
    const configMap = new Map();
    existingConfigs.forEach(c => configMap.set(c.masterItemId.toString(), c));

    for (const row of session.rows) {
      let effectiveMasterItemId = row.masterItemId;
      let canonicalCode = row.canonicalItemCode;

      // Handle manual resolution for ambiguous rows
      if (row.matchType === 'AMBIGUOUS_MATCH' && resolvedMasterItemMap.has(row.rowNumber)) {
        const resolved = resolvedMasterItemMap.get(row.rowNumber);
        effectiveMasterItemId = resolved._id;
        canonicalCode = resolved.itemCode;
      }

      // NO_MATCH handling: Skip unmatched row per unconfirmed policy (SOURCE / BUSINESS DECISION REQUIRED)
      if (!effectiveMasterItemId || row.matchType === 'NO_MATCH') {
        unmatchedCount++;
        rowAuditTrail.push({
          rowNumber: row.rowNumber,
          sourceRowHash: row.sourceRowHash,
          masterItemId: null,
          canonicalItemCode: '',
          action: 'UNMATCHED',
          pricingSnapshot: {
            oldPricing: { mrp: null, netRate: null, hospitalCost: null },
            newPricing: { mrp: row.importedPricing?.mrp ?? null, netRate: row.importedPricing?.netRate ?? null, hospitalCost: null }
          },
          notes: 'No matching canonical global item found. Ingestion skipped.'
        });
        continue;
      }

      const existing = configMap.get(effectiveMasterItemId.toString());

      // Check whether this row was selected by the hospital (explicit pricing provided)
      const mrpVal = row.importedPricing?.mrp;
      const isSelected = mrpVal !== undefined && mrpVal !== null && mrpVal !== '';

      if (!isSelected) {
        // Blank MRP => Item was NOT selected by hospital
        skippedCount++;
        if (existing) {
          // Existing hospital configuration remains strictly untouched
          rowAuditTrail.push({
            rowNumber: row.rowNumber,
            sourceRowHash: row.sourceRowHash,
            masterItemId: effectiveMasterItemId,
            canonicalItemCode: canonicalCode,
            action: 'SKIPPED',
            pricingSnapshot: {
              oldPricing: { mrp: existing.mrp, netRate: existing.netRate, hospitalCost: existing.hospitalCost },
              newPricing: { mrp: existing.mrp, netRate: existing.netRate, hospitalCost: existing.hospitalCost }
            },
            notes: 'Item unselected in workbook (blank MRP). Existing hospital configuration retained untouched.'
          });
        } else {
          // Unselected new item => Do NOT create HospitalMasterConfig
          rowAuditTrail.push({
            rowNumber: row.rowNumber,
            sourceRowHash: row.sourceRowHash,
            masterItemId: effectiveMasterItemId,
            canonicalItemCode: canonicalCode,
            action: 'SKIPPED',
            pricingSnapshot: {
              oldPricing: { mrp: null, netRate: null, hospitalCost: null },
              newPricing: { mrp: null, netRate: null, hospitalCost: null }
            },
            notes: 'Item unselected in workbook (blank MRP). Ingestion skipped without creating configuration.'
          });
        }
        continue;
      }

      if (existing) {
        // Row corresponds to an already configured item
        if (!allowRepricing) {
          // Repricing disabled: Skip update
          skippedCount++;
          rowAuditTrail.push({
            rowNumber: row.rowNumber,
            sourceRowHash: row.sourceRowHash,
            masterItemId: effectiveMasterItemId,
            canonicalItemCode: canonicalCode,
            action: 'SKIPPED',
            pricingSnapshot: {
              oldPricing: { mrp: existing.mrp, netRate: existing.netRate, hospitalCost: existing.hospitalCost },
              newPricing: { mrp: row.importedPricing?.mrp ?? existing.mrp, netRate: row.importedPricing?.netRate ?? existing.netRate, hospitalCost: existing.hospitalCost }
            },
            notes: 'Item already configured in hospital catalog. Repricing was not authorized.'
          });
        } else {
          // Repricing enabled: Execute update
          const newMrp = row.importedPricing?.mrp !== null && row.importedPricing?.mrp !== undefined
            ? Number(row.importedPricing.mrp)
            : existing.mrp;
          const newNetRate = row.importedPricing?.netRate !== null && row.importedPricing?.netRate !== undefined
            ? Number(row.importedPricing.netRate)
            : existing.netRate;

          const updateQ = HospitalMasterConfig.updateOne(
            { _id: existing._id },
            {
              $set: {
                mrp: newMrp,
                netRate: newNetRate,
                lastUpdatedBy: superAdminUser.staff_id || superAdminUser.id || 'superadmin'
              }
            }
          );
          if (dbSession) updateQ.session(dbSession);
          await updateQ;

          existingConfigsRepriced++;
          rowAuditTrail.push({
            rowNumber: row.rowNumber,
            sourceRowHash: row.sourceRowHash,
            masterItemId: effectiveMasterItemId,
            canonicalItemCode: canonicalCode,
            action: 'REPRICED',
            pricingSnapshot: {
              oldPricing: { mrp: existing.mrp, netRate: existing.netRate, hospitalCost: existing.hospitalCost },
              newPricing: { mrp: newMrp, netRate: newNetRate, hospitalCost: existing.hospitalCost }
            },
            notes: `Hospital catalog commercial rates updated via batch ${importBatchId}.`
          });
        }
      } else {
        // Create new HospitalMasterConfig
        const newMrp = row.importedPricing?.mrp !== null && row.importedPricing?.mrp !== undefined
          ? Number(row.importedPricing.mrp)
          : 0;
        const newNetRate = row.importedPricing?.netRate !== null && row.importedPricing?.netRate !== undefined
          ? Number(row.importedPricing.netRate)
          : 0;

        let effectiveDept = '';
        if (session.department && session.department !== 'all' && session.department.trim() !== '') {
          effectiveDept = session.department.trim();
        } else if (row.rawRowData && row.rawRowData.department && String(row.rawRowData.department).trim()) {
          effectiveDept = String(row.rawRowData.department).trim();
        } else {
          const itemMasterDoc = await ItemMaster.findById(effectiveMasterItemId).lean();
          effectiveDept = itemMasterDoc ? (itemMasterDoc.department || itemMasterDoc.departmentType || '') : '';
        }

        const createConfigOpts = dbSession ? { session: dbSession } : {};
        await HospitalMasterConfig.create([{
          tenantId,
          masterItemId: effectiveMasterItemId,
          category: session.category,
          department: effectiveDept,
          mrp: newMrp,
          netRate: newNetRate,
          hospitalCost: 0, // Hospital Cost absent in Excel workbook; never invented
          status: 'Active',
          approvalStatus: 'Approved',
          assignedVia: 'EXCEL_UPLOAD'
        }], createConfigOpts);

        newConfigsCreated++;
        rowAuditTrail.push({
          rowNumber: row.rowNumber,
          sourceRowHash: row.sourceRowHash,
          masterItemId: effectiveMasterItemId,
          canonicalItemCode: canonicalCode,
          action: 'CREATED',
          pricingSnapshot: {
            oldPricing: { mrp: null, netRate: null, hospitalCost: null },
            newPricing: { mrp: newMrp, netRate: newNetRate, hospitalCost: 0 }
          },
          notes: `Assigned canonical item to hospital catalog via batch ${importBatchId}.`
        });
      }
    }

    // Create Audit Record
    const auditOpts = dbSession ? { session: dbSession } : {};
    const [auditRecord] = await HospitalMasterImportAudit.create([{
      importBatchId,
      previewSessionId: session.previewId,
      tenantId,
      hospitalName: session.hospitalName,
      category: session.category,
      department: session.department,
      parserVersion: session.parserVersion,
      registryVersion: session.registryVersion,
      originalFileName: session.originalFileName,
      fileSizeBytes: session.fileSizeBytes,
      fileHash: session.fileHash,
      uploadedBy: superAdminUser.staff_id || superAdminUser.id || 'superadmin',
      uploadedByName: superAdminUser.name || 'Super Admin',
      uploadedAt: new Date(),
      metrics: {
        totalRows: session.rows.length,
        matchedCount: newConfigsCreated + existingConfigsRepriced + skippedCount,
        newConfigsCreated,
        existingConfigsRepriced,
        skippedCount,
        unmatchedCount
      },
      rowAuditTrail
    }], auditOpts);

    // Transition Session status to COMMITTED
    session.status = 'COMMITTED';
    const saveSessionOpts = dbSession ? { session: dbSession } : {};
    await session.save(saveSessionOpts);

    // SuperAdmin Operational Audit Log
    try {
      const saLogOpts = dbSession ? { session: dbSession } : {};
      await SuperAdminAudit.create([{
        user: superAdminUser.name || 'Super Admin',
        action: 'HOSPITAL_MASTER_IMPORT_COMMITTED',
        details: `Imported ${session.rows.length} rows into tenant "${tenantId}" [Batch: ${importBatchId}] (Created: ${newConfigsCreated}, Repriced: ${existingConfigsRepriced}, Skipped: ${skippedCount}, Unmatched: ${unmatchedCount})`,
        ip: ''
      }], saLogOpts);
    } catch (_) {}

    if (dbSession) {
      await dbSession.commitTransaction();
    }

    return {
      success: true,
      importBatchId,
      previewId: session.previewId,
      tenantId,
      category: session.category,
      department: session.department,
      metrics: {
        totalRows: session.rows.length,
        newConfigsCreated,
        existingConfigsRepriced,
        skippedCount,
        unmatchedCount
      }
    };
  } catch (err) {
    if (dbSession && dbSession.inTransaction()) {
      await dbSession.abortTransaction();
    }
    throw err;
  } finally {
    if (dbSession) {
      dbSession.endSession();
    }
  }
}

module.exports = {
  confirmImportSession
};
