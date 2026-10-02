const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');
const { getCategoryConfig } = require('../config/masterSchemaRegistry');
const { parseWorkbook } = require('../services/masterWorkbookParser');
const { matchParsedRows } = require('../services/masterMatchingEngine');
const { confirmImportSession } = require('../services/hospitalCatalogIngestionService');
const HospitalMasterImportSession = require('../models/HospitalMasterImportSession');
const HospitalMasterImportAudit = require('../models/HospitalMasterImportAudit');
const SuperAdminHospital = require('../models/SuperAdminHospital');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB Max
});

router.use(verifyToken);
router.use(isSuperAdmin);

/**
 * GET /api/superadmin/masters/upload/template
 * Generate and stream clean Excel template formatted strictly to MASTER_SCHEMA_REGISTRY
 */
router.get('/template', (req, res) => {
  try {
    const { category, department } = req.query;
    if (!category) {
      return res.status(400).json({ error: 'category query parameter is required.' });
    }

    if (category === 'Radiology') {
      return res.status(400).json({ error: 'Radiology templates are unavailable: Category remains SOURCE-CONFIRMATION-REQUIRED.' });
    }

    const catConfig = getCategoryConfig(category);
    if (!catConfig) {
      return res.status(400).json({ error: `Invalid category: "${category}".` });
    }

    const fields = catConfig.sharedFields || [];
    const headers = fields.map(f => f.clientHeader);

    // Build sample row based on verified defaultValue or sample values
    const sampleRow = fields.map(f => {
      if (f.defaultValue !== null && f.defaultValue !== undefined) return f.defaultValue;
      if (f.allowedValues && f.allowedValues.length > 0) return f.allowedValues[0];
      if (f.clientHeader === 'Category') return category;
      if (f.clientHeader === 'Department') return department || (catConfig.hasDepartment ? Object.keys(catConfig.departments || {})[0] : '');
      return '';
    });

    const worksheetData = [headers, sampleRow];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Auto-fit column widths
    const colWidths = headers.map(h => ({ wch: Math.max(h.length + 4, 14) }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, catConfig.excelSheet || category);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const safeFilename = `${category.replace(/\s+/g, '_')}_Master_Template.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/superadmin/masters/upload/parse-preview
 * Parse uploaded file, validate against registry, match canonical items, and create
 * a server-authoritative preview session with 1-hour expiration.
 */
router.post('/parse-preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file uploaded.' });
    }

    const { tenantId, category, department } = req.body;
    if (!tenantId || !tenantId.trim()) {
      return res.status(400).json({ error: 'tenantId is required.' });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ error: 'category is required.' });
    }

    // Resolve hospital name
    let hospitalName = tenantId;
    const hospDoc = await SuperAdminHospital.findOne({ code: tenantId }).lean();
    if (hospDoc && hospDoc.name) hospitalName = hospDoc.name;

    const effectiveDept = (department && department !== 'all') ? department.trim() : '';

    // 1. Strict Workbook Parsing & Registry Validation
    const parsed = parseWorkbook(req.file.buffer, category.trim(), effectiveDept);

    // 2. Context-Scoped Matching against Global ItemMaster
    const matchedRows = await matchParsedRows(
      parsed.rows,
      tenantId.trim(),
      category.trim(),
      effectiveDept
    );

    // 3. Compute Summary Metrics
    let matchedCount = 0;
    let safeMatchCount = 0;
    let ambiguousCount = 0;
    let unmatchedCount = 0;
    let repricingCount = 0;
    let errorCount = 0;

    matchedRows.forEach(r => {
      if (r.matchType === 'EXACT_MATCH') matchedCount++;
      else if (r.matchType === 'SAFE_DETERMINISTIC_MATCH') safeMatchCount++;
      else if (r.matchType === 'AMBIGUOUS_MATCH') ambiguousCount++;
      else if (r.matchType === 'NO_MATCH') unmatchedCount++;

      if (r.isRepricing) repricingCount++;
      if (r.validationErrors && r.validationErrors.length > 0) errorCount++;
    });

    // 4. Generate Unique previewId and Store Server Session
    const year = new Date().getFullYear();
    const previewId = `IMP-PREV-${year}-${Date.now().toString().slice(-6)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 Hour
    const cleanupAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 Hours

    const sessionDoc = await HospitalMasterImportSession.create({
      previewId,
      tenantId: tenantId.trim(),
      hospitalName,
      category: category.trim(),
      department: effectiveDept,
      superAdminId: req.user?.staff_id || req.user?.id || 'superadmin',
      superAdminName: req.user?.name || 'Super Admin',
      originalFileName: req.file.originalname,
      fileHash: parsed.fileHash,
      fileSizeBytes: req.file.size,
      parserVersion: '1.0.0',
      registryVersion: 'Phase-1-Verified-84-Fields',
      createdAt: now,
      expiresAt,
      cleanupAt,
      status: 'PREVIEW_READY',
      summary: matchedRows.summary || {
        totalRows: matchedRows.length,
        selected: matchedRows.filter(r => r.isSelected).length,
        notSelected: matchedRows.filter(r => !r.isSelected).length,
        newSelected: matchedRows.filter(r => r.isSelected && r.selectionStatus === 'NEW_SELECTION').length,
        existingCount: matchedRows.filter(r => r.isSelected && r.selectionStatus === 'EXISTING_UNCHANGED').length,
        matchedCount,
        safeMatchCount,
        ambiguousCount,
        unmatchedCount,
        repricingCount,
        errorCount
      },
      rows: matchedRows
    });

    res.json({
      success: true,
      previewId,
      expiresAt,
      summary: sessionDoc.summary,
      rows: matchedRows
    });
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: err.message,
      validationErrors: err.validationErrors || []
    });
  }
});

/**
 * POST /api/superadmin/masters/upload/confirm-import
 * Confirm import session. Revalidates session server-side, enforces tamper-proof
 * pricing, and commits transactional updates.
 */
router.post('/confirm-import', async (req, res) => {
  try {
    const {
      previewId,
      tenantId,
      category,
      department,
      allowRepricing = false,
      ambiguousResolutions = {}
    } = req.body;

    const result = await confirmImportSession({
      previewId,
      tenantId,
      category,
      department,
      allowRepricing: Boolean(allowRepricing),
      ambiguousResolutions,
      superAdminUser: req.user
    });

    res.json(result);
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({
      code: err.code || 'ERR_IMPORT_FAILED',
      error: err.message
    });
  }
});

/**
 * GET /api/superadmin/masters/upload/history
 * Retrieve historical import audit logs
 */
router.get('/history', async (req, res) => {
  try {
    const { tenantId, category } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const query = {};

    if (tenantId && tenantId !== 'ALL') query.tenantId = tenantId;
    if (category && category !== 'ALL') query.category = category;

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      HospitalMasterImportAudit.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HospitalMasterImportAudit.countDocuments(query)
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/superadmin/masters/upload/history/:batchId
 * Fetch row-level audit details for a specific batch
 */
router.get('/history/:batchId', async (req, res) => {
  try {
    const doc = await HospitalMasterImportAudit.findOne({ importBatchId: req.params.batchId }).lean();
    if (!doc) {
      return res.status(404).json({ error: 'Import batch audit not found.' });
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
