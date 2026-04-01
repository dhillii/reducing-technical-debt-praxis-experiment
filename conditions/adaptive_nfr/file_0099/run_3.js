```javascript
'use strict';

const util = require('crypto-lib').util;

//
// Parameter Objects
//

/**
 * @typedef {Object} WriteControllerDependencies
 * @property {Object} $scope - Angular scope
 * @property {Object} $window - Angular window service
 * @property {Object} $filter - Angular filter service
 * @property {Object} $q - Angular promise service
 * @property {Object} appConfig - Application configuration
 * @property {Object} auth - Authentication service
 * @property {Object} keychain - Keychain service
 * @property {Object} pgp - PGP service
 * @property {Object} email - Email service
 * @property {Object} outbox - Outbox service
 * @property {Object} dialog - Dialog service
 * @property {Object} axe - Logging service
 * @property {Object} status - Status service
 * @property {Object} invitation - Invitation service
 */

/**
 * @typedef {Object} WriteState
 * @property {Function} write - Write email handler
 * @property {Function} reportBug - Report bug handler
 * @property {Function} close - Close writer handler
 */

/**
 * @typedef {Object} RecipientVerifyContext
 * @property {Object} recipient - Recipient object
 * @property {Object} keychain - Keychain service
 * @property {Object} pgp - PGP service
 * @property {Object} auth - Auth service
 * @property {Object} dialog - Dialog service
 * @property {Object} $q - Promise service
 * @property {Function} checkSendStatus - Status check callback
 */

/**
 * @typedef {Object} FillFieldsContext
 * @property {Object} $scope - Angular scope
 * @property {Object} $filter - Angular filter service
 * @property {Object} auth - Auth service
 * @property {string} str - String resources
 */

/**
 * @typedef {Object} SendMessageContext
 * @property {Object} $scope - Angular scope
 * @property {Object} auth - Auth service
 * @property {Object} outbox - Outbox service
 * @property {Object} email - Email service
 * @property {Object} status - Status service
 * @property {Object} dialog - Dialog service
 * @property {Object} $q - Promise service
 * @property {string} str - String resources
 * @property {Function} currentFolder - Get current folder
 */

/**
 * @typedef {Object} InviteContext
 * @property {Object} $scope - Angular scope
 * @property {Object} auth - Auth service
 * @property {Object} invitation - Invitation service
 * @property {Object} outbox - Outbox service
 * @property {Object} dialog - Dialog service
 * @property {Object} $q - Promise service
 * @property {Function} util - Utility functions
 */

/**
 * @typedef {Object} LogAppenderContext
 * @property {Object} axe - Logging service
 * @property {string} str - String resources
 * @property {Object} cfg - Configuration
 */

//
// Helper Functions
//

/**
 * Create log appender for bug reports
 * @param {LogAppenderContext} context
 * @returns {Object} Appender object
 */
function createLogAppender(context) {
    const { axe, str, cfg } = context;
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

/**
 * Create string representation of email addresses
 * @param {Array} array - Array of recipient objects
 * @returns {string} Formatted recipient string
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
 * Filter empty addresses
 * @param {Object} addr - Address object
 * @returns {boolean} True if address is valid
 */
function filterEmptyAddresses(addr) {
    return !!addr.address;
}

/**
 * Reset writer fields to initial state
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
 * Setup bug report email
 * @param {Object} $scope - Angular scope
 * @param {string} str - String resources
 * @param {Object} cfg - Configuration
 * @param {Object} appender - Log appender
 */
function setupBugReport($scope, str, cfg, appender) {
    $scope.to = [{
        address: str.supportAddress
    }];
    $scope.writerTitle = str.bugReportTitle;
    $scope.subject = str.bugReportSubject;
    $scope.body = str.bugReportBody
        .replace('{0}', navigator.userAgent)
        .replace('{1}', cfg.appVersion) + appender.getDump();
}

/**
 * Fill reply/forward fields
 * @param {FillFieldsContext} context
 * @param {Object} re - Original email
 * @param {boolean} replyAll - Reply to all flag
 * @param {boolean} forward - Forward flag
 */
function fillFields(context, re, replyAll, forward) {
    const { $scope, $filter, auth, str } = context;

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

    if (forward) {
        $scope.attachments = [].concat(re.attachments);
        if (re.id) {
            $scope.references = [re.id];
        }
    }

    if (forward) {
        $scope.subject = 'Fwd: ' + re.subject;
    } else {
        $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
    }

    const from = re.from[0].name || replyTo;
    const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

    let body;
    if (forward) {
        body = '\n\n' +
            '---------- Forwarded message ----------\n' +
            'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
            'Date: ' + sentDate + '\n' +
            'Subject: ' + re.subject + '\n' +
            'To: ' + createAddressString(re.to) + '\n' +
            ((re.cc && re.cc.length > 0) ? 'Cc: ' + createAddressString(re.cc) + '\n' : '') +
            '\n\n';
    } else {
        body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
    }

    if (re.body) {
        body += re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        $scope.body = body;
    }
}

/**
 * Verify recipient and fetch public key
 * @param {RecipientVerifyContext} context
 */
function verifyRecipient(context) {
    const { recipient, keychain, pgp, auth, dialog, $q, checkSendStatus } = context;

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
    checkSendStatus();

    if (!util.validateEmailAddress(recipient.address)) {
        recipient.secure = undefined;
        checkSendStatus();
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
        }
        checkSendStatus();
    }).catch(dialog.error);
}

/**
 * Check recipients for send status
 * @param {Object} $scope - Angular scope
 * @param {Object} dialog - Dialog service
 * @param {string} str - String resources
 */
function checkSendStatus($scope, dialog, str) {
    $scope.okToSend = false;
    $scope.sendBtnText = undefined;
    $scope.sendBtnSecure = undefined;

    let allSecure = true;
    let numReceivers = 0;

    const checkRecipient = function(recipient) {
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
    };

    $scope.to.forEach(checkRecipient);
    $scope.cc.forEach(checkRecipient);
    $scope.bcc.forEach(checkRecipient);

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
}

/**
 * Collect invitees without keys
 * @param {Object} $scope - Angular scope
 * @returns {Array} Array of invitee addresses
 */
function collectInvitees($scope) {
    const invitees = [];

    const checkRecipient = function(recipient) {
        if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
            invitees.push(recipient.address);
        }
    };

    $scope.to.forEach(checkRecipient);
    $scope.cc.forEach(checkRecipient);
    $scope.bcc.forEach(checkRecipient);

    return invitees;
}

/**
 * Send invitations to users
 * @param {InviteContext} context
 * @param {Array} invitees - Array of invitee addresses
 */
function sendInvitations(context, invitees) {
    const { $scope, auth, invitation, outbox, dialog, $q } = context;
    const sender = auth.emailAddress;
    const sendJobs = [];

    return $q(function(resolve) {
        resolve();
    }).then(function() {
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
    }).catch(function(err) {
        $scope.showInvite = true;
        return dialog.error(err);
    });
}

/**
 * Build email message object
 * @param {Object} $scope - Angular scope
 * @param {Object} auth - Auth service
 * @param {string} str - String resources
 * @returns {Object} Message object
 */
function buildMessage($scope, auth, str) {
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

/**
 * Send message to outbox
 * @param {SendMessageContext} context
 * @param {Object} message - Message object
 */
function sendMessage(context, message) {
    const { $scope, outbox, email, status, dialog, $q, currentFolder } = context;

    $scope.state.writer.close();
    if