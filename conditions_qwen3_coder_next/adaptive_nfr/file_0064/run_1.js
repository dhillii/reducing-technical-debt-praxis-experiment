/**
 * @typedef {Object} FixOperationState
 * @property {string} currentText
 * @property {string} previousText
 * @property {string} secondPreviousText
 * @property {LintMessage[]} messages
 * @property {boolean} fixed
 * @property {number} passNumber
 * @property {Object} fixedResult
 */

/**
 * @typedef {Object} VerifyAndFixContext
 * @property {string} text
 * @property {ConfigObject|ConfigObject[]} config
 * @property {VerifyOptions&ProcessorOptions&FixOptions} options
 * @property {boolean} stats
 * @property {WeakMap<Linter, LinterInternalSlots>} slots
 * @property {string} debugTextDescription
 * @property {boolean} shouldFix
 * @property {WarningService} warningService
 */

/**
 * @param {VerifyAndFixContext} context
 * @returns {FixOperationState}
 */
function createInitialFixState(context) {
	return {
		currentText: context.text,
		previousText: "",
		secondPreviousText: "",
		messages: [],
		fixed: false,
		passNumber: 0,
		fixedResult: null,
	};
}

/**
 * @param {VerifyAndFixContext} context
 * @param {FixOperationState} state
 * @returns {boolean}
 */
function shouldContinueFixing(context, state) {
	return (
		state.fixedResult.fixed &&
		state.passNumber < MAX_AUTOFIX_PASSES
	);
}

/**
 * @param {VerifyAndFixContext} context
 * @param {FixOperationState} state
 */
function processFixPass(context, state) {
	state.passNumber++;
	state.messages = context.slots.linter.verify(
		state.currentText,
		context.config,
		context.options,
	);

	state.fixedResult = SourceCodeFixer.applyFixes(
		state.currentText,
		state.messages,
		context.shouldFix,
	);

	state.fixed = state.fixed || state.fixedResult.fixed;

	state.secondPreviousText = state.previousText;
	state.previousText = state.currentText;
	state.currentText = state.fixedResult.output;
}

/**
 * @param {VerifyAndFixContext} context
 * @param {FixOperationState} state
 * @returns {boolean}
 */
function hasCircularFix(context, state) {
	return (
		state.passNumber > 1 &&
		state.currentText.length === state.secondPreviousText.length &&
		state.currentText === state.secondPreviousText
	);
}

/**
 * @param {VerifyAndFixContext} context
 * @param {FixOperationState} state
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}}
 */
function finalizeFixResult(context, state) {
	const finalState = {
		...state,
	};

	if (state.fixedResult.fixed) {
		finalState.messages = context.slots.linter.verify(
			state.currentText,
			context.config,
			context.options,
		);
	}

	finalState.fixedResult.fixed = finalState.fixed;
	finalState.fixedResult.output = finalState.currentText;

	return finalState.fixedResult;
}

	/**
	 * Performs multiple autofix passes over the text until as many fixes as possible
	 * have been applied.
	 * @param {string} text The source text to apply fixes to.
	 * @param {ConfigObject|ConfigObject[]} config The ESLint config object or array to use.
	 * @param {string|(VerifyOptions&ProcessorOptions&FixOptions)} [filenameOrOptions] The filename or ESLint options object to use.
	 * @returns {{fixed:boolean,messages:LintMessage[],output:string}} The result of the fix operation as returned from the
	 *      SourceCodeFixer.
	 */
	verifyAndFix(text, config, filenameOrOptions) {
		const options =
			typeof filenameOrOptions === "string"
				? { filename: filenameOrOptions }
				: filenameOrOptions || {};
		const shouldFix =
			typeof options.fix !== "undefined" ? options.fix : true;
		const slots = internalSlotsMap.get(this);

		const context = {
			text,
			config,
			options,
			stats: options?.stats,
			slots: {
				linter: this,
				warningService: slots.warningService,
			},
			debugTextDescription: options.filename || `${text.slice(0, 10)}...`,
			shouldFix,
			warningService: slots.warningService,
		};

		// Remove lint times from the last run.
		if (context.stats) {
			delete slots.times;
			slots.fixPasses = 0;
		}

		let state = createInitialFixState(context);

		// Main fix loop
		do {
			processFixPass(context, state);

			if (hasCircularFix(context, state)) {
				debug(
					`Circular fixes detected after pass ${state.passNumber}. Exiting fix loop.`,
				);
				state.warningService.emitCircularFixesWarning(
					options.filename ?? "text",
				);
				break;
			}
		} while (shouldContinueFixing(context, state));

		return finalizeFixResult(context, state);
	}