getInlineConfigNodes() {
    const inlineConfigPattern = /^(?:eslint|global)(?:\s|$)/i;
    return this.ast.comments.filter(comment => inlineConfigPattern.test(comment.value));
}