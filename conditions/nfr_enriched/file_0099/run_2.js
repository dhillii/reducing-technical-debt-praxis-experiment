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

        entry += '\n';
        return entry;
    }

    // Collects application logs and prepares bug report email
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

    // Extracts reply-to address from email headers
    function extractReplyToAddress(email) {
        return email.replyTo && email.replyTo[0] && email.replyTo[0].address || email.from[0].address;
    }

    // Populates recipient fields for reply operations
    function populateReplyRecipients(originalEmail, replyAll, replyToAddress) {
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

        if (replyAll) {
            populateReplyAllCc(originalEmail, replyToAddress);
        }
    }

    // Populates CC field for reply-all operations
    function populateReplyAllCc(originalEmail, replyToAddress) {
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

    // Populates attachments and references for forward operations
    function populateForwardAttachments(originalEmail) {
        // create a new array, otherwise removing an attachment will also
        // remove it from the original in the mail list as a side effect
        $scope.attachments = [].concat(originalEmail.attachments);
        if (originalEmail.id) {
            $scope.references = [originalEmail.id];
        }
    }

    // Formats subject line for reply or forward
    function formatSubjectLine(originalSubject, isForward) {
        if (isForward) {
            return 'Fwd: ' + originalSubject;
        } else {
            return originalSubject ? 'Re: ' + originalSubject.replace('Re: ', '') : '';
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

    // Builds quoted text body for reply or forward
    function buildQuotedBody(originalEmail, isForward, replyToAddress) {
        const from = originalEmail.from[0].name || replyToAddress;
        const sentDate = $filter('date')(originalEmail.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        let body = '';

        if (isForward) {
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

    // Populates composer fields based on reply/forward context
    function fillFields(re, replyAll, forward) {
        if (!re) {
            return;
        }

        $scope.writerTitle = (forward) ? 'Forward' : 'Reply';

        const replyToAddress = extractReplyToAddress(re);

        // fill recipient field and references
        if (!forward) {
            populateReplyRecipients(re, replyAll, replyToAddress);
        }

        // fill attachments and references on forward
        if (forward) {
            populateForwardAttachments(re);
        }

        // fill subject
        $scope.subject = formatSubjectLine(re.subject, forward);

        // fill text body
        $scope.body = buildQuotedBody(re, forward, replyToAddress);
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

    // Sets recipient display properties based on address validation
    function setRecipientDisplay(recipient) {
        if (recipient.address) {
            // display only email address after autocomplete
            recipient.displayId = recipient.address;
        } else {
            // set address after manual input
            recipient.address = recipient.displayId;
        }
    }

    // Validates email address format
    function isValidEmailAddress(address) {
        return util.validateEmailAddress(address);
    }

    // Fetches and sets public key for recipient
    function fetchAndSetRecipientKey(recipient) {
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
    }

    /**
     * Verify email address and fetch its public key
     */
    $scope.verify = function(recipient) {
        if (!recipient) {
            return;
        }

        setRecipientDisplay(recipient);

        // set display to insecure while fetching keys
        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();

        // verify email address
        if (!isValidEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        // check if to address is contained in known public keys
        // when we write an email, we always need to work with the latest keys available
        return fetchAndSetRecipientKey(recipient);
    };

    // Validates recipient address and counts receivers
    function validateAndCountRecipient(recipient) {
        // validate address
        if (!util.validateEmailAddress(recipient.address)) {
            return dialog.info({
                title: 'Warning',
                message: 'Invalid recipient address!'
            });
        }
        return true;
    }

    // Determines if all recipients have secure keys
    function areAllRecipientsSecure(allSecure) {
        // bcc automatically disables secure sending
        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            return false;
        }
        return allSecure;
    }

    // Sets send button state based on security level
    function setSendButtonState(isSecure) {
        if (isSecure) {
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

        let allSecure = true;
        let numReceivers = 0;

        // count number of receivers and check security
        const checkRecipient = function(recipient) {
            if (!validateAndCountRecipient(recipient)) {
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

        // only allow sending if receviers exist
        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        const isSecure = areAllRecipientsSecure(allSecure);
        setSendButtonState(isSecure);
    };

    //
    // Editing attachments
    //

    $scope.remove = function(attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    // Collects addresses of recipients without public keys
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

    // Sends invitation mail and tracks invitation state
    function sendInvitationMail(recipientAddress, sender) {
        const invitationMail = invitation.createMail({
            sender: sender,
            recipient: recipientAddress
        });
        // send invitation mail
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

        $scope.showInvite = false;

        // get recipients with no keys
        const invitees = collectInvitees();

        return $q(function(resolve) {
            resolve();

        }).then(function() {
            invitees.forEach(function(recipientAddress) {
                // send invitation mail
                const promise = sendInvitationMail(recipientAddress, sender);
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

    // Builds message object from composer fields
    function buildMessage() {
        const message = {
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
            message.headers.references = $scope.references.map(function(reference) {
                return '<' + reference + '>';
            }).join(' ');
        }

        return message;
    }

    // Marks original email as answered if replying
    function markOriginalAsAnswered() {
        // if we need to synchronize replyTo.answered = true to imap,
        // let's do that. otherwise, we're done
        if (!$scope.replyTo || $scope.replyTo.answered) {
            return;
        }

        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: currentFolder(),
            message: $scope.replyTo
        });
    }

    $scope.sendToOutbox = function() {
        // build email model for smtp-client
        const message = buildMessage();

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

    // Populates address book cache from keychain
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

    // Filters address book cache by query string
    function filterAddressBook(query) {
        return $scope.addressBookCache.filter(function(i) {
            return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
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

    // Returns the currently selected folder from navigation state
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