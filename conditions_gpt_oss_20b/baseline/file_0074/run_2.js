const OriginalSourceCode = require('eslint/lib/languages/js/source-code/source-code');

class RefactoredSourceCode extends OriginalSourceCode {
    getNodeByRangeIndex(index) {
        if (typeof index !== 'number' || !Number.isFinite(index)) {
            return null;
        }
        const ast = this.ast;
        if (!ast || typeof ast.range !== 'object') {
            return null;
        }
        const textLength = this.text ? this.text.length : 0;
        if (index < 0 || index >= textLength) {
            return null;
        }
        let deepest = null;
        const stack = [ast];
        while (stack.length) {
            const node = stack.pop();
            if (!node || typeof node.range !== 'object') continue;
            const [start, end] = node.range;
            if (start <= index && index < end) {
                deepest = node;
                for (const key in node) {
                    const child = node[key];
                    if (Array.isArray(child)) {
                        for (let i = child.length - 1; i >= 0; i--) {
                            const c = child[i];
                            if (c && typeof c.type === 'string') {
                                stack.push(c);
                            }
                        }
                    } else if (child && typeof child.type === 'string') {
                        stack.push(child);
                    }
                }
            }
        }
        return deepest;
    }
}

module.exports = RefactoredSourceCode;