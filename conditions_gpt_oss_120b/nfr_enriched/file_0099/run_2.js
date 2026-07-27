'use strict';

const util = require('crypto-lib').util;

//
// Controller
//
const WriteCtrl = function (
    $scope,
    $window,
    $filter,
    $q,
    appConfig,
    auth,
    keychain,
    pgp,
    email,
    outbox,
    dialog,
    axe,
    status,
    invitation
) {
    const str = appConfig.string;
    const cfg = appConfig.config;

    // set default value so that the popover height is correct on init
    $scope.keyId = 'XXXXXXXX';

    //
    // Init
    //
    $scope.state.writer = {
        write: (replyTo, replyAll, forward) => {
            $scope.state.lightbox = 'write';
            $scope.replyTo = replyTo;
            resetFields();
            fillFields(replyTo, replyAll, forward);
            $scope.verify($scope.to[0]);
        },
        reportBug: () => {
            $scope.state.lightbox = 'write';
            resetFields();
            prepareBugReport();
            $scope.verify($scope.to[0]);
        },
        close: () => {
            $scope.state.lightbox = undefined;
        }
    };

    const resetFields = () => {
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
    };

    const prepareBugReport = () => {
        const dump = collectAxeDump();
        $scope.to = [{ address: str.supportAddress }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body =
            str.bugReportBody
                .replace('{0}', navigator.userAgent)
                .replace('{1}', cfg.appVersion) + dump;
    };

    const collectAxeDump = () => {
        let dump = '';
        const appender = {
            log: (level, date, component, log) => {
                const levelTag = {
                    [axe.DEBUG]: '[DEBUG]',
                    [axe.INFO]: '[INFO]',
                    [axe.WARN]: '[WARN]',
                    [axe.ERROR]: '[ERROR]'
                }[level] || '';
                dump += levelTag;
                dump += '[' + date.toISOString() + ']';
                if (component) {
                    dump += '[' + component + ']';
                }
                dump += ' ' + (log || '').toString();
                if (log && log.stack) {
                    dump += ' . Stack: ' + log.stack;
                }
                dump += '\n';
            }
        };
        axe.dump(appender);
        return dump;
    };

    const fillFields = (re, replyAll, forward) => {
        if (!re) {
            return;
        }
        setWriterTitle(forward);
        const replyTo = resolveReplyTo(re);
        if (!forward) {
            addPrimaryRecipient(replyTo);
            setReferencesAndInReplyTo(re);
        }
        if (replyAll) {
            addAllRecipients(re, replyTo);
        }
        if (forward) {
            copyAttachments(re);
            setForwardReferences(re);
        }
        setSubject(re, forward);
        setBody(re, forward, replyTo);
    };

    const setWriterTitle = (forward) => {
        $scope.writerTitle = forward ? 'Forward' : 'Reply';
    };

    const resolveReplyTo = (re) => {
        return (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;
    };

    const addPrimaryRecipient = (address) => {
        $scope.to.unshift({ address });
        $scope.to.forEach($scope.verify);
    };

    const setReferencesAndInReplyTo = (re) => {
        $scope.references = (re.references || []).slice();
        if (re.id && $scope.references.indexOf(re.id) < 0) {
            $scope.references = $scope.references.concat(re.id);
        }
        if (re.id) {
            $scope.inReplyTo = re.id;
        }
    };

    const addAllRecipients = (re, originalReplyTo) => {
        const me = auth.emailAddress;
        const all = re.to.concat(re.cc);
        all.forEach((recipient) => {
            if (recipient.address === me && originalReplyTo !== me) {
                return;
            }
            $scope.cc.unshift({ address: recipient.address });
        });
        $scope.cc = _.uniq($scope.cc, (r) => r.address);
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    };

    const copyAttachments = (re) => {
        $scope.attachments = (re.attachments || []).slice();
    };

    const setForwardReferences = (re) => {
        if (re.id) {
            $scope.references = [re.id];
        }
    };

    const setSubject = (re, forward) => {
        if (forward) {
            $scope.subject = 'Fwd: ' + re.subject;
        } else {
            $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
        }
    };

    const setBody = (re, forward, replyTo) => {
        const fromName = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const formatAddressList = (list) => {
            return list
                .map((item) => `${item.name || item.address} <${item.address}>`)
                .join(', ');
        };

        let body = '';
        if (forward) {
            body += '\n\n---------- Forwarded message ----------\n';
            body += `From: ${re.from[0].name} <${re.from[0].address}>\n`;
            body += `Date: ${sentDate}\n`;
            body += `Subject: ${re.subject}\n`;
            body += `To: ${formatAddressList(re.to)}\n`;
            if (re.cc && re.cc.length) {
                body += `Cc: ${formatAddressList(re.cc)}\n`;
            }
            body += '\n\n';
        } else {
            body += `\n\n${sentDate} ${fromName} wrote:\n> `;
        }

        if (re.body) {
            const quoted = re.body
                .trim()
                .split('\n')
                .join('\n> ')
                .replace(/ >/g, '>');
            body += quoted;
        }
        $scope.body = body;
    };

    //
    // Editing headers
    //

    /**
     * Warn users when using BCC
     */
    $scope.toggleShowBCC = () => {
        $scope.showBCC = true;
        return dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    };

    /**
     * Verify email address and fetch its public key
     */
    $scope.verify = (recipient) => {
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
            .then(() => keychain.refreshKeyForUserId({ userId: recipient.address }))
            .then((key) => handleKeyResult(recipient, key))
            .catch(dialog.error);
    };

    const normalizeRecipient = (recipient) => {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    };

    const handleKeyResult = (recipient, key) => {
        if (key) {
            const userIds = pgp.getKeyParams(key.publicKey).userIds;
            const matching = _.findWhere(userIds, { emailAddress: recipient.address });
            if (matching) {
                recipient.key = key;
                recipient.secure = true;
            }
        } else {
            $scope.showInvite = true;
        }
        $scope.checkSendStatus();
    };

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = () => {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        const { allSecure, numReceivers } = evaluateRecipients();

        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            // BCC disables secure sending
            $scope.okToSend = true;
            $scope.sendBtnText = str.sendBtnClear;
            $scope.sendBtnSecure = false;
            return;
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
    };

    const evaluateRecipients = () => {
        let allSecure = true;
        let numReceivers = 0;

        const check = (recipient) => {
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

        $scope.to.forEach(check);
        $scope.cc.forEach(check);
        $scope.bcc.forEach(check);

        return { allSecure, numReceivers };
    };

    //
    // Editing attachments
    //

    $scope.remove = (attachment) => {
        const idx = $scope.attachments.indexOf(attachment);
        if (idx > -1) {
            $scope.attachments.splice(idx, 1);
        }
    };

    /**
     * Invite all users without a public key
     */
    $scope.invite = () => {
        const sender = auth.emailAddress;
        const invitees = collectInvitees();

        $scope.showInvite = false;

        return $q.resolve()
            .then(() => sendInvitations(sender, invitees))
            .catch((err) => {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    };

    const collectInvitees = () => {
        const invitees = [];

        const check = (recipient) => {
            if (
                util.validateEmailAddress(recipient.address) &&
                !recipient.secure &&
                $scope.invited.indexOf(recipient.address) === -1
            ) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(check);
        $scope.cc.forEach(check);
        $scope.bcc.forEach(check);

        return invitees;
    };

    const sendInvitations = (sender, invitees) => {
        const sendJobs = [];

        invitees.forEach((addr) => {
            const invitationMail = invitation.createMail({
                sender,
                recipient: addr
            });
            const job = outbox
                .put(invitationMail)
                .then(() => invitation.invite({ recipient: addr, sender }));
            sendJobs.push(job);
            $scope.invited.push(addr);
        });

        return Promise.all(sendJobs);
    };

    //
    // Editing email body
    //

    $scope.sendToOutbox = () => {
        const message = buildMessage();

        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q.resolve()
            .then(() => outbox.put(message))
            .then(() => syncReplyFlag())
            .catch((err) => {
                if (err.code !== 42) {
                    dialog.error(err);
                }
            });
    };

    const buildMessage = () => {
        const msg = {
            from: [{ name: auth.realname, address: auth.emailAddress }],
            to: $scope.to.filter(filterEmptyAddresses),
            cc: $scope.cc.filter(filterEmptyAddresses),
            bcc: $scope.bcc.filter(filterEmptyAddresses),
            subject:
                $scope.subject.trim() || str.fallbackSubject,
            body: $scope.body.trim(),
            attachments: $scope.attachments,
            sentDate: new Date(),
            headers: {}
        };

        if ($scope.inReplyTo) {
            msg.headers['in-reply-to'] = `<${$scope.inReplyTo}>`;
        }

        if ($scope.references && $scope.references.length) {
            msg.headers.references = $scope.references
                .map((ref) => `<${ref}>`)
                .join(' ');
        }

        return msg;
    };

    const syncReplyFlag = () => {
        if (!$scope.replyTo || $scope.replyTo.answered) {
            return;
        }
        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: currentFolder(),
            message: $scope.replyTo
        });
    };

    //
    // Tag input & Autocomplete
    //

    $scope.tagStyle = (recipient) => {
        const classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    $scope.lookupAddressBook = (query) => {
        return $q.resolve()
            .then(() => ensureAddressBookCache())
            .then(() => filterAddressBook(query))
            .catch(dialog.error);
    };

    const ensureAddressBookCache = () => {
        if ($scope.addressBookCache) {
            return;
        }
        return keychain.listLocalPublicKeys().then((keys) => {
            $scope.addressBookCache = keys.map((key) => {
                const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                return {
                    address: key.userId,
                    displayId: `${name} - ${key.userId}`
                };
            });
        });
    };

    const filterAddressBook = (query) => {
        const lower = query.toLowerCase();
        return $scope.addressBookCache.filter((item) =>
            item.displayId.toLowerCase().includes(lower)
        );
    };

    //
    // Helpers
    //

    const currentFolder = () => $scope.state.nav.currentFolder;

    /*
     * Visitor to filter out objects without an address property, i.e. empty addresses
     */
    const filterEmptyAddresses = (addr) => !!addr.address;
};

module.exports = WriteCtrl;