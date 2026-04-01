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
 * @typedef {Object} RecipientCheckContext
 * @property {Array} recipients - Recipients to check
 * @property {Function} checkFn - Check function
 */

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
     * Reset all email composition fields to default values
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
     * Build log dump string from log entry
     * @param {LogEntry} entry - Log entry
     * @param {string} dump - Current dump string
     * @returns {string} Updated dump string
     */
    function buildLogDumpEntry(entry, dump) {
        let result = dump;

        // add a tag for the log level
        if (entry.level === axe.DEBUG) {
            result += '[DEBUG]';
        } else if (entry.level === axe.INFO) {
            result += '[INFO]';
        } else if (entry.level === axe.WARN) {
            result += '[WARN]';
        } else if (entry.level === axe.ERROR) {
            result += '[ERROR]';
        }

        result += '[' + entry.date.toISOString() + ']';

        // component is optional
        if (entry.component) {
            result += '[' + entry.component + ']';
        }

        // log may be an error or a string
        result += ' ' + (entry.log || '').toString();

        // if an error it is, a stack trace it has. print it, we should.
        if (entry.log && entry.log.stack) {
            result += ' . Stack: ' + entry.log.stack;
        }

        result += '\n';
        return result;
    }

    /**
     * Generate bug report with system information and logs
     */
    function reportBug() {
        let dump = '';
        const appender = {
            log: function(level, date, component, log) {
                dump = buildLogDumpEntry({ level, date, component, log }, dump);
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
     * Build reply/forward body text
     * @param {Object} originalMessage - Original message
     * @param {boolean} isForward - Is forward flag
     * @param {string} replyTo - Reply to address
     * @returns {string} Body text
     */
    function buildReplyBody(originalMessage, isForward, replyTo) {
        const from = originalMessage.from[0].name || replyTo;
        const sentDate = $filter('date')(originalMessage.sentDate, 'EEEE, MMM d, yyyy h:mm a');
        let body = '';

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
     * @param {Object} originalMessage - Original message
     * @param {boolean} replyAll - Reply to all flag
     * @param {boolean} isForward - Forward flag
     */
    function fillFields(originalMessage, replyAll, isForward) {
        if (!originalMessage) {
            return;
        }

        $scope.writerTitle = (isForward) ? 'Forward' : 'Reply';

        const replyTo = originalMessage.replyTo && originalMessage.replyTo[0] && originalMessage.replyTo[0].address || originalMessage.from[0].address;

        // fill recipient field and references
        if (!isForward) {
            $scope.to.unshift({
                address: replyTo
            });
            $scope.to.forEach($scope.verify);

            $scope.references = (originalMessage.references || []);
            if (originalMessage.id && $scope.references.indexOf(originalMessage.id) < 0) {
                // references might not exist yet, so use the double concat
                $scope.references = $scope.references.concat(originalMessage.id);
            }
            if (originalMessage.id) {
                $scope.inReplyTo = originalMessage.id;
            }
        }
        if (replyAll) {
            originalMessage.to.concat(originalMessage.cc).forEach(function(recipient) {
                const me = auth.emailAddress;
                if (recipient.address === me && replyTo !== me) {
                    // don't reply to yourself
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

        // fill attachments and references on forward
        if (isForward) {
            // create a new array, otherwise removing an attachment will also
            // remove it from the original in the mail list as a side effect
            $scope.attachments = [].concat(originalMessage.attachments);
            if (originalMessage.id) {
                $scope.references = [originalMessage.id];
            }
        }

        // fill subject
        if (isForward) {
            $scope.subject = 'Fwd: ' + originalMessage.subject;
        } else {
            $scope.subject = originalMessage.subject ? 'Re: ' + originalMessage.subject.replace('Re: ', '') : '';
        }

        // fill text body
        $scope.body = buildReplyBody(originalMessage, isForward, replyTo);
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
            // display only email address after autocomplete
            recipient.displayId = recipient.address;
        } else {
            // set address after manual input
            recipient.address = recipient.displayId;
        }

        // set display to insecure while fetching keys
        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();

        // verify email address
        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        // check if to address is contained in known public keys
        // when we write an email, we always need to work with the latest keys available
        return $q(function(resolve) {
            resolve();

        }).then(function() {
            return keychain.refreshKeyForUserId({
                userId: recipient.address
            });

        }).then(function(key) {
            if (key) {
                // compare again since model could have changed during the roundtrip
                const userIds = pgp.getKeyParams(key.publicKey).userIds;
                const matchingUserId = _.findWhere(userIds, {
                    emailAddress: recipient.address
                });
                // compare either primary userId or (if available) multiple IDs
                if (matchingUserId) {
                    recipient.key = key;
                    recipient.secure = true;
                }
            } else {
                // show invite dialog if no key found
                $scope.showInvite = true;
            }
            $scope.checkSendStatus();

        }).catch(dialog.error);
    };

    /**
     * Check recipient security status
     * @param {Object} recipient - Recipient to check
     * @param {Object} context - Check context with allSecure and numReceivers
     */
    function checkRecipientSecurity(recipient, context) {
        // validate address
        if (!util.validateEmailAddress(recipient.address)) {
            return dialog.info({
                title: 'Warning',
                message: 'Invalid recipient address!'
            });
        }
        context.numReceivers++;
        if (!recipient.secure) {
            context.allSecure = false;
        }
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        const context = {
            allSecure: true,
            numReceivers: 0
        };

        // count number of receivers and check security
        $scope.to.forEach(function(recipient) {
            checkRecipientSecurity(recipient, context);
        });
        $scope.cc.forEach(function(recipient) {
            checkRecipientSecurity(recipient, context);
        });
        $scope.bcc.forEach(function(recipient) {
            checkRecipientSecurity(recipient, context);
        });

        // only allow sending if receviers exist
        if (context.numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        // bcc automatically disables secure sending
        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            context.allSecure = false;
        }

        if (context.allSecure) {
            // send encrypted if all secure
            $scope.okToSend = true;
            $scope.sendBtnText = str.sendBtnSecure;
            $scope.sendBtnSecure = true;
            $scope.showInvite = false;
        } else {
            // send plaintext
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
     * Check if recipient should be invited
     * @param {Object} recipient - Recipient to check
     * @param {Array} invitees - Invitees array
     */
    function checkInvitee(recipient, invitees) {
        if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
            invitees.push(recipient.address);
        }
    }

    /**
     * Invite all users without a public key
     */
    $scope.invite = function() {
        const sender = auth.emailAddress;
        const sendJobs = [];
        const invitees = [];

        $scope.showInvite = false;

        // get recipients with no keys
        $scope.to.forEach(function(recipient) {
            checkInvitee(recipient, invitees);
        });
        $scope.cc.forEach(function(recipient) {
            checkInvitee(recipient, invitees);
        });
        $scope.bcc.forEach(function(recipient) {
            checkInvitee(recipient, invitees);
        });

        return $q(function(resolve) {
            resolve();

        }).then(function() {
            invitees.forEach(function(recipientAddress) {
                const invitationMail = invitation.createMail({
                    sender: sender,
                    recipient: recipientAddress
                });
                // send invitation mail
                const promise = outbox.put(invitationMail).then(function() {
                    return invitation.invite({
                        recipient: recipientAddress,
                        sender: sender
                    });
                });
                sendJobs.push(promise);
                // remember already invited users to prevent spamming
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
     * Build email message object
     * @returns {EmailMessage} Email message object
     */
    function buildEmailMessage() {
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
     * Update replied message flag if needed
     * @param {Object} message - Message being sent
     * @returns {Promise} Promise resolving when flag is updated
     */
    function updateRepliedFlag(message) {
        // if we need to synchronize replyTo.answered = true to imap,
        // let's do that. otherwise, we're done
        if (!$scope.replyTo || $scope.replyTo.answered) {
            return Promise.resolve();
        }

        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: currentFolder(),
            message: $scope.replyTo
        });
    }

    $scope.sendToOutbox = function() {
        // build email model for smtp-client
        const message = buildEmailMessage();

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
            return updateRepliedFlag(message);

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
     * Get current folder from navigation state
     * @returns {Object} Current folder
     */
    function currentFolder() {
        return $scope.state.nav.currentFolder;
    }

    /**
     * Visitor to filter out objects without an address property, i.e. empty addresses
     * @param {Object} addr - Address object
     * @returns {boolean} True if address is valid
     */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;
```