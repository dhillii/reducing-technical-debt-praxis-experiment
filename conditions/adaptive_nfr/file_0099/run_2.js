'use strict';

const util = require('crypto-lib').util;

//
// Data structures for parameter grouping
//

/**
 * @typedef {Object} MailMessage
 * @property {Array} from
 * @property {Array} to
 * @property {Array} cc
 * @property {Array} bcc
 * @property {string} subject
 * @property {string} body
 * @property {Array} attachments
 * @property {Date} sentDate
 * @property {Object} headers
 */

/**
 * @typedef {Object} ReplyContext
 * @property {Object} replyTo
 * @property {boolean} replyAll
 * @property {boolean} forward
 */

/**
 * @typedef {Object} AppServices
 * @property {Object} $scope
 * @property {Object} $window
 * @property {Object} $filter
 * @property {Object} $q
 * @property {Object} appConfig
 * @property {Object} auth
 * @property {Object} keychain
 * @property {Object} pgp
 * @property {Object} email
 * @property {Object} outbox
 * @property {Object} dialog
 * @property {Object} axe
 * @property {Object} status
 * @property {Object} invitation
 */

/**
 * @typedef {Object} LogEntry
 * @property {number} level
 * @property {Date} date
 * @property {string} component
 * @property {string|Error} log
 */

/**
 * @typedef {Object} RecipientCheckContext
 * @property {Array} recipients
 * @property {Function} checkFn
 */

//
// Helper functions
//

/**
 * Creates a formatted string from recipient array
 * @param {Array} array - Array of recipient objects
 * @returns {string}
 */
function createRecipientString(array) {
  let str = '';
  array.forEach(function(to) {
    str += (str) ? ', ' : '';
    str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
  });
  return str;
}

/**
 * Filters out objects without an address property
 * @param {Object} addr - Address object
 * @returns {boolean}
 */
function filterEmptyAddresses(addr) {
  return !!addr.address;
}

/**
 * Validates email address
 * @param {string} address - Email address to validate
 * @returns {boolean}
 */
function isValidEmail(address) {
  return util.validateEmailAddress(address);
}

/**
 * Checks recipient and validates address
 * @param {Object} recipient - Recipient object
 * @param {Object} context - Context with dialog and util functions
 * @returns {boolean}
 */
function checkRecipientValidity(recipient, context) {
  if (!isValidEmail(recipient.address)) {
    context.dialog.info({
      title: 'Warning',
      message: 'Invalid recipient address!'
    });
    return false;
  }
  return true;
}

//
// Log appender for bug reports
//

/**
 * Creates a log appender for collecting debug information
 * @param {Object} axe - Logging service
 * @returns {Object}
 */
function createLogAppender(axe) {
  let dump = '';

  return {
    log: function(level, date, component, log) {
      if (level === axe.DEBUG) {
        dump += '[DEBUG]';
      } else if (level === axe.INFO) {
        dump += '[INFO]';
      } else if (level === axe.WARN) {
        dump += '[WARN]';
      } else if (level === axe.ERROR) {
        dump += '[ERROR]';
      }

      dump += '[' + date.toISOString() + ']';

      if (component) {
        dump += '[' + component + ']';
      }

      dump += ' ' + (log || '').toString();

      if (log.stack) {
        dump += ' . Stack: ' + log.stack;
      }

      dump += '\n';
    },
    getDump: function() {
      return dump;
    }
  };
}

//
// Field initialization
//

/**
 * Resets all composer fields to default state
 * @param {Object} $scope - Angular scope
 */
function resetFields($scope) {
  $scope.writerTitle = 'New email';
  $scope.to = [];
  $scope.showCC = false;
  $scope.cc = [];
  $scope.showBCC = false;
  $scope.bcc = [];
  $scope.subject = '';
  $scope.body = '';
  $scope.attachments = [];
  $scope.addressBookCache = undefined;
  $scope.showInvite = undefined;
  $scope.invited = [];
}

/**
 * Prepares bug report email
 * @param {Object} context - Context object with $scope, str, cfg, axe
 */
function prepareBugReport(context) {
  const { $scope, str, cfg, axe } = context;
  const appender = createLogAppender(axe);
  axe.dump(appender);

  $scope.to = [{
    address: str.supportAddress
  }];
  $scope.writerTitle = str.bugReportTitle;
  $scope.subject = str.bugReportSubject;
  $scope.body = str.bugReportBody
    .replace('{0}', navigator.userAgent)
    .replace('{1}', cfg.appVersion) + appender.getDump();
}

//
// Reply/Forward field population
//

/**
 * Extracts reply-to address from email
 * @param {Object} email - Email object
 * @returns {string}
 */
function extractReplyToAddress(email) {
  return email.replyTo && email.replyTo[0] && email.replyTo[0].address || email.from[0].address;
}

/**
 * Populates recipient fields for reply
 * @param {Object} context - Context with $scope, auth, verify function
 * @param {Object} email - Original email
 * @param {string} replyTo - Reply-to address
 */
function populateReplyRecipients(context, email, replyTo) {
  const { $scope, auth, verify } = context;

  $scope.to.unshift({
    address: replyTo
  });
  $scope.to.forEach(verify);

  $scope.references = (email.references || []);
  if (email.id && $scope.references.indexOf(email.id) < 0) {
    $scope.references = $scope.references.concat(email.id);
  }
  if (email.id) {
    $scope.inReplyTo = email.id;
  }
}

/**
 * Populates CC field for reply-all
 * @param {Object} context - Context with $scope, auth, verify function
 * @param {Object} email - Original email
 * @param {string} replyTo - Reply-to address
 */
function populateReplyAllRecipients(context, email, replyTo) {
  const { $scope, auth, verify } = context;
  const me = auth.emailAddress;

  email.to.concat(email.cc).forEach(function(recipient) {
    if (recipient.address === me && replyTo !== me) {
      return;
    }
    $scope.cc.unshift({
      address: recipient.address
    });
  });

  $scope.cc = _.uniq($scope.cc, function(recipient) {
    return recipient.address;
  });
  $scope.showCC = true;
  $scope.cc.forEach(verify);
}

/**
 * Populates attachments and references for forward
 * @param {Object} $scope - Angular scope
 * @param {Object} email - Original email
 */
function populateForwardAttachments($scope, email) {
  $scope.attachments = [].concat(email.attachments);
  if (email.id) {
    $scope.references = [email.id];
  }
}

/**
 * Sets subject line based on reply/forward type
 * @param {Object} $scope - Angular scope
 * @param {Object} email - Original email
 * @param {boolean} forward - Is this a forward?
 */
function setSubjectLine($scope, email, forward) {
  if (forward) {
    $scope.subject = 'Fwd: ' + email.subject;
  } else {
    $scope.subject = email.subject ? 'Re: ' + email.subject.replace('Re: ', '') : '';
  }
}

/**
 * Builds email body for reply/forward
 * @param {Object} context - Context with $scope, $filter
 * @param {Object} email - Original email
 * @param {boolean} forward - Is this a forward?
 */
function buildEmailBody(context, email, forward) {
  const { $scope, $filter } = context;
  const replyTo = extractReplyToAddress(email);
  const from = email.from[0].name || replyTo;
  const sentDate = $filter('date')(email.sentDate, 'EEEE, MMM d, yyyy h:mm a');

  let body;

  if (forward) {
    body = '\n\n' +
      '---------- Forwarded message ----------\n' +
      'From: ' + email.from[0].name + ' <' + email.from[0].address + '>\n' +
      'Date: ' + sentDate + '\n' +
      'Subject: ' + email.subject + '\n' +
      'To: ' + createRecipientString(email.to) + '\n' +
      ((email.cc && email.cc.length > 0) ? 'Cc: ' + createRecipientString(email.cc) + '\n' : '') +
      '\n\n';
  } else {
    body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
  }

  if (email.body) {
    body += email.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
    $scope.body = body;
  }
}

/**
 * Fills composer fields based on reply/forward context
 * @param {Object} context - Context with $scope, $filter, auth
 * @param {Object} email - Original email
 * @param {Object} replyContext - Reply context with replyAll and forward flags
 */
function fillFields(context, email, replyContext) {
  const { $scope } = context;
  const { replyAll, forward } = replyContext;

  if (!email) {
    return;
  }

  $scope.writerTitle = (forward) ? 'Forward' : 'Reply';

  const replyTo = extractReplyToAddress(email);

  if (!forward) {
    populateReplyRecipients(context, email, replyTo);
  }

  if (replyAll) {
    populateReplyAllRecipients(context, email, replyTo);
  }

  if (forward) {
    populateForwardAttachments($scope, email);
  }

  setSubjectLine($scope, email, forward);
  buildEmailBody(context, email, forward);
}

//
// Recipient verification
//

/**
 * Processes recipient verification result
 * @param {Object} context - Context with $scope, pgp, dialog
 * @param {Object} recipient - Recipient object
 * @param {Object} key - Public key if found
 */
function processVerificationResult(context, recipient, key) {
  const { $scope, pgp, dialog } = context;

  if (key) {
    const userIds = pgp.getKeyParams(key.publicKey).userIds;
    const matchingUserId = _.findWhere(userIds, {
      emailAddress: recipient.address
    });

    if (matchingUserId) {
      recipient.key = key;
      recipient.secure = true;
    }
  } else {
    $scope.showInvite = true;
  }
  $scope.checkSendStatus();
}

//
// Send status checking
//

/**
 * Checks recipient security status
 * @param {Object} recipient - Recipient object
 * @param {Object} context - Context with dialog
 * @returns {boolean}
 */
function checkRecipientSecurity(recipient, context) {
  if (!isValidEmail(recipient.address)) {
    context.dialog.info({
      title: 'Warning',
      message: 'Invalid recipient address!'
    });
    return false;
  }
  return !recipient.secure;
}

/**
 * Counts receivers and checks overall security
 * @param {Object} context - Context with $scope and dialog
 * @returns {Object} - { numReceivers, allSecure }
 */
function analyzeRecipients(context) {
  const { $scope, dialog } = context;
  let allSecure = true;
  let numReceivers = 0;

  const checkFn = function(recipient) {
    if (!isValidEmail(recipient.address)) {
      dialog.info({
        title: 'Warning',
        message: 'Invalid recipient address!'
      });
      return;
    }
    numReceivers++;
    if (!recipient.secure) {
      allSecure = false;
    }
  };

  $scope.to.forEach(checkFn);
  $scope.cc.forEach(checkFn);
  $scope.bcc.forEach(checkFn);

  return { numReceivers, allSecure };
}

//
// Message building
//

/**
 * Builds email message object for outbox
 * @param {Object} context - Context with $scope, auth, str
 * @returns {MailMessage}
 */
function buildMessage(context) {
  const { $scope, auth, str } = context;

  const message = {
    from: [{
      name: auth.realname,
      address: auth.emailAddress
    }],
    to: $scope.to.filter(filterEmptyAddresses),
    cc: $scope.cc.filter(filterEmptyAddresses),
    bcc: $scope.bcc.filter(filterEmptyAddresses),
    subject: $scope.subject.trim() ? $scope.subject.trim() : str.fallbackSubject,
    body: $scope.body.trim(),
    attachments: $scope.attachments,
    sentDate: new Date(),
    headers: {}
  };

  if ($scope.inReplyTo) {
    message.headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
  }

  if ($scope.references && $scope.references.length) {
    message.headers.references = $scope.references.map(function(reference) {
      return '<' + reference + '>';
    }).join(' ');
  }

  return message;
}

//
// Invitation handling
//

/**
 * Collects invitees from recipient lists
 * @param {Object} context - Context with $scope
 * @returns {Array}
 */
function collectInvitees(context) {
  const { $scope } = context;
  const invitees = [];

  const checkFn = function(recipient) {
    if (isValidEmail(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
      invitees.push(recipient.address);
    }
  };

  $scope.to.forEach(checkFn);
  $scope.cc.forEach(checkFn);
  $scope.bcc.forEach(checkFn);

  return invitees;
}

/**
 * Sends invitation emails
 * @param {Object} context - Context with invitation, outbox, $scope, $q
 * @param {Array} invitees - Array of email addresses to invite
 * @param {string} sender - Sender email address
 * @returns {Promise}
 */
function sendInvitations(context, invitees, sender) {
  const { invitation, outbox, $scope, $q } = context;
  const sendJobs = [];

  invitees.forEach(function(recipientAddress) {
    const invitationMail = invitation.createMail({
      sender: sender,
      recipient: recipientAddress
    });

    const promise = outbox.put(invitationMail).then(function() {
      return invitation.invite({
        recipient: recipientAddress,
        sender: sender
      });
    });

    sendJobs.push(promise);
    $scope.invited.push(recipientAddress);
  });

  return Promise.all(sendJobs);
}

//
// Address book lookup
//

/**
 * Populates address book cache
 * @param {Object} context - Context with $scope, keychain, pgp
 * @returns {Promise}
 */
function populateAddressBookCache(context) {
  const { $scope, keychain, pgp } = context;

  return keychain.listLocalPublicKeys().then(function(keys) {
    $scope.addressBookCache = keys.map(function(key) {
      const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
      return {
        address: key.userId,
        displayId: name + ' - ' + key.userId
      };
    });
  });
}

/**
 * Filters address book by query
 * @param {Object} $scope - Angular scope
 * @param {string} query - Search query
 * @returns {Array}
 */
function filterAddressBook($scope, query) {
  return $scope.addressBookCache.filter(function(i) {
    return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
  });
}

//
// Controller
//

const WriteCtrl = function(services) {
  const {
    $scope, $window, $filter, $q, appConfig, auth, keychain, pgp,
    email, outbox, dialog, axe, status, invitation
  } = services;

  const str = appConfig.string;
  const cfg = appConfig.config;

  // set default value so that the popover height is correct on init
  $scope.keyId = 'XXXXXXXX';

  //
  // Init
  //

  $scope.state.writer = {
    write: function(replyTo, replyAll, forward) {
      $scope.state.lightbox = 'write';
      $scope.replyTo = replyTo;

      resetFields($scope);

      const replyContext = { replyAll, forward };
      const fillContext = { $scope, $filter, auth };
      fillFields(fillContext, replyTo, replyContext);

      $scope.verify($scope.to[0]);
    },
    reportBug: function() {
      $scope.state.lightbox = 'write';
      resetFields($scope);
      const bugContext = { $scope, str, cfg, axe };
      prepareBugReport(bugContext);
      $scope.verify($scope.to[0]);
    },
    close: function() {
      $scope.state.lightbox = undefined;
    }
  };

  //
  // Editing headers
  //

  /**
   * Warn users when using BCC
   */
  $scope.toggleShowBCC = function() {
    $scope.showBCC = true;
    return dialog.info({
      title: 'Warning',
      message: 'Cannot send encrypted messages with BCC!'
    });
  };

  /**
   * Verify email address and fetch its public key
   */
  $scope.verify = function(recipient) {
    if (!recipient) {
      return;
    }

    if (recipient.address) {
      recipient.displayId = recipient.address;
    } else {
      recipient.address = recipient.displayId;
    }

    recipient.key = undefined;
    recipient.secure = false;
    $scope.checkSendStatus();

    if (!isValidEmail(recipient.address)) {
      recipient.secure = undefined;
      $scope.checkSendStatus();
      return;
    }

    return $q(function(resolve) {
      resolve();

    }).then(function() {
      return keychain.refreshKeyForUserId({
        userId: recipient.address
      });

    }).then(function(key) {
      const verifyContext = { $scope, pgp, dialog };
      processVerificationResult(verifyContext, recipient, key);

    }).catch(dialog.error);
  };

  /**
   * Check if it is ok to send an email depending on the invitation state of the addresses
   */
  $scope.checkSendStatus = function() {
    $scope.okToSend = false;
    $scope.sendBtnText = undefined;
    $scope.sendBtnSecure = undefined;

    const analyzeContext = { $scope, dialog };
    const { numReceivers, allSecure } = analyzeRecipients(analyzeContext);

    if (numReceivers < 1) {
      $scope.showInvite = false;
      return;
    }

    const hasBcc = $scope.bcc.filter(filterEmptyAddresses).length > 0;
    const isSecure = allSecure && !hasBcc;

    if (isSecure) {
      $scope.okToSend = true;
      $scope.sendBtnText = str.sendBtnSecure;
      $scope.sendBtnSecure = true;
      $scope.showInvite = false;
    } else {
      $scope.okToSend = true;
      $scope.sendBtnText = str.sendBtnClear;
      $scope.sendBtnSecure = false;
    }
  };

  //
  // Editing attachments
  //

  $scope.remove = function(attachment) {
    $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
  };

  /**
   * Invite all users without a public key
   */
  $scope.invite = function() {
    const sender = auth.emailAddress;

    $scope.showInvite = false;

    const collectContext = { $scope };
    const invitees = collectInvitees(collectContext);

    return $q(function(resolve) {
      resolve();

    }).then(function() {
      const sendContext = { invitation, outbox, $scope, $q };
      return sendInvitations(sendContext, invitees, sender);

    }).catch(function(err) {
      $scope.showInvite = true;
      return dialog.error(err);
    });
  };

  //
  // Editing email body
  //

  $scope.sendToOutbox = function() {
    const buildContext = { $scope, auth, str };
    const message = buildMessage(buildContext);

    $scope.state.writer.close();
    if ($scope.replyTo) {
      status.setReading(false);
    }

    return $q(function(resolve) {
      resolve();

    }).then(function() {
      return outbox.put(message);

    }).then(function() {
      if (!$scope.replyTo || $scope.replyTo.answered) {
        return;
      }

      $scope.replyTo.answered = true;
      return email.setFlags({
        folder: $scope.state.nav.currentFolder,
        message: $scope.replyTo
      });

    }).catch(function(err) {
      if (err.code !== 42) {
        dialog.error(err);
      }
    });
  };

  //
  // Tag input & Autocomplete
  //

  $scope.tagStyle = function(recipient) {
    const classes = ['label'];
    if (recipient.secure === false) {
      classes.push('label--invalid');
    }
    return classes;
  };

  $scope.lookupAddressBook = function(query) {
    return $q(function(resolve) {
      resolve();

    }).then(function() {
      if ($scope.addressBookCache) {
        return;
      }
      const cacheContext = { $scope, keychain, pgp };
      return populateAddressBookCache(cacheContext);

    }).then(function() {
      return filterAddressBook($scope, query);

    }).catch(dialog.error);
  };
};

module.exports = WriteCtrl;