# EOD Reports

EOD enrichment runs after new summary rows are appended. It searches Gmail for CSV reports matching the summary row's `Scanned At` date and writes corrections, notes, and validation colour to the summary row.

Existing summary rows can also be refreshed manually. Edit the row values first, then check the row's `Refresh EOD` checkbox. The installable onEdit trigger must point to `handleSummaryRefreshEdit(e)`. For `Refresh EOD`, it reruns EOD checks for that single row only and resets the checkbox after completion or failure.

Manual `Refresh EOD` does not append summary rows and does not call Gmail printer processing, PDF splitting, Gemini extraction, Drive archive, labels, dedupe, or raw `Part Picks` append logic.

## Report Discovery

All EOD reports use:

- From: `donotreply@paperlesswms.com.au`
- Search window: `newer_than:90d`
- Attachment type: CSV
- Header row: row 3
- Latest matching message for the scanned date wins.

## RP_Pallet_and_Product_by_Member.csv

Matching:

- Subject contains `EOD Reports - RP_Pallet_and_Product_by_Member.csv`.
- Filename contains `RP_Pallet_and_Product_by_Member.csv`.

Required columns:

- `Bin Location`
- `Child pallet no.`
- `Original pallet no.`
- `Owner`
- `Member No`
- `Product Code`
- `Product Description`
- `Vintage`
- `Bottle Size`

Summary columns used:

- `*`, `Scanned At`, `Owner`, `Member`, `Location`, `C Number`, `B Number`

### Pallet/Product Logic

- Exact normalized C+B match is strongest and can set `Location`.
- B Number is the trusted single-sided anchor.
- B evidence can correct `C Number` and `Location` only when:
  - B Number resolves to one unique pallet record including owner, and
  - that owner matches the summary `Owner`.
- Missing, mismatched, or ambiguous owner blocks B-based C/location correction.
- C cannot correct a trusted B Number.
- C-only evidence does not set `Location`.
- Mismatches are marked red and explained in validation notes.
- Member is filled only from a unique B+Owner match.
- Product details are written as a note on `B Number` only when the B Number has one unique product tuple.

## RP_OUTSTANDING_ORDERS.csv

Matching:

- Subject contains `EOD Reports - RP_OUTSTANDING_ORDERS.csv`.
- Filename contains `RP_OUTSTANDING_ORDERS.csv`.

Required columns:

- `Order No.`
- `Customer Name`
- `Carrier Code`
- `Customer State`
- `Search Criteria`
- `Qty Ord`

Summary columns used:

- `*`, `Scanned At`, `Owner`, `Order No.`, `Customer Name`, `Carrier`, `State`
- It also reads `B Number` from the Pallet/Product summary config.

### Outstanding Orders Logic

- `Order No.` is parsed as first five alphanumeric characters for owner and the remaining characters for order number.
- Owner codes can be alphanumeric.
- `Search Criteria` format is `B{Bottle Size}&V{Vintage}&O{Original pallet no.}`.
- The leading `B` segment is bottle size, not the pallet B Number.
- The pallet B Number is extracted only from the `O` segment.
- Summary rows match by normalized `Order No.` plus the `O`-segment B Number.
- Order-only matches are forbidden because one order can contain multiple stock lines.
- Repeated same Order+B rows are grouped and `Qty Ord` is summed into `qtyOrdSum`.
- Order-level `orderTotalQtyOrd` is also stored in the lookup for future use.
- Invalid Search Criteria rows can contribute to `orderTotalQtyOrd` but cannot match a B group.
- Customer, carrier, state, and owner enrichment requires the Pallet/Product service to confirm that the summary B Number has a unique owner matching the order owner.
- Carrier and state corrections are guarded: valid existing summary values are not overwritten.
- Summary quantity fields are not currently changed by Outstanding Orders data.
- Manual refresh uses the same matching rules. It still matches by normalized `Order No.` plus the `O`-segment B Number from `Search Criteria`; order-only fallback remains forbidden.

## Validation Semantics

- `ok`: report matched and no correction or mismatch was needed.
- `corrected`: a script-owned field was corrected from EOD evidence; validation remains green with notes.
- `blocked`: evidence was insufficient or unsafe, such as missing B Number, order+B not found, ambiguous group, missing owner confirmation, or owner mismatch.
- `notFound`: no relevant report, no usable row, or no required source value was found.
- `mismatch`: C/B evidence disagrees; validation is red and existing trusted values are not casually overwritten.

Validation colour mapping:

- Green `#D9EAD3`: OK or corrected.
- Yellow `#FFF2CC`: no match or blocked correction.
- Red `#F4CCCC`: mismatch.
