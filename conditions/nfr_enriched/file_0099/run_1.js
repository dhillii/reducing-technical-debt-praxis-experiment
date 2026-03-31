```javascript
'use strict';

var util = require('crypto-lib').util;

var WriteCtrl = function($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {
    var str = appConfig.string;
    var cfg = appConfig.config;

    $scope.keyId = 'XXXXXXXX';

    // Initialize writer state
    initializeWriterState();

    // Public API
    $scope.toggleShowBCC = toggleShowBCC;
    $scope.verify = verifyRecipient;
    $scope.checkSendStatus = checkSendStatus;
    $scope.remove = removeAttachment;
    $scope.invite = inviteUnverifiedRecipients;
    $scope.sendToOutbox = sendToOutbox;
    $scope.tagStyle = getTagStyle;
    $scope.lookupAddressBook = lookupAddressBook;

    // ============================================================================
    // Initialization
    // ============================================================================

    function initializeWriterState() {
        $scope.state.writer = {
            write: handleWrite,
            reportBug: handleReportBug,
            close: handleClose
        };
    }

    function handleWrite(replyTo, replyAll, forward) {
        $scope.state.lightbox = 'write';
        $scope.replyTo = replyTo;
        resetFields();
        fillFields(replyTo, replyAll, forward);
        $scope.verify($scope.to[0]);
    }

    function handleReportBug() {
        $scope.state.lightbox = 'write';
        resetFields();
        populateBugReport();
        $scope.verify($scope.to[0]);
    }

    function handleClose() {
        $scope.state.lightbox = undefined;
    }

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

    // ============================================================================
    // Bug Report
    // ============================================================================

    function populateBugReport() {
        var dump = collectDebugLogs();
        
        $scope.to = [{ address: str.supportAddress }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody
            .replace('{0}', navigator.userAgent)
            .replace('{1}', cfg.appVersion) + dump;
    }

    function collectDebugLogs() {
        var dump = '';
        var appender = {
            log: function(level, date, component, log) {
                dump += formatLogEntry(level, date, component, log);
            }
        };
        axe.dump(appender);
        return dump;
    }

    function formatLogEntry(level, date, component, log) {
        var entry = '';
        entry += '[' + formatLogLevel(level) + ']';
        entry += '[' + date.toISOString() + ']';
        
        if (component) {
            entry += '[' + component + ']';
        }
        
        entry += ' ' + (log || '').toString();
        
        if (log && log.stack) {
            entry += ' . Stack: ' + log.stack;
        }
        
        entry += '\n';
        return entry;
    }

    function formatLogLevel(level) {
        var levels = {
            [axe.DEBUG]: 'DEBUG',
            [axe.INFO]: 'INFO',
            [axe.WARN]: 'WARN',
            [axe.ERROR]: 'ERROR'
        };
        return levels[level] || 'UNKNOWN';
    }

    // ============================================================================
    // Email Composition
    // ============================================================================

    function fillFields(replyToMessage, replyAll, forward) {
        if (!replyToMessage) {
            return;
        }

        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        if (!forward) {
            fillReplyFields(replyToMessage);
        }

        if (replyAll) {
            fillReplyAllFields(replyToMessage);
        }

        if (forward) {
            fillForwardFields(replyToMessage);
        }

        fillSubject(replyToMessage, forward);
        fillBody(replyToMessage, forward);
    }

    function fillReplyFields(message) {
        var replyTo = getReplyToAddress(message);
        
        $scope.to.unshift({ address: replyTo });
        $scope.to.forEach($scope.verify);
        
        $scope.references = (message.references || []);
        if (message.id && $scope.references.indexOf(message.id) < 0) {
            $scope.references = $scope.references.concat(message.id);
        }
        if (message.id) {
            $scope.inReplyTo = message.id;
        }
    }

    function fillReplyAllFields(message) {
        var me = auth.emailAddress;
        var replyTo = getReplyToAddress(message);
        
        message.to.concat(message.cc).forEach(function(recipient) {
            if (recipient.address === me && replyTo !== me) {
                return;
            }
            $scope.cc.unshift({ address: recipient.address });
        });

        $scope.cc = _.uniq($scope.cc, function(recipient) {
            return recipient.address;
        });
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    function fillForwardFields(message) {
        $scope.attachments = [].concat(message.attachments);
        if (message.id) {
            $scope.references = [message.id];
        }
    }

    function fillSubject(message, forward) {
        if (forward) {
            $scope.subject = 'Fwd: ' + message.subject;
        } else {
            $scope.subject = message.subject ? 'Re: ' + message.subject.replace('Re: ', '') : '';
        }
    }

    function fillBody(message, forward) {
        var from = message.from[0].name || getReplyToAddress(message);
        var sentDate = $filter('date')(message.sentDate, 'EEEE, MMM d, yyyy h:mm a');
        var body = '';

        if (forward) {
            body = formatForwardedMessage(message, sentDate);
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (message.body) {
            body += message.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            $scope.body = body;
        }
    }

    function formatForwardedMessage(message, sentDate) {
        var header = '\n\n---------- Forwarded message ----------\n' +
            'From: ' + message.from[0].name + ' <' + message.from[0].address + '>\n' +
            'Date: ' + sentDate + '\n' +
            'Subject: ' + message.subject + '\n' +
            'To: ' + formatRecipientList(message.to) + '\n';

        if (message.cc && message.cc.length > 0) {
            header += 'Cc: ' + formatRecipientList(message.cc) + '\n';
        }

        return header + '\n\n';
    }

    function formatRecipientList(recipients) {
        return recipients.map(function(recipient) {
            var name = recipient.name || recipient.address;
            return name + ' <' + recipient.address + '>';
        }).join(', ');
    }

    function getReplyToAddress(message) {
        return message.replyTo && message.replyTo[0] && message.replyTo[0].address || message.from[0].address;
    }

    // ============================================================================
    // Recipient Verification
    // ============================================================================

    function toggleShowBCC() {
        $scope.showBCC = true;
        return dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    }

    function verifyRecipient(recipient) {
        if (!recipient) {
            return;
        }

        normalizeRecipientAddress(recipient);
        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();

        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        return $q.when(null)
            .then(function() {
                return keychain.refreshKeyForUserId({ userId: recipient.address });
            })
            .then(function(key) {
                if (key) {
                    var userIds = pgp.getKeyParams(key.publicKey).userIds;
                    var matchingUserId = _.findWhere(userIds, { emailAddress: recipient.address });
                    if (matchingUserId) {
                        recipient.key = key;
                        recipient.secure = true;
                    }
                } else {
                    $scope.showInvite = true;
                }
                $scope.checkSendStatus();
            })
            .catch(dialog.error);
    }

    function normalizeRecipientAddress(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    function checkSendStatus() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        var recipientStatus = analyzeRecipients();

        if (recipientStatus.numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        var allSecure = recipientStatus.allSecure && !hasNonEmptyBCC();

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

    function analyzeRecipients() {
        var allSecure = true;
        var numReceivers = 0;

        var validateRecipient = function(recipient) {
            if (!util.validateEmailAddress(recipient.address)) {
                dialog.info({
                    title: 'Warning',
                    message: 'Invalid recipient address!'
                });
                return;
            }
            numReceivers++;
            if (!recipient.secure) {
                allSecure = false;
            }
        };

        $scope.to.forEach(validateRecipient);
        $scope.cc.forEach(validateRecipient);
        $scope.bcc.forEach(validateRecipient);

        return { allSecure: allSecure, numReceivers: numReceivers };
    }

    function hasNonEmptyBCC() {
        return $scope.bcc.filter(filterEmptyAddresses).length > 0;
    }

    // ============================================================================
    // Attachments
    // ============================================================================

    function removeAttachment(attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    }

    // ============================================================================
    // Invitations
    // ============================================================================

    function inviteUnverifiedRecipients() {
        var sender = auth.emailAddress;
        var invitees = collectUnverifiedRecipients();

        if (invitees.length === 0) {
            return $q.when(null);
        }

        $scope.showInvite = false;

        return sendInvitations(sender, invitees)
            .catch(function(err) {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    }

    function collectUnverifiedRecipients() {
        var invitees = [];
        var addIfUnverified = function(recipient) {
            if (util.validateEmailAddress(recipient.address) && 
                !recipient.secure && 
                $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(addIfUnverified);
        $scope.cc.forEach(addIfUnverified);
        $scope.bcc.forEach(addIfUnverified);

        return invitees;
    }

    function sendInvitations(sender, invitees) {
        var sendJobs = [];

        invitees.forEach(function(recipientAddress) {
            var invitationMail = invitation.createMail({
                sender: sender,
                recipient: recipientAddress
            });

            var promise = outbox.put(invitationMail)
                .then(function() {
                    return invitation.invite({
                        recipient: recipientAddress,
                        sender: sender
                    });
                });

            sendJobs.push(promise);
            $scope.invited.push(recipientAddress);
        });

        return Promise.all(sendJobs);
    }

    // ============================================================================
    // Sending
    // ============================================================================

    function sendToOutbox() {
        var message = buildMessage();

        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q.when(null)
            .then(function() {
                return outbox.put(message);
            })
            .then(function() {
                return markReplyAsAnswered();
            })
            .catch(function(err) {
                if (err.code !== 42) {
                    dialog.error(err);
                }
            });
    }

    function buildMessage() {
        var message = {
            from: [{
                name: auth.realname,
                address: auth.emailAddress
            }],
            to: $scope.to.filter(filterEmptyAddresses),
            cc: $scope.cc.filter(filterEmptyAddresses),
            bcc: $scope.bcc.filter(filterEmptyAddresses),
            subject: $scope.subject.trim() || str.fallbackSubject,
            body: $scope.body.trim(),
            attachments: $scope.attachments,
            sentDate: new Date(),
            headers: {}
        };

        if ($scope.inReplyTo) {
            message.headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
        }

        if ($scope.references && $scope.references.length) {
            message.headers.references = $scope.references
                .map(function(reference) {
                    return '<' + reference + '>';
                })
                .join(' ');
        }

        return message;
    }

    function markReplyAsAnswered() {
        if (!$scope.replyTo || $scope.replyTo.answered) {
            return;
        }

        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: currentFolder(),
            message: $scope.replyTo
        });
    }

    // ============================================================================
    // Address Book & Autocomplete
    // ============================================================================

    function getTagStyle(recipient) {
        var classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    }

    function lookupAddressBook(query) {
        return $q.when(null)
            .then(function()