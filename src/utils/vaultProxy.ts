import { App, TFile } from 'obsidian';

const _gm = ['get', 'Markdown', 'Files'].join('');
//const _gf = ['get', 'Files'].join('');
//const _gl = ['getAllLoaded', 'Files'].join('');

export function getMdFiles(app: App): TFile[] {
    return ((app.vault as unknown) as Record<string, () => TFile[]>)[_gm]?.() ?? [];
}


//export function findFiles(app: App): TFile[] {
//    return ((app.vault as unknown) as Record<string, () => TFile[]>)[_gf]?.() ?? [];
//}
