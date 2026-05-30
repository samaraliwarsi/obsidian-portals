import fs from 'fs';
import path from 'path';
import postcss from 'postcss';
import scss from 'postcss-scss';

// --- CONFIGURATION ---
const CSS_DIR = 'src/styles';                 // folder containing your active CSS files
const EXCLUDE_CSS_FILES = ['mainSidebarStyles.css'];  // files to ignore
const TS_DIR = 'src';                         // folder to scan for TypeScript files
const IGNORE_DIRS = ['node_modules'];         // directories to skip when scanning TS

// --- 1. Collect all .ts files (unchanged) ---
function collectTsFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.includes(entry.name)) {
        collectTsFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && fullPath.endsWith('.ts')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const tsFiles = collectTsFiles(TS_DIR);

// --- 2. Extract class names used in TS files (unchanged) ---
const usedClasses = new Set();
for (const file of tsFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const classRegex = /(?:addClass|cls|className)\s*[:=]\s*(['"`])([^'"`]+)\1/g;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    match[2].split(/\s+/).forEach(cls => usedClasses.add(cls));
  }
}

// --- 3. Process only CSS files in CSS_DIR, excluding EXCLUDE_CSS_FILES ---
const cssFiles = fs.readdirSync(CSS_DIR)
  .filter(f => f.endsWith('.css') && !EXCLUDE_CSS_FILES.includes(f))
  .map(f => path.join(CSS_DIR, f));

let totalUnused = 0;

for (const cssFile of cssFiles) {
  const cssContent = fs.readFileSync(cssFile, 'utf8');
  const root = postcss.parse(cssContent, { syntax: scss });

  const declaredSelectors = new Set();
  root.walkRules(rule => {
    rule.selector.split(',').forEach(sel => {
      const classSelectors = sel.match(/\.[a-zA-Z0-9_-]+/g) || [];
      classSelectors.forEach(cls => declaredSelectors.add(cls.substring(1)));
    });
  });

  const unused = [];
  for (const cls of declaredSelectors) {
    if (!usedClasses.has(cls) && !cls.startsWith('ph-') && !cls.startsWith('lucide')) {
      unused.push(cls);
    }
  }

  if (unused.length > 0) {
    console.log(`\n📄 ${path.basename(cssFile)} – ${unused.length} potentially unused classes:`);
    unused.forEach(cls => console.log(`  - ${cls}`));
    totalUnused += unused.length;
  }
}

if (totalUnused === 0) {
  console.log('✅ No unused CSS classes detected in active stylesheets.');
}