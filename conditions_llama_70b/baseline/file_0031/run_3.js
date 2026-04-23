import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import { getNonDecimal, getSymbol } from 'ghost-admin/utils/currency';
import { ghPluralize } from 'ghost-admin/helpers/gh-pluralize';
import { inject as service } from '@ember/service';

const eventIcons = {
  login_event: 'logged-in',
  payment_event: 'subscriptions',
  newsletter_event: (event) => (event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email'),
  subscription_event: (event) => (event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions'),
  signup_event: 'signed-up',
  email_opened_event: 'opened-email',
  email_sent_event: 'sent-email',
  automated_email_sent_event: 'sent-email',
  email_delivered_event: 'received-email',
  email_failed_event: 'email-delivery-failed',
  email_complaint_event: 'email-delivery-spam',
  comment_event: 'comment',
  click_event: 'click',
  aggregated_click_event: 'click',
  feedback_event: (event) => (event.data.score === 1 ? 'more-like-this' : 'less-like-this'),
  donation_event: 'subscriptions',
  email_change_event: 'email-changed',
};

const eventActions = {
  signup_event: 'signed up',
  login_event: 'logged in',
  payment_event: 'made payment',
  newsletter_event: (event, hasMultipleNewsletters) => {
    const newsletter = hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name ? event.data.newsletter.name : 'newsletter';
    return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
  },
  subscription_event: (event) => {
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
  email_opened_event: 'opened email',
  email_sent_event: 'sent email',
  automated_email_sent_event: (event) => {
    const slug = event.data.automatedEmail?.slug || '';
    const emailType = slug.includes('paid') ? 'Paid' : 'Free';
    return `received welcome email (${emailType})`;
  },
  email_delivered_event: 'received email',
  email_failed_event: 'bounced email',
  email_complaint_event: 'email flagged as spam',
  comment_event: (event) => (event.data.parent ? 'replied to comment' : 'commented'),
  click_event: 'clicked link in email',
  aggregated_click_event: (event) => (event.data.count.clicks <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`),
  feedback_event: (event) => (event.data.score === 1 ? 'more like this' : 'less like this'),
  email_change_event: (event) => {
    if (event.data.from_email && event.data.to_email) {
      return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
    }
    return 'Email address changed';
  },
  donation_event: 'Made a one-time payment',
};

const eventInfo = {
  subscription_event: (event) => {
    const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
    if (mrrDelta === 0) {
      return;
    }
    const symbol = getSymbol(event.data.currency);
    if (event.data.type === 'created') {
      const sign = mrrDelta > 0 ? '' : '-';
      const tierName = event.data.tierName ?? 'Paid';
      return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
    }
    const sign = mrrDelta > 0 ? '+' : '-';
    return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
  },
  signup_event: (event) => (event.data.paidMembersEnabled ? 'Free' : undefined),
  donation_event: (event) => {
    const symbol = getSymbol(event.data.currency);
    const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
    return formattedAmount;
  },
};

const eventDescription = {
  click_event: (event) => {
    try {
      return event.utils.cleanTrackedUrl(event.data.link.to, true);
    } catch (e) {
      return event.data.link.to;
    }
  },
};

const eventURL = {
  comment_event: (event) => event.data.post?.url,
  click_event: (event) => event.data.post?.url,
  feedback_event: (event) => event.data.post?.url,
  signup_event: (event) => event.data.attribution?.url,
  subscription_event: (event) => event.data.attribution?.url,
  donation_event: (event) => event.data.attribution?.url,
};

const eventRoute = {
  click_event: (event) => (event.data.post ? { name: 'posts-x', model: event.data.post.id } : undefined),
  feedback_event: (event) => (event.data.post ? { name: 'posts-x', model: event.data.post.id } : undefined),
  signup_event: (event) => (event.data.attribution_type === 'post' ? { name: 'posts-x', model: event.data.attribution_id } : undefined),
  subscription_event: (event) => (event.data.attribution_type === 'post' ? { name: 'posts-x', model: event.data.attribution_id } : undefined),
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
    const icon = `event-${eventIcons[event.type] || ''}`;
    const action = eventActions[event.type] ? eventActions[event.type](event, hasMultipleNewsletters) : '';
    const info = eventInfo[event.type] ? eventInfo[event.type](event) : undefined;
    const description = eventDescription[event.type] ? eventDescription[event.type](event) : undefined;
    const join = '–';
    const object = event.data.attribution?.title || event.data.post?.title || '';
    const url = eventURL[event.type] ? eventURL[event.type](event) : undefined;
    const route = eventRoute[event.type] ? eventRoute[event.type](event) : undefined;
    const timestamp = moment(event.data.created_at);
    const source = event.data.attribution?.referrer_source ? { name: event.data.attribution.referrer_source, url: event.data.attribution.referrer_url ?? null } : null;

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
}