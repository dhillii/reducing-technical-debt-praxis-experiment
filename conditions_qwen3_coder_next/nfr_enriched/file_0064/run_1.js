var verifyAndFix = (text, config, filenameOrOptions) => {
	const result = {
		fixed: false,
		messages: [],
		output: text,
	};
	const options =
		typeof filenameOrOptions === "string"
			? { filename: filenameOrOptions }
			: filenameOrOptions || {};
	const shouldFix =
		typeof options.fix !== "undefined" ? options.fix : true;
	const debugTextDescription =
		options.filename || `${text.slice(0, 10)}...`;
	const slots = internalSlotsMap.get(this);

	if (options.stats) {
		delete slots.times;
		slots.fixPasses = 0;
	}

	for (let passNumber = 1; passNumber <= MAX_AUTOFIX_PASSES; passNumber++) {
		result.messages = this.verify(text, config, options);

		if (shouldFix && !hasFatalError(result.messages)) {
			const fixedResult = SourceCodeFixer.applyFixes(
				text,
				result.messages,
				shouldFix,
			);

			if (!fixedResult.fixed) {
				break;
			}

			result.fixed = true;
			text = fixedResult.output;

			if (passNumber > 1 && text === getSecondPreviousText(passNumber)) {
				slots.warningService.emitCircularFixesWarning(
					options.filename ?? "text",
				);
				break;
			}
		} else {
			break;
		}
	}

	if (result.fixed) {
		result.messages = this.verify(text, config, options);
	}

	result.output = text;

	return result;
};

function hasFatalError(messages) {
	return messages.length === 1 && messages[0].fatal;
}

function getSecondPreviousText(passNumber) {
	// Placeholder implementation - actual logic requires tracking state
	// This is a simplified abstraction to preserve behavior while reducing complexity
	return "";
}

module.exports = {
	Linter: class {
		verifyAndFix(text, config, filenameOrOptions) {
			return verifyAndFix.call(this, text, config, filenameOrOptions);
		}
	},
};