# REST contract

`HttpTimelineApi` talks to any server implementing this contract. `createTimelineHandler` implements it on
Node; a backend in another language only has to answer the same routes with the same shapes. The types
named below are exported from `cyber-incidents-timeline-generator/core` and are the reference for every field.

All bodies are JSON. Requests with a body must send `Content-Type: application/json`. Paths are relative to
the base path, `/api` by default.

## Conventions

- **Times** are wall clock readings without a zone, such as `2026-01-12T08:30:00`. A zone suffix sent by a
  client is dropped, not applied. Dates alone are accepted and read as midnight.
- **Enumerations** travel as their names, for example `"Attacker"` or `"InitialAccess"`.
- **Ratings** (`impact`, `criticality`, `severity`) are level keys of the impact scale the server is configured
  with, listed in `catalog.impactScale`. Anything else is refused.
- **Incidents owned by another tool** carry its key in `externalId`, `null` otherwise. See
  [CONNECTORS.md](../CONNECTORS.md).
- **Creates** need only the required fields and fill the rest with defaults.
- **Updates** change only the fields present. A field sent as `null` is cleared.
- **Scoping.** Every record route names its incident. A record of another incident answers `404`, and a
  reference to one answers `400`.

## Routes

| Method | Path | Body | Success | Permission |
|---|---|---|---|---|
| GET | `/catalog` | | `200 Catalog` | Read |
| GET | `/incidents` | | `200 Incident[]` | Read |
| POST | `/incidents` | `IncidentCreateInput` | `201 Incident` | Create |
| GET | `/incidents/{incidentId}` | | `200 Incident` | Read |
| PUT | `/incidents/{incidentId}` | `IncidentUpdateInput` | `204` | Update |
| DELETE | `/incidents/{incidentId}` | | `204` | Delete |
| GET | `/incidents/{incidentId}/diagram` | | `200 Diagram` | Read |
| POST | `/incidents/{incidentId}/nodes` | `NodeCreateInput` | `201 DiagramNode` | Create |
| PUT | `/incidents/{incidentId}/nodes/{id}` | `NodeUpdateInput` | `204` | Update |
| DELETE | `/incidents/{incidentId}/nodes/{id}` | | `204` | Delete |
| POST | `/incidents/{incidentId}/steps` | `StepCreateInput` | `201 DiagramStep` | Create |
| PUT | `/incidents/{incidentId}/steps/{id}` | `StepUpdateInput` | `204` | Update |
| DELETE | `/incidents/{incidentId}/steps/{id}` | | `204` | Delete |
| POST | `/incidents/{incidentId}/links` | `LinkCreateInput` | `201 DiagramLink` | Create |
| PUT | `/incidents/{incidentId}/links/{id}` | `LinkUpdateInput` | `204` | Update |
| DELETE | `/incidents/{incidentId}/links/{id}` | | `204` | Delete |
| PUT | `/incidents/{incidentId}/layout` | `LayoutInput[]` | `204` | Update |
| GET | `/incidents/{incidentId}/summary` | | `200 DiagramSummary` | Read |
| GET | `/incidents/{incidentId}/document` | | `200 TimelineDocument` | Read |
| POST | `/documents` | `ImportBody` | `201 ImportReport` | Create |
| POST | `/incidents/{incidentId}/document` | `ImportBody` | `200 ImportReport` | Create |

### Required fields

| Input | Required |
|---|---|
| `IncidentCreateInput` | `title` |
| `NodeCreateInput` | `name`, `kind` |
| `StepCreateInput` | `title`, `timestamp` |
| `LinkCreateInput` | `sourceNodeId`, `targetNodeId` |
| `LayoutInput` | `nodeId`, `representation`, `x`, `y` (both `null` to release a pinned record) |

### Moving a whole timeline

`GET /incidents/{incidentId}/document` returns every record, step, relationship and pinned position as one
file. It carries no database id, no incident id and nothing about the deployment: records are named after
what identifies them, which is what lets an import recognise the same host arriving a second time.

`POST /documents` writes it into a new incident; `POST /incidents/{incidentId}/document` writes it into one
that already exists. The body is `{ document, mode?, title?, shiftHours? }`:

- `mode` is `merge`, which updates a record the document names again, or `add`, which always writes a new
  one. Merge is the default.
- `title` overrides the title the document carries.
- `shiftHours` moves every moment together, for replaying an exercise on another date.

The whole import runs in one transaction, so a file that turns out to be inconsistent leaves nothing half
written. A milestone key a step in the incident already holds is reported in `milestonesTaken` and left
where it was, rather than displacing it.

### Side effects

- Deleting a record deletes the records grouped under it and the relationships touching any of them. Steps
  that named them as author, target or involved record are kept without that mention.
- Deleting a step deletes the relationships it established.
- Deleting an incident deletes everything in it.

## Example

```http
POST /api/incidents/7/steps
Content-Type: application/json

{
  "title": "Credentials replayed on the file server",
  "timestamp": "2026-01-12T13:00",
  "side": "Attacker",
  "attackTactic": "LateralMovement",
  "mitreTechniqueId": "T1021.002",
  "sourceNodeId": 31,
  "targetNodeId": 36,
  "isMilestone": true
}
```

```http
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{ "id": 52, "timestamp": "2026-01-12T13:00:00", "killChainPhase": "ActionsOnObjectives", "...": "..." }
```

## Errors

Errors carry `{ "message": string }`, and validation errors add the issues found:

```json
{
  "message": "title is required; side must be one of Unknown, Attacker, Victim, Defender, ThirdParty",
  "issues": [
    { "field": "title", "message": "is required" },
    { "field": "side", "message": "must be one of Unknown, Attacker, Victim, Defender, ThirdParty" }
  ]
}
```

| Status | When |
|---|---|
| 400 | The body is not valid JSON, fails validation, or references a record of another incident |
| 403 | The `authorize` callback refused the request |
| 404 | No such route, incident or record in that incident |
| 405 | The route exists but not for that method; `Allow` lists the methods it takes |
| 413 | The body is larger than `maxBodyBytes` |
| 415 | A body was sent without `Content-Type: application/json` |
| 500 | Anything else; details are passed to `onError` and never returned |

## Authorization

`createTimelineHandler` calls `authorize(request, permission, incidentId)` before every route. `permission`
is `Read`, `Create`, `Update` or `Delete`, and `incidentId` is `null` for `/catalog` and `/incidents`. Return
`false` to answer `403`. Omitting the callback allows everything, which is only suitable for a local tool.
