/**
 * ProcessorFlowTest.js — processor flow resilience (summary rows still
 * append after a thread-level failure). Uses stubs; no Gmail/Gemini calls.
 */

function getProcessorFlowTestCases_() {
  return [
    { name: 'Processor appends summary rows after thread failure', fn: testProcessorAppendsSummaryAfterThreadFailure_, suite: 'summary' }
  ];
}

function testProcessorAppendsSummaryAfterThreadFailure_() {
  let waited = false;
  let released = false;
  let searchCalled = false;
  let summaryCalled = false;
  let errorLogged = false;
  const processedThreadIds = [];
  const originalLogError = LogService.error;
  const threads = [
    {
      getId: () => 'THREAD_FAIL'
    },
    {
      getId: () => 'THREAD_OK'
    }
  ];

  LogService.error = (status, messageId, filename, err) => {
    errorLogged = status === 'THREAD_FAILED_UNEXPECTED' &&
      err &&
      String(err.message || err).indexOf('thread exploded') > -1;
  };

  try {
    processPrinterEmails_({
      lockService: {
        getScriptLock: () => ({
          waitLock: timeoutMs => {
            waited = timeoutMs === 30000;
          },
          releaseLock: () => {
            released = true;
          }
        })
      },
      gmailService: {
        buildSearchQuery: () => 'in:inbox subject:"mock printer"'
      },
      gmailApp: {
        search: (query, start, max) => {
          searchCalled =
            query === 'in:inbox subject:"mock printer"' &&
            start === 0 &&
            max === CONFIG.gmail.maxThreadsPerRun;

          return threads;
        }
      },
      threadProcessor: thread => {
        const threadId = thread.getId();
        processedThreadIds.push(threadId);

        if (threadId === 'THREAD_FAIL') {
          throw new Error('thread exploded');
        }
      },
      summaryService: {
        appendMissingSummaryRows: () => {
          summaryCalled = true;
        }
      }
    });
  } finally {
    LogService.error = originalLogError;
  }

  assertEquals_(true, waited, 'Processor did not wait for the script lock.');
  assertEquals_(true, searchCalled, 'Processor did not run the configured Gmail search.');
  assertEquals_('THREAD_FAIL|THREAD_OK', processedThreadIds.join('|'), 'Processor did not continue after thread failure.');
  assertEquals_(true, errorLogged, 'Thread failure was not logged.');
  assertEquals_(true, summaryCalled, 'Summary append was skipped after thread failure.');
  assertEquals_(true, released, 'Processor did not release the script lock.');
}
