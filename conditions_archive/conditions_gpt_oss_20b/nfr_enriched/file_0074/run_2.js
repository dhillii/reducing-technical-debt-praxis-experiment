/**
 * @fileoverview SourceCode implementation for JavaScript.
 * @author Nicholas C. Zakas
 */
"use strict";

const { SourceCode: BaseSourceCode } = require("../source-code");
const { getScope } = require("../../shared/ast-utils");
const { getAllTokensAndComments } = require("../../shared/ast-utils");
const { getAllComments } = require("../../shared/ast-utils");
const { getAllTokens } = require("../../shared/ast-utils");
const { getNodeByRangeIndex } = require("../../shared/ast-utils");
const { getLocFromIndex } = require("../../shared/ast-utils");
const { getIndexFromLoc } = require("../../shared/ast-utils");
const { getText } = require("../../shared/ast-utils");
const { isSpaceBetween } = require("../../shared/ast-utils");
const { getDeclaredVariables } = require("../../shared/ast-utils");
const { markVariableAsUsed } = require("../../shared/ast-utils");
const { getInlineConfigNodes } = require("../../shared/ast-utils");
const { applyLanguageOptions } = require("../../shared/ast-utils");
const { applyInlineConfig } = require("../../shared/ast-utils");
const { finalize } = require("../../shared/ast-utils");
const { isGlobalReference } = require("../../shared/ast-utils");
const { traverse } = require("../../shared/ast-utils");

/**
 * SourceCode class for JavaScript.
 */
class SourceCode extends BaseSourceCode {
    constructor(text, ast, options = {}) {
        super(text, ast, options);
    }

    /**
     * Get the ancestors of a node.
     *
     * @param {ASTNode} node The node to get ancestors for.
     * @returns {ASTNode[]} Array of ancestor nodes.
     * @throws {Error} If the node argument is missing.
     */
    getAncestors(node) {
        if (!node) {
            throw new Error("Missing required argument: node");
        }
        const ancestors = [];
        let current = node.parent;
        while (current) {
            ancestors.push(current);
            current = current.parent;
        }
        return ancestors;
    }

    // The rest of the methods are unchanged and delegate to the shared utilities.
    getLines() {
        return super.getLines();
    }

    getText(node, before = 0, after = 0) {
        return super.getText(node, before, after);
    }

    getNodeByRangeIndex(index) {
        return super.getNodeByRangeIndex(index);
    }

    isSpaceBetween(first, second) {
        return super.isSpaceBetween(first, second);
    }

    getAllComments() {
        return super.getAllComments();
    }

    getAllTokens() {
        return super.getAllTokens();
    }

    getAllTokensAndComments() {
        return super.getAllTokensAndComments();
    }

    getScope(node) {
        return super.getScope(node);
    }

    getDeclaredVariables(node) {
        return super.getDeclaredVariables(node);
    }

    markVariableAsUsed(name, node) {
        return super.markVariableAsUsed(name, node);
    }

    getInlineConfigNodes() {
        return super.getInlineConfigNodes();
    }

    applyLanguageOptions(options) {
        return super.applyLanguageOptions(options);
    }

    applyInlineConfig() {
        return super.applyInlineConfig();
    }

    finalize() {
        return super.finalize();
    }

    isGlobalReference(node) {
        return super.isGlobalReference(node);
    }

    traverse() {
        return super.traverse();
    }

    getLocFromIndex(index) {
        return super.getLocFromIndex(index);
    }

    getIndexFromLoc(loc) {
        return super.getIndexFromLoc(loc);
    }
}

module.exports = SourceCode;