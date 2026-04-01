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
 * @typedef {Object} RecipientCheckContext
 * @property {Array} recipients - Recipients to check
 * @property {Function} checkFn - Check function
 */

/**
 * @typedef {Object} LogContext
 * @property {string} level - Log level
 * @property {Date} date - Log date
 * @property {string} component - Component name
 * @property {*} log - Log message or error
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

    $scope.state.writer = createWriteState();

    /**
     * Creates the write state object with write, reportBug, and close methods
     * @returns {WriteState}
     */
    function createWriteState() {
        return {
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
    }

    /**
     * Resets all email composition fields to initial state
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
     * Generates a bug report email with application logs
     */
    function reportBug() {
        let dump = '';
        const appender = {
            log: function(level, date, component, log) {
                appendLogEntry({ level, date, component, log, dump: { value: dump } });
                dump = appender.dump.value;
            }
        };
        appender.dump = { value: dump };
        axe.dump(appender);

        $scope.to = [{
            address: str.supportAddress
        }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + dump;
    }

    /**
     * Appends a formatted log entry to the dump string
     * @param {Object} context - Log context with level, date, component, log, and dump reference
     */
    function appendLogEntry(context) {
        const { level, date, component, log } = context;
        let entry = '';

        // add a tag for the log level
        if (level === axe.DEBUG) {
            entry += '[DEBUG]';
        } else if (level === axe.INFO) {
            entry += '[INFO]';
        } else if (level === axe.WARN) {
            entry += '[WARN]';
        } else if (level === axe.ERROR) {
            entry += '[ERROR]';
        }

        entry += '[' + date.toISOString() + ']';

        // component is optional
        if (component) {
            entry += '[' + component + ']';
        }

        // log may be an error or a string
        entry += ' ' + (log || '').toString();

        // if an error it is, a stack trace it has. print it, we should.
        if (log && log.stack) {
            entry += ' . Stack: ' + log.stack;
        }

        entry += '\n';
        context.dump.value += entry;
    }

    /**
     * Fills email fields based on reply/forward context
     * @param {Object} originalMessage - Original message to reply to or forward
     * @param {boolean} replyAll - Whether to reply to all
     * @param {boolean} forward - Whether this is a forward
     */
    function fillFields(originalMessage, replyAll, forward) {
        if (!originalMessage) {
            return;
        }

        $scope.writerTitle = (forward) ? 'Forward' : 'Reply';

        const replyTo = originalMessage.replyTo && originalMessage.replyTo[0] && originalMessage.replyTo[0].address || originalMessage.from[0].address;

        // fill recipient field and references
        if (!forward) {
            fillReplyRecipients(originalMessage, replyTo);
        }

        if (replyAll) {
            fillReplyAllRecipients(originalMessage, replyTo);
        }

        // fill attachments and references on forward
        if (forward) {
            fillForwardAttachments(originalMessage);
        }

        // fill subject
        fillSubject(originalMessage, forward);

        // fill text body
        fillBody(originalMessage, replyTo, forward);
    }

    /**
     * Fills recipient field and references for reply
     * @param {Object} msg - Original message
     * @param {string} replyTo - Reply-to address
     */
    function fillReplyRecipients(msg, replyTo) {
        $scope.to.unshift({
            address: replyTo
        });
        $scope.to.forEach($scope.verify);

        $scope.references = (msg.references || []);
        if (msg.id && $scope.references.indexOf(msg.id) < 0) {
            $scope.references = $scope.references.concat(msg.id);
        }
        if (msg.id) {
            $scope.inReplyTo = msg.id;
        }
    }

    /**
     * Fills CC field for reply-all
     * @param {Object} msg - Original message
     * @param {string} replyTo - Reply-to address
     */
    function fillReplyAllRecipients(msg, replyTo) {
        msg.to.concat(msg.cc).forEach(function(recipient) {
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

    /**
     * Fills attachments and references for forward
     * @param {Object} msg - Original message
     */
    function fillForwardAttachments(msg) {
        // create a new array, otherwise removing an attachment will also
        // remove it from the original in the mail list as a side effect
        $scope.attachments = [].concat(msg.attachments);
        if (msg.id) {
            $scope.references = [msg.id];
        }
    }

    /**
     * Fills subject line based on reply or forward
     * @param {Object} msg - Original message
     * @param {boolean} forward - Whether this is a forward
     */
    function fillSubject(msg, forward) {
        if (forward) {
            $scope.subject = 'Fwd: ' + msg.subject;
        } else {
            $scope.subject = msg.subject ? 'Re: ' + msg.subject.replace('Re: ', '') : '';
        }
    }

    /**
     * Fills email body with quoted text
     * @param {Object} msg - Original message
     * @param {string} replyTo - Reply-to address
     * @param {boolean} forward - Whether this is a forward
     */
    function fillBody(msg, replyTo, forward) {
        const from = msg.from[0].name || replyTo;
        const sentDate = $filter('date')(msg.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        let body = '';

        if (forward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + msg.from[0].name + ' <' + msg.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + msg.subject + '\n' +
                'To: ' + createAddressString(msg.to) + '\n' +
                ((msg.cc && msg.cc.length > 0) ? 'Cc: ' + createAddressString(msg.cc) + '\n' : '') +
                '\n\n';
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (msg.body) {
            body += msg.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            $scope.body = body;
        }
    }

    /**
     * Creates a formatted string from an array of addresses
     * @param {Array} addressArray - Array of address objects
     * @returns {string} Formatted address string
     */
    function createAddressString(addressArray) {
        let str = '';
        addressArray.forEach(function(to) {
            str += (str) ? ', ' : '';
            str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
        });
        return str;
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
            processKeyVerification(key, recipient);
            $scope.checkSendStatus();

        }).catch(dialog.error);
    };

    /**
     * Processes key verification result for a recipient
     * @param {Object} key - The key object
     * @param {Object} recipient - The recipient object
     */
    function processKeyVerification(key, recipient) {
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
        $scope.to.forEach(checkRecipient);
        $scope.cc.forEach(checkRecipient);
        $scope.bcc.forEach(checkRecipient);

        /**
         * Validates and counts a recipient
         * @param {Object} recipient - Recipient to check
         */
        function checkRecipient(recipient) {
            // validate address
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

        // only allow sending if receviers exist
        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        // bcc automatically disables secure sending
        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            allSecure = false;
        }

        if (allSecure) {
            // send encrypted if all secure
            $scope.okToSend = true;
            $scope.sendBtnText = str.sendBtnSecure;
            $scope.sendBtnSecure = true;
            $scope.showInvite = false;
        } else {
            // send plaintext
            $scope.okToSend = true;
            $scope.sendBtnText = str.send