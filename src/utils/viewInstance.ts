import { PortalsView } from "../view";

let instance: PortalsView | null = null;

export function setViewInstance(view: PortalsView | null) {
    instance = view;
}

export function getViewInstance(): PortalsView | null {
    return instance;
}