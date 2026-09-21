// The incident app backed by the REST API of the server that serves this page.

import { HttpTimelineApi, SettingsScope, mountTimelineApp } from "./dist/index.js";
import { applyAddressPresets } from "./presets.js";

const app = await mountTimelineApp(document.getElementById("app"), {
    api: new HttpTimelineApi({ baseUrl: "api" }),
    // The server keeps the vocabulary, the scale and the milestones for every viewer, so they are edited through it
    settingsButton: true,
    settingsScope: SettingsScope.Everything
});
applyAddressPresets(app);
