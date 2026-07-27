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
    const options = getOptions(filenameOrOptions);
    const shouldFix = getShouldFix(options);
    const stats = options?.stats;
    const slots = internalSlotsMap.get(this);

    // Remove lint times from the last run.
    if (stats) {
        delete slots.times;
        slots.fixPasses = 0;
    }

    const result = performAutofixPasses(text, config, options, slots, stats, shouldFix);
    return result;
}

/**
 * Get options from filenameOrOptions.
 * @param {string|(VerifyOptions&ProcessorOptions&FixOptions)} filenameOrOptions The filename or ESLint options object to use.
 * @returns {VerifyOptions&ProcessorOptions&FixOptions} The options.
 */
function getOptions(filenameOrOptions) {
    return typeof filenameOrOptions === "string"
        ? { filename: filenameOrOptions }
        : filenameOrOptions || {};
}

/**
 * Get shouldFix from options.
 * @param {VerifyOptions&ProcessorOptions&FixOptions} options The options.
 * @returns {boolean} Whether fixes should be applied.
 */
function getShouldFix(options) {
    return typeof options.fix !== "undefined" ? options.fix : true;
}

/**
 * Perform autofix passes.
 * @param {string} text The source text to apply fixes to.
 * @param {ConfigObject|ConfigObject[]} config The ESLint config object or array to use.
 * @param {VerifyOptions&ProcessorOptions&FixOptions} options The options.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots The internal slots map.
 * @param {boolean} stats Whether to collect stats.
 * @param {boolean} shouldFix Whether fixes should be applied.
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}} The result of the fix operation.
 */
function performAutofixPasses(text, config, options, slots, stats, shouldFix) {
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

        messages = lintText(currentText, config, options, slots, stats);
        fixedResult = applyFixes(currentText, messages, shouldFix, slots, stats);

        if (stats) {
            if (fixedResult.fixed) {
                const time = endTime(tTotal);

                storeTime(time, { type: "fix" }, slots);
                slots.fixPasses++;
            } else {
                storeTime(0, { type: "fix" }, slots);
            }
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

        if (
            passNumber > 1 &&
            currentText.length === secondPreviousText.length &&
            currentText === secondPreviousText
        ) {
            slots.warningService.emitCircularFixesWarning(
                options.filename ?? "text",
            );
            break;
        }
    } while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

    if (fixedResult.fixed) {
        let tTotal;

        if (stats) {
            tTotal = startTime();
        }

        fixedResult.messages = lintText(currentText, config, options, slots, stats);

        if (stats) {
            storeTime(0, { type: "fix" }, slots);
            slots.times.passes.at(-1).total = endTime(tTotal);
        }
    }

    fixedResult.fixed = fixed;
    fixedResult.output = currentText;

    return fixedResult;
}

/**
 * Lint text.
 * @param {string} text The source text to lint.
 * @param {ConfigObject|ConfigObject[]} config The ESLint config object or array to use.
 * @param {VerifyOptions&ProcessorOptions&FixOptions} options The options.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots The internal slots map.
 * @param {boolean} stats Whether to collect stats.
 * @returns {LintMessage[]} The lint messages.
 */
function lintText(text, config, options, slots, stats) {
    return this.verify(text, config, options);
}

/**
 * Apply fixes.
 * @param {string} text The source text to apply fixes to.
 * @param {LintMessage[]} messages The lint messages.
 * @param {boolean} shouldFix Whether fixes should be applied.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots The internal slots map.
 * @param {boolean} stats Whether to collect stats.
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}} The result of the fix operation.
 */
function applyFixes(text, messages, shouldFix, slots, stats) {
    let t;

    if (stats) {
        t = startTime();
    }

    const fixedResult = SourceCodeFixer.applyFixes(text, messages, shouldFix);

    if (stats) {
        if (fixedResult.fixed) {
            const time = endTime(t);

            storeTime(time, { type: "fix" }, slots);
            slots.fixPasses++;
        } else {
            storeTime(0, { type: "fix" }, slots);
        }
    }

    return fixedResult;
}