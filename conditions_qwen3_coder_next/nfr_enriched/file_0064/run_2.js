const MAX_AUTOFIX_PASSES = 10;

/**
 * Applies fixes to text using the SourceCodeFixer, performing multiple passes until no more fixes can be applied or the maximum number of passes is reached.
 * @param {string} text The source text to apply fixes to.
 * @param {Config} config The ESLint config to use for verification.
 * @param {Object} options The options for verification and fixing.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots Internal slots map for the linter instance.
 * @returns {{fixed: boolean, messages: LintMessage[], output: string}} The result of the fix operation.
 */
function applyFixesUntilStable(text, config, options, slots) {
	let fixed = false;
	let currentText = text;
	let passNumber = 0;
	let previousText, secondPreviousText;
	const debugTextDescription = options.filename || `${text.slice(0, 10)}...`;
	const shouldFix = typeof options.fix !== "undefined" ? options.fix : true;
	const stats = options?.stats;

	if (stats) {
		delete slots.times;
		slots.fixPasses = 0;
	}

	while (passNumber < MAX_AUTOFIX_PASSES) {
		passNumber++;
		let tTotal;

		if (stats) {
			tTotal = startTime();
		}

		debug(`Linting code for ${debugTextDescription} (pass ${passNumber})`);
		const messages = linterVerify(currentText, config, options, slots);

		debug(`Generating fixed text for ${debugTextDescription} (pass ${passNumber})`);
		let t;

		if (stats) {
			t = startTime();
		}

		const fixedResult = SourceCodeFixer.applyFixes(currentText, messages, shouldFix);

		if (stats) {
			if (fixedResult.fixed) {
				const time = endTime(t);
				storeTime(time, { type: "fix" }, slots);
				slots.fixPasses++;
			} else {
				storeTime(0, { type: "fix" }, slots);
			}
		}

		if (messages.length === 1 && messages[0].fatal) {
			break;
		}

		fixed = fixed || fixedResult.fixed;

		secondPreviousText = previousText;
		previousText = currentText;
		currentText = fixedResult.output;

		if (stats) {
			tTotal = endTime(tTotal);
			const passIndex = slots.times.passes.length - 1;
			slots.times.passes[passIndex].total = tTotal;
		}

		if (passNumber > 1 && currentText.length === secondPreviousText.length && currentText === secondPreviousText) {
			debug(`Circular fixes detected after pass ${passNumber}. Exiting fix loop.`);
			slots.warningService.emitCircularFixesWarning(options.filename ?? "text");
			break;
		}

		if (!fixedResult.fixed) {
			break;
		}
	}

	if (fixed) {
		let tTotal;

		if (stats) {
			tTotal = startTime();
		}

		const finalMessages = linterVerify(currentText, config, options, slots);

		if (stats) {
			storeTime(0, { type: "fix" }, slots);
			slots.times.passes.at(-1).total = endTime(tTotal);
		}

		return {
			fixed,
			messages: finalMessages,
			output: currentText,
		};
	}

	return {
		fixed,
		messages: [],
		output: currentText,
	};
}

/**
 * Verifies the given text using the linter's verify method.
 * @param {string} text The source text to verify.
 * @param {Config} config The ESLint config to use.
 * @param {Object} options The verification options.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots Internal slots map for the linter instance.
 * @returns {LintMessage[]} The linting messages.
 */
function linterVerify(text, config, options, slots) {
	return Linter.prototype.verify.call({ internalSlotsMap: slots }, text, config, options);
}

/**
 * Performs multiple autofix passes over the text until as many fixes as possible have been applied.
 * @param {string} text The source text to apply fixes to.
 * @param {ConfigObject|ConfigObject[]} config The ESLint config object or array to use.
 * @param {string|(VerifyOptions&ProcessorOptions&FixOptions)} [filenameOrOptions] The filename or ESLint options object to use.
 * @returns {{fixed: boolean, messages: LintMessage[], output: string}} The result of the fix operation.
 */
verifyAndFix(text, config, filenameOrOptions) {
	const options =
		typeof filenameOrOptions === "string"
			? { filename: filenameOrOptions }
			: filenameOrOptions || {};

	const slots = internalSlotsMap.get(this);

	return applyFixesUntilStable(text, config, options, slots);
}