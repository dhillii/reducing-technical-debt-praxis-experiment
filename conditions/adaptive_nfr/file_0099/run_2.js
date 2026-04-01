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
 * @property {Function} write - Write email function
 * @property {Function} reportBug - Report bug function
 * @property {Function} close - Close writer function
 */

/**
 * @typedef {Object} EmailMessage
 * @property {Array} from - From addresses
 * @property {Array} to - To addresses
 * @property {Array} cc - CC addresses
 * @property {Array} bcc - BCC addresses
 * @property {string} subject - Email subject
 * @property {string} body - Email body
 * @property {Array} attachments - Attachments
 * @property {Date} sentDate - Sent date
 * @property {Object} headers - Email headers
 */

/**
 * @typedef {Object} ReplyContext
 * @property {Object} replyTo - Original message
 * @property {boolean} replyAll - Reply to all flag
 * @property {boolean} forward - Forward flag
 */

/**
 * @typedef {Object} LogEntry
 * @property {number} level - Log level
 * @property {Date} date - Log date
 * @property {string} component - Component name
 * @property {string|Error} log - Log message or error
 */

/**
 * @typedef {Object} RecipientVerificationContext
 * @property {Object} recipient - Recipient object
 * @property {Object} keychain - Keychain service
 * @property {Object} pgp - PGP service
 * @property {Object} dialog - Dialog service
 * @property {Object} $q - Promise service
 */

/**
 * @typedef {Object} SendStatusCheckContext
 * @property {Array} to - To recipients
 * @property {Array} cc - CC recipients
 * @property {Array} bcc - BCC recipients
 * @property {Object} dialog - Dialog service
 */

/**
 * @typedef {Object} InvitationContext
 * @property {Array} to - To recipients
 * @property {Array} cc - CC recipients
 * @property {Array} bcc - BCC recipients
 * @property {Array} invited - Already invited addresses
 * @property {string} sender - Sender email
 * @property {Object} invitation - Invitation service
 * @property {Object} outbox - Outbox service
 * @property {Object} dialog - Dialog service
 * @property {Object} $q - Promise service
 */

/**
 * @typedef {Object} OutboxContext
 * @property {Object} message - Email message
 * @property {Object} replyTo - Original message
 * @property {Object} outbox - Outbox service
 * @property {Object} email - Email service
 * @property {Object} dialog - Dialog service
 * @property {Object} $q - Promise service
 * @property {Function} currentFolder - Get current folder
 */

/**
 * @typedef {Object} AddressBookContext
 * @property {string} query - Search query
 * @property {Array} cache - Address book cache
 * @property {Object} keychain - Keychain service
 * @property {Object} pgp - PGP service
 * @property {Object} dialog - Dialog service
 * @property {Object} $q - Promise service
 */

//
// Helper Functions
//

/**
 * Create initial field state
 */
function createInitialFieldState() {
    return {
        writerTitle: 'New email',
        to: [],
        showCC: false,
        cc: [],
        showBCC: false,
        bcc: [],
        subject: '',
        body: '',
        attachments: [],
        addressBookCache: undefined,
        showInvite: undefined,
        invited: []
    };
}

/**
 * Build bug report dump
 */
function buildBugReportDump(axe) {
    let dump = '';
    const appender = {
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
        }
    };
    axe.dump(appender);
    return dump;
}

/**
 * Reset writer fields
 */
function resetFields($scope) {
    const initialState = createInitialFieldState();
    Object.assign($scope, initialState);
}

/**
 * Setup bug report
 */
function setupBugReport($scope, axe, appConfig, dump) {
    const str = appConfig.string;
    const cfg = appConfig.config;

    $scope.to = [{
        address: str.supportAddress
    }];
    $scope.writerTitle = str.bugReportTitle;
    $scope.subject = str.bugReportSubject;
    $scope.body = str.bugReportBody
        .replace('{0}', navigator.userAgent)
        .replace('{1}', cfg.appVersion) + dump;
}

/**
 * Create recipient string from array
 */
function createRecipientString(recipients) {
    let str = '';
    recipients.forEach(function(to) {
        str += (str) ? ', ' : '';
        str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
    });
    return str;
}

/**
 * Build reply/forward body
 */
function buildEmailBody(originalMessage, isForward, $filter) {
    const replyTo = originalMessage.replyTo && originalMessage.replyTo[0] && originalMessage.replyTo[0].address || originalMessage.from[0].address;
    const from = originalMessage.from[0].name || replyTo;
    const sentDate = $filter('date')(originalMessage.sentDate, 'EEEE, MMM d, yyyy h:mm a');

    let body;

    if (isForward) {
        body = '\n\n' +
            '---------- Forwarded message ----------\n' +
            'From: ' + originalMessage.from[0].name + ' <' + originalMessage.from[0].address + '>\n' +
            'Date: ' + sentDate + '\n' +
            'Subject: ' + originalMessage.subject + '\n' +
            'To: ' + createRecipientString(originalMessage.to) + '\n' +
            ((originalMessage.cc && originalMessage.cc.length > 0) ? 'Cc: ' + createRecipientString(originalMessage.cc) + '\n' : '') +
            '\n\n';
    } else {
        body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
    }

    if (originalMessage.body) {
        body += originalMessage.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
    }

    return body;
}

/**
 * Fill reply/forward fields
 */
function fillReplyFields($scope, originalMessage, replyAll, auth) {
    const replyTo = originalMessage.replyTo && originalMessage.replyTo[0] && originalMessage.replyTo[0].address || originalMessage.from[0].address;

    $scope.to.unshift({
        address: replyTo
    });
    $scope.to.forEach($scope.verify);

    $scope.references = (originalMessage.references || []);
    if (originalMessage.id && $scope.references.indexOf(originalMessage.id) < 0) {
        $scope.references = $scope.references.concat(originalMessage.id);
    }
    if (originalMessage.id) {
        $scope.inReplyTo = originalMessage.id;
    }

    if (replyAll) {
        originalMessage.to.concat(originalMessage.cc).forEach(function(recipient) {
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
}

/**
 * Fill forward fields
 */
function fillForwardFields($scope, originalMessage) {
    $scope.attachments = [].concat(originalMessage.attachments);
    if (originalMessage.id) {
        $scope.references = [originalMessage.id];
    }
}

/**
 * Fill subject line
 */
function fillSubject($scope, originalMessage, isForward) {
    if (isForward) {
        $scope.subject = 'Fwd: ' + originalMessage.subject;
    } else {
        $scope.subject = originalMessage.subject ? 'Re: ' + originalMessage.subject.replace('Re: ', '') : '';
    }
}

/**
 * Process reply/forward context
 */
function processReplyContext($scope, context, auth, $filter) {
    const originalMessage = context.replyTo;
    const isForward = context.forward;
    const replyAll = context.replyAll;

    if (!originalMessage) {
        return;
    }

    $scope.writerTitle = isForward ? 'Forward' : 'Reply';

    if (!isForward) {
        fillReplyFields($scope, originalMessage, replyAll, auth);
    }

    if (isForward) {
        fillForwardFields($scope, originalMessage);
    }

    fillSubject($scope, originalMessage, isForward);

    const body = buildEmailBody(originalMessage, isForward, $filter);
    $scope.body = body;
}

/**
 * Verify single recipient
 */
function verifySingleRecipient(context) {
    const recipient = context.recipient;
    const keychain = context.keychain;
    const pgp = context.pgp;
    const dialog = context.dialog;
    const $q = context.$q;
    const onStatusChange = context.onStatusChange;

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
    onStatusChange();

    if (!util.validateEmailAddress(recipient.address)) {
        recipient.secure = undefined;
        onStatusChange();
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
            context.onNoKeyFound();
        }
        onStatusChange();
    }).catch(dialog.error);
}

/**
 * Check recipient validity
 */
function checkRecipientValidity(recipient, dialog) {
    if (!util.validateEmailAddress(recipient.address)) {
        return dialog.info({
            title: 'Warning',
            message: 'Invalid recipient address!'
        });
    }
    return true;
}

/**
 * Determine send status
 */
function determineSendStatus(context) {
    const to = context.to;
    const cc = context.cc;
    const bcc = context.bcc;
    const dialog = context.dialog;
    const str = context.str;

    let allSecure = true;
    let numReceivers = 0;

    const recipients = to.concat(cc).concat(bcc);

    recipients.forEach(function(recipient) {
        if (!checkRecipientValidity(recipient, dialog)) {
            return;
        }
        numReceivers++;
        if (!recipient.secure) {
            allSecure = false;
        }
    });

    if (numReceivers < 1) {
        return {
            okToSend: false,
            sendBtnText: undefined,
            sendBtnSecure: undefined,
            showInvite: false
        };
    }

    if (bcc.filter(filterEmptyAddresses).length > 0) {
        allSecure = false;
    }

    if (allSecure) {
        return {
            okToSend: true,
            sendBtnText: str.sendBtnSecure,
            sendBtnSecure: true,
            showInvite: false
        };
    } else {
        return {
            okToSend: true,
            sendBtnText: str.sendBtnClear,
            sendBtnSecure: false,
            showInvite: true
        };
    }
}

/**
 * Collect invitees
 */
function collectInvitees(recipients, invited) {
    const invitees = [];

    recipients.forEach(function(recipient) {
        if (util.validateEmailAddress(recipient.address) && !recipient.secure && invited.indexOf(recipient.address) === -1) {
            invitees.push(recipient.address);
        }
    });

    return invitees;
}

/**
 * Send invitations
 */
function sendInvitations(context) {
    const invitees = context.invitees;
    const sender = context.sender;
    const invitation = context.invitation;
    const outbox = context.outbox;
    const dialog = context.dialog;
    const $q = context.$q;
    const onInviteSent = context.onInviteSent;

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
            onInviteSent(recipientAddress);
        });

        return Promise.all(sendJobs);
    }).catch(function(err) {
        context.onInviteError();
        return dialog.error(err);
    });
}

/**
 * Build email message
 */
function buildEmailMessage(context) {
    const to = context.to;
    const cc = context.cc;
    const bcc = context.bcc;
    const subject = context.subject;
    const body = context.body;
    const attachments