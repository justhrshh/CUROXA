# QUROXA Super Admin Portal — Responsive Engineering Checklist & Status

## Overview
This document tracks the comprehensive responsive audit, remediation, and verification across all Super Admin routes, pages, views, and reusable components.

---

### Phase 1: Shared Core Application Shell & Navigation
- [x] Global layout container (`.sa-root`) with `100svh` & dynamic viewport support
- [x] Responsive sidebar drawer (`.sa-sidebar`, `.sa-drawer-backdrop`) with toggle, swipe, outside click, & Esc key
- [x] Tablet collapsed icon rail (`≤900px`)
- [x] Contextual Topbar (`.sa-topbar`, `.sa-menu-trigger`, `.sa-topbar-title`, `.sa-topbar-left/center/right`)
- [x] Right productivity sidebar drawer collapse on tablet/mobile (`.sa-right-sidebar`)
- [x] Notification center drawer responsive max-width (`.sa-drawer-container`)
- [x] Global search modal viewport sizing (`.sa-search-modal`)
- [x] SuperAdmin Profile & Password settings modal (`92vw` responsive sizing)
- [x] System confirmation / delete dialogs (`.sa-modal-overlay`, `.sa-modal-container`)

---

### Phase 2: Routes & Primary Modules Audit & Implementation
1. **Platform Overview / Dashboard (`dashboard`)**
   - [x] Hero KPI metrics grid (`.sa-hero-kpi-grid`, `.sa-kpi-grid`)
   - [x] Telemetry chart & analytics desk containers
   - [x] Quick actions & recent activity feeds

2. **Clinic Onboarding (`hospital-onboarding`)**
   - [x] 2-column onboarding split layout (`.sa-onboarding-grid`)
   - [x] Pipeline queue & onboarding detail cards
   - [x] Step forms & milestone checklists

3. **Clinics Directory (`hospitals`)**
   - [x] Clinics KPI ribbon (5 cards responsive collapse)
   - [x] Search, filter pills & status badges
   - [x] Clinics data table with horizontal touch scrolling (`.sa-table-scroll-wrapper`)
   - [x] Clinics split layout & Needs Attention side panel (`.sa-panel-split`)

4. **Hospital Profile Deep-Dive (`hospitals/:hospitalId` / `hospital-profile`)**
   - [x] Header identity card (`.sa-profile-header`, `.sa-profile-header-identity`, `.sa-profile-header-actions`)
   - [x] Top breadcrumb with status badge (`.sa-profile-breadcrumb`)
   - [x] Profile sub-navigation tab strip with touch scroll (`.sa-profile-tabs`)
   - [x] Tab 1: Overview & Branding
   - [x] Tab 2: Subscription & Modules (toggles & limits)
   - [x] Tab 3: Registration & Legal (GSTIN/PAN/CIN validation grids)
   - [x] Tab 4: Admin Credentials (staff ID & password reset flow)
   - [x] Tab 5: Administrative Operations (portal reset, suspension toggles)

5. **Subscription Management (`subscription-mgmt`)**
   - [x] Plan cards grid (`.sa-plan-grid`)
   - [x] Plan features list & pricing toggles
   - [x] Edit plan modal responsive layout

6. **Catalog & Procurement Masters**
   - [x] Item Master View (`item-master` / `MasterManagementView`)
   - [x] Vendor Master View (`vendor-master` / `VendorMasterView`)
   - [x] Stock Master View (`stock-master` / `StockMasterView`)
   - [x] Common Master Upload View (`master-upload` / `CommonMasterUploadView`)
   - [x] Master Requests & Approvals View (`item-requests` / `SuperAdminMasterApprovalsView`)

7. **Operations & Communications**
   - [x] Customer Support (`customer-support` / `support-success`)
     - Support tickets split layout
     - Help desk & SLA response panels
   - [x] Broadcast Center (`broadcast-center`)
     - System broadcast composer & history table
   - [x] Finance & Billing (`finance` / `finance-mgmt`)
     - Financial KPI cards
     - Invoices & revenue tables
     - Tax breakdown & renewal alerts

8. **Company & Workforce (`employees`)**
   - [x] HR Sub-navigation (`.sa-sub-navbar`)
   - [x] Team Directory (`hr-mgmt`)
     - Role distribution stats row (`.sa-kpi-grid`)
     - Employee directory table (`.sa-table-scroll-wrapper`)
   - [x] Departments View (`departments`)
   - [x] Security Roles View (`platform-roles`)
     - RBAC role registry grid (`.sa-two-col-grid`)
   - [x] Audit Logs View (`platform-audits`)
     - Platform event logs table

9. **Analytics & BI Reports (`reports` / `bi-reports`)**
   - [ ] Platform reports dashboard
   - [ ] Growth metrics & clinical usage charts
   - [ ] Export engine triggers (PDF, CSV, Excel)

10. **System & Platform Control (`settings` / `platform-control`)**
    - [x] Control sub-navigation (`.sa-sub-navbar`)
    - [x] Platform Telemetry Dashboard
    - [x] Developer Center & Sandbox
