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
    const stats = options.stats;
    const slots = internalSlotsMap.get(this);

    // Remove lint times from the last run.
    if (stats) {
        delete slots.times;
        slots.fixPasses = 0;
    }

    const result = performFixLoop(text, config, options, slots, stats);
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
 * Perform the fix loop.
 * @param {string} text The source text to apply fixes to.
 * @param {ConfigObject|ConfigObject[]} config The ESLint config object or array to use.
 * @param {VerifyOptions&ProcessorOptions&FixOptions} options The options.
 * @param {LinterInternalSlots} slots The internal slots.
 * @param {boolean} stats Whether to collect stats.
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}} The result of the fix operation.
 */
function performFixLoop(text, config, options, slots, stats) {
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

        if (stats) {
            if (fixedResult && fixedResult.fixed) {
                const time = endTime(tTotal);

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
        fixed = fixed || (fixedResult && fixedResult.fixed);

        // update to use the fixed output instead of the original text
        secondPreviousText = previousText;
        previousText = currentText;
        currentText = fixedResult ? fixedResult.output : text;

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
            slots.warningService.emitCircularFixesWarning(
                options.filename ?? "text",
            );
            break;
        }

        fixedResult = applyFixes(currentText, messages, shouldFix, stats, slots);
    } while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

    // If the last result had fixes, we need to lint again to be sure we have
    // the most up-to-date information.
    if (fixedResult.fixed) {
        messages = lintText(currentText, config, options, slots, stats);
    }

    // ensure the last result properly reflects if fixes were done
    fixedResult.fixed = fixed;
    fixedResult.output = currentText;

    return fixedResult;
}

/**
 * Lint the text.
 * @param {string} text The source text to lint.
 * @param {ConfigObject|ConfigObject[]} config The ESLint config object or array to use.
 * @param {VerifyOptions&ProcessorOptions&FixOptions} options The options.
 * @param {LinterInternalSlots} slots The internal slots.
 * @param {boolean} stats Whether to collect stats.
 * @returns {LintMessage[]} The lint messages.
 */
function lintText(text, config, options, slots, stats) {
    const debugTextDescription =
        options.filename || `${text.slice(0, 10)}...`;
    debug(`Linting code for ${debugTextDescription}`);

    return this.verify(text, config, options);
}

/**
 * Apply fixes to the text.
 * @param {string} text The source text to apply fixes to.
 * @param {LintMessage[]} messages The lint messages.
 * @param {boolean} shouldFix Whether fixes should be applied.
 * @param {boolean} stats Whether to collect stats.
 * @param {LinterInternalSlots} slots The internal slots.
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}} The result of the fix operation.
 */
function applyFixes(text, messages, shouldFix, stats, slots) {
    let t;

    if (stats) {
        t = startTime();
    }

    const result = SourceCodeFixer.applyFixes(text, messages, shouldFix);

    if (stats) {
        if (result.fixed) {
            const time = endTime(t);

            storeTime(time, { type: "fix" }, slots);
            slots.fixPasses++;
        } else {
            storeTime(0, { type: "fix" }, slots);
        }
    }

    return result;
}