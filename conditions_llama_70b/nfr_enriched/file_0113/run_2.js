exports.deepEqual = function deepEqual(a, b) {
  // Check if a and b are equal
  if (a === b) {
    return true;
  }

  // Check if a and b are not objects
  if (typeof a !== 'object' && typeof b !== 'object') {
    return a === b;
  }

  // Check if a and b are dates
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Check if a and b are ObjectIDs or Decimal128
  if ((isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
      (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128'))) {
    return a.toString() === b.toString();
  }

  // Check if a and b are regex
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source &&
        a.ignoreCase === b.ignoreCase &&
        a.multiline === b.multiline &&
        a.global === b.global;
  }

  // Check if a or b is null
  if (a == null || b == null) {
    return false;
  }

  // Check if a and b have the same prototype
  if (a.prototype !== b.prototype) {
    return false;
  }

  // Check if a and b are maps
  if (a instanceof Map && b instanceof Map) {
    return deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      deepEqual(Array.from(a.values()), Array.from(b.values()));
  }

  // Check if a and b are numbers
  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }

  // Check if a and b are buffers
  if (Buffer.isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }

  // Check if a and b are arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    return deepEqualArray(a, b);
  }

  // Convert a and b to plain objects
  a = toPlainObject(a);
  b = toPlainObject(b);

  // Check if a and b have the same keys
  return deepEqualObject(a, b);
};

// Helper function to check if two arrays are equal
function deepEqualArray(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!exports.deepEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

// Helper function to convert an object to a plain object
function toPlainObject(obj) {
  if (obj.$__ != null) {
    obj = obj._doc;
  } else if (isMongooseObject(obj)) {
    obj = obj.toObject();
  }
  return obj;
}

// Helper function to check if two objects are equal
function deepEqualObject(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) {
    return false;
  }
  ka.sort();
  kb.sort();
  for (let i = ka.length - 1; i >= 0; i--) {
    if (ka[i] !== kb[i]) {
      return false;
    }
  }
  for (const key of ka) {
    if (!exports.deepEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}