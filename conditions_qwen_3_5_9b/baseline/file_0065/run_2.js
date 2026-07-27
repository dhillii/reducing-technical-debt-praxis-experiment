const { prepareStackTrace } = Error;
Error.prepareStackTrace = (_, [callSite]) => {
	const location = {
		sourceFile:
			callSite.getFileName() ??
			`${callSite.getEvalOrigin()}, <anonymous>`,
		sourceLine: callSite.getLineNumber() ?? 1,
		sourceColumn: callSite.getColumnNumber() ?? 1,
	};
	return location;
};
Error.captureStackTrace(dummyObject, relative);
Error.prepareStackTrace = prepareStackTrace;
return location;