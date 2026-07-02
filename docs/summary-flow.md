# Summary Flow

## Raw Ingestion Boundary

`Part Picks` stores raw Gemini output. The ingestion path in `services/EmailProcessorService.js` archives the page PDF, attempts Gemini extraction, and calls `SheetService.appendPartPickRow()` with the extracted form as received. It must not correct, infer, normalize, prefix, expand, or rewrite values before they are written to raw `Part Picks`.

If Gemini extraction fails, the processor writes a blank review row with extraction status/error metadata. That failure is non-fatal to the batch unless Drive archive or sheet append fails.

## Draft-Based Summary Append

`SummaryService.appendMissingSummaryRows()` is append-only and draft-based:

```text
Raw Part Picks
  -> build Summary draft in memory
  -> safe Summary normalisation
  -> EOD enrichment/check attempt in memory
  -> append final Summary row once
```

Rows must not be visibly appended and then patched by the initial EOD enrichment. `SummaryDraftService` maps raw rows to Summary drafts. `EodReportCoordinator.enrichSummaryDrafts()` enriches and validates those drafts before write. `SummaryAppendWriterService.appendFinalSummaryDrafts_()` writes the final values once.

If EOD cannot confirm a value, the Summary row still appends with safe values and any validation notes, colours, or blocked reasons carried by the draft.

## Append Placement

Summary identity is the hidden `_Key` column copied from raw `Processing Key`. Existing Summary rows and manual edits are never overwritten. New rows append after the last nonblank `_Key` in column A, not after `getLastRow()`, so checkbox validations, formulas, or stale formatted rows cannot push appends far below the real data.

`repairAppendMissingSummaryRows()` is only a safe sync from existing raw `Part Picks` rows to Summary. It does not call Gmail, PDF splitting, Gemini, Drive archive, dedupe, or email.

## Writable Columns

The final append writer writes only script-owned writable columns in contiguous column groups. It does not write Date Completed, SLA, Refresh, Email, or Notes as full-row payload columns. Data validations are cleared only for the target writable ranges before values/formulas are set.

Notes and backgrounds are written sparsely: a column range is created only when at least one draft has a note or background for that column.

## Manual And Formula Columns

Manual columns remain operator-owned. Formula columns remain script/formula-owned. The SLA service writes only the SLA column and clears stale validations there before setting formulas. Date Completed validation belongs only on Date Completed.

## Email Ledger

The `Email` checkbox sends the current reviewed Summary row plus the archived PDF attachment to the configured recipient. Duplicate prevention is based on `_Summary Email Ledger`, not checkbox state. Blocking statuses require admin review/reset before retry, because the script cannot prove whether a failed/unknown send reached the recipient.
