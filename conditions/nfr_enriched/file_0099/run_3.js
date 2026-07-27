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

    // Creates a log appender that formats log entries with level, timestamp, component, and stack trace
    function createLogAppender() {
        let dump = '';
        return {
            log: function(level, date, component, log) {
                dump += formatLogLevel(level);
                dump += '[' + date.toISOString() + ']';

                if (component) {
                    dump += '[' + component + ']';
                }

                dump += ' ' + (log || '').toString();

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

    // Formats log level prefix based on axe log level constant
    function formatLogLevel(level) {
        if (level === axe.DEBUG) {
            return '[DEBUG]';
        } else if (level === axe.INFO) {
            return '[INFO]';
        } else if (level === axe.WARN) {
            return '[WARN]';
        } else if (level === axe.ERROR) {
            return '[ERROR]';
        }
        return '';
    }

    // Generates bug report email with application logs and system information
    function reportBug() {
        const appender = createLogAppender();
        axe.dump(appender);

        $scope.to = [{
            address: str.supportAddress
        }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + appender.getDump();
    }

    // Extracts reply-to address from email, preferring replyTo field over from field
    function getReplyToAddress(email) {
        return email.replyTo && email.replyTo[0] && email.replyTo[0].address || email.from[0].address;
    }

    // Populates recipient field and sets up message references for reply
    function setupReplyRecipients(email, replyTo) {
        $scope.to.unshift({
            address: replyTo
        });
        $scope.to.forEach($scope.verify);

        $scope.references = (email.references || []);
        if (email.id && $scope.references.indexOf(email.id) < 0) {
            $scope.references = $scope.references.concat(email.id);
        }
        if (email.id) {
            $scope.inReplyTo = email.id;
        }
    }

    // Adds all recipients from original email to CC field, filtering out self and duplicates
    function setupReplyAllRecipients(email) {
        const me = auth.emailAddress;
        const replyTo = getReplyToAddress(email);

        email.to.concat(email.cc).forEach(function(recipient) {
            if (recipient.address === me && replyTo !== me) {
                return;
            }
            $scope.cc.unshift({
                address: recipient.address
            });
        });

        $scope.cc = _.uniq($scope.cc, function(recipient) {
            return recipient.address;
        });
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    // Copies attachments and sets up references for forwarded email
    function setupForwardAttachments(email) {
        $scope.attachments = [].concat(email.attachments);
        if (email.id) {
            $scope.references = [email.id];
        }
    }

    // Formats subject line based on reply or forward action
    function formatSubject(email, isForward) {
        if (isForward) {
            return 'Fwd: ' + email.subject;
        } else {
            return email.subject ? 'Re: ' + email.subject.replace('Re: ', '') : '';
        }
    }

    // Formats recipient list as comma-separated string with names and addresses
    function formatRecipientList(recipients) {
        let result = '';
        recipients.forEach(function(recipient) {
            result += (result) ? ', ' : '';
            result += ((recipient.name) ? recipient.name : recipient.address) + ' <' + recipient.address + '>';
        });
        return result;
    }

    // Generates quoted text body for reply or forward
    function generateQuotedBody(email, isForward, from, sentDate) {
        let body;

        if (isForward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + email.from[0].name + ' <' + email.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + email.subject + '\n' +
                'To: ' + formatRecipientList(email.to) + '\n' +
                ((email.cc && email.cc.length > 0) ? 'Cc: ' + formatRecipientList(email.cc) + '\n' : '') +
                '\n\n';
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (email.body) {
            body += email.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }

        return body;
    }

    // Populates composer fields based on reply/forward action and original email
    function fillFields(re, replyAll, forward) {
        if (!re) {
            return;
        }

        $scope.writerTitle = (forward) ? 'Forward' : 'Reply';

        const replyTo = getReplyToAddress(re);

        if (!forward) {
            setupReplyRecipients(re, replyTo);
        }

        if (replyAll) {
            setupReplyAllRecipients(re);
        }

        if (forward) {
            setupForwardAttachments(re);
        }

        $scope.subject = formatSubject(re, forward);

        const from = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        $scope.body = generateQuotedBody(re, forward, from, sentDate);
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

    // Validates recipient address format
    function validateRecipientAddress(recipient) {
        if (!util.validateEmailAddress(recipient.address)) {
            return dialog.info({
                title: 'Warning',
                message: 'Invalid recipient address!'
            });
        }
        return true;
    }

    // Checks if recipient has a secure key
    function isRecipientSecure(recipient) {
        return recipient.secure === true;
    }

    // Counts valid receivers and determines overall security status
    function analyzeRecipients() {
        let allSecure = true;
        let numReceivers = 0;

        const checkRecipient = function(recipient) {
            if (!validateRecipientAddress(recipient)) {
                return;
            }
            numReceivers++;
            if (!isRecipientSecure(recipient)) {
                allSecure = false;
            }
        };

        $scope.to.forEach(checkRecipient);
        $scope.cc.forEach(checkRecipient);
        $scope.bcc.forEach(checkRecipient);

        return {
            numReceivers: numReceivers,
            allSecure: allSecure
        };
    }

    // Sets send button state based on security and recipient validation
    function setSendButtonState(analysis) {
        if (analysis.numReceivers < 1) {
            $scope.showInvite = false;
            $scope.okToSend = false;
            $scope.sendBtnText = undefined;
            $scope.sendBtnSecure = undefined;
            return;
        }

        const hasBcc = $scope.bcc.filter(filterEmptyAddresses).length > 0;
        const isSecure = analysis.allSecure && !hasBcc;

        $scope.okToSend = true;
        $scope.sendBtnText = isSecure ? str.sendBtnSecure : str.sendBtnClear;
        $scope.sendBtnSecure = isSecure;
        $scope.showInvite = false;
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        const analysis = analyzeRecipients();
        setSendButtonState(analysis);
    };

    //
    // Editing attachments
    //

    $scope.remove = function(attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    // Collects all recipients without secure keys
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

    // Sends invitation mail and registers invitation for single recipient
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
        }).then(function() {
            $scope.invited.push(recipientAddress);
        });
    }

    /**
     * Invite all users without a public key
     */
    $scope.invite = function() {
        const sender = auth.emailAddress;
        const invitees = collectInvitees();

        $scope.showInvite = false;

        if (invitees.length === 0) {
            return Promise.resolve();
        }

        return $q(function(resolve) {
            resolve();

        }).then(function() {
            const sendJobs = invitees.map(function(recipientAddress) {
                return sendInvitationForRecipient(recipientAddress, sender);
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
            headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
        }

        if ($scope.references && $scope.references.length) {
            headers.references = $scope.references.map(function(reference) {
                return '<' + reference + '>';
            }).join(' ');
        }

        return headers;
    }

    // Constructs email message object from composer fields
    function buildMessage() {
        return {
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
            headers: buildMessageHeaders()
        };
    }

    // Marks original email as answered if replying
    function markOriginalAsAnswered() {
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
        const message = buildMessage();

        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q(function(resolve) {
            resolve();

        }).then(function() {
            return outbox.put(message);

        }).then(function() {
            return markOriginalAsAnswered();

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

    // Populates address book cache from local public keys
    function populateAddressBookCache() {
        if ($scope.addressBookCache) {
            return Promise.resolve();
        }

        return keychain.listLocalPublicKeys().then(function(keys) {
            $scope.addressBookCache = keys.map(function(key) {
                const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                return {
                    address: key.userId,
                    displayId: name + ' - ' + key.userId
                };
            });
        });
    }

    // Filters address book cache by query string
    function filterAddressBook(query) {
        return $scope.addressBookCache.filter(function(entry) {
            return entry.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
    }

    $scope.lookupAddressBook = function(query) {
        return $q(function(resolve) {
            resolve();

        }).then(function() {
            return populateAddressBookCache();

        }).then(function() {
            return filterAddressBook(query);

        }).catch(dialog.error);
    };

    //
    // Helpers
    //

    // Returns current folder from navigation state
    function currentFolder() {
        return $scope.state.nav.currentFolder;
    }

    // Filters out objects without an address property
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;