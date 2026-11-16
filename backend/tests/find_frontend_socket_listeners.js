const fs = require('fs');
const path = require('path');
function search(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory() && !['node_modules', '.git'].includes(f.name)) search(full);
    else if (f.isFile() && (f.name.endsWith('.js') || f.name.endsWith('.jsx'))) {
      const c = fs.readFileSync(full, 'utf8');
      const matches = c.match(/socket\.on\(['"][^'"]+['"]/g);
      if (matches) {
        const unique = Array.from(new Set(matches.map(m => m.replace(/socket\.on\(['"]/, '').replace(/['"]$/, ''))));
        console.log(full + ' -> ' + unique.join(', '));
      }
    }
  }
}
search('clinical_management/frontend/src');
