/**
 * CONFIG.gs
 * Main tuning file.
 *
 * Raw extraction:
 * - The Part Picks tab should store raw Gemini output.
 * - Field descriptions should help Gemini locate the correct form area.
 * - Do not use prompt wording that asks Gemini to infer, correct, expand, prefix, strip, or normalise values.
 *
 * Summary sheet:
 * - CONFIG.summary.columns controls the clean human-facing sheet.
 * - manual: true means the script creates the column but does not fill it.
 * - Product columns are manual at raw-summary copy time, then EOD fills them
 *   only from unique Pallet/Product B+Owner product evidence.
 * - Refresh/Email are the current operator checkbox labels; old Refresh EOD
 *   and Send Email headers are migration aliases.
 * - existing summary rows must not be overwritten by the script.
 */

const FIELD_DESCRIPTIONS = {
  state: [
    'Handwritten state value in the top-left STATE box.',
    'Example: VIC.',
    'This is not the same as HFH/SHIP.',
    'Return the handwritten value as written.',
    'If blank or unclear, return null.'
  ].join('\n'),

  weatherStatus: [
    'Selected HFH or SHIP option in the top status row.',
    'Return null unless the selected option is very clear.',
    'Do not confuse this with the handwritten STATE field.'
  ].join('\n'),

  orderNumber: [
    'Handwritten order number in the ORDER NUMBER box.',
    'Normally 7 digits.',
    'Rarely it may be 9 digits.',
    'Return the handwritten value as written.',
    'Do not invent missing digits.',
    'If blank or unclear, return null.'
  ].join('\n'),

  originalLocation: [
    'Handwritten location in the ORIGINAL LOCATION box.',
    'Examples may look like 1G20E2, FASTHI, DAM, 4DROP, or 2LS110.',
    'Return the handwritten value as written.',
    'Do not convert similar-looking characters.',
    'Do not infer a corrected location.',
    'If blank or unclear, return null.'
  ].join('\n'),

  bCode: [
    'Handwritten value in the B CODE box.',
    'It may look like B followed by digits.',
    'Return the handwritten value as written.',
    'Do not add a missing B.',
    'Do not correct the value.',
    'If blank or unclear, return null.'
  ].join('\n'),

  cartonNumber: [
    'Handwritten value in the CARTON NUMBER box.',
    'It may look like C followed by digits, or a longer 393 barcode-style number.',
    'Return the handwritten value as written.',
    'Do not add a missing C.',
    'Do not expand shortened forms.',
    'Do not correct the value.',
    'If blank or unclear, return null.'
  ].join('\n'),

  totalBottleCount: [
    'Handwritten value in the TOTAL BOTTLE COUNT box.',
    'The value may contain counts, fractions, or size/unit codes.',
    'Return the handwritten value as written.',
    'Do not strip trailing letters.',
    'Do not convert letters to numbers.',
    'If blank or unclear, return null.'
  ].join('\n'),

  qLabel: [
    'Handwritten value in the Q LABEL box.',
    'It may look like Q followed by digits.',
    'Return the handwritten value as written.',
    'Do not add a missing Q.',
    'Do not correct the value.',
    'If blank or unclear, return null.'
  ].join('\n'),

  incompleteReason: [
    'Circled or selected reason in the REASON FOR INCOMPLETE ORDER section.',
    'Detect circles, ticks, slashes, or obvious marks around/near an option.',
    'Return null if no option is clearly selected.'
  ].join('\n'),

  carrier: [
    'Circled or selected carrier in the CARRIER section.',
    'This section is below the incomplete reason section.',
    'Detect circles, ticks, slashes, or obvious marks around/near an option.',
    'Return null if no option is clearly selected.'
  ].join('\n')
};

const CONFIG = {
  appName: 'HX Part Picks',

  gmail: {
    // from: 'guestprint@edg.com.au',
    subjectContains: 'Message from "RNP5838795908AB"',
    searchWindow: 'newer_than:7d',
    maxThreadsPerRun: 5,

    processedLabel: 'PartPick/Processed',
    failedLabel: 'PartPick/Failed',
    inboxLabel: 'Inbox'
  },

  drive: {
    rootFolderName: 'Part Pick Automation',
    processedFolderName: 'Processed PDFs',
    failedFolderName: 'Failed PDFs'
  },

  sheets: {
    extractedSheetName: 'Part Picks',
    logSheetName: 'Processing Log',
    processedSheetName: '_Processed Keys',
    configSheetName: 'Configuration',
    summaryEmailLedgerSheetName: '_Summary Email Ledger',
    eodReportCacheSheetName: '_EOD Report Cache',
    eodOutstandingOrdersCacheSheetName: '_EOD Outstanding Orders Cache',
    eodPalletProductCacheSheetName: '_EOD Pallet Product Cache'
  },

  pdf: {
    processorEndpoint: 'https://part-pick-pdf-processor.onrender.com/split',
    landscapeRotationDegrees: 270
  },

  summary: {
    sheetName: 'Part Pick Summary',
    headerRow: 2,

    columns: [
      { header: '*', manual: true, type: 'text' },
      { header: 'PDF', source: 'PDF Drive Link', type: 'link' },
      { header: 'Scanned At', source: 'Email Received At', type: 'datetime' },
      { header: 'Carrier', source: 'Carrier', type: 'text' },
      { header: 'State', source: 'State', type: 'text' },
      { header: 'Customer Name', source: 'Customer Name', type: 'text' },
      { header: 'Member', manual: true, type: 'text' },
      { header: 'Owner', manual: true, type: 'text' },
      { header: 'Order No.', source: 'Order Number', type: 'text' },
      { header: 'Location', source: 'Location', type: 'text' },
      { header: 'C Number', source: 'C Number', type: 'text' },
      { header: 'B Number', source: 'B Number', type: 'text' },
      { header: 'Order Qty', source: 'Total Units', type: 'number' },
      { header: 'B Qty', manual: true, type: 'number' },
      { header: 'Missing Units', source: 'Units Missing', type: 'number' },
      { header: 'Product Code', manual: true, type: 'text' },
      { header: 'Product Description', source: 'Description', type: 'text' },
      { header: 'Vintage', source: 'Vintage', type: 'text' },
      { header: 'Bottle Size', manual: true, type: 'text' },
      { header: 'Date Completed', manual: true, type: 'date' },
      { header: 'SLA', type: 'sla' },
      { header: 'Refresh', manual: true, type: 'checkbox' },
      { header: 'Email', manual: true, type: 'checkbox' },
      { header: 'Notes', manual: true, type: 'text' },
    ],
  },

  summaryEmail: {
    recipient: 'jesse.lang.04@gmail.com'
  },

  eodReports: {
    email: {
      from: 'donotreply@paperlesswms.com.au',
      searchWindow: 'newer_than:90d',
      maxThreadsPerRun: 100
    },

    validation: {
      summaryColumn: '*',

      colours: {
        ok: '#D9EAD3',
        corrected: '#D9EAD3',
        noMatch: '#FFF2CC',
        mismatch: '#F4CCCC'
      }
    },

    reports: {
      palletAndProductByMembers: {
        displayName: 'PALLET AND PRODUCT BY MEMBERS',
        subjectContains: 'EOD Reports - RP_Pallet_and_Product_by_Member.csv',
        filenameContains: 'RP_Pallet_and_Product_by_Member.csv',
        headerRow: 3,

        columns: {
          binLocation: 'Bin Location',
          childPalletNo: 'Child pallet no.',
          originalPalletNo: 'Original pallet no.',
          owner: 'Owner',
          memberNo: 'Member No',
          productCode: 'Product Code',
          productDescription: 'Product Description',
          vintage: 'Vintage',
          bottleSize: 'Bottle Size'
        },

        summaryColumns: {
          validation: '*',
          dateReceived: 'Scanned At',
          owner: 'Owner',
          member: 'Member',
          location: 'Location',
          cNumber: 'C Number',
          bNumber: 'B Number',
          productCode: 'Product Code',
          productDescription: 'Product Description',
          vintage: 'Vintage',
          bottleSize: 'Bottle Size'
        }
      },

      outstandingOrders: {
        displayName: 'OUTSTANDING ORDERS',
        subjectContains: 'EOD Reports - RP_OUTSTANDING_ORDERS.csv',
        filenameContains: 'RP_OUTSTANDING_ORDERS.csv',
        headerRow: 3,

        columns: {
          orderNo: 'Order No.',
          customerName: 'Customer Name',
          carrierCode: 'Carrier Code',
          customerState: 'Customer State',
          searchCriteria: 'Search Criteria',
          qtyOrd: 'Qty Ord',
          orderType: 'Order Type'
        },

        summaryColumns: {
          validation: '*',
          dateReceived: 'Scanned At',
          owner: 'Owner',
          orderNumber: 'Order No.',
          customerName: 'Customer Name',
          carrierCode: 'Carrier',
          customerState: 'State',
          orderQty: 'Order Qty',
          bQty: 'B Qty'
        }
      }
    }
  },

  gemini: {
    model: 'gemini-2.5-flash',
    endpointBase: 'https://generativelanguage.googleapis.com/v1beta/models',
    temperature: 0,
    maxOutputTokens: 8192
  },

  fields: [
    {
      key: 'form_date',
      label: 'DATE',
      sheetColumn: 'Date',
      type: 'handwritten',
      required: false,
      critical: false
    },
    {
      key: 'state',
      label: 'STATE',
      sheetColumn: 'State',
      type: 'handwritten',
      required: false,
      critical: false,
      description: FIELD_DESCRIPTIONS.state
    },
    {
      key: 'weather_status',
      label: 'HFH / SHIP',
      sheetColumn: 'Weather Status',
      type: 'selection',
      required: false,
      critical: true,
      options: ['HFH', 'SHIP'],
      description: FIELD_DESCRIPTIONS.weatherStatus
    },
    {
      key: 'picker',
      label: 'PICKER',
      sheetColumn: 'Picker',
      type: 'handwritten',
      required: false,
      critical: false
    },
    {
      key: 'order_number',
      label: 'ORDER NUMBER',
      sheetColumn: 'Order Number',
      type: 'handwritten',
      required: true,
      critical: true,
      description: FIELD_DESCRIPTIONS.orderNumber
    },
    {
      key: 'customer_name',
      label: 'CUSTOMER NAME',
      sheetColumn: 'Customer Name',
      type: 'handwritten',
      required: false,
      critical: false
    },
    {
      key: 'member_code',
      label: 'MEMBER CODE',
      sheetColumn: 'Member Code',
      type: 'handwritten',
      required: false,
      critical: false
    },
    {
      key: 'original_location',
      label: 'ORIGINAL LOCATION',
      sheetColumn: 'Location',
      type: 'handwritten',
      required: true,
      critical: true,
      description: FIELD_DESCRIPTIONS.originalLocation
    },
    {
      key: 'b_code',
      label: 'B CODE',
      sheetColumn: 'B Number',
      type: 'handwritten',
      required: true,
      critical: true,
      description: FIELD_DESCRIPTIONS.bCode
    },
    {
      key: 'carton_number',
      label: 'CARTON NUMBER',
      sheetColumn: 'C Number',
      type: 'handwritten',
      required: true,
      critical: true,
      description: FIELD_DESCRIPTIONS.cartonNumber
    },
    {
      key: 'wine_description',
      label: 'WINE DESCRIPTION',
      sheetColumn: 'Description',
      type: 'handwritten',
      required: false,
      critical: false
    },
    {
      key: 'vintage',
      label: 'VINTAGE',
      sheetColumn: 'Vintage',
      type: 'handwritten',
      required: false,
      critical: false
    },
    {
      key: 'bottles_missing',
      label: 'NUMBER OF BOTTLES MISSING',
      sheetColumn: 'Units Missing',
      type: 'handwritten',
      required: true,
      critical: true
    },
    {
      key: 'total_bottle_count',
      label: 'TOTAL BOTTLE COUNT',
      sheetColumn: 'Total Units',
      type: 'handwritten',
      required: false,
      critical: false,
      description: FIELD_DESCRIPTIONS.totalBottleCount
    },
    {
      key: 'total_carton_count',
      label: 'TOTAL CARTON COUNT',
      sheetColumn: 'Total Cartons',
      type: 'handwritten',
      required: false,
      critical: false
    },
    {
      key: 'q_label',
      label: 'Q LABEL',
      sheetColumn: 'Q Label',
      type: 'handwritten',
      required: false,
      critical: false,
      description: FIELD_DESCRIPTIONS.qLabel
    },
    {
      key: 'special_instructions',
      label: 'ANY SPECIAL INSTRUCTIONS? PLEASE WRITE DOWN',
      sheetColumn: 'Special Instructions',
      type: 'handwritten',
      required: false,
      critical: false
    },
    {
      key: 'incomplete_reason',
      label: 'REASON FOR INCOMPLETE ORDER - CIRCLE ONE',
      sheetColumn: 'Incomplete Reason',
      type: 'selection',
      required: false,
      critical: false,
      options: [
        'STOCK NOT IN LOCATION',
        'RF / SYSTEM ERROR',
        'INSUFFICIENT STOCK',
        'BOTTLE NOT IN BOX',
        'WAREHOUSE 4 LOCATION',
        'OTHER'
      ],
      description: FIELD_DESCRIPTIONS.incompleteReason
    },
    {
      key: 'carrier',
      label: 'CARRIER',
      sheetColumn: 'Carrier',
      type: 'selection',
      required: false,
      critical: false,
      options: [
        'AUSTRALIA POST',
        'NEXDAY',
        'ALTERNATE CARRIER',
        'OTHER'
      ],
      description: FIELD_DESCRIPTIONS.carrier
    },
    {
      key: 'picker_initials',
      label: 'INITIALS OF PART PICKER',
      sheetColumn: 'PP Initials',
      type: 'handwritten',
      required: false,
      critical: false
    },
    {
      key: 'picker_signoff_date',
      label: 'PART PICKER SIGNOFF DATE',
      sheetColumn: 'Signoff Date',
      type: 'handwritten',
      required: false,
      critical: false
    },
    {
      key: 'external_misc_notes',
      label: 'MISCELLANEOUS WRITING OUTSIDE BOXES',
      sheetColumn: 'Miscellaneous Writing',
      type: 'handwritten',
      required: false,
      critical: false
    }
  ]
};

function getGeminiApiKey_() {
  const key = PropertiesService
    .getScriptProperties()
    .getProperty('GEMINI_API_KEY');

  if (!key) {
    throw new Error('Missing GEMINI_API_KEY in Apps Script Project Settings > Script Properties.');
  }

  return key;
}
