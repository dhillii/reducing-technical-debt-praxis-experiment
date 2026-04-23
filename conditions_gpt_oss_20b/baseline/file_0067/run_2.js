const ignoredNodeListeners = options.ignoredNodes.reduce(
    (listeners, ignoredSelector) =>
        Object.assign(listeners, {
            [ignoredSelector]: addToIgnoredNodes,
        }),
    {},
);

/*
 * Join the listeners, and add a listener to verify that all tokens actually have the correct indentation
 * at the end.
 *
 * Using Object.assign will cause some offset listeners to be overwritten if the same selector also appears
 * in `ignoredNodeListeners`. This isn't a problem because all of the matching nodes will be ignored,
 * so those listeners wouldn't be called anyway.
 */
return Object.assign(offsetListeners, ignoredNodeListeners, {
    "*:exit"(node) {
        // If a node's type is nonstandard, we can't tell how its children should be offset, so ignore it.
        if (!KNOWN_NODES.has(node.type)) {
            addToIgnoredNodes(node);
        }
    },
    "Program:exit"() {
        // If ignoreComments option is enabled, ignore all comment tokens.
        if (options.ignoreComments) {
            sourceCode
                .getAllComments()
                .forEach(comment => offsets.ignoreToken(comment));
        }

        // Invoke the queued offset listeners for the nodes that aren't ignored.
        for (let i = 0; i < listenerCallQueue.length; i++) {
            const nodeInfo = listenerCallQueue[i];

            if (!ignoredNodes.has(nodeInfo.node)) {
                nodeInfo.listener(nodeInfo.node);
            }
        }

        // Update the offsets for ignored nodes to prevent their child tokens from being reported.
        ignoredNodes.forEach(ignoreNode);

        addParensIndent(sourceCode.ast.tokens);

        /*
         * Create a Map from (tokenOrComment) => (precedingToken).
         * This is necessary because sourceCode.getTokenBefore does not handle a comment as an argument correctly.
         */
        const precedingTokens = new WeakMap();

        for (let i = 0; i < sourceCode.ast.comments.length; i++) {
            const comment = sourceCode.ast.comments[i];

            const tokenOrCommentBefore = sourceCode.getTokenBefore(
                comment,
                { includeComments: true },
            );
            const hasToken = precedingTokens.has(tokenOrCommentBefore)
                ? precedingTokens.get(tokenOrCommentBefore)
                : tokenOrCommentBefore;

            precedingTokens.set(comment, hasToken);
        }

        for (let i = 1; i < sourceCode.lines.length + 1; i++) {
            if (!tokenInfo.firstTokensByLineNumber.has(i)) {
                // Don't check indentation on blank lines
                continue;
            }

            const firstTokenOfLine =
                tokenInfo.firstTokensByLineNumber.get(i);

            if (firstTokenOfLine.loc.start.line !== i) {
                // Don't check the indentation of multi-line tokens (e.g. template literals or block comments) twice.
                continue;
            }

            if (astUtils.isCommentToken(firstTokenOfLine)) {
                const tokenBefore =
                    precedingTokens.get(firstTokenOfLine);
                const tokenAfter = tokenBefore
                    ? sourceCode.getTokenAfter(tokenBefore)
                    : sourceCode.ast.tokens[0];
                const mayAlignWithBefore =
                    tokenBefore &&
                    !hasBlankLinesBetween(
                        tokenBefore,
                        firstTokenOfLine,
                    );
                const mayAlignWithAfter =
                    tokenAfter &&
                    !hasBlankLinesBetween(firstTokenOfLine, tokenAfter);

                /*
                 * If a comment precedes a line that begins with a semicolon token, align to that token, i.e.
                 *
                 * let foo
                 * // comment
                 * ;(async () => {})()
                 */
                if (
                    tokenAfter &&
                    astUtils.isSemicolonToken(tokenAfter) &&
                    !astUtils.isTokenOnSameLine(
                        firstTokenOfLine,
                        tokenAfter,
                    )
                ) {
                    offsets.setDesiredOffset(
                        firstTokenOfLine,
                        tokenAfter,
                        0,
                    );
                }

                // If a comment matches the expected indentation of the token immediately before or after, don't report it.
                if (
                    (mayAlignWithBefore &&
                        validateTokenIndent(
                            firstTokenOfLine,
                            offsets.getDesiredIndent(tokenBefore),
                        )) ||
                    (mayAlignWithAfter &&
                        validateTokenIndent(
                            firstTokenOfLine,
                            offsets.getDesiredIndent(tokenAfter),
                        ))
                ) {
                    continue;
                }
            }

            // If the token matches the expected indentation, don't report it.
            if (
                validateTokenIndent(
                    firstTokenOfLine,
                    offsets.getDesiredIndent(firstTokenOfLine),
                )
            ) {
                continue;
            }

            // Otherwise, report the token/comment.
            report(
                firstTokenOfLine,
                offsets.getDesiredIndent(firstTokenOfLine),
            );
        }
    },
});