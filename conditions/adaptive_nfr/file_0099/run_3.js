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
 * @property {string} fallbackSubject - Fallback subject string
 * @property {Function} currentFolder - Get current folder
 */

/**
 * @typedef {Object} InviteContext
 * @property {Object} $scope - Angular scope
 * @property {Object} auth - Auth service
 * @property {Object} outbox - Outbox service
 * @property {Object} invitation - Invitation service
 * @property {Object} dialog - Dialog service
 * @property {Object} $q - Promise service
 */

/**
 * @typedef {Object} BugReportContext
 * @property {Object} $scope - Angular scope
 * @property {Object} axe - Logging service
 * @property {string} str - String resources
 * @property {Object} cfg - Config object
 */

/**
 * @typedef {Object} CheckSendStatusContext
 * @property {Object} $scope - Angular scope
 * @property {Object} auth - Auth service
 * @property {string} str - String resources
 * @property {Object} dialog - Dialog service
 */

//
// Helper Functions
//

/**
 * Reset all writer fields to initial state
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
 * Generate bug report with logs
 * @param {BugReportContext} context - Bug report context
 */
function reportBug(context) {
    const { $scope, axe, str, cfg } = context;
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

    $scope.to = [{
        address: str.supportAddress
    }];
    $scope.writerTitle = str.bugReportTitle;
    $scope.subject = str.bugReportSubject;
    $scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + dump;
}

/**
 * Create formatted recipient string
 * @param {Array} array - Array of recipients
 * @returns {string} Formatted recipient string
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
 * Fill reply/forward fields
 * @param {FillFieldsContext} context - Fill fields context
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

    let body;
    if (forward) {
        body = '\n\n' +
            '---------- Forwarded message ----------\n' +
            'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
            'Date: ' + sentDate + '\n' +
            'Subject: ' + re.subject + '\n' +
            'To: ' + createRecipientString(re.to) + '\n' +
            ((re.cc && re.cc.length > 0) ? 'Cc: ' + createRecipientString(re.cc) + '\n' : '') +
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
 * @param {RecipientVerifyContext} context - Verification context
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
 * Check if email can be sent
 * @param {CheckSendStatusContext} context - Check status context
 */
function checkSendStatus(context) {
    const { $scope, auth, str, dialog } = context;
    
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
 * Send invitations to users without keys
 * @param {InviteContext} context - Invite context
 */
function sendInvitations(context) {
    const { $scope, auth, outbox, invitation, dialog, $q } = context;
    
    const sender = auth.emailAddress;
    const sendJobs = [];
    const invitees = [];

    $scope.showInvite = false;

    const checkRecipient = function(recipient) {
        if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
            invitees.push(recipient.address);
        }
    };

    $scope.to.forEach(checkRecipient);
    $scope.cc.forEach(checkRecipient);
    $scope.bcc.forEach(checkRecipient);

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
 * Send message to outbox
 * @param {SendMessageContext} context - Send message context
 */
function sendToOutbox(context) {
    const { $scope, auth, outbox, email, status, dialog, $q, fallbackSubject, currentFolder } = context;
    
    const message = {
        from: [{
            name: auth.realname,
            address: auth.emailAddress
        }],
        to: $scope.to.filter(filterEmptyAddresses),
        cc: $scope.cc.filter(filterEmptyAddresses),
        bcc: $scope.bcc.filter(filterEmptyAddresses),
        subject: $scope.subject.trim() ? $scope.subject.trim() : fallbackSubject,
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
}

/**
 * Filter out objects without an address property
 * @param {Object} addr - Address object
 * @returns {boolean} True if address exists
 */
function filterEmptyAddresses(addr) {
    return !!addr.address;
}

/**
 * Get current folder from scope
 * @param {Object} $scope - Angular scope
 * @returns {Object} Current folder
 */
function getCurrentFolder($scope) {
    return $scope.state.nav.currentFolder;
}

//
// Controller
//

const WriteCtrl = function($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {
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
            fillFields({ $scope, $filter, auth, str }, replyTo, replyAll, forward);
            $scope.verify($scope.to[0]);
        },
        reportBug: function() {
            $scope.state.lightbox = 'write';
            resetFields($scope);
            reportBug({ $scope, axe, str, cfg });
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
        verifyRecipient({
            recipient,
            keychain,
            pgp,
            auth,
            dialog,
            $q,
            checkSendStatus: () => $scope.checkSendStatus()
        });
    };

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        checkSendStatus({ $scope, auth, str, dialog });
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
        return sendInvitations({ $scope, auth, outbox, invitation, dialog, $q });
    };

    //
    // Editing email body
    //

    $scope.sendToOutbox = function() {
        return sendToOutbox({
            $scope,
            auth,
            outbox,
            email,
            status,
            dialog,
            $q,
            fallbackSubject: str.fallbackSubject,
            currentFolder: () => getCurrentFolder($scope)
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
};

module.exports = WriteCtrl;
```