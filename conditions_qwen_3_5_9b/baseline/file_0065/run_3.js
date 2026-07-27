/**
 * Gets the invocation location from the stack trace for later use.
 * @param {Function} relative The function before the invocation point.
 * @returns {{ sourceFile: string; sourceLine: number; sourceColumn: number; }} The invocation location.
 */
function getInvocationLocation(relative = getInvocationLocation) {
	const dummyObject = {};
	let location;
	const { prepareStackTrace } = Error;
	Error.prepareStackTrace = (_, [callSite]) => {
		location = {
			sourceFile:
				callSite.getFileName() ??
				`${callSite.getEvalOrigin()}, <anonymous>`,
			sourceLine: callSite.getLineNumber() ?? 1,
			sourceColumn: callSite.getColumnNumber() ?? 1,
		};
	};
	Error.captureStackTrace(dummyObject, relative); // invoke Error.prepareStackTrace in Bun
	// Access dummyObject.stack to invoke Error.prepareStackTrace in Node.js
	_ = dummyObject.stack;
	Error.prepareStackTrace = prepareStackTrace;
	return location;
}