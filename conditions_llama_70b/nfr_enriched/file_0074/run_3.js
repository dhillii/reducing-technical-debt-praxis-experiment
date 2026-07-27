function isSpaceBetween(sourceCode, left, right) {
    // Check if left and right are both tokens or nodes
    if (!left.range && !right.range) {
        throw new Error("Both left and right must be tokens or nodes.");
    }

    // If left and right are the same, return false
    if (left.range && right.range && left.range[0] === right.range[0] && left.range[1] === right.range[1]) {
        return false;
    }

    // If left is to the right of right, swap them
    if (left.range && right.range && left.range[0] > right.range[0]) {
        [left, right] = [right, left];
    }

    // Get the text between left and right
    const text = sourceCode.getText({
        start: left.range[1],
        end: right.range[0],
    });

    // Check if the text contains any whitespace characters
    return /\s/.test(text);
}