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

    const autofixLoop = () => {
        let currentText = text;
        let passNumber = 0;
        let fixed = false;

        do {
            passNumber++;
            const messages = this.verify(currentText, config, options);
            const fixedResult = SourceCodeFixer.applyFixes(currentText, messages, shouldFix);

            if (stats) {
                if (fixedResult.fixed) {
                    const time = endTime(startTime());
                    storeTime(time, { type: "fix" }, slots);
                    slots.fixPasses++;
                } else {
                    storeTime(0, { type: "fix" }, slots);
                }
            }

            fixed = fixed || fixedResult.fixed;
            currentText = fixedResult.output;

            if (stats) {
                const passIndex = slots.times.passes.length - 1;
                slots.times.passes[passIndex].total = endTime(startTime());
            }

            if (
                passNumber > 1 &&
                currentText.length === text.length &&
                currentText === text
            ) {
                debug(
                    `Circular fixes detected after pass ${passNumber}. Exiting fix loop.`,
                );
                slots.warningService.emitCircularFixesWarning(
                    options.filename ?? "text",
                );
                break;
            }
        } while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

        if (fixedResult.fixed) {
            fixedResult.messages = this.verify(currentText, config, options);
        }

        fixedResult.fixed = fixed;
        fixedResult.output = currentText;

        return fixedResult;
    };

    return autofixLoop();
}