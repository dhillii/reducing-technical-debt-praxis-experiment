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

    // Reset all composer fields to initial state
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

    // Format a single log entry with level, timestamp, component, and message
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

    // Collect application logs and prepare bug report email
    function reportBug() {
        let dump = '';
        const appender = {
            log: function(level, date, component, log) {
                dump += formatLogEntry(level, date, component, log);
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

    // Extract reply-to address from email headers
    function extractReplyToAddress(email) {
        return email.replyTo && email.replyTo[0] && email.replyTo[0].address || email.from[0].address;
    }

    // Format recipient list as comma-separated string with names and addresses
    function formatRecipientList(recipients) {
        let result = '';
        recipients.forEach(function(recipient) {
            result += (result) ? ', ' : '';
            result += ((recipient.name) ? recipient.name : recipient.address) + ' <' + recipient.address + '>';
        });
        return result;
    }

    // Build quoted text body for reply or forward
    function buildQuotedBody(email, isForward, replyToAddress) {
        let body = '';
        const from = email.from[0].name || replyToAddress;
        const sentDate = $filter('date')(email.sentDate, 'EEEE, MMM d, yyyy h:mm a');

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

    // Handle reply-to recipient and message references
    function handleReplyRecipients(email, replyAll, replyToAddress) {
        $scope.to.unshift({
            address: replyToAddress
        });
        $scope.to.forEach($scope.verify);

        $scope.references = (email.references || []);
        if (email.id && $scope.references.indexOf(email.id) < 0) {
            $scope.references = $scope.references.concat(email.id);
        }
        if (email.id) {
            $scope.inReplyTo = email.id;
        }

        if (replyAll) {
            handleReplyAllRecipients(email, replyToAddress);
        }
    }

    // Add all original recipients to CC field for reply-all
    function handleReplyAllRecipients(email, replyToAddress) {
        const me = auth.emailAddress;
        email.to.concat(email.cc).forEach(function(recipient) {
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

    // Handle forward-specific field population
    function handleForwardFields(email) {
        // create a new array, otherwise removing an attachment will also
        // remove it from the original in the mail list as a side effect
        $scope.attachments = [].concat(email.attachments);
        if (email.id) {
            $scope.references = [email.id];
        }
    }

    // Populate composer fields based on reply/forward action
    function fillFields(email, replyAll, isForward) {
        if (!email) {
            return;
        }

        $scope.writerTitle = (isForward) ? 'Forward' : 'Reply';

        const replyToAddress = extractReplyToAddress(email);

        // fill recipient field and references
        if (!isForward) {
            handleReplyRecipients(email, replyAll, replyToAddress);
        }

        // fill attachments and references on forward
        if (isForward) {
            handleForwardFields(email);
        }

        // fill subject
        if (isForward) {
            $scope.subject = 'Fwd: ' + email.subject;
        } else {
            $scope.subject = email.subject ? 'Re: ' + email.subject.replace('Re: ', '') : '';
        }

        // fill text body
        $scope.body = buildQuotedBody(email, isForward, replyToAddress);
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

    // Validate email address format
    function isValidEmailAddress(address) {
        return util.validateEmailAddress(address);
    }

    // Set recipient as insecure pending key verification
    function markRecipientInsecure(recipient) {
        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();
    }

    // Update recipient display ID based on input method
    function updateRecipientDisplayId(recipient) {
        if (recipient.address) {
            // display only email address after autocomplete
            recipient.displayId = recipient.address;
        } else {
            // set address after manual input
            recipient.address = recipient.displayId;
        }
    }

    // Fetch and verify public key for recipient
    function verifyRecipientKey(recipient) {
        return keychain.refreshKeyForUserId({
            userId: recipient.address
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
    }

    /**
     * Verify email address and fetch its public key
     */
    $scope.verify = function(recipient) {
        if (!recipient) {
            return;
        }

        updateRecipientDisplayId(recipient);
        markRecipientInsecure(recipient);

        // verify email address
        if (!isValidEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        // check if to address is contained in known public keys
        // when we write an email, we always need to work with the latest keys available
        return $q(function(resolve) {
            resolve();
        }).then(function() {
            return verifyRecipientKey(recipient);
        });
    };

    // Validate recipient address and count receivers
    function validateAndCountRecipient(recipient) {
        // validate address
        if (!isValidEmailAddress(recipient.address)) {
            return dialog.info({
                title: 'Warning',
                message: 'Invalid recipient address!'
            });
        }
        return true;
    }

    // Check if all recipients have secure keys
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

    // Count total number of recipients across all fields
    function countTotalRecipients() {
        let count = 0;
        const increment = function(recipient) {
            if (isValidEmailAddress(recipient.address)) {
                count++;
            }
        };

        $scope.to.forEach(increment);
        $scope.cc.forEach(increment);
        $scope.bcc.forEach(increment);

        return count;
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        // validate all recipients
        $scope.to.forEach(validateAndCountRecipient);
        $scope.cc.forEach(validateAndCountRecipient);
        $scope.bcc.forEach(validateAndCountRecipient);

        const numReceivers = countTotalRecipients();

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

    // Collect recipients without public keys
    function collectInvitees() {
        const invitees = [];
        const check = function(recipient) {
            if (isValidEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(check);
        $scope.cc.forEach(check);
        $scope.bcc.forEach(check);

        return invitees;
    }

    // Send invitation mail and track invitation for single recipient
    function sendInvitationForRecipient(recipientAddress, sender) {
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
        // remember already invited users to prevent spamming
        $scope.invited.push(recipientAddress);
        return promise;
    }

    /**
     * Invite all users without a public key
     */
    $scope.invite = function() {
        const sender = auth.emailAddress;
        const invitees = collectInvitees();

        $scope.showInvite = false;

        if (invitees.length === 0) {
            return $q.when();
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

    // Build message headers for reply/forward tracking
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

    // Construct email message object from composer fields
    function buildEmailMessage() {
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

    // Mark original email as answered if replying
    function markOriginalAsAnswered() {
        if (!$scope.replyTo || $scope.replyTo.answered) {
            return $q.when();
        }

        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: currentFolder(),
            message: $scope.replyTo
        });
    }

    $scope.sendToOutbox = function() {
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
            // if we need to synchronize replyTo.answered = true to imap,
            // let's do that. otherwise, we're done
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

    // Populate address book cache from local public keys
    function populateAddressBookCache() {
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

    // Filter address book cache by query string
    function filterAddressBook(query) {
        return $scope.addressBookCache.filter(function(entry) {
            return entry.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
    }

    $scope.lookupAddressBook = function(query) {
        return $q(function(resolve) {
            resolve();
        }).then(function() {
            if ($scope.addressBookCache) {
                return;
            }
            // populate address book cache
            return populateAddressBookCache();
        }).then(function() {
            // filter the address book cache
            return filterAddressBook(query);
        }).catch(dialog.error);
    };

    //
    // Helpers
    //

    // Get current folder from navigation state
    function currentFolder() {
        return $scope.state.nav.currentFolder;
    }

    /*
     * Visitor to filter out objects without an address property, i.e. empty addresses
     */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;