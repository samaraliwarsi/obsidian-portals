import type PortalsPlugin from "../main";

let instance: PortalsPlugin | null = null;

export function setPluginInstance(plugin: PortalsPlugin | null) {
    instance = plugin;
}

export function getPluginInstance(): PortalsPlugin | null {
    return instance;
}