const assert = require('assert');

// Simulate browser environment
global.window = {
  location: {
    origin: 'https://hospital.portal.com'
  },
  __QUROXA_CONFIG__: undefined
};

// Replicate URL configuration logic from frontend/src/utils/urlConfig.js
// using pure Node.js so it can execute in CI / backend testing
const validateUrlConfig = (url, label = 'URL') => {
  if (!url || typeof url !== 'string') return;
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `[WARNING] ${label} unsupported protocol ${parsed.protocol}`;
    }
  } catch (err) {
    return `[ERROR] Invalid ${label}`;
  }
};

const getRuntimeConfig = () => {
  if (typeof window !== 'undefined' && window.__QUROXA_CONFIG__) {
    return window.__QUROXA_CONFIG__;
  }
  return {};
};

const getApiBaseUrl = (envApiUrl = '') => {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig?.apiUrl && typeof runtimeConfig.apiUrl === 'string' && runtimeConfig.apiUrl.trim()) {
    return runtimeConfig.apiUrl.trim().replace(/\/+$/, '');
  }
  if (envApiUrl && typeof envApiUrl === 'string' && envApiUrl.trim()) {
    return envApiUrl.trim().replace(/\/+$/, '');
  }
  return '/api';
};

const getBackendBaseUrl = (envApiUrl = '') => {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig?.backendUrl && typeof runtimeConfig.backendUrl === 'string' && runtimeConfig.backendUrl.trim()) {
    return runtimeConfig.backendUrl.trim().replace(/\/+$/, '');
  }
  const apiBase = getApiBaseUrl(envApiUrl);
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
    return apiBase.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
};

const getPublicFrontendUrl = (envAppUrl = '') => {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig?.publicAppUrl && typeof runtimeConfig.publicAppUrl === 'string' && runtimeConfig.publicAppUrl.trim()) {
    return runtimeConfig.publicAppUrl.trim().replace(/\/+$/, '');
  }
  if (envAppUrl && typeof envAppUrl === 'string' && envAppUrl.trim()) {
    return envAppUrl.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
};

const resolveMediaUrl = (url, envApiUrl = '') => {
  if (!url) return '';
  if (typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  const backendBase = getBackendBaseUrl(envApiUrl);
  const baseClean = backendBase.endsWith('/') ? backendBase.slice(0, -1) : backendBase;
  const pathClean = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${baseClean}${pathClean}`;
};

const getSocketUrl = (envSockUrl = '', envApiUrl = '') => {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig?.socketUrl && typeof runtimeConfig.socketUrl === 'string' && runtimeConfig.socketUrl.trim()) {
    return runtimeConfig.socketUrl.trim().replace(/\/+$/, '');
  }
  if (envSockUrl && typeof envSockUrl === 'string' && envSockUrl.trim()) {
    return envSockUrl.trim().replace(/\/+$/, '');
  }
  const backendBase = getBackendBaseUrl(envApiUrl);
  if (backendBase) {
    return backendBase;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return undefined;
};

console.log('=================================================================');
console.log('      FRONTEND RUNTIME URL CONFIG & MEDIA RESOLUTION TESTS       ');
console.log('=================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

// 1. Validation tests
runTest('Validation: Relative /api path is accepted without error', () => {
  assert.strictEqual(validateUrlConfig('/api'), undefined);
});

runTest('Validation: Valid HTTPS absolute URL is accepted', () => {
  assert.strictEqual(validateUrlConfig('https://api.carehospital.com/api'), undefined);
});

runTest('Validation: Unsupported javascript: protocol returns warning', () => {
  const res = validateUrlConfig('javascript:alert(1)');
  assert.ok(res && res.includes('unsupported protocol'));
});

// 2. Default fallback when window.__QUROXA_CONFIG__ is empty
runTest('Fallback: Default API base is relative /api when unconfigured', () => {
  window.__QUROXA_CONFIG__ = undefined;
  assert.strictEqual(getApiBaseUrl(), '/api');
});

runTest('Fallback: Backend base falls back to window.location.origin when /api is relative', () => {
  window.__QUROXA_CONFIG__ = undefined;
  assert.strictEqual(getBackendBaseUrl(), 'https://hospital.portal.com');
});

// 3. Separate origin configuration
runTest('Separate Origins: Explicit runtime apiUrl config overrides defaults', () => {
  window.__QUROXA_CONFIG__ = {
    apiUrl: 'https://api.cloudcare.org/api/'
  };
  assert.strictEqual(getApiBaseUrl(), 'https://api.cloudcare.org/api');
  assert.strictEqual(getBackendBaseUrl(), 'https://api.cloudcare.org');
});

// 4. Media URL resolution tests
runTest('Media: Relative upload path resolves against separate backend origin', () => {
  window.__QUROXA_CONFIG__ = {
    apiUrl: 'https://api.cloudcare.org/api'
  };
  const resolved = resolveMediaUrl('/uploads/prescriptions/rx_99.pdf');
  assert.strictEqual(resolved, 'https://api.cloudcare.org/uploads/prescriptions/rx_99.pdf');
});

runTest('Media: Absolute HTTPS Cloudflare R2 / S3 URLs are preserved as-is', () => {
  window.__QUROXA_CONFIG__ = {
    apiUrl: 'https://api.cloudcare.org/api'
  };
  const ext = 'https://pub-mytenant.r2.dev/letterheads/lh_abc.pdf';
  assert.strictEqual(resolveMediaUrl(ext), ext);
});

runTest('Media: Data URIs and Blob URLs are preserved without mutation', () => {
  const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';
  const blobUri = 'blob:https://hospital.portal.com/7123-abcd';
  assert.strictEqual(resolveMediaUrl(dataUri), dataUri);
  assert.strictEqual(resolveMediaUrl(blobUri), blobUri);
});

runTest('Media: Protocol-relative URLs are preserved as-is', () => {
  const protoRelative = '//cdn.jsdelivr.net/npm/lucide/dist/lucide.js';
  assert.strictEqual(resolveMediaUrl(protoRelative), protoRelative);
});

// 5. Socket URL resolution
runTest('Socket: Dedicated runtime socketUrl takes precedence over backend origin', () => {
  window.__QUROXA_CONFIG__ = {
    apiUrl: 'https://api.cloudcare.org/api',
    socketUrl: 'https://ws.cloudcare.org/'
  };
  assert.strictEqual(getSocketUrl(), 'https://ws.cloudcare.org');
});

runTest('Socket: Falls back to backendBase when socketUrl is not configured', () => {
  window.__QUROXA_CONFIG__ = {
    apiUrl: 'https://api.cloudcare.org/api'
  };
  assert.strictEqual(getSocketUrl(), 'https://api.cloudcare.org');
});

// 6. Zero Rebuild Verification: Changing runtime config immediately switches origins
runTest('Zero Rebuild: Changing window.__QUROXA_CONFIG__ immediately shifts API origin', () => {
  window.__QUROXA_CONFIG__ = {
    apiUrl: 'https://new-api-host.com/api'
  };
  assert.strictEqual(getApiBaseUrl(), 'https://new-api-host.com/api');
  assert.strictEqual(getBackendBaseUrl(), 'https://new-api-host.com');

  window.__QUROXA_CONFIG__ = {
    apiUrl: '/api'
  };
  assert.strictEqual(getApiBaseUrl(), '/api');
  assert.strictEqual(getBackendBaseUrl(), 'https://hospital.portal.com');
});

console.log('\n=================================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} tests passed.`);
console.log('=================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
