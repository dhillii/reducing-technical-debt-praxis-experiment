/**
 * Extracts fix options from the third argument of `verifyAndFix`.
 * @param {string|(VerifyOptions&ProcessorOptions&FixOptions)} [filenameOrOptions] The filename or options.
 * @returns {Object} Normalized options object.
 */
function extractFixOptions(filenameOrOptions) {
	const options =
		typeof filenameOrOptions === "string"
			? { filename: filenameOrOptions }
			: filenameOrOptions || {};
	return options;
}

/**
 * Executes a single autofix pass.
 * @param {Object} params Parameters for the pass.
 * @param {string} params.currentText The text to lint.
 * @param {ConfigObject|ConfigObject[]} params.config The ESLint config.
 * @param {Object} params.options Options object containing filename, fix, stats, etc.
 * @param {WeakMap<Linter, LinterInternalSlots>} params.slots Internal slots map.
 * @param {string} params.debugTextDescription Description used for debugging.
 * @returns {{messages: LintMessage[], fixedResult: any, nextText: string}} Result of the pass.
 */
function runFixPass({
	currentText,
	config,
	options,
	slots,
	debugTextDescription,
}) {
	const messages = this.verify(currentText, config, options);
	const shouldFix =
		typeof options.fix !== "undefined" ? options.fix : true;

	const fixedResult = SourceCodeFixer.applyFixes(
		currentText,
		messages,
		shouldFix,
	);

	if (options?.stats) {
		if (fixedResult.fixed) {
			const time = endTime(startTime());
			storeTime(time, { type: "fix" }, slots);
			slots.fixPasses = (slots.fixPasses ?? 0) + 1;
		} else {
			storeTime(0, { type: "fix" }, slots);
		}
	}

	return {
		messages,
		fixedResult,
		nextText: fixedResult.output,
	};
}

/**
 * Internal implementation of verifyAndFix using a parameter object.
 * @param {Object} params Parameters for the operation.
 * @param {string} params.text The source text.
 * @param {ConfigObject|ConfigObject[]} params.config The ESLint config.
 * @param {Object} params.options Options object containing filename, fix, stats, etc.
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}} Fix operation result.
 */
function _verifyAndFixInternal({ text, config, options }) {
	let messages,
		fixedResult,
		fixed = false,
		passNumber = 0,
		currentText = text,
		secondPreviousText,
		previousText;

	const debugTextDescription =
		options.filename || `${text.slice(0, 10)}...`;
	const slots = internalSlotsMap.get(this);

	// Remove lint times from the last run.
	if (options?.stats) {
		delete slots.times;
		slots.fixPasses = 0;
	}

	do {
		passNumber++;
		let tTotal;

		if (options?.stats) {
			tTotal = startTime();
		}

		debug(
			`Linting code for ${debugTextDescription} (pass ${passNumber})`,
		);
		const passResult = runFixPass.call(
			this,
			{
				currentText,
				config,
				options,
				slots,
				debugTextDescription,
			},
		);
		messages = passResult.messages;
		fixedResult = passResult.fixedResult;

		if (options?.stats) {
			tTotal = endTime(tTotal);
			const passIndex = slots.times.passes.length - 1;
			slots.times.passes[passIndex].total = tTotal;
		}

		// stop if there are any syntax errors.
		if (messages.length === 1 && messages[0].fatal) {
			break;
		}

		fixed = fixed || fixedResult.fixed;

		secondPreviousText = previousText;
		previousText = currentText;
		currentText = passResult.nextText;

		// Stop if we've made a circular fix
		if (
			passNumber > 1 &&
			currentText.length === secondPreviousText?.length &&
			currentText === secondPreviousText
		) {
			debug(
				`Circular fixes detected after pass ${passNumber}. Exiting fix loop.`,
			);
			slots.warningService.emitCircularFixesWarning(
				options.filename ?? "text",
			);
			break;
		}
	} while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

	// If the last result had fixes, lint again to get up‑to‑date messages.
	if (fixedResult?.fixed) {
		let tTotal;

		if (options?.stats) {
			tTotal = startTime();
		}

		fixedResult.messages = this.verify(currentText, config, options);

		if (options?.stats) {
			storeTime(0, { type: "fix" }, slots);
			slots.times.passes.at(-1).total = endTime(tTotal);
		}
	}

	// ensure the last result properly reflects if fixes were done
	fixedResult.fixed = fixed;
	fixedResult.output = currentText;

	return fixedResult;
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
	const options = extractFixOptions(filenameOrOptions);
	return _verifyAndFixInternal.call(this, { text, config, options });
}