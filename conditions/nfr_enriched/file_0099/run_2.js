```javascript
'use strict';

const util = require('crypto-lib').util;

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
     * Reset all composer fields to initial state
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
     * Format a single log entry with level, timestamp, component, and message
     */
    function formatLogEntry(level, date, component, log) {
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
        if (log.stack) {
            entry += ' . Stack: ' + log.stack;
        }

        entry += '\n';
        return entry;
    }

    /**
     * Collect application logs for bug report
     */
    function collectApplicationLogs() {
        let dump = '';
        const appender = {
            log: function(level, date, component, log) {
                dump += formatLogEntry(level, date, component, log);
            }
        };
        axe.dump(appender);
        return dump;
    }

    /**
     * Populate composer with bug report details
     */
    function reportBug() {
        const dump = collectApplicationLogs();

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
     * Extract reply-to address from email
     */
    function extractReplyToAddress(originalEmail) {
        return originalEmail.replyTo && originalEmail.replyTo[0] && originalEmail.replyTo[0].address || originalEmail.from[0].address;
    }

    /**
     * Configure composer for reply or forward
     */
    function configureComposerMode(originalEmail, replyAll, forward) {
        $scope.writerTitle = (forward) ? 'Forward' : 'Reply';

        if (!forward) {
            configureReplyMode(originalEmail, replyAll);
        }

        if (replyAll) {
            configureReplyAllMode(originalEmail);
        }

        if (forward) {
            configureForwardMode(originalEmail);
        }
    }

    /**
     * Set up reply mode: recipient and references
     */
    function configureReplyMode(originalEmail, replyAll) {
        const replyTo = extractReplyToAddress(originalEmail);

        $scope.to.unshift({
            address: replyTo
        });
        $scope.to.forEach($scope.verify);

        $scope.references = (originalEmail.references || []);
        if (originalEmail.id && $scope.references.indexOf(originalEmail.id) < 0) {
            $scope.references = $scope.references.concat(originalEmail.id);
        }
        if (originalEmail.id) {
            $scope.inReplyTo = originalEmail.id;
        }
    }

    /**
     * Add all original recipients to CC field
     */
    function configureReplyAllMode(originalEmail) {
        const me = auth.emailAddress;
        const replyTo = extractReplyToAddress(originalEmail);

        originalEmail.to.concat(originalEmail.cc).forEach(function(recipient) {
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
     * Set up forward mode: attachments and references
     */
    function configureForwardMode(originalEmail) {
        // create a new array, otherwise removing an attachment will also
        // remove it from the original in the mail list as a side effect
        $scope.attachments = [].concat(originalEmail.attachments);
        if (originalEmail.id) {
            $scope.references = [originalEmail.id];
        }
    }

    /**
     * Format recipient list as comma-separated string with names and addresses
     */
    function formatRecipientList(recipients) {
        let result = '';
        recipients.forEach(function(recipient) {
            result += (result) ? ', ' : '';
            result += ((recipient.name) ? recipient.name : recipient.address) + ' <' + recipient.address + '>';
        });
        return result;
    }

    /**
     * Generate quoted text for reply or forward
     */
    function generateQuotedText(originalEmail, replyTo, forward) {
        const from = originalEmail.from[0].name || replyTo;
        const sentDate = $filter('date')(originalEmail.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        let body = '';

        if (forward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + originalEmail.from[0].name + ' <' + originalEmail.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + originalEmail.subject + '\n' +
                'To: ' + formatRecipientList(originalEmail.to) + '\n' +
                ((originalEmail.cc && originalEmail.cc.length > 0) ? 'Cc: ' + formatRecipientList(originalEmail.cc) + '\n' : '') +
                '\n\n';
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (originalEmail.body) {
            body += originalEmail.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }

        return body;
    }

    /**
     * Set subject line for reply or forward
     */
    function setSubjectLine(originalEmail, forward) {
        if (forward) {
            $scope.subject = 'Fwd: ' + originalEmail.subject;
        } else {
            $scope.subject = originalEmail.subject ? 'Re: ' + originalEmail.subject.replace('Re: ', '') : '';
        }
    }

    /**
     * Populate composer fields based on original email
     */
    function fillFields(originalEmail, replyAll, forward) {
        if (!originalEmail) {
            return;
        }

        configureComposerMode(originalEmail, replyAll, forward);
        setSubjectLine(originalEmail, forward);

        const replyTo = extractReplyToAddress(originalEmail);
        $scope.body = generateQuotedText(originalEmail, replyTo, forward);
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
     * Validate recipient address
     */
    function validateRecipient(recipient) {
        if (!util.validateEmailAddress(recipient.address)) {
            return dialog.info({
                title: 'Warning',
                message: 'Invalid recipient address!'
            });
        }
        return true;
    }

    /**
     * Check security status of a recipient
     */
    function checkRecipientSecurity(recipient, securityState) {
        if (!validateRecipient(recipient)) {
            return;
        }
        securityState.numReceivers++;
        if (!recipient.secure) {
            securityState.allSecure = false;
        }
    }

    /**
     * Determine send button state based on security and recipient status
     */
    function determineSendButtonState(allSecure) {
        if (allSecure) {
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
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        const securityState = {
            allSecure: true,
            numReceivers: 0
        };

        // count number of receivers and check security
        $scope.to.forEach(function(recipient) {
            checkRecipientSecurity(recipient, securityState);
        });
        $scope.cc.forEach(function(recipient) {
            checkRecipientSecurity(recipient, securityState);
        });
        $scope.bcc.forEach(function(recipient) {
            checkRecipientSecurity(recipient, securityState);
        });

        // only allow sending if receivers exist
        if (securityState.numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        // bcc automatically disables secure sending
        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            securityState.allSecure = false;
        }

        determineSendButtonState(securityState.allSecure);
    };

    //
    // Editing attachments
    //

    $scope.remove = function(attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    /**
     * Collect recipients without public keys
     */
    function collectUnencryptedRecipients() {
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
     * Send invitation mail for a single recipient
     */
    function sendInvitationForRecipient(recipientAddress, sender) {
        const invitationMail = invitation.createMail({
            sender: sender,
            recipient: recipientAddress
        });

        return outbox.put(invitationMail).then(function() {
            return invitation.invite({
                recipient: recipientAddress,
                sender: sender
            });
        });
    }

    /**
     * Invite all users without a public key
     */
    $scope.invite = function() {
        const sender = auth.emailAddress;
        const invitees = collectUnencryptedRecipients();

        $scope.showInvite = false;

        return $q(function(resolve) {
            resolve();

        }).then(function() {
            const sendJobs = invitees.map(function(recipientAddress) {
                const promise = sendInvitationForRecipient(recipientAddress, sender);
                // remember already invited users to prevent spamming
                $scope.invited.push(recipientAddress);
                return promise;
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
     * Build message headers for reply/forward
     */
    function buildMessageHeaders() {
        const headers = {};

        if ($scope.inReplyTo) {
            headers['in-reply-to'] = '<' + $scope.inReplyTo + '