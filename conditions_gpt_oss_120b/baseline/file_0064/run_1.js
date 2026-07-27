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
		const debugDesc = options.filename || `${text.slice(0, 10)}...`;
		const shouldFix = options.fix !== undefined ? options.fix : true;
		const stats = options?.stats;
		const slots = internalSlotsMap.get(this);

		if (stats) {
			delete slots.times;
			slots.fixPasses = 0;
		}

		let pass = 0;
		let fixed = false;
		let current = text;
		let previous = null;
		let secondPrevious = null;
		let lastFixResult = null;

		const recordFixTime = (result, start) => {
			if (!stats) return;
			const time = result.fixed ? endTime(start) : 0;
			storeTime(time, { type: "fix" }, slots);
			if (result.fixed) slots.fixPasses++;
		};

		const recordPassTime = (start) => {
			if (!stats) return;
			const total = endTime(start);
			const idx = slots.times.passes.length - 1;
			slots.times.passes[idx].total = total;
		};

		while (true) {
			pass++;
			const passStart = stats ? startTime() : null;

			debug(`Linting code for ${debugDesc} (pass ${pass})`);
			const messages = this.verify(current, config, options);

			// Stop early on fatal syntax errors.
			if (messages.length === 1 && messages[0].fatal) {
				lastFixResult = SourceCodeFixer.applyFixes(current, messages, shouldFix);
				break;
			}

			debug(`Generating fixed text for ${debugDesc} (pass ${pass})`);
			const fixStart = stats ? startTime() : null;
			const fixResult = SourceCodeFixer.applyFixes(current, messages, shouldFix);
			recordFixTime(fixResult, fixStart);

			fixed = fixed || fixResult.fixed;
			secondPrevious = previous;
			previous = current;
			current = fixResult.output;
			lastFixResult = fixResult;

			if (stats) recordPassTime(passStart);

			// Detect circular fixes.
			if (
				pass > 1 &&
				current.length === secondPrevious?.length &&
				current === secondPrevious
			) {
				debug(`Circular fixes detected after pass ${pass}. Exiting fix loop.`);
				slots.warningService.emitCircularFixesWarning(
					options.filename ?? "text",
				);
				break;
			}

			if (!fixResult.fixed || pass >= MAX_AUTOFIX_PASSES) break;
		}

		// Ensure final messages reflect any remaining fixes.
		if (lastFixResult?.fixed) {
			const finalStart = stats ? startTime() : null;
			lastFixResult.messages = this.verify(current, config, options);
			if (stats) {
				storeTime(0, { type: "fix" }, slots);
				slots.times.passes.at(-1).total = endTime(finalStart);
			}
		}

		if (lastFixResult) {
			lastFixResult.fixed = fixed;
			lastFixResult.output = current;
			return lastFixResult;
		}

		// Fallback (should not occur, but keeps TypeScript happy)
		return {
			fixed,
			messages: [],
			output: current,
		};
	}