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
    const debugTextDescription = getDebugTextDescription(options, text);

    // Remove lint times from the last run.
    if (stats) {
        delete slots.times;
        slots.fixPasses = 0;
    }

    let currentText = text;
    let passNumber = 0;
    let fixed = false;
    let secondPreviousText;
    let previousText;

    do {
        passNumber++;
        const lintResult = lintCode(currentText, config, options, slots, stats, debugTextDescription, passNumber);
        const fixedResult = applyFixes(lintResult, shouldFix, slots, stats, debugTextDescription, passNumber);

        // keep track if any fixes were ever applied - important for return value
        fixed = fixed || fixedResult.fixed;

        // update to use the fixed output instead of the original text
        secondPreviousText = previousText;
        previousText = currentText;
        currentText = fixedResult.output;

        // Stop if we've made a circular fix
        if (isCircularFix(secondPreviousText, currentText, passNumber, slots, options)) {
            break;
        }
    } while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

    // If the last result had fixes, we need to lint again to be sure we have
    // the most up-to-date information.
    if (fixedResult.fixed) {
        const lintResult = lintCode(currentText, config, options, slots, stats, debugTextDescription, passNumber);
        fixedResult.messages = lintResult.messages;
    }

    // ensure the last result properly reflects if fixes were done
    fixedResult.fixed = fixed;
    fixedResult.output = currentText;

    return fixedResult;
}

// Extracted function to get options
function getOptions(filenameOrOptions) {
    return typeof filenameOrOptions === "string"
        ? { filename: filenameOrOptions }
        : filenameOrOptions || {};
}

// Extracted function to get shouldFix
function getShouldFix(options) {
    return typeof options.fix !== "undefined" ? options.fix : true;
}

// Extracted function to get debugTextDescription
function getDebugTextDescription(options, text) {
    return options.filename || `${text.slice(0, 10)}...`;
}

// Extracted function to lint code
function lintCode(currentText, config, options, slots, stats, debugTextDescription, passNumber) {
    let tTotal;

    if (stats) {
        tTotal = startTime();
    }

    debug(`Linting code for ${debugTextDescription} (pass ${passNumber})`);
    const messages = this.verify(currentText, config, options);

    if (stats) {
        const time = endTime(tTotal);
        storeTime(time, { type: "lint" }, slots);
    }

    return { messages };
}

// Extracted function to apply fixes
function applyFixes(lintResult, shouldFix, slots, stats, debugTextDescription, passNumber) {
    let t;

    if (stats) {
        t = startTime();
    }

    debug(`Generating fixed text for ${debugTextDescription} (pass ${passNumber})`);
    const fixedResult = SourceCodeFixer.applyFixes(lintResult.messages, shouldFix);

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

// Extracted function to check for circular fix
function isCircularFix(secondPreviousText, currentText, passNumber, slots, options) {
    if (passNumber > 1 && currentText.length === secondPreviousText.length && currentText === secondPreviousText) {
        debug(`Circular fixes detected after pass ${passNumber}. Exiting fix loop.`);
        slots.warningService.emitCircularFixesWarning(options.filename ?? "text");
        return true;
    }
    return false;
}