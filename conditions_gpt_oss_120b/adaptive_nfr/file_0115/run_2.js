/***************************
 *
 * Extra methods
 *
 **************************/

const cst = require('../../constants.js');
const Common = require('../Common.js');
const UX = require('./UX');
const chalk = require('ansis');
const path = require('path');
const fs = require('fs');
const fmt = require('../tools/fmt.js');
const dayjs = require('dayjs');
const pkg = require('../../package.json');
const copyDirSync = require('../tools/copydirSync.js');

/**
 * Guard: should launch sys monitoring?
 * @param {object} cliInstance
 * @returns {boolean}
 */
function shouldLaunchSysMonitoring(cliInstance) {
  const configDisabled = cliInstance.pm2_configuration && cliInstance.pm2_configuration.sysmonit !== 'true';
  return !(configDisabled || process.env.TRAVIS || global.it === 'function' || cst.IS_WINDOWS === true);
}

/**
 * Guard: is valid process id?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidProcessId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: has error?
 * @param {Error} err
 * @returns {boolean}
 */
function hasError(err) {
  return !!err;
}

/**
 * Guard: is Windows?
 * @returns {boolean}
 */
function isWindows() {
  return cst.IS_WINDOWS === true;
}

/**
 * Guard: is not Windows and function exists
 * @param {Function} fn
 * @returns {boolean}
 */
function existsAndNotWindows(fn) {
  return cst.IS_WINDOWS === false && typeof fn === 'function';
}

/**
 * Guard: is report available and no error
 * @param {object} report
 * @param {Error} err
 * @returns {boolean}
 */
function isReportValid(report, err) {
  return report && !err;
}

/**
 * Guard: is profile command defined
 * @param {string} type
 * @returns {boolean}
 */
function isProfileType(type) {
  return type === 'cpu' || type === 'mem';
}

/**
 * Guard: is profile command CPU
 * @param {string} type
 * @returns {boolean}
 */
function isCpuProfile(type) {
  return type === 'cpu';
}

/**
 * Guard: is profile command MEM
 * @param {string} type
 * @returns {boolean}
 */
function isMemProfile(type) {
  return type === 'mem';
}

/**
 * Guard: is module mode
 * @param {object} opts
 * @returns {boolean}
 */
function hasModuleMode(opts) {
  return !!opts.started_as_module;
}

/**
 * Guard: is callback provided
 * @param {*} cb
 * @returns {boolean}
 */
function hasCallback(cb) {
  return typeof cb === 'function';
}

/**
 * Guard: is process list empty
 * @param {Array} list
 * @returns {boolean}
 */
function isListEmpty(list) {
  return !list || list.length === 0;
}

/**
 * Guard: is process count zero
 * @param {object} data
 * @returns {boolean}
 */
function isProcessCountZero(data) {
  return data && data.process_count === 0;
}

/**
 * Guard: is monitor data error
 * @param {Error} err
 * @returns {boolean}
 */
function isMonitorError(err) {
  return !!err;
}

/**
 * Guard: is monitor data empty
 * @param {Array} list
 * @returns {boolean}
 */
function isMonitorListEmpty(list) {
  return !list || list.length === 0;
}

/**
 * Guard: is environment variable set
 * @param {string} name
 * @returns {boolean}
 */
function hasEnv(name) {
  return !!process.env[name];
}

/**
 * Guard: is command line argument present
 * @param {object} commander
 * @returns {boolean}
 */
function hasCommanderName(commander) {
  return typeof commander.name === 'string';
}

/**
 * Guard: is options object defined
 * @param {object} opts
 * @returns {boolean}
 */
function hasOpts(opts) {
  return !!opts;
}

/**
 * Guard: is basic auth configured
 * @param {object} opts
 * @returns {boolean}
 */
function hasBasicAuth(opts) {
  return opts.basicAuthUsername && opts.basicAuthPassword;
}

/**
 * Guard: is monitor option enabled
 * @param {object} opts
 * @returns {boolean}
 */
function hasMonitorOption(opts) {
  return !!opts.monitor;
}

/**
 * Guard: is serve path defined
 * @param {string} target_path
 * @returns {boolean}
 */
function hasTargetPath(target_path) {
  return !!target_path;
}

/**
 * Guard: is port defined
 * @param {number} port
 * @returns {boolean}
 */
function hasPort(port) {
  return !!port;
}

/**
 * Guard: is mode simple
 * @param {string} mode
 * @returns {boolean}
 */
function isSimpleMode(mode) {
  return mode === 'simple';
}

/**
 * Guard: is mode not simple
 * @param {string} mode
 * @returns {boolean}
 */
function isNotSimpleMode(mode) {
  return mode !== 'simple';
}

/**
 * Guard: is data object valid JSON
 * @param {string} data
 * @returns {boolean}
 */
function isValidJson(data) {
  try {
    JSON.parse(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Guard: is list empty
 * @param {Array} list
 * @returns {boolean}
 */
function isEmpty(list) {
  return !list || list.length === 0;
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumeric(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isString(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumeric(pm_id) || isString(pm_id);
}

/**
 * Guard: is result array empty?
 * @param {Array} results
 * @returns {boolean}
 */
function isResultsEmpty(results) {
  return !results || results.length === 0;
}

/**
 * Guard: is data array empty?
 * @param {Array} data
 * @returns {boolean}
 */
function isDataEmpty(data) {
  return !data || data.length === 0;
}

/**
 * Guard: is data defined
 * @param {*} data
 * @returns {boolean}
 */
function isDefined(data) {
  return data !== undefined && data !== null;
}

/**
 * Guard: is error defined
 * @param {*} err
 * @returns {boolean}
 */
function isErrDefined(err) {
  return err !== undefined && err !== null;
}

/**
 * Guard: is callback defined
 * @param {*} cb
 * @returns {boolean}
 */
function isCbDefined(cb) {
  return typeof cb === 'function';
}

/**
 * Guard: is options defined
 * @param {*} opts
 * @returns {boolean}
 */
function isOptsDefined(opts) {
  return typeof opts === 'object' && opts !== null;
}

/**
 * Guard: is args array defined
 * @param {*} args
 * @returns {boolean}
 */
function isArgsArray(args) {
  return Array.isArray(args);
}

/**
 * Guard: is command defined
 * @param {*} command
 * @returns {boolean}
 */
function isCommandDefined(command) {
  return typeof command === 'string';
}

/**
 * Guard: is mode defined
 * @param {*} mode
 * @returns {boolean}
 */
function isModeDefined(mode) {
  return typeof mode === 'string';
}

/**
 * Guard: is mode simple
 * @param {*} mode
 * @returns {boolean}
 */
function isSimple(mode) {
  return mode === 'simple';
}

/**
 * Guard: is mode complex
 * @param {*} mode
 * @returns {boolean}
 */
function isComplex(mode) {
  return mode !== 'simple';
}

/**
 * Guard: is process list empty
 * @param {Array} list
 * @returns {boolean}
 */
function isProcessListEmpty(list) {
  return !list || list.length === 0;
}

/**
 * Guard: is process list non-empty
 * @param {Array} list
 * @returns {boolean}
 */
function hasProcessList(list) {
  return Array.isArray(list) && list.length > 0;
}

/**
 * Guard: is result error?
 * @param {*} err
 * @returns {boolean}
 */
function isResultError(err) {
  return !!err;
}

/**
 * Guard: is result success?
 * @param {*} err
 * @returns {boolean}
 */
function isResultSuccess(err) {
  return !err;
}

/**
 * Guard: is data present?
 * @param {*} data
 * @returns {boolean}
 */
function hasData(data) {
  return data !== undefined && data !== null;
}

/**
 * Guard: is data empty string?
 * @param {string} str
 * @returns {boolean}
 */
function isEmptyString(str) {
  return typeof str === 'string' && str.trim() === '';
}

/**
 * Guard: is data non-empty string?
 * @param {string} str
 * @returns {boolean}
 */
function isNonEmptyString(str) {
  return typeof str === 'string' && str.trim() !== '';
}

/**
 * Guard: is process count zero?
 * @param {object} data
 * @returns {boolean}
 */
function isZeroProcessCount(data) {
  return data && data.process_count === 0;
}

/**
 * Guard: is process count non-zero?
 * @param {object} data
 * @returns {boolean}
 */
function hasProcessCount(data) {
  return data && data.process_count > 0;
}

/**
 * Guard: is process name match?
 * @param {object} packet
 * @param {number|string} pm_id
 * @returns {boolean}
 */
function isPacketForPmId(packet, pm_id) {
  return packet.process.pm_id === parseInt(pm_id);
}

/**
 * Guard: is bus launch error?
 * @param {Error} err
 * @returns {boolean}
 */
function isBusLaunchError(err) {
  return !!err;
}

/**
 * Guard: is bus launch success?
 * @param {Error} err
 * @returns {boolean}
 */
function isBusLaunchSuccess(err) {
  return !err;
}

/**
 * Guard: is command length 1?
 * @param {Function} fn
 * @returns {boolean}
 */
function hasSingleArgument(fn) {
  return fn.length === 1;
}

/**
 * Guard: is command length >1?
 * @param {Function} fn
 * @returns {boolean}
 */
function hasMultipleArguments(fn) {
  return fn.length > 1;
}

/**
 * Guard: is args array present
 * @param {object} opts
 * @returns {boolean}
 */
function hasOptsArgs(opts) {
  return Array.isArray(opts.args);
}

/**
 * Guard: is args array empty
 * @param {object} opts
 * @returns {boolean}
 */
function isOptsArgsEmpty(opts) {
  return !Array.isArray(opts.args) || opts.args.length === 0;
}

/**
 * Guard: is command defined in CLI
 * @param {object} cli
 * @param {string} command
 * @returns {boolean}
 */
function cliHasCommand(cli, command) {
  return typeof cli[command] === 'function';
}

/**
 * Guard: is command not defined in CLI
 * @param {object} cli
 * @param {string} command
 * @returns {boolean}
 */
function cliMissingCommand(cli, command) {
  return typeof cli[command] !== 'function';
}

/**
 * Guard: is result array empty
 * @param {Array} results
 * @returns {boolean}
 */
function resultsEmpty(results) {
  return !results || results.length === 0;
}

/**
 * Guard: is result array non-empty
 * @param {Array} results
 * @returns {boolean}
 */
function resultsNonEmpty(results) {
  return Array.isArray(results) && results.length > 0;
}

/**
 * Guard: is data array non-empty
 * @param {Array} data
 * @returns {boolean}
 */
function dataNonEmpty(data) {
  return Array.isArray(data) && data.length > 0;
}

/**
 * Guard: is data array empty
 * @param {Array} data
 * @returns {boolean}
 */
function dataEmpty(data) {
  return !Array.isArray(data) || data.length === 0;
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isNumericPmId(pm_id) {
  return !isNaN(pm_id);
}

/**
 * Guard: is process name string?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isStringPmId(pm_id) {
  return typeof pm_id === 'string';
}

/**
 * Guard: is process name valid?
 * @param {*} pm_id
 * @returns {boolean}
 */
function isValidPmId(pm_id) {
  return isNumericPmId(pm_id) || isStringPmId(pm_id);
}

/**
 * Guard: is process name numeric?
 * @param {*} pm_id
 * @returns {