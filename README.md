<p align="center">
  <img src="docs/images/logo.svg" width="88" height="88" alt="">
</p>

<h1 align="center">cyber-incidents-timeline-generator</h1>

<p align="center">
  Incident timelines and attack diagrams for security teams, drawn as slides you can present, export and print.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/cyber-incidents-timeline-generator"><img src="https://img.shields.io/npm/v/cyber-incidents-timeline-generator" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0 license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22.13-339933" alt="Node.js 22.13 or later">
  <img src="https://img.shields.io/badge/runtime%20dependencies-0-brightgreen" alt="Zero runtime dependencies">
</p>

<p align="center">
  <a href="https://marcvillain.github.io/cyber-incidents-timeline-generator/?sample"><strong>Try it in your browser</strong></a>. Nothing to install, incidents stay on your machine.
</p>

![The incident desk with the sequential timeline of a phishing incident and the details of one step](docs/images/02-step-details.png)

Record who did what, to what and when, and twelve representations build themselves from the same records. Run
it as a ready incident desk in one command, embed the workspace in your own application, or plug it into the
ticketing tool or SOAR where your incidents already live.

- **A complete desk out of the box.** Open, edit and delete incidents and build their timelines from a single
  page, on SQLite or entirely in the browser.
- **Plugs into what you have.** Any database through one interface, any incident handling tool through a
  five method connector, any backend through a small REST contract.
- **Zero runtime dependencies.** Plain ES modules and one stylesheet. No framework, no bundler required.
- **Fits the site it sits in.** Follows the light or dark theme of the page, and every colour is a CSS token.
- **Typed.** Written in TypeScript and shipped as JavaScript with declarations.

## Representations

| View | What it answers |
|---|---|
| Sequential timeline | What happened, in order |
| Actor swimlanes | Who did what, lined up in time, and what led to what |
| Attacker vs defender | The intrusion above the clock, the response below, and the dwell time between |
| Relationship graph | Every party and artifact and how they connect, in bands or on a ring |
| Kill chain board | Which Lockheed Martin kill chain phases were reached |
| Attack flow | Actions chained by cause, with the assets they touched |
| Diamond model | Adversary, capability, infrastructure and victim |
| ATT&CK matrix | Tactics and techniques observed |
| Blast radius | How far the compromise spread from patient zero |
| Response metrics | Time to detect, contain and recover, against targets or past incidents |
| Evidence timeline | Which source saw what, and where nothing was watching |
| Narrative | A generated written account and the full step table |

Every view paginates into fixed 1600 by 900 slides and exports to PNG, SVG, a self-contained HTML deck or
the print dialog.

## Quick start

Requires Node.js 22.13 or later for development and for the reference server. The workspace itself runs in
any current browser.

```bash
npx cyber-incidents-timeline-generator --seed
```

This starts the incident desk on `http://127.0.0.1:8080` with a SQLite file and a sample incident. `/local.html`
is the same desk keeping incidents in the browser only. Leave out `--seed` to start empty, and add `--api-only`
to serve the REST API without the desk. From a clone of this repository, `npm install` then `npm start` does
the same.

[QUICKSTART.md](QUICKSTART.md) gets it into your own page in five minutes, [INSTALL.md](INSTALL.md) covers
every deployment, option and screenshot, and [CONNECTORS.md](CONNECTORS.md) plugs it into the tools you
already use.

## Using it in a project

```bash
npm install cyber-incidents-timeline-generator
```

The browser part is plain ES modules: import it from a bundler, or serve `node_modules/cyber-incidents-timeline-generator`
and load `dist/index.js` with `<script type="module">`. The stylesheet is exported as
`cyber-incidents-timeline-generator/styles.css`. Using `cyber-incidents-timeline-generator/server` from TypeScript needs `@types/node`.

### A full page incident desk

```js
import { HttpTimelineApi, mountTimelineApp } from "cyber-incidents-timeline-generator";

await mountTimelineApp(document.getElementById("desk"), {
    api: new HttpTimelineApi({ baseUrl: "/api" }),
    title: "CSIRT incidents",
    incidentPermissions: { canDelete: false }
});
```

### One incident, in the browser only

```html
<link rel="stylesheet" href="node_modules/cyber-incidents-timeline-generator/styles/timeline.css">
<div id="timeline" style="--tlg-height: 800px"></div>
<script type="module">
    import { BrowserStorageTimelineStore, TimelineService, mountTimeline } from "cyber-incidents-timeline-generator";

    const api = new TimelineService(new BrowserStorageTimelineStore(localStorage));
    const incident = await api.createIncident({ title: "Suspicious sign-in" });
    await mountTimeline(document.getElementById("timeline"), { api, incidentId: incident.id });
</script>
```

### Against a server

```js
import { HttpTimelineApi, mountTimeline } from "cyber-incidents-timeline-generator";

const api = new HttpTimelineApi({
    baseUrl: "/api/timeline",
    headers: () => ({ "X-CSRF-Token": readCsrfToken() })
});
const handle = await mountTimeline(element, {
    api,
    incidentId: 42,
    permissions: { canCreate: true, canEdit: true, canDelete: false }
});
```

The server can be the reference Node server, the handler mounted inside your own Node application, or any
backend in any language implementing [the REST contract](docs/rest-api.md).

### Mounting the handler in an existing Node server

```js
import { TimelineService } from "cyber-incidents-timeline-generator";
import { createTimelineHandler, openSqliteStore } from "cyber-incidents-timeline-generator/server";

const { store } = await openSqliteStore("timeline.sqlite", { tablePrefix: "tlg_" });
const timeline = createTimelineHandler({
    api: new TimelineService(store),
    basePath: "/api/timeline",
    authorize: (request, permission, incidentId) => myAuth.can(request, permission, incidentId)
});

// Resolves to false when the request is not for the timeline, so the host keeps routing
server.on("request", async (request, response) => {
    if (!(await timeline(request, response))) hostRouter(request, response);
});
```

## Architecture

```
            browser                                    optional server
+--------------------------------+          +-----------------------------------+
| mountTimelineApp (desk)        |          |                                   |
| mountTimeline (workspace)      |          | createTimelineHandler (REST)      |
|   renderers, rail, inspector   |          |   boundary validation, authorize  |
|              |                 |          |                 |                 |
|        TimelineApi  <----------+-- HTTP --+-->        TimelineService         |
|     /               \          |          |                 |                 |
| HttpTimelineApi  TimelineService          |           TimelineStore           |
|                        |       |          |  SqlTimelineStore + driver, or    |
|        Memory or browser store |          |  SourcedTimelineStore + connector |
+--------------------------------+          +-----------------------------------+
```

- `src/core` holds the domain: models, enums, the catalog, validation, response metrics and
  `TimelineService`, which enforces every rule. It has no DOM and no Node dependency.
- `src/storage` holds the stores that run in a page and the HTTP client.
- `src/ui` holds the incident desk, the workspace and the renderers.
- `app/` holds the pages of the incident desk served by the command line.
- `src/server` holds the Node pieces: the REST handler, the static file server, the SQL store and the
  SQLite driver.

Three ports make it pluggable:

- **`TimelineApi`** is what the workspace and the desk talk to. Use `TimelineService` in process,
  `HttpTimelineApi` over the network, or an adapter to your own endpoints.
- **`TimelineStore`** is what the service persists through. Implement it for any database, or implement
  `SqlDriver` to reuse `SqlTimelineStore` on another SQL engine. See [docs/storage.md](docs/storage.md).
- **`IncidentSource`** brings incidents from a ticketing tool, SOAR or case manager, while
  `SourcedTimelineStore` keeps their timelines. See [CONNECTORS.md](CONNECTORS.md).

## Customising

- **Theme.** Every colour is a `--tlg-*` custom property; override any token in your own stylesheet. In
  automatic mode the workspace follows the theme the page declares (`data-theme`, `data-bs-theme`, a `dark`
  class, `color-scheme`), then the system, or asks a `themeDetector` you pass. The desk's toggle sets
  `data-theme` on `<html>`, so the whole site switches with it.
- **Impact levels.** Pass `impactScale` to `new TimelineService(store, { impactScale })` to rate incidents on
  your own levels, labels and colours. Validation, the inspector and every view follow it.
- **Slide header.** Pass `slideHeader` to `mountTimeline` to rewrite the title block of every slide, or add your
  own facts to it, on screen and in exports.
- **Vocabulary.** Pass a modified `buildCatalog()` to `new TimelineService(store, { catalog })` to relabel
  kinds, sides, tactics or views, or to point them at other icons or colour tokens.
- **Icons.** `new IconSet(new Map([["my-icon", ["M4 4h16v16H4z"]]]))` adds or replaces stroke icons on a
  24 by 24 grid.
- **Views.** Pass `renderers` to `mountTimeline` to offer a subset of the built in views, in your own order.

## Development

```bash
npm run build       # compile to dist/
npm test            # compile and run the test suite with node:test
npm run typecheck   # type check sources and tests without emitting
npm run icons       # regenerate the icon shapes from lucide-static
npm run site        # assemble the browser only desk in site/ for static hosting
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions, [SECURITY.md](SECURITY.md) for the security model
and [PUBLISHING.md](PUBLISHING.md) for how releases reach npm.

## License

Licensed under the [Apache License, Version 2.0](LICENSE). Icon shapes are derived from Lucide under the
ISC license; see [NOTICE](NOTICE).
