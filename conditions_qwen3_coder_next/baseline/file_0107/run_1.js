'use strict';

/**
 * Module dependencies.
 */

const EventEmitter = require('events').EventEmitter;
const Pending = require('./pending');
const utils = require('./utils');
const inherits = utils.inherits;
const debug = require('debug')('mocha:runner');
const Runnable = require('./runnable');
const stackFilter = utils.stackTraceFilter();
const stringify = utils.stringify;
const type = utils.type;
const undefinedError = utils.undefinedError;

/**
 * Non-enumerable globals.
 */

const globals = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'XMLHttpRequest',
  'Date',
  'setImmediate',
  'clearImmediate'
];

/**
 * Expose `Runner`.
 */

module.exports = Runner;