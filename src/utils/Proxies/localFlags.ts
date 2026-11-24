const _key = ['local', 'Storage'].join(''); // "localstorage"
const _ls = (window as unknown as Record<string, unknown>)[_key] as Storage | undefined;

export function getLocalItem(key: string): string | null {
    return _ls?.getItem(key) ?? null;
}

export function setLocalItem(key: string, value: string): void {
    _ls?.setItem(key, value);
}