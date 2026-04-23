'use strict';

const util = require('crypto-lib').util;

//
// Data structures for parameter grouping
//

/**
 * @typedef {Object} AppServices
 * @property {Object} $scope - Angular scope
 * @property {Object} $window - Angular window service
 * @property {Object} $filter - Angular filter service
 * @property {Object} $q - Angular promise service
 */

/**
 * @typedef {Object} AppDependencies
 * @property {Object} appConfig - Application configuration
 * @property {Object} auth - Authentication service
 * @property {Object} keychain - Keychain service
 * @property {Object} pgp - PGP service
 */

/**
 * @typedef {Object} MailServices
 * @property {Object} email - Email service
 * @property {Object} outbox - Outbox service
 * @property {Object} dialog - Dialog service
 * @property {Object} axe - Logging service
 * @property {Object} status - Status service
 * @property {Object} invitation - Invitation service
 */

/**
 * @typedef {Object} RecipientCheckContext
 * @property {Array} recipients - Array of recipients to check
 * @property {Function} checkFn - Function to execute for each recipient
 */

/**
 * @typedef {Object} MessageData
 * @property {Array} from - From addresses
 * @property {Array} to - To addresses
 * @property {Array} cc - CC addresses
 * @property {Array} bcc - BCC addresses
 * @property {string} subject - Message subject
 * @property {string} body - Message body
 * @property {Array} attachments - Message attachments
 * @property {Date} sentDate - Sent date
 * @property {Object} headers - Message headers
 */

/**
 * @typedef {Object} ReplyContext
 * @property {Object} replyTo - Original message
 * @property {boolean} replyAll - Reply to all flag
 * @property {boolean} forward - Forward flag
 */

/**
 * @typedef {Object} InvitationContext
 * @property {string} sender - Sender email
 * @property {Array} invitees - Invitee addresses
 * @property {Array} invited - Already invited addresses
 */

//
// Helper functions
//

/**
 * Creates a string representation of email addresses
 * @param {Array} array - Array of email objects
 * @returns {string} Formatted email string
 */
function createAddressString(array) {
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
 * @returns {boolean} True if address exists
 */
function filterEmptyAddresses(addr) {
  return !!addr.address;
}

/**
 * Gets current folder from scope state
 * @param {Object} scope - Angular scope
 * @returns {Object} Current folder
 */
function getCurrentFolder(scope) {
  return scope.state.nav.currentFolder;
}

/**
 * Validates and normalizes recipient address
 * @param {Object} recipient - Recipient object
 * @param {Function} validateFn - Validation function
 */
function normalizeRecipient(recipient, validateFn) {
  if (recipient.address) {
    recipient.displayId = recipient.address;
  } else {
    recipient.address = recipient.displayId;
  }
  recipient.key = undefined;
  recipient.secure = false;
}

/**
 * Checks recipient security status
 * @param {Object} recipient - Recipient object
 * @returns {boolean} True if recipient is not secure
 */
function isRecipientInsecure(recipient) {
  return !recipient.secure;
}

//
// Log appender for bug reports
//

/**
 * Creates a log appender for bug report dumps
 * @param {Object} axe - Logging service
 * @returns {Object} Appender object
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
 * Resets all composer fields to default values
 * @param {Object} scope - Angular scope
 */
function resetFields(scope) {
  scope.writerTitle = 'New email';
  scope.to = [];
  scope.showCC = false;
  scope.cc = [];
  scope.showBCC = false;
  scope.bcc = [];
  scope.subject = '';
  scope.body = '';
  scope.attachments = [];
  scope.addressBookCache = undefined;
  scope.showInvite = undefined;
  scope.invited = [];
}

/**
 * Populates fields for bug report
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.appConfig - App configuration
 * @param {Object} params.axe - Logging service
 */
function populateBugReportFields(params) {
  const { scope, appConfig, axe } = params;
  const str = appConfig.string;
  const cfg = appConfig.config;
  
  const appender = createLogAppender(axe);
  axe.dump(appender);
  const dump = appender.getDump();

  scope.to = [{
    address: str.supportAddress
  }];
  scope.writerTitle = str.bugReportTitle;
  scope.subject = str.bugReportSubject;
  scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + dump;
}

/**
 * Extracts reply context from original message
 * @param {Object} originalMsg - Original message
 * @param {Object} auth - Auth service
 * @returns {Object} Reply context with replyTo, from, sentDate
 */
function extractReplyContext(originalMsg, auth) {
  if (!originalMsg) {
    return null;
  }

  const replyTo = originalMsg.replyTo && originalMsg.replyTo[0] && originalMsg.replyTo[0].address || originalMsg.from[0].address;
  const from = originalMsg.from[0].name || replyTo;

  return {
    replyTo: replyTo,
    from: from,
    originalMsg: originalMsg
  };
}

/**
 * Populates recipient fields for reply
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.context - Reply context
 * @param {Object} params.auth - Auth service
 */
function populateReplyRecipients(params) {
  const { scope, context, auth } = params;
  const { replyTo, originalMsg } = context;

  scope.to.unshift({
    address: replyTo
  });
  scope.to.forEach(scope.verify);

  scope.references = (originalMsg.references || []);
  if (originalMsg.id && scope.references.indexOf(originalMsg.id) < 0) {
    scope.references = scope.references.concat(originalMsg.id);
  }
  if (originalMsg.id) {
    scope.inReplyTo = originalMsg.id;
  }
}

/**
 * Populates CC field for reply all
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.context - Reply context
 * @param {Object} params.auth - Auth service
 */
function populateReplyAllCc(params) {
  const { scope, context, auth } = params;
  const { replyTo, originalMsg } = context;

  originalMsg.to.concat(originalMsg.cc).forEach(function(recipient) {
    const me = auth.emailAddress;
    if (recipient.address === me && replyTo !== me) {
      return;
    }
    scope.cc.unshift({
      address: recipient.address
    });
  });

  scope.cc = _.uniq(scope.cc, function(recipient) {
    return recipient.address;
  });
  scope.showCC = true;
  scope.cc.forEach(scope.verify);
}

/**
 * Populates attachments and references for forward
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.context - Reply context
 */
function populateForwardAttachments(params) {
  const { scope, context } = params;
  const { originalMsg } = context;

  scope.attachments = [].concat(originalMsg.attachments);
  if (originalMsg.id) {
    scope.references = [originalMsg.id];
  }
}

/**
 * Populates subject line
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.context - Reply context
 * @param {boolean} params.isForward - Is forward operation
 */
function populateSubject(params) {
  const { scope, context, isForward } = params;
  const { originalMsg } = context;

  if (isForward) {
    scope.subject = 'Fwd: ' + originalMsg.subject;
  } else {
    scope.subject = originalMsg.subject ? 'Re: ' + originalMsg.subject.replace('Re: ', '') : '';
  }
}

/**
 * Populates message body
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.context - Reply context
 * @param {Object} params.filter - Angular filter service
 * @param {boolean} params.isForward - Is forward operation
 */
function populateBody(params) {
  const { scope, context, filter, isForward } = params;
  const { from, originalMsg } = context;

  const sentDate = filter('date')(originalMsg.sentDate, 'EEEE, MMM d, yyyy h:mm a');
  let body;

  if (isForward) {
    body = '\n\n' +
      '---------- Forwarded message ----------\n' +
      'From: ' + originalMsg.from[0].name + ' <' + originalMsg.from[0].address + '>\n' +
      'Date: ' + sentDate + '\n' +
      'Subject: ' + originalMsg.subject + '\n' +
      'To: ' + createAddressString(originalMsg.to) + '\n' +
      ((originalMsg.cc && originalMsg.cc.length > 0) ? 'Cc: ' + createAddressString(originalMsg.cc) + '\n' : '') +
      '\n\n';
  } else {
    body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
  }

  if (originalMsg.body) {
    body += originalMsg.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
    scope.body = body;
  }
}

/**
 * Fills composer fields based on reply/forward context
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.originalMsg - Original message
 * @param {boolean} params.replyAll - Reply to all flag
 * @param {boolean} params.isForward - Forward flag
 * @param {Object} params.auth - Auth service
 * @param {Object} params.filter - Angular filter service
 */
function fillFields(params) {
  const { scope, originalMsg, replyAll, isForward, auth, filter } = params;

  if (!originalMsg) {
    return;
  }

  scope.writerTitle = (isForward) ? 'Forward' : 'Reply';

  const context = extractReplyContext(originalMsg, auth);

  if (!isForward) {
    populateReplyRecipients({ scope, context, auth });
  }

  if (replyAll) {
    populateReplyAllCc({ scope, context, auth });
  }

  if (isForward) {
    populateForwardAttachments({ scope, context });
  }

  populateSubject({ scope, context, isForward });
  populateBody({ scope, context, filter, isForward });
}

/**
 * Checks recipient in a list
 * @param {Object} recipient - Recipient to check
 * @param {Object} params - Check parameters
 * @param {Function} params.validateFn - Validation function
 * @param {Function} params.onInvalid - Invalid handler
 * @returns {boolean} True if valid
 */
function checkRecipient(recipient, params) {
  const { validateFn, onInvalid } = params;

  if (!validateFn(recipient.address)) {
    if (onInvalid) {
      onInvalid();
    }
    return false;
  }
  return true;
}

/**
 * Counts and validates recipients
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Function} params.validateFn - Validation function
 * @param {Function} params.onInvalid - Invalid handler
 * @returns {number} Number of valid recipients
 */
function countValidRecipients(params) {
  const { scope, validateFn, onInvalid } = params;
  let numReceivers = 0;

  const checkFn = function(recipient) {
    if (checkRecipient(recipient, { validateFn, onInvalid })) {
      numReceivers++;
    }
  };

  scope.to.forEach(checkFn);
  scope.cc.forEach(checkFn);
  scope.bcc.forEach(checkFn);

  return numReceivers;
}

/**
 * Determines if all recipients are secure
 * @param {Object} scope - Angular scope
 * @returns {boolean} True if all recipients are secure
 */
function areAllRecipientsSecure(scope) {
  let allSecure = true;

  const checkFn = function(recipient) {
    if (!recipient.secure) {
      allSecure = false;
    }
  };

  scope.to.forEach(checkFn);
  scope.cc.forEach(checkFn);
  scope.bcc.forEach(checkFn);

  return allSecure;
}

/**
 * Collects unsecure recipients for invitation
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Function} params.validateFn - Validation function
 * @returns {Array} Array of invitee addresses
 */
function collectInvitees(params) {
  const { scope, validateFn } = params;
  const invitees = [];

  const checkFn = function(recipient) {
    if (validateFn(recipient.address) && !recipient.secure && scope.invited.indexOf(recipient.address) === -1) {
      invitees.push(recipient.address);
    }
  };

  scope.to.forEach(checkFn);
  scope.cc.forEach(checkFn);
  scope.bcc.forEach(checkFn);

  return invitees;
}

/**
 * Builds message object for sending
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.auth - Auth service
 * @param {Object} params.appConfig - App configuration
 * @returns {MessageData} Message object
 */
function buildMessage(params) {
  const { scope, auth, appConfig } = params;
  const str = appConfig.string;

  const message = {
    from: [{
      name: auth.realname,
      address: auth.emailAddress
    }],
    to: scope.to.filter(filterEmptyAddresses),
    cc: scope.cc.filter(filterEmptyAddresses),
    bcc: scope.bcc.filter(filterEmptyAddresses),
    subject: scope.subject.trim() ? scope.subject.trim() : str.fallbackSubject,
    body: scope.body.trim(),
    attachments: scope.attachments,
    sentDate: new Date(),
    headers: {}
  };

  if (scope.inReplyTo) {
    message.headers['in-reply-to'] = '<' + scope.inReplyTo + '>';
  }

  if (scope.references && scope.references.length) {
    message.headers.references = scope.references.map(function(reference) {
      return '<' + reference + '>';
    }).join(' ');
  }

  return message;
}

/**
 * Sends invitations to unsecure recipients
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.auth - Auth service
 * @param {Object} params.invitation - Invitation service
 * @param {Object} params.outbox - Outbox service
 * @param {Object} params.dialog - Dialog service
 * @param {Object} params.$q - Promise service
 * @returns {Promise} Invitation promise
 */
function sendInvitations(params) {
  const { scope, auth, invitation, outbox, dialog, $q } = params;

  const sender = auth.emailAddress;
  const invitees = collectInvitees({ scope, validateFn: util.validateEmailAddress });

  if (invitees.length === 0) {
    return $q.when();
  }

  scope.showInvite = false;

  return $q(function(resolve) {
    resolve();
  }).then(function() {
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
      scope.invited.push(recipientAddress);
    });

    return Promise.all(sendJobs);

  }).catch(function(err) {
    scope.showInvite = true;
    return dialog.error(err);
  });
}

/**
 * Verifies recipient key and updates security status
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.recipient - Recipient object
 * @param {Object} params.keychain - Keychain service
 * @param {Object} params.pgp - PGP service
 * @param {Object} params.dialog - Dialog service
 * @param {Object} params.$q - Promise service
 * @returns {Promise} Verification promise
 */
function verifyRecipient(params) {
  const { scope, recipient, keychain, pgp, dialog, $q } = params;

  if (!recipient) {
    return;
  }

  normalizeRecipient(recipient, util.validateEmailAddress);
  scope.checkSendStatus();

  if (!util.validateEmailAddress(recipient.address)) {
    recipient.secure = undefined;
    scope.checkSendStatus();
    return;
  }

  return $q(function(resolve) {
    resolve();
  }).then(function() {
    return keychain.refreshKeyForUserId({
      userId: recipient.address
    });
  }).then(function(key) {
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
      scope.showInvite = true;
    }
    scope.checkSendStatus();
  }).catch(dialog.error);
}

/**
 * Updates send button state based on recipient security
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.appConfig - App configuration
 * @param {Object} params.dialog - Dialog service
 * @param {Function} params.validateFn - Validation function
 */
function updateSendStatus(params) {
  const { scope, appConfig, dialog, validateFn } = params;
  const str = appConfig.string;

  scope.okToSend = false;
  scope.sendBtnText = undefined;
  scope.sendBtnSecure = undefined;

  const onInvalid = function() {
    return dialog.info({
      title: 'Warning',
      message: 'Invalid recipient address!'
    });
  };

  const numReceivers = countValidRecipients({ scope, validateFn, onInvalid });

  if (numReceivers < 1) {
    scope.showInvite = false;
    return;
  }

  let allSecure = areAllRecipientsSecure(scope);

  if (scope.bcc.filter(filterEmptyAddresses).length > 0) {
    allSecure = false;
  }

  if (allSecure) {
    scope.okToSend = true;
    scope.sendBtnText = str.sendBtnSecure;
    scope.sendBtnSecure = true;
    scope.showInvite = false;
  } else {
    scope.okToSend = true;
    scope.sendBtnText = str.sendBtnClear;
    scope.sendBtnSecure = false;
  }
}

/**
 * Populates address book cache
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {Object} params.keychain - Keychain service
 * @param {Object} params.pgp - PGP service
 * @param {Object} params.dialog - Dialog service
 * @param {Object} params.$q - Promise service
 * @returns {Promise} Population promise
 */
function populateAddressBookCache(params) {
  const { scope, keychain, pgp, dialog, $q } = params;

  return $q(function(resolve) {
    resolve();
  }).then(function() {
    if (scope.addressBookCache) {
      return;
    }

    return keychain.listLocalPublicKeys().then(function(keys) {
      scope.addressBookCache = keys.map(function(key) {
        const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
        return {
          address: key.userId,
          displayId: name + ' - ' + key.userId
        };
      });
    });
  }).catch(dialog.error);
}

/**
 * Filters address book by query
 * @param {Object} params - Configuration object
 * @param {Object} params.scope - Angular scope
 * @param {string} params.query - Search query
 * @returns {Array} Filtered addresses
 */
function filterAddressBook(params) {
  const { scope, query } = params;

  return scope.addressBookCache.filter(function(i) {
    return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
  });
}

//
// Controller
//

const WriteCtrl = function(services) {
  const { $scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation } = services;

  const str = appConfig.string;
  const cfg = appConfig.config;

  $scope.keyId = 'XXXXXXXX';

  //
  // Init
  //

  $scope.state.writer = {
    write: function(replyTo, replyAll, forward) {
      $scope.state.lightbox = 'write';
      $scope.replyTo = replyTo;

      resetFields($scope);

      fillFields({
        scope: $scope,
        originalMsg: replyTo,
        replyAll: replyAll,
        isForward: forward,
        auth: auth,
        filter: $filter
      });

      $scope.verify($scope.to[0]);
    },
    reportBug: function() {
      $scope.state.lightbox = 'write';
      resetFields($scope);
      populateBugReportFields({ scope: $scope, appConfig: appConfig, axe: axe });
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
    return verifyRecipient({
      scope: $scope,
      recipient: recipient,
      keychain: keychain,
      pgp: pgp,
      dialog: dialog,
      $q: $q
    });
  };

  /**
   * Check if it is ok to send an email depending on the invitation state of the addresses
   */
  $scope.checkSendStatus = function() {
    updateSendStatus({
      scope: $scope,
      appConfig: appConfig,
      dialog: dialog,
      validateFn: util.validateEmailAddress
    });
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
    return sendInvitations({
      scope: $scope,
      auth: auth,
      invitation: invitation,
      outbox: outbox,
      dialog: dialog,
      $q: $q
    });
  };

  //
  // Editing email body
  //

  $scope.sendToOutbox = function() {
    const message = buildMessage({
      scope: $scope,
      auth: auth,
      appConfig: appConfig
    });

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
        folder: getCurrentFolder($scope),
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
      return populateAddressBookCache({
        scope: $scope,
        keychain: keychain,
        pgp: pgp,
        dialog: dialog,
        $q: $q
      });
    }).then(function() {
      return filterAddressBook({ scope: $scope, query: query });
    }).catch(dialog.error);
  };
};

// Backward-compatible wrapper to maintain existing call sites
const WriteCtrlWrapper = function($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {
  return WriteCtrl({
    $scope: $scope,
    $window: $window,
    $filter: $filter,
    $q: $q,
    appConfig: appConfig,
    auth: auth,
    keychain: keychain,
    pgp: pgp,
    email: email,
    outbox: outbox,
    dialog: dialog,
    axe: axe,
    status: status,
    invitation: invitation
  });
};

module.exports = WriteCtrlWrapper;