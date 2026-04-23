/**
 * Find the deepest node that contains the given range index.
 *
 * @param {number} index The range index to search for.
 * @returns {ASTNode|null} The node that contains the index, or null if none.
 */
getNodeByRangeIndex(index) {
    if (typeof index !== "number") {
        throw new TypeError("Expected `index` to be a number.");
    }

    const { ast } = this;
    let result = null;

    /**
     * Determine whether a node's range covers the given index.
     *
     * @param {ASTNode} node
     * @returns {boolean}
     */
    const nodeContainsIndex = (node) => {
        const [start, end] = node.range;
        return start <= index && index < end;
    };

    /**
     * Depth‑first traversal that records the deepest node containing the index.
     *
     * @param {ASTNode} node
     */
    const traverse = (node) => {
        if (!node || typeof node !== "object") return;

        if (nodeContainsIndex(node)) {
            result = node;
            for (const key of Object.keys(node)) {
                const child = node[key];
                if (Array.isArray(child)) {
                    for (const c of child) traverse(c);
                } else if (child && typeof child === "object" && child.type) {
                    traverse(child);
                }
            }
        }
    };

    traverse(ast);
    return result;
}