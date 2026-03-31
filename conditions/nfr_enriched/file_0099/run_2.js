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
    $scope.invite = inviteRecipients;
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
        var dump = collectLogs();
        
        $scope.to = [{ address: str.supportAddress }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = formatBugReportBody(dump);
    }

    function collectLogs() {
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
        entry += '[' + getLevelTag(level) + ']';
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

    function getLevelTag(level) {
        var levelMap = {
            [axe.DEBUG]: 'DEBUG',
            [axe.INFO]: 'INFO',
            [axe.WARN]: 'WARN',
            [axe.ERROR]: 'ERROR'
        };
        return levelMap[level] || 'UNKNOWN';
    }

    function formatBugReportBody(dump) {
        var template = str.bugReportBody
            .replace('{0}', navigator.userAgent)
            .replace('{1}', cfg.appVersion);
        return template + dump;
    }

    // ============================================================================
    // Fill Fields (Reply/Forward)
    // ============================================================================

    function fillFields(replyMessage, replyAll, forward) {
        if (!replyMessage) {
            return;
        }

        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        if (!forward) {
            fillReplyFields(replyMessage);
        }

        if (replyAll) {
            fillReplyAllFields(replyMessage);
        }

        if (forward) {
            fillForwardFields(replyMessage);
        }

        fillSubject(replyMessage, forward);
        fillBody(replyMessage, forward);
    }

    function fillReplyFields(replyMessage) {
        var replyTo = getReplyToAddress(replyMessage);
        
        $scope.to.unshift({ address: replyTo });
        $scope.to.forEach($scope.verify);

        $scope.references = replyMessage.references || [];
        if (replyMessage.id && $scope.references.indexOf(replyMessage.id) < 0) {
            $scope.references = $scope.references.concat(replyMessage.id);
        }
        if (replyMessage.id) {
            $scope.inReplyTo = replyMessage.id;
        }
    }

    function fillReplyAllFields(replyMessage) {
        var me = auth.emailAddress;
        var replyTo = getReplyToAddress(replyMessage);

        replyMessage.to.concat(replyMessage.cc).forEach(function(recipient) {
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

    function fillForwardFields(replyMessage) {
        $scope.attachments = [].concat(replyMessage.attachments);
        if (replyMessage.id) {
            $scope.references = [replyMessage.id];
        }
    }

    function fillSubject(replyMessage, forward) {
        if (forward) {
            $scope.subject = 'Fwd: ' + replyMessage.subject;
        } else {
            $scope.subject = replyMessage.subject 
                ? 'Re: ' + replyMessage.subject.replace('Re: ', '') 
                : '';
        }
    }

    function fillBody(replyMessage, forward) {
        var from = replyMessage.from[0].name || getReplyToAddress(replyMessage);
        var sentDate = $filter('date')(replyMessage.sentDate, 'EEEE, MMM d, yyyy h:mm a');
        var body = '';

        if (forward) {
            body = formatForwardedMessage(replyMessage, sentDate);
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (replyMessage.body) {
            body += replyMessage.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            $scope.body = body;
        }
    }

    function formatForwardedMessage(msg, sentDate) {
        var header = '\n\n---------- Forwarded message ----------\n' +
            'From: ' + msg.from[0].name + ' <' + msg.from[0].address + '>\n' +
            'Date: ' + sentDate + '\n' +
            'Subject: ' + msg.subject + '\n' +
            'To: ' + formatAddressList(msg.to) + '\n';

        if (msg.cc && msg.cc.length > 0) {
            header += 'Cc: ' + formatAddressList(msg.cc) + '\n';
        }

        return header + '\n\n';
    }

    function formatAddressList(addresses) {
        return addresses.map(function(addr) {
            return (addr.name ? addr.name : addr.address) + ' <' + addr.address + '>';
        }).join(', ');
    }

    function getReplyToAddress(message) {
        return message.replyTo && message.replyTo[0] && message.replyTo[0].address || message.from[0].address;
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

        return $q.when()
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

        if (recipientStatus.allSecure && !hasBccRecipients()) {
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

        var checkRecipient = function(recipient) {
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

        $scope.to.forEach(checkRecipient);
        $scope.cc.forEach(checkRecipient);
        $scope.bcc.forEach(checkRecipient);

        return { allSecure: allSecure, numReceivers: numReceivers };
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

    function inviteRecipients() {
        var sender = auth.emailAddress;
        var invitees = collectInvitees();

        $scope.showInvite = false;

        if (invitees.length === 0) {
            return $q.when();
        }

        return $q.when()
            .then(function() {
                return sendInvitations(sender, invitees);
            })
            .catch(function(err) {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    }

    function collectInvitees() {
        var invitees = [];
        var checkRecipient = function(recipient) {
            if (util.validateEmailAddress(recipient.address) && 
                !recipient.secure && 
                $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(checkRecipient);
        $scope.cc.forEach(checkRecipient);
        $scope.bcc.forEach(checkRecipient);

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

        return $q.when()
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
                .map(function(ref) { return '<' + ref + '>'; })
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

    function getTagStyle(recipient) {
        var classes = ['label'];