# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
