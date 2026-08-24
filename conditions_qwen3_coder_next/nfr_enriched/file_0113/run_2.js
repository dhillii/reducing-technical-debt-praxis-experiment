exports.deepEqual = function deepEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }

  if (handleSpecialCases(a, b)) {
    return true;
  }

  if (a == null || b == null) {
    return false;
  }

  if (a.prototype !== b.prototype) {
    return false;
  }

  const normalizedA = normalizeForComparison(a);
  const normalizedB = normalizeForComparison(b);

  return deepEqualObjects(normalizedA, normalizedB);
};

function handleSpecialCases(a, b) {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if ((isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
      (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128'))) {
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

  if (Buffer.isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }

  return false;
}

function normalizeForComparison(obj) {
  if (obj.$__ != null) {
    return obj._doc;
  }
  if (isMongooseObject(obj)) {
    return obj.toObject();
  }
  return obj;
}

function deepEqualObjects(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  const kaLength = ka.length;

  if (kaLength !== kb.length) {
    return false;
  }

  ka.sort();
  kb.sort();

  for (let i = kaLength - 1; i >= 0; --i) {
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