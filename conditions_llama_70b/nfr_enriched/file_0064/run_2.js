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

    const result = performFixLoop(text, config, options, slots, stats, shouldFix);

    return result;
}

/**
 * Gets the options for verifyAndFix.
 * @param {string|(VerifyOptions&ProcessorOptions&FixOptions)} [filenameOrOptions] The filename or ESLint options object to use.
 * @returns {VerifyOptions&ProcessorOptions&FixOptions} The options.
 */
function getOptions(filenameOrOptions) {
    return typeof filenameOrOptions === "string"
        ? { filename: filenameOrOptions }
        : filenameOrOptions || {};
}

/**
 * Gets the shouldFix value for verifyAndFix.
 * @param {VerifyOptions&ProcessorOptions&FixOptions} options The options.
 * @returns {boolean} The shouldFix value.
 */
function getShouldFix(options) {
    return typeof options.fix !== "undefined" ? options.fix : true;
}

/**
 * Performs the fix loop.
 * @param {string} text The source text to apply fixes to.
 * @param {ConfigObject|ConfigObject[]} config The ESLint config object or array to use.
 * @param {VerifyOptions&ProcessorOptions&FixOptions} options The options.
 * @param {LinterInternalSlots} slots The internal slots.
 * @param {boolean} stats Whether to collect stats.
 * @param {boolean} shouldFix Whether to apply fixes.
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}} The result of the fix operation.
 */
function performFixLoop(text, config, options, slots, stats, shouldFix) {
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

        let t;

        if (stats) {
            t = startTime();
        }

        fixedResult = applyFixes(currentText, messages, shouldFix);

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
            slots.warningService.emitCircularFixesWarning(
                options.filename ?? "text",
            );
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

        fixedResult.messages = lintText(currentText, config, options, slots, stats);

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

/**
 * Lints the text.
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
 * Applies fixes to the text.
 * @param {string} text The source text to apply fixes to.
 * @param {LintMessage[]} messages The lint messages.
 * @param {boolean} shouldFix Whether to apply fixes.
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}} The result of the fix operation.
 */
function applyFixes(text, messages, shouldFix) {
    return SourceCodeFixer.applyFixes(text, messages, shouldFix);
}