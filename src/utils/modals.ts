import { App, Modal, TFolder } from 'obsidian';
import PortalsPlugin from '../main';
import { SpaceConfig } from '../settings';

//================================= RENAME PORTAL MODAL=======================================

export class RenamePortalModal extends Modal {
    constructor(
        app: App,
        private currentName: string,
        private onSave: (newName: string) => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        this.containerEl.addClass('portals-modal');
        this.contentEl.addClass('portals-rename-modal');
        contentEl.createEl('h3', { text: 'Rename portal' });

        const renameInput = contentEl.createDiv({ cls: 'portals-rename-container' });
        const input = renameInput.createEl('input', {
            type: 'text',
            value: this.currentName,
            cls: 'portals-rename-input',
            placeholder: 'Leave empty to use default name'
        });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.onSave(input.value);
                this.close();
            }
        });
        const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
        buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).onclick = () => {
            this.onSave(input.value);
            this.close();
        };
        input.focus();
        input.select();
    }

    onClose() {
        this.contentEl.empty();
    }
}

//================================= SELECT FOLDER MODAL=======================================
export class SelectFolderModal extends Modal {
    private folders: TFolder[];
    private onSelect: (folder: TFolder) => void;  // ← must be TFolder

    constructor(app: App, onSelect: (folder: TFolder) => void) {
        super(app);
        this.onSelect = onSelect;
        this.folders = app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
        this.folders.sort((a, b) => a.path.localeCompare(b.path));
    }

    onOpen() {
        const { contentEl } = this;
        this.contentEl.addClass('portals-modal');
        this.contentEl.addClass('portals-folder-pick-modal');
        contentEl.createEl('h3', { text: 'Select folder' });
        const input = contentEl.createEl('input', { type: 'text', placeholder: 'Search...', cls: 'portals-search-input' });
        const results = contentEl.createDiv({ cls: 'portals-results-container' });
        const render = (search: string) => {
            results.empty();
            const filtered = this.folders.filter(f => f.path.toLowerCase().includes(search.toLowerCase()));
            for (const folder of filtered) {
                const item = results.createDiv({ cls: 'add-portal-item', text: folder.path });
                item.addEventListener('click', () => {
                    this.onSelect(folder);  // folder is TFolder
                    this.close();
                });
            }
        };
        input.addEventListener('input', () => render(input.value));
        render('');
    }

    onClose() { this.contentEl.empty(); }
}

//================================= COLOR PICKER MODAL=======================================

export class ColorPickerModal extends Modal {
    private color: string;
    private opacity: number;
    private onSave: (color: string) => void;
    private targetElement: HTMLElement;
    private summaryElement: HTMLElement | null;
    private childrenContainer: HTMLElement | null;
    private originalDetailsClass: boolean;
    private originalChildrenClass: boolean;
    private originalSummaryClass: boolean;
    private originalColor: string;
    private originalFileTextColor: string = '';
    private originalFileIconColor: string = '';
    

    constructor(app: App, onSave: (color: string) => void, targetElement: HTMLElement, currentColor?: string) {
        super(app);
        this.onSave = onSave;
        this.targetElement = targetElement;
        if (targetElement.classList.contains('file-item')) {
            const icon = targetElement.querySelector('.file-icon i') as HTMLElement | null;
            this.originalFileTextColor = targetElement.style.color;
            this.originalFileIconColor = icon ? icon.style.color : '';
            
        }
        this.summaryElement = targetElement.querySelector('.folder-summary');
        this.childrenContainer = targetElement.querySelector('.folder-children');
        this.originalDetailsClass = targetElement.classList.contains('has-folder-color');
        this.originalSummaryClass = this.summaryElement ? this.summaryElement.classList.contains('has-folder-color') : false;
        this.originalChildrenClass = this.childrenContainer ? this.childrenContainer.classList.contains('has-folder-color') : false;
        this.originalColor = targetElement.style.getPropertyValue('--folder-color') || '';

        if (currentColor) {
            const match = currentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match && match[1] && match[2] && match[3]) {
                const r = parseInt(match[1], 10);
                const g = parseInt(match[2], 10);
                const b = parseInt(match[3], 10);
                this.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                this.opacity = match[4] ? parseFloat(match[4]) : 1;
            } else {
                this.color = '#328cec';
                this.opacity = 1;
            }
        } else {
            this.color = '#328cec';
            this.opacity = 1;
        }
    }

    onOpen() {
        const { contentEl } = this;
        this.contentEl.addClass('portals-modal');
        this.contentEl.addClass('portals-color-modal');
        contentEl.createEl('h3', { text: 'Pick folder color' });

        const inputContainer = contentEl.createDiv({ cls: 'portals-input-container' });
        const colorInput = inputContainer.createEl('input', { type: 'color', value: this.color });
        
        const opacityInput = inputContainer.createEl('input', {
            type: 'range',
            attr: { min: '0', max: '1', step: '0.05', value: String(this.opacity) }
        });
        opacityInput.style.width = '100%';

        const previewContainer = contentEl.createDiv({ cls: 'portals-preview-container' });
        const preview = previewContainer.createDiv();
        preview.style.height = '30px';
        preview.style.marginTop = '10px';
        preview.style.backgroundColor = `rgba(255, 0, 0, ${this.opacity})`;

        const updatePreview = () => {
            const rgb = this.hexToRgb(colorInput.value);
            const newOpacity = parseFloat(opacityInput.value);
            const newColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${newOpacity})`;
            preview.style.backgroundColor = newColor;
            if (this.targetElement.classList.contains('file-item')) {
                this.targetElement.style.color = newColor
                const icon = this.targetElement.querySelector('.file-icon i') as HTMLElement | null;
                if (icon) icon.style.color = newColor;
            } else {
                // Add class to all elements that need it
                this.targetElement.classList.add('has-folder-color');
                this.targetElement.style.setProperty('--folder-color', newColor);
                if (this.summaryElement) {
                    this.summaryElement.classList.add('has-folder-color');
                    this.summaryElement.style.setProperty('--folder-color', newColor);
                    void this.summaryElement.offsetHeight;
                }
                if (this.childrenContainer) {
                    this.childrenContainer.classList.add('has-folder-color');
                    
                    void this.childrenContainer.offsetHeight;
                }
                // Force reflow
                void this.targetElement.offsetHeight;
            };
        }

        colorInput.addEventListener('input', updatePreview);
        opacityInput.addEventListener('input', updatePreview);

        const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => {
            if (this.targetElement.classList.contains('file-item')) {
                this.targetElement.style.color = this.originalFileTextColor;
                const icon = this.targetElement.querySelector('.file-icon i') as HTMLElement | null;
                if (icon) icon.style.color = this.originalFileIconColor;
            } else {
                // Restore original class states
                if (!this.originalDetailsClass) this.targetElement.classList.remove('has-folder-color');
                else this.targetElement.classList.add('has-folder-color');
                if (this.summaryElement) {
                    if (!this.originalSummaryClass) this.summaryElement.classList.remove('has-folder-color');
                    else this.summaryElement.classList.add('has-folder-color');
                    // Remove any inline variable set during preview
                    this.summaryElement.style.removeProperty('--folder-color');
                }
                if (this.childrenContainer) {
                    if (!this.originalChildrenClass) this.childrenContainer.classList.remove('has-folder-color');
                    else this.childrenContainer.classList.add('has-folder-color');
                    this.childrenContainer.style.removeProperty('--folder-color');
                }
                // Restore the original variable on the details
                this.targetElement.style.setProperty('--folder-color', this.originalColor);
            }
            this.close();
        };
        const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
        saveBtn.onclick = () => {
            const rgb = this.hexToRgb(colorInput.value);
            const newColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacityInput.value})`;
            this.onSave(newColor);
            this.close();
        };
        updatePreview();
    }

    private hexToRgb(hex: string): [number, number, number] {
        const bigint = parseInt(hex.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return [r, g, b];
    }

    onClose() { 
        if (this.targetElement.classList.contains('file-item')) {
            this.targetElement.style.color = this.originalFileTextColor;
            const icon = this.targetElement.querySelector('.file-icon i') as HTMLElement | null;
            if (icon) icon.style.color = this.originalFileIconColor;
        } else {
            if (!this.originalDetailsClass) this.targetElement.classList.remove('has-folder-color');
            else this.targetElement.classList.add('has-folder-color');
            if (this.summaryElement) {
                if (!this.originalSummaryClass) this.summaryElement.classList.remove('has-folder-color');
                else this.summaryElement.classList.add('has-folder-color');
                this.summaryElement.style.removeProperty('--folder-color');
                }
            if (this.childrenContainer) {
                if (!this.originalChildrenClass) this.childrenContainer.classList.remove('has-folder-color');
                else this.childrenContainer.classList.add('has-folder-color');
                this.childrenContainer.style.removeProperty('--folder-color');
            }
            this.targetElement.style.setProperty('--folder-color', this.originalColor);
        }
        this.contentEl.empty();
    }
}

// -----------------------------REMOVE PORTAL MODAL -----------------------------------
export class RemovePortalModal extends Modal {
    private plugin: PortalsPlugin;
    private onRemove: (space: SpaceConfig) => void;

    constructor(app: App, plugin: PortalsPlugin, onRemove: (space: SpaceConfig) => void) {
        super(app);
        this.plugin = plugin;
        this.onRemove = onRemove;
    }

    onOpen() {
        const { contentEl } = this;
        this.contentEl.addClass('portals-modal');
        this.contentEl.addClass('remove-portal-modal');
        contentEl.createEl('h3', { text: 'Remove portal tab' });
        const spaces = this.plugin.settings.spaces;
        if (spaces.length === 0) {
            contentEl.createEl('p', { text: 'No portals to remove.' });
            return;
        }
        for (const space of spaces) {
            let displayName: string;
            if (space.type === 'folder') {
                if (space.path === '/') displayName = this.app.vault.getName();
                else displayName = space.path;
            } else {
                displayName = '#' + space.path;
            }
            const row = contentEl.createDiv({ cls: 'remove-portal-row' });
            row.createSpan({ text: displayName, cls: 'remove-portal-name' });
            const removeBtn = row.createEl('button', { text: 'Remove', cls: 'mod-warning' });
            removeBtn.addEventListener('click', () => {
                this.onRemove(space);
                this.close();
            });
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}