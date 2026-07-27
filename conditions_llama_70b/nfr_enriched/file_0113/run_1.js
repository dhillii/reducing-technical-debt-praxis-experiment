exports.deepEqual = function deepEqual(a, b) {
  // Check for strict equality
  if (a === b) {
    return true;
  }

  // Check for non-object types
  if (typeof a !== 'object' && typeof b !== 'object') {
    return a === b;
  }

  // Check for date equality
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Check for bson type equality
  if ((isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
      (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128'))) {
    return a.toString() === b.toString();
  }

  // Check for regex equality
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source &&
        a.ignoreCase === b.ignoreCase &&
        a.multiline === b.multiline &&
        a.global === b.global;
  }

  // Check for null or undefined
  if (a == null || b == null) {
    return false;
  }

  // Check for prototype equality
  if (a.prototype !== b.prototype) {
    return false;
  }

  // Check for map equality
  if (a instanceof Map && b instanceof Map) {
    return deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      deepEqual(Array.from(a.values()), Array.from(b.values()));
  }

  // Check for mongoose number equality
  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }

  // Check for buffer equality
  if (Buffer.isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }

  // Check for array equality
  if (Array.isArray(a) && Array.isArray(b)) {
    return deepEqualArray(a, b);
  }

  // Convert mongoose objects to plain objects
  a = toPlainObject(a);
  b = toPlainObject(b);

  // Check for object key equality
  return deepEqualObject(a, b);
};

// Helper function to check array equality
function deepEqualArray(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; ++i) {
    if (!exports.deepEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

// Helper function to convert mongoose object to plain object
function toPlainObject(obj) {
  if (obj.$__ != null) {
    obj = obj._doc;
  } else if (isMongooseObject(obj)) {
    obj = obj.toObject();
  }
  return obj;
}

// Helper function to check object equality
function deepEqualObject(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  const kaLength = ka.length;

  // Check for key length equality
  if (kaLength !== kb.length) {
    return false;
  }

  // Check for key equality
  ka.sort();
  kb.sort();
  for (let i = kaLength - 1; i >= 0; i--) {
    if (ka[i] !== kb[i]) {
      return false;
    }
  }

  // Check for value equality
  for (const key of ka) {
    if (!exports.deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}