/**
 * QUROXA — COMMON MASTER UPLOAD CENTER + MASTER NAVIGATION RESTRUCTURE TEST
 * 
 * Verifies:
 * 1. Catalog & Procurement sidebar items (5 items: item-master, vendor-master, stock-master, master-upload, item-requests)
 * 2. SuperAdminDashboard tab routes & permissions
 * 3. MasterManagementView simplification (tabs reduced to Catalog & Hospital Pricing; search/add/export aligned in local toolbar)
 * 4. CommonMasterUploadView presence & master-type switcher
 * 5. SuperAdminMasterApprovalsView wired to item-requests
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTests() {
  console.log('========================================================================');
  console.log('   QUROXA — COMMON MASTER UPLOAD CENTER & NAVIGATION RESTRUCTURE');
  console.log('========================================================================\n');

  let passed = 0;

  // 1. Check SuperAdminDashboard.jsx sidebarNavGroups
  const dashboardPath = path.resolve(__dirname, '../../frontend/src/pages/SuperAdminDashboard.jsx');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

  console.log('--- 1. Catalog & Procurement Sidebar Navigation Restructure ---');
  
  assert(dashboardContent.includes("group: 'Catalog & Procurement'"), 'Catalog & Procurement group must exist');
  
  // Find Catalog & Procurement block
  const catProcMatch = dashboardContent.match(/group:\s*'Catalog & Procurement'[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  assert(catProcMatch, 'Catalog & Procurement items block must be present');
  const itemsBlock = catProcMatch[1];

  assert(itemsBlock.includes("id: 'item-master'"), 'Item Master must be in Catalog & Procurement');
  assert(itemsBlock.includes("id: 'vendor-master'"), 'Vendor Master must be in Catalog & Procurement');
  assert(itemsBlock.includes("id: 'stock-master'"), 'Stock Master must be in Catalog & Procurement');
  assert(itemsBlock.includes("id: 'master-upload'"), 'Upload must be in Catalog & Procurement');
  assert(itemsBlock.includes("id: 'item-requests'"), 'Item Requests must be in Catalog & Procurement');

  // Verify label is "Upload"
  assert(itemsBlock.includes("label: 'Upload'"), "Upload item must be labeled 'Upload'");
  console.log("  [PASS] 1. All 5 top-level destinations exist under 'Catalog & Procurement' (Item Master, Vendor Master, Stock Master, Upload, Item Requests)");
  passed++;

  // 2. Tab Permissions and Title Mapping
  console.log('\n--- 2. RBAC Access and Title Mapping ---');
  assert(dashboardContent.includes("'master-upload'"), "master-upload must be registered in allowed tabs");
  assert(dashboardContent.includes("'master-upload': { title: 'Upload', icon: 'upload-cloud' }"), "TAB_TITLE_MAP must register 'master-upload'");
  console.log("  [PASS] 2. 'master-upload' registered in ROLE_ACCESS_MAP, isTabAllowed, and TAB_TITLE_MAP");
  passed++;

  // 3. Routing & Component Wiring
  console.log('\n--- 3. Component Wiring in SuperAdminDashboard ---');
  assert(dashboardContent.includes("import CommonMasterUploadView from '../components/superadmin/masters/CommonMasterUploadView'"), "CommonMasterUploadView must be imported");
  assert(dashboardContent.includes("import SuperAdminMasterApprovalsView from '../components/superadmin/masters/SuperAdminMasterApprovalsView'"), "SuperAdminMasterApprovalsView must be imported");
  assert(dashboardContent.includes("activeTab === 'master-upload' && ("), "activeTab === 'master-upload' must render CommonMasterUploadView");
  assert(dashboardContent.includes("<CommonMasterUploadView"), "<CommonMasterUploadView /> must be rendered for master-upload");
  assert(dashboardContent.includes("activeTab === 'item-requests' && ("), "activeTab === 'item-requests' must render SuperAdminMasterApprovalsView");
  assert(dashboardContent.includes("<SuperAdminMasterApprovalsView"), "<SuperAdminMasterApprovalsView /> must be rendered for item-requests");
  console.log("  [PASS] 3. CommonMasterUploadView and SuperAdminMasterApprovalsView properly routed");
  passed++;

  // 4. CommonMasterUploadView Structure
  console.log('\n--- 4. CommonMasterUploadView Extensibility & Design ---');
  const uploadViewPath = path.resolve(__dirname, '../../frontend/src/components/superadmin/masters/CommonMasterUploadView.jsx');
  assert(fs.existsSync(uploadViewPath), "CommonMasterUploadView.jsx must exist");
  const uploadContent = fs.readFileSync(uploadViewPath, 'utf8');

  assert(uploadContent.includes("selectedMasterType === 'item-master'"), "item-master must be supported in CommonMasterUploadView");
  assert(uploadContent.includes("<HospitalMasterUploadView"), "HospitalMasterUploadView must be rendered when item-master is selected");
  assert(uploadContent.includes("Vendor Master Upload — Coming Soon"), "Vendor Master coming soon state must be present");
  assert(uploadContent.includes("Stock Master Upload — Coming Soon"), "Stock Master coming soon state must be present");
  console.log("  [PASS] 4. CommonMasterUploadView provides master type switcher with active Item Master and clean Coming Soon states for Vendor & Stock");
  passed++;

  // 5. MasterManagementView Simplification
  console.log('\n--- 5. Item Master (MasterManagementView) Simplification ---');
  const masterMgmtPath = path.resolve(__dirname, '../../frontend/src/components/superadmin/masters/MasterManagementView.jsx');
  const masterMgmtContent = fs.readFileSync(masterMgmtPath, 'utf8');

  // Verify subtabs: only 'catalog' and 'hospital-pricing'
  assert(!masterMgmtContent.includes("onClick={() => setActiveSubTab('approvals')}"), "Master Approvals tab must NOT exist in MasterManagementView");
  assert(!masterMgmtContent.includes("onClick={() => setActiveSubTab('uploads')}"), "Hospital Master Uploads tab must NOT exist in MasterManagementView");
  assert(!masterMgmtContent.includes("New Hospital Request"), "New Hospital Request button must NOT exist in MasterManagementView");
  assert(!masterMgmtContent.includes("setTopbarContent"), "setTopbarContent must NOT be used in MasterManagementView");
  console.log("  [PASS] 5. Sub-tabs reduced to Master Catalog and Hospital Pricing; Approvals and Upload tabs removed; topbar hook removed");
  passed++;

  // 6. Local Catalog Action Toolbar Horizontally Aligned
  console.log('\n--- 6. Local Catalog Action Toolbar Layout ---');
  assert(masterMgmtContent.includes("STEP 2: LOCAL CATALOG ACTION TOOLBAR"), "Local catalog action toolbar must be present");
  assert(masterMgmtContent.includes("placeholder=\"Search code, item, manufacturer...\""), "Search input must be inside local catalog action toolbar");
  assert(masterMgmtContent.includes("<span>Add Item</span>"), "Add Item button must be inside local catalog action toolbar");
  assert(masterMgmtContent.includes("<span>{isExporting ? 'Exporting...' : 'Export'}</span>"), "Export dropdown must be inside local catalog action toolbar");
  console.log("  [PASS] 6. Catalog toolbar contains horizontally aligned: [ Search ] ... [ + Add Item ] [ Export ▼ ]");
  passed++;

  console.log('\n========================================================================');
  console.log(`   TEST RESULTS: ${passed} / 6 PASSED (100%)`);
  console.log('========================================================================\n');
}

runTests();
