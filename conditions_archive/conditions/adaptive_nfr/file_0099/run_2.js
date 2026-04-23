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
 * @property {Function} write - Open write mode
 * @property {Function} reportBug - Report bug
 * @property {Function} close - Close write mode
 */

/**
 * @typedef {Object} MessageData
 * @property {Array} from - From addresses
 * @property {Array} to - To addresses
 * @property {Array} cc - CC addresses
 * @property {Array} bcc - BCC addresses
 * @property {string} subject - Message subject
 * @property {string} body - Message body
 * @property {Array} attachments - Attachments
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
 * @typedef {Object} LogEntry
 * @property {number} level - Log level
 * @property {Date} date - Log date
 * @property {string} component - Component name
 * @property {string|Error} log - Log message or error
 */

/**
 * @typedef {Object} InvitationContext
 * @property {string} sender - Sender email
 * @property {Array} sendJobs - Promise array for send jobs
 * @property {Array} invitees - List of invitees
 */

/**
 * @typedef {Object} VerificationContext
 * @property {Object} recipient - Recipient object
 * @property {Object} keychain - Keychain service
 * @property {Object} pgp - PGP service
 * @property {Object} dialog - Dialog service
 * @property {Object} $q - Promise service
 */

/**
 * @typedef {Object} SendStatusContext
 * @property {Array} to - To recipients
 * @property {Array} cc - CC recipients
 * @property {Array} bcc - BCC recipients
 * @property {Object} util - Utility functions
 * @property {Object} dialog - Dialog service
 */

//
// Helper Functions
//

/**
 * Create a log appender for bug reports
 * @param {Object} axe - Logging service
 * @returns {Object} Appender object
 */
function createLogAppender(axe) {
    let dump = '';
    
    return {
        log: function(level, date, component, log) {
            // add a tag for the log level
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

            // component is optional
            if (component) {
                dump += '[' + component + ']';
            }

            // log may be an error or a string
            dump += ' ' + (log || '').toString();

            // if an error it is, a stack trace it has. print it, we should.
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
 * Create recipient string from array
 * @param {Array} recipients - Array of recipient objects
 * @returns {string} Formatted recipient string
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
 * Filter empty addresses
 * @param {Object} addr - Address object
 * @returns {boolean} True if address is valid
 */
function filterEmptyAddresses(addr) {
    return !!addr.address;
}

/**
 * Check recipient validity
 * @param {Object} context - Check context with recipient, util, dialog
 * @returns {boolean} True if valid
 */
function checkRecipientValidity(context) {
    const { recipient, util, dialog } = context;
    
    if (!util.validateEmailAddress(recipient.address)) {
        return dialog.info({
            title: 'Warning',
            message: 'Invalid recipient address!'
        });
    }
    return true;
}

/**
 * Check if recipient should be invited
 * @param {Object} context - Check context
 * @returns {boolean} True if should invite
 */
function shouldInviteRecipient(context) {
    const { recipient, util, invited } = context;
    return util.validateEmailAddress(recipient.address) && 
           !recipient.secure && 
           invited.indexOf(recipient.address) === -1;
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

            resetFields();

            // fill fields depending on replyTo
            fillFields(replyTo, replyAll, forward);

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
     * Reset all compose fields
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
     * Generate bug report email
     */
    function reportBug() {
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

    /**
     * Fill compose fields based on reply context
     * @param {Object} re - Original message
     * @param {boolean} replyAll - Reply to all flag
     * @param {boolean} forward - Forward flag
     */
    function fillFields(re, replyAll, forward) {
        if (!re) {
            return;
        }

        $scope.writerTitle = (forward) ? 'Forward' : 'Reply';

        const replyTo = re.replyTo && re.replyTo[0] && re.replyTo[0].address || re.from[0].address;

        // fill recipient field and references
        if (!forward) {
            fillReplyRecipients(re, replyTo);
        }
        
        if (replyAll) {
            fillReplyAllRecipients(re, replyTo);
        }

        // fill attachments and references on forward
        if (forward) {
            $scope.attachments = [].concat(re.attachments);
            if (re.id) {
                $scope.references = [re.id];
            }
        }

        // fill subject
        $scope.subject = forward 
            ? 'Fwd: ' + re.subject
            : re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';

        // fill text body
        fillMessageBody(re, replyTo, forward);
    }

    /**
     * Fill reply recipients
     * @param {Object} re - Original message
     * @param {string} replyTo - Reply to address
     */
    function fillReplyRecipients(re, replyTo) {
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

    /**
     * Fill reply-all recipients
     * @param {Object} re - Original message
     * @param {string} replyTo - Reply to address
     */
    function fillReplyAllRecipients(re, replyTo) {
        re.to.concat(re.cc).forEach(function(recipient) {
            const me = auth.emailAddress;
            if (recipient.address === me && replyTo !== me) {
                return;
            }
            $scope.cc.unshift({
                address: recipient.address
            });
        });

        // filter duplicates
        $scope.cc = _.uniq($scope.cc, function(recipient) {
            return recipient.address;
        });
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    /**
     * Fill message body with quoted text
     * @param {Object} re - Original message
     * @param {string} replyTo - Reply to address
     * @param {boolean} forward - Forward flag
     */
    function fillMessageBody(re, replyTo, forward) {
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

        }).catch(dialog.error);
    };

    /**
     * Check if it is ok to send an email
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        let allSecure = true;
        let numReceivers = 0;

        const checkContext = {
            util: util,
            dialog: dialog
        };

        // count number of receivers and check security
        $scope.to.forEach(checkRecipient);
        $scope.cc.forEach(checkRecipient);
        $scope.bcc.forEach(checkRecipient);

        function checkRecipient(recipient) {
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

        // only allow sending if receivers exist
        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        // bcc automatically disables secure sending
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

        // get recipients with no keys
        $scope.to.forEach(checkInvite);
        $scope.cc.forEach(checkInvite);
        $scope.bcc.forEach(checkInvite);

        function checkInvite(recipient) {
            if (shouldInviteRecipient({
                recipient: recipient,
                util: util,
                invited: $scope.invited
            })) {
                invitees.push(recipient.address);
            }
        }

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
    };

    //
    // Editing email body
    //

    /**
     * Build message object
     * @returns {MessageData} Message object
     */
    function buildMessage() {
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
     */
    $scope.sendToOutbox = function() {
        const message = buildMessage();

        // close the writer
        $scope.state.writer.close();
        // close read mode after reply
        if ($scope.replyTo) {
            status.setReading(false);
        }

        // persist the email to disk for later sending
        return $q(function(resolve) {
            resolve();

        }).then(function() {
            return outbox.put(message);

        }).then(function() {
            // if we need to synchronize replyTo.answered = true to imap,
            // let's do that. otherwise, we're done
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
            // populate address book cache
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
            // filter the address book cache
            return $scope.addressBookCache.filter(function(i) {
                return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
            });

        }).catch(dialog.error);
    };

    //
    // Helpers
    //

    /**
     * Get current folder
     * @returns {Object} Current folder
     */
    function currentFolder() {
        return $scope.state.nav.currentFolder;
    }
};

module.exports = WriteCtrl;
```