// The address can preset what the open incident shows, which is handy for sharing a view or taking screenshots:
//   ?view=RelationshipGraph   one of the representation names
//   &select=step:3            node, step or link, then its id
//   &theme=dark               auto, light or dark

const RECORD_TYPES = ["node", "step", "link"];
const THEMES = ["auto", "light", "dark"];

export function applyAddressPresets(app) {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    const [type, id] = (params.get("select") ?? "").split(":");
    const theme = params.get("theme");
    if (THEMES.includes(theme)) app.setTheme(theme);
    if (view) app.timeline?.selectRepresentation(view);
    if (RECORD_TYPES.includes(type) && Number(id) > 0) app.timeline?.select({ type, id: Number(id) });
}
