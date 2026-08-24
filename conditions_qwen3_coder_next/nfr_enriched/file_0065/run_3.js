void dummyObject.stack; // invoke Error.prepareStackTrace in Node.js

// Refactored replacements
Error.captureStackTrace(dummyObject, relative);
dummyObject.stack;
Error.prepareStackTrace = prepareStackTrace;