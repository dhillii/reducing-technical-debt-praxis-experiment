const moment = require('moment');
const Utils = require('./utils');

function ABSTRACT() {
  throw new Error('ABSTRACT is an abstract class and should not be instantiated directly');
}

ABSTRACT.prototype.dialectTypes = '';