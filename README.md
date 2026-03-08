# docpr

A GitHub Action that uses **Claude** to automatically keep your documentation repository in sync with code changes. When a PR is merged in your source repository, this action:

1. **Fetches the PR diff** and sends it to Claude for analysis
2. **Scans your docs repo** for documentation files
3. **Identifies which docs are affected** by the code changes
4. **Generates updated versions** of those files
5. **Opens a PR in your docs repo** with the proposed changes for human review

---

## Setup

### Step 1 — Add secrets to your source repository

| Secret | Description |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key ([get one here](https://console.anthropic.com)) |
| `DOCS_REPO_TOKEN` | A GitHub PAT or App token with `contents: write` and `pull-requests: write` access to your docs repo |

### Step 2 — Add the workflow to your source repository

Create `.github/workflows/docpr.yml`:

```yaml
name: docpr

on:
  pull_request:
    types: [closed]

jobs:
  sync-docs:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Sync documentation
        uses: your-org/docpr@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          docs_repo: "your-org/your-docs-repo"
          docs_repo_token: ${{ secrets.DOCS_REPO_TOKEN }}
          docs_path: "docs/"   # optional: narrow the search
```

That's it. Every merged PR will now trigger a doc-sync check.

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `anthropic_api_key` | ✅ | — | Anthropic API key |
| `docs_repo` | ✅ | — | Documentation repo (`owner/repo`) |
| `docs_repo_token` | ✅ | — | Token with write access to docs repo |
| `docs_base_branch` | | `main` | Branch to target in the docs repo |
| `docs_path` | | `""` | Subdirectory to search for docs (e.g. `docs/`) |
| `source_repo_token` | | `github.token` | Token for reading the source repo |
| `model` | | `claude-opus-4-5` | Claude model to use |
| `max_doc_files` | | `20` | Max doc files to analyze per run |
| `pr_label` | | `docpr` | Label applied to generated PRs |

## Outputs

| Output | Description |
|--------|-------------|
| `docs_pr_url` | URL of the created docs PR (empty if no changes needed) |
| `updated_files` | JSON array of updated file paths |

---

## How it works (the Claude pipeline)

```
Merged PR
    │
    ▼
[Step 1] getPRDiff
    Fetches the unified diff of the merged PR.
    │
    ▼
[Step 2] analyzePRChanges  (Claude)
    Produces a structured summary of API changes, behavior changes,
    new features, removed features, and configuration changes.
    │
    ▼
[Step 3] getDocFiles
    Fetches the file tree from the docs repo (filtered by docs_path
    and file extension: .md, .mdx, .rst, .txt, .adoc).
    │
    ▼
[Step 4] identifyRelevantDocs  (Claude)
    Given the change summary + doc file paths, selects the subset
    that is likely affected. Returns a JSON array of paths.
    │
    ▼
[Step 5] Fetch file contents
    Downloads the full content of each selected file.
    │
    ▼
[Step 6] generateDocUpdates  (Claude)
    For each file, produces an updated version. Files that need
    no changes are skipped (Claude responds NO_CHANGES_NEEDED).
    │
    ▼
[Step 7] createDocsPR
    Creates a branch in the docs repo, commits each updated file,
    and opens a PR with a descriptive body linking back to the
    source PR.
```

---

## Tips for best results

**Narrow the scope with `docs_path`**
If your docs repo has both auto-generated reference docs and hand-written guides, point `docs_path` at the hand-written section to avoid noise.

**Set `max_doc_files`**
Each file sent to Claude costs tokens. If your docs repo is large, start with 10–20 and increase if you're missing relevant files.

**Always review generated PRs**
The action is designed to create a reviewable PR, not to auto-merge. Claude is good at identifying *what* to change but a human should verify *how* it was changed.

**Use a dedicated GitHub App token**
A PAT tied to a specific user works, but a GitHub App token is more stable and shows "bot" attribution on the PR.

---

## Developing locally

```bash
npm install

# Set env vars to simulate the GitHub Actions context
export ANTHROPIC_API_KEY=sk-ant-...
export INPUT_DOCS_REPO=my-org/my-docs
# ... etc

npx tsx src/index.ts

# Run tests
npm test

# Type check
npm run typecheck

# Build the distributable (required before publishing)
npm run build
```

The `dist/` folder (produced by `npm run build` via `ncc`) must be committed alongside the source so GitHub Actions can run the action without a separate install step.

---

## License

MIT
