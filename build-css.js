// build-css.js
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Order matters – legacy first, then modules
const files = [
  'src/styles/util_styles/phosphorIcons.css',
  'src/styles/util_styles/tooltips.css',
  'src/styles/util_styles/utilities.css',
  'src/styles/util_styles/scrollbars.css',
  'src/styles/mainSideBarStyles.css',
  'src/styles/treeStyles.css',
  'src/styles/util_styles/floatingButtons.css',
  'src/styles/sideportal_styles/journalStyles.css',
  'src/styles/sideportal_styles/contextNotesStyles.css',
  'src/styles/sideportal_styles/trashStyles.css',
  'src/styles/sideportal_styles/frontmatterClinicStyles.css',
  'src/styles/sideportal_styles/hiddenItemsStyles.css',
  'src/styles/settings.css',
  'src/styles/modal_styles/searchPopover.css',
  'src/styles/modal_styles/addPortalModal.css',
  'src/styles/modal_styles/removePortalModal.css',
  'src/styles/modal_styles/sidePortalModal.css',
  'src/styles/modal_styles/renamePortalModal.css',
  'src/styles/modal_styles/colorModal.css',
  'src/styles/modal_styles/quickTabNumberModal.css',
  'src/styles/modal_styles/selectFolderModal.css',
  'src/styles/modal_styles/groupTagsModal.css',
  'src/styles/modal_styles/reorderModal.css',
  'src/styles/modal_styles/frontmatterPopup.css',
  'src/styles/modal_styles/iconPicker.css',
  'src/styles/modal_styles/confirmModal.css',
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