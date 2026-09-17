# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-09-17

Every change is additive. Code written against 0.1.1 compiles and behaves the same.

### Added

- Host metadata on every record. `Incident`, `NodeRecord`, `StepRecord` and `LinkRecord` carry an optional
  `metadata` object that the package stores and hands back without ever reading it, so a host application
  can keep its own identifiers and provenance beside a record. Bounded to 100 keys and 16000 characters of
  JSON.
- `externalId` on a step, which every other record already had.
- Named milestones. A host declares the moments it reports on through `CatalogOptions.milestones`, and a
  step claims one with `milestoneKey`. One step holds a key at a time: a second claim is refused with the
  `milestone_taken` code, naming the step that holds it. The package ships no vocabulary of its own, so
  what counts as a milestone stays the host's to say.
- `code` on a validation issue, so a host can act on a named refusal without reading the English.
- Words of its own. `DEFAULT_STRINGS` holds every string the interface says, grouped by where it appears,
  and `TimelineOptions.strings` writes over any of them. The catalog already carried the vocabulary of the
  domain; this carries the chrome around it, down to the legends and empty states the representations draw.
- `TimelineOptions.locale` and `durationUnits`. Dates were formatted as en-GB by three formatters built at
  module load; they now belong to a `TimeFormats` the workspace carries, so two workspaces on one page can
  speak different languages.
- Fields of a host's own on an incident. `TimelineAppOptions.incidentFields` declares what the host's
  incident record holds beyond the package's own, as text, long text, number, choice, flag or date; the
  dialog renders them and keeps the values in the incident metadata, which the package never reads. Keys
  the host does not declare are left untouched, so two hosts can share one incident.
- `schema/postgres-rls.sql`, a worked example of isolating tenants with row level security, and a section
  in docs/storage.md on the three ways of doing it. The package still holds no opinion about tenancy.
- A page of any size, and a canvas as tall as its content. `PAGE_WIDTH` and `PAGE_HEIGHT` become the
  default rather than the law: `TimelineOptions.pageSize` and the render entry point take a size, every
  representation lays itself out against it, and the frame, the export and the print sheet follow.
  `canvasMode: "continuous"` grows the page until the representation stops splitting and pans the whole
  scene in the stage instead of paginating. Slides stay the default, at 1600 by 900, unchanged.
- Rendering with no page. A new `cyber-incidents-timeline-generator/render` entry point exports
  `renderPages`, `renderPage` and `countPages`, which draw any representation into SVG given a document,
  so a scheduled report or a mail can carry the picture. The document is passed in and put back after, so
  nothing global is touched. `serialize` takes a size, a background, a stylesheet and a serializer, which
  is what lets a server render dark or branded; without an `XMLSerializer` it serializes the tree itself.
- Representations of a host's own. `Representation` keeps its twelve values and `RepresentationKey` widens
  the renderer, the catalog and the stored placements to any plain key, declared through
  `CatalogOptions.representations`. A thirteenth view drawn by the host is now a first class one: it takes
  its own toolbar settings and keeps its own pinned positions. An undeclared key is refused rather than
  quietly falling back to the sequential timeline.
- Finer permissions. `TimelinePermissions` gains `canExport`, `canMove` and a `can(action, type)` callback
  asked once the matching flag allows the action, so "may add steps, may not delete records" is now
  expressible. The defaults keep today's behaviour, and `canMove` follows `canEdit` unless it is set.
- A reading of what a diagram holds. `summarise(diagram)` counts the records, the steps by side, outcome,
  tactic, kill chain phase, response phase, audience and confidence, the links, the techniques and
  evidence sources named, the tags, the span, and which named milestones are claimed and which are still
  missing. It is pure, so a scheduled job can call it on the server; `TimelineApi.getSummary`,
  `GET /incidents/{id}/summary`, `DiagramStore.summary` and `TimelineHandle.summary` all serve it.
- Control of the view from outside. `TimelineHandle` gains `state`, `setPage`, `setFilters` and
  `setOption`, and `TimelineOptions.onStateChange` reports the representation, the slide, the filters and
  the selection after every change. A host can now carry the view in its own address bar and hand it back.
- `RendererDefinition.options` accepts a function of the strings, which is how the built in representations
  declare their toolbar settings. An array still works.

- The marks a renderer draws with. `defineRenderer` was public and `el`, `group`, `rect`, `text`,
  `truncate`, `wrap`, `timeAxis`, the card helpers and `textWidth` were not, so a host could declare a
  representation of its own and had nothing to put on it. All exported.
- `SqlTimelineStoreOptions.schema`, and a second argument to `TableNames`, so the tables can live in a
  schema of the host's own rather than in the search path. Held to the same plain identifier as the
  prefix. `SqlTimelineStore.driver` becomes protected, so a host that keeps its incidents in its own
  register can override those five methods and keep the rest.
- A whole timeline as one portable file. `GET /incidents/{id}/document` writes every record, step,
  relationship and pinned position with no database id and no incident id, naming records after what
  identifies them; `POST /documents` reads one back into a new incident and
  `POST /incidents/{id}/document` into one that already exists, merging or adding, optionally retitled and
  moved in time. The whole import is one transaction, and a milestone another step already holds is
  reported rather than displaced. Both live in the timeline toolbar: written out from the export menu,
  read back from the button beside it, into the timeline on screen. A record the file names again is
  recognised, so opening the same file twice does not draw everything twice.

### Changed

- A name typed in the quick add line of the record list is saved as soon as the line is left, without
  waiting for Enter. Escape still discards it.

### Fixed

- A row whose number arrived as text was refused. PostgreSQL returns BIGINT as a string, because most of
  its range does not survive a double, so a store on an identity column could not read its own ids. Text
  that is exactly a number is now read as one, and a value that would lose precision is refused rather
  than rounded into a different row.
- The delete question in the record list closed as soon as the pointer left the bin. The two answers
  appear where the bin was, so reaching either one moved the pointer off it. It now closes when the
  pointer leaves the row.

## [0.1.1] - 2026-09-16

### Changed

- A step added while another step is selected is dated halfway between it and the next step, or one hour
  after it when it is the last, so it lands right after the selection instead of at the current time.

## [0.1.0] - 2026-09-14

### Added

- Twelve representations of an incident: sequential timeline, actor swimlanes, attacker vs defender,
  relationship graph, kill chain board, attack flow, diamond model, ATT&CK matrix, blast radius, response
  metrics, evidence timeline and narrative.
- The workspace: record list with quick add, inspector, filters, undo and redo, pan and zoom, manual
  placement in the relationship graph, and PNG, SVG, HTML and print export.
- `TimelineService` with validation, cross incident integrity checks, cascading deletes, and response metrics
  measured from the steps, benchmarked against earlier incidents of the same scope.
- Stores in memory, in browser storage and on SQL databases, with a built in SQLite driver.
- A REST handler, an HTTP client for it, and a reference server with a sample incident.
- Light, dark and automatic themes driven by CSS custom properties, with a toolbar toggle remembered per
  browser.
- A configurable impact scale, set once on the service and followed by validation, storage, the inspector and
  every view.
- A slide header customizer to rewrite the title block of every slide or add host specific facts to it.
- `handle.select()` to open a record from the host.
- `mountTimelineApp`, a single page incident desk around the workspace: incident picker, creation, details,
  deletion, address sync and a theme toggle for the whole page. Incident management can be turned off.
- The command line serves the app at `/` on SQLite, `/local.html` for a browser only desk, and `--api-only`
  for the REST API alone.
- `npm run site` assembles the browser only desk for static hosting, published to GitHub Pages by a workflow.
- The workspace follows the theme of the page it sits in (`data-theme`, `data-bs-theme`, `dark` and `light`
  classes, `color-scheme`) and the system, or a `themeDetector` of the host.
- `IncidentSource` and `SourcedTimelineStore` to keep timelines here for incidents owned by a ticketing tool,
  SOAR or case manager, with `externalId` on incidents. See `CONNECTORS.md`.
