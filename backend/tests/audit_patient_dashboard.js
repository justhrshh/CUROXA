const fs = require('fs');
const content = fs.readFileSync('clinical_management/frontend/src/pages/PatientDashboard.jsx', 'utf8');

// Find all api.* calls
const regex = /api\.(get|post|put|patch|delete)\((['"`])([^'"`]+)\2/g;
const endpoints = new Set();
let match;
while ((match = regex.exec(content)) !== null) {
  endpoints.add(match[1].toUpperCase() + ' ' + match[3]);
}
console.log('--- API Endpoints called in PatientDashboard.jsx ---');
Array.from(endpoints).sort().forEach(e => console.log('  ' + e));

// Find all tabs / active sections
console.log('\n--- State and Tab declarations ---');
const tabMatches = content.match(/activeTab\s*===?\s*['"]([^'"]+)['"]/g) || [];
const tabs = new Set(tabMatches.map(t => t.replace(/activeTab\s*===?\s*['"]/, '').replace(/['"]/, '')));
console.log('Active tabs detected:', Array.from(tabs));

// Find socket events
console.log('\n--- Socket events in PatientDashboard.jsx ---');
const socketRegex = /socket\.(on|emit)\((['"`])([^'"`]+)\2/g;
const socketEvents = new Set();
while ((match = socketRegex.exec(content)) !== null) {
  socketEvents.add(match[1].toUpperCase() + ' ' + match[3]);
}
Array.from(socketEvents).sort().forEach(e => console.log('  ' + e));
