/**
 * The CSS custom properties every colour on a diagram comes from. The catalog refers to these rather
 * than to colours, so a host restyles the whole workspace from its stylesheet and exports follow.
 */
export enum ThemeToken {
    SideUnknown = "--tlg-side-unknown",
    SideAttacker = "--tlg-side-attacker",
    SideVictim = "--tlg-side-victim",
    SideDefender = "--tlg-side-defender",
    SideThirdParty = "--tlg-side-third-party",
    SurfaceUnknown = "--tlg-surface-unknown",
    SurfaceAttacker = "--tlg-surface-attacker",
    SurfaceVictim = "--tlg-surface-victim",
    SurfaceDefender = "--tlg-surface-defender",
    ImpactUnknown = "--tlg-impact-unknown",
    ImpactNone = "--tlg-impact-none",
    ImpactLow = "--tlg-impact-low",
    ImpactMedium = "--tlg-impact-medium",
    ImpactHigh = "--tlg-impact-high",
    ImpactCritical = "--tlg-impact-critical",
    Ink = "--tlg-ink",
    InkMuted = "--tlg-ink-muted",
    Surface = "--tlg-surface",
    SurfaceAlt = "--tlg-surface-alt",
    Border = "--tlg-border",
    BorderStrong = "--tlg-border-strong",
    Accent = "--tlg-accent",
    Good = "--tlg-good",
    OnColor = "--tlg-on-color",
    Shadow = "--tlg-shadow"
}

/**
 * Colours used when the stylesheet is missing, which is the case in tests and in a bare export.
 * They match the light theme of styles/timeline.css.
 */
export const DEFAULT_TOKEN_VALUES: Readonly<Record<ThemeToken, string>> = {
    [ThemeToken.SideUnknown]: "#6b7280",
    [ThemeToken.SideAttacker]: "#c62828",
    [ThemeToken.SideVictim]: "#e65100",
    [ThemeToken.SideDefender]: "#1565c0",
    [ThemeToken.SideThirdParty]: "#7b1fa2",
    [ThemeToken.SurfaceUnknown]: "#f3f4f6",
    [ThemeToken.SurfaceAttacker]: "#fdecea",
    [ThemeToken.SurfaceVictim]: "#fff3e0",
    [ThemeToken.SurfaceDefender]: "#e8f1fb",
    [ThemeToken.ImpactUnknown]: "#6b7280",
    [ThemeToken.ImpactNone]: "#a3a9b3",
    [ThemeToken.ImpactLow]: "#1565c0",
    [ThemeToken.ImpactMedium]: "#b7791f",
    [ThemeToken.ImpactHigh]: "#e65100",
    [ThemeToken.ImpactCritical]: "#c62828",
    [ThemeToken.Ink]: "#1f2328",
    [ThemeToken.InkMuted]: "#6b7280",
    [ThemeToken.Surface]: "#ffffff",
    [ThemeToken.SurfaceAlt]: "#f6f7f9",
    [ThemeToken.Border]: "#dcdfe4",
    [ThemeToken.BorderStrong]: "#a3a9b3",
    [ThemeToken.Accent]: "#1565c0",
    [ThemeToken.Good]: "#2e7d32",
    [ThemeToken.OnColor]: "#ffffff",
    [ThemeToken.Shadow]: "#000000"
};
