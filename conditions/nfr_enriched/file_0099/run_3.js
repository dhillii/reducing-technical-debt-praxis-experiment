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

    // Resets all composer fields to initial state
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

    // Formats a single log entry with level, timestamp, component, and message
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

        return entry;
    }

    // Collects application logs into a formatted dump string
    function collectLogDump() {
        let dump = '';
        const appender = {
            log: function(level, date, component, log) {
                dump += formatLogEntry(level, date, component, log) + '\n';
            }
        };
        axe.dump(appender);
        return dump;
    }

    // Populates composer with bug report details and logs
    function reportBug() {
        const dump = collectLogDump();

        $scope.to = [{
            address: str.supportAddress
        }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + dump;
    }

    // Extracts reply-to address from email, preferring replyTo field
    function getReplyToAddress(email) {
        return email.replyTo && email.replyTo[0] && email.replyTo[0].address || email.from[0].address;
    }

    // Formats recipient array into comma-separated string with names and addresses
    function formatRecipientString(recipients) {
        let result = '';
        recipients.forEach(function(recipient) {
            result += (result) ? ', ' : '';
            result += ((recipient.name) ? recipient.name : recipient.address) + ' <' + recipient.address + '>';
        });
        return result;
    }

    // Builds quoted body text for reply or forward
    function buildQuotedBody(originalEmail, isForward, replyToAddress) {
        let body = '';

        if (isForward) {
            const sentDate = $filter('date')(originalEmail.sentDate, 'EEEE, MMM d, yyyy h:mm a');
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + originalEmail.from[0].name + ' <' + originalEmail.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + originalEmail.subject + '\n' +
                'To: ' + formatRecipientString(originalEmail.to) + '\n' +
                ((originalEmail.cc && originalEmail.cc.length > 0) ? 'Cc: ' + formatRecipientString(originalEmail.cc) + '\n' : '') +
                '\n\n';
        } else {
            const from = originalEmail.from[0].name || replyToAddress;
            const sentDate = $filter('date')(originalEmail.sentDate, 'EEEE, MMM d, yyyy h:mm a');
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (originalEmail.body) {
            body += originalEmail.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }

        return body;
    }

    // Populates reply-to field and references for reply
    function populateReplyFields(originalEmail, replyToAddress) {
        $scope.to.unshift({
            address: replyToAddress
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

    // Populates CC field for reply-all
    function populateReplyAllFields(originalEmail, replyToAddress) {
        originalEmail.to.concat(originalEmail.cc).forEach(function(recipient) {
            const me = auth.emailAddress;
            if (recipient.address === me && replyToAddress !== me) {
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

    // Populates attachments and references for forward
    function populateForwardFields(originalEmail) {
        // create a new array, otherwise removing an attachment will also
        // remove it from the original in the mail list as a side effect
        $scope.attachments = [].concat(originalEmail.attachments);
        if (originalEmail.id) {
            $scope.references = [originalEmail.id];
        }
    }

    // Populates subject line based on reply or forward
    function populateSubject(originalEmail, isForward) {
        if (isForward) {
            $scope.subject = 'Fwd: ' + originalEmail.subject;
        } else {
            $scope.subject = originalEmail.subject ? 'Re: ' + originalEmail.subject.replace('Re: ', '') : '';
        }
    }

    // Fills composer fields based on original email and action type
    function fillFields(originalEmail, replyAll, isForward) {
        if (!originalEmail) {
            return;
        }

        $scope.writerTitle = (isForward) ? 'Forward' : 'Reply';

        const replyToAddress = getReplyToAddress(originalEmail);

        // fill recipient field and references
        if (!isForward) {
            populateReplyFields(originalEmail, replyToAddress);
        }

        if (replyAll) {
            populateReplyAllFields(originalEmail, replyToAddress);
        }

        // fill attachments and references on forward
        if (isForward) {
            populateForwardFields(originalEmail);
        }

        // fill subject
        populateSubject(originalEmail, isForward);

        // fill text body
        $scope.body = buildQuotedBody(originalEmail, isForward, replyToAddress);
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

    // Validates recipient address and counts receivers
    function validateAndCountRecipient(recipient) {
        if (!util.validateEmailAddress(recipient.address)) {
            return dialog.info({
                title: 'Warning',
                message: 'Invalid recipient address!'
            });
        }
        return true;
    }

    // Determines if all recipients have secure keys
    function areAllRecipientsSecure() {
        let allSecure = true;

        const checkSecurity = function(recipient) {
            if (!recipient.secure) {
                allSecure = false;
            }
        };

        $scope.to.forEach(checkSecurity);
        $scope.cc.forEach(checkSecurity);
        $scope.bcc.forEach(checkSecurity);

        return allSecure;
    }

    // Counts valid recipients across all fields
    function countValidRecipients() {
        let count = 0;

        const countRecipient = function(recipient) {
            if (util.validateEmailAddress(recipient.address)) {
                count++;
            }
        };

        $scope.to.forEach(countRecipient);
        $scope.cc.forEach(countRecipient);
        $scope.bcc.forEach(countRecipient);

        return count;
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        // Validate all recipients
        const allRecipientsValid = $scope.to.concat($scope.cc).concat($scope.bcc).every(function(recipient) {
            return validateAndCountRecipient(recipient) !== false;
        });

        if (!allRecipientsValid) {
            return;
        }

        const numReceivers = countValidRecipients();

        // only allow sending if receivers exist
        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        let allSecure = areAllRecipientsSecure();

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

    // Collects recipients without public keys
    function collectInvitees() {
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

    // Sends invitation mail and invitation for a single recipient
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
        const sendJobs = [];
        const invitees = collectInvitees();

        $scope.showInvite = false;

        return $q(function(resolve) {
            resolve();

        }).then(function() {
            invitees.forEach(function(recipientAddress) {
                const promise = sendInvitationForRecipient(recipientAddress, sender);
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

    // Builds message headers for in-reply-to and references
    function buildMessageHeaders() {
        const headers = {};

        if ($scope.inReplyTo) {
            headers['in-reply-to'] = '