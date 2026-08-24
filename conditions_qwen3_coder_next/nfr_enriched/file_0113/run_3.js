exports.deepEqual = function deepEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (typeof a !== 'object' && typeof b !== 'object') {
    return a === b;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) {
    return a.toString() === b.toString();
  }

  if (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128')) {
    return a.toString() === b.toString();
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return areRegExpsEqual(a, b);
  }

  if (a == null || b == null) {
    return false;
  }

  if (a.prototype !== b.prototype) {
    return false;
  }

  if (a instanceof Map && b instanceof Map) {
    return deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      deepEqual(Array.from(a.values()), Array.from(b.values()));
  }

  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }

  if (Buffer.isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return deepEqualArrays(a, b);
  }

  a = normalizeForDeepEqual(a);
  b = normalizeForDeepEqual(b);

  return deepEqualObjects(a, b);
};

/**
 * Normalize objects for deep equality comparison by unwrapping Mongoose wrappers
 * @param {any} obj
 * @returns {any}
 * @api private
 */
function normalizeForDeepEqual(obj) {
  if (obj == null) {
    return obj;
  }

  if (obj.$__ != null) {
    return obj._doc;
  }

  if (isMongooseObject(obj)) {
    return obj.toObject();
  }

  return obj;
}

/**
 * Deep equality comparison for arrays
 * @param {Array} a
 * @param {Array} b
 * @returns {boolean}
 * @api private
 */
function deepEqualArrays(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; ++i) {
    if (!deepEqual(a[i], b[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Deep equality comparison for plain objects
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 * @api private
 */
function deepEqualObjects(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);

  if (ka.length !== kb.length) {
    return false;
  }

  ka.sort();
  kb.sort();

  for (let i = 0; i < ka.length; ++i) {
    if (ka[i] !== kb[i]) {
      return false;
    }
  }

  for (const key of ka) {
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

/**
 * Compare two regular expressions for equality
 * @param {RegExp} a
 * @param {RegExp} b
 * @returns {boolean}
 * @api private
 */
function areRegExpsEqual(a, b) {
  return a.source === b.source &&
    a.ignoreCase === b.ignoreCase &&
    a.multiline === b.multiline &&
    a.global === b.global;
}