const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const https = require('https');
const User = require('../models/User');
const RoleCoverage = require('../models/RoleCoverage');
const Medicine = require('../models/Medicine');
const Appointment = require('../models/Appointment');
const LabRequest = require('../models/LabRequest');
const Prescription = require('../models/Prescription');
const Indent = require('../models/Indent');

const fetchJsonDoH = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/dns-json' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
};

const resolveSrvAndTxtViaDoH = async (srvDomain, txtDomain) => {
  const services = [
    {
      srv: `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(srvDomain)}&type=SRV`,
      txt: `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(txtDomain)}&type=TXT`
    },
    {
      srv: `https://dns.google/resolve?name=${encodeURIComponent(srvDomain)}&type=SRV`,
      txt: `https://dns.google/resolve?name=${encodeURIComponent(txtDomain)}&type=TXT`
    }
  ];

  for (const service of services) {
    try {
      const [srvRes, txtRes] = await Promise.all([
        fetchJsonDoH(service.srv),
        fetchJsonDoH(service.txt)
      ]);

      if (srvRes.Answer && srvRes.Answer.length > 0) {
        const hosts = srvRes.Answer.map(ans => {
          const parts = ans.data.trim().split(/\s+/);
          if (parts.length >= 4) {
            const port = parts[2];
            const target = parts[3].replace(/\.$/, '');
            return `${target}:${port}`;
          }
          return null;
        }).filter(Boolean);

        let txtOpts = '';
        if (txtRes.Answer && txtRes.Answer.length > 0) {
          txtOpts = txtRes.Answer.map(ans => ans.data.replace(/^"|"$/g, '').trim()).join('&');
        }

        if (hosts.length > 0) {
          return { hosts, txtOpts };
        }
      }
    } catch (err) {
      console.warn(`DoH service failed:`, err.message);
    }
  }
  throw new Error('All DNS-over-HTTPS resolution attempts failed.');
};

const connectDB = async () => {
  let connectionUri = process.env.MONGO_URI;
  let conn;

  const connectionOptions = {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    socketTimeoutMS: 45000,
    maxPoolSize: 50
  };

  try {
    console.log('Connecting to MongoDB...');
    conn = await mongoose.connect(connectionUri, connectionOptions);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Initial MongoDB Connection Error: ${error.message}`);
    
    // Check if it's a DNS resolution/querySrv issue and we have a mongodb+srv:// URI
    if (connectionUri && connectionUri.startsWith('mongodb+srv://')) {
      console.log('Attempting DNS-over-HTTPS fallback resolution for SRV record...');
      try {
        const parsedUrl = new URL(connectionUri.replace(/^mongodb\+srv:\/\//, 'http://'));
        const username = parsedUrl.username;
        const password = parsedUrl.password;
        const host = parsedUrl.hostname;
        const database = parsedUrl.pathname || '/';
        const searchParams = parsedUrl.searchParams;

        const srvDomain = `_mongodb._tcp.${host}`;
        const txtDomain = host;

        const { hosts, txtOpts } = await resolveSrvAndTxtViaDoH(srvDomain, txtDomain);
        console.log(`Successfully resolved replica set hosts via DoH: ${hosts.join(', ')}`);

        // Construct standard mongodb:// connection string
        const finalHosts = hosts.join(',');
        let finalUri = `mongodb://${username}:${password}@${finalHosts}${database}`;
        const mergedOpts = [];
        if (txtOpts) mergedOpts.push(txtOpts);
        mergedOpts.push('ssl=true'); // Ensure SSL is enabled
        searchParams.forEach((val, key) => {
          mergedOpts.push(`${key}=${val}`);
        });
        if (mergedOpts.length > 0) {
          finalUri += `?${mergedOpts.join('&')}`;
        }

        console.log('Connecting using resolved fallback URI...');
        conn = await mongoose.connect(finalUri, connectionOptions);
        console.log(`MongoDB Connected (via DoH fallback): ${conn.connection.host}`);
      } catch (fallbackError) {
        console.error(`Fallback connection attempt failed: ${fallbackError.message}`);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }

  if (conn) {
    // Run post-connection startup tasks in the background to ensure immediate HTTP server responsiveness
    initializeDatabase(conn).catch(postConnError => {
      console.error('Post-connection database initialization error:', postConnError.message);
    });
  }
};

const initializeDatabase = async (conn) => {
  // 1. Programmatically drop old single-tenant unique indexes to prevent E11000 crashes on startup in parallel
  const dropIndexPromises = [
    mongoose.connection.db.collection('users').dropIndex('staff_id_1').catch(() => {}),
    mongoose.connection.db.collection('medicines').dropIndex('sku_1').catch(() => {}),
    mongoose.connection.db.collection('indents').dropIndex('indentId_1').catch(() => {})
  ];
  await Promise.all(dropIndexPromises);
  console.log('Stale global unique indexes dropped in background.');

  // 2. Clean up case-insensitive duplicate staff_ids to allow index synchronization (optimized projection and update)
  try {
    const allUsers = await User.find({}, '_id staff_id tenantId');
    const counts = {};
    for (const user of allUsers) {
      if (!user.staff_id) continue;
      const cleanId = user.staff_id.toLowerCase().trim();
      if (!counts[cleanId]) {
        counts[cleanId] = [];
      }
      counts[cleanId].push(user);
    }

    const updates = [];
    for (const cleanId in counts) {
      const list = counts[cleanId];
      if (list.length > 1) {
        console.log(`[CLEANUP] Found duplicate staff_id: "${cleanId}" (${list.length} instances)`);
        for (let i = 0; i < list.length; i++) {
          const u = list[i];
          let newStaffId = u.staff_id.toLowerCase().trim();
          if (i > 0) {
            newStaffId = `${newStaffId}_${u.tenantId}`;
          }
          const lowerTenant = u.tenantId.toLowerCase().trim();
          updates.push(
            User.updateOne(
              { _id: u._id },
              { $set: { staff_id: newStaffId, tenantId: lowerTenant } }
            )
          );
        }
      } else if (list.length === 1) {
        const u = list[0];
        const lowerId = u.staff_id.toLowerCase().trim();
        const lowerTenant = u.tenantId.toLowerCase().trim();
        if (u.staff_id !== lowerId || u.tenantId !== lowerTenant) {
          updates.push(
            User.updateOne(
              { _id: u._id },
              { $set: { staff_id: lowerId, tenantId: lowerTenant } }
            )
          );
        }
      }
    }
    if (updates.length > 0) {
      await Promise.all(updates);
      console.log(`[CLEANUP] Standardized/Healed ${updates.length} user records.`);
    }
  } catch (err) {
    console.warn('[CLEANUP] Error cleaning up duplicate staff_ids:', err.message);
  }

  // 3. Sync multi-tenant compound indexes in parallel for fast per-tenant lookups
  const Patient = require('../models/Patient');
  const Visit = require('../models/Visit');
  const PatientIdentity = require('../models/PatientIdentity');
  const Counter = require('../models/Counter');

  const syncIndexPromises = [
    User.syncIndexes(),
    RoleCoverage.syncIndexes(),
    Medicine.syncIndexes(),
    Appointment.syncIndexes(),
    LabRequest.syncIndexes(),
    Prescription.syncIndexes(),
    Indent.syncIndexes(),
    Patient.syncIndexes(),
    Visit.syncIndexes(),
    PatientIdentity.syncIndexes(),
    Counter.syncIndexes()
  ];
  await Promise.all(syncIndexPromises.map(p => p.catch(err => console.warn('Index sync warning:', err.message))));
  console.log('Multi-tenant compound indexes synced in background.');

  // Safe, non-destructive backfill for existing patient UH-IDs and hospital Patient IDs
  try {
    const { backfillPatientIdentifiers } = require('../utils/identifierEngine');
    backfillPatientIdentifiers().then(res => {
      if (res.uhidUpdated > 0 || res.patientIdUpdated > 0) {
        console.log(`[IDENTIFIER-ENGINE] Backfilled ${res.uhidUpdated} UH-IDs and ${res.patientIdUpdated} Patient IDs.`);
      }
    }).catch(err => console.warn('[IDENTIFIER-ENGINE] Backfill warning:', err.message));
  } catch (bfErr) {
    console.warn('[IDENTIFIER-ENGINE] Init error:', bfErr.message);
  }

  // 4. Delete default seeded medicines and lab inventory items in parallel
  try {
    const defaultSkus = ["PAR-650", "AZI-500", "CET-10", "PAN-40", "AMX-250"];
    const LabInventory = require('../models/LabInventory');
    const defaultLabNames = ['Hematology Reagent', 'Vacuum Tubes (Red)', 'Glucose Test Strips', 'COVID-19 Swab Kits'];

    const [deleteMedResult, deleteLabResult] = await Promise.all([
      Medicine.deleteMany({ sku: { $in: defaultSkus } }),
      LabInventory.deleteMany({ name: { $in: defaultLabNames } })
    ]);
    if (deleteMedResult.deletedCount > 0) {
      console.log(`[CLEANUP] Deleted ${deleteMedResult.deletedCount} default seeded medicines.`);
    }
    if (deleteLabResult.deletedCount > 0) {
      console.log(`[CLEANUP] Deleted ${deleteLabResult.deletedCount} default seeded lab items.`);
    }
  } catch (cleanupErr) {
    console.warn('[CLEANUP] Error clearing defaults:', cleanupErr.message);
  }

  // 5. Create or update default superadmin user
  try {
    // Check for exact staff_id 'superadmin' or superadmin role
    let exactSuperadmin = await User.findOne({ 
      $or: [
        { staff_id: 'superadmin' },
        { role: { $in: ['superadmin', 'super_admin'] } },
        { email: 'super.admin@curoxa.com' }
      ]
    });

    if (!exactSuperadmin) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('Superadmin@123', salt);
      await User.create({
        tenantId: 'city_hospital',
        staff_id: 'superadmin',
        email: 'super.admin@curoxa.com',
        password_hash: hash,
        role: 'superadmin',
        name: 'Platform Super Admin',
        hasSetPassword: true,
        isSetupComplete: true
      });
      console.log('[SEED] Default superadmin user seeded. Username: superadmin, Password: Superadmin@123');
    } else {
      console.log(`[SEED] Superadmin account exists (${exactSuperadmin.staff_id}). Preserving configured password.`);
    }
  } catch (seedErr) {
    console.warn('[SEED] Error seeding/updating default admin:', seedErr.message);
  }

  // 6. Auto-heal modules for hospitals on Professional and Enterprise plans in parallel
  try {
    const SuperAdminHospital = require('../models/SuperAdminHospital');
    const hospitals = await SuperAdminHospital.find({});
    const healPromises = [];
    for (const hosp of hospitals) {
      let updated = false;
      if (hosp.plan && (hosp.plan.includes('Professional') || hosp.plan.includes('Enterprise'))) {
        if (!hosp.modules.pharmacy || !hosp.modules.pharmacy.enabled) {
          hosp.modules.pharmacy = { enabled: true, lastMod: new Date().toISOString() };
          updated = true;
        }
        if (!hosp.modules.laboratory || !hosp.modules.laboratory.enabled) {
          hosp.modules.laboratory = { enabled: true, lastMod: new Date().toISOString() };
          updated = true;
        }
      }
      if (hosp.plan && hosp.plan.includes('Enterprise')) {
        if (!hosp.modules.inventory || !hosp.modules.inventory.enabled) {
          hosp.modules.inventory = { enabled: true, lastMod: new Date().toISOString() };
          updated = true;
        }
      }
      if (updated) {
        hosp.markModified('modules');
        healPromises.push(hosp.save());
      }
    }
    if (healPromises.length > 0) {
      await Promise.all(healPromises);
      console.log(`[AUTO-HEAL] Modules for ${healPromises.length} hospital(s) updated successfully.`);
    }
  } catch (autoHealErr) {
    console.warn('[AUTO-HEAL] Error updating hospital modules:', autoHealErr.message);
  }
};

module.exports = connectDB;

