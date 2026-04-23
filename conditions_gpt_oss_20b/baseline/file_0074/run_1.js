getNodeByRangeIndex(index) {
    if (typeof index !== "number" || index < 0) {
        return null;
    }

    const findDeepest = (node) => {
        if (!node || typeof node.range !== "object") {
            return null;
        }

        const [start, end] = node.range;
        if (index < start || index >= end) {
            return null;
        }

        let deepest = node;

        for (const key of Object.keys(node)) {
            const child = node[key];

            if (Array.isArray(child)) {
                for (const c of child) {
                    const found = findDeepest(c);
                    if (found) {
                        deepest = found;
                    }
                }
            } else if (child && typeof child.range === "object") {
                const found = findDeepest(child);
                if (found) {
                    deepest = found;
                }
            }
        }

        return deepest;
    };

    return findDeepest(this.ast);
}