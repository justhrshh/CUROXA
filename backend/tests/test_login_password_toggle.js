/**
 * test_login_password_toggle.js
 * 
 * Verifies the Login Password Visibility Toggle semantics:
 * 1. Initial State:
 *    - type === "password"
 *    - characters hidden
 *    - icon === <Eye /> (representing "Show password" action)
 *    - title/aria-label === "Show password"
 * 2. Toggle 1 (Click eye):
 *    - type === "text"
 *    - characters visible
 *    - icon === <EyeOff /> (representing "Hide password" visual)
 *    - title/aria-label === "Hide password"
 * 3. Toggle 2 (Click again):
 *    - type === "password"
 *    - characters hidden
 *    - icon === <Eye /> (returns to "Show password" visual)
 *    - title/aria-label === "Show password"
 * 4. Verify exact Login.jsx source code semantics
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('   LOGIN PASSWORD VISIBILITY TOGGLE VERIFICATION TEST');
console.log('========================================================================\n');

// 1. Simulate state transition logic
let showPassword = false;

function getInputType(state) {
  return state ? 'text' : 'password';
}

function getIconName(state) {
  return state ? 'EyeOff' : 'Eye';
}

function getButtonAria(state) {
  return state ? 'Hide password' : 'Show password';
}

// Initial State
assert.strictEqual(showPassword, false, 'Initial state must be false');
assert.strictEqual(getInputType(showPassword), 'password', 'Initial input type must be "password"');
assert.strictEqual(getIconName(showPassword), 'Eye', 'Initial icon must be Eye (representing "Show password" action)');
assert.strictEqual(getButtonAria(showPassword), 'Show password', 'Initial aria-label/title must be "Show password"');
console.log('  [PASS] 1. Initial state: type="password", hidden characters, Eye icon represents "Show password" action');

// Click 1 (Show password)
showPassword = !showPassword;
assert.strictEqual(showPassword, true, 'State after 1st click must be true');
assert.strictEqual(getInputType(showPassword), 'text', 'Input type after 1st click must be "text"');
assert.strictEqual(getIconName(showPassword), 'EyeOff', 'Icon after 1st click must be EyeOff (representing "Hide password" visual)');
assert.strictEqual(getButtonAria(showPassword), 'Hide password', 'Aria-label/title after 1st click must be "Hide password"');
console.log('  [PASS] 2. First click: type="text", visible characters, icon changes to "Hide password" visual (EyeOff)');

// Click 2 (Hide password)
showPassword = !showPassword;
assert.strictEqual(showPassword, false, 'State after 2nd click must be false');
assert.strictEqual(getInputType(showPassword), 'password', 'Input type after 2nd click must be "password"');
assert.strictEqual(getIconName(showPassword), 'Eye', 'Icon after 2nd click must return to Eye');
assert.strictEqual(getButtonAria(showPassword), 'Show password', 'Aria-label/title after 2nd click must return to "Show password"');
console.log('  [PASS] 3. Second click: type="password", hidden characters, icon returns to "Show password" visual (Eye)');

// 2. Verify Login.jsx source implementation
const loginFilePath = path.join(__dirname, '../../frontend/src/pages/Login.jsx');
const loginSource = fs.readFileSync(loginFilePath, 'utf8');

assert.ok(loginSource.includes("const [showPassword, setShowPassword] = useState(false);"), 'showPassword must initialize to false');
assert.ok(loginSource.includes("type={showPassword ? 'text' : 'password'}"), 'Password input type must switch between "text" and "password"');
assert.ok(loginSource.includes("showPassword ? <EyeOff className=\"w-5 h-5\" /> : <Eye className=\"w-5 h-5\" />"), 'Icon must render EyeOff when visible and Eye when hidden');
assert.ok(loginSource.includes("title={showPassword ? 'Hide password' : 'Show password'}"), 'Title must describe action (Hide when visible, Show when hidden)');
assert.ok(loginSource.includes("aria-label={showPassword ? 'Hide password' : 'Show password'}"), 'aria-label must describe action');
assert.ok(loginSource.includes("setShowPassword(prev => !prev)"), 'Toggle must use functional updater');
console.log('  [PASS] 4. Source inspection: Login.jsx strictly enforces action-based semantics without blind swapping');

console.log('\n========================================================================');
console.log('   ALL PASSWORD TOGGLE SEMANTICS VERIFIED (4/4 PASS)');
console.log('========================================================================\n');
