// Sonar scans from the repository root; LCOV sources must include their service.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const moduleName = process.argv[2];
if (!['auth-server', 'frontend', 'internal-frontend'].includes(moduleName)) {
  throw new Error('Expected an application module name');
}
const moduleRoot = path.join(root, moduleName);
let count = 0;
function visit(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) visit(file);
    else if (item.name === 'lcov.info') {
      const text = fs.readFileSync(file, 'utf8');
      if (!text.includes('SF:')) throw new Error(`Empty coverage report: ${file}`);
      fs.writeFileSync(file, text.replace(/^SF:(.*)$/gm, (_, source) => {
        const absolute = path.isAbsolute(source) ? source :
          source.startsWith(moduleName + '/') ? path.join(root, source) : path.join(moduleRoot, source);
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        if (!relative.startsWith(moduleName + '/') || !fs.existsSync(absolute)) {
          throw new Error(`Coverage source is outside the module or missing: ${source}`);
        }
        return 'SF:' + relative;
      }));
      count++;
    }
  }
}
visit(path.join(moduleRoot, 'coverage'));
if (count === 0) throw new Error(`No LCOV report for ${moduleName}`);
