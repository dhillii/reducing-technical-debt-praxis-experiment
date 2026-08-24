class FixLoopContext {
    constructor(
        text,
        config,
        filenameOrOptions,
        slots,
        debugTextDescription,
        shouldFix,
        stats
    ) {
        this.text = text;
        this.config = config;
        this.filenameOrOptions = filenameOrOptions;
        this.slots = slots;
        this.debugTextDescription = debugTextDescription;
        this.shouldFix = shouldFix;
        this.stats = stats;
        this.messages = [];
        this.fixedResult = {};
        this.fixed = false;
        this.passNumber = 0;
        this.currentText = text;
        this.secondPreviousText = "";
        this.previousText = "";
    }

    incrementPassNumber() {
        this.passNumber++;
    }

    storePreviousTexts() {
        this.secondPreviousText = this.previousText;
        this.previousText = this.currentText;
    }

    shouldContinueFixing() {
        return (
            this.fixedResult.fixed &&
            this.passNumber < MAX_AUTOFIX_PASSES
        );
    }
}

/**
 * @param {string} text
 * @param {ConfigObject|ConfigObject[]} config
 * @param {string|(VerifyOptions&ProcessorOptions&FixOptions)} [filenameOrOptions]
 * @returns {{fixed:boolean,messages:LintMessage[],output:string}}
 */
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

    const context = new FixLoopContext(
        text,
        config,
        filenameOrOptions,
        slots,
        debugTextDescription,
        shouldFix,
        stats
    );

    do {
        context.incrementPassNumber();
        context.messages = this.verify(context.currentText, config, options);

        context.fixedResult = this.#runFixPhase(context);

        context.storePreviousTexts();
        context.currentText = context.fixedResult.output;

        context.fixed = context.fixed || context.fixedResult.fixed;

        if (this.#shouldStopFixing(context)) {
            break;
        }
    } while (context.shouldContinueFixing());

    this.#finalizeFixResult(context);

    return context.fixedResult;
}

/**
 * @param {FixLoopContext} context
 * @returns {Object} fixedResult
 */
Linter.prototype.#runFixPhase = function (context) {
    const { stats, slots, currentText, messages, shouldFix } = context;

    let t;
    let fixedResult;

    if (stats) {
        t = startTime();
    }

    fixedResult = SourceCodeFixer.applyFixes(
        currentText,
        messages,
        shouldFix
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

    return fixedResult;
};

/**
 * @param {FixLoopContext} context
 * @returns {boolean}
 */
Linter.prototype.#shouldStopFixing = function (context) {
    const { messages, passNumber, fixedResult, currentText, secondPreviousText } =
        context;
    const { slots, debugTextDescription, filenameOrOptions } = context;

    // stop if there are any syntax errors.
    if (messages.length === 1 && messages[0].fatal) {
        return true;
    }

    // Stop if we've made a circular fix
    if (
        passNumber > 1 &&
        currentText.length === secondPreviousText.length &&
        currentText === secondPreviousText
    ) {
        debug(
            `Circular fixes detected after pass ${passNumber}. Exiting fix loop.`,
        );
        slots.warningService.emitCircularFixesWarning(
            options.filename ?? "text"
        );
        return true;
    }

    return false;
};

/**
 * @param {FixLoopContext} context
 * @returns {void}
 */
Linter.prototype.#finalizeFixResult = function (context) {
    const { stats, slots, fixedResult, currentText, fixed } = context;

    // ensure the last result properly reflects if fixes were done
    if (fixedResult.fixed) {
        let tTotal;

        if (stats) {
            tTotal = startTime();
        }

        fixedResult.messages = this.verify(currentText, this.config, context.filenameOrOptions);

        if (stats) {
            storeTime(0, { type: "fix" }, slots);
            slots.times.passes.at(-1).total = endTime(tTotal);
        }
    }

    fixedResult.fixed = fixed;
    fixedResult.output = currentText;
};