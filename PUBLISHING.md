# Publishing

The package is published to npm as `cyber-incidents-timeline-generator`. Releases go out from GitHub Actions through npm
trusted publishing, so no npm token lives anywhere and every version carries a provenance statement
linking it to the commit and workflow that built it.

## What gets published

`npm pack --dry-run` lists the exact content. It is `dist/` (JavaScript, declarations and source maps),
`src/` (so the source maps resolve), `app/` (the incident app the command line serves), `styles/`, `schema/`,
`docs/` without its screenshots, `licenses/`, `LICENSE`, `NOTICE`, `CHANGELOG.md` and the `README.md`,
`QUICKSTART.md`, `INSTALL.md` and `CONNECTORS.md` guides. Tests,
scripts and development configuration stay out.

`npm publish` runs `prepublishOnly` (type check and tests), then `prepack` (clean build), so a broken or
stale build cannot be published.

## One time setup

1. Create an account on [npmjs.com](https://www.npmjs.com/) and enable two factor authentication.
2. Push the repository to GitHub. `repository`, `homepage` and `bugs` in `package.json` point at
   `MarcVillain/cyber-incidents-timeline-generator`; update them if the repository moves, since npm resolves the
   README logo and screenshot against `repository`.
3. Publish the first version by hand, because trusted publishing can only be configured on a package that
   exists:
   ```bash
   npm login
   npm publish --access public
   ```
4. On npmjs.com, open the package settings, add a trusted publisher of type GitHub Actions, and enter the
   repository owner, the repository name and the workflow file `publish.yml`.
5. In the package settings, set publishing access to require two factor authentication and disallow
   tokens, so the workflow is the only way to publish.

## Releasing a version

1. Move the entries under a new heading in `CHANGELOG.md`.
2. Bump the version, which commits and tags it:
   ```bash
   npm version minor
   git push --follow-tags
   ```
3. Pushing the tag starts the publish workflow. It checks the tag matches `package.json`, runs the tests,
   publishes to npm, then creates the GitHub release with the changelog section of that version as notes.

Before 1.0, a minor version may change the public API; a patch version never does.
