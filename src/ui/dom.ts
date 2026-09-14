// Small helpers for building the workspace chrome without innerHTML, so no text ever reaches the page as
// markup.

export type HtmlChild = Node | string | null | false;

export function h<TTag extends keyof HTMLElementTagNameMap>(
    tag: TTag,
    className: string | null = null,
    attributes: Readonly<Record<string, string>> = {},
    children: readonly HtmlChild[] = []
): HTMLElementTagNameMap[TTag] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    children.forEach(child => {
        if (child === null || child === false) return;
        node.append(child);
    });
    return node;
}

let sequence = 0;

export function uniqueId(prefix: string): string {
    sequence += 1;
    return `tlg-${prefix}-${sequence}`;
}
