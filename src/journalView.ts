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
                    this.notes = folder.children.filter(
                        (child): child is TFile => child instanceof TFile && child.extension === 'md'
                    );
                }
            }
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
    }

    private async getQuotesFromNotes(notes: TFile[]): Promise<{ text: string; date: Date; file: TFile }[]> {
        const promises = notes.map(n => this.extractQuotesFromFile(n));
        const results = await Promise.all(promises);
        return results.flat();
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
        // Try YYYY-MM-DD first
        let match = name.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return new Date(`${match[1]}-${match[2]}-${match[3]}`);
        }
        // Try DD-MM-YYYY
        match = name.match(/(\d{2})-(\d{2})-(\d{4})/);
        if (match) {
            // Convert to YYYY-MM-DD
            const dateStr = `${match[3]}-${match[2]}-${match[1]}`;
            const date = new Date(dateStr);
            // Check if it's a valid date (not NaN)
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        // Try MM-DD-YYYY (if second part <=12 and first part <=12, may be ambiguous)
        match = name.match(/(\d{2})-(\d{2})-(\d{4})/);
        if (match) {
            // Try as MM-DD-YYYY
            const dateStr = `${match[3]}-${match[1]}-${match[2]}`;
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        // Fallback to creation time
        console.warn(`[Journal] Could not parse date from filename: ${name}, using ctime`);
        return new Date(file.stat.ctime);
    }

    private renderDateCards() {
        const cardsContainer = this.container.createDiv({ cls: 'journal-cards-container' });

        // Compact filter button with icon
        const filterButton = cardsContainer.createEl('button', { cls: 'journal-btn journal-filter-btn' });
        const filterIcon = filterButton.createEl('i', { cls: 'ph ph-funnel-simple' });
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

        // Store wrapper for later updates
        (cardsContainer as any).cardsWrapper = cardsWrapper;
        this.updateCards('All files');
    }

    private updateCards(period: string) {
        const cardsWrapper = this.container.querySelector('.journal-cards-wrapper');
        if (!cardsWrapper) return;
        cardsWrapper.empty();

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
            const card = cardsWrapper.createDiv({ cls: 'journal-card' });
            card.dataset.path = n.path
            if (this.plugin.settings.markedJournalNotes.includes(n.path)) {
                card.addClass('journal-card-marked');
            }
            const titleSpan = card.createSpan({ cls: 'journal-card-title', text: date.toLocaleDateString() });
            card.style.background = `rgba(100, 100, 100, ${opacity * 0.4})`;
            // set css for border opacity only used when not marked 
            card.style.setProperty('--journal-border-opacity', String(opacity * 0.25));
            
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

            card.addEventListener('contextmenu', (e) => {
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
            quoteDisplay.empty();
            quoteDisplay.createEl('p', { text: quote.text, cls: 'journal-quote-text' });
            quoteDisplay.createEl('small', { text: `— ${quote.date.toLocaleDateString()}`, cls: 'journal-quote-date' });
            quoteDisplay.onclick = () => {
                this.app.workspace.getLeaf().openFile(quote.file);
            };
        };

        // Helper to get a random quote based on current mode
        const getNextQuote = async (): Promise<{ text: string; date: Date; file: TFile } | null> => {
            if (this.currentMode === 'random') {
                const allQuotes = await this.extractQuotes(this.notes);
                if (allQuotes.length === 0) return null;
                const randomIndex = Math.floor(Math.random() * allQuotes.length);
                const quote = allQuotes[randomIndex];
                return quote ?? null;
            } else { // onThisDay
                const today = new Date();
                const todayDay = today.getDate();
                const todayMonth = today.getMonth();
                const currentYear = today.getFullYear();
                const oneYearAgo = new Date(today);
                oneYearAgo.setFullYear(today.getFullYear() - 1);

                const sameDayNotes = this.notes.filter(n => {
                    const date = this.parseDateFromFile(n);
                    return date.getDate() === todayDay && date >= oneYearAgo && date <= today;
                });
                const sameDateNotes = this.notes.filter(n => {
                    const date = this.parseDateFromFile(n);
                    const year = date.getFullYear();
                    return date.getMonth() === todayMonth && date.getDate() === todayDay &&
                        year >= currentYear - 10 && year <= currentYear;
                });

                const dayQuotes = await this.getQuotesFromNotes(sameDayNotes);
                const dateQuotes = await this.getQuotesFromNotes(sameDateNotes);
                const allQuotes = [...dayQuotes, ...dateQuotes];
                if (allQuotes.length === 0) return null;
                const randomIndex = Math.floor(Math.random() * allQuotes.length);
                const quote = allQuotes[randomIndex];
                return quote ?? null;
            }
        };

        // Update quote and reset progress bar
        const updateQuoteAndProgress = async () => {
            const quote = await getNextQuote();
            if (!quote) {
                quoteDisplay.setText('No quotes found.');
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
        const lines = content.split('\n');
        const quotes: { text: string; date: Date; file: TFile }[] = [];
        const date = this.parseDateFromFile(file);
        const highlightRegex = /==(.*?)==/g;

        for (const line of lines) {
            let match;
            while ((match = highlightRegex.exec(line)) !== null) {
                if (match[1]) {
                    const quoteText = match[1].trim();
                    quotes.push({ text: quoteText, date, file });
                }
            }
        }

        this.quotesCache.set(file.path, quotes);
        return quotes;
    }

    private async extractQuotes(files: TFile[]): Promise<{ text: string; date: Date; file: TFile }[]> {
        const promises = files.map(f => this.extractQuotesFromFile(f));
        const results = await Promise.all(promises);
        return results.flat();
    }
}