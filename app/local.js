// The incident app with nothing behind it: incidents are kept in the local storage of this browser.
// Add ?sample to the address to start with the sample incident.

import { BrowserStorageTimelineStore, SettingsScope, TimelineService, loadAppCatalog, mountTimelineApp, seedSampleData } from "./dist/index.js";
import { applyAddressPresets } from "./presets.js";

const STORAGE_KEY = "cyber-incidents-timeline-local";

// The saved vocabulary, scale and milestones live in the catalog the service is built with
const api = new TimelineService(new BrowserStorageTimelineStore(window.localStorage, STORAGE_KEY), { catalog: loadAppCatalog() });
if (new URLSearchParams(window.location.search).has("sample") && (await api.listIncidents()).length === 0) {
    await seedSampleData(api);
}

const app = await mountTimelineApp(document.getElementById("app"), {
    api,
    title: "Incident timelines, in this browser",
    settingsButton: true,
    settingsScope: SettingsScope.Everything,
    onSettingsSaved: () => window.location.reload()
});
applyAddressPresets(app);
