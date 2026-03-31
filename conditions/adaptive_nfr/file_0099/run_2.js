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
    // Writer State Management
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

    // ============================================================================
    // Field Management
    // ============================================================================

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

    function fillFields(replyToMsg, replyAll, forward) {
        if (!replyToMsg) {
            return;
        }

        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        if (!forward) {
            fillReplyFields(replyToMsg);
        }

        if (replyAll) {
            fillReplyAllFields(replyToMsg);
        }

        if (forward) {
            fillForwardFields(replyToMsg);
        }

        fillSubject(replyToMsg, forward);
        fillBody(replyToMsg, forward);
    }

    function fillReplyFields(replyToMsg) {
        var replyTo = getReplyToAddress(replyToMsg);
        
        $scope.to.unshift({ address: replyTo });
        $scope.to.forEach($scope.verify);

        $scope.references = replyToMsg.references || [];
        if (replyToMsg.id && $scope.references.indexOf(replyToMsg.id) < 0) {
            $scope.references = $scope.references.concat(replyToMsg.id);
        }
        if (replyToMsg.id) {
            $scope.inReplyTo = replyToMsg.id;
        }
    }

    function fillReplyAllFields(replyToMsg) {
        var me = auth.emailAddress;
        var replyTo = getReplyToAddress(replyToMsg);

        replyToMsg.to.concat(replyToMsg.cc).forEach(function(recipient) {
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

    function fillForwardFields(replyToMsg) {
        $scope.attachments = [].concat(replyToMsg.attachments);
        if (replyToMsg.id) {
            $scope.references = [replyToMsg.id];
        }
    }

    function fillSubject(replyToMsg, forward) {
        if (forward) {
            $scope.subject = 'Fwd: ' + replyToMsg.subject;
        } else {
            $scope.subject = replyToMsg.subject ? 'Re: ' + replyToMsg.subject.replace('Re: ', '') : '';
        }
    }

    function fillBody(replyToMsg, forward) {
        var from = replyToMsg.from[0].name || getReplyToAddress(replyToMsg);
        var sentDate = $filter('date')(replyToMsg.sentDate, 'EEEE, MMM d, yyyy h:mm a');
        var body = '';

        if (forward) {
            body = buildForwardHeader(replyToMsg, sentDate);
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (replyToMsg.body) {
            body += replyToMsg.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            $scope.body = body;
        }
    }

    function buildForwardHeader(replyToMsg, sentDate) {
        var header = '\n\n---------- Forwarded message ----------\n';
        header += 'From: ' + replyToMsg.from[0].name + ' <' + replyToMsg.from[0].address + '>\n';
        header += 'Date: ' + sentDate + '\n';
        header += 'Subject: ' + replyToMsg.subject + '\n';
        header += 'To: ' + formatAddressList(replyToMsg.to) + '\n';
        
        if (replyToMsg.cc && replyToMsg.cc.length > 0) {
            header += 'Cc: ' + formatAddressList(replyToMsg.cc) + '\n';
        }
        
        header += '\n\n';
        return header;
    }

    function formatAddressList(addresses) {
        return addresses.map(function(addr) {
            return (addr.name ? addr.name : addr.address) + ' <' + addr.address + '>';
        }).join(', ');
    }

    function getReplyToAddress(replyToMsg) {
        return replyToMsg.replyTo && replyToMsg.replyTo[0] && replyToMsg.replyTo[0].address || replyToMsg.from[0].address;
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

        var allSecure = true;
        var numReceivers = 0;

        var recipients = $scope.to.concat($scope.cc).concat($scope.bcc);
        recipients.forEach(function(recipient) {
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
        });

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

    // ============================================================================
    // Attachment Management
    // ============================================================================

    function removeAttachment(attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    }

    // ============================================================================
    // Invitation
    // ============================================================================

    function inviteUsers() {
        var sender = auth.emailAddress;
        var invitees = collectInvitees();

        if (invitees.length === 0) {
            return $q.resolve();
        }

        $scope.showInvite = false;

        return $q.resolve()
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
        var recipients = $scope.to.concat($scope.cc).concat($scope.bcc);

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
                }
                return keychain.listLocalPublicKeys()
                    .then(function(keys