applyInlineConfig() {
  const configs = [];
  const problems = [];

  for (const comment of this.ast.comments) {
    if (comment.type !== 'Block') continue;

    const value = comment.value.trim();
    if (!value.startsWith('eslint')) continue;

    const configStr = value.slice('eslint'.length).trim();
    if (!configStr) continue;

    try {
      const parsed = JSON.parse(`{${configStr}}`);
      configs.push({ config: { rules: parsed } });
    } catch (err) {
      problems.push({
        loc: comment.loc,
        message: `Failed to parse JSON from '${configStr}': ${err.message}`,
        ruleId: null,
      });
    }
  }

  return { configs, problems };
}