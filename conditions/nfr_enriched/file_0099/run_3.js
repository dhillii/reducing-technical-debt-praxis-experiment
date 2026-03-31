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
        $scope.body = formatBugReportBody(dump);
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
        entry += '[' + getLogLevelTag(level) + ']';
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

    function getLogLevelTag(level) {
        var tags = {
            [axe.DEBUG]: 'DEBUG',
            [axe.INFO]: 'INFO',
            [axe.WARN]: 'WARN',
            [axe.ERROR]: 'ERROR'
        };
        return tags[level] || 'UNKNOWN';
    }

    function formatBugReportBody(dump) {
        var template = str.bugReportBody
            .replace('{0}', navigator.userAgent)
            .replace('{1}', cfg.appVersion);
        return template + dump;
    }

    // ============================================================================
    // Reply/Forward Logic
    // ============================================================================

    function fillFields(replyTo, replyAll, forward) {
        if (!replyTo) {
            return;
        }

        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        if (!forward) {
            fillReplyFields(replyTo, replyAll);
        }

        if (replyAll) {
            fillReplyAllFields(replyTo);
        }

        if (forward) {
            fillForwardFields(replyTo);
        }

        fillSubject(replyTo, forward);
        fillBody(replyTo, forward);
    }

    function fillReplyFields(replyTo, replyAll) {
        var replyAddress = getReplyAddress(replyTo);
        
        $scope.to.unshift({ address: replyAddress });
        $scope.to.forEach($scope.verify);

        $scope.references = (replyTo.references || []);
        if (replyTo.id && $scope.references.indexOf(replyTo.id) < 0) {
            $scope.references = $scope.references.concat(replyTo.id);
        }
        if (replyTo.id) {
            $scope.inReplyTo = replyTo.id;
        }
    }

    function fillReplyAllFields(replyTo) {
        var me = auth.emailAddress;
        var replyAddress = getReplyAddress(replyTo);

        replyTo.to.concat(replyTo.cc).forEach(function(recipient) {
            if (recipient.address === me && replyAddress !== me) {
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

    function fillForwardFields(replyTo) {
        $scope.attachments = [].concat(replyTo.attachments);
        if (replyTo.id) {
            $scope.references = [replyTo.id];
        }
    }

    function fillSubject(replyTo, forward) {
        if (forward) {
            $scope.subject = 'Fwd: ' + replyTo.subject;
        } else {
            $scope.subject = replyTo.subject ? 'Re: ' + replyTo.subject.replace('Re: ', '') : '';
        }
    }

    function fillBody(replyTo, forward) {
        var from = replyTo.from[0].name || getReplyAddress(replyTo);
        var sentDate = $filter('date')(replyTo.sentDate, 'EEEE, MMM d, yyyy h:mm a');
        var body = '';

        if (forward) {
            body = formatForwardHeader(replyTo, sentDate);
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (replyTo.body) {
            body += replyTo.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            $scope.body = body;
        }
    }

    function formatForwardHeader(replyTo, sentDate) {
        var header = '\n\n---------- Forwarded message ----------\n';
        header += 'From: ' + replyTo.from[0].name + ' <' + replyTo.from[0].address + '>\n';
        header += 'Date: ' + sentDate + '\n';
        header += 'Subject: ' + replyTo.subject + '\n';
        header += 'To: ' + formatRecipientList(replyTo.to) + '\n';
        
        if (replyTo.cc && replyTo.cc.length > 0) {
            header += 'Cc: ' + formatRecipientList(replyTo.cc) + '\n';
        }
        
        header += '\n\n';
        return header;
    }

    function formatRecipientList(recipients) {
        return recipients.map(function(recipient) {
            var name = recipient.name || recipient.address;
            return name + ' <' + recipient.address + '>';
        }).join(', ');
    }

    function getReplyAddress(replyTo) {
        return replyTo.replyTo && replyTo.replyTo[0] && replyTo.replyTo[0].address || replyTo.from[0].address;
    }

    // ============================================================================
    // Header Editing
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

        var recipients = collectAllRecipients();
        var validRecipients = validateRecipients(recipients);
        var allSecure = validateSecurity(validRecipients);

        if (validRecipients.length < 1) {
            $scope.showInvite = false;
            return;
        }

        if (hasBccRecipients()) {
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

    function collectAllRecipients() {
        return $scope.to.concat($scope.cc).concat($scope.bcc);
    }

    function validateRecipients(recipients) {
        return recipients.filter(function(recipient) {
            if (!util.validateEmailAddress(recipient.address)) {
                dialog.info({
                    title: 'Warning',
                    message: 'Invalid recipient address!'
                });
                return false;
            }
            return true;
        });
    }

    function validateSecurity(recipients) {
        return recipients.every(function(recipient) {
            return recipient.secure;
        });
    }

    function hasBccRecipients() {
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
        var recipients = collectAllRecipients();

        recipients.forEach(function(recipient) {
            if (util.validateEmailAddress(recipient.address) && 
                !recipient.secure && 
                $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        });

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
            folder: getCurrentFolder(),
            message: $scope.replyTo
        });
    }

    // ============================================================================
    // Tag Input & Autocomplete
    // ============================================================================