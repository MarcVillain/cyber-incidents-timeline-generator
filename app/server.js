// The incident app backed by the REST API of the server that serves this page.

import { HttpTimelineApi, mountTimelineApp } from "./dist/index.js";
import { applyAddressPresets } from "./presets.js";

const app = await mountTimelineApp(document.getElementById("app"), {
    api: new HttpTimelineApi({ baseUrl: "api" }),
    // The server owns the impact scale and milestones, so the settings stay with colours, layout, names and icons
    settingsButton: true
});
applyAddressPresets(app);
