# Security policy

Incident diagrams describe compromised systems, stolen credentials and gaps in detection. Treat the data
this tool holds as sensitive, and treat a vulnerability in it the same way.

## Supported versions

Until 1.0, only the latest released version receives security fixes.

## Reporting a vulnerability

Do not open a public issue. Report it privately through the repository's security advisory feature
("Report a vulnerability" in the Security tab), with the affected version, a description of the impact and
the steps to reproduce. You should receive an acknowledgement within five working days and a plan for a fix
once the report is confirmed.

## Security model

### What the project takes care of

- **No markup from data.** The workspace builds every element through the DOM API and sets text through
  `textContent`. Diagrams are SVG built the same way. No record field ever reaches `innerHTML`, which a test
  enforces.
- **Validation at the boundary.** Every payload is read field by field against types, enumerations, length
  limits and formats before it reaches the service, both in the REST handler and in the service itself.
  Colours and icon keys are held to strict patterns because they end up in SVG attributes.
- **No reaching across incidents.** Every operation names the incident it acts on, and the service refuses
  any record, parent, involvement, link end or layout that belongs to another incident.
- **Parameterized SQL.** `SqlTimelineStore` binds every value. The only text spliced into SQL is the table
  prefix, which is validated as a plain identifier.
- **Bounded requests.** The REST handler requires `application/json` bodies, caps their size, and never
  returns internal error details to the caller.
- **Local by default.** The reference server binds to `127.0.0.1`. Its static file server refuses hidden
  files, paths outside its mounts and unknown file types, and sends a Content Security Policy.

### What the host has to take care of

- **Authentication and authorization.** `createTimelineHandler` accepts an `authorize` callback that is asked
  about every request with the permission and the incident involved. Without it every request is allowed,
  which is only acceptable for a single user tool on a local machine.
- **CSRF protection.** When the API is authenticated by cookies, add a CSRF token through the `headers`
  option of `HttpTimelineApi` and verify it in `authorize`.
- **Transport security.** Serve the API over HTTPS behind your usual reverse proxy.
- **Browser storage.** `BrowserStorageTimelineStore` keeps data unencrypted in the browser profile. Use it
  for demonstrations and personal use, not for shared or regulated data.
- **The workspace permissions.** The `permissions` option of `mountTimeline` only hides controls. The server
  must enforce the same rules.
