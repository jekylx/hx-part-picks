# EOD And Refresh Flow

## Initial EOD Enrichment

Initial Summary enrichment happens on drafts before visible append. EOD may correct or fill:

```text
Order Qty
B Qty
Product Code
Product Description
Vintage
Bottle Size
Customer
Member
Owner
Carrier
State
C Number
B Number
Location
```

`Missing Units` is raw-normalised only. EOD must not overwrite it.

## EOD Reports

EOD CSV reports come from `donotreply@paperlesswms.com.au`. Lookups are matched to the Summary row scanned date. Runtime cache can hold any requested date for the current execution. Persistent EOD cache sheets are current-day only:

- `_EOD Report Cache`: metadata only.
- `_EOD Outstanding Orders Cache`: only rows where `Order Type` normalizes exactly to `OL`.
- `_EOD Pallet Product Cache`: full Pallet/Product by Member report.

Historical or random date requests should not read from or populate persistent cache sheets. Missing reports or missing headers should surface through logs and row validation notes.

## Outstanding Orders Rules

Outstanding Orders matching uses `Order No.` plus the `O` segment B Number from `Search Criteria`. It must never fall back to order-only matching.

`Search Criteria` format is:

```text
B{Bottle Size}&V{Vintage}&O{Original pallet no.}
```

The leading `B` segment is bottle size, not the pallet B Number. Repeated same Order+B rows are grouped and `Qty Ord` is summed. Invalid Search Criteria can count toward order-level total quantity but cannot match a B group.

## Pallet/Product Rules

Exact C+B evidence can set Location. B evidence can correct C and Location only when B ownership confirms the Summary/order Owner. C cannot correct a trusted B Number. C-only evidence does not set Location.

Member is filled only from a unique B+Owner match. Product Code, Product Description, Vintage, Bottle Size, and the B Number product note are written only when the B+Owner match has one unique product tuple.

## Queued Refresh

The installable edit trigger calls `handleSummaryRefreshEdit(e)`. For checked `Refresh` edits it only:

```text
validate checked Refresh edit
schedule processPendingSummaryRefreshes()
leave checkbox checked as pending
return quickly
```

The edit handler must not perform long EOD work directly.

`processPendingSummaryRefreshes()`:

```text
scan checked Refresh rows
group contiguous checked rows
refresh checked rows only
clear successful checkboxes
capture row/group errors
respect deadline
schedule at most one continuation trigger when needed
log batch stats
```

The worker may hold the script lock while processing. Lightweight edit classification should not hold long locks. Duplicate continuation triggers are avoided with trigger lookup before create and cleanup after completion.

## Validation Colours

- Green `#D9EAD3`: OK or corrected.
- Yellow `#FFF2CC`: no match or blocked correction.
- Red `#F4CCCC`: mismatch.
