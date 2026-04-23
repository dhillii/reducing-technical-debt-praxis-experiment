} while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

		/*
		 * If the last result had fixes, we need to lint again to be sure we have
		 * the most up-to-date information.
		 */
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

		// ensure the last result properly reflects if fixes were done
		fixedResult.fixed = fixed;
		fixedResult.output = currentText;

		return fixedResult;
	}
}