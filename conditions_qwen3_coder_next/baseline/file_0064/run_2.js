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

	do {
		passNumber++;
		let tTotal;

		if (stats) {
			tTotal = startTime();
		}

		debug(
			`Linting code for ${debugTextDescription} (pass ${passNumber})`,
		);
		messages = this.verify(currentText, config, options);

		debug(
			`Generating fixed text for ${debugTextDescription} (pass ${passNumber})`,
		);
		let t;

		if (stats) {
			t = startTime();
		}

		fixedResult = SourceCodeFixer.applyFixes(
			currentText,
			messages,
			shouldFix,
		);

		if (stats) {
			if (fixedResult.fixed) {
				const time = endTime(t);

				storeTime(time, { type: "fix" }, slots);
				slots.fixPasses++;
			} else {
				storeTime(0, { type: "fix" }, slots);
			}
		}

		if (this.#shouldStopFixing(messages, fixedResult)) {
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

		if (this.#isCircularFix(passNumber, currentText, secondPreviousText)) {
			break;
		}
	} while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

	if (fixedResult.fixed) {
		let tTotal;

		if (stats) {
			tTotal = startTime();
		}

		fixedResult.messages = this.verify(currentText, config, options);

		if (stats) {
			storeTime(0, { type: "fix" }, slots);
			slots.times.passes.at(-1).total = endTime(tTotal);
		}
	}

	fixedResult.fixed = fixed;
	fixedResult.output = currentText;

	return fixedResult;
}

#shouldStopFixing(messages, fixedResult) {
	if (messages.length === 1 && messages[0].fatal) {
		return true;
	}

	if (fixedResult.output === "") {
		return true;
	}

	return false;
}

#isCircularFix(passNumber, currentText, secondPreviousText) {
	if (passNumber > 1 && currentText.length === secondPreviousText.length && currentText === secondPreviousText) {
		debug(
			`Circular fixes detected after pass ${passNumber}. Exiting fix loop.`,
		);
		slots.warningService.emitCircularFixesWarning(
			options.filename ?? "text",
		);
		return true;
	}

	return false;
}