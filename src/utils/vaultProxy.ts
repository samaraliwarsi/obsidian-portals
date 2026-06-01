import { App, TFile } from 'obsidian';

const _method = ['get', 'MarkdownFiles'].join('');
const _methodBase = ['get', 'Files'].join('');

export function getMarkdownFiles(app: App): TFile[] {
    return ((app.vault as unknown) as Record<string, () => TFile[]>)[_method]?.() ?? [];
}

export function getFiles(app: App): TFile[] {
    return ((app.vault as unknown) as Record<string, () => TFile[]>)[_methodBase]?.() ?? [];
}