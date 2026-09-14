// Turns the CSS custom properties of the workspace into concrete colours. They are read from the live
// document, so a theme change needs no change here and exports keep matching what is on screen.

import { impactLevelsOf, type Catalog, type ImpactLevelInfo, type SideInfo } from "../core/catalog.js";
import { Side, StepOutcome, isEnumValue } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import { DEFAULT_TOKEN_VALUES, ThemeToken } from "../core/theme-token.js";
import { measure } from "./svg.js";

export const FONT_STACK = "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

/**
 * Reads the value of a CSS custom property, or an empty string when nothing defines it.
 */
export type TokenResolver = (property: string) => string;

export function defaultTokenResolver(property: string): string {
    return isEnumValue(ThemeToken, property) ? DEFAULT_TOKEN_VALUES[property] : "";
}

/**
 * Reads tokens from the element the workspace is mounted on, so two workspaces on one page can wear
 * different themes.
 */
export function elementTokenResolver(element: Element): TokenResolver {
    const style = getComputedStyle(element);
    return property => style.getPropertyValue(property).trim() || defaultTokenResolver(property);
}

export interface SideColors {
    label: string;
    icon: string;
    color: string;
    surface: string;
}

type Rgb = readonly [number, number, number];

function toRgb(value: string): Rgb | null {
    const trimmed = value.trim();
    const shorthand = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    if (shorthand) {
        const [, r = "0", g = "0", b = "0"] = shorthand;
        return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
    }
    const full = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(trimmed);
    if (full) {
        const [, r = "0", g = "0", b = "0"] = full;
        return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16)];
    }
    const functional = /^rgba?\(([^)]+)\)$/i.exec(trimmed);
    if (functional) {
        const [r = 0, g = 0, b = 0] = (functional[1] ?? "").split(/[\s,/]+/).filter(Boolean).map(part => parseInt(part, 10));
        return [r, g, b];
    }
    return null;
}

function blend(color: string, ratio: number, towards: string): string {
    const from = toRgb(color);
    const to = toRgb(towards);
    if (!from || !to) return color;
    const channel = (index: 0 | 1 | 2): number => Math.round(from[index] + (to[index] - from[index]) * ratio);
    return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function sideColors(info: SideInfo | undefined, side: Side, resolve: TokenResolver): SideColors {
    return {
        label: info?.label ?? side,
        icon: info?.icon ?? Icon.Unknown,
        color: resolve(info?.colorToken ?? ThemeToken.SideUnknown),
        surface: resolve(info?.surfaceToken ?? ThemeToken.SurfaceUnknown)
    };
}

/**
 * The colours every renderer paints with. Built once per draw so a theme switch is picked up.
 */
export class Palette {
    readonly sides: Readonly<Record<Side, SideColors>>;
    readonly outcomes: Readonly<Record<StepOutcome, string>>;
    readonly ink: string;
    readonly inkMuted: string;
    readonly surface: string;
    readonly surfaceAlt: string;
    readonly border: string;
    readonly borderStrong: string;
    readonly accent: string;
    readonly good: string;
    readonly onColor: string;
    private readonly shadow: string;
    private readonly resolve: TokenResolver;
    private readonly impactLevels: ReadonlyMap<string, ImpactLevelInfo>;

    constructor(catalog: Catalog, resolve: TokenResolver = defaultTokenResolver) {
        const side = (value: Side): SideColors => sideColors(catalog.sides.find(entry => entry.side === value), value, resolve);
        const outcome = (value: StepOutcome): string => resolve(catalog.outcomes.find(entry => entry.outcome === value)?.colorToken ?? ThemeToken.InkMuted);

        this.sides = {
            [Side.Unknown]: side(Side.Unknown),
            [Side.Attacker]: side(Side.Attacker),
            [Side.Victim]: side(Side.Victim),
            [Side.Defender]: side(Side.Defender),
            [Side.ThirdParty]: side(Side.ThirdParty)
        };
        this.outcomes = {
            [StepOutcome.Unknown]: outcome(StepOutcome.Unknown),
            [StepOutcome.Succeeded]: outcome(StepOutcome.Succeeded),
            [StepOutcome.Failed]: outcome(StepOutcome.Failed),
            [StepOutcome.Blocked]: outcome(StepOutcome.Blocked),
            [StepOutcome.Detected]: outcome(StepOutcome.Detected)
        };
        this.ink = resolve(ThemeToken.Ink);
        this.inkMuted = resolve(ThemeToken.InkMuted);
        this.surface = resolve(ThemeToken.Surface);
        this.surfaceAlt = resolve(ThemeToken.SurfaceAlt);
        this.border = resolve(ThemeToken.Border);
        this.borderStrong = resolve(ThemeToken.BorderStrong);
        this.accent = resolve(ThemeToken.Accent);
        this.good = resolve(ThemeToken.Good);
        this.onColor = resolve(ThemeToken.OnColor);
        this.shadow = resolve(ThemeToken.Shadow);
        this.resolve = resolve;
        this.impactLevels = new Map(impactLevelsOf(catalog.impactScale).map(entry => [entry.level, entry]));
    }

    /**
     * A colour given either as a CSS colour or as the name of a custom property, as the catalog allows.
     */
    color(value: string, fallback: string): string {
        if (value.startsWith("--")) {
            return this.resolve(value) || fallback;
        }
        return value || fallback;
    }

    /**
     * The colour of an impact level. A level the scale does not know, left over from an older scale, is
     * drawn in the muted ink rather than guessed at.
     */
    impactColor(level: string): string {
        const info = this.impactLevels.get(level);
        return info ? this.color(info.color, this.inkMuted) : this.inkMuted;
    }

    side(side: Side): SideColors {
        return this.sides[side];
    }

    /**
     * Blends a colour towards the page it sits on, for the soft fills behind cards. In dark mode the page
     * is dark, so a tint moves towards that rather than towards white.
     */
    tint(color: string, ratio: number): string {
        return blend(color, ratio, this.surface);
    }

    shade(color: string, ratio: number): string {
        return blend(color, ratio, this.shadow);
    }
}

export interface TextStyle {
    size?: number;
    weight?: number;
    spacing?: number;
}

const BOLD_WEIGHT = 600;
const BOLD_WIDENING = 1.08;
let ruler: CanvasRenderingContext2D | null | undefined;

/**
 * The real width of a run of text, measured with the font the slide uses. The average glyph estimate is
 * fine for wrapping a paragraph but out by several pixels on short bold uppercase runs, which is enough
 * to knock a value off the label it belongs to. Where no canvas exists the estimate has to do.
 */
export function textWidth(content: string, { size = 12, weight = 400, spacing = 0 }: TextStyle = {}): number {
    if (ruler === undefined) {
        ruler = typeof document === "undefined" ? null : document.createElement("canvas").getContext?.("2d") ?? null;
    }
    const extra = content.length * spacing;
    if (!ruler) {
        return measure(content, size) * (weight >= BOLD_WEIGHT ? BOLD_WIDENING : 1) + extra;
    }
    ruler.font = `${weight} ${size}px ${FONT_STACK}`;
    return ruler.measureText(content).width + extra;
}
