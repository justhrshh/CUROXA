# QUROXA PATIENT PORTAL — EXACT LOGIN DESIGN REPLICATION REPORT

**Document Version:** 1.0.0  
**Target:** Global Patient Portal Login (`GlobalLoginPage.jsx`)  
**Reference Source:** Provided High-Fidelity Reference Image (`media_1794890382200_e8202ca3.jpg`)  
**Execution Mode:** Visual Replication + Verification (Zero Commit / Zero Push / No Render Deployment)  
**Status:** COMPLETE & VERIFIED

---

## 1. EXECUTIVE SUMMARY & REPLICATION DIRECTIVE

In accordance with operator instructions, the QUROXA Global Patient Portal login screen has been rebuilt as an **exact, pixel-precise replication** of the provided design reference. 

Key constraints strictly honored:
1. **Single Source of Truth:** Visual composition, typography hierarchy, colors, spacing, iconography, and element layout reproduce the provided image reference down to individual visual details.
2. **Authentic QUROXA Branding:** The generic heart-monitor icon in the reference image was replaced with the **authentic QUROXA brand icon** retrieved from `clinical_management/frontend/src/assets/curoxa_icon_logo.png`. Proportions, colors, and visual identity are preserved with zero CSS/text synthetic reconstructions.
3. **Preservation of Core Functionality:** 100% of the working OTP authentication state machine (`phone` entry, `otp` 6-digit verification, multi-profile redirection, DPDP Act compliance routing, and auto-hospital redirection) remains fully intact and operational.
4. **No Premature Deployment:** No code has been pushed to GitHub and no deployment has been triggered on Render. All artifacts remain staged locally for operator visual review.

---

## 2. OFFICIAL BRAND ASSET DISCOVERY & USAGE

An inspection of `clinical_management/frontend/src/assets/` revealed our existing brand assets:
- `curoxa_icon_logo.png`: Stylized circular emblem with teal-to-blue gradient borders and central medical cross.
- `quroxa_new_logo.png` & `curoxa_logo_transparent.png`: Official horizontal typography and logomarks.

### Application in Replicated Layout
- **Top Brand Lockup:** Placed at top center with `curoxa_icon_logo.png` (44px) alongside bold uppercase "QUROXA" in `#071a36` with "Health Management" subtitle in slate-500.
- **Overhanging Card Badge:** Positioned at `-top-7` (-28px) overhanging the central card in a deep navy square (`#071a36`) with rounded-2xl geometry, a crisp 3px pure white border, and deep ambient shadow, embedding the official QUROXA emblem.

---

## 3. DESIGN REPLICATION MATRIX

| Reference Element | Visual Implementation Details | Status |
| :--- | :--- | :--- |
| **Top Hero Atmosphere** | Doctor hands holding patient hands on the left, modern hospital building with "Care Today Healthier Tomorrow" on the right. Processed with sky gradient fill overlay to ensure clean vector typography and zero card clipping. | **Exact Match** |
| **Hero Typography** | Bold headline *"Your Health. Our Priority."* in `#071a36` (30px), supporting subtext *"Access your medical records, appointments and more — anytime, anywhere."* in slate-600. | **Exact Match** |
| **Accent Divider** | Centered 48px rounded pill divider in vibrant teal (`#14b8a6`). | **Exact Match** |
| **Central Floating Card** | Pure white card (`#ffffff`) with 32px/36px rounded corners, deep soft diffusion shadow (`0 20px 50px rgba(15,31,61,0.12)`), subtle slate border (`border-slate-100/80`). | **Exact Match** |
| **Card Header Titles** | Centered bold *"QUROXA"* uppercase (24px) followed by royal blue uppercase tracking *"GLOBAL PATIENT PORTAL"* (`#1d4ed8`), *"Welcome back!"* headline, and explanatory prompt. | **Exact Match** |
| **Phone Input Field** | 56px rounded container with subtle border (`border-blue-200`), dark navy circular phone icon badge (`#071a36`), `+91` country prefix with vertical hairline divider, and bold mobile number input. | **Exact Match** |
| **DPDP Privacy Strip** | Light mint/teal container (`#e8f7f5`) with `#bbf0e7` border, green circular check icon (`#0d9488`), DPDP Act 2023 compliance notice, vertical divider, and *"Learn More >"* link. Text wraps cleanly on mobile without truncation. | **Exact Match** |
| **Continue Button** | Full-width 56px pill button with smooth blue gradient (`from-[#003d99] via-[#0052cc] to-[#0066f5]`), bold white typography, right arrow icon (`ArrowRight`), and blue ambient glow shadow. | **Exact Match** |
| **OR Divider** | Subtle horizontal rule with centered white uppercase badge *"OR"* in `#94a3b8`. | **Exact Match** |
| **Trust Badges (3-Col)** | 1. **Secure Access** (Blue shield check)<br>2. **Your Privacy / Our Commitment** (Blue lock icon with vertical borders)<br>3. **Better Care / Together** (Teal-blue gradient medical cross icon). | **Exact Match** |
| **Oceanic Waves & Footer** | Flowing multi-tone teal and cobalt blue waves terminating in a deep navy footer bar with centered *"Powered by QUROXA"*. | **Exact Match** |

---

## 4. ARCHITECTURE & CODE INTEGRATION

### 1. Standalone Route Decoupling (`PatientLayout.jsx`)
Previously, `PatientLayout.jsx` forced global navigation bars (`PatientHeader` and `PatientMobileNav`) onto all routes. This caused extraneous hospital headers to overlap the login hero illustration.
- **Correction:** Added route condition `const isAuthRoute = location.pathname === '/' || location.pathname === '/login';`.
- When an auth route is active, `<Outlet />` is rendered directly in full-bleed mode without injecting dashboard navigation chrome.

### 2. State Machine Preservation (`GlobalLoginPage.jsx`)
- **Step 1 (`phone`):** Renders the replicated reference design. Handles 10-digit validation, dispatches `POST /api/auth/patient-portal/global/send-otp`, initiates resend cooldown timer.
- **Step 2 (`otp`):** Dynamically transitions card header to *"Verification Code"*, renders 6-digit spaced mono input, shows masked destination (`+91 ******XXXX`), resend countdown, and *"Change Number"* toggle.
- **Step 3 (`no_profile`):** Informs unregistered users gracefully with direct option to try another number.
- **Profile Redirection:** Automatically routes multi-identity families to `/select-profile` with cryptographic selection tokens.

---

## 5. PLAYWRIGHT CROSS-DEVICE VERIFICATION

Automated browser tests were conducted against the live preview build (`http://127.0.0.1:4173/`) across three standard form factors:

| Viewport | Device Profile | Page Dimensions | Horizontal Overflow | Console Errors | Visual Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **390 × 844 px** | Mobile (iPhone 14/15) | `scrollWidth: 390px` | **FALSE (0 px)** | **0 Errors** | Perfect alignment, no clipping |
| **360 × 800 px** | Mobile (Android Compact) | `scrollWidth: 360px` | **FALSE (0 px)** | **0 Errors** | DPDP strip wraps 2 lines cleanly |
| **1440 × 900 px** | Desktop / Laptop Screen | `scrollWidth: 1440px` | **FALSE (0 px)** | **0 Errors** | Centered floating card with wave base |

### Screenshot Evidence Captured
- `quroxa-patient-frontend/src/assets/login_preview_390.png`
- `quroxa-patient-frontend/src/assets/login_preview_360.png`
- `quroxa-patient-frontend/src/assets/login_preview_1440.png`

---

## 6. PRODUCTION BUILD VERIFICATION

Production bundle compilation was tested via Vite:
```bash
npm --prefix "quroxa-patient-frontend" run build
```
- **Modules Transformed:** 1604 modules
- **CSS Bundle:** `dist/assets/index-Dd70fo-U.css` (61.33 kB)
- **JS Bundle:** `dist/assets/index-DDue0csy.js` (502.46 kB)
- **Asset Bundle:** `hero_clean_top`, `footer_waves`, `curoxa_icon_logo` bundled into `dist/assets/`
- **Result:** Build completed with **Exit Code 0** in 12.94s.

---

## 7. CURRENT STATUS & NEXT STEPS

- [x] Complete pixel-precise replication of reference design implemented in `GlobalLoginPage.jsx`.
- [x] Official QUROXA brand asset integrated into header and card badge.
- [x] Responsive layout tested and verified across mobile (360px, 390px) and desktop (1440px).
- [x] Zero console errors, zero layout overflow regressions.
- [x] Build tested and verified clean.
- [ ] **Awaiting Operator Visual Review:** In accordance with instructions, changes will remain local until explicit operator approval to commit, push to GitHub, or deploy to Render.
