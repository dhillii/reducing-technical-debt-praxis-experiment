verifyAndFix(text, config, filenameOrOptions) {
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

		let currentText = text;
		let previousText, secondPreviousText;
		let fixed = false;
		let passNumber = 0;
		let messages, fixedResult;

		const runPass = () => {
			passNumber++;
			const tTotal = stats ? startTime() : null;

			debug(
				`Linting code for ${debugTextDescription} (pass ${passNumber})`,
			);
			messages = this.verify(currentText, config, options);

			debug(
				`Generating fixed text for ${debugTextDescription} (pass ${passNumber})`,
			);
			const t = stats ? startTime() : null;
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

			if (messages.length === 1 && messages[0].fatal) {
				return false;
			}

			fixed = fixed || fixedResult.fixed;
			secondPreviousText = previousText;
			previousText = currentText;
			currentText = fixedResult.output;

			if (stats) {
				const time = endTime(tTotal);
				const passIndex = slots.times.passes.length - 1;
				slots.times.passes[passIndex].total = time;
			}

			if (
				passNumber > 1 &&
				currentText === secondPreviousText &&
				currentText.length === secondPreviousText.length
			) {
				debug(
					`Circular fixes detected after pass ${passNumber}. Exiting fix loop.`,
				);
				slots.warningService.emitCircularFixesWarning(
					options.filename ?? "text",
				);
				return false;
			}

			return fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES;
		};

		while (runPass()) {}

		if (fixedResult.fixed) {
			const tTotal = stats ? startTime() : null;
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