export * from './types';
export declare const ready: Promise<void>;
export declare function render(el: HTMLElement): void;
export declare function renderAllUnder(container: ParentNode): Promise<void>;
export declare function renderAll(): Promise<void>;
