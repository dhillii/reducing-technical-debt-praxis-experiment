'use strict';

const util = require('crypto-lib').util;

//
// Data structures for parameter grouping
//

/**
 * Configuration object for write controller initialization
 */
const WriteCtrlConfig = {
  $scope: null,
  $window: null,
  $filter: null,
  $q: null,
  appConfig: null,
  auth: null,
  keychain: null,
  pgp: null,
  email: null,
  outbox: null,
  dialog: null,
  axe: null,
  status: null,
  invitation: null
};

/**
 * Email message structure for composition
 */
const EmailMessage = function() {
  this.from = [];
  this.to = [];
  this.cc = [];
  this.bcc = [];
  this.subject = '';
  this.body = '';
  this.attachments = [];
  this.sentDate = null;
  this.headers = {};
};

/**
 * Reply context structure
 */
const ReplyContext = function(replyTo, replyAll, forward) {
  this.replyTo = replyTo;
  this.replyAll = replyAll;
  this.forward = forward;
};

/**
 * Log appender configuration
 */
const LogAppenderConfig = function(axe) {
  this.axe = axe;
  this.dump = '';
};

/**
 * Invitation context structure
 */
const InvitationContext = function(sender, recipientAddress) {
  this.sender = sender;
  this.recipientAddress = recipientAddress;
};

/**
 * Recipient verification context
 */
const RecipientContext = function(recipient, keychain, pgp, util) {
  this.recipient = recipient;
  this.keychain = keychain;
  this.pgp = pgp;
  this.util = util;
};

//
// Controller
//

const WriteCtrl = function(config) {
  const $scope = config.$scope;
  const $window = config.$window;
  const $filter = config.$filter;
  const $q = config.$q;
  const appConfig = config.appConfig;
  const auth = config.auth;
  const keychain = config.keychain;
  const pgp = config.pgp;
  const email = config.email;
  const outbox = config.outbox;
  const dialog = config.dialog;
  const axe = config.axe;
  const status = config.status;
  const invitation = config.invitation;

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

      resetFields();

      // fill fields depending on replyTo
      const replyContext = new ReplyContext(replyTo, replyAll, forward);
      fillFields(replyContext);

      $scope.verify($scope.to[0]);
    },
    reportBug: function() {
      $scope.state.lightbox = 'write';
      resetFields();
      reportBug();
      $scope.verify($scope.to[0]);
    },
    close: function() {
      $scope.state.lightbox = undefined;
    }
  };

  /**
   * Reset all email composition fields to default state
   */
  function resetFields() {
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
   * Generate bug report with application logs
   */
  function reportBug() {
    const logConfig = new LogAppenderConfig(axe);
    const appender = createLogAppender(logConfig);
    axe.dump(appender);

    $scope.to = [{
      address: str.supportAddress
    }];
    $scope.writerTitle = str.bugReportTitle;
    $scope.subject = str.bugReportSubject;
    $scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + logConfig.dump;
  }

  /**
   * Create log appender for bug report
   */
  function createLogAppender(logConfig) {
    return {
      log: function(level, date, component, log) {
        let levelTag = '';
        if (level === logConfig.axe.DEBUG) {
          levelTag = '[DEBUG]';
        } else if (level === logConfig.axe.INFO) {
          levelTag = '[INFO]';
        } else if (level === logConfig.axe.WARN) {
          levelTag = '[WARN]';
        } else if (level === logConfig.axe.ERROR) {
          levelTag = '[ERROR]';
        }

        let entry = levelTag + '[' + date.toISOString() + ']';

        if (component) {
          entry += '[' + component + ']';
        }

        entry += ' ' + (log || '').toString();

        if (log.stack) {
          entry += ' . Stack: ' + log.stack;
        }

        entry += '\n';
        logConfig.dump += entry;
      }
    };
  }

  /**
   * Fill email fields based on reply context
   */
  function fillFields(replyContext) {
    const re = replyContext.replyTo;
    const replyAll = replyContext.replyAll;
    const forward = replyContext.forward;

    if (!re) {
      return;
    }

    $scope.writerTitle = (forward) ? 'Forward' : 'Reply';

    const replyTo = re.replyTo && re.replyTo[0] && re.replyTo[0].address || re.from[0].address;

    // fill recipient field and references
    if (!forward) {
      $scope.to.unshift({
        address: replyTo
      });
      $scope.to.forEach($scope.verify);

      $scope.references = (re.references || []);
      if (re.id && $scope.references.indexOf(re.id) < 0) {
        $scope.references = $scope.references.concat(re.id);
      }
      if (re.id) {
        $scope.inReplyTo = re.id;
      }
    }

    if (replyAll) {
      processReplyAll(re, replyTo);
    }

    // fill attachments and references on forward
    if (forward) {
      $scope.attachments = [].concat(re.attachments);
      if (re.id) {
        $scope.references = [re.id];
      }
    }

    // fill subject
    if (forward) {
      $scope.subject = 'Fwd: ' + re.subject;
    } else {
      $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
    }

    // fill text body
    const from = re.from[0].name || replyTo;
    const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');
    const body = buildEmailBody(re, from, sentDate, forward);

    if (re.body) {
      const processedBody = re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
      $scope.body = body + processedBody;
    } else {
      $scope.body = body;
    }
  }

  /**
   * Process reply-all recipients
   */
  function processReplyAll(re, replyTo) {
    re.to.concat(re.cc).forEach(function(recipient) {
      const me = auth.emailAddress;
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
    $scope.cc.forEach($scope.verify);
  }

  /**
   * Build email body for reply or forward
   */
  function buildEmailBody(re, from, sentDate, forward) {
    const createString = function(array) {
      let str = '';
      array.forEach(function(to) {
        str += (str) ? ', ' : '';
        str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
      });
      return str;
    };

    if (forward) {
      return '\n\n' +
        '---------- Forwarded message ----------\n' +
        'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
        'Date: ' + sentDate + '\n' +
        'Subject: ' + re.subject + '\n' +
        'To: ' + createString(re.to) + '\n' +
        ((re.cc && re.cc.length > 0) ? 'Cc: ' + createString(re.cc) + '\n' : '') +
        '\n\n';
    } else {
      return '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
    }
  }

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

    if (!util.validateEmailAddress(recipient.address)) {
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
      processVerificationResult(recipient, key);
      $scope.checkSendStatus();

    }).catch(dialog.error);
  };

  /**
   * Process key verification result
   */
  function processVerificationResult(recipient, key) {
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
  }

  /**
   * Check if it is ok to send an email depending on the invitation state of the addresses
   */
  $scope.checkSendStatus = function() {
    $scope.okToSend = false;
    $scope.sendBtnText = undefined;
    $scope.sendBtnSecure = undefined;

    let allSecure = true;
    let numReceivers = 0;

    // count number of receivers and check security
    $scope.to.forEach(check);
    $scope.cc.forEach(check);
    $scope.bcc.forEach(check);

    function check(recipient) {
      if (!util.validateEmailAddress(recipient.address)) {
        return dialog.info({
          title: 'Warning',
          message: 'Invalid recipient address!'
        });
      }
      numReceivers++;
      if (!recipient.secure) {
        allSecure = false;
      }
    }

    if (numReceivers < 1) {
      $scope.showInvite = false;
      return;
    }

    if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
      allSecure = false;
    }

    if (allSecure) {
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
    const sendJobs = [];
    const invitees = [];

    $scope.showInvite = false;

    $scope.to.forEach(check);
    $scope.cc.forEach(check);
    $scope.bcc.forEach(check);

    function check(recipient) {
      if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
        invitees.push(recipient.address);
      }
    }

    return $q(function(resolve) {
      resolve();

    }).then(function() {
      invitees.forEach(function(recipientAddress) {
        const invitationContext = new InvitationContext(sender, recipientAddress);
        processInvitation(invitationContext, sendJobs);
        $scope.invited.push(recipientAddress);
      });

      return Promise.all(sendJobs);

    }).catch(function(err) {
      $scope.showInvite = true;
      return dialog.error(err);
    });
  };

  /**
   * Process single invitation
   */
  function processInvitation(invitationContext, sendJobs) {
    const invitationMail = invitation.createMail({
      sender: invitationContext.sender,
      recipient: invitationContext.recipientAddress
    });
    const promise = outbox.put(invitationMail).then(function() {
      return invitation.invite({
        recipient: invitationContext.recipientAddress,
        sender: invitationContext.sender
      });
    });
    sendJobs.push(promise);
  }

  //
  // Editing email body
  //

  $scope.sendToOutbox = function() {
    const message = buildMessage();

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
        folder: currentFolder(),
        message: $scope.replyTo
      });

    }).catch(function(err) {
      if (err.code !== 42) {
        dialog.error(err);
      }
    });
  };

  /**
   * Build email message object
   */
  function buildMessage() {
    const message = new EmailMessage();
    message.from = [{
      name: auth.realname,
      address: auth.emailAddress
    }];
    message.to = $scope.to.filter(filterEmptyAddresses);
    message.cc = $scope.cc.filter(filterEmptyAddresses);
    message.bcc = $scope.bcc.filter(filterEmptyAddresses);
    message.subject = $scope.subject.trim() ? $scope.subject.trim() : str.fallbackSubject;
    message.body = $scope.body.trim();
    message.attachments = $scope.attachments;
    message.sentDate = new Date();

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
      return keychain.listLocalPublicKeys().then(function(keys) {
        $scope.addressBookCache = keys.map(function(key) {
          const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
          return {
            address: key.userId,
            displayId: name + ' - ' + key.userId
          };
        });
      });

    }).then(function() {
      return $scope.addressBookCache.filter(function(i) {
        return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
      });

    }).catch(dialog.error);
  };

  //
  // Helpers
  //

  /**
   * Get current folder from navigation state
   */
  function currentFolder() {
    return $scope.state.nav.currentFolder;
  }

  /**
   * Filter out objects without an address property
   */
  function filterEmptyAddresses(addr) {
    return !!addr.address;
  }
};

/**
 * Backward-compatible wrapper for original function signature
 */
const WriteCtrlWrapper = function($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {
  const config = {
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
  };
  return WriteCtrl(config);
};

module.exports = WriteCtrlWrapper;