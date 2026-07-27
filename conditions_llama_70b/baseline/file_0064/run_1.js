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
    const shouldFix = typeof options.fix !== "undefined" ? options.fix : true;
    const stats = options?.stats;
    const slots = internalSlotsMap.get(this);
    const debugTextDescription = options.filename || `${text.slice(0, 10)}...`;

    // Remove lint times from the last run.
    if (stats) {
        delete slots.times;
        slots.fixPasses = 0;
    }

    let currentText = text;
    let passNumber = 0;
    let fixed = false;

    const fixLoop = () => {
        passNumber++;
        let tTotal;

        if (stats) {
            tTotal = startTime();
        }

        debug(`Linting code for ${debugTextDescription} (pass ${passNumber})`);
        const messages = this.verify(currentText, config, options);

        debug(`Generating fixed text for ${debugTextDescription} (pass ${passNumber})`);
        let t;

        if (stats) {
            t = startTime();
        }

        const fixedResult = SourceCodeFixer.applyFixes(currentText, messages, shouldFix);

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
            return fixedResult;
        }

        // keep track if any fixes were ever applied - important for return value
        fixed = fixed || fixedResult.fixed;

        // update to use the fixed output instead of the original text
        currentText = fixedResult.output;

        if (stats) {
            tTotal = endTime(tTotal);
            const passIndex = slots.times.passes.length - 1;

            slots.times.passes[passIndex].total = tTotal;
        }

        // Stop if we've made a circular fix
        if (passNumber > 1 && currentText.length === text.length && currentText === text) {
            debug(`Circular fixes detected after pass ${passNumber}. Exiting fix loop.`);
            slots.warningService.emitCircularFixesWarning(options.filename ?? "text");
            return fixedResult;
        }

        if (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES) {
            return fixLoop();
        }

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
    };

    return fixLoop();
}