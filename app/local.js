// The incident app with nothing behind it: incidents are kept in the local storage of this browser.
// Add ?sample to the address to start with the sample incident.

import { BrowserStorageCatalogStore, BrowserStorageTimelineStore, SettingsScope, TimelineService, mountTimelineApp, seedSampleData } from "./dist/index.js";
import { applyAddressPresets } from "./presets.js";

const STORAGE_KEY = "cyber-incidents-timeline-local";

// The vocabulary, scale and milestones are kept beside the incidents, in the catalog store of the service
const api = new TimelineService(new BrowserStorageTimelineStore(window.localStorage, STORAGE_KEY), {
    catalogStore: new BrowserStorageCatalogStore(window.localStorage, `${STORAGE_KEY}-catalog`)
});
if (new URLSearchParams(window.location.search).has("sample") && (await api.listIncidents()).length === 0) {
    await seedSampleData(api);
}

const app = await mountTimelineApp(document.getElementById("app"), {
    api,
    title: "Incident timelines, in this browser",
    settingsButton: true,
    settingsScope: SettingsScope.Everything
});
applyAddressPresets(app);
