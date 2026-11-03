export function element<T extends Element>(id: string, ctor: {
    new (...args: never[]): T;
}): T { const e = document.getElementById(id); if (!(e instanceof ctor))
    throw new Error(`Missing ${id}`); return e; }
export const html = (id: string): HTMLElement => element(id, HTMLElement);
export const svg = (id: string): SVGSVGElement => element(id, SVGSVGElement);
export const button = (id: string): HTMLButtonElement => element(id, HTMLButtonElement);
export const input = (id: string): HTMLInputElement => element(id, HTMLInputElement);
