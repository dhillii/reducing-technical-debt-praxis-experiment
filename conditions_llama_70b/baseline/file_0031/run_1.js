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
    created: 'started paid subscription',
    updated: 'changed paid subscription',
    canceled: 'canceled paid subscription',
    reactivated: 'reactivated paid subscription',
    expired: 'ended paid subscription',
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
  automatedEmailSent: (event) => {
    const slug = event.data.automatedEmail?.slug || '';
    const emailType = slug.includes('paid') ? 'Paid' : 'Free';
    return `received welcome email (${emailType})`;
  },
  emailDelivered: 'received email',
  emailFailed: 'bounced email',
  emailComplaint: 'email flagged as spam',
  comment: (event) => (event.data.parent ? 'replied to comment' : 'commented'),
  click: (event) => {
    if (event.data.count && event.data.count.clicks <= 1) {
      return 'clicked link in email';
    }
    return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
  },
  feedback: (event) => (event.data.score === 1 ? 'more like this' : 'less like this'),
  donation: 'Made a one-time payment',
  emailChange: (event) => {
    if (event.data.from_email && event.data.to_email) {
      return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
    }
    return 'Email address changed';
  },
};

export default class ParseMemberEventHelper extends Helper {
  @service feature;
  @service utils;
  @service membersUtils;

  trimString(value) {
    if (!value && value !== 0) {
      return null;
    }
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
    const eventType = event.type.replace('_event', '');
    if (eventType === 'newsletter') {
      return `event-${event.data.subscribed ? EVENT_TYPES.newsletter.subscribed : EVENT_TYPES.newsletter.unsubscribed}`;
    }
    if (eventType === 'subscription') {
      return `event-${EVENT_TYPES.subscription.created}`;
    }
    if (eventType === 'feedback') {
      return `event-${event.data.score === 1 ? EVENT_TYPES.feedback.like : EVENT_TYPES.feedback.dislike}`;
    }
    return `event-${EVENT_TYPES[eventType]}`;
  }

  getAction(event, hasMultipleNewsletters) {
    const eventType = event.type.replace('_event', '');
    if (eventType === 'newsletter') {
      return EVENT_ACTIONS.newsletter(event, hasMultipleNewsletters);
    }
    if (eventType === 'subscription') {
      return EVENT_ACTIONS.subscription(event);
    }
    if (eventType === 'click') {
      return EVENT_ACTIONS.click(event);
    }
    if (eventType === 'feedback') {
      return EVENT_ACTIONS.feedback(event);
    }
    if (eventType === 'emailChange') {
      return EVENT_ACTIONS.emailChange(event);
    }
    return EVENT_ACTIONS[eventType];
  }

  getJoin() {
    return '–';
  }

  getObject(event) {
    if (['signup', 'subscription', 'donation'].includes(event.type.replace('_event', ''))) {
      return event.data.attribution?.title;
    }
    if (['comment', 'click', 'feedback'].includes(event.type.replace('_event', ''))) {
      return event.data.post?.title;
    }
    return '';
  }

  getSource(event) {
    if (event.data.attribution?.referrer_source) {
      return {
        name: event.data.attribution.referrer_source,
        url: event.data.attribution.referrer_url ?? null,
      };
    }
    return null;
  }

  getInfo(event) {
    if (event.type === 'subscription_event') {
      const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
      if (mrrDelta === 0) {
        return;
      }
      const symbol = getSymbol(event.data.currency);
      if (event.data.type === 'created') {
        const sign = mrrDelta > 0 ? '' : '-';
        const tierName = this.membersUtils.hasMultipleTiers ? (event.data.tierName ?? 'Paid') : 'Paid';
        return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
      }
      const sign = mrrDelta > 0 ? '+' : '-';
      return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
    }
    if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
      return 'Free';
    }
    if (event.type === 'donation_event') {
      const symbol = getSymbol(event.data.currency);
      const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
      return formattedAmount;
    }
    return;
  }

  getDescription(event) {
    if (event.type === 'click_event') {
      try {
        return this.utils.cleanTrackedUrl(event.data.link.to, true);
      } catch (e) {
        return event.data.link.to;
      }
    }
    return;
  }

  getURL(event) {
    if (['comment', 'click', 'feedback'].includes(event.type.replace('_event', ''))) {
      return event.data.post?.url;
    }
    if (['signup', 'subscription', 'donation'].includes(event.type.replace('_event', ''))) {
      return event.data.attribution?.url;
    }
    return;
  }

  getRoute(event) {
    if (['click', 'feedback'].includes(event.type.replace('_event', ''))) {
      return {
        name: 'posts-x',
        model: event.data.post?.id,
      };
    }
    if (['signup', 'subscription'].includes(event.type.replace('_event', ''))) {
      if (event.data.attribution_type === 'post') {
        return {
          name: 'posts-x',
          model: event.data.attribution_id,
        };
      }
    }
    return;
  }
}