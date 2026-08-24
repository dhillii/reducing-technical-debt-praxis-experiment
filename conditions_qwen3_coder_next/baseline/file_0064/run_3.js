verifyAndFix(text, config, filenameOrOptions) {
	let messages,
		fixedResult,
		fixed = false,
		passNumber = 0,
		currentText = text,
		secondPreviousText,
		previousText;
	const options =
		typeof filenameOrOptions === "string"
			? { filename: filenameOrOptions }
			: filenameOrOptions || {};
	const debugTextDescription =
		options.filename || `${text.slice(0, 10)}...`;
	const shouldFix =
		typeof options.fix !== "undefined" ? options.fix : true;
	const stats = options?.stats;

	const slots = internalSlotsMap.get(this);

	if (stats) {
		delete slots.times;
		slots.fixPasses = 0;
	}

	const shouldContinueProcessing = () =>
		fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES;

	const shouldStopOnSyntaxError = () =>
		messages.length === 1 && messages[0].fatal;

	const handleCircularFix = () => {
		slots.warningService.emitCircularFixesWarning(
			options.filename ?? "text",
		);
		return true;
	};

	const isCircularFix = () => {
		if (
			passNumber <= 1 ||
			currentText.length !== secondPreviousText.length ||
			currentText !== secondPreviousText
		) {
			return false;
		}

		return handleCircularFix();
	};

	const updateTextHistory = () => {
		secondPreviousText = previousText;
		previousText = currentText;
		currentText = fixedResult.output;
	};

	const runVerify = () => {
		if (stats) {
			timing.startTime();
		}

		messages = this.verify(currentText, config, options);

		debug(
			`Linting code for ${debugTextDescription} (pass ${passNumber})`,
		);

		if (stats) {
			storeTime(
				timing.endTime(),
				{ type: "lint", key: "verify" },
				slots,
			);
		}
	};

	const applyFixes = () => {
		if (stats) {
			timing.startTime();
		}

		fixedResult = SourceCodeFixer.applyFixes(
			currentText,
			messages,
			shouldFix,
		);

		if (stats) {
			const time = timing.endTime();
			if (fixedResult.fixed) {
				storeTime(time, { type: "fix" }, slots);
				slots.fixPasses++;
			} else {
				storeTime(0, { type: "fix" }, slots);
			}
		}
	};

	const processPass = () => {
		passNumber++;
		runVerify();

		if (shouldStopOnSyntaxError()) {
			return false;
		}

		applyFixes();
		fixed = fixed || fixedResult.fixed;
		updateTextHistory();

		if (isCircularFix()) {
			return false;
		}

		return shouldContinueProcessing();
	};

	while (processPass()) {}

	if (fixedResult.fixed) {
		if (stats) {
			timing.startTime();
		}

		fixedResult.messages = this.verify(currentText, config, options);

		if (stats) {
			storeTime(0, { type: "fix" }, slots);
			if (slots.times?.passes) {
				slots.times.passes.at(-1).total = timing.endTime();
			}
		}
	}

	fixedResult.fixed = fixed;
	fixedResult.output = currentText;

	return fixedResult;
}