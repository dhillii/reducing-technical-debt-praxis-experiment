/**
 * Extracts inline configuration comments from the AST.
 *
 * @returns {Array<ASTNode>} An array of comment nodes that contain inline
 * configuration directives (e.g. `/*eslint ...*/`, `/*globals ...*/`,
 * `/*exported ...*/`).
 */
getInlineConfigNodes() {
    const { comments } = this.ast;
    if (!Array.isArray(comments)) {
        return [];
    }

    const inlineConfigPattern = /^\s*(eslint|globals|exported)\b/;
    return comments.filter(
        comment =>
            comment.type === "Block" &&
            inlineConfigPattern.test(comment.value)
    );
}

/**
 * Parses inline configuration comments and returns the extracted
 * configuration objects along with any parsing problems.
 *
 * @returns {{ configs: Array<{ config: Object, loc: SourceLocation }>, problems: Array<Problem> }}
 */
applyInlineConfig() {
    const inlineComments = this.getInlineConfigNodes();
    const configs = [];
    const problems = [];

    const parseConfig = comment => {
        const raw = comment.value.trim();
        const type = raw.split(/\s+/)[0];
        const content = raw.slice(type.length).trim();

        try {
            // Convert the inline config into a JSON string
            const jsonString = `{${content.replace(/(:\s*)/g, ':')}}`;
            const parsed = JSON.parse(jsonString);
            configs.push({
                config: { rules: parsed },
                loc: comment.loc,
            });
        } catch (err) {
            problems.push({
                message: `Failed to parse JSON from '${raw}': ${err.message}`,
                loc: comment.loc,
                ruleId: null,
            });
        }
    };

    inlineComments.forEach(parseConfig);

    return { configs, problems };
}