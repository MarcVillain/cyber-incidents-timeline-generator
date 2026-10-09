# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Names can be shown as written, anonymized or censored, as a view setting beside the audience, remembered per browser. Anonymized names get an alias such as `Org-1` that is the same in every field, view and export; censored names get a bar of 4, 8 or 12 characters by default, whichever is closest to the name, so the bar tells little about it. The lengths are set in the Privacy tab. Stored records are never changed.
- Names are found from the records (people, organisations, teams, threat actors, assets, accounts, the scope) and by pattern (IP and mail addresses, URLs, hashes, hostnames, domains, usernames), plus any text added by hand. Every kind is protected unless revealed.
- A sensitivity setting decides how far a mention may stray from a name and still be caught: case and punctuation, then accents, glued words and a typo, then a few typos. Mentions just out of reach are listed for review, to be masked or ignored, and any name can be revealed on its own.
- A Privacy tab in the settings holds the sensitivity, the alias prefixes, the kinds revealed, the text added by hand and whether the record list and the details are masked too, which leaves them read only. It travels with the settings file.
- Integrators get `privacy`, `onPrivacyChange` and `disclosureLock` on `mountTimeline`, `privacy` and `filters.disclosure` on the headless renderer, and `Masker` and `maskDiagram` in the core.

## [0.5.1] - 2026-09-21

### Changed

- The audiences of a step are picked from a dropdown that holds several at once, like every other picker, instead of a row of chips. It reads Everyone when none or all of them are picked.

## [0.5.0] - 2026-09-21

### Added

- Every vocabulary list can be fitted to a team: parties, kinds of record, tactics, kill chain and response phases, outcomes, link kinds, confidences, involvements and audiences. Entries can be added, renamed, reordered, given another icon and removed in the settings of the app, and each list has its own reset.
- An entry says what it means for the views. A party names its camp, a tactic its kill chain phase, a response phase the figure it counts toward and an outcome what it says, so an added entry is drawn and measured like the built in one it resembles.
- A step can be written for several audiences, picked on the step, and the audience filter offers every audience of the catalog.
- Integrators get `vocabulary` on `buildCatalog`, `checkVocabulary`, the `Vocabulary` lookup, and `role`, `stage` and `meaning` on the catalog entries.
- The vocabulary, the impact scale and the milestones can be edited on the reference server too, for every viewer. A new `CatalogStore` port keeps them, with memory, browser storage and SQL implementations, and the REST API gains `GET` and `PUT /catalog/settings` and `POST /catalog/usage`, which counts the records still holding what a change removes.
- A `Configure` permission guards changing the catalog, so a host can keep it to administrators.
- Each entry of a list sits on one line, its icon in its colour. What it means for the views, and the key it is stored under, open from a button of its own on the entry, and open by themselves for an entry just added.
- Pickers show a swatch beside a colour and an icon beside a camp, a meaning, a phase or a kind of record.
- Each setting in the settings panel of a view has its own reset, shown while the setting is off its default.

### Changed

- A step holds `audiences`, a list that is empty for everyone, instead of one `audience`. A client sending `audience` is still understood, databases and browser storage written before are read as they were, and browser storage is upgraded on the first read.
- Vocabulary fields are keys of the catalog rather than fixed enumerations, and are validated against it.
- `categoryOf`, `killChainPhaseOf` and `diamondVertexOf` moved onto `Vocabulary`, and the response helpers take one.
- The full settings of the app save the vocabulary, the scale and the milestones through the api rather than in the browser, so the service needs a `catalogStore`. What an earlier release kept in the browser is handed over on the first start. `loadAppCatalog` still reads it for hosts that build their service that way.
- `openSqliteStore` also returns `catalogStore`, and the schemas gain the `catalog_settings` table.
- The palette hands out side and outcome colours through `side()` and `outcome()`, with a colour per camp beside them.

## [0.4.1] - 2026-09-21

### Added

- The settings panel of each view has a button that puts its settings back to their defaults, the columns and their names included, along with the audience and milestone filters.

### Fixed

- The sample incident now carries tags and references, so every column of the narrative table shows an example of what it holds.

## [0.4.0] - 2026-09-21

### Added

- Each view has a settings button beside the filters, listing every setting of that view with a description. The audience and milestone filters stay in the toolbar and appear in the panel too, described for the view on screen.
- The narrative table shows any of thirty one columns, picked, reordered and renamed in its settings, with a compact row size and an option to hide the summary. New columns include the row number, the date and the time apart, the duration, the time since the start, the kind, identifier, criticality and compromise of the target, the other records involved, the tactic, the kill chain and response phases, the audience and the milestone.
- The timeline table exports to Excel, CSV and Markdown, or is copied to paste into a spreadsheet, a document or a mail. Exports use the columns and headings chosen for the narrative, from any view.
- The views can be switched from a scrolling strip, which now shows arrows where more views are hidden, or from a dropdown. The choice sits in the settings dialog and in `viewPicker` for integrators.
- Integrators get `description` on renderer options, list options through `OptionKind.List`, and `filters` on renderer definitions to describe the shared filters.

### Changed

- The narrative table headings moved from the `scene` strings to a new `table` group.

## [0.3.0] - 2026-09-21

### Added

- A settings button next to the theme toggle, on the GitHub Pages desk and on both pages of the reference server. Settings are kept in the browser.
- The theme and the main colours can be changed, for light and dark separately.
- Parties, record kinds, tactics, phases and more can be renamed and given another icon, picked from over two hundred with a search. Entries sharing an icon are flagged.
- Impact levels and milestones can be edited where the browser holds the incidents. Removing one still in use asks first.
- The page shape, slides or one long page, the date format and the duration units can be chosen.
- Settings can be exported to a file, imported back or reset.
- Integrators get `settingsButton` and `settingsScope` on the app, and `loadAppCatalog` to build a service from the saved settings.

## [0.2.1] - 2026-09-18

### Added

- The lines that touch a record are lit from it, fading out with the distance, so what a record is
  connected to reads at a glance in the blast radius. The record under the pointer answers for as long as
  the pointer is on it, and the selected record the rest of the time.

### Fixed

- A list already open did not close when its own button was pressed again in Safari, which does not focus a
  button that is clicked: the press closed the list and the click that followed found it shut and opened it
  back up. The button now answers to the state at the moment it was pressed.

## [0.2.0] - 2026-09-18

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
- One picker for every list, searchable when the list is long. A field with eight choices or more gains a
  search box above its options, which is what makes picking one record out of a hundred bearable; a
  shorter list is the same control without it. Opening one closes whatever was open before it.
- Tags are chips, and a tag already written elsewhere in the timeline is offered as soon as a letter is
  typed. An incident is only searchable by tag when the same word is spelled the same way twice.
- Records are dragged into place in the rail. A row answers three questions by where the pointer lands:
  the middle takes the record inside, which is what makes a group, and either edge takes it beside that
  row, at the same level, so a record can be dropped between two others. The Parties and Resources
  headings take a record out of whatever holds it. A drop the service would refuse, or one that would
  change nothing, is not offered: nothing is marked and the browser shows no drop cursor. Steps and
  relationships are not carried, because they belong to the incident rather than to anything in it.

### Changed

- The selection is marked by the shape it lands on rather than by one effect for everything: a card or a
  disc is ringed, a line of a table or of a list is tinted along its whole width. A halo settling on the
  few painted words of a table row said nothing about which row it was.
- Enter in the quick add line finishes it. It used to save the record and open another empty line of the
  same kind, so adding one record left a line waiting that nobody had asked for. A reader who wants a
  second record picks a kind again.
- A name typed in the quick add line of the record list is saved as soon as the line is left, without
  waiting for Enter. Escape still discards it.

### Fixed

- The selected record showed no halo in Safari, which does not honour the CSS drop shadow shorthand on an
  SVG group, and every record on the canvas is a group. It is drawn as an SVG filter now.
- Choosing a representation sent the strip of representations back to its first one, losing the place it
  had been scrolled to.
- Building on a Node older than the one the package requires failed inside TypeScript with an error that
  never mentioned Node. The version is checked before the build starts, `.nvmrc` names it, and
  `engine-strict` makes an install on the wrong version refuse rather than succeed and break later.
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
