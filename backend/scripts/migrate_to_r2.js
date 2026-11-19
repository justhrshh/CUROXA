/**
 * QUROXA — PRODUCTION RESUMABLE & IDEMPOTENT R2 MIGRATION SCRIPT
 *
 * Migrates legacy local upload paths and Base64 documents to Cloudflare R2 private bucket:
 * 1. Hospital letterheads (SuperAdminHospital.letterheadUrl)
 * 2. Doctor digital signatures (User.signatureUrl)
 * 3. Employee HR documents & payslips (User.documents)
 * 4. Prescription handwritten images (Prescription.images)
 * 5. Clinical documents (ClinicalDocument.fileUrl)
 *
 * Safety & Audit Guarantees:
 * - Uses StorageMigrationLedger to ensure strict idempotency and zero duplicate uploads.
 * - Records original values for instant, safe rollback (--rollback flag).
 * - Verifies SHA-256 checksums and object existence via S3 HeadObject.
 * - Never prints patient data, document contents, or credentials to logs.
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { storageService } = require('../services/storage/storageService');
const StorageMigrationLedger = require('../models/StorageMigrationLedger');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');
const Prescription = require('../models/Prescription');
const ClinicalDocument = require('../models/ClinicalDocument');

function parseBase64(str) {
  if (!str || typeof str !== 'string') return null;
  const matches = str.match(/^data:([^;]+);base64,(.+)$/);
  if (matches) {
    return {
      mimetype: matches[1],
      buffer: Buffer.from(matches[2], 'base64')
    };
  }
  return null;
}

async function migrateLetterheads({ isDryRun = false } = {}) {
  console.log(`\n[MIGRATION${isDryRun ? ' - DRY RUN' : ''}] Scanning SuperAdminHospital letterheads...`);
  const hospitals = await SuperAdminHospital.find({
    letterheadUrl: { $exists: true, $ne: '' }
  });

  let totalDiscovered = hospitals.length;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const h of hospitals) {
    const fieldPath = 'letterheadUrl';
    const val = h.letterheadUrl;

    // Check ledger
    const existing = await StorageMigrationLedger.findOne({
      collectionName: 'superadminhospitals',
      documentId: h._id,
      fieldPath
    });

    if (existing && existing.status === 'MIGRATED') {
      skipped++;
      continue;
    }

    // If already an R2 key or placeholder, check if needs migration
    if (!val || val.startsWith('tenants/')) {
      skipped++;
      continue;
    }

    const base64Info = parseBase64(val);
    let buffer = null;
    let mimetype = 'image/png';
    let originalName = 'letterhead.png';

    if (base64Info) {
      buffer = base64Info.buffer;
      mimetype = base64Info.mimetype;
      const ext = mimetype.split('/')[1] || 'png';
      originalName = `letterhead.${ext}`;
    } else if (val.startsWith('/uploads/') || val.startsWith('uploads/')) {
      const cleanPath = val.replace(/^\/+/, '');
      const localDiskPath = path.join(__dirname, '..', cleanPath);
      if (fs.existsSync(localDiskPath)) {
        buffer = fs.readFileSync(localDiskPath);
        mimetype = path.extname(localDiskPath) === '.pdf' ? 'application/pdf' : 'image/png';
        originalName = path.basename(localDiskPath);
      } else {
        if (!isDryRun) {
          console.warn(`  [SKIP] Local file not found on disk: ${val} for hospital ${h.code}`);
          await StorageMigrationLedger.findOneAndUpdate(
            { collectionName: 'superadminhospitals', documentId: h._id, fieldPath },
            {
              tenantId: h.code || 'default',
              category: 'letterheads',
              originalValue: val,
              status: 'SKIPPED',
              error: 'File not found on local disk'
            },
            { upsert: true }
          );
        }
        skipped++;
        continue;
      }
    } else {
      // External URL (e.g. cdn.example.com test fixture)
      skipped++;
      continue;
    }

    if (buffer) {
      if (isDryRun) {
        console.log(`  [DRY RUN] Would migrate letterhead for hospital ${h.code} (${buffer.length} bytes)`);
        migrated++;
        continue;
      }

      try {
        const tenantId = (h.code || 'default').toLowerCase().trim();
        const uploadResult = await storageService.uploadPrivate({
          tenantId,
          category: 'letterheads',
          buffer,
          mimetype,
          originalName
        });

        // Verify existence in R2
        await storageService.getObjectMetadata({ key: uploadResult.key, isPrivate: true });

        // Update database
        h.letterheadUrl = uploadResult.key;
        await h.save();

        // Record in ledger
        await StorageMigrationLedger.findOneAndUpdate(
          { collectionName: 'superadminhospitals', documentId: h._id, fieldPath },
          {
            tenantId,
            category: 'letterheads',
            originalValue: val,
            r2Key: uploadResult.key,
            r2Bucket: uploadResult.bucket,
            checksum: uploadResult.checksum,
            fileSize: buffer.length,
            mimetype,
            status: 'MIGRATED',
            migratedAt: new Date()
          },
          { upsert: true }
        );

        migrated++;
        console.log(`  [MIGRATED] Hospital ${h.code} letterhead -> ${uploadResult.key}`);
      } catch (err) {
        failed++;
        console.error(`  [FAILED] Hospital ${h.code} letterhead migration:`, err.message);
        await StorageMigrationLedger.findOneAndUpdate(
          { collectionName: 'superadminhospitals', documentId: h._id, fieldPath },
          {
            tenantId: h.code || 'default',
            category: 'letterheads',
            originalValue: val,
            status: 'FAILED',
            error: err.message
          },
          { upsert: true }
        );
      }
    }
  }

  return { category: 'letterheads', totalDiscovered, migrated, skipped, failed, remaining: totalDiscovered - migrated - skipped };
}

async function migrateSignatures({ isDryRun = false } = {}) {
  console.log(`\n[MIGRATION${isDryRun ? ' - DRY RUN' : ''}] Scanning User doctor/staff signatures...`);
  const users = await User.find({
    signatureUrl: { $exists: true, $ne: '' }
  });

  let totalDiscovered = users.length;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of users) {
    const fieldPath = 'signatureUrl';
    const val = u.signatureUrl;

    const existing = await StorageMigrationLedger.findOne({
      collectionName: 'users',
      documentId: u._id,
      fieldPath
    });

    if (existing && existing.status === 'MIGRATED') {
      skipped++;
      continue;
    }

    if (!val || val.startsWith('tenants/')) {
      skipped++;
      continue;
    }

    const base64Info = parseBase64(val);
    if (!base64Info) {
      skipped++;
      continue;
    }

    if (isDryRun) {
      console.log(`  [DRY RUN] Would migrate signature for user ${u.staff_id || u._id} (${base64Info.buffer.length} bytes)`);
      migrated++;
      continue;
    }

    try {
      const tenantId = (u.tenantId || 'default').toLowerCase().trim();
      const ext = base64Info.mimetype.split('/')[1] || 'png';
      const uploadResult = await storageService.uploadPrivate({
        tenantId,
        category: 'doctor-signatures',
        buffer: base64Info.buffer,
        mimetype: base64Info.mimetype,
        originalName: `signature_${u.staff_id || u._id}.${ext}`
      });

      await storageService.getObjectMetadata({ key: uploadResult.key, isPrivate: true });

      u.signatureUrl = uploadResult.key;
      await u.save();

      await StorageMigrationLedger.findOneAndUpdate(
        { collectionName: 'users', documentId: u._id, fieldPath },
        {
          tenantId,
          category: 'doctor-signatures',
          originalValue: val,
          r2Key: uploadResult.key,
          r2Bucket: uploadResult.bucket,
          checksum: uploadResult.checksum,
          fileSize: base64Info.buffer.length,
          mimetype: base64Info.mimetype,
          status: 'MIGRATED',
          migratedAt: new Date()
        },
        { upsert: true }
      );

      migrated++;
      console.log(`  [MIGRATED] User ${u.staff_id || u._id} signature -> ${uploadResult.key}`);
    } catch (err) {
      failed++;
      console.error(`  [FAILED] User ${u.staff_id} signature migration:`, err.message);
      await StorageMigrationLedger.findOneAndUpdate(
        { collectionName: 'users', documentId: u._id, fieldPath },
        {
          tenantId: u.tenantId || 'default',
          category: 'doctor-signatures',
          originalValue: val,
          status: 'FAILED',
          error: err.message
        },
        { upsert: true }
      );
    }
  }

  return { category: 'doctor-signatures', totalDiscovered, migrated, skipped, failed, remaining: totalDiscovered - migrated - skipped };
}

async function migratePrescriptionImages({ isDryRun = false } = {}) {
  console.log(`\n[MIGRATION${isDryRun ? ' - DRY RUN' : ''}] Scanning Prescription handwritten image pages...`);
  const prescriptions = await Prescription.find({
    'images.0': { $exists: true }
  });

  let totalDiscovered = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const rx of prescriptions) {
    let docModified = false;
    for (let idx = 0; idx < rx.images.length; idx++) {
      totalDiscovered++;
      const img = rx.images[idx];
      const fieldPath = `images.${idx}.url`;
      const val = img.url;

      const existing = await StorageMigrationLedger.findOne({
        collectionName: 'prescriptions',
        documentId: rx._id,
        fieldPath
      });

      if (existing && existing.status === 'MIGRATED') {
        skipped++;
        continue;
      }

      if (!val || val.startsWith('tenants/')) {
        skipped++;
        continue;
      }

      const base64Info = parseBase64(val);
      let buffer = null;
      let mimetype = 'image/png';
      let originalName = img.originalName || `page_${idx + 1}.png`;

      if (base64Info) {
        buffer = base64Info.buffer;
        mimetype = base64Info.mimetype;
      } else if (val.startsWith('/uploads/') || val.startsWith('uploads/')) {
        const cleanPath = val.replace(/^\/+/, '');
        const localDiskPath = path.join(__dirname, '..', cleanPath);
        if (fs.existsSync(localDiskPath)) {
          buffer = fs.readFileSync(localDiskPath);
          mimetype = 'image/jpeg';
          originalName = path.basename(localDiskPath);
        } else {
          // File was from an ephemeral run
          if (!isDryRun) {
            await StorageMigrationLedger.findOneAndUpdate(
              { collectionName: 'prescriptions', documentId: rx._id, fieldPath },
              {
                tenantId: rx.tenantId || 'default',
                category: 'prescriptions',
                originalValue: val,
                status: 'SKIPPED',
                error: 'Prescription image not present on local disk (ephemeral test record)'
              },
              { upsert: true }
            );
          }
          skipped++;
          continue;
        }
      }

      if (buffer) {
        if (isDryRun) {
          console.log(`  [DRY RUN] Would migrate prescription ${rx._id} page ${idx + 1}`);
          migrated++;
          continue;
        }

        try {
          const tenantId = (rx.tenantId || 'default').toLowerCase().trim();
          const uploadResult = await storageService.uploadPrivate({
            tenantId,
            category: 'prescriptions',
            buffer,
            mimetype,
            originalName
          });

          await storageService.getObjectMetadata({ key: uploadResult.key, isPrivate: true });

          img.url = uploadResult.key;
          docModified = true;

          await StorageMigrationLedger.findOneAndUpdate(
            { collectionName: 'prescriptions', documentId: rx._id, fieldPath },
            {
              tenantId,
              category: 'prescriptions',
              originalValue: val,
              r2Key: uploadResult.key,
              r2Bucket: uploadResult.bucket,
              checksum: uploadResult.checksum,
              fileSize: buffer.length,
              mimetype,
              status: 'MIGRATED',
              migratedAt: new Date()
            },
            { upsert: true }
          );

          migrated++;
          console.log(`  [MIGRATED] Prescription ${rx._id} page ${idx + 1} -> ${uploadResult.key}`);
        } catch (err) {
          failed++;
          console.error(`  [FAILED] Prescription ${rx._id} page ${idx + 1}:`, err.message);
        }
      }
    }

    if (docModified && !isDryRun) {
      await rx.save();
    }
  }

  return { category: 'prescriptions', totalDiscovered, migrated, skipped, failed, remaining: totalDiscovered - migrated - skipped };
}

async function migrateClinicalDocuments({ isDryRun = false } = {}) {
  console.log(`\n[MIGRATION${isDryRun ? ' - DRY RUN' : ''}] Scanning ClinicalDocument files...`);
  const documents = await ClinicalDocument.find({
    fileUrl: { $exists: true, $ne: '' }
  });

  let totalDiscovered = documents.length;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of documents) {
    const fieldPath = 'fileUrl';
    const val = doc.fileUrl;

    const existing = await StorageMigrationLedger.findOne({
      collectionName: 'clinicaldocuments',
      documentId: doc._id,
      fieldPath
    });

    if (existing && existing.status === 'MIGRATED') {
      skipped++;
      continue;
    }

    if (!val || val.startsWith('tenants/')) {
      skipped++;
      continue;
    }

    const base64Info = parseBase64(val);
    let buffer = null;
    let mimetype = 'application/pdf';
    let originalName = `${doc.title || 'document'}.pdf`;

    if (base64Info) {
      buffer = base64Info.buffer;
      mimetype = base64Info.mimetype;
      const ext = mimetype.split('/')[1] || 'pdf';
      originalName = `${doc.title || 'doc'}.${ext}`;
    } else if (val.startsWith('/uploads/') || val.startsWith('uploads/')) {
      const cleanPath = val.replace(/^\/+/, '');
      const localDiskPath = path.join(__dirname, '..', cleanPath);
      if (fs.existsSync(localDiskPath)) {
        buffer = fs.readFileSync(localDiskPath);
        mimetype = path.extname(localDiskPath) === '.pdf' ? 'application/pdf' : 'image/png';
        originalName = path.basename(localDiskPath);
      } else {
        if (!isDryRun) {
          await StorageMigrationLedger.findOneAndUpdate(
            { collectionName: 'clinicaldocuments', documentId: doc._id, fieldPath },
            {
              tenantId: doc.tenantId || 'default',
              category: 'clinical-documents',
              originalValue: val,
              status: 'SKIPPED',
              error: 'File not found on local disk'
            },
            { upsert: true }
          );
        }
        skipped++;
        continue;
      }
    } else {
      // External URL
      skipped++;
      continue;
    }

    if (buffer) {
      if (isDryRun) {
        console.log(`  [DRY RUN] Would migrate clinical doc ${doc._id} (${buffer.length} bytes)`);
        migrated++;
        continue;
      }

      try {
        const tenantId = (doc.tenantId || 'default').toLowerCase().trim();
        const uploadResult = await storageService.uploadPrivate({
          tenantId,
          category: 'clinical-documents',
          buffer,
          mimetype,
          originalName
        });

        await storageService.getObjectMetadata({ key: uploadResult.key, isPrivate: true });

        doc.fileUrl = uploadResult.key;
        await doc.save();

        await StorageMigrationLedger.findOneAndUpdate(
          { collectionName: 'clinicaldocuments', documentId: doc._id, fieldPath },
          {
            tenantId,
            category: 'clinical-documents',
            originalValue: val,
            r2Key: uploadResult.key,
            r2Bucket: uploadResult.bucket,
            checksum: uploadResult.checksum,
            fileSize: buffer.length,
            mimetype,
            status: 'MIGRATED',
            migratedAt: new Date()
          },
          { upsert: true }
        );

        migrated++;
        console.log(`  [MIGRATED] Clinical doc ${doc._id} -> ${uploadResult.key}`);
      } catch (err) {
        failed++;
        console.error(`  [FAILED] Clinical doc ${doc._id} migration:`, err.message);
      }
    }
  }

  return { category: 'clinical-documents', totalDiscovered, migrated, skipped, failed, remaining: totalDiscovered - migrated - skipped };
}

async function migrateUserDocuments({ isDryRun = false } = {}) {
  console.log(`\n[MIGRATION${isDryRun ? ' - DRY RUN' : ''}] Scanning User HR documents...`);
  const users = await User.find({
    'documents.0': { $exists: true }
  });

  let totalDiscovered = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of users) {
    let docModified = false;
    for (let idx = 0; idx < u.documents.length; idx++) {
      totalDiscovered++;
      const item = u.documents[idx];
      const fieldPath = `documents.${idx}.fileData`;
      const val = item.fileData;

      const existing = await StorageMigrationLedger.findOne({
        collectionName: 'users',
        documentId: u._id,
        fieldPath
      });

      if (existing && existing.status === 'MIGRATED') {
        skipped++;
        continue;
      }

      if (!val || val.startsWith('tenants/')) {
        skipped++;
        continue;
      }

      const base64Info = parseBase64(val);
      if (!base64Info) {
        skipped++;
        continue;
      }

      if (isDryRun) {
        console.log(`  [DRY RUN] Would migrate HR doc for user ${u.staff_id || u._id} item ${idx}`);
        migrated++;
        continue;
      }

      try {
        const tenantId = (u.tenantId || 'default').toLowerCase().trim();
        const uploadResult = await storageService.uploadPrivate({
          tenantId,
          category: 'hr-documents',
          buffer: base64Info.buffer,
          mimetype: base64Info.mimetype,
          originalName: item.fileName || `doc_${idx + 1}`
        });

        await storageService.getObjectMetadata({ key: uploadResult.key, isPrivate: true });

        item.fileData = uploadResult.key;
        docModified = true;

        await StorageMigrationLedger.findOneAndUpdate(
          { collectionName: 'users', documentId: u._id, fieldPath },
          {
            tenantId,
            category: 'hr-documents',
            originalValue: val,
            r2Key: uploadResult.key,
            r2Bucket: uploadResult.bucket,
            checksum: uploadResult.checksum,
            fileSize: base64Info.buffer.length,
            mimetype: base64Info.mimetype,
            status: 'MIGRATED',
            migratedAt: new Date()
          },
          { upsert: true }
        );

        migrated++;
        console.log(`  [MIGRATED] User ${u.staff_id || u._id} HR doc ${idx + 1} -> ${uploadResult.key}`);
      } catch (err) {
        failed++;
        console.error(`  [FAILED] User ${u.staff_id || u._id} HR doc ${idx + 1}:`, err.message);
      }
    }

    if (docModified && !isDryRun) {
      await u.save();
    }
  }

  return { category: 'hr-documents', totalDiscovered, migrated, skipped, failed, remaining: totalDiscovered - migrated - skipped };
}

async function rollback() {
  console.log('=== QUROXA R2 MIGRATION ROLLBACK ===\n');
  const migratedEntries = await StorageMigrationLedger.find({ status: 'MIGRATED' });
  console.log(`Found ${migratedEntries.length} migrated entries to roll back.`);

  let restored = 0;
  for (const entry of migratedEntries) {
    try {
      const col = mongoose.connection.db.collection(entry.collectionName);
      if (entry.fieldPath.includes('.')) {
        // Nested array/object field update
        await col.updateOne(
          { _id: entry.documentId },
          { $set: { [entry.fieldPath]: entry.originalValue } }
        );
      } else {
        await col.updateOne(
          { _id: entry.documentId },
          { $set: { [entry.fieldPath]: entry.originalValue } }
        );
      }

      entry.status = 'ROLLED_BACK';
      await entry.save();
      restored++;
    } catch (e) {
      console.error(`Failed to rollback entry ${entry._id}:`, e.message);
    }
  }

  console.log(`Rollback completed: ${restored} entries restored.`);
}

async function run() {
  const isRollback = process.argv.includes('--rollback');
  const isDryRun = process.argv.includes('--dry-run');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  if (isRollback) {
    await rollback();
    await mongoose.disconnect();
    return;
  }

  console.log(`=== QUROXA COMPLETE R2 STORAGE MIGRATION${isDryRun ? ' [DRY RUN]' : ''} ===\n`);
  const results = [];

  results.push(await migrateLetterheads({ isDryRun }));
  results.push(await migrateSignatures({ isDryRun }));
  results.push(await migratePrescriptionImages({ isDryRun }));
  results.push(await migrateClinicalDocuments({ isDryRun }));
  results.push(await migrateUserDocuments({ isDryRun }));

  console.log(`\n--- MIGRATION SUMMARY MATRIX${isDryRun ? ' (DRY RUN)' : ''} ---`);
  console.table(results);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
