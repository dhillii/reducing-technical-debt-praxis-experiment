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
    $scope.invite = inviteUsers;
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
        $scope.body = str.bugReportBody
            .replace('{0}', navigator.userAgent)
            .replace('{1}', cfg.appVersion) + dump;
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
    // Fill Fields (Reply/Forward)
    // ============================================================================

    function fillFields(originalMessage, replyAll, forward) {
        if (!originalMessage) {
            return;
        }

        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        if (!forward) {
            fillReplyFields(originalMessage, replyAll);
        }

        if (replyAll) {
            fillReplyAllFields(originalMessage);
        }

        if (forward) {
            fillForwardFields(originalMessage);
        }

        fillSubject(originalMessage, forward);
        fillBody(originalMessage, forward);
    }

    function fillReplyFields(originalMessage, replyAll) {
        var replyTo = getReplyToAddress(originalMessage);
        
        $scope.to.unshift({ address: replyTo });
        $scope.to.forEach($scope.verify);

        $scope.references = (originalMessage.references || []);
        if (originalMessage.id && $scope.references.indexOf(originalMessage.id) < 0) {
            $scope.references = $scope.references.concat(originalMessage.id);
        }
        if (originalMessage.id) {
            $scope.inReplyTo = originalMessage.id;
        }
    }

    function fillReplyAllFields(originalMessage) {
        var me = auth.emailAddress;
        var replyTo = getReplyToAddress(originalMessage);

        originalMessage.to.concat(originalMessage.cc).forEach(function(recipient) {
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

    function fillForwardFields(originalMessage) {
        $scope.attachments = [].concat(originalMessage.attachments);
        if (originalMessage.id) {
            $scope.references = [originalMessage.id];
        }
    }

    function fillSubject(originalMessage, forward) {
        if (forward) {
            $scope.subject = 'Fwd: ' + originalMessage.subject;
        } else {
            $scope.subject = originalMessage.subject 
                ? 'Re: ' + originalMessage.subject.replace('Re: ', '') 
                : '';
        }
    }

    function fillBody(originalMessage, forward) {
        var replyTo = getReplyToAddress(originalMessage);
        var from = originalMessage.from[0].name || replyTo;
        var sentDate = $filter('date')(originalMessage.sentDate, 'EEEE, MMM d, yyyy h:mm a');
        var body = '';

        if (forward) {
            body = buildForwardHeader(originalMessage, sentDate);
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (originalMessage.body) {
            body += originalMessage.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            $scope.body = body;
        }
    }

    function buildForwardHeader(originalMessage, sentDate) {
        var header = '\n\n---------- Forwarded message ----------\n';
        header += 'From: ' + originalMessage.from[0].name + ' <' + originalMessage.from[0].address + '>\n';
        header += 'Date: ' + sentDate + '\n';
        header += 'Subject: ' + originalMessage.subject + '\n';
        header += 'To: ' + formatAddressList(originalMessage.to) + '\n';
        
        if (originalMessage.cc && originalMessage.cc.length > 0) {
            header += 'Cc: ' + formatAddressList(originalMessage.cc) + '\n';
        }
        
        header += '\n\n';
        return header;
    }

    function formatAddressList(addresses) {
        return addresses.map(function(addr) {
            return (addr.name ? addr.name : addr.address) + ' <' + addr.address + '>';
        }).join(', ');
    }

    function getReplyToAddress(originalMessage) {
        return originalMessage.replyTo && originalMessage.replyTo[0] && originalMessage.replyTo[0].address 
            || originalMessage.from[0].address;
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

        normalizeRecipient(recipient);
        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();

        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        return $q.resolve()
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

    function normalizeRecipient(recipient) {
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

        var stats = analyzeRecipients();

        if (stats.numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            stats.allSecure = false;
        }

        if (stats.allSecure) {
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

        var check = function(recipient) {
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

        $scope.to.forEach(check);
        $scope.cc.forEach(check);
        $scope.bcc.forEach(check);

        return { allSecure: allSecure, numReceivers: numReceivers };
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

    function inviteUsers() {
        var sender = auth.emailAddress;
        var invitees = collectUninvitedRecipients();

        $scope.showInvite = false;

        if (invitees.length === 0) {
            return $q.resolve();
        }

        return $q.resolve()
            .then(function() {
                return sendInvitations(sender, invitees);
            })
            .catch(function(err) {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    }

    function collectUninvitedRecipients() {
        var invitees = [];
        var check = function(recipient) {
            if (util.validateEmailAddress(recipient.address) && 
                !recipient.secure && 
                $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(check);
        $scope.cc.forEach(check);
        $scope.bcc.forEach(check);

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

        return $q.resolve()
            .then(function() {
                return outbox.put(message);
            })
            .then(function() {
                if (!$scope.replyTo || $scope.replyTo.answered) {
                    return;
                }

                $scope.replyTo.answered = true;
                return email.setFlags({
                    folder: currentFolder(),
                    message: $scope.replyTo
                });
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

    // ============================================================================
    // Tag Input & Autocomplete
    // ============================================================================

    function getTagStyle(recipient) {
        var classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    }

    function lookupAddressBook(query) {
        return $q.resolve()
            .then(function() {
                if ($scope.addressBookCache) {
                    return;