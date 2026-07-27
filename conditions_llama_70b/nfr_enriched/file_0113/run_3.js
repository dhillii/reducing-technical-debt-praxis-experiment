exports.deepEqual = function deepEqual(a, b) {
  // Check for strict equality
  if (a === b) {
    return true;
  }

  // Check for primitive types
  if (typeof a !== 'object' && typeof b !== 'object') {
    return a === b;
  }

  // Check for special types
  if (isSpecialType(a, b)) {
    return areSpecialTypesEqual(a, b);
  }

  // Check for arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    return areArraysEqual(a, b);
  }

  // Check for objects
  if (isObject(a) && isObject(b)) {
    return areObjectsEqual(a, b);
  }

  // If none of the above, return false
  return false;
};

// Helper function to check for special types
function isSpecialType(a, b) {
  return (a instanceof Date && b instanceof Date) ||
    (isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
    (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128')) ||
    (a instanceof RegExp && b instanceof RegExp) ||
    (a instanceof Map && b instanceof Map) ||
    (a instanceof Number && b instanceof Number) ||
    (Buffer.isBuffer(a) && Buffer.isBuffer(b));
}

// Helper function to check equality of special types
function areSpecialTypesEqual(a, b) {
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
    return a.source === b.source &&
      a.ignoreCase === b.ignoreCase &&
      a.multiline === b.multiline &&
      a.global === b.global;
  }

  if (a instanceof Map && b instanceof Map) {
    return deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      deepEqual(Array.from(a.values()), Array.from(b.values()));
  }

  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }

  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
    return exports.buffer.areEqual(a, b);
  }

  return false;
}

// Helper function to check equality of arrays
function areArraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) {
      return false;
    }
  }

  return true;
}

// Helper function to check equality of objects
function areObjectsEqual(a, b) {
  // Normalize objects
  a = normalizeObject(a);
  b = normalizeObject(b);

  // Check for same number of keys
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) {
    return false;
  }

  // Check for same keys
  ka.sort();
  kb.sort();
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) {
      return false;
    }
  }

  // Check for same values
  for (const key of ka) {
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

// Helper function to normalize an object
function normalizeObject(obj) {
  if (obj.$__ != null) {
    obj = obj._doc;
  } else if (isMongooseObject(obj)) {
    obj = obj.toObject();
  }

  return obj;
}