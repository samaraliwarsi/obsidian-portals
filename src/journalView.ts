import { App, TFile, TFolder } from 'obsidian';
import PortalsPlugin from './main';

export class JournalRenderer {
    private app: App;
    private plugin: PortalsPlugin;
    private container: HTMLElement;
    private journalFolder: TFolder | null = null;
    private notes: TFile[] = [];
    private quotesCache = new Map<string, { text: string; date: Date; file: TFile }[]>(); // cache quotes per file
    private currentQuoteFile: TFile | null = null;
    private currentMode: 'random' | 'onThisDay' = 'random';
    private progressBar: HTMLElement | null = null;
    private progressInterval: number | null = null;
    private _updateQuoteAndProgress: (() => Promise<void>) | null = null;
    private currentPeriod:  string = 'All files';
    private isTogglingMark: boolean = false;
    private tooltipEl: HTMLElement | null = null;
    private tooltipShown = false;
    private cardsWrapper: HTMLElement | null = null;
    private allQuotes: { text: string; date: Date; file: TFile }[] = [];
    private quoteAnimationTimout: number | null = null;
    private filesWithQuotes: Set<string> = new Set();
    private filesWithWrongDelimiters = new Set<string>();
    private wrongDelimiterChecked?: Set<string>;

    private startProgressTimer = () => {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        const startTime = Date.now();
        const updateProgress = () => {
            const elapsed = Date.now() - startTime;
            const percent = Math.min(100, (elapsed / 30000) * 100);
            if (this.progressBar) {
                this.progressBar.style.width = `${percent}%`;
            }
            if (elapsed >= 30000) {
                clearInterval(this.progressInterval!);
                this.progressInterval = null;
                if (this._updateQuoteAndProgress) {
                    this._updateQuoteAndProgress().catch(console.error);
                }
            }
        };
        this.progressInterval = window.setInterval(updateProgress, 100);
        updateProgress();
    }

    private async extractAllQuotes(): Promise<{ text: string; date: Date; file: TFile }[]> {
        const promises = this.notes.map(n => this.extractQuotesFromFile(n));
        const results = await Promise.all(promises);
        // Flatten using reduce with explicit accumulator type
        return results.reduce((acc, val) => acc.concat(val), [] as { text: string; date: Date; file: TFile }[]);
    }

    private async toggleMark(file: TFile) {
        if (this.isTogglingMark) return;
        this.isTogglingMark = true;
        try {
            const marks = this.plugin.settings.markedJournalNotes;
            const index = marks.indexOf(file.path);
            if (index === -1) {
                marks.push(file.path);
            } else {
                marks.splice(index, 1);
            }
            await this.plugin.saveSettings();
            this.updateCards(this.currentPeriod);
        } finally {
            this.isTogglingMark = false;
        }
    }


    constructor(app: App, plugin: PortalsPlugin, container: HTMLElement) {
        this.app = app;
        this.plugin = plugin;
        this.container = container;
    }

    async render() {
        this.stopRotation();
        //this.filesWithWrongDelimiters.clear();
        //this.wrongDelimiterChecked = new Set();
        this.container.empty();
        // Get journal folder
        const folderPath = this.plugin.settings.journalFolderPath;
        if (folderPath) {
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            if (folder instanceof TFolder) {
                this.journalFolder = folder;
                // Load all markdown files in this folder (only top-level for now)
                this.notes = this.journalFolder.children.filter(
                    (child): child is TFile => child instanceof TFile && child.extension === 'md'
                    );
                } else {
                    this.container.createEl('p', { text: 'Journal folder not found.' });
                    return;
                }
            } else {
                // Fallback to daily notes plugin's folder
                // @ts-expect-error - internal plugin access
                const dailyNotesPlugin = this.app.internalPlugins?.getPluginById('daily-notes');
                if (dailyNotesPlugin?.enabled && dailyNotesPlugin.instance?.options?.folder) {
                    const folder = this.app.vault.getAbstractFileByPath(dailyNotesPlugin.instance.options.folder);
                    if (folder instanceof TFolder) {
                        this.journalFolder = folder;
                        this.notes = folder.children.filter((child): child is TFile => child instanceof TFile && child.extension === 'md');
                    }
                }
            }

            // Check for filename format mismatches – show warning if any
            if (this.notes.length > 0) {
                const format = this.plugin.settings.journalDateFormat;
                let mismatched = false;

                const isDateLike = (name: string) =>
                    /^\d{4}-\d{2}-\d{2}/.test(name) || /^\d{2}-\d{2}-\d{4}/.test(name);
                
                for (const note of this.notes) {
                    const name = note.basename;  // use basename (without extension) for comparison
                    if (!isDateLike(name)) continue;

                    if (format === 'YYYY-MM-DD') {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) { mismatched = true; break; }
                    } else if (format === 'DD-MM-YYYY') {
                        const match = name.match(/^(\d{2})-(\d{2})-(\d{4})$/);
                        if (!match) { mismatched = true; break; }
                        const day   = parseInt(match[1]!, 10);
                        const month = parseInt(match[2]!, 10);
                        if (day < 1 || day > 31 || month < 1 || month > 12) { mismatched = true; break; }
                    } else if (format === 'MM-DD-YYYY') {
                        const match = name.match(/^(\d{2})-(\d{2})-(\d{4})$/);
                        if (!match) { mismatched = true; break; }
                        const month = parseInt(match[1]!, 10);
                        const day   = parseInt(match[2]!, 10);
                        if (month < 1 || month > 12 || day < 1 || day > 31) { mismatched = true; break; }
                    }
                }

                if (mismatched) {
                    const warningEl = this.container.createDiv({ cls: 'journal-warning' });
                    warningEl.createSpan({ text: `⚠️ Some filenames do not match the settings selected date format "${format}". Please change the format in Portals settings.` });
                }
            }
                // Pre‑extract all quotes once
                this.allQuotes = await this.extractAllQuotes();
                this.filesWithQuotes = new Set(this.allQuotes.map(q => q.file.path));

            const rootSpace = this.plugin.settings.spaces.find(s => s.path === '/' && s.type === 'folder');
            const tabColorEnabled = this.plugin.settings.tabColorEnabled;
            const rootColor = (tabColorEnabled && rootSpace && rootSpace.color !== 'transparent') ? rootSpace.color : null;
            if (rootColor) {
                this.container.style.setProperty('--journal-accent-color', rootColor);
            } else {
                this.container.style.removeProperty('--journal-accent-color');
            }

            if (this.notes.length === 0) {
                this.container.createEl('p', { text: 'No journal notes found.' });
                return;
            }

            // Sort notes by date
            this.sortNotesByDate();

            // Render the two sections
            this.renderDateCards();
            await this.renderQuotesSection();
        }
        
    private stopRotation() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    public destroy() {
        this.stopRotation();
        if (this.tooltipEl) {
            this.tooltipEl.remove();
            this.tooltipEl = null;
        }
        this.tooltipShown = false;
        
        if (this.quoteAnimationTimout) {
            clearTimeout(this.quoteAnimationTimout);
            this.quoteAnimationTimout = null;
        }
        this.filesWithWrongDelimiters.clear();
        this.wrongDelimiterChecked = undefined;
    }

    private sortNotesByDate() {
        this.notes.sort((a, b) => {
            const dateA = this.parseDateFromFile(a);
            const dateB = this.parseDateFromFile(b);
            return dateA.getTime() - dateB.getTime();
        });
    }

    private parseDateFromFile(file: TFile): Date {
        const name = file.name;
        const format = this.plugin.settings.journalDateFormat;
        let match: RegExpMatchArray | null = null;
        let year: number, month: number, day: number;

        if (format === 'YYYY-MM-DD') {
            match = name.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (match && match[1] && match[2] && match[3]) {
                year = parseInt(match[1], 10);
                month = parseInt(match[2], 10) - 1;
                day = parseInt(match[3], 10);
                if (this.isValidDate(year, month, day)) {
                    return new Date(year, month, day);
                }
            }
        } else if (format === 'DD-MM-YYYY') {
            match = name.match(/(\d{2})-(\d{2})-(\d{4})/);
            if (match && match[1] && match[2] && match[3]) {
                day = parseInt(match[1], 10);
                month = parseInt(match[2], 10) - 1;
                year = parseInt(match[3], 10);
                if (this.isValidDate(year, month, day)) {
                    return new Date(year, month, day);
                }
            }
        } else if (format === 'MM-DD-YYYY') {
            match = name.match(/(\d{2})-(\d{2})-(\d{4})/);
            if (match && match[1] && match[2] && match[3]) {
                month = parseInt(match[1], 10) - 1;
                day = parseInt(match[2], 10);
                year = parseInt(match[3], 10);
                if (this.isValidDate(year, month, day)) {
                    return new Date(year, month, day);
                }
            }
        }

        // Fallback to creation time
        console.debug(`[Journal] Filename "${name}" does not match format "${format}". Using file creation date.`);
        return new Date(file.stat.ctime);
    }

    // Add helper (place after parseDateFromFile)
    private isValidDate(year: number, month: number, day: number): boolean {
        if (month < 0 || month > 11 || day < 1 || day > 31) return false;
        const date = new Date(year, month, day);
        return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
    }

    private renderDateCards() {
        const cardsContainer = this.container.createDiv({ cls: 'journal-cards-container' });

        // Compact filter button with icon
        const filterButton = cardsContainer.createEl('button', { cls: 'journal-btn journal-filter-btn' });
        filterButton.createEl('i', { cls: 'ph ph-funnel-simple' });
        const periodSpan = filterButton.createEl('span', { text: 'All files', cls: 'journal-btn-text' });


        const periods = ['This month', 'This year', 'All files'] as const;
        let currentPeriodIndex = 2; // start with "All files"

        filterButton.addEventListener('click', () => {
            currentPeriodIndex = (currentPeriodIndex + 1) % periods.length;
            const period = periods[currentPeriodIndex];
            if (period) {
                periodSpan.textContent = period;
                this.currentPeriod = period;
                this.updateCards(period);
            }
        });

        const cardsWrapper = cardsContainer.createDiv({ cls: 'journal-cards-wrapper' });
        this.cardsWrapper = cardsWrapper;
        this.updateCards('All files');
    }

    private updateCards(period: string) {
        if(!this.cardsWrapper) return;
        this.cardsWrapper.empty();

        let filteredNotes = [...this.notes];
        const now = new Date();

        if (period === 'This month') {
            filteredNotes = filteredNotes.filter(n => {
                const d = this.parseDateFromFile(n);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            });
        } else if (period === 'This year') {
            filteredNotes = filteredNotes.filter(n => this.parseDateFromFile(n).getFullYear() === now.getFullYear());
        }

        // Compute date range for opacity grading
        const dates = filteredNotes.map(n => this.parseDateFromFile(n));
        const minDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : now;
        const maxDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : now;

        filteredNotes = filteredNotes.reverse();

        filteredNotes.forEach(n => {
            const date = this.parseDateFromFile(n);
            const opacity = this.getOpacity(date, minDate, maxDate);
            const card = this.cardsWrapper!.createDiv({ cls: 'journal-card' });
            card.dataset.path = n.path
            if (this.plugin.settings.markedJournalNotes.includes(n.path)) {
                card.addClass('journal-card-marked');
            }
            card.createSpan({ cls: 'journal-card-title', text: date.toLocaleDateString() });
            card.style.background = `rgba(100, 100, 100, ${opacity * 0.4})`;
            // set css for border opacity only used when not marked 
            card.style.setProperty('--journal-border-opacity', String(opacity * 0.25));

            const indicator = this.plugin.settings.journalQuoteIndicator; // 'quote' | 'warn' | 'both' | 'none'

            const hasQuotes = this.filesWithQuotes.has(n.path);
            const hasWrong  = this.filesWithWrongDelimiters.has(n.path);

            if (indicator === 'quotes' && hasQuotes) {
                card.addClass('journal-card-has-quotes');
                const span = card.createSpan({ cls: 'journal-quote-indicator' });
                span.createEl('i', { cls: 'ph ph-quotes' });
            }
            if (indicator === 'warnings' && hasWrong) {
                card.addClass('journal-card-has-wrong');
                const span = card.createSpan({ cls: 'journal-warn-indicator' });
                span.createEl('i', { cls: 'ph ph-warning-circle' });
            }
            if (indicator === 'all') {
                if (hasQuotes) {
                    card.addClass('journal-card-has-quotes');
                    const span = card.createSpan({ cls: 'journal-quote-indicator' });
                    span.createEl('i', { cls: 'ph ph-quotes' });
                }
                if (hasWrong) {
                    card.addClass('journal-card-has-wrong');
                    const span = card.createSpan({ cls: 'journal-warn-indicator' });
                    span.createEl('i', { cls: 'ph ph-warning-circle' });
                }
            }
            
            let hoverTimeout: number | null = null;
            card.addEventListener('mouseenter', () => {
                if (!this.tooltipEl) return;
                if (this.tooltipShown) return;
                hoverTimeout = window.setTimeout(() => {
                    this.tooltipEl!.setText('Toggle mark (right-click)');
                    const rect = card.getBoundingClientRect();
                    this.tooltipEl!.style.top = `${rect.bottom + 6}px`;
                    this.tooltipEl!.style.left = `${rect.left + rect.width / 2}px`;
                    this.tooltipEl!.classList.add('is-visible');
                    this.tooltipShown = true;
                    hoverTimeout = null;     
                }, 300);  
            });
            card.addEventListener('mouseleave', () => {
                if (hoverTimeout) {
                    clearTimeout(hoverTimeout);
                    hoverTimeout = null;
                }
                if (this.tooltipEl) {
                    this.tooltipEl.classList.remove('is-visible');
                }
            });

            card.addEventListener('click', () => {
                this.app.workspace.getLeaf().openFile(n);
            });

            card.addEventListener('contextmenu', (e: MouseEvent) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.toggleMark(n);
            });
        });
    }

    private getOpacity(date: Date, minDate: Date, maxDate: Date): number {
        const range = maxDate.getTime() - minDate.getTime();
        if (range === 0) return 1;
        const position = (date.getTime() - minDate.getTime()) / range;
        return 0.25 + position * 0.4;
    }

    private async renderQuotesSection() {
        this.progressBar = null;
        const quotesContainer = this.container.createDiv({ cls: 'journal-quotes-container' });

        // Buttons row
        const buttonRow = quotesContainer.createDiv({ cls: 'journal-quote-buttons' });
        const randomBtn = buttonRow.createEl('button', { cls: 'journal-btn' });
        randomBtn.createEl('i', { cls: 'ph ph-dice-three'});
        randomBtn.createSpan({ text: 'Random', cls: 'journal-btn-text' });
        const onThisDayBtn = buttonRow.createEl('button', { cls: 'journal-btn' });
        onThisDayBtn.createEl('i', { cls: 'ph ph-calendar-star' });
        onThisDayBtn.createSpan({ text: 'On this day', cls: 'journal-btn-text' });

        // Progress bar
        const progressContainer = quotesContainer.createDiv({ cls: 'journal-progress-container' });
        this.progressBar = progressContainer.createDiv({ cls: 'journal-progress-bar' });

        if (!this.tooltipEl) {
            this.tooltipEl = document.body.createDiv({ cls: 'portals-floating-tooltip' });
        }
        // Quote display
        const quoteDisplay = quotesContainer.createDiv({ cls: 'journal-quote-display' });

        const showQuote = (quote: { text: string; date: Date; file: TFile }) => {
            if (this.quoteAnimationTimout) {
                clearTimeout(this.quoteAnimationTimout);
                this.quoteAnimationTimout = null;
            }
            quoteDisplay.classList.add('animation');
            this.quoteAnimationTimout = window.setTimeout(() => {
                quoteDisplay.empty();
                quoteDisplay.createEl('p', { text: quote.text, cls: 'journal-quote-text' });
                quoteDisplay.createEl('small', { text: `— ${quote.date.toLocaleDateString()}`, cls: 'journal-quote-date' });
                quoteDisplay.onclick = () => {
                    this.app.workspace.getLeaf().openFile(quote.file);
                };
                quoteDisplay.classList.remove('animation');
                this.quoteAnimationTimout = null;
            }, 150);
        };

        // Helper to get a random quote based on current mode
        const getNextQuote = (): { text: string; date: Date; file: TFile } | null => {
            if (this.currentMode === 'random') {
                if (this.allQuotes.length === 0) return null;
                const randomIndex = Math.floor(Math.random() * this.allQuotes.length);
                return this.allQuotes[randomIndex]!;
            } else {
                // onThisDay – preserve original logic
                const today = new Date();
                const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
                const oneYearAgoUTC = new Date(todayUTC);
                oneYearAgoUTC.setUTCFullYear(todayUTC.getUTCFullYear() - 1);
                const currentYear = todayUTC.getFullYear();
                const oneYearAgo = new Date(today);
                oneYearAgo.setFullYear(currentYear - 1);

                // Filter allQuotes using same criteria as original
                const matchingQuotes = this.allQuotes.filter(quote => {
                    const date = quote.date;
                    const quoteUTC = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                    // Same day (any month) within last year
                    const sameDayLastYear = quoteUTC.getUTCDate() === todayUTC.getUTCDate() &&
                            quoteUTC >= oneYearAgoUTC &&
                            quoteUTC <= todayUTC;
                    // Same month and day within last 10 years
                    const sameMonthDayLast10Years = quoteUTC.getUTCMonth() === todayUTC.getUTCMonth() &&
                                    quoteUTC.getUTCDate() === todayUTC.getUTCDate() &&
                                    quoteUTC.getUTCFullYear() >= currentYear - 10 &&
                                    quoteUTC.getUTCFullYear() <= currentYear;
                    return sameDayLastYear || sameMonthDayLast10Years;
                });

                if (matchingQuotes.length === 0) return null;
                const randomIndex = Math.floor(Math.random() * matchingQuotes.length);
                return matchingQuotes[randomIndex]!;
            }
        };

        // Update quote and reset progress bar
        const updateQuoteAndProgress = async () => {
            const quote = getNextQuote();
            if (!quote) {
                if (this.currentMode === 'onThisDay' && this.allQuotes.length > 0) {
                    quoteDisplay.setText('No quotes from this day in previous months of this year, or from this date & month in the last 10 years.');
                    quoteDisplay.addClass('journal-quote-text');
                } else {
                quoteDisplay.setText('No quotes found. Please link your Daily Notes folder in settings & mark text in daily note files using the delimeter that you selected in settings.');
                quoteDisplay.addClass('journal-quote-text');
                }
                return;
            }
            showQuote(quote);
            this.startProgressTimer();
        };
        this._updateQuoteAndProgress = updateQuoteAndProgress;

        // Start rotation timer (30s)
        const startRotation = async () => {
            await updateQuoteAndProgress();
        };

        // Switch mode, reset timer
        const setMode = async (mode: 'random' | 'onThisDay') => {
            if (this.currentMode === mode) return;
            this.currentMode = mode;
            randomBtn.classList.toggle('active', mode === 'random');
            onThisDayBtn.classList.toggle('active', mode === 'onThisDay');
            await startRotation();
        };

        // Set initial active state
        randomBtn.classList.add('active');

        // Button handlers
        randomBtn.addEventListener('click', () => setMode('random'));
        onThisDayBtn.addEventListener('click', () => setMode('onThisDay'));

        // Start with random mode
        setTimeout(() => {
            if (this.container.isConnected) {
                startRotation();
            }
        }, 0);
    }

    private async extractQuotesFromFile(file: TFile): Promise<{ text: string; date: Date; file: TFile }[]> {
        if (this.quotesCache.has(file.path)) {
            return this.quotesCache.get(file.path)!;
        }

        const content = await this.app.vault.read(file);
        const delimiter = this.plugin.settings.quoteDelimiter;
        const escapedDelimiter = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`${escapedDelimiter}(.*?)${escapedDelimiter}`, 'g');
        const lines = content.split('\n');
        const quotes: { text: string; date: Date; file: TFile }[] = [];
        const date = this.parseDateFromFile(file);

        for (const line of lines) {
            let match;
            while ((match = regex.exec(line)) !== null) {
                if (match[1]) {
                    const quoteText = match[1].trim();
                    quotes.push({ text: quoteText, date, file });
                }
            }
        }

        if (!this.wrongDelimiterChecked?.has(file.path)) {
            const ALL_DELIMITERS = ['==', '**', '++', '||'];
            let hasWrong = false;
            for (const other of ALL_DELIMITERS) {
                if (other === delimiter) continue;
                const escOther = other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wrongRegex = new RegExp(`${escOther}(.+?)${escOther}`);
                if (wrongRegex.test(content)) {
                    hasWrong = true;
                    break;
                }
            }
            if (hasWrong) {
                this.filesWithWrongDelimiters.add(file.path);
            } else {
                this.filesWithWrongDelimiters.delete(file.path);
            }
            // Mark that we've checked this file (optional, avoids re‑checking)
            this.wrongDelimiterChecked ??= new Set<string>();
            this.wrongDelimiterChecked.add(file.path);
        }
        this.quotesCache.set(file.path, quotes);
        return quotes;
    }
}