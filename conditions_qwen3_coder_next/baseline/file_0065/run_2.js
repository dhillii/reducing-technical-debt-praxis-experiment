};
	};
	Error.captureStackTrace(dummyObject, relative); // invoke Error.prepareStackTrace in Bun
	dummyObject.stack; // invoke Error.prepareStackTrace in Node.js
	Error.prepareStackTrace = prepareStackTrace;
	return location;
}