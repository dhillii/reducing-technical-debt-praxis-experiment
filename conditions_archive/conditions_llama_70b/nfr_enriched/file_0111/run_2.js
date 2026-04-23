*
 * @param {Function} model
 * @param {Boolean} [virtualsOnly] if truthy, only pulls virtuals from the class, not methods or statics
 */
Schema.prototype.loadClass = function(model, virtualsOnly) {
  if (model === Object.prototype ||
      model === Function.prototype ||
      model.prototype.hasOwnProperty('$isMongooseModelPrototype')) {
    return this;
  }

  this.loadClass(Object.getPrototypeOf(model), virtualsOnly);

  // Add static methods
  if (!virtualsOnly) {
    Object.getOwnPropertyNames(model).forEach(function(name) {
      if (name.match(/^(length|name|prototype|constructor|__proto__)$/)) {
        return;
      }
      const prop = Object.getOwnPropertyDescriptor(model, name);
      if (prop.hasOwnProperty('value')) {
        this.static(name, prop.value);
      }
    }, this);
  }

  // Add methods and virtuals
  Object.getOwnPropertyNames(model.prototype).forEach(function(name) {
    if (name.match(/^(constructor)$/)) {
      return;
    }
    const method = Object.getOwnPropertyDescriptor(model.prototype, name);
    if (!virtualsOnly) {
      if (typeof method.value === 'function') {
        this.method(name, method.value);
      }
    }
    if (typeof method.get === 'function') {
      if (this.virtuals[name]) {
        this.virtuals[name].getters = [];
      }
      this.virtual(name).get(method.get);
    }
    if (typeof method.set === 'function') {
      if (this.virtuals[name]) {
        this.virtuals[name].setters = [];
      }
      this.virtual(name).set(method.set);
    }
  }, this);

  return this;
};

/**
 * The Mongoose instance this schema is associated with
 *
 * @property base
 * @api private
 */

Object.defineProperty(Schema.prototype, 'base', {
  configurable: true,
  enumerable: false,
  writable: true,
  value: null
});

/**
 * The various built-in Mongoose Schema Types.
 *
 * ####Example:
 *
 *     const mongoose = require('mongoose');
 *     const ObjectId = mongoose.Schema.Types.ObjectId;
 *
 * ####Types:
 *
 * - [String](/docs/schematypes.html#strings)
 * - [Number](/docs/schematypes.html#numbers)
 * - [Boolean](/docs/schematypes.html#booleans) | Bool
 * - [Array](/docs/schematypes.html#arrays)
 * - [Buffer](/docs/schematypes.html#buffers)
 * - [Date](/docs/schematypes.html#dates)
 * - [ObjectId](/docs/schematypes.html#objectids) | Oid
 * - [Mixed](/docs/schematypes.html#mixed)
 *
 * Using this exposed access to the `Mixed` SchemaType, we can use them in our schema.
 *
 *     const Mixed = mongoose.Schema.Types.Mixed;
 *     new mongoose.Schema({ _user: Mixed })
 *
 * @api public
 */

Schema.Types = MongooseTypes = require('./schema/index');

module.exports = exports = Schema;