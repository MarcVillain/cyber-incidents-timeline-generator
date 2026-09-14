// The incident app backed by the REST API of the server that serves this page.

import { HttpTimelineApi, mountTimelineApp } from "../dist/index.js";
import { applyAddressPresets } from "./presets.js";

const app = await mountTimelineApp(document.getElementById("app"), {
    api: new HttpTimelineApi({ baseUrl: "api" })
});
applyAddressPresets(app);
