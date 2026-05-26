import { App, Notice, TFolder } from "obsidian";
import PortalsPlugin from "../main";



export class AddPortalModal {
    private app: App;
    private plugin: PortalsPlugin;
    private backdrop!: HTMLElement;
    private container!: HTMLElement;
    private selectedPaths: Set<string> = new Set;
    private keyHandler: (e: KeyboardEvent) => void;
    private currentTab: 'root' | 'sub' | 'tag' = 'root';
    private searchInput!: HTMLInputElement;
    private resultsContainer!: HTMLElement;
    private rootFolders: TFolder[] = [];
    private subFolders: TFolder[] = [];
    private allTags: string[] = [];

    constructor(app: App, plugin: PortalsPlugin, private onChoose: (path: string, type: 'folder' | 'tag') => void) {
        this.app = app;
        this.plugin = plugin;

        // build folder lists
        const root = app.vault.getRoot();
        const walk = (f: TFolder) => {
            for (const child of f.children) {
                if (child instanceof TFolder) {
                    if (f === root) this.rootFolders.push(child);
                    else this.subFolders.push(child);
                    walk(child);
                }
            }
        };
        walk(root);
        this.rootFolders.sort((a, b) => a.name.localeCompare(b.name));
        this.subFolders.sort((a, b) => a.name.localeCompare(b.name));

        // build tag list
        const tagsObj = (app.metadataCache as unknown as { getTags(): Record<string, number> }).getTags();
        this.allTags = Object.keys(tagsObj)
            .map(t => t.slice(1))
            .filter(tag => !tag.includes('/'))
            .sort()
        
        // key handler for escape
        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.close();
        }
    }

    open(): void {
        if (this.container) {
            this.close();
        }

        this.backdrop = activeDocument.body.createDiv('portals-adp-backdrop');
        this.backdrop.addEventListener('click', () => this.close());

        this.container = activeDocument.body.createDiv('portals-adp-container');
        this.container.addClass('portals-adp-modal');
        this.container.addEventListener('click', (e) => e.stopPropagation());

        try {
            this.buildUI();
            activeDocument.addEventListener('keydown', this.keyHandler)
        } catch (e) {
            console.error('Error building color picker UI', e);
            this.close();
        }
    }

    buildUI(): void {
        const { container } = this;
        this.container.empty();

        container.createDiv({ text: 'Add a new portal', cls: 'portals-adp-title'});

        const tabBar = container.createDiv({ cls: 'portals-adp-tab-bar' });

        const createTab = (id: 'root' | 'sub' | 'tag', label: string) => {
            const tab = tabBar.createDiv({ cls: 'portals-adp-tab', text: label });
            if (this.currentTab === id) {
                tab.addClass('is-active');
            }
            tab.addEventListener('click', () => {
                this.currentTab = id;
                this.selectedPaths.clear();
                this.filterResults();
                tabBar.querySelectorAll('.portals-adp-tab').forEach(t => {
                    t.removeClass('is-active');
                });
                tab.addClass('is-active');
            });
        };

        createTab('root', 'Root Folders');
        createTab('sub', 'Sub Folders');
        createTab('tag', 'Tags');

        this.searchInput = container.createEl('input', {
            type: 'text',
            placeholder: 'Search...',
            cls: 'portals-adp-search-input'
        });
        this.searchInput.addEventListener('input', () => this.filterResults());

        this.resultsContainer = container.createDiv({ cls: 'portals-adp-results-container' });
        this.filterResults();

        container.createSpan({ text: 'Alt-click to select multiple', cls: 'portals-adp-modal-subtext' });

        const buttonDiv = container.createDiv({ cls: 'modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
        const addBtn = buttonDiv.createEl('button', { text: 'Add', cls: 'mod-cta' });
        addBtn.addEventListener('click', () => {
            if (this.selectedPaths.size === 0) {
                new Notice('Please select atleast one folder or tag.');
                return;
            }
            const type = this.currentTab === 'tag' ? 'tag' : 'folder';
            for (const path of this.selectedPaths) {
                this.onChoose(path, type);
            }
            this.close();
        });
    }
    
    private filterResults() {
        this.resultsContainer.empty();
        const query = this.searchInput.value.toLowerCase();

        if (this.currentTab === 'tag') {
            const filtered = this.allTags.filter(t => t.toLowerCase().includes(query));
            for (const tag of filtered) {
                const isUsed = this.plugin.settings.spaces.some(s => s.type === 'tag' && s.path === tag);
                const item = this.resultsContainer.createDiv({ cls: 'add-portal-item' });
                const displayText = '#' + tag + (isUsed ? ' (in use)' : '');
                item.setText(displayText);
                if (this.selectedPaths.has(tag)) item.addClass('is-selected');
                if (isUsed) {
                    item.addClass('portals-already-used');
                    // Add checkmark icon
                    const checkSpan = item.createSpan({ cls: 'portals-check-icon' });
                    checkSpan.createEl('i', { cls: 'ph ph-check' });
                }
                item.addEventListener('click', (e: MouseEvent) => {
                    if (isUsed) {
                        new Notice('This tag is already a portal.');
                        return;
                    }
                    if (e.altKey) {
                        if (this.selectedPaths.has(tag)) {
                            this.selectedPaths.delete(tag);
                        } else {
                            this.selectedPaths.add(tag);
                        }
                    } else {
                        this.selectedPaths.clear();
                        this.selectedPaths.add(tag);
                    }
                    this.filterResults();
                });
            }
        } else {
            const folders = this.currentTab === 'root' ? this.rootFolders : this.subFolders;
            const filtered = folders.filter(f => f.path.toLowerCase().includes(query) || f.name.toLowerCase().includes(query));
            for (const folder of filtered) {
                const isUsed = this.plugin.settings.spaces.some(s => s.type === 'folder' && s.path === folder.path);
                const item = this.resultsContainer.createDiv({ cls: 'add-portal-item' });
                const displayText = folder.path + (isUsed ? ' (in use)' : '');
                item.setText(displayText);
                if (this.selectedPaths.has(folder.path)) item.addClass('is-selected');
                if (isUsed) {
                    item.addClass('portals-already-used');
                    // Add checkmark icon
                    const checkSpan = item.createSpan({ cls: 'portals-check-icon' });
                    checkSpan.createEl('i', { cls: 'ph ph-check' });
                }
                item.addEventListener('click', (e: MouseEvent) => {
                    if (isUsed) {
                        new Notice('This folder is already a portal.');
                        return;
                    }
                    if (e.altKey) {
                        if (this.selectedPaths.has(folder.path)) {
                            this.selectedPaths.delete(folder.path);
                        } else {
                            this.selectedPaths.add(folder.path);
                        }
                    } else {
                        this.selectedPaths.clear();
                        this.selectedPaths.add(folder.path);
                    }
                    this.filterResults();
                });
            }
        }
    }

    close(): void {
        this.container.remove();
        this.backdrop.remove();
        activeDocument.removeEventListener('keydown', this.keyHandler);
    }
}