// build-css.js
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Order matters – legacy first, then modules
const files = [
  'src/styles/phosphorIcons.css',
  'src/styles/tooltips.css',
  'src/styles/utilities.css',
  'src/styles/mainSideBarStyles.css',
  'src/styles/settings.css',
  'src/styles/modals.css',
  'src/styles/modal_styles/renamePortalModal.css',
  // Future modules:
  // 'src/styles/icons.css',
];

const output = files
  .map(file => readFileSync(resolve(__dirname, file), 'utf8'))
  .join('\n');

// Create output directory if it doesn’t exist
mkdirSync(resolve(__dirname, 'src/build-css'), { recursive: true });

// Write to the intermediate file
writeFileSync(resolve(__dirname, 'src/build-css/styles.css'), output);
console.log('✅ Combined CSS → src/build-css/styles.css');