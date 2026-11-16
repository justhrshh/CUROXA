# QUROXA — ROOT CAUSE INVESTIGATION & RESOLUTION REPORT
## PRODUCTION ISSUE: HTTP 500 ON `POST /api/auth/patient-portal/global/send-otp`

**Document Version:** 2.0.0 (Resolved & Verified)  
**Incident Date:** 2026-11-16  
**Resolution Date:** 2026-11-16  
**Status:** **RESOLVED, DEPLOYED & LIVE PRODUCTION VERIFIED (100% PASS)**  

---

## 1. EXECUTIVE SUMMARY & INCIDENT OVERVIEW

### Observed Behavior
- **Client Application:** `https://quroxa-patient-frontend.onrender.com`
- **Target Backend:** `https://curoxa.onrender.com`
- **Endpoint:** `POST /api/auth/patient-portal/global/send-otp`
- **Observed Error:** `HTTP 500 Internal Server Error`
- **Client Message:** *"Failed to deliver SMS verification code. Please check the mobile number or try again later."*

### Root Cause
The HTTP 500 was **NOT** a database failure, routing bug, schema incompatibility, or process crash. 

The exact root cause was that **the SMS Gateway integration (`PING4SMS`) requires provider API credentials in the backend environment, but all 5 `PING4SMS_*` environment variables were absent from the Render Web Service (`CUROXA`, service ID `srv-da9t6nss728c73eooctg`)**.

When `send-otp` was called:
1. `validateConfig()` detected that `PING4SMS_API_KEY` was undefined.
2. The SMS gateway rejected dispatch before making any network request.
3. The centralized OTP service executed a **Zero-Orphan Rollback** (deleting the temporary OTP challenge from MongoDB and freeing rate-limit reservation).
4. The service mapped delivery failure to HTTP 500 with a user-facing error message.

### Resolution Summary
1. **Render Environment Configuration:** Added all five verified production PING4SMS environment variables (`PING4SMS_API_KEY`, `PING4SMS_TEMPLATE_ID`, `PING4SMS_SENDER_ID`, `PING4SMS_ROUTE`, `PING4SMS_API_URL`) to `srv-da9t6nss728c73eooctg`.
2. **Defensive Code Hardening:** Patched `clinical_management/backend/services/sms/ping4smsService.js` to ensure `templateId` automatically falls back to `DEFAULT_TEMPLATE_ID` (`1507165967974501361`) if omitted from the environment.
3. **Deployment:** Pushed commit `51ef712` to `justhrshh/CUROXA.git` and successfully deployed to Render (Deploy ID: `dep-dbtfesbncjis73a4am40`).
4. **Live Verification:** Live browser test confirmed `POST /api/auth/patient-portal/global/send-otp` returned `HTTP 200 OK`, `[SMS] PING4SMS accepted OTP dispatch...` logged in backend, and frontend transitioned cleanly to the 6-digit OTP entry screen.

---

## 2. PRODUCTION LOG EVIDENCE & ROOT CAUSE AUDIT

### 2.1 Backend Render Log Inspection (`srv-da9t6nss728c73eooctg`) — Before Fix

Captured from instance `[2jg57]` at 05:21:32 PM GMT+5:30:
```
(node:67) [MONGOOSE] Warning: mongoose: the `new` option for `findOneAndUpdate()` and `findOneAndReplace()` is deprecated. Use `returnDocument: 'after'` instead.
[SMS] PING4SMS configuration error: PING4SMS_API_KEY environment variable is not configured.
[NOTIFICATION] Primary SMS delivery failed for +91 ******2340: PING4SMS_API_KEY environment variable is not configured.
[OTP] Delivery failed for [PHONE_REDACTED: ******2340]. Executing Zero-Orphan Rollback.
```

### 2.2 Trace Analysis & Flow of Execution

| Step | File & Function | Operation | Result |
| :---: | :--- | :--- | :--- |
| **1** | `authRoutes.js`<br>`router.post('/patient-portal/global/send-otp')` (L2877) | Receives mobile, normalizes to 10 digits via `normalizeIndianMobile()`. | Valid (`9876543210`). Dispatches to `createAndDispatchOtp()`. |
| **2** | `otpService.js`<br>`createAndDispatchOtp()` (L367) | Reserves rate limit & upserts OTP document in `OtpChallenge` collection (`tenantId: 'global'`, `purpose: 'GLOBAL_PATIENT_AUTH'`). | **Success**. MongoDB document staged. Mongoose executes upsert. |
| **3** | `otpService.js`<br>`createAndDispatchOtp()` (L393) | Calls `sendOtpNotification({ channel: 'sms', target, otp, tenantId: 'global' })`. | Dispatched to Notification dispatcher. |
| **4** | `notificationService.js`<br>`sendOtpNotification()` (L91) | Evaluates `channel === 'sms'`. Masks phone number. Calls `sendOtpSms()`. | Dispatched to PING4SMS service. |
| **5** | `ping4smsService.js`<br>`sendOtpSms()` (L228-240) | Calls `getPing4smsConfig()`, then `validateConfig(config)`. | **FAILS (Pre-fix)**: `config.apiKey` is empty string. Logs: `[SMS] PING4SMS configuration error: PING4SMS_API_KEY environment variable is not configured.` |
| **6** | `otpService.js`<br>`createAndDispatchOtp()` (L408-424) | Detects `!dispatchResult.success`. Executes **Zero-Orphan Rollback**: `OtpChallenge.deleteOne({ _id: challenge._id })`, releases rate-limit reservation. | Database kept clean (zero orphaned unverified challenges). Returns `{ success: false, status: 500, error: 'Failed to deliver SMS verification code. Please check the mobile number or try again later.' }`. |
| **7** | `authRoutes.js`<br>`router.post('/patient-portal/global/send-otp')` (L2901-2907) | Receives `status: 500` and error from `dispatchResult`. Sends HTTP 500 to client. | Frontend displays error banner. |

---

## 3. APPLIED RESOLUTION & CONFIGURATION

### 3.1 Render Environment Configuration Applied

The following 5 environment variables were configured and saved on Render Web Service `CUROXA` (`srv-da9t6nss728c73eooctg`):

| Variable Key | Configured Value / Description | Status in Render |
| :--- | :--- | :---: |
| `PING4SMS_API_KEY` | Production API Secret *(Confidential — Redacted)* | **CONFIGURED & ACTIVE** |
| `PING4SMS_TEMPLATE_ID` | `1507165967974501361` (TRAI DLT approved template ID) | **CONFIGURED & ACTIVE** |
| `PING4SMS_SENDER_ID` | `PNGOTP` (Approved 6-char transactional sender ID) | **CONFIGURED & ACTIVE** |
| `PING4SMS_ROUTE` | `2` (Transactional / DLT route) | **CONFIGURED & ACTIVE** |
| `PING4SMS_API_URL` | `https://site.ping4sms.com/api/smsapi` (Legacy GET endpoint) | **CONFIGURED & ACTIVE** |

### 3.2 Defensive Backend Code Patch

**File Modified:** `clinical_management/backend/services/sms/ping4smsService.js`  
**Git Commit:** `51ef712` (`fix(sms): apply DEFAULT_TEMPLATE_ID fallback and export validateConfig in ping4smsService`)

```diff
diff --git a/backend/services/sms/ping4smsService.js b/backend/services/sms/ping4smsService.js
index 12315e9..e46b598 100644
--- a/backend/services/sms/ping4smsService.js
+++ b/backend/services/sms/ping4smsService.js
@@ -61,7 +61,7 @@ function getPing4smsConfig() {
   return {
     apiKey: (process.env.PING4SMS_API_KEY || '').trim(),
     senderId: (process.env.PING4SMS_SENDER_ID || DEFAULT_SENDER_ID).trim(),
-    templateId: (process.env.PING4SMS_TEMPLATE_ID || '').trim(),
+    templateId: (process.env.PING4SMS_TEMPLATE_ID || DEFAULT_TEMPLATE_ID).trim(),
     route: (process.env.PING4SMS_ROUTE || DEFAULT_ROUTE).trim(),
     apiUrl: (process.env.PING4SMS_API_URL || DEFAULT_API_URL).trim()
   };
@@ -367,6 +367,7 @@ async function sendOtpSms({ mobile, otp, tenantId, _mockTransport, _mockHttpRequ
 
 module.exports = {
   sendOtpSms,
+  validateConfig,
   buildDltOtpMessage,
   getPing4smsConfig,
   buildPing4smsRequest,
```

### 3.3 Production Deployment Identifiers

- **Render Service ID:** `srv-da9t6nss728c73eooctg` (`CUROXA`)
- **Render Deploy ID:** `dep-dbtfesbncjis73a4am40`
- **Deploy Trigger:** `Environment updated by you`
- **Commit SHA:** `51ef712203d4c30d8131faa7b880f83b8da169de`
- **Deploy Duration:** `1m 13s`
- **Service Status:** **Deploy succeeded | Live**

---

## 4. VERIFICATION RESULTS & EVIDENCE

### 4.1 Live Browser & Network Verification (`quroxa-patient-frontend.onrender.com`)

| Verification Check | Target / Action | Result / Observation | Status |
| :--- | :--- | :--- | :---: |
| **Input Validation** | Entering invalid mobile (`123`) or empty field | `Continue →` button remains strictly `[disabled]`. Submitting via API returns `HTTP 400 Bad Request`. | **PASS** |
| **Button Enablement** | Entering valid 10-digit mobile (`9876543210`) | `Continue →` button immediately enables. | **PASS** |
| **CORS Preflight** | `OPTIONS /api/auth/patient-portal/global/send-otp` | `HTTP 204 No Content`<br>`access-control-allow-origin: https://quroxa-patient-frontend.onrender.com` | **PASS** |
| **Live Dispatch Request** | `POST /api/auth/patient-portal/global/send-otp` | **`HTTP 200 OK`**<br>`{"success": true, "channel": "sms", "maskedTarget": "+91 ******3210", "cooldownSeconds": 30}` | **PASS** |
| **UI Screen Transition** | After clicking `Continue →` | Button displays loading spinner ("Sending Verification Code..."), then card seamlessly transitions to **"Enter 6-Digit Code"** view with countdown timer ("Resend code (22s)") and segmented input box. | **PASS** |
| **Browser Console** | Entire flow | **0 Errors, 0 Warnings**. | **PASS** |

### 4.2 Production Backend Logs (`srv-da9t6nss728c73eooctg`) — Post-Fix

Timestamped log extracted directly from active production instance `[c5d2j]` at 06:35:42 PM GMT+5:30:

```
[SMS] PING4SMS accepted OTP dispatch for +91 ******3210 (Sender: PNGOTP, Route: 2, Tenant: global)
```

**Confirmation:** The SMS gateway successfully accepted the dispatch on Route 2 with sender `PNGOTP` under `tenantId: global`.

### 4.3 Automated Regression Test Results

1. **`test_ping4sms_fallback.cjs` (Configuration & Fallback Unit Suite):**
   - Result: **13 / 13 Passed (100%)**
   - Validated: `templateId` default fallback, explicit env override, API key validation, DLT template pattern.
2. **`test_global_patient_portal_mvp.cjs` (Phase H Core Test Suite):**
   - Result: **26 / 26 Passed (100%)**
   - Validated: OTP dispatch, single-profile auto-login, profile disambiguation, hospital switching, token segregation, rate limiting.
3. **`test_cors_hardening.js` (Stage G.2 CORS Suite):**
   - Result: **28 / 28 Passed (100%)**
   - Validated: Exact origin allowlist, credential headers, wildcard rejection, Socket.IO handshake policy.
4. **`verify_stage_g3_security_and_socket.js` (Stage G.3 Security & Socket Suite):**
   - Result: **14 / 14 Passed (100%)**
   - Validated: Socket tenant isolation, cross-patient IDOR protection, staff authentication stability.

**Total Automated Tests:** **81 / 81 Passed (100%)**.

---

## 5. SECURITY & COMPLIANCE VERIFICATION

- **Confidentiality:** All SMS provider secrets, API keys, and credentials reside exclusively in the Render environment settings and local `.env`. Zero secrets were logged, committed, or exposed.
- **Privacy & DPDP Compliance:** Phone numbers in backend logs and frontend payloads are masked (`+91 ******3210`). Plaintext mobile numbers and OTP codes are never logged.
- **Zero-Orphan Invariant:** If SMS delivery fails (e.g. invalid phone number), the backend executes Zero-Orphan Rollback, deleting the unverified MongoDB OTP challenge and releasing the rate-limit reservation.
- **Staff Frontend Isolation:** Staff portal (`https://curoxa-1.onrender.com`) and `clinical_management/frontend/` source code were 100% untouched.

---

## 6. CONCLUSION & PRODUCTION STATUS

The production HTTP 500 error on `POST /api/auth/patient-portal/global/send-otp` is **fully resolved**.

- **Backend:** `https://curoxa.onrender.com` is LIVE with commit `51ef712` and active PING4SMS credentials.
- **Patient Frontend:** `https://quroxa-patient-frontend.onrender.com` is LIVE, accepting mobile numbers, dispatching live SMS OTPs, and transitioning cleanly to verification.
- **Staff Frontend:** `https://curoxa-1.onrender.com` remains completely stable and operational.
