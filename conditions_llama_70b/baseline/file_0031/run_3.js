```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import { getNonDecimal, getSymbol } from 'ghost-admin/utils/currency';
import { ghPluralize } from 'ghost-admin/helpers/gh-pluralize';
import { inject as service } from '@ember/service';

const EVENT_TYPES = {
  login: 'logged-in',
  payment: 'subscriptions',
  newsletter: {
    subscribed: 'subscribed-to-email',
    unsubscribed: 'unsubscribed-from-email',
  },
  subscription: {
    created: 'signed-up',
    updated: 'changed-paid-subscription',
    canceled: 'canceled-subscription',
    reactivated: 'reactivated-paid-subscription',
    expired: 'ended-paid-subscription',
  },
  signup: 'signed-up',
  emailOpened: 'opened-email',
  emailSent: 'sent-email',
  automatedEmailSent: 'sent-email',
  emailDelivered: 'received-email',
  emailFailed: 'email-delivery-failed',
  emailComplaint: 'email-delivery-spam',
  comment: 'comment',
  click: 'click',
  feedback: {
    like: 'more-like-this',
    dislike: 'less-like-this',
  },
  donation: 'subscriptions',
  emailChange: 'email-changed',
};

const EVENT_ACTIONS = {
  login: 'logged in',
  payment: 'made payment',
  newsletter: (event, hasMultipleNewsletters) => {
    const newsletter = hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name
      ? event.data.newsletter.name
      : 'newsletter';
    return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
  },
  subscription: (event) => {
    switch (event.data.type) {
      case 'created':
        return 'started paid subscription';
      case 'updated':
        return 'changed paid subscription';
      case 'canceled':
        return 'canceled paid subscription';
      case 'reactivated':
        return 'reactivated paid subscription';
      case 'expired':
        return 'ended paid subscription';
      default:
        return 'changed paid subscription';
    }
  },
  signup: 'signed up',
  emailOpened: 'opened email',
  emailSent: 'sent email',
  automatedEmailSent: (event) => `received welcome email (${event.data.automatedEmail?.slug.includes('paid') ? 'Paid' : 'Free'})`,
  emailDelivered: 'received email',
  emailFailed: 'bounced email',
  emailComplaint: 'email flagged as spam',
  comment: (event) => (event.data.parent ? 'replied to comment' : 'commented'),
  click: (event) => (event.data.count.clicks <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`),
  feedback: (event) => (event.data.score === 1 ? 'more like this' : 'less like this'),
  donation: 'Made a one-time payment',
  emailChange: (event) => (event.data.from_email && event.data.to_email ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}` : 'Email address changed'),
};

const EVENT_OBJECTS = {
  signup: (event) => event.data.attribution?.title,
  subscription: (event) => event.data.attribution?.title,
  donation: (event) => event.data.attribution?.title,
  comment: (event) => event.data.post?.title,
  click: (event) => event.data.post?.title,
  feedback: (event) => event.data.post?.title,
};

const EVENT_SOURCES = (event) => {
  if (event.data?.attribution?.referrer_source) {
    return {
      name: event.data.attribution.referrer_source,
      url: event.data.attribution.referrer_url ?? null,
    };
  }
  return null;
};

const EVENT_INFOS = {
  subscription: (event) => {
    const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
    if (mrrDelta === 0) return;
    const symbol = getSymbol(event.data.currency);
    if (event.data.type === 'created') {
      const sign = mrrDelta > 0 ? '' : '-';
      const tierName = event.data.tierName ?? 'Paid';
      return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
    }
    const sign = mrrDelta > 0 ? '+' : '-';
    return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
  },
  signup: (event) => (event.data.paidMembersEnabled ? 'Free' : null),
  donation: (event) => {
    const symbol = getSymbol(event.data.currency);
    const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
    return formattedAmount;
  },
};

const EVENT_DESCRIPTIONS = {
  click: (event) => {
    try {
      return event.utils.cleanTrackedUrl(event.data.link.to, true);
    } catch (e) {
      return event.data.link.to;
    }
  },
};

const EVENT_URLS = {
  comment: (event) => event.data.post?.url,
  click: (event) => event.data.post?.url,
  feedback: (event) => event.data.post?.url,
  signup: (event) => event.data.attribution?.url,
  subscription: (event) => event.data.attribution?.url,
  donation: (event) => event.data.attribution?.url,
};

const EVENT_ROUTES = {
  click: (event) => {
    if (event.data.post) {
      return {
        name: 'posts-x',
        model: event.data.post.id,
      };
    }
  },
  feedback: (event) => {
    if (event.data.post) {
      return {
        name: 'posts-x',
        model: event.data.post.id,
      };
    }
  },
  signup: (event) => {
    if (event.data.attribution_type === 'post') {
      return {
        name: 'posts-x',
        model: event.data.attribution_id,
      };
    }
  },
  subscription: (event) => {
    if (event.data.attribution_type === 'post') {
      return {
        name: 'posts-x',
        model: event.data.attribution_id,
      };
    }
  },
};

export default class ParseMemberEventHelper extends Helper {
  @service feature;
  @service utils;
  @service membersUtils;

  trimString(value) {
    if (!value && value !== 0) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
  }

  compute([event, hasMultipleNewsletters]) {
    const memberName = this.trimString(event.data.member?.name);
    const subject = event.data.member ? (memberName || event.data.member.email) : (event.data.name || event.data.email || '');
    const icon = this.getIcon(event);
    const action = this.getAction(event, hasMultipleNewsletters);
    const info = this.getInfo(event);
    const description = this.getDescription(event);
    const join = this.getJoin(event);
    const object = this.getObject(event);
    const url = this.getURL(event);
    const route = this.getRoute(event);
    const timestamp = moment(event.data.created_at);
    const source = this.getSource(event);

    const member = event.data.member ? { ...event.data.member, name: memberName } : event.data.member;

    return {
      memberId: event.data.member_id ?? event.data.member?.id,
      member,
      emailId: event.data.email_id,
      email: event.data.email,
      icon,
      subject,
      action,
      join,
      object,
      source,
      info,
      description,
      url,
      route,
      timestamp,
    };
  }

  getIcon(event) {
    const type = event.type.replace('_event', '');
    if (EVENT_TYPES[type]) {
      if (typeof EVENT_TYPES[type] === 'object') {
        return `event-${EVENT_TYPES[type][event.data.subscribed ? 'subscribed' : 'unsubscribed']}`;
      }
      return `event-${EVENT_TYPES[type]}`;
    }
    return 'event-unknown';
  }

  getAction(event, hasMultipleNewsletters) {
    const type = event.type.replace('_event', '');
    if (EVENT_ACTIONS[type]) {
      if (typeof EVENT_ACTIONS[type] === 'function') {
        return EVENT_ACTIONS[type](event, hasMultipleNewsletters);
      }
      return EVENT_ACTIONS[type];
    }
    return 'Unknown action';
  }

  getJoin() {
    return '–';
  }

  getObject(event) {
    const type = event.type.replace('_event', '');
    if (EVENT_OBJECTS[type]) {
      return EVENT_OBJECTS[type](event);
    }
    return '';
  }

  getSource(event) {
    return EVENT_SOURCES(event);
  }

  getInfo(event) {
    const type = event.type.replace('_event', '');
    if (EVENT_INFOS[type]) {
      return EVENT_INFOS[type](event);
    }
    return;
  }

  getDescription(event) {
    const type = event.type.replace('_event', '');
    if (EVENT_DESCRIPTIONS[type]) {
      return EVENT_DESCRIPTIONS[type](event);
    }
    return;
  }

  getURL(event) {
    const type = event.type.replace('_event', '');
    if (EVENT_URLS[type]) {
      return EVENT_URLS[type](event);
    }
    return;
  }

  getRoute(event) {
    const type = event.type.replace('_event', '');
    if (EVENT_ROUTES[type]) {
      return EVENT_ROUTES[type](event);
    }
    return;
  }
}
```