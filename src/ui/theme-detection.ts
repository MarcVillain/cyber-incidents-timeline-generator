// Finding out whether the page around the workspace is light or dark, so the workspace can follow the site it
// is embedded in rather than only the operating system.

export enum ColorScheme {
    Light = "light",
    Dark = "dark"
}

/**
 * Tells the workspace which scheme the page currently wears. Hosts with their own theme system can pass one.
 */
export type ThemeDetector = () => ColorScheme;

// The attributes common front end frameworks put the theme in: plain sites, Bootstrap, and design systems
const THEME_ATTRIBUTES: readonly string[] = ["data-theme", "data-bs-theme", "data-color-scheme", "data-mode"];
const WATCHED_ATTRIBUTES: readonly string[] = [...THEME_ATTRIBUTES, "class", "style"];
const DARK_QUERY = "(prefers-color-scheme: dark)";

function schemeOf(value: string | null | undefined): ColorScheme | null {
    const normalized = (value ?? "").trim().toLowerCase();
    if (normalized === ColorScheme.Dark) return ColorScheme.Dark;
    if (normalized === ColorScheme.Light) return ColorScheme.Light;
    return null;
}

function declaredBy(element: Element): ColorScheme | null {
    for (const attribute of THEME_ATTRIBUTES) {
        const declared = schemeOf(element.getAttribute(attribute));
        if (declared) return declared;
    }
    if (element.classList.contains(ColorScheme.Dark)) return ColorScheme.Dark;
    if (element.classList.contains(ColorScheme.Light)) return ColorScheme.Light;
    return schemeOf(getComputedStyle(element).getPropertyValue("color-scheme"));
}

/**
 * The scheme the page declares on its root or body, in the ways sites usually do it, and the system
 * preference when the page says nothing.
 */
export function detectPageTheme(): ColorScheme {
    for (const element of [document.documentElement, document.body]) {
        const declared = element ? declaredBy(element) : null;
        if (declared) return declared;
    }
    const prefersDark = typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
    return prefersDark ? ColorScheme.Dark : ColorScheme.Light;
}

/**
 * Calls back whenever the page or the system may have switched theme. Returns the function that stops
 * watching.
 */
export function watchPageTheme(onChange: () => void): () => void {
    const stops: (() => void)[] = [];

    if (typeof MutationObserver === "function") {
        const observer = new MutationObserver(() => onChange());
        [document.documentElement, document.body].forEach(element => {
            if (element) observer.observe(element, { attributes: true, attributeFilter: [...WATCHED_ATTRIBUTES] });
        });
        stops.push(() => observer.disconnect());
    }

    if (typeof window.matchMedia === "function") {
        const query = window.matchMedia(DARK_QUERY);
        query.addEventListener("change", onChange);
        stops.push(() => query.removeEventListener("change", onChange));
    }

    return () => stops.forEach(stop => stop());
}
