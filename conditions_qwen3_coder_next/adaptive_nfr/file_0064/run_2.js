/**
 * @typedef {Object} VerifyAndFixOptions
 * @property {string} [filename]
 * @property {boolean} [fix]
 * @property {boolean} [stats]
 */

/**
 * @typedef {Object} VerifyAndFixState
 * @property {string} text
 * @property {string} currentText
 * @property {string} previousText
 * @property {string} secondPreviousText
 * @property {boolean} fixed
 * @property {number} passNumber
 * @property {number} maxPasses
 * @property {boolean} shouldFix
 * @property {boolean} stats
 * @property {Object} slots
 * @property {string} debugTextDescription
 */

/**
 * @param {string} text
 * @param {ConfigObject|ConfigObject[]} config
 * @param {VerifyAndFixOptions} options
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}}
 */
function verifyAndFix(text, config, options) {
	const state = createVerifyAndFixState(text, config, options);
	
	while (shouldContinueFixing(state)) {
		executeFixPass(state, config, options);
	}
	
	return finalizeFixResult(state, config, options);
}

/**
 * @param {string} text
 * @param {ConfigObject|ConfigObject[]} config
 * @param {VerifyAndFixOptions} options
 * @returns {VerifyAndFixState}
 */
function createVerifyAndFixState(text, config, options) {
	const normalizedOptions = normalizeVerifyAndFixOptions(options);
	const slots = internalSlotsMap.get(this);
	
	if (normalizedOptions.stats) {
		delete slots.times;
		slots.fixPasses = 0;
	}
	
	return {
		text,
		currentText: text,
		previousText: "",
		secondPreviousText: "",
		fixed: false,
		passNumber: 0,
		maxPasses: MAX_AUTOFIX_PASSES,
		shouldFix: normalizedOptions.fix !== false,
		stats: normalizedOptions.stats || false,
		slots,
		debugTextDescription: normalizedOptions.filename || `${text.slice(0, 10)}...`,
	};
}

/**
 * @param {VerifyAndFixOptions} options
 * @returns {VerifyAndFixOptions}
 */
function normalizeVerifyAndFixOptions(options) {
	return {
		filename: typeof options === "string" ? options : (options?.filename || ""),
		fix: typeof options?.fix !== "undefined" ? options.fix : true,
		stats: options?.stats || false,
	};
}

/**
 * @param {VerifyAndFixState} state
 * @returns {boolean}
 */
function shouldContinueFixing(state) {
	return state.passNumber < state.maxPasses;
}

/**
 * @param {VerifyAndFixState} state
 * @param {ConfigObject|ConfigObject[]} config
 * @param {VerifyAndFixOptions} options
 * @returns {void}
 */
function executeFixPass(state, config, options) {
	state.passNumber++;
	
	if (state.stats) {
		startTime();
	}
	
	debug(`Linting code for ${state.debugTextDescription} (pass ${state.passNumber})`);
	const messages = this.verify(state.currentText, config, options);
	
	debug(`Generating fixed text for ${state.debugTextDescription} (pass ${state.passNumber})`);
	
	if (state.stats) {
		startTime();
	}
	
	const fixedResult = SourceCodeFixer.applyFixes(
		state.currentText,
		messages,
		state.shouldFix,
	);
	
	if (state.stats) {
		if (fixedResult.fixed) {
			storeTime(endTime(), { type: "fix" }, state.slots);
			state.slots.fixPasses++;
		} else {
			storeTime(0, { type: "fix" }, state.slots);
		}
	}
	
	if (messages.length === 1 && messages[0].fatal) {
		state.passNumber = state.maxPasses;
		return;
	}
	
	state.fixed = state.fixed || fixedResult.fixed;
	state.secondPreviousText = state.previousText;
	state.previousText = state.currentText;
	state.currentText = fixedResult.output;
	
	if (state.stats) {
		state.slots.times.passes.at(-1).total = endTime();
	}
	
	if (state.passNumber > 1 && 
		state.currentText.length === state.secondPreviousText.length && 
		state.currentText === state.secondPreviousText) {
		debug(`Circular fixes detected after pass ${state.passNumber}. Exiting fix loop.`);
		state.slots.warningService.emitCircularFixesWarning(
			options.filename ?? "text",
		);
		state.passNumber = state.maxPasses;
	}
}

/**
 * @param {VerifyAndFixState} state
 * @param {ConfigObject|ConfigObject[]} config
 * @param {VerifyAndFixOptions} options
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}}
 */
function finalizeFixResult(state, config, options) {
	if (state.fixed) {
		if (state.stats) {
			startTime();
		}
		
		const finalMessages = this.verify(state.currentText, config, options);
		
		if (state.stats) {
			storeTime(0, { type: "fix" }, state.slots);
			state.slots.times.passes.at(-1).total = endTime();
		}
		
		return {
			fixed: state.fixed,
			messages: finalMessages,
			output: state.currentText,
		};
	}
	
	return {
		fixed: state.fixed,
		messages: [],
		output: state.currentText,
	};
}

/**
 * @param {string} text
 * @param {ConfigObject|ConfigObject[]} config
 * @param {string|(VerifyOptions&ProcessorOptions&FixOptions)} [filenameOrOptions]
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}}
 */
Linter.prototype.verifyAndFix = function(text, config, filenameOrOptions) {
	return verifyAndFix.call(this, text, config, filenameOrOptions);
};