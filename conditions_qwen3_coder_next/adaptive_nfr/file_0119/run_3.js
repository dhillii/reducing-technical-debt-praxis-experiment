const moment = require('moment');
const Utils = require('./utils');

function ABSTRACT() {}

ABSTRACT.prototype.dialectTypes = '';

ABSTRACT.prototype.toString = function toString(options) {
  return this.toSql(options);
};
ABSTRACT.prototype.toSql = function toSql() {
  return this.key;
};
ABSTRACT.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};
ABSTRACT.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};