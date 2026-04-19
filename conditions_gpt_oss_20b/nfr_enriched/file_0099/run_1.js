'use strict';

const util = require('crypto-lib').util;

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

  $scope.keyId = 'XXXXXXXX';

  // --------------------------------------------------------------------
  // Writer state
  // --------------------------------------------------------------------
  $scope.state.writer = {
    write: function (replyTo, replyAll, forward) {
      $scope.state.lightbox = 'write';
      $scope.replyTo = replyTo;
      resetFields();
      fillFields(replyTo, replyAll, forward);
      $scope.verify($scope.to[0]);
    },
    reportBug: function () {
      $scope.state.lightbox = 'write';
      resetFields();
      reportBug();
      $scope.verify($scope.to[0]);
    },
    close: function () {
      $scope.state.lightbox = undefined;
    },
  };

  // --------------------------------------------------------------------
  // Field reset
  // --------------------------------------------------------------------
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

  // --------------------------------------------------------------------
  // Bug report
  // --------------------------------------------------------------------
  function reportBug() {
    let dump = '';
    const appender = {
      log(level, date, component, log) {
        if (level === axe.DEBUG) {
          dump += '[DEBUG]';
        } else if (level === axe.INFO) {
          dump += '[INFO]';
        } else if (level === axe.WARN) {
          dump += '[WARN]';
        } else if (level === axe.ERROR) {
          dump += '[ERROR]';
        }
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
    };
    axe.dump(appender);

    $scope.to = [{ address: str.supportAddress }];
    $scope.writerTitle = str.bugReportTitle;
    $scope.subject = str.bugReportSubject;
    $scope.body =
      str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + dump;
  }

  // --------------------------------------------------------------------
  // Fill fields for reply/forward
  // --------------------------------------------------------------------
  function fillFields(re, replyAll, forward) {
    if (!re) return;
    setTitle(re, forward);
    const replyTo = getReplyTo(re);
    setRecipients(re, replyTo, forward);
    setReferences(re, forward);
    setAttachments(re, forward);
    setSubject(re, forward);
    setBody(re, replyTo, forward);
  }

  function setTitle(re, forward) {
    $scope.writerTitle = forward ? 'Forward' : 'Reply';
  }

  function getReplyTo(re) {
    return (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;
  }

  function setRecipients(re, replyTo, forward) {
    if (!forward) {
      $scope.to.unshift({ address: replyTo });
      $scope.to.forEach($scope.verify);
      $scope.references = re.references || [];
      if (re.id && $scope.references.indexOf(re.id) < 0) {
        $scope.references = $scope.references.concat(re.id);
      }
      if (re.id) {
        $scope.inReplyTo = re.id;
      }
    }
    if (replyAll) {
      re.to.concat(re.cc).forEach((recipient) => {
        const me = auth.emailAddress;
        if (recipient.address === me && replyTo !== me) {
          return;
        }
        $scope.cc.unshift({ address: recipient.address });
      });
      $scope.cc = _.uniq($scope.cc, (r) => r.address);
      $scope.showCC = true;
      $scope.cc.forEach($scope.verify);
    }
  }

  function setReferences(re, forward) {
    if (forward) {
      $scope.references = [re.id];
    }
  }

  function setAttachments(re, forward) {
    if (forward) {
      $scope.attachments = [].concat(re.attachments);
    }
  }

  function setSubject(re, forward) {
    if (forward) {
      $scope.subject = 'Fwd: ' + re.subject;
    } else {
      $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
    }
  }

  function setBody(re, replyTo, forward) {
    const from = re.from[0].name || replyTo;
    const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');
    const createString = (array) =>
      array.reduce((str, to) => {
        const part = (to.name ? to.name : to.address) + ' <' + to.address + '>';
        return str ? str + ', ' + part : part;
      }, '');
    let body = '';
    if (forward) {
      body =
        '\n\n' +
        '---------- Forwarded message ----------\n' +
        'From: ' +
        re.from[0].name +
        ' <' +
        re.from[0].address +
        '>\n' +
        'Date: ' +
        sentDate +
        '\n' +
        'Subject: ' +
        re.subject +
        '\n' +
        'To: ' +
        createString(re.to) +
        '\n' +
        (re.cc && re.cc.length > 0 ? 'Cc: ' + createString(re.cc) + '\n' : '') +
        '\n\n';
    } else {
      body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
    }
    if (re.body) {
      body +=
        re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>') + '';
      $scope.body = body;
    }
  }

  // --------------------------------------------------------------------
  // Header editing
  // --------------------------------------------------------------------
  $scope.toggleShowBCC = function () {
    $scope.showBCC = true;
    return dialog.info({
      title: 'Warning',
      message: 'Cannot send encrypted messages with BCC!',
    });
  };

  // --------------------------------------------------------------------
  // Verify recipient
  // --------------------------------------------------------------------
  $scope.verify = function (recipient) {
    if (!recipient) return;
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

    $q
      .resolve()
      .then(() => keychain.refreshKeyForUserId({ userId: recipient.address }))
      .then((key) => {
        if (key) {
          const userIds = pgp.getKeyParams(key.publicKey).userIds;
          const matchingUserId = _.findWhere(userIds, { emailAddress: recipient.address });
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
  };

  // --------------------------------------------------------------------
  // Send status
  // --------------------------------------------------------------------
  $scope.checkSendStatus = function () {
    $scope.okToSend = false;
    $scope.sendBtnText = undefined;
    $scope.sendBtnSecure = undefined;
    let allSecure = true;
    let numReceivers = 0;
    const recipients = [...$scope.to, ...$scope.cc, ...$scope.bcc];
    recipients.forEach((recipient) => {
      if (!util.validateEmailAddress(recipient.address)) {
        dialog.info({
          title: 'Warning',
          message: 'Invalid recipient address!',
        });
        return;
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
  };

  // --------------------------------------------------------------------
  // Attachment removal
  // --------------------------------------------------------------------
  $scope.remove = function (attachment) {
    const index = $scope.attachments.indexOf(attachment);
    if (index !== -1) {
      $scope.attachments.splice(index, 1);
    }
  };

  // --------------------------------------------------------------------
  // Invite users without keys
  // --------------------------------------------------------------------
  $scope.invite = function () {
    const sender = auth.emailAddress;
    const sendJobs = [];
    const invitees = [];
    $scope.showInvite = false;
    const recipients = [...$scope.to, ...$scope.cc, ...$scope.bcc];
    recipients.forEach((recipient) => {
      if (
        util.validateEmailAddress(recipient.address) &&
        !recipient.secure &&
        $scope.invited.indexOf(recipient.address) === -1
      ) {
        invitees.push(recipient.address);
      }
    });

    $q
      .resolve()
      .then(() => {
        invitees.forEach((recipientAddress) => {
          const invitationMail = invitation.createMail({
            sender,
            recipient: recipientAddress,
          });
          const promise = outbox
            .put(invitationMail)
            .then(() => invitation.invite({ recipient: recipientAddress, sender }));
          sendJobs.push(promise);
          $scope.invited.push(recipientAddress);
        });
        return Promise.all(sendJobs);
      })
      .catch((err) => {
        $scope.showInvite = true;
        return dialog.error(err);
      });
  };

  // --------------------------------------------------------------------
  // Send to outbox
  // --------------------------------------------------------------------
  $scope.sendToOutbox = function () {
    const message = buildMessage();
    $scope.state.writer.close();
    if ($scope.replyTo) {
      status.setReading(false);
    }

    $q
      .resolve()
      .then(() => outbox.put(message))
      .then(() => {
        if (!$scope.replyTo || $scope.replyTo.answered) {
          return;
        }
        $scope.replyTo.answered = true;
        return email.setFlags({
          folder: currentFolder(),
          message: $scope.replyTo,
        });
      })
      .catch((err) => {
        if (err.code !== 42) {
          dialog.error(err);
        }
      });
  };

  function buildMessage() {
    const message = {
      from: [{ name: auth.realname, address: auth.emailAddress }],
      to: $scope.to.filter(filterEmptyAddresses),
      cc: $scope.cc.filter(filterEmptyAddresses),
      bcc: $scope.bcc.filter(filterEmptyAddresses),
      subject: $scope.subject.trim() ? $scope.subject.trim() : str.fallbackSubject,
      body: $scope.body.trim(),
      attachments: $scope.attachments,
      sentDate: new Date(),
      headers: {},
    };
    if ($scope.inReplyTo) {
      message.headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
    }
    if ($scope.references && $scope.references.length) {
      message.headers.references = $scope.references
        .map((reference) => '<' + reference + '>')
        .join(' ');
    }
    return message;
  }

  // --------------------------------------------------------------------
  // Tag style
  // --------------------------------------------------------------------
  $scope.tagStyle = function (recipient) {
    const classes = ['label'];
    if (recipient.secure === false) {
      classes.push('label--invalid');
    }
    return classes;
  };

  // --------------------------------------------------------------------
  // Address book lookup
  // --------------------------------------------------------------------
  $scope.lookupAddressBook = function (query) {
    return $q
      .resolve()
      .then(() => {
        if ($scope.addressBookCache) {
          return;
        }
        return keychain.listLocalPublicKeys().then((keys) => {
          $scope.addressBookCache = keys.map((key) => {
            const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
            return { address: key.userId, displayId: name + ' - ' + key.userId };
          });
        });
      })
      .then(() => {
        return $scope.addressBookCache.filter((i) =>
          i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1
        );
      })
      .catch(dialog.error);
  };

  // --------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------
  function currentFolder() {
    return $scope.state.nav.currentFolder;
  }

  function filterEmptyAddresses(addr) {
    return !!addr.address;
  }
};

module.exports = WriteCtrl;