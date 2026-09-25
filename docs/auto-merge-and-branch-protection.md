# Auto-merge & branch protection

`.github/workflows/auto-merge.yml` turns on GitHub's native **squash auto-merge**
for eligible pull requests. Auto-merge only completes once the base branch's
**branch protection** requirements (status checks and any required reviews) are
met — so this speeds up shipping *without* bypassing review rules. When a PR
merges into `main`, the existing `Cloudflare deploy` workflow deploys D1
migrations, the Worker, and Pages.

## What the workflow does

On pull requests targeting the default branch, it runs `gh pr merge --squash
--auto` for PRs that are **not drafts**, come from a **same-repo branch**, and
are either:

- authored by the **Cursor Cloud Agent bot** (`cursor[bot]` / `cursor`), so agent
  PRs merge hands-free once checks pass; or
- labeled **`auto-merge`** (explicit opt-in for any other author).

It uses the built-in `GITHUB_TOKEN` with least-privilege `contents: write` +
`pull-requests: write`, and never checks out or runs PR code.

## Required repository settings (one-time, admin)

These are GitHub settings the workflow cannot set for you:

1. **Allow auto-merge** — Settings → General → Pull Requests → check
   **Allow auto-merge** (and **Allow squash merging**; optionally **Automatically
   delete head branches**).
2. **Protect the default branch** — Settings → Rules → Rulesets (or Branches),
   target `main`:
   - **Require a pull request before merging** (set required approvals as you
     wish; `1` keeps a human in the loop before auto-merge fires).
   - **Require status checks to pass**, then add the checks to gate on, e.g.:
     - `Cloudflare deploy / validate` (Worker bundle + tests + `wrangler deploy --dry-run`)
     - optionally `SonarCloud Code Analysis`, `Gitar`, and the Windows/Android build jobs
   - Optionally **Require branches to be up to date** and **Require signed
     commits** (Cursor agent commits are signed/verified and satisfy this).

> ⚠️ Do **not** add the `Cloudflare deploy / publish` job as a required check.
> It runs only *after* merge on `main`, so requiring it would deadlock merges.
> The `Cloudflare deploy / validate` job is the pull-request gate.

Without both settings above, `gh pr merge --auto` cannot enable auto-merge; the
workflow logs a warning (it does not fail) until they are configured.

## Notes

- Auto-merge respects branch protection: if checks fail or a required review is
  missing, the PR simply waits — it will not merge.
- To disable for a specific PR, remove the `auto-merge` label (for label-based
  PRs) or disable auto-merge from the PR's merge box.
- Scope is intentionally conservative. To broaden or narrow eligibility, edit the
  `if:` condition in `.github/workflows/auto-merge.yml`.
