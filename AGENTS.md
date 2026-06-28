# AGENTS.md

Instructions for future Codex/AI agents working on HX Part Picks.

## Project Overview

This repo is a Google Apps Script automation bound to a Google Sheet through `.clasp.json`. It processes Gmail printer PDF scans, splits and rotates PDFs, extracts raw Part Pick form values with Gemini, writes raw rows to `Part Picks`, appends summary rows to `Part Pick Summary`, enriches those rows from EOD CSV reports, archives PDFs in Drive, and dedupes work through `_Processed Keys`.

## Key Commands

```powershell
node --check .\ChangedFile.js
git diff --check
clasp push
```

`clasp push` requires explicit user approval. Apps Script tests run in Apps Script with `runLocalTests()` after an approved push.

## Hard Safety Rules

- Do not run `clasp push` unless the user explicitly approves.
- Do not run production functions such as `processPrinterEmails()` unless the user explicitly approves.
- Do not run `setup()` unless the user explicitly approves or the task specifically requires setup.
- Do not change Gmail query, label, archive, or dedupe logic casually.
- Do not normalize raw extraction output written to `Part Picks`.
- Do not overwrite existing summary rows.
- Do not use `Refresh EOD` as a reprocessing path for Gmail, PDFs, Gemini, archive, labels, dedupe keys, or raw `Part Picks`.
- Do not change Pallet/Product C/B/location correction policy without explicit approval.
- Do not trust Outstanding Orders by Order No. alone.
- Never commit secrets, API keys, clasp auth files, private email contents, or sensitive IDs.

## Verification Expectations

- Run `node --check` on changed JS files.
- Run `git diff --check`.
- After an approved `clasp push`, run `runLocalTests()` in Apps Script.
- After deploying `Refresh EOD` changes, run `installSummaryRefreshTrigger()` once if the installable edit trigger is not already present.
- For documentation-only changes, `node --check *.js` can be run as a repo sanity check.

## Business Logic Summary

Raw extraction prompt rules:

- One PDF page equals one Part Pick form.
- Gemini must return exactly one object in `forms`.
- Values must be raw as written.
- No correction, normalization, inference, prefix insertion, expansion, or lookalike character conversion belongs in the prompt.
- Blank, crossed-out, unclear, or ambiguous fields return `null`.
- Selection fields return an allowed option only when one option is clearly selected.

Batch/page dedupe rules:

- Batch key: `BATCH::<md5 original PDF bytes>`.
- Page key: `BATCH::<same hash>::PAGE-<pageNumber>`.
- A batch key may skip the original PDF before splitting.
- Page keys protect individual rows and partial retries.
- A legacy page key must not skip the whole batch.

Summary append rules:

- `Part Picks` is raw ingestion.
- `Part Pick Summary` is append-only by processing key.
- Manual and formula columns are not script-owned.
- EOD enrichment applies after new rows are appended.
- `Refresh EOD` is a manual checkbox on existing summary rows. It reruns EOD checks for that row only and must not append rows or call ingestion services.

EOD report enrichment rules:

- EOD reports are Gmail CSV attachments from `donotreply@paperlesswms.com.au`.
- Reports are matched to the summary row's scanned date.
- Missing reports or headers should surface through logs and validation notes.

Validation colours:

- Green `#D9EAD3`: OK or corrected.
- Yellow `#FFF2CC`: no match or blocked correction.
- Red `#F4CCCC`: mismatch.

Outstanding Orders crosscheck:

- Parse owner and order from `Order No.`; owner codes can be alphanumeric.
- `Search Criteria` format is `B{Bottle Size}&V{Vintage}&O{Original pallet no.}`.
- The leading `B` segment is bottle size, not the pallet B Number.
- Extract the B Number only from the `O` segment.
- Match summary rows by `Order No.` plus `O`-segment B Number.
- Never fall back to order-only matches.
- Repeated same Order+B rows are grouped and `Qty Ord` is summed.
- Invalid Search Criteria can count toward order-level total quantity but cannot match a B group.

Pallet/Product B-owner gate:

- Exact C+B match can set Location.
- B evidence can correct C and Location only when B ownership is unique and matches summary Owner.
- C cannot correct a trusted B Number.
- C-only evidence does not set Location.
- Member is filled only from a unique B+Owner match.
- Product notes are written only when the B Number has a unique product tuple.

## Preferred Workflow

1. Inspect the repo first.
2. Present a concise plan for non-trivial work.
3. Make targeted changes in the smallest relevant files.
4. Show a focused diff or diff stat.
5. Run local checks that do not touch production services.
6. Wait for explicit user approval before any `clasp push` or production run.
