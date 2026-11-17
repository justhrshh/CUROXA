# QUROXA PATIENT PORTAL — GLOBAL SESSION PERSISTENCE & TOKEN LIFECYCLE REPORT

**Document Version:** 1.0.0  
**Target Systems:**  
- Patient Frontend: `quroxa-patient-frontend`  
- Clinical Backend: `clinical_management/backend`  
**Status:** IMPLEMENTED, TESTED & VERIFIED (Zero Regressions, Zero Commit/Push Pending Approval)

---

## 1. EXECUTIVE SUMMARY

An authentication UX defect was reported where a patient, after logging in to the Global Patient Portal, selecting a hospital, and entering its clinical dashboard, was unexpectedly ejected to `/login` upon clicking **All Hospitals**.

This report documents:
1. The comprehensive audit and exact root cause of the unexpected redirection.
2. The implementation of a dual-scope, cryptographically isolated session architecture:
   - **Scope A:** Global Patient Session (central portal, hospital directory, hospital selection, switching).
   - **Scope B:** Hospital Clinical Session (clinical records, appointments, prescriptions, hospital clinical REST APIs, and Socket.IO rooms).
3. The implementation of a short-lived access-token (30m) and server-verifiable refresh-token (7-day idle, 30-day absolute) rotation system backed by HttpOnly, Secure cookies and MongoDB.
4. The exact fix for the **All Hospitals** navigation flow, ensuring returning to `/portal` preserves the global session without re-authenticating.
5. Automated test results covering all 14 scenarios and security invariants with zero failures.

---

## 2. AUDIT OF EXISTING AUTHENTICATION & ROOT CAUSE ANALYSIS

### Investigation Findings

1. **Global OTP Verification (`/api/auth/patient-portal/global/verify-otp`) & Select Profile:**
   - The backend issued a JWT with claims `role: 'global_patient'`, `token_use: 'global_portal'`, but with an arbitrary `expiresIn: '1h'` and **zero refresh token or cookie**.
   - The frontend stored this token in `localStorage.setItem('quroxa_global_token', ...)`.

2. **Hospital Selection (`/api/auth/patient-portal/global/select-hospital`):**
   - The backend verified the global token and issued a hospital-scoped JWT with claims `role: 'patient'`, `token_use: 'hospital_clinical'`, and `expiresIn: '24h'`, again with **zero refresh token**.
   - The frontend stored this hospital token in `localStorage.setItem('token', ...)`.

3. **The Exact Chain of Failure on "All Hospitals":**
   - **Step 1 (Missing Action in Header):** In `quroxa-patient-frontend/src/components/layout/PatientHeader.jsx`, the button labeled *"All Hospitals"* executed `handleSwitchHospital = () => navigate('/portal');`. It did not invoke `switchHospital()` to clear the active hospital clinical session. Consequently, the hospital clinical token remained in `localStorage.getItem('token')`.
   - **Step 2 (Axios Interceptor Blind Overwrite):** In `quroxa-patient-frontend/src/services/api.js`, the request interceptor contained:
     ```javascript
     const token = localStorage.getItem('token');
     if (token) {
       config.headers.Authorization = `Bearer ${token.trim()}`;
     }
     ```
     This unconditionally overwrote `config.headers.Authorization` with the **hospital clinical token** on every outbound request, even when the caller explicitly provided `quroxa_global_token` in headers.
   - **Step 3 (Backend Rejection):** Upon landing on `/portal`, `GlobalPortalPage.jsx` executed `authService.getGlobalPortalData(globalToken)`. The Axios interceptor replaced the global token with the hospital clinical token. When the request reached `GET /api/auth/patient-portal/global/portal-data`, the backend evaluated:
     ```javascript
     if (decoded.role !== 'global_patient' && decoded.token_use !== 'global_portal') {
       return res.status(403).json({ error: 'Invalid token: Global patient session required.' });
     }
     ```
     Because the hospital token has `role: 'patient'` and `token_use: 'hospital_clinical'`, the backend correctly returned **HTTP 403 Forbidden**.
   - **Step 4 (Catastrophic Logout Cascade):** `GlobalPortalPage.jsx` had a defensive catch block:
     ```javascript
     if (err.response?.status === 401 || err.response?.status === 403) {
       globalLogout();
       navigate('/login');
     }
     ```
     This triggered `globalLogout()`, which wiped `quroxa_global_token` and `quroxa_global_patient` and redirected the user to `/login`.
   - **Step 5 (Absence of Refresh Lifecycle):** If a user refreshed `/portal` after the global access token expired, `GlobalProtectedRoute` evaluated `isTokenExpired(globalToken) === true` and redirected straight to `/login` because no refresh mechanism existed.

---

## 3. SESSION ARCHITECTURE: DUAL-SCOPE ISOLATION

The system now enforces strict cryptographic and logical boundaries between two scopes:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SCOPE A: GLOBAL PATIENT SESSION                      │
├────────────────────────────────────────────────────────────────────────┤
│ • Token Use: 'global_portal' | Role: 'global_patient'                  │
│ • Access Token: 30 minutes validity (in-memory / local fallback)       │
│ • Refresh Cookie: 'quroxa_patient_global_refresh' (HttpOnly, Secure)   │
│ • Endpoints: /api/auth/patient-portal/global/*                         │
│ • Authorized Actions: Central directory, select hospital, switch       │
│ • Forbidden: Direct access to hospital clinical records or Socket.IO   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                 [Select Hospital /api/.../select-hospital]
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  SCOPE B: HOSPITAL CLINICAL SESSION                    │
├────────────────────────────────────────────────────────────────────────┤
│ • Token Use: 'hospital_clinical' | Role: 'patient'                     │
│ • Invariant: req.user.id === Patient._id                               │
│ • Access Token: 30 minutes validity (in-memory / local fallback)       │
│ • Refresh Cookie: 'quroxa_patient_hospital_refresh' (HttpOnly, Secure) │
│ • Endpoints: /api/:tenantId/*, /api/appointments, /api/prescriptions   │
│ • Authorized Actions: EMR, labs, prescriptions, hospital Socket.IO     │
│ • Forbidden: Accessing another hospital's data or central portal auth  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. TOKEN LIFECYCLE & ROTATION SPECIFICATION

### Before vs After Comparison

| Property | Before Implementation | After Implementation |
| :--- | :--- | :--- |
| **Global Access Token** | 1 hour | **30 minutes** (`expiresIn: '30m'`) |
| **Hospital Access Token** | 24 hours | **30 minutes** (`expiresIn: '30m'`) |
| **Global Refresh Token** | None | **7-day idle / 30-day absolute limit** (HttpOnly cookie) |
| **Hospital Refresh Token**| None | **7-day idle / 30-day absolute limit** (HttpOnly cookie) |
| **Refresh Rotation** | Not implemented | **Rotated on every refresh request** |
| **Reuse Detection** | None | **Revokes entire token family (`familyId`)** |
| **All Hospitals Button** | Navigates without state cleanup | **Revokes hospital cookie, clears hospital state, preserves global** |
| **Axios Interceptor** | Overwrites all auth headers | **Scope-aware routing (Global vs Hospital), 401 refresh mutex** |
| **Socket Token Expiry** | Disconnected without recovery | **Re-authenticates via `socketService.updateToken()` on refresh** |

### Refresh Cookie Configuration
- **Cookie Names:**
  - Global Session: `quroxa_patient_global_refresh`
  - Hospital Session: `quroxa_patient_hospital_refresh`
- **Security Attributes:**
  - `httpOnly: true` (prevents XSS exfiltration; not stored in localStorage or sessionStorage)
  - `secure: true` (production / Render HTTPS)
  - `sameSite: 'none'` in production (enables cross-origin delivery between frontend and backend on Render)
  - `sameSite: 'lax'` in local development
  - `path: '/api/auth'` (least-privilege path restriction)
  - `maxAge: 7 * 24 * 60 * 60 * 1000` (7-day idle TTL)

---

## 5. REFRESH FLOW & MUTEX QUEUE IMPLEMENTATION

When an access token expires:
1. **Frontend Interceptor Detection:**
   - Detects HTTP 401 on protected requests.
   - Prevents recursion: skips refresh for auth/OTP endpoints or requests marked `_retry`.
2. **Scope Determination & Mutex Locking:**
   - Scope A (Global URLs): Uses `isRefreshingGlobal` lock and `globalSubscribers` queue.
   - Scope B (Hospital URLs): Uses `isRefreshingHospital` lock and `hospitalSubscribers` queue.
   - Simultaneous requests queue their callbacks without firing redundant refresh requests.
3. **Backend Validation & Rotation:**
   - Backend verifies SHA-256 hash of refresh token in MongoDB.
   - Checks `isRevoked` (triggers **Reuse Detection** if true, revoking all sessions in `familyId`).
   - Checks `expiresAt` (7-day idle limit) and `absoluteExpiresAt` (30-day session cap).
   - Verifies user/patient still exists and hospital is active.
   - Issues a new refresh token, saves old session as revoked with `replacedByTokenHash`, and emits the new HttpOnly cookie.
   - Issues fresh 30-minute access token.
4. **Retry & Recovery:**
   - Queued requests are resolved and retried with the new access token.
   - If hospital refresh fails, only Scope B credentials are wiped (`token`, `user`), leaving Scope A intact.
   - If global refresh fails, Scope A credentials are wiped and user is redirected to `/login`.

---

## 6. ALL HOSPITALS NAVIGATION WORKFLOW

When the patient clicks **All Hospitals** in `PatientHeader.jsx`:
1. `handleSwitchHospital()` invokes `await switchHospital()`.
2. `switchHospital()`:
   - Disconnects active hospital Socket.IO connection.
   - Dispatches `POST /api/auth/patient-portal/hospital/leave` to revoke hospital session and clear `quroxa_patient_hospital_refresh`.
   - Clears `localStorage.removeItem('token')` and `localStorage.removeItem('user')`.
   - Clears temporary registration state.
   - **Crucially leaves `quroxa_global_token` and `quroxa_global_patient` intact.**
3. Navigates to `/portal`.
4. `GlobalProtectedRoute` checks global session:
   - If global token is active, user immediately views portal.
   - If global token expired during the hospital visit, it automatically performs a silent background refresh using `quroxa_patient_global_refresh` before rendering `/portal`.
5. `GlobalPortalPage` loads associated hospital directory cleanly using `quroxa_global_token`.

---

## 7. FILES MODIFIED & API ENDPOINTS

### Backend Files Modified
1. `clinical_management/backend/models/RefreshToken.js`:
   - Added `sessionScope` (`'staff' | 'global_patient' | 'hospital_patient'`).
   - Added `patientId` (`ObjectId`).
   - Added `absoluteExpiresAt` (`Date`).
   - Updated `createSession` to enforce idle (7d) and absolute (30d) limits.
2. `clinical_management/backend/utils/authSessionHelper.js`:
   - Added `getPatientGlobalRefreshCookieName` and `getPatientHospitalRefreshCookieName`.
   - Added `getPatientCookieOptions` and `getClearPatientCookieOptions`.
   - Added `issuePatientGlobalRefreshSession` and `issuePatientHospitalRefreshSession`.
   - Added `clearPatientGlobalRefreshCookie` and `clearPatientHospitalRefreshCookie`.
3. `clinical_management/backend/routes/authRoutes.js`:
   - `POST /api/auth/patient-portal/global/verify-otp`: 30m access token + Scope A refresh cookie.
   - `POST /api/auth/patient-portal/global/select-profile`: 30m access token + Scope A refresh cookie.
   - `POST /api/auth/patient-portal/global/select-hospital`: 30m access token + Scope B refresh cookie.
   - Added `POST /api/auth/patient-portal/global/refresh`: Scope A refresh with rotation & reuse detection.
   - Added `POST /api/auth/patient-portal/refresh`: Scope B refresh with tenant binding & rotation.
   - Added `POST /api/auth/patient-portal/global/logout`: Revokes both sessions and clears cookies.
   - Added `POST /api/auth/patient-portal/hospital/leave`: Revokes hospital session, preserves global.

### Frontend Files Modified
1. `quroxa-patient-frontend/src/services/api.js`:
   - Enabled `withCredentials: true`.
   - Scope-aware request interceptor (does not overwrite global authorization, omits `x-tenant-id` on global routes).
   - Dual-scope 401 response interceptor with refresh mutex and queue.
2. `quroxa-patient-frontend/src/services/authService.js`:
   - Added `refreshGlobalToken()`, `refreshHospitalToken()`, `leaveHospitalSession()`, `globalLogout()`.
3. `quroxa-patient-frontend/src/context/AuthContext.jsx`:
   - Added `refreshGlobalToken` and `refreshHospitalToken` actions.
   - Updated `switchHospital` to clear Scope B only.
   - Hardened `GlobalProtectedRoute` with automatic silent background refresh.
   - Hardened `ProtectedRoute` with automatic silent hospital refresh.
4. `quroxa-patient-frontend/src/components/layout/PatientHeader.jsx`:
   - Updated `handleSwitchHospital` to call `await switchHospital()` before navigation.
5. `quroxa-patient-frontend/src/services/socketService.js`:
   - Added `updateToken(newToken)` method for live credential updates after refresh.

---

## 8. VERIFICATION & TEST RESULTS

### 1. Backend Automated Verification Suite (`verify_patient_auth_lifecycle.js`)
All 14 required test scenarios and security invariants were executed and verified:

```
===============================================================
  QUROXA PATIENT PORTAL — TOKEN LIFECYCLE & SECURITY VERIFICATION
===============================================================

  [PASS] 1. Patient Cookie Helpers produce secure, HttpOnly cookie configurations
  [PASS] 2. Global patient access token has 30m validity and exact claims
  [PASS] 3. Hospital clinical access token enforces req.user.id === Patient._id and 30m validity
  [PASS] 4. Clinical auth middleware rejects Global patient tokens with HTTP 403
  [PASS] 5. Socket.IO middleware rejects Global patient tokens from clinical rooms
  [PASS] 6. Scope A: Global Patient refresh session creates record with 7d idle and 30d absolute limit
  [PASS] 7. Scope A: Global Refresh rotation creates new token in same family and revokes old token
  [PASS] 8. Scope A: Presenting previously rotated token triggers immediate family-wide revocation
  [PASS] 9. Scope A: Absolute 30-day limit blocks refresh even if idle timer has not expired
  [PASS] 10. Scope B: Hospital refresh session binds strictly to tenantId (never changes tenant on refresh)
  [PASS] 11. Tenant isolation: Token from Hospital A cannot validate for Hospital B context
  [PASS] 12. All Hospitals Flow: /hospital/leave revokes hospital session while preserving global session
  [PASS] 13. Full Logout: /global/logout revokes both global and hospital sessions
  [PASS] 14. Socket.IO service supports seamless token update upon refresh without unmounting

===============================================================
  SUMMARY: 14 PASSED, 0 FAILED
===============================================================
```

### 2. Backend CORS & Socket Origin Regression Suite (`verify_cors_portal_fix.js` & `test_cors_hardening.js`)
- `verify_cors_portal_fix.js`: **17 PASSED | 0 FAILED**
- `test_cors_hardening.js`: **34 PASSED | 0 FAILED**

### 3. Playwright Live Browser Verification
Tests conducted against the production build on `http://127.0.0.1:4173/`:
- **Step 1:** Navigated to `/city_hospital/dashboard` with active hospital clinical session and global session.
- **Step 2:** Clicked *"Return to Central Portal to Switch Hospital"* (`All Hospitals`).
- **Step 3:** Verified navigation cleanly arrived at `http://127.0.0.1:4173/portal` (did NOT redirect to `/login`).
- **Step 4:** Verified `localStorage`:
  - `hasGlobalToken: true`
  - `hasGlobalPatient: true`
  - `hasHospitalToken: false`
  - `hasHospitalUser: false`
- **Step 5:** Clicked *"Sign Out"* on `/portal`.
- **Step 6:** Verified user landed at `http://127.0.0.1:4173/login` with all localStorage credentials wiped.

---

## 9. DEPLOYMENT & PRODUCTION ROLLOUT REQUIREMENTS

1. **Environment Variables:**
   - Ensure Render backend service (`srv-da9t6nss728c73eooctg`) has:
     - `AUTH_REFRESH_TOKEN_DAYS=7` (default fallback active)
     - `AUTH_SESSION_ABSOLUTE_DAYS=30` (default fallback active)
     - `PATIENT_FRONTEND_URL=https://quroxa-patient-frontend.onrender.com`
2. **Database Indexes:**
   - MongoDB automatically enforces the TTL expiration index on `RefreshToken.expiresAt`.
3. **Approval Status:**
   - Staged locally. Zero changes committed or pushed to GitHub; no Render deployments triggered pending operator approval.
