# Quick start

Five minutes from nothing to an incident timeline in your own page. [INSTALL.md](INSTALL.md) has every option,
deployment and screenshot.

## 1. Run the incident desk

Needs Node.js 22.13 or later.

```bash
npx cyber-incidents-timeline-generator --seed
```

Open `http://127.0.0.1:8080/`. Pick, open, edit and delete incidents at the top, build the timeline below.
Incidents are saved in `timeline.sqlite` in the current folder. Leave out `--seed` to start empty. That is a
complete deployment for a team that wants a simple incident handling tool.

## 2. Put it in your page, no server

```bash
npm install cyber-incidents-timeline-generator
```

`index.html`, served by any static server (`npx serve .`):

```html
<link rel="stylesheet" href="node_modules/cyber-incidents-timeline-generator/styles/timeline.css">
<div id="timeline" style="--tlg-height: 90vh"></div>
<script type="module">
    import { BrowserStorageTimelineStore, TimelineService, mountTimeline }
        from "./node_modules/cyber-incidents-timeline-generator/dist/index.js";

    const api = new TimelineService(new BrowserStorageTimelineStore(localStorage, "my-timeline"));
    const [existing] = await api.listIncidents();
    const incident = existing ?? await api.createIncident({ title: "Suspicious sign-in" });

    await mountTimeline(document.getElementById("timeline"), { api, incidentId: incident.id });
</script>
```

Data stays in this browser.

## 3. Share it through your Node server

```js
import { TimelineService } from "cyber-incidents-timeline-generator";
import { createTimelineHandler, openSqliteStore } from "cyber-incidents-timeline-generator/server";

const { store } = await openSqliteStore("timeline.sqlite");
const timeline = createTimelineHandler({
    api: new TimelineService(store),
    basePath: "/api/timeline",
    authorize: (request, permission, incidentId) => isAllowed(request, permission, incidentId)
});

// Before any body parser
app.use(async (request, response, next) => {
    if (!(await timeline(request, response))) next();
});
```

In the page, swap the store for the HTTP client:

```js
import { HttpTimelineApi, mountTimeline } from "cyber-incidents-timeline-generator";

const api = new HttpTimelineApi({ baseUrl: "/api/timeline" });
await mountTimeline(document.getElementById("timeline"), { api, incidentId: 42 });
```

## 4. Make it yours

```js
// Your own rating levels, set once where the service is created
const api = new TimelineService(store, {
    impactScale: {
        unassessed: { level: "Unrated", label: "Not rated", color: "#8a8f98" },
        levels: [
            { level: "P3", label: "Minor", color: "#1565c0" },
            { level: "P2", label: "Serious", color: "#e65100" },
            { level: "P1", label: "Major", color: "#c62828" }
        ]
    }
});

// Your own slide header, on screen and in exports
await mountTimeline(element, {
    api,
    incidentId,
    slideHeader: (header, { incident }) => ({ ...header, subtitle: `Owner: ${ownerOf(incident)}` })
});
```

## 5. Plug it into the tool you already use

Incidents living in a ticketing tool, a SOAR or a case manager stay there. Write a connector of five methods and
keep only the timelines here:

```js
const service = new TimelineService(new SourcedTimelineStore(new YourTicketingSource(), timelines));
```

[CONNECTORS.md](CONNECTORS.md) walks through a complete one.

Next: [INSTALL.md](INSTALL.md) for the tour of the workspace, deployment choices, theming and troubleshooting.
