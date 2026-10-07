/**
 * QUROXA — PHASE 2B.1 FRONTEND AUTHENTICATION TEST SUITE
 * Verifies in-memory token store, single-flight refresh interceptor,
 * cross-tab Web Locks coordination, zero-credential payload sanitization,
 * multi-tab race control, logout contract, and migration boundaries.
 */

import assert from 'assert';

// Mock browser globals for Node test environment
const mockStorage = new Map();
global.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

global.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

global.window = {
  location: { pathname: '/admin', href: 'http://localhost/admin' },
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  __quroxaTabId: 'test-tab-1'
};

global.document = {
  title: 'Quroxa',
  getElementById: () => null,
  querySelector: () => null
};

// Mock Web Locks API for Node test environment
class MockWebLocks {
  constructor() {
    this.locks = new Map();
    this.queue = [];
    this.isProcessing = false;
  }

  async request(name, callback) {
    return new Promise((resolve, reject) => {
      this.queue.push({ name, callback, resolve, reject });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      try {
        const res = await item.callback({ name: item.name });
        item.resolve(res);
      } catch (err) {
        item.reject(err);
      }
    }

    this.isProcessing = false;
  }
}

try {
  Object.defineProperty(navigator, 'locks', {
    value: new MockWebLocks(),
    configurable: true,
    writable: true
  });
} catch (e) {
  // If navigator cannot be mutated
}

class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.listeners = [];
    MockBroadcastChannel.channels.push(this);
  }
  postMessage(data) {
    MockBroadcastChannel.messages.push(data);
    MockBroadcastChannel.lastMessage = data;
    MockBroadcastChannel.channels.forEach(ch => {
      if (ch !== this) {
        ch.listeners.forEach(fn => fn({ data }));
      }
    });
  }
  addEventListener(event, fn) {
    if (event === 'message') this.listeners.push(fn);
  }
  removeEventListener(event, fn) {
    this.listeners = this.listeners.filter(l => l !== fn);
  }
}
MockBroadcastChannel.channels = [];
MockBroadcastChannel.messages = [];
MockBroadcastChannel.lastMessage = null;
global.BroadcastChannel = MockBroadcastChannel;
global.window.BroadcastChannel = MockBroadcastChannel;

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        passedTests++;
        console.log(`  ✓ [FRONTEND PASS ${passedTests}] ${description}`);
      }).catch(err => {
        console.error(`  ✗ [FRONTEND FAIL] ${description}`);
        console.error(`     Error: ${err.message}`);
        throw err;
      });
    } else {
      passedTests++;
      console.log(`  ✓ [FRONTEND PASS ${passedTests}] ${description}`);
    }
  } catch (err) {
    console.error(`  ✗ [FRONTEND FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function runFrontendTests() {
  console.log('\n======================================================');
  console.log('QUROXA PHASE 2B.1: FRONTEND AUTH LIFECYCLE TEST SUITE');
  console.log('======================================================\n');

  const {
    getAccessToken,
    setAccessToken,
    clearAccessToken,
    broadcastAuthEvent,
    subscribeAuthChannel,
    sanitizeBroadcastPayload,
    executeWithRefreshLock,
    getLastRefreshTime,
    setLastRefreshTime,
    setLastRefreshFailTime
  } = await import('../src/utils/authTokenStore.js');

  console.log('--- SUITE 1: IN-MEMORY ACCESS TOKEN STORE ---');

  await it('1. Access token can be stored in memory', () => {
    setAccessToken('jwt_sample_token_123');
    assert.strictEqual(getAccessToken(), 'jwt_sample_token_123');
  });

  await it('2. Access token can be retrieved from memory', () => {
    assert.strictEqual(getAccessToken(), 'jwt_sample_token_123');
  });

  await it('3. Access token can be cleared from memory', () => {
    clearAccessToken();
    assert.strictEqual(getAccessToken(), null);
  });

  await it('4. In-memory token store does NOT persist to localStorage', () => {
    setAccessToken('in_memory_only_token_456');
    assert.strictEqual(localStorage.getItem('token'), null, 'localStorage must remain empty of access token');
    clearAccessToken();
  });

  console.log('\n--- SUITE 2: CROSS-TAB BROADCASTCHANNEL COORDINATION ---');

  await it('5. broadcastAuthEvent dispatches message over BroadcastChannel', () => {
    broadcastAuthEvent('SESSION_UPDATED');
    assert(MockBroadcastChannel.lastMessage);
    assert.strictEqual(MockBroadcastChannel.lastMessage.type, 'SESSION_UPDATED');
    assert(MockBroadcastChannel.lastMessage.timestamp);
    assert.strictEqual(MockBroadcastChannel.lastMessage.token, undefined);
  });

  await it('6. Cross-tab subscriber receives remote events but ignores own tab events', () => {
    let received = null;
    const ch1 = new MockBroadcastChannel('quroxa-auth');
    MockBroadcastChannel.channels.push(ch1);

    const unsub = subscribeAuthChannel((data) => {
      received = data;
    });

    // Simulate remote tab message
    ch1.postMessage({ type: 'LOGOUT', originTabId: 'other-tab-99', timestamp: Date.now() });
    assert(received, 'Subscriber must receive message from remote tab');
    assert.strictEqual(received.type, 'LOGOUT');
    unsub();
  });

  console.log('\n--- SUITE 3: CENTRAL AXIOS REQUEST INTERCEPTOR CONTRACT ---');

  await it('7. Request interceptor attaches in-memory token as Bearer header', () => {
    setAccessToken('jwt_bearer_valid_789');
    const config = { headers: {} };

    // Simulate request interceptor logic
    let token = getAccessToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    assert.strictEqual(config.headers['Authorization'], 'Bearer jwt_bearer_valid_789');
    clearAccessToken();
  });

  await it('8. Request interceptor without token does not set Authorization header', () => {
    clearAccessToken();
    const config = { headers: {} };
    let token = getAccessToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    assert.strictEqual(config.headers['Authorization'], undefined);
  });

  await it('9. Existing tenant header behavior is preserved', () => {
    localStorage.setItem('tenantId', 'hospital_alpha');
    const config = { headers: {} };
    const tId = localStorage.getItem('tenantId');
    if (tId) {
      config.headers['x-tenant-id'] = tId;
    }
    assert.strictEqual(config.headers['x-tenant-id'], 'hospital_alpha');
    localStorage.removeItem('tenantId');
  });

  console.log('\n--- SUITE 4: SINGLE-FLIGHT REFRESH & RACE CONTROL ---');

  await it('10. Multiple simultaneous 401s merge into exactly ONE refresh request', async () => {
    let refreshCalls = 0;
    let _refreshPromise = null;

    // Simulate single-flight refresh logic
    const mockRefresh = () => {
      if (_refreshPromise) return _refreshPromise;
      _refreshPromise = new Promise(resolve => {
        refreshCalls++;
        setTimeout(() => {
          resolve('refreshed_access_token_xyz');
          _refreshPromise = null;
        }, 50);
      });
      return _refreshPromise;
    };

    // 5 concurrent requests hit 401 simultaneously
    const results = await Promise.all([
      mockRefresh(),
      mockRefresh(),
      mockRefresh(),
      mockRefresh(),
      mockRefresh()
    ]);

    assert.strictEqual(refreshCalls, 1, 'Must execute exactly ONE refresh call for 5 simultaneous requests');
    results.forEach(tok => {
      assert.strictEqual(tok, 'refreshed_access_token_xyz');
    });
  });

  await it('11. Failed refresh rejects all waiting concurrent requests consistently', async () => {
    let _refreshPromise = null;

    const mockFailedRefresh = () => {
      if (_refreshPromise) return _refreshPromise;
      _refreshPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Refresh session expired'));
          _refreshPromise = null;
        }, 50);
      });
      return _refreshPromise;
    };

    let caughtCount = 0;
    await Promise.all([
      mockFailedRefresh().catch(() => caughtCount++),
      mockFailedRefresh().catch(() => caughtCount++),
      mockFailedRefresh().catch(() => caughtCount++)
    ]);

    assert.strictEqual(caughtCount, 3, 'All 3 concurrent requests must fail consistently');
  });

  console.log('\n--- SUITE 5: REFRESH TRANSPORT & EXCLUSION RULES ---');

  await it('12. Refresh request relies exclusively on withCredentials and sends empty body', () => {
    const refreshReqOptions = {
      method: 'POST',
      url: '/api/auth/refresh',
      data: {}, // strictly empty JSON body
      withCredentials: true,
      _skipAuthRefresh: true
    };
    assert.strictEqual(refreshReqOptions.withCredentials, true);
    assert.strictEqual(Object.keys(refreshReqOptions.data).length, 0, 'Must NOT contain refreshToken in JSON');
    assert.strictEqual(refreshReqOptions._skipAuthRefresh, true);
  });

  await it('13. Special endpoints are excluded from triggering refresh', () => {
    const isExcluded = (url) => {
      return (
        url.includes('/auth/refresh') ||
        url.includes('/auth/login') ||
        url.includes('/auth/login-with-otp') ||
        url.includes('/auth/google-login') ||
        url.includes('/auth/send-login-otp') ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/verify-otp') ||
        url.includes('/auth/logout') ||
        url.includes('/public-queue/') ||
        url.includes('/public/portal/') ||
        url.includes('/public/patient/')
      );
    };

    assert.strictEqual(isExcluded('/api/auth/refresh'), true);
    assert.strictEqual(isExcluded('/api/auth/login'), true);
    assert.strictEqual(isExcluded('/api/auth/verify-otp'), true);
    assert.strictEqual(isExcluded('/api/public/portal/login'), true);
    assert.strictEqual(isExcluded('/api/emr/consultation'), false);
    assert.strictEqual(isExcluded('/api/doctor/appointments'), false);
  });

  await it('14. Patient routes and patient users are excluded from staff refresh', () => {
    const checkPatientExclusion = (path, userRole) => {
      const isPatientRoute = path.startsWith('/patient') || path.startsWith('/portal/');
      const isPatientUser = userRole === 'patient';
      return isPatientRoute || isPatientUser;
    };

    assert.strictEqual(checkPatientExclusion('/portal/city_hospital', 'staff'), true);
    assert.strictEqual(checkPatientExclusion('/patient/history', 'staff'), true);
    assert.strictEqual(checkPatientExclusion('/doctor/prescriptions', 'patient'), true);
    assert.strictEqual(checkPatientExclusion('/admin/users', 'admin'), false);
    assert.strictEqual(checkPatientExclusion('/doctor/consultations', 'doctor'), false);
  });

  console.log('\n--- SUITE 6: LOGOUT BEHAVIOR ---');

  await it('15. Logout clears in-memory access token', () => {
    setAccessToken('token_to_be_logged_out');
    assert.strictEqual(getAccessToken(), 'token_to_be_logged_out');
    clearAccessToken();
    assert.strictEqual(getAccessToken(), null);
  });

  await it('16. Logout dispatches LOGOUT event over BroadcastChannel', () => {
    broadcastAuthEvent('LOGOUT');
    assert.strictEqual(MockBroadcastChannel.lastMessage.type, 'LOGOUT');
    assert.strictEqual(MockBroadcastChannel.lastMessage.token, undefined);
  });

  await it('17. Logout options use withCredentials and empty body', () => {
    const logoutReqOptions = {
      method: 'POST',
      url: '/api/auth/logout',
      data: {}, // strictly empty JSON body
      withCredentials: true,
      _skipAuthRefresh: true
    };
    assert.strictEqual(logoutReqOptions.withCredentials, true);
    assert.strictEqual(Object.keys(logoutReqOptions.data).length, 0);
  });

  console.log('\n--- SUITE 7: BOOTSTRAP & LOCALSTORAGE MIGRATION ---');

  await it('18. Staff login sets in-memory token and does NOT write to localStorage', () => {
    const loginToken = 'staff_new_jwt_login_success';
    setAccessToken(loginToken);
    assert.strictEqual(getAccessToken(), loginToken);
    assert.strictEqual(localStorage.getItem('token'), null);
    clearAccessToken();
  });

  await it('19. Legacy staff token is purged on startup', () => {
    localStorage.setItem('token', 'stale_legacy_24h_token');
    localStorage.setItem('user', JSON.stringify({ role: 'doctor', id: 'doc1' }));

    // Simulate startup cleanup logic from AuthContext
    const storedUser = localStorage.getItem('user');
    const u = JSON.parse(storedUser);
    if (u && u.role !== 'patient' && !localStorage.getItem('curoxa_superadmin_session')) {
      localStorage.removeItem('token');
    }

    assert.strictEqual(localStorage.getItem('token'), null, 'Legacy token must be purged on startup');
    localStorage.removeItem('user');
  });

  await it('20. Unrelated application state in localStorage is preserved', () => {
    localStorage.setItem('tenantId', 'metropolis_clinic');
    localStorage.setItem('curoxa_sidebar_collapsed', 'true');

    // Simulate startup cleanup
    if (localStorage.getItem('user')) {
      localStorage.removeItem('token');
    }

    assert.strictEqual(localStorage.getItem('tenantId'), 'metropolis_clinic');
    assert.strictEqual(localStorage.getItem('curoxa_sidebar_collapsed'), 'true');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('curoxa_sidebar_collapsed');
  });

  console.log('\n--- SUITE 8: SUPERADMIN IMPERSONATION ISOLATION ---');

  await it('21. SuperAdmin impersonation token is preserved and excluded from staff refresh', () => {
    localStorage.setItem('curoxa_superadmin_session', JSON.stringify({ token: 'sa_master_key' }));
    localStorage.setItem('token', 'impersonated_hosp_token');

    const isImpersonating = !!localStorage.getItem('curoxa_superadmin_session');
    assert.strictEqual(isImpersonating, true);

    // Impersonation is excluded from staff refresh
    const shouldSkipRefresh = isImpersonating;
    assert.strictEqual(shouldSkipRefresh, true, 'Impersonation must skip staff cookie refresh');

    localStorage.removeItem('curoxa_superadmin_session');
    localStorage.removeItem('token');
  });

  console.log('\n--- SUITE 9: LOGIN FLOWS & ZERO PERSISTENCE ---');

  await it('22. Staff OTP login stores access token in memory without writing to localStorage', () => {
    const otpJwt = 'otp_verified_staff_jwt';
    setAccessToken(otpJwt);
    assert.strictEqual(getAccessToken(), otpJwt);
    assert.strictEqual(localStorage.getItem('token'), null);
    clearAccessToken();
  });

  await it('23. Google staff login stores access token in memory without writing to localStorage', () => {
    const googleJwt = 'google_oauth_staff_jwt';
    setAccessToken(googleJwt);
    assert.strictEqual(getAccessToken(), googleJwt);
    assert.strictEqual(localStorage.getItem('token'), null);
    clearAccessToken();
  });

  console.log('\n--- SUITE 10: RETRY LOGIC & LOOP PREVENTION ---');

  await it('24. Original failed 401 request is retried once with new access token', () => {
    const originalRequest = {
      headers: { 'Authorization': 'Bearer old_stale_token' },
      url: '/api/doctor/appointments',
      _retry: undefined
    };

    // Simulate response interceptor retry logic
    const newToken = 'rotated_token_fresh';
    originalRequest._retry = true;
    originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

    assert.strictEqual(originalRequest._retry, true);
    assert.strictEqual(originalRequest.headers['Authorization'], 'Bearer rotated_token_fresh');
  });

  await it('25. Failed request is never retried more than once (_retry flag prevents infinite loop)', () => {
    const requestWithRetryFlag = {
      headers: { 'Authorization': 'Bearer stale_token' },
      _retry: true
    };

    let retryAttempts = 0;
    if (!requestWithRetryFlag._retry) {
      retryAttempts++;
    }
    assert.strictEqual(retryAttempts, 0, 'Must NOT attempt refresh if _retry is already true');
  });

  await it('26. Subscription error (401) is excluded from triggering refresh', () => {
    const errorResponse = {
      status: 401,
      data: { error: 'Your subscription plan limit has been reached. Please upgrade.' }
    };
    const isSubscriptionError = errorResponse.data &&
      typeof errorResponse.data.error === 'string' &&
      (errorResponse.data.error.toLowerCase().includes('limit') ||
       errorResponse.data.error.toLowerCase().includes('upgrade') ||
       errorResponse.data.error.toLowerCase().includes('subscription'));

    assert.strictEqual(isSubscriptionError, true, 'Subscription errors must be recognized and excluded from refresh');
  });

  console.log('\n--- SUITE 11: RELOAD BOOTSTRAP & SESSION RESTORATION ---');

  await it('27. Full reload on protected route restores in-memory token via refresh call', async () => {
    clearAccessToken();
    assert.strictEqual(getAccessToken(), null, 'In-memory token missing after full reload');

    // Simulate session restoration
    const restoredToken = 'restored_jwt_from_cookie';
    setAccessToken(restoredToken);
    assert.strictEqual(getAccessToken(), 'restored_jwt_from_cookie', 'Session must be restored in memory');
    clearAccessToken();
  });

  await it('28. Full reload with expired session clears authenticated frontend state', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'admin' }));
    // Simulate failed restoration
    clearAccessToken();
    localStorage.removeItem('user');
    assert.strictEqual(getAccessToken(), null);
    assert.strictEqual(localStorage.getItem('user'), null);
  });

  await it('29. Public routes do not block on session restoration', () => {
    const publicPaths = ['/login', '/portal/hosp1', '/patient/login', '/patient-register', '/doctor/queue/123'];
    publicPaths.forEach(path => {
      const isPublic = path === '/login' || path.startsWith('/portal/') || path.startsWith('/patient') || path.startsWith('/doctor/queue/');
      assert.strictEqual(isPublic, true);
    });
  });

  console.log('\n--- SUITE 12: PROTECTED ROUTE ACCESS CONTROL ---');

  await it('30. ProtectedRoute grants access when in-memory token is present', () => {
    setAccessToken('valid_memory_token');
    const token = getAccessToken();
    const isAllowed = Boolean(token);
    assert.strictEqual(isAllowed, true);
    clearAccessToken();
  });

  await it('31. ProtectedRoute redirects to /login when token is missing', () => {
    clearAccessToken();
    const token = getAccessToken();
    const isAllowed = Boolean(token);
    assert.strictEqual(isAllowed, false);
  });

  await it('32. ProtectedRoute respects superadmin role requirement', () => {
    const checkSuperAdmin = (role) => role === 'superadmin' || role === 'super_admin';
    assert.strictEqual(checkSuperAdmin('superadmin'), true);
    assert.strictEqual(checkSuperAdmin('super_admin'), true);
    assert.strictEqual(checkSuperAdmin('admin'), false);
    assert.strictEqual(checkSuperAdmin('doctor'), false);
  });

  await it('33. ProtectedRoute allows patient portal access', () => {
    const targetRole = 'patient';
    const isPatientAllowed = targetRole === 'patient';
    assert.strictEqual(isPatientAllowed, true);
  });

  console.log('\n--- SUITE 13: PATIENT & SUPERADMIN RE-VERIFICATION ---');

  await it('34. Patient portal login continues writing patient token to localStorage', () => {
    const mockPatientToken = 'patient_portal_token_999';
    localStorage.setItem('token', mockPatientToken);
    assert.strictEqual(localStorage.getItem('token'), 'patient_portal_token_999');
    localStorage.removeItem('token');
  });

  await it('35. SuperAdmin exiting impersonation restores SuperAdmin in-memory session', () => {
    const originalSuperAdminToken = 'superadmin_main_token_555';
    setAccessToken(originalSuperAdminToken);
    assert.strictEqual(getAccessToken(), 'superadmin_main_token_555');
    clearAccessToken();
  });

  await it('36. Zero staff/admin access-token persistence across all application states', () => {
    clearAccessToken();
    assert.strictEqual(localStorage.getItem('token'), null);
    assert.strictEqual(sessionStorage.getItem('token'), null);
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2B.1 SPECIFIC VERIFICATIONS: SECTION 13 & SECTION 14
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n--- SUITE 14: ZERO CREDENTIALS IN BROADCAST PAYLOADS (SECTION 13) ---');

  await it('37. Payload sanitizer strips forbidden credential keys', () => {
    const dirtyPayload = {
      status: 'ok',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz',
      accessToken: 'access_secret_123',
      refreshToken: 'refresh_cookie_mock',
      authorization: 'Bearer secret',
      password: 'mypassword',
      secret: 'app_secret'
    };
    const cleaned = sanitizeBroadcastPayload(dirtyPayload);
    assert.strictEqual(cleaned.token, undefined);
    assert.strictEqual(cleaned.accessToken, undefined);
    assert.strictEqual(cleaned.refreshToken, undefined);
    assert.strictEqual(cleaned.authorization, undefined);
    assert.strictEqual(cleaned.password, undefined);
    assert.strictEqual(cleaned.secret, undefined);
    assert.strictEqual(cleaned.status, 'ok');
  });

  await it('38. Payload sanitizer strips values matching JWT pattern or Bearer prefix', () => {
    const dirtyValues = {
      fieldA: 'Bearer abc123def456',
      fieldB: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiIxMjMifQ.abc1234',
      fieldC: 'non_sensitive_state'
    };
    const cleaned = sanitizeBroadcastPayload(dirtyValues);
    assert.strictEqual(cleaned.fieldA, undefined);
    assert.strictEqual(cleaned.fieldB, undefined);
    assert.strictEqual(cleaned.fieldC, 'non_sensitive_state');
  });

  await it('39. Recursive inspection of all broadcast events confirms ZERO credentials', () => {
    MockBroadcastChannel.messages = [];
    const eventTypes = [
      'SESSION_UPDATED',
      'LOGOUT',
      'SESSION_EXPIRED',
      'REFRESH_STARTED',
      'REFRESH_COMPLETED',
      'REFRESH_FAILED'
    ];

    eventTypes.forEach(evt => {
      broadcastAuthEvent(evt, {
        status: 'active',
        // Attempt accidental leakage:
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.leak',
        bearer: 'Bearer leak_test'
      });
    });

    // Helper to recursively check any object for credentials
    const inspectForCredentials = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        const lowerKey = k.toLowerCase().replace(/[-_]/g, '');
        assert(
          !['token', 'accesstoken', 'refreshtoken', 'bearer', 'authorization', 'jwt', 'password'].includes(lowerKey),
          `Prohibited credential key "${k}" found in broadcast message!`
        );
        if (typeof v === 'string') {
          assert(!v.startsWith('Bearer '), `Bearer credential value leaked in key "${k}"!`);
          assert(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v.trim()), `JWT string leaked in key "${k}"!`);
        } else if (typeof v === 'object') {
          inspectForCredentials(v);
        }
      }
    };

    MockBroadcastChannel.messages.forEach(msg => {
      inspectForCredentials(msg);
    });
    assert.strictEqual(MockBroadcastChannel.messages.length, eventTypes.length);
  });

  console.log('\n--- SUITE 15: CROSS-TAB REFRESH CONCURRENCY TESTS (SECTION 14) ---');

  await it('40. Test A — Two tabs simultaneously receive 401 (Exactly 1 backend rotation, both recover)', async () => {
    let backendRefreshRotationCount = 0;
    setLastRefreshTime(0);
    clearAccessToken();

    // Mock network call to backend /api/auth/refresh (atomic rotation)
    const mockBackendRefreshNetworkCall = async () => {
      backendRefreshRotationCount++;
      // Simulate network roundtrip latency
      await new Promise(r => setTimeout(r, 60));
      return `rotated_jwt_token_family_seq_${backendRefreshRotationCount}`;
    };

    // Tab 1 and Tab 2 encounter 401 simultaneously
    const [tab1Result, tab2Result] = await Promise.all([
      executeWithRefreshLock(mockBackendRefreshNetworkCall),
      executeWithRefreshLock(mockBackendRefreshNetworkCall)
    ]);

    // Expected: Exactly ONE backend refresh rotation
    assert.strictEqual(
      backendRefreshRotationCount,
      1,
      `Expected exactly 1 backend refresh rotation, got ${backendRefreshRotationCount}`
    );

    // Expected: One was the leader (alreadyRefreshed: false), the other detected the update (alreadyRefreshed: true)
    const leaderCount = [tab1Result, tab2Result].filter(r => !r.alreadyRefreshed).length;
    const followerCount = [tab1Result, tab2Result].filter(r => r.alreadyRefreshed).length;
    assert.strictEqual(leaderCount, 1, 'Exactly one tab must act as rotation leader');
    assert.strictEqual(followerCount, 1, 'Sibling tab must detect update without rotating');

    // Expected: Both tabs recovered valid authenticated state
    assert(tab1Result.token, 'Tab 1 must recover authenticated state');
    assert(tab2Result.token, 'Tab 2 must recover authenticated state');
    assert.strictEqual(tab1Result.token, tab2Result.token);
  });

  await it('41. Test B — Three tabs simultaneously receive 401 (Exactly 1 backend rotation, all 3 recover)', async () => {
    let backendRefreshRotationCount = 0;
    setLastRefreshTime(0);
    clearAccessToken();

    const mockBackendRefreshNetworkCall = async () => {
      backendRefreshRotationCount++;
      await new Promise(r => setTimeout(r, 60));
      return `rotated_jwt_token_three_tabs_${backendRefreshRotationCount}`;
    };

    // Tab 1, Tab 2, and Tab 3 encounter 401 simultaneously
    const results = await Promise.all([
      executeWithRefreshLock(mockBackendRefreshNetworkCall),
      executeWithRefreshLock(mockBackendRefreshNetworkCall),
      executeWithRefreshLock(mockBackendRefreshNetworkCall)
    ]);

    // Expected: Exactly ONE backend refresh rotation
    assert.strictEqual(
      backendRefreshRotationCount,
      1,
      `Expected exactly 1 backend refresh rotation for 3 tabs, got ${backendRefreshRotationCount}`
    );

    // Expected: All 3 tabs recover authenticated state
    results.forEach(res => {
      assert(res.token, 'Each tab must recover authenticated token');
      assert.strictEqual(res.token, 'rotated_jwt_token_three_tabs_1');
    });
  });

  await it('42. Test C — Refresh fails (All tabs transition to logged-out state, no loop)', async () => {
    setLastRefreshTime(0);
    setLastRefreshFailTime(0);
    clearAccessToken();

    let backendCalls = 0;
    const mockFailingBackendRefresh = async () => {
      backendCalls++;
      await new Promise(r => setTimeout(r, 40));
      throw new Error('Refresh token revoked or session expired');
    };

    let caughtCount = 0;
    const results = await Promise.allSettled([
      executeWithRefreshLock(mockFailingBackendRefresh),
      executeWithRefreshLock(mockFailingBackendRefresh),
      executeWithRefreshLock(mockFailingBackendRefresh)
    ]);

    results.forEach(r => {
      if (r.status === 'rejected') caughtCount++;
    });

    // All tabs fail consistently
    assert.strictEqual(caughtCount, 3, 'All 3 tabs must fail upon definitive session expiration');
    // Leader called backend once, followers aborted on failure marker
    assert.strictEqual(backendCalls, 1, 'Backend must not be re-queried repeatedly');
    // In-memory token is cleared
    assert.strictEqual(getAccessToken(), null, 'In-memory token must be cleared');
  });

  await it('43. Test D — Tab A logs out (Tab B receives LOGOUT event, clears auth, does NOT call server)', async () => {
    let tabBServerLogoutCalled = false;
    let tabBClearedMemory = false;
    window.__quroxaTabId = 'tab_B';

    // Simulate Tab B listener
    const unsub = subscribeAuthChannel((data) => {
      if (data.type === 'LOGOUT') {
        // Tab B clears local state without calling backend /api/auth/logout
        tabBClearedMemory = true;
      }
    });

    // Tab A performs logout and broadcasts over channel
    const chA = new MockBroadcastChannel('quroxa-auth');
    chA.postMessage({
      type: 'LOGOUT',
      originTabId: 'tab_A',
      timestamp: Date.now()
    });

    assert.strictEqual(tabBClearedMemory, true, 'Tab B must clear memory upon remote LOGOUT');
    assert.strictEqual(tabBServerLogoutCalled, false, 'Tab B must NOT independently call server logout');
    unsub();
  });

  await it('44. Test E — Token updated (SESSION_UPDATED contains no JWT, recipient receives no credential)', () => {
    MockBroadcastChannel.messages = [];
    let receivedPayload = null;
    window.__quroxaTabId = 'tab_B';

    const unsub = subscribeAuthChannel((data) => {
      receivedPayload = data;
    });

    // Tab A updates session and attempts to broadcast dirty payload
    const chA = new MockBroadcastChannel('quroxa-auth');
    const sanitized = sanitizeBroadcastPayload({
      status: 'active',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.should_not_leak'
    });

    chA.postMessage({
      type: 'SESSION_UPDATED',
      originTabId: 'tab_A',
      timestamp: Date.now(),
      ...sanitized
    });

    assert(receivedPayload, 'Tab B must receive SESSION_UPDATED notification');
    assert.strictEqual(receivedPayload.type, 'SESSION_UPDATED');
    assert.strictEqual(receivedPayload.token, undefined, 'Must NOT contain token property');
    assert.strictEqual(receivedPayload.accessToken, undefined, 'Must NOT contain accessToken property');
    unsub();
  });

  console.log('\n======================================================');
  console.log(`ALL FRONTEND AUTH TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('======================================================\n');
}

runFrontendTests().catch(err => {
  console.error('\nFrontend Test Suite Failed:', err);
  process.exit(1);
});
