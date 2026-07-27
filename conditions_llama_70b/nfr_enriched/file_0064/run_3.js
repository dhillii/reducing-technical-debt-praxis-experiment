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
    const options = this._normalizeVerifyAndFixOptions(filenameOrOptions);
    const shouldFix = this._shouldFix(options);
    const stats = options.stats;
    const slots = internalSlotsMap.get(this);

    // Remove lint times from the last run.
    if (stats) {
        delete slots.times;
        slots.fixPasses = 0;
    }

    const result = this._applyFixesRecursively(text, config, options, slots, shouldFix, stats);
    return result;
}

/**
 * Normalizes the options for verifyAndFix.
 * @param {string|(VerifyOptions&ProcessorOptions&FixOptions)} [filenameOrOptions] The filename or ESLint options object to use.
 * @returns {VerifyOptions&ProcessorOptions&FixOptions} The normalized options.
 */
_normalizeVerifyAndFixOptions(filenameOrOptions) {
    return typeof filenameOrOptions === "string"
        ? { filename: filenameOrOptions }
        : filenameOrOptions || {};
}

/**
 * Determines if fixes should be applied based on the options.
 * @param {VerifyOptions&ProcessorOptions&FixOptions} options The options to check.
 * @returns {boolean} True if fixes should be applied, false otherwise.
 */
_shouldFix(options) {
    return typeof options.fix !== "undefined" ? options.fix : true;
}

/**
 * Applies fixes recursively until no more fixes can be applied or the maximum number of passes is reached.
 * @param {string} text The source text to apply fixes to.
 * @param {ConfigObject|ConfigObject[]} config The ESLint config object or array to use.
 * @param {VerifyOptions&ProcessorOptions&FixOptions} options The options to use.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots The internal slots map.
 * @param {boolean} shouldFix Whether fixes should be applied.
 * @param {boolean} stats Whether to collect stats.
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}} The result of the fix operation.
 */
_applyFixesRecursively(text, config, options, slots, shouldFix, stats) {
    let messages,
        fixedResult,
        fixed = false,
        passNumber = 0,
        currentText = text,
        secondPreviousText,
        previousText;

    do {
        passNumber++;
        let tTotal;

        if (stats) {
            tTotal = startTime();
        }

        messages = this.verify(currentText, config, options);

        let t;

        if (stats) {
            t = startTime();
        }

        fixedResult = SourceCodeFixer.applyFixes(currentText, messages, shouldFix);

        if (stats) {
            if (fixedResult.fixed) {
                const time = endTime(t);

                storeTime(time, { type: "fix" }, slots);
                slots.fixPasses++;
            } else {
                storeTime(0, { type: "fix" }, slots);
            }
        }

        // stop if there are any syntax errors.
        // 'fixedResult.output' is a empty string.
        if (messages.length === 1 && messages[0].fatal) {
            break;
        }

        // keep track if any fixes were ever applied - important for return value
        fixed = fixed || fixedResult.fixed;

        // update to use the fixed output instead of the original text
        secondPreviousText = previousText;
        previousText = currentText;
        currentText = fixedResult.output;

        if (stats) {
            tTotal = endTime(tTotal);
            const passIndex = slots.times.passes.length - 1;

            slots.times.passes[passIndex].total = tTotal;
        }

        // Stop if we've made a circular fix
        if (
            passNumber > 1 &&
            currentText.length === secondPreviousText.length &&
            currentText === secondPreviousText
        ) {
            slots.warningService.emitCircularFixesWarning(options.filename ?? "text");
            break;
        }
    } while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

    // If the last result had fixes, we need to lint again to be sure we have
    // the most up-to-date information.
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