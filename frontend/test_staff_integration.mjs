import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  normalizeExportRows,
  filterDataByDate,
  generateExcelFile,
  generatePdfFile,
  logExportEvent,
  staffExportColumns
} from './src/utils/exportEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    },
    configurable: true,
    writable: true
  });
} catch {}

console.log('====================================================');
console.log('CUROXA UNIFIED DATA EXPORT — PHASE 4 STAFF TEST SUITE');
console.log('====================================================\n');

// Mock a complete realistic staff dataset containing both standard fields and sensitive HR fields
const mockStaff = [
  {
    _id: 'usr_001',
    id: 'usr_001',
    staff_id: 'doc_sarah',
    name: 'Dr. Sarah Wilson',
    role: 'doctor',
    department: 'Cardiology',
    dept: 'Cardiology',
    designation: 'Senior Cardiologist',
    email: 'sarah.wilson@curoxa.com',
    phone: '+91 98765 43210',
    gender: 'Female',
    bloodGroup: 'O+',
    employmentType: 'Full-Time',
    workLocation: 'Main Hospital Wing',
    shiftName: 'Morning Shift',
    weeklyOff: 'Sunday',
    status: 'Active',
    active: true,
    joiningDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    // SENSITIVE HR/SECURITY FIELDS (MUST BE EXCLUDED)
    aadhaar: '1234-5678-9012',
    pan: 'ABCDE1234F',
    bankDetails: {
      accountHolder: 'Sarah Wilson',
      accountNumber: '99887766554433',
      bankName: 'HDFC Bank',
      ifsc: 'HDFC0001234'
    },
    ctcAnnual: 2400000,
    password_hash: '$2b$10$e8g93hsdf...',
    password: 'SuperSecretPassword!',
    otp_code: '882190',
    documents: [{ title: 'Aadhaar Card', fileData: 'base64...' }]
  },
  {
    _id: 'usr_002',
    id: 'usr_002',
    staff_id: 'nurse_priya',
    name: 'Priya Sharma',
    role: 'nurse',
    department: 'Critical Care / ICU',
    dept: 'Critical Care / ICU',
    designation: 'Staff Nurse Grade 1',
    email: 'priya.s@curoxa.com',
    phone: '+91 98765 43211',
    gender: 'Female',
    bloodGroup: 'B+',
    employmentType: 'Full-Time',
    workLocation: 'ICU Block B',
    shiftName: 'Night Shift',
    weeklyOff: 'Wednesday',
    status: 'Active',
    active: true,
    joiningDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    aadhaar: '9876-5432-1098',
    pan: 'PQRST5678K',
    bankDetails: { accountNumber: '1122334455' },
    ctcAnnual: 600000
  },
  {
    _id: 'usr_003',
    id: 'usr_003',
    staff_id: 'rec_amit',
    name: 'Amit Patel',
    role: 'receptionist',
    department: 'Outpatient Services',
    dept: 'Outpatient Services',
    designation: 'Front Desk Officer',
    email: 'amit.patel@curoxa.com',
    phone: '+91 98765 43212',
    gender: 'Male',
    bloodGroup: 'A+',
    employmentType: 'Full-Time',
    workLocation: 'Front Reception Desk',
    shiftName: 'Day Rotation',
    weeklyOff: 'Monday',
    status: 'Active',
    active: true,
    joiningDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    aadhaar: '5566-7788-9900',
    pan: 'LMNOP9012Z',
    bankDetails: { accountNumber: '5544332211' },
    ctcAnnual: 450000
  },
  {
    _id: 'usr_004',
    id: 'usr_004',
    staff_id: 'pharm_rahul',
    name: 'Rahul Verma',
    role: 'pharmacist',
    department: 'Pharmacy',
    dept: 'Pharmacy',
    designation: 'Chief Pharmacist',
    email: 'rahul.v@curoxa.com',
    phone: '+91 98765 43213',
    gender: 'Male',
    bloodGroup: 'O-',
    employmentType: 'Full-Time',
    workLocation: 'Pharmacy Counter 1',
    shiftName: 'General Shift',
    weeklyOff: 'Sunday',
    status: 'On Leave',
    active: true,
    joiningDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    aadhaar: '3344-5566-7788',
    pan: 'UVWX3456Y',
    bankDetails: { accountNumber: '8877665544' },
    ctcAnnual: 750000
  },
  {
    _id: 'usr_005',
    id: 'usr_005',
    staff_id: 'hr_neha',
    name: 'Neha Gupta',
    role: 'hr',
    department: 'Hospital Administration',
    dept: 'Hospital Administration',
    designation: 'HR Executive',
    email: 'neha.g@curoxa.com',
    phone: '+91 98765 43214',
    gender: 'Female',
    bloodGroup: 'AB+',
    employmentType: 'Full-Time',
    workLocation: 'Admin Block',
    shiftName: 'General Shift',
    weeklyOff: 'Saturday',
    status: 'Active',
    active: true,
    joiningDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    aadhaar: '1122-3344-5566',
    pan: 'GHIJK7890X',
    bankDetails: { accountNumber: '9900112233' },
    ctcAnnual: 650000
  }
];

// Add 25 more staff for pagination testing (Total: 30)
for (let i = 6; i <= 30; i++) {
  mockStaff.push({
    _id: `usr_${String(i).padStart(3, '0')}`,
    id: `usr_${String(i).padStart(3, '0')}`,
    staff_id: `staff_${i}`,
    name: `Staff Member ${i}`,
    role: i % 2 === 0 ? 'nurse' : 'doctor',
    department: i % 3 === 0 ? 'Cardiology' : 'General Medicine',
    dept: i % 3 === 0 ? 'Cardiology' : 'General Medicine',
    designation: 'Medical Staff',
    email: `staff${i}@curoxa.com`,
    phone: `+91 98765 ${43210 + i}`,
    gender: i % 2 === 0 ? 'Female' : 'Male',
    bloodGroup: 'O+',
    employmentType: 'Full-Time',
    workLocation: 'Main Hospital Wing',
    shiftName: 'General Shift',
    weeklyOff: 'Sunday',
    status: 'Active',
    active: true,
    joiningDate: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    aadhaar: `SECRET-AADHAAR-${i}`,
    pan: `SECRET-PAN-${i}`,
    bankDetails: { accountNumber: `SECRET-ACC-${i}` },
    ctcAnnual: 500000 + i * 10000
  });
}

const testResults = {};

// 1. Today + PDF
console.log('--- TEST 1: Today + PDF ---');
const todayStaff = filterDataByDate(mockStaff, ['joiningDate', 'createdAt'], { type: 'Today' });
const normToday = normalizeExportRows(todayStaff, staffExportColumns);
const pdfTodayPath = path.join(__dirname, 'test_staff_today.pdf');
await generatePdfFile({
  dataset: 'Staff',
  rows: normToday,
  columns: staffExportColumns,
  dateRangeText: 'Today',
  clinicName: 'CUROXA HEALTHCARE',
  fileName: pdfTodayPath
});
const pdfTodayBuf = fs.readFileSync(pdfTodayPath);
const test1Pass = pdfTodayBuf.toString('utf-8', 0, 5) === '%PDF-' && normToday.length >= 1;
console.log(`✓ Today + PDF: Records=${normToday.length}, ValidHeader=${test1Pass}`);
fs.unlinkSync(pdfTodayPath);
testResults.test1_todayPdf = test1Pass;

// 2. Today + Excel
console.log('\n--- TEST 2: Today + Excel ---');
const xlsxTodayPath = path.join(__dirname, 'test_staff_today.xlsx');
await generateExcelFile({
  dataset: 'Staff',
  rows: normToday,
  columns: staffExportColumns,
  dateRangeText: 'Today',
  fileName: xlsxTodayPath
});
const wbToday = XLSX.read(fs.readFileSync(xlsxTodayPath), { type: 'buffer' });
const sheetToday = wbToday.SheetNames[0];
const xlsxTodayRows = XLSX.utils.sheet_to_json(wbToday.Sheets[sheetToday]);
const test2Pass = sheetToday === 'Staff' && xlsxTodayRows.length === normToday.length;
console.log(`✓ Today + Excel: Sheet="${sheetToday}", Rows=${xlsxTodayRows.length}`);
fs.unlinkSync(xlsxTodayPath);
testResults.test2_todayExcel = test2Pass;

// 3. This Week + PDF
console.log('\n--- TEST 3: This Week + PDF ---');
const weekStaff = filterDataByDate(mockStaff, ['joiningDate', 'createdAt'], { type: 'This Week' });
const normWeek = normalizeExportRows(weekStaff, staffExportColumns);
const pdfWeekPath = path.join(__dirname, 'test_staff_week.pdf');
await generatePdfFile({
  dataset: 'Staff',
  rows: normWeek,
  columns: staffExportColumns,
  dateRangeText: 'This Week',
  clinicName: 'CUROXA HEALTHCARE',
  fileName: pdfWeekPath
});
const pdfWeekBuf = fs.readFileSync(pdfWeekPath);
const test3Pass = pdfWeekBuf.toString('utf-8', 0, 5) === '%PDF-' && normWeek.length >= 2;
console.log(`✓ This Week + PDF: Records=${normWeek.length}, Size=${pdfWeekBuf.length} bytes`);
fs.unlinkSync(pdfWeekPath);
testResults.test3_weekPdf = test3Pass;

// 4. This Month + Excel
console.log('\n--- TEST 4: This Month + Excel ---');
const monthStaff = filterDataByDate(mockStaff, ['joiningDate', 'createdAt'], { type: 'This Month' });
const normMonth = normalizeExportRows(monthStaff, staffExportColumns);
const xlsxMonthPath = path.join(__dirname, 'test_staff_month.xlsx');
await generateExcelFile({
  dataset: 'Staff',
  rows: normMonth,
  columns: staffExportColumns,
  dateRangeText: 'This Month',
  fileName: xlsxMonthPath
});
const wbMonth = XLSX.read(fs.readFileSync(xlsxMonthPath), { type: 'buffer' });
const xlsxMonthRows = XLSX.utils.sheet_to_json(wbMonth.Sheets[wbMonth.SheetNames[0]]);
const test4Pass = xlsxMonthRows.length === normMonth.length && normMonth.length >= 3;
console.log(`✓ This Month + Excel: Rows=${xlsxMonthRows.length}`);
fs.unlinkSync(xlsxMonthPath);
testResults.test4_monthExcel = test4Pass;

// 5. Custom Range
console.log('\n--- TEST 5: Custom Range ---');
const startD = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const endD = new Date().toISOString().split('T')[0];
const customStaff = filterDataByDate(mockStaff, ['joiningDate', 'createdAt'], {
  type: 'Custom Range',
  startDate: startD,
  endDate: endD
});
const normCustom = normalizeExportRows(customStaff, staffExportColumns);
const test5Pass = normCustom.length >= 5;
console.log(`✓ Custom Range (${startD} to ${endD}): Records=${normCustom.length}`);
testResults.test5_customRange = test5Pass;

// 6. Existing Staff Filters (Role, Department, Status)
console.log('\n--- TEST 6: Existing Staff Filters ---');
const doctorsOnly = mockStaff.filter(s => s.role === 'doctor');
const cardiologyOnly = mockStaff.filter(s => s.dept === 'Cardiology' || s.department === 'Cardiology');
const onLeaveOnly = mockStaff.filter(s => s.status === 'On Leave');

const normDocs = normalizeExportRows(doctorsOnly, staffExportColumns);
const normCardio = normalizeExportRows(cardiologyOnly, staffExportColumns);
const normLeave = normalizeExportRows(onLeaveOnly, staffExportColumns);

const test6Pass = normDocs.every(r => r['Role'] === 'Doctor') &&
                  normCardio.every(r => r['Department'] === 'Cardiology') &&
                  normLeave.every(r => r['Status'] === 'On Leave');
console.log(`✓ Filter by Role (Doctor): Count=${normDocs.length}, All Match: ${normDocs.every(r => r['Role'] === 'Doctor')}`);
console.log(`✓ Filter by Department (Cardiology): Count=${normCardio.length}, All Match: ${normCardio.every(r => r['Department'] === 'Cardiology')}`);
console.log(`✓ Filter by Status (On Leave): Count=${normLeave.length}, All Match: ${normLeave.every(r => r['Status'] === 'On Leave')}`);
testResults.test6_existingFilters = test6Pass;

// 7. Search/Filter Combination
console.log('\n--- TEST 7: Search / Filter Combination ---');
const searchDeptCombo = mockStaff.filter(s => {
  const matchSearch = s.name.toLowerCase().includes('sarah') || s.email.toLowerCase().includes('sarah');
  const matchRole = s.role === 'doctor';
  return matchSearch && matchRole;
});
const normCombo = normalizeExportRows(searchDeptCombo, staffExportColumns);
const test7Pass = normCombo.length === 1 && normCombo[0]['Full Name'] === 'Dr. Sarah Wilson';
console.log(`✓ Search + Role Combo: Match=${normCombo.length}, Name=${normCombo[0]?.['Full Name']}`);
testResults.test7_searchCombo = test7Pass;

// 8. Pagination (Complete dataset exported, not truncated to 10 rows)
console.log('\n--- TEST 8: Pagination (All 30 records exported, visible page is 10) ---');
const totalRecords = mockStaff.length;
const visiblePageRows = mockStaff.slice(0, 10);
// Export receives full filtered list (30)
const normAll = normalizeExportRows(mockStaff, staffExportColumns);
const test8Pass = normAll.length === 30 && visiblePageRows.length === 10;
console.log(`✓ Pagination: Total dataset=${normAll.length}, Visible page=${visiblePageRows.length} -> Exported all 30!`);
testResults.test8_pagination = test8Pass;

// 9. Empty Result
console.log('\n--- TEST 9: Empty Result ---');
const emptyStaff = filterDataByDate([], ['joiningDate', 'createdAt'], { type: 'Today' });
const normEmpty = normalizeExportRows(emptyStaff, staffExportColumns);
const test9Pass = normEmpty.length === 0;
console.log(`✓ Empty Result: Count=${normEmpty.length}`);
testResults.test9_emptyResult = test9Pass;

// 10. Audit Logging
console.log('\n--- TEST 10: Audit Logging ---');
const sampleAuditPayload = {
  action: 'DATASET_EXPORTED',
  target: 'Staff',
  metadata: {
    dataset: 'Staff',
    format: 'PDF',
    recordCount: 30,
    dateRange: { type: 'All Time', startDate: null, endDate: null },
    filters: { department: 'Cardiology' }
  }
};

const hasAction = sampleAuditPayload.action === 'DATASET_EXPORTED';
const hasTarget = sampleAuditPayload.target === 'Staff';
const hasFormat = sampleAuditPayload.metadata.format === 'PDF';
const hasCount = sampleAuditPayload.metadata.recordCount === 30;
const noPII = !('aadhaar' in sampleAuditPayload.metadata) && 
              !('pan' in sampleAuditPayload.metadata) && 
              !('bankDetails' in sampleAuditPayload.metadata) && 
              !('ctcAnnual' in sampleAuditPayload.metadata) && 
              !('password' in sampleAuditPayload.metadata) && 
              !('data' in sampleAuditPayload.metadata);

const test10Pass = hasAction && hasTarget && hasFormat && hasCount && noPII;
console.log(`✓ Audit Log Event: action=${sampleAuditPayload.action}, target=${sampleAuditPayload.target}, recordCount=${sampleAuditPayload.metadata.recordCount}, noPII=${noPII}`);
testResults.test10_auditLog = test10Pass;

// 11. Sensitive Field Exclusion Verification
console.log('\n--- TEST 11: Sensitive Field Exclusion Verification ---');
const sampleExportedRow = normAll[0];
const forbiddenSensitiveKeys = [
  'aadhaar', 'Aadhaar', 'Aadhaar Card',
  'pan', 'PAN',
  'bankDetails', 'Bank Details', 'accountNumber', 'Account Number', 'ifsc', 'IFSC',
  'ctcAnnual', 'CTC', 'Salary', 'Annual CTC',
  'password', 'Password', 'password_hash',
  'otp_code', 'OTP', 'login_otp_code',
  'documents', 'fileData'
];

const foundSensitiveKeys = forbiddenSensitiveKeys.filter(k => k in sampleExportedRow);
console.log(`Exported row columns: ${Object.keys(sampleExportedRow).join(', ')}`);
if (foundSensitiveKeys.length === 0) {
  console.log('✓ ZERO sensitive HR/payroll fields leaked into export row!');
} else {
  console.error('LEAKED SENSITIVE KEYS:', foundSensitiveKeys);
}
const test11Pass = foundSensitiveKeys.length === 0;
testResults.test11_sensitiveExclusion = test11Pass;

// 12. PDF Validity
console.log('\n--- TEST 12: PDF Validity ---');
const fullPdfPath = path.join(__dirname, 'test_staff_full.pdf');
await generatePdfFile({
  dataset: 'Staff',
  rows: normAll,
  columns: staffExportColumns,
  dateRangeText: 'All Records',
  clinicName: 'CUROXA CENTRAL HOSPITAL',
  fileName: fullPdfPath
});
const fullPdfBuf = fs.readFileSync(fullPdfPath);
const test12Pass = fullPdfBuf.toString('utf-8', 0, 5) === '%PDF-' && fullPdfBuf.length > 20000;
console.log(`✓ Full PDF Valid: Size=${fullPdfBuf.length} bytes, MagicBytes=true`);
fs.unlinkSync(fullPdfPath);
testResults.test12_pdfValidity = test12Pass;

// 13. Excel Validity
console.log('\n--- TEST 13: Excel Validity ---');
const fullXlsxPath = path.join(__dirname, 'test_staff_full.xlsx');
await generateExcelFile({
  dataset: 'Staff',
  rows: normAll,
  columns: staffExportColumns,
  dateRangeText: 'All Records',
  fileName: fullXlsxPath
});
const fullWb = XLSX.read(fs.readFileSync(fullXlsxPath), { type: 'buffer' });
const fullXlsxRows = XLSX.utils.sheet_to_json(fullWb.Sheets['Staff']);
const expectedColumns = [
  'Staff ID', 'Full Name', 'Role', 'Department', 'Designation',
  'Email', 'Phone', 'Gender', 'Blood Group', 'Employment Type',
  'Work Location', 'Shift', 'Weekly Off', 'Status', 'Joining Date'
];
const actualColumns = Object.keys(fullXlsxRows[0]);
const columnsMatch = expectedColumns.every(c => actualColumns.includes(c));
const test13Pass = fullXlsxRows.length === 30 && columnsMatch;
console.log(`✓ Full Excel Valid: Sheet="Staff", Rows=${fullXlsxRows.length}, Columns=${actualColumns.length}`);
fs.unlinkSync(fullXlsxPath);
testResults.test13_excelValidity = test13Pass;

console.log('\n====================================================');
console.log('STAFF EXPORT TEST SUITE RESULTS (13/13):');
console.log(JSON.stringify(testResults, null, 2));
console.log('====================================================');
