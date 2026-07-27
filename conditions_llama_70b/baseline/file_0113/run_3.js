exports.deepEqual = function deepEqual(a, b) {
  if (a === b) return true;

  if (typeof a !== 'object' && typeof b !== 'object') return a === b;

  if (isDate(a) && isDate(b)) return a.getTime() === b.getTime();

  if (isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID') ||
      isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128')) {
    return a.toString() === b.toString();
  }

  if (isRegExp(a) && isRegExp(b)) {
    return a.source === b.source &&
        a.ignoreCase === b.ignoreCase &&
        a.multiline === b.multiline &&
        a.global === b.global;
  }

  if (a == null || b == null) return false;

  if (a.prototype !== b.prototype) return false;

  if (isMap(a) && isMap(b)) {
    return deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      deepEqual(Array.from(a.values()), Array.from(b.values()));
  }

  if (isNumber(a) && isNumber(b)) {
    return a.valueOf() === b.valueOf();
  }

  if (isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }

  if (isArray(a) && isArray(b)) {
    return deepEqualArray(a, b);
  }

  a = getMongooseObject(a);
  b = getMongooseObject(b);

  const ka = Object.keys(a);
  const kb = Object.keys(b);
  const kaLength = ka.length;

  if (kaLength !== kb.length) return false;

  ka.sort();
  kb.sort();

  for (let i = kaLength - 1; i >= 0; i--) {
    if (ka[i] !== kb[i]) return false;
  }

  for (const key of ka) {
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
};

function isDate(obj) {
  return obj instanceof Date;
}

function isRegExp(obj) {
  return obj instanceof RegExp;
}

function isMap(obj) {
  return obj instanceof Map;
}

function isNumber(obj) {
  return obj instanceof Number;
}

function isBuffer(obj) {
  return Buffer.isBuffer(obj);
}

function isArray(obj) {
  return Array.isArray(obj);
}

function getMongooseObject(obj) {
  if (obj.$__ != null) {
    obj = obj._doc;
  } else if (isMongooseObject(obj)) {
    obj = obj.toObject();
  }
  return obj;
}

function deepEqualArray(a, b) {
  const len = a.length;
  if (len !== b.length) return false;
  for (let i = 0; i < len; ++i) {
    if (!deepEqual(a[i], b[i])) return false;
  }
  return true;
}