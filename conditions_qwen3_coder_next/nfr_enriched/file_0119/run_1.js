const moment = require('moment');
const Utils = require('./utils');

/**
 * Base class for all data types.
 * Serves as the abstract foundation for type definitions in Sequelize.
 */
function ABSTRACT() {}

ABSTRACT.prototype.dialectTypes = '';

ABSTRACT.prototype.toString = function toString(options) {
  return this.toSql(options);
};

ABSTRACT.prototype.toSql = function toSql() {
  return this.key;
};

/**
 * Emits a one-time warning for deprecated or problematic usage.
 * @param {string} link - URL to documentation or issue details
 * @param {string} text - Warning message to display
 */
ABSTRACT.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};

/**
 * Converts a value to its string representation for SQL generation.
 * Delegates to internal _stringify if available.
 * @param {*} value - Value to stringify
 * @param {Object} options - Contextual options for stringification
 * @returns {string} String representation of the value
 */
ABSTRACT.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};