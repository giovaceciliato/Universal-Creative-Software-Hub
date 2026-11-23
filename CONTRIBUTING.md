# Contributing

Universal Creative Software Hub is in its initial planning phase. Design, documentation, and catalog contributions are welcome.

## Suggest an app

Before opening a pull request, verify that the app is related to creative work, has a legitimate free version, and has an official source.

1. Add a JSON manifest to `catalog/apps/<id>.json` based on the catalog format.
2. Link to the publisher's official website and download page.
3. State the publisher and actual free/open-source/freeware status accurately.
4. Use clear English and avoid marketing claims or unverified security claims.
5. Open a pull request describing the app and how its official URLs were verified.

Adding an app **does not** give this project permission to redistribute its binaries, logo, screenshots, or trademarks.

## Developer submissions

Developers may submit their own apps. Maintainers should check the project identity, download provenance, platform availability, and potential conflicts of interest before approval.

Never submit a command to silently execute during install/update. The catalog intentionally does not support arbitrary install scripts.

## Code contributions

Open an issue before starting large architectural changes. Prefer small, reviewable pull requests and include tests when an implementation is added.

## Community standards

Be respectful, provide reproducible bug reports, credit original creators, and respect third-party software licenses.

## Retrying application approval

The approval workflow reuses the existing `app-requests/issue-N` branch and its PR to `main`. It never resets or deletes a review branch. Repeating an approval resumes missing PR creation and missing CI dispatches without duplicating the review notification. A closed or merged PR is left unchanged; review changes to an existing branch manually.

If PR creation returns HTTP 403, check **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** (and any organization policy). The workflow already requests `contents: write` and `pull-requests: write`; these do not override repository policy. Fix the permission, then retry the failed job or repeat `/approve-app`. Do not delete the branch. Failed CI runs can be rerun from Actions separately.

Run approval regression tests with `node --test scripts/test-create-approved-app-pr.mjs`.

