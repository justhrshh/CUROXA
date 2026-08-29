# CUROXA — ADMIN PHASE 1 BASELINE REPORT (BEFORE CHANGES)
**Document Generated**: 2026-08-24  
**Scope**: CUROXA Admin Design Foundation & Dashboard Shell  

---

## 1. Existing Admin Navigation & Pages

The Admin interface (`AdminDashboard.jsx`) contains the following navigation sections and tabs in the Sidebar:

### Overview Group
- **Dashboard** (`activeTab === 'dashboard'`): Primary command center.
- **Alerts & Tasks** (`activeTab === 'supply'`): Critical stock, compliance, and clinical operational warnings.
- **Approvals** (`activeTab === 'approvals'`): Administrative approvals for discounts, waivers, and leaves.
- **PO Approvals** (`activeTab === 'po-approvals'`): Pharmacy and procurement purchase order sign-offs (gated by `tenantModules.inventory`).

### Clinic Group
- **Appointments** (`activeTab === 'appointments'`): OPD schedules, token queues, doctor bookings (gated by `tenantModules.reception`).
- **Patients** (`activeTab === 'patients'` / `'patient-details'`): EMR directory, patient profiles, medical records (gated by `tenantModules.reception`).
- **Staff / Workforce** (`activeTab === 'workforce'`): Employee directory, roster, attendance statuses.
- **Role Coverage** (`activeTab === 'permissions'`): Temporary role delegation and access control matrix.

### Finance & System Group
- **Revenue** (`activeTab === 'financials'`): Financial ledgers, payment modes, revenue breakdown.
- **Audit Logs** (`activeTab === 'audit'`): Security audit trails, timestamped administrative events.
- **DPO & Compliance** (`activeTab === 'dpdp'`): DPDP data privacy officer portal & compliance audits (gated by `tenantModules.dpdp`).

### Settings Group
- **Pricing & Procedures** (`activeTab === 'services-catalog'`): Hospital charges, OPD consultation pricing, procedure catalog.
- **Lab Tests Catalog** (`activeTab === 'lab-catalog'`): Diagnostic test codes, price list, specimen types, TAT.
- **Subscription** (`activeTab === 'subscription'`): Plan tier, license limits, upgrade workflows.
- **Maintenance** (`activeTab === 'maintenance'`): Database health, diagnostic services.
- **Letterhead Settings** (`activeTab === 'letterhead'`): Prescription letterhead upload, margins, layout preview.
- **Updates** (`activeTab === 'updates'`): Platform release notes and hotfix logs.

### Active Coverages Group (Conditional)
- **Receptionist Cover** (links to `/receptionist`)
- **Lab Cover** (links to `/lab`)
- **Pharmacy Cover** (links to `/pharmacy`)
- **Doctor Cover** (links to `/doctor`)

---

## 2. Existing Visible Features on the Admin Dashboard

When `activeTab === 'dashboard'`, the following sections and components are rendered:

1. **Top Header**:
   - **Header Title**: Dynamic title (`Dashboard`) with sub-text (current date and hospital/tenant name).
   - **Plan Status Badge**: Active plan tier and status indicator (e.g. `Enterprise - active`).
   - **Alerts Outline Badge**: Pill button with total count of critical + warning alerts (clicking opens `Alerts & tasks` tab).
   - **Notification Bell & Popover**: Bell icon with unread count badge, popup dropdown with notification list and "Clear all".
   - **Manage / Add Staff Button**: Primary action button launching the HR & Staff management modal/portal.
   - **Mobile Menu Toggle (Hamburger)**: Toggle button for responsive viewport sidebar access.

2. **Top KPI Stat Cards (4 Cards)**:
   - **Card 1 (Patients)**: *Today's Registrations* (`todayPatientsCount`), clickable filter to Patients tab.
   - **Card 2 (Appointments)**: *Appointments Today* (`todayAppts.length`), clickable filter to Appointments tab.
   - **Card 3 (Collections)**: *Today's Revenue* (`todayRevenue`), clickable to open revenue breakdown modal.
   - **Card 4 (Attendance)**: *Staff Present Today* (`staffPresentCount`), clickable to workforce tab.

3. **Two-Column Dashboard Content Grid**:
   - **Left Column**:
     - **Role Coverage Widget**: Displays active temporary delegations (`getActiveDelegationsForDashboard()`) with staff avatar, transition, department, assigner, duration, remaining time badge, and "Remove" button. Empty state fallback: *"No active temporary delegations. Use the Role Coverage tab to delegate permissions."* Header action: *"View All >"*.
     - **Approvals & Tasks Widget**: Displays top pending approvals (`pendingApprovals`) with title, category, subtitle, "Approve" button, and "Reject" button. Empty state fallback: *"No pending approvals. All clear!"* Header action: *"View All >"*.
   - **Right Column**:
     - **Alerts & Tasks Widget**: Scrollable stack of critical and warning alerts (`criticalAlerts`, `warningAlerts`) with title, severity badge, "Resolve" button, and "Details" button. Empty state fallback: *"All systems operational. No active alerts."* Header action: *"All >"*.

---

## 3. Existing Interactive Elements

- **Sidebar**:
  - Collapse / Expand Toggle Button (`.sidebar-collapse-toggle`) with local storage persistence.
  - All sidebar navigation link items with active highlighting.
  - User profile popover toggle with avatar, user name, role, and "Logout" button.
- **Header**:
  - Hamburger mobile toggle button.
  - Plan status badge.
  - Alerts outline badge button.
  - Notification bell with unread badge and interactive popover.
  - "Clear all" notifications button.
  - Primary "Manage / Add Staff" action button.
- **KPI Cards**:
  - Today's Registrations card → navigates to Patients tab filtered by "Today".
  - Appointments Today card → navigates to Appointments tab filtered by "Today".
  - Today's Revenue card → opens Revenue breakdown modal with 'today' timeframe.
  - Staff Present Today card → navigates to Workforce tab.
- **Role Coverage Widget**:
  - "View All >" button → navigates to Role Coverage tab (`activeTab = 'permissions'`).
  - "Remove" button per delegation card → revokes delegation or dismisses mock.
- **Approvals Widget**:
  - "View All >" button → navigates to Approvals tab (`activeTab = 'approvals'`).
  - "Approve" button per approval item → calls `approveApprovalItem()`.
  - "Reject" button per approval item → calls `rejectApprovalItem()`.
  - Vendor onboarding item title click → opens vendor profile modal.
- **Alerts Widget**:
  - "All >" button → navigates to Alerts tab (`activeTab = 'supply'`).
  - "Resolve" button per alert → calls `resolveCriticalAlert()` or `resolveWarningAlert()`.
  - "Details" button per alert → triggers details feedback toast.

---

## 4. Existing Components & Files Inspected

- `src/App.jsx`: Root routing, socket listeners, protected routes.
- `src/pages/AdminDashboard.jsx`: Admin layout, sidebar, header, dashboard, and all admin sub-tabs.
- `src/css/index.css`: Global styling, responsive breakpoints, collapsible sidebar rules.

---

## 5. Existing Functionality Dependencies

- **APIs**:
  - `/approvals` (GET, POST for approve/reject)
  - `/appointments` (GET, filtered for today's OPD load)
  - `/patients` (GET, filtered for today's new registrations)
  - `/billing` (GET, filtered for today's paid collections)
  - `/staff` (GET, filtered for attendance and on-duty counts)
  - `/admin/letterhead` (GET, POST for letterhead templates)
  - `/auth/support/tickets` (POST for subscription upgrades)
- **State & Local Storage**:
  - `activeTab` state controls all view swapping.
  - `curoxa_sidebar_collapsed` in localStorage persists sidebar state across reloads.
  - `curoxa_notifications_last_seen_*` tracks unread notifications.
  - `curoxa_pmState` stores local permission delegations.
  - `curoxa_colorful_theme` controls legacy theme toggle.
- **Socket.IO**:
  - `data_changed` event dispatches global sync.
  - `session_revoked` triggers immediate logout if credentials change.
  - `system_broadcast` notifies admin of real-time server messages.

---

## 6. Existing UI/UX Issues Observed

1. **KPI Card Visual Inconsistency**: The 4 KPI cards currently use 4 completely disparate pastel gradients (blue, purple, green, yellow) with mismatched inline styles. They should use neutral surfaces with controlled CUROXA brand accents.
2. **Excessive Inline Styles**: Heavy reliance on hardcoded inline styles (`style={{ ... }}`) causing visual rigidity and inconsistent border radii, shadows, and paddings across sections.
3. **Empty State Presentation**: Empty states in Role Coverage, Approvals, and Alerts look like plain dashed wireframe boxes rather than polished enterprise guidance.
4. **Header Alignment & Visual Balance**: Plan badge, alert pill, notification bell, and primary Add Staff button have varying padding, borders, and alignments across viewport sizes.
5. **Sidebar Scrollbar & Hover States**: The sidebar styling has legacy color tokens and inconsistent icon alignments when transitioning between expanded and collapsed modes.

---
*Report established as the baseline prior to Phase 1 styling execution.*
