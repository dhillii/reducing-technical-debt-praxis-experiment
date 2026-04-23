*
 * @param {Function} fn
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.set = function(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A setter must be a function.');
  }
  this.setters.push(fn);
  return this;
};

/**
 * Adds a getter to this schematype.
 *
 * ####Example:
 *
 *     function dob (val) {
 *       if (!val) return val;
 *       return (val.getMonth() + 1) + "/" + val.getDate() + "/" + val.getFullYear();
 *     }
 *
 *     // defining within the schema
 *     const s = new Schema({ born: { type: Date, get: dob })
 *
 *     // or by retreiving its SchemaType
 *     const s = new Schema({ born: Date })
 *     s.path('born').get(dob)
 *
 * Getters allow you to transform the representation of the data as it travels from the raw mongodb document to the value that you see.
 *
 * Suppose you are storing credit card numbers and you want to hide everything except the last 4 digits to the mongoose user. You can do so by defining a getter in the following way:
 *
 *     function obfuscate (cc) {
 *       return '****-****-****-' + cc.slice(cc.length-4, cc.length);
 *     }
 *
 *     const AccountSchema = new Schema({
 *       creditCardNumber: { type: String, get: obfuscate }
 *     });
 *
 *     const Account = db.model('Account', AccountSchema);
 *
 *     Account.findById(id, function (err, found) {
 *       console.log(found.creditCardNumber); // '****-****-****-1234'
 *     });
 *
 * Getters are also passed a second argument, the schematype on which the getter was defined. This allows for tailored behavior based on options passed in the schema.
 *
 *     function inspector (val, schematype) {
 *       if (schematype.options.required) {
 *         return schematype.path + ' is required';
 *       } else {
 *         return schematype.path + ' is not';
 *       }
 *     }
 *
 *     const VirusSchema = new Schema({
 *       name: { type: String, required: true, get: inspector },
 *       taxonomy: { type: String, get: inspector }
 *     })
 *
 *     const Virus = db.model('Virus', VirusSchema);
 *
 *     Virus.findById(id, function (err, virus) {
 *       console.log(virus.name);     // name is required
 *       console.log(virus.taxonomy); // taxonomy is not
 *     })
 *
 * @param {Function} fn
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.get = function(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A getter must be a function.');
  }
  this.getters.push(fn);
  return this;
};

/**
 * Adds validator(s) for this document path.
 *
 * Validators always receive the value to validate as their first argument and
 * must return `Boolean`. Returning `false` or throwing an error means
 * validation failed.
 *
 * The error message argument is optional. If not passed, the [default generic error message template](#error_messages_MongooseError-messages) will be used.
 *
 * ####Examples:
 *
 *     // make sure every value is equal to "something"
 *     function validator (val) {
 *       return val == 'something';
 *     }
 *     new Schema({ name: { type: String, validate: validator }});
 *
 *     // with a custom error message
 *
 *     const custom = [validator, 'Uh oh, {PATH} does not equal "something".']
 *     new Schema({ name: { type: String, validate: custom }});
 *
 *     // adding many validators at a time
 *
 *     const many = [
 *         { validator: validator, msg: 'uh oh' }
 *       , { validator: anotherValidator, msg: 'failed' }
 *     ]
 *     new Schema({ name: { type: String, validate: many }});
 *
 *     // or utilizing SchemaType methods directly:
 *
 *     const schema = new Schema({ name: 'string' });
 *     schema.path('name').validate(validator, 'validation of `{PATH}` failed with value `{VALUE}`');
 *
 * ####Error message templates:
 *
 * From the examples above, you may have noticed that error messages support
 * basic templating. There are a few other template keywords besides `{PATH}`
 * and `{VALUE}` too. To find out more, details are available
 * [here](#error_messages_MongooseError.messages).
 *
 * If Mongoose's built-in error message templating isn't enough, Mongoose
 * supports setting the `message` property to a function.
 *
 *     schema.path('name').validate({
 *       validator: function() { return v.length > 5; },
 *       // `errors['name']` will be "name must have length 5, got 'foo'"
 *       message: function(props) {
 *         return `${props.path} must have length 5, got '${props.value}'`;
 *       }
 *     });
 *
 * To bypass Mongoose's error messages and just copy the error message that
 * the validator throws, do this:
 *
 *     schema.path('name').validate({
 *       validator: function() { throw new Error('Oops!'); },
 *       // `errors['name']` will be "Oops!"
 *       message: function(props) { return props.reason.message; }
 *     });
 *
 * ####Asynchronous validation:
 *
 * Mongoose supports validators that return a promise. A validator that returns
 * a promise is called an _async validator_. Async validators run in
 * parallel, and `validate()` will wait until all async validators have settled.
 *
 *     schema.path('name').validate({
 *       validator: function (value) {
 *         return new Promise(function (resolve, reject) {
 *           resolve(false); // validation failed
 *         });
 *       }
 *     });
 *
 * You might use asynchronous validators to retreive other documents from the database to validate against or to meet other I/O bound validation needs.
 *
 * Validation occurs `pre('save')` or whenever you manually execute [document#validate](#document_Document-validate).
 *
 * If validation fails during `pre('save')` and no callback was passed to receive the error, an `error` event will be emitted on your Models associated db [connection](#connection_Connection), passing the validation error object along.
 *
 *     const conn = mongoose.createConnection(..);
 *     conn.on('error', handleError);
 *
 *     const Product = conn.model('Product', yourSchema);
 *     const dvd = new Product(..);
 *     dvd.save(); // emits error on the `conn` above
 *
 * If you want to handle these errors at the Model level, add an `error`
 * listener to your Model as shown below.
 *
 *     // registering an error listener on the Model lets us handle errors more locally
 *     Product.on('error', handleError);
 *
 * @param {RegExp|Function|Object} obj validator function, or hash describing options
 * @param {Function} [obj.validator] validator function. If the validator function returns `undefined` or a truthy value, validation succeeds. If it returns [falsy](https://masteringjs.io/tutorials/fundamentals/falsy) (except `undefined`) or throws an error, validation fails.
 * @param {String|Function} [obj.message] optional error message. If function, should return the error message as a string
 * @param {Boolean} [obj.propsParameter=false] If true, Mongoose will pass the validator properties object (with the `validator` function, `message`, etc.) as the 2nd arg to the validator function. This is disabled by default because many validators [rely on positional args](https://github.com/chriso/validator.js#validators), so turning this on may cause unpredictable behavior in external validators.
 * @param {String|Function} [errorMsg] optional error message. If function, should return the error message as a string
 * @param {String} [type] optional validator type
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.validate = function(obj, message, type) {
  if (this._isSimpleValidator(obj)) {
    this._addSimpleValidator(obj, message, type);
    return this;
  }

  this._addComplexValidators(arguments);
  return this;
};

/**
 * Check if validator is a simple function or RegExp.
 * @private
 */
SchemaType.prototype._isSimpleValidator = function(obj) {
  return typeof obj === 'function' || (obj && utils.getFunctionName(obj.constructor) === 'RegExp');
};

/**
 * Add a simple validator (function or RegExp).
 * @private
 */
SchemaType.prototype._addSimpleValidator = function(obj, message, type) {
  const properties = this._buildValidatorProperties(obj, message, type);

  if (properties.isAsync) {
    handleIsAsync();
  }

  this.validators.push(properties);
};

/**
 * Build validator properties object from arguments.
 * @private
 */
SchemaType.prototype._buildValidatorProperties = function(obj, message, type) {
  if (typeof message === 'function') {
    return {
      validator: obj,
      message: message,
      type: type || 'user defined'
    };
  }

  if (message instanceof Object && !type) {
    const properties = utils.clone(message);
    if (!properties.message) {
      properties.message = properties.msg;
    }
    properties.validator = obj;
    properties.type = properties.type || 'user defined';
    return properties;
  }

  return {
    validator: obj,
    message: message || MongooseError.messages.general.default,
    type: type || 'user defined'
  };
};

/**
 * Add multiple complex validators from arguments array.
 * @private
 */
SchemaType.prototype._addComplexValidators = function(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!utils.isPOJO(arg)) {
      throw new Error('Invalid validator. Received (' + typeof arg + ') '
        + arg
        + '. See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate');
    }
    this.validate(arg.validator, arg);
  }
};

/*!
 * ignore
 */

const handleIsAsync = util.deprecate(function handleIsAsync() {},
  'Mongoose: the `isAsync` option for custom validators is deprecated. Make ' +
  'your async validators return a promise instead: ' +
  'https://mongoosejs.com/docs/validation.html#async-custom-validators');

/**
 * Adds a required validator to this SchemaType. The validator gets added
 * to the front of this SchemaType's validators array using `unshift()`.
 *
 * ####Example:
 *
 *     const s = new Schema({ born: { type: Date, required: true })
 *
 *     // or with custom error message
 *
 *     const s = new Schema({ born: { type: Date, required: '{PATH} is required!' })
 *
 *     // or with a function
 *
 *     const s = new Schema({
 *       userId: ObjectId,
 *       username: {
 *         type: String,
 *         required: function() { return this.userId != null; }
 *       }
 *     })
 *
 *     // or with a function and a custom message
 *     const s = new Schema({
 *       userId: ObjectId,
 *       username: {
 *         type: String,
 *         required: [
 *           function() { return this.userId != null; },
 *           'username is required if id is specified'
 *         ]
 *       }
 *     })
 *
 *     // or through the path API
 *
 *     s.path('name').required(true);
 *
 *     // with custom error messaging
 *
 *     s.path('name').required(true, 'grrr :( ');
 *
 *     // or make a path conditionally required based on a function
 *     const isOver18 = function() { return this.age >= 18; };
 *     s.path('voterRegistrationId').required(isOver18);
 *
 * The required validator uses the SchemaType's `checkRequired` function to
 * determine whether a given value satisfies the required validator. By default,
 * a value satisfies the required validator if `val != null` (that is, if
 * the value is not null nor undefined). However, most built-in mongoose schema
 * types override the default `checkRequired` function:
 *
 * @param {Boolean|Function|Object} required enable/disable the validator, or function that returns required boolean, or options object
 * @param {Boolean|Function} [options.isRequired] enable/disable the validator, or function that returns required boolean
 * @param {Function} [options.ErrorConstructor] custom error constructor. The constructor receives 1 parameter, an object containing the validator properties.
 * @param {String} [message] optional custom error message
 * @return {SchemaType} this
 * @see Customized Error Messages #error_messages_MongooseError-messages
 * @see SchemaArray#checkRequired #schema_array_SchemaArray.checkRequired
 * @see SchemaBoolean#checkRequired #schema_boolean_SchemaBoolean-checkRequired
 * @see SchemaBuffer#checkRequired #schema_buffer_SchemaBuffer.schemaName
 * @see SchemaNumber#checkRequired #schema_number_SchemaNumber-min
 * @see SchemaObjectId#checkRequired #schema_objectid_ObjectId-auto
 * @see SchemaString#checkRequired #schema_string_SchemaString-checkRequired
 * @api public
 */

SchemaType.prototype.required = function(required, message) {
  if (arguments.length > 0 && required == null) {
    return this._clearRequired();
  }

  let customOptions = {};
  if (typeof required === 'object') {
    customOptions = required;
    message = customOptions.message || message;
    required = required.isRequired;
  }

  if (required === false) {
    return this._clearRequired();
  }

  return this._setRequired(required, message, customOptions);
};

/**
 * Clear required validator.
 * @private
 */
SchemaType.prototype._clearRequired = function() {
  this.validators = this.validators.filter(function(v) {
    return v.validator !== this.requiredValidator;
  }, this);

  this.isRequired = false;
  delete this.originalRequiredValue;
  return this;
};

/**
 * Set required validator.
 * @private
 */
SchemaType.prototype._setRequired = function(required, message, customOptions) {
  const _this = this;
  this.isRequired = true;

  this.requiredValidator = function(v) {
    return _this._checkRequiredValue(v, required);
  };

  this.originalRequiredValue = required;

  if (typeof required === 'string') {
    message = required;
    required = undefined;
  }

  const msg = message || MongooseError.messages.general.required;
  this.validators.unshift(Object.assign({}, customOptions, {
    validator: this.requiredValidator,
    message: msg,
    type: 'required'
  }));

  return this;
};

/**
 * Check if required value passes validation.
 * @private
 */
SchemaType.prototype._checkRequiredValue = function(v, required) {
  const cachedRequired = get(this, '$__.cachedRequired');
  const _this = this;

  if (this._shouldSkipRequiredCheck(cachedRequired)) {
    return true;
  }

  if (cachedRequired != null && _this.path in cachedRequired) {
    return this._validateCachedRequired(cachedRequired, required, v);
  }

  if (typeof required === 'function') {
    return required.apply(this) ? _this.checkRequired(v, this) : true;
  }

  return _this.checkRequired(v, this);
};

/**
 * Check if required validation should be skipped.
 * @private
 */
SchemaType.prototype._shouldSkipRequiredCheck = function(cachedRequired) {
  return cachedRequired != null && !this.$__isSelected(this.path) && !this[documentIsModified](this.path);
};

/**
 * Validate cached required value.
 * @private
 */
SchemaType.prototype._validateCachedRequired = function(cachedRequired, required, v) {
  const _this = this;
  const res = cachedRequired[_this.path] ?
    _this.checkRequired(v, this) :
    true;
  delete cachedRequired[_this.path];
  return res;
};

/**
 * Set the model that this path refers to. This is the option that [populate](https://mongoosejs.com/docs/populate.html)
 * looks at to determine the foreign collection it should query.
 *
 * ####Example:
 *     const userSchema = new Schema({ name: String });
 *     const User = mongoose.model('User', userSchema);
 *
 *     const postSchema = new Schema({ user: mongoose.ObjectId });
 *     postSchema.path('user').ref('User'); // Can set ref to a model name
 *     postSchema.path('user').ref(User); // Or a model class
 *     postSchema.path('user').ref(() => 'User'); // Or a function that returns the model name
 *     postSchema.path('user').ref(() => User); // Or a function that returns the model class
 *
 *     // Or you can just declare the `ref` inline in your schema
 *     const postSchema2 = new Schema({
 *       user: { type: mongoose.ObjectId, ref: User }
 *     });
 *
 * @param {String|Model|Function} ref either a model name, a [Model](https://mongoosejs.com/docs/models.html), or a function that returns a model name or model.
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.ref = function(ref) {
  this.options.ref = ref;
  return this;
};

/**
 * Gets the default value
 *
 * @param {Object} scope the scope which callback are executed
 * @param {Boolean} init
 * @api private
 */

SchemaType.prototype.getDefault = function(scope, init) {
  let ret = typeof this.defaultValue === 'function'
    ? this.defaultValue.call(scope)
    : this.defaultValue;

  if (ret !== null && ret !== undefined) {
    if (typeof ret === 'object' && (!this.options || !this.options.shared)) {
      ret = utils.clone(ret);
    }

    const casted = this.applySetters(ret, scope, init);
    if (casted && casted.$isSingleNested) {
      casted.$__parent = scope;
    }
    return casted;
  }
  return ret;
};

/*!
 * Applies setters without casting
 *
 * @api private
 */

SchemaType.prototype._applySetters = function(value, scope, init) {
  let v = value;
  if (init) {
    return v;
  }
  const setters = this.setters;

  for (let i = setters.length - 1; i >= 0; i--) {
    v = setters[i].call(scope, v, this);
  }

  return v;
};

/*!
 * ignore
 */

SchemaType.prototype._castNullish = function _castNullish(v) {
  return v;
};

/**
 * Applies setters
 *
 * @param {Object} value
 * @param {Object} scope
 * @param {Boolean} init
 * @api private
 */

SchemaType.prototype.applySetters = function(value, scope, init, priorVal, options) {
  let v = this._applySetters(value, scope, init, priorVal, options);
  if (v == null) {
    return this._castNullish(v);
  }

  // do not cast until all setters are applied #665
  v = this.cast(v, scope, init, priorVal, options);

  return v;
};

/**
 * Applies getters to a value
 *
 * @param {Object} value
 * @param {Object} scope
 * @api private
 */

SchemaType.prototype.applyGetters = function(value, scope) {
  let v = value;
  const getters = this.getters;
  const len = getters.length;

  if (len === 0) {
    return v;
  }

  for (let i = 0; i < len; ++i) {
    v = getters[i].call(scope, v, this);
  }

  return v;
};

/**
 * Sets default `select()` behavior for this path.
 *
 * Set to `true` if this path should always be included in the results, `false` if it should be excluded by default. This setting can be overridden at the query level.
 *
 * ####Example:
 *
 *     T = db.model('T', new Schema({ x: { type: String, select: true }}));
 *     T.find(..); // field x will always be selected ..
 *     // .. unless overridden;
 *     T.find().select('-x').exec(callback);
 *
 * @param {Boolean} val
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.select = function select(val) {
  this.selected = !!val;
  return this;
};

/**
 * Performs a validation of `value` using the validators declared for this SchemaType.
 *
 * @param {any} value
 * @param {Function} callback
 * @param {Object} scope
 * @api private
 */

SchemaType.prototype.doValidate = function(value, fn, scope, options) {
  let err = false;
  const path = this.path;

  // Avoid non-object `validators`
  const validators = this.validators.
    filter(v => v != null && typeof v === 'object');

  let count = validators.length;

  if (!count) {
    return fn(null);
  }

  const _this = this;
  validators.forEach(function(v) {
    if (err) {
      return;
    }

    _this._validateSingleValidator(v, value, path, options, function(validationErr) {
      if (validationErr) {
        err = validationErr;
      }
      if (--count <= 0) {
        immediate(function() {
          fn(err);
        });
      }
    });
  });
};

/**
 * Validate a single validator.
 * @private
 */
SchemaType.prototype._validateSingleValidator = function(v, value, path, options, callback) {
  const validator = v.validator;
  const validatorProperties = utils.clone(v);
  validatorProperties.path = options && options.path ? options.path : path;
  validatorProperties.value = value;

  if (validator instanceof RegExp) {
    this._validateRegExp(validator, validatorProperties, callback);
    return;
  }

  if (typeof validator !== 'function') {
    callback(null);
    return;
  }

  if (value === undefined && validator !== this.requiredValidator) {
    callback(null);
    return;
  }

  if (validatorProperties.isAsync) {
    asyncValidate(validator, this.$$context, value, validatorProperties, callback);
    return;
  }

  this._validateFunction(validator, validatorProperties, callback);
};

/**
 * Validate using RegExp.
 * @private
 */
SchemaType.prototype._validateRegExp = function(validator, validatorProperties, callback) {
  const ok = validator.test(validatorProperties.value);
  this._handleValidationResult(ok, validatorProperties, callback);
};

/**
 * Validate using function.
 * @private
 */
SchemaType.prototype._validateFunction = function(validator, validatorProperties, callback) {
  let ok;
  try {
    if (validatorProperties.propsParameter) {
      ok = validator.call(this.$$context, validatorProperties.value, validatorProperties);
    } else {
      ok = validator.call(this.$$context, validatorProperties.value);
    }
  } catch (error) {
    ok = false;
    validatorProperties.reason = error;
    if (error.message) {
      validatorProperties.message = error.message;
    }
  }

  this._handleValidationPromiseOrResult(ok, validatorProperties, callback);
};

/**
 * Handle validation result or promise.
 * @private
 */
SchemaType.prototype._handleValidationPromiseOrResult = function(ok, validatorProperties, callback) {
  if (ok != null && typeof ok.then === 'function') {
    ok.then(
      function(result) { callback(null); },
      function(error) {
        validatorProperties.reason = error;
        validatorProperties.message = error.message;
        callback(error);
      });
  } else {
    this._handleValidationResult(ok, validatorProperties, callback);
  }
};

/**
 * Handle validation result.
 * @private
 */
SchemaType.prototype._handleValidationResult = function(ok, validatorProperties, callback) {
  if (ok === undefined || ok) {
    callback(null);
  } else {
    const ErrorConstructor = validatorProperties.ErrorConstructor || ValidatorError;
    const err = new ErrorConstructor(validatorProperties);
    err[validatorErrorSymbol] = true;
    callback(err);
  }
};

/*!
 * Handle async validators
 */

function asyncValidate(validator, scope, value, props, cb) {
  let called = false;
  const returnVal = validator.call(scope, value, function(ok, customMsg) {
    if (called) {
      return;
    }
    called = true;
    if (customMsg) {
      props.message = customMsg;
    }
    cb(ok, props);
  });
  if (typeof returnVal === 'boolean') {
    called = true;
    cb(returnVal, props);
  } else if (returnVal && typeof returnVal.then === 'function') {
    // Promise
    returnVal.then(
      function(ok) {
        if (called) {
          return;
        }
        called = true;
        cb(ok, props);
      },
      function(error) {
        if (called) {
          return;
        }
        called = true;

        props.reason = error;
        props.message = error.message;
        cb(false, props);
      });
  }
}

/**
 * Performs a validation of `value` using the validators declared for this SchemaType.
 *
 * ####Note:
 *
 * This method ignores the asynchronous validators.
 *
 * @param {any} value
 * @param {Object} scope
 * @return {MongooseError|undefined}
 * @api private
 */

SchemaType.prototype.doValidateSync = function(value, scope, options) {
  const path = this.path;
  const count = this.validators.length;

  if (!count) {
    return null;
  }

  let validators = this._getValidatorsForSync(value);
  if (!validators) {
    return null;
  }

  let err = null;
  validators.forEach(function(v) {
    if (err) {
      return;
    }

    err = this._validateSyncValidator(v, value, path, options);
  }, this);

  return err;
};

/**
 * Get validators for sync validation.
 * @private
 */
SchemaType.prototype._getValidatorsForSync = function(value) {
  if (value === void 0) {
    if (this.validators.length > 0 && this.validators[0].type === 'required') {
      return [this.validators[0]];
    }
    return null;
  }
  return this.validators;
};

/**
 * Validate a single validator synchronously.
 * @private
 */
SchemaType.prototype._validateSyncValidator = function(v, value, path, options) {
  if (v == null || typeof v !== 'object') {
    return null;
  }

  const validator = v.validator;
  const validatorProperties = utils.clone(v);
  validatorProperties.path = options && options.path ? options.path : path;
  validatorProperties.value = value;

  if (validator.isAsync) {
    return null;
  }

  if (validator instanceof RegExp) {
    return this._validateSyncRegExp(validator, validatorProperties);
  }

  if (typeof validator !== 'function') {
    return null;
  }

  return this._validateSyncFunction(validator, validatorProperties);
};

/**
 * Validate using RegExp synchronously.
 * @private
 */
SchemaType.prototype._validateSyncRegExp = function(validator, validatorProperties) {
  const ok = validator.test(validatorProperties.value);
  return this._buildSyncValidationError(ok, validatorProperties);
};

/**
 * Validate using function synchronously.
 * @private
 */
SchemaType.prototype._validateSyncFunction = function(validator, validatorProperties) {
  let ok;
  try {
    if (validatorProperties.propsParameter) {
      ok = validator.call(this, validatorProperties.value, validatorProperties);
    } else {
      ok = validator.call(this, validatorProperties.value);
    }
  } catch (error) {
    ok = false;
    validatorProperties.reason = error;
  }

  if (ok != null && typeof ok.then === 'function') {
    return null;
  }

  return this._buildSyncValidationError(ok, validatorProperties);
};

/**
 * Build sync validation error.
 * @private
 */
SchemaType.prototype._buildSyncValidationError = function(ok, validatorProperties) {
  if (ok !== undefined && !ok) {
    const ErrorConstructor = validatorProperties.ErrorConstructor || ValidatorError;
    const err = new ErrorConstructor(validatorProperties);
    err[validatorErrorSymbol] = true;
    return err;
  }
  return null;
};

/**
 * Determines if value is a valid Reference.
 *
 * @param {SchemaType} self
 * @param {Object} value
 * @param {Document} doc
 * @param {Boolean} init
 * @return {Boolean}
 * @api private
 */

SchemaType._isRef = function(self, value, doc, init) {
  const ref = self._getRefValue(init, doc);

  if (!ref) {
    return false;
  }

  if (value == null) {
    return true;
  }

  return self._isValidRefValue(value, init);
};

/**
 * Get ref value from options or document.
 * @private
 */
SchemaType._getRefValue = function(init, doc) {
  let ref = init && this.options && (this.options.ref || this.options.refPath);

  if (ref) {
    return ref;
  }

  if (!doc || doc.$__ == null) {
    return null;
  }

  const path = doc.$__fullPath(this.path);
  const owner = doc.ownerDocument ? doc.ownerDocument() : doc;
  return owner.populated(path) || doc.populated(this.path);
};

/**
 * Check if value is valid for ref.
 * @private
 */
SchemaType._isValidRefValue = function(value, init) {
  if (Buffer.isBuffer(value) || value._bsontype === 'Binary') {
    return init;
  }

  if (utils.isObject(value)) {
    return true;
  }

  return init;
};

/*!
 * ignore
 */

SchemaType.prototype._castRef = function _castRef(value, doc, init) {
  if (value == null) {
    return value;
  }

  if (value.$__ != null) {
    value.$__.wasPopulated = true;
    return value;
  }

  // setting a populated path
  if (Buffer.isBuffer(value) || !utils.isObject(value)) {
    if (init) {
      return value;
    }
    throw new CastError(this.instance, value, this.path, null, this);
  }

  // Handle the case where user directly sets a populated
  // path to a plain object; cast to the Model used in
  // the population query.
  const path = doc.$__fullPath(this.path);
  const owner = doc.ownerDocument ? doc.ownerDocument() : doc;
  const pop = owner.populated(path, true);
  let ret = value;
  if (!this._shouldCreateNewPopulatedModel(doc, path)) {
    ret = new pop.options[populateModelSymbol](value);
    ret.$__.wasPopulated = true;
  }

  return ret;
};

/**
 * Check if new populated model should be created.
 * @private
 */
SchemaType.prototype._shouldCreateNewPopulatedModel = function(doc, path) {
  return doc.$__.populated &&
    doc.$__.populated[path] &&
    doc.$__.populated[path].options &&
    doc.$__.populated[path].options.options &&
    doc.$__.populated[path].options.options.lean;
};

/*!
 * ignore
 */

function handleSingle(val) {
  return this.castForQuery(val);
}

/*!
 * ignore
 */

function handleArray(val) {
  const _this = this;
  if (!Array.isArray(val)) {
    return [this.castForQuery(val)];
  }
  return val.map(function(m) {
    return _this.castForQuery(m);
  });
}

/*!
 * Just like handleArray, except also allows `[]` because surprisingly
 * `$in: [1, []]` works fine
 */

function handle$in(val) {
  const _this = this;
  if (!Array.isArray(val)) {
    return [this.castForQuery(val)];
  }
  return val.map(function(m) {
    if (Array.isArray(m) && m.length === 0) {
      return m;
    }
    return _this.castForQuery(m);
  });
}

/*!
 * ignore
 */

SchemaType.prototype.$conditionalHandlers = {
  $all: handleArray,
  $eq: handleSingle,
  $in: handle$in,
  $ne: handleSingle,
  $nin: handle$in,
  $exists: $exists,
  $type: $type
};

/*!
 * Wraps `castForQuery` to handle context
 */

SchemaType.prototype.castForQueryWrapper = function(params) {
  this.$$context = params.context;
  const ret = this._castForQueryByParams(params);
  this.$$context = null;
  return ret;
};

/**
 * Cast for query based on params.
 * @private
 */
SchemaType.prototype._castForQueryByParams = function(params) {
  if ('$conditional' in params) {
    return this.castForQuery(params.$conditional, params.val);
  }
  if (params.$skipQueryCastForUpdate || params.$applySetters) {
    return this._castForQuery(params.val);
  }
  return this.castForQuery(params.val);
};

/**
 * Cast the given value with the given optional query operator.
 *
 * @param {String} [$conditional] query operator, like `$eq` or `$in`
 * @param {any} val
 * @api private
 */

SchemaType.prototype.castForQuery = function($conditional, val) {
  let handler;
  if (arguments.length === 2) {
    handler = this.$conditionalHandlers[$conditional];
    if (!handler) {
      throw new Error('Can\'t use ' + $conditional);
    }
    return handler.call(this, val);
  }
  val = $conditional;
  return this._castForQuery(val);
};

/*!
 * Internal switch for runSetters
 *
 * @api private
 */

SchemaType.prototype._castForQuery = function(val) {
  return this.applySetters(val, this.$$context);
};

/**
 * Override the function the required validator uses to check whether a value
 * passes the `required` check. Override this on the individual SchemaType.
 *
 * ####Example:
 *
 *     // Use this to allow empty strings to pass the `required` validator
 *     mongoose.Schema.Types.String.checkRequired(v => typeof v === 'string');
 *
 * @param {Function} fn
 * @return {Function}
 * @static
 * @receiver SchemaType
 * @function checkRequired
 * @api public
 */

SchemaType.checkRequired = function(fn) {
  if (arguments.length > 0) {
    this._checkRequired = fn;
  }

  return this._checkRequired;
};

/**
 * Default check for if this path satisfies the `required` validator.
 *
 * @param {any} val
 * @api private
 */

SchemaType.prototype.checkRequired = function(val) {
  return val != null;
};

/*!
 * ignore
 */

SchemaType.prototype.clone = function() {
  const options = Object.assign({}, this.options);
  const schematype = new this.constructor(this.path, options, this.instance);
  schematype.validators = this.validators.slice();
  if (this.requiredValidator !== undefined) schematype.requiredValidator = this.requiredValidator;
  if (this.defaultValue !== undefined) schematype.defaultValue = this.defaultValue;
  if (this.$immutable !== undefined && this.options.immutable === undefined) {
    schematype.$immutable = this.$immutable;

    handleImmutable(schematype);
  }
  if (this._index !== undefined) schematype._index = this._index;
  if (this.selected !== undefined) schematype.selected = this.selected;
  if (this.isRequired !== undefined) schematype.isRequired = this.isRequired;
  if (this.originalRequiredValue !== undefined) schematype.originalRequiredValue = this.originalRequiredValue;
  schematype.getters = this.getters.slice();
  schematype.setters = this.setters.slice();
  return schematype;
};

/*!
 * Module exports.
 */

module.exports = exports = SchemaType;

exports.CastError = CastError;

exports.ValidatorError = ValidatorError;