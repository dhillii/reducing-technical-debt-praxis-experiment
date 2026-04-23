import Ember from 'ember';
import Model, {attr, belongsTo, hasMany} from '@ember-data/model';
import ValidationEngine from 'ghost-admin/mixins/validation-engine';
import boundOneWay from 'ghost-admin/utils/bound-one-way';
import moment from 'moment-timezone';
import {compare, isBlank} from '@ember/utils';
import {computed, observer} from '@ember/object';
import {equal, filterBy, reads} from '@ember/object/computed';
import {inject} from 'ghost-admin/decorators/inject';
import {on} from '@ember/object/evented';
import {inject as service} from '@ember/service';

const BLANK_LEXICAL = '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';
const {Comparable} = Ember;

/* Helper: compare post statuses with scheduled priority */
function compareStatus(postA, postB) {
    const statusA = postA.get('status');
    const statusB = postB.get('status');

    if (!statusA && !statusB) return 0;
    if (!statusA) return -1;
    if (!statusB) return 1;

    if (statusA === 'scheduled' && (statusB === 'draft' || statusB === 'published')) return -1;
    if (statusB === 'scheduled' && (statusA === 'draft' || statusA === 'published')) return 1;

    return compare(statusA, statusB);
}

/* Helper: compare published dates */
function comparePublishedAt(postA, postB) {
    const pubA = postA.get('publishedAtUTC');
    const pubB = postB.get('publishedAtUTC');

    if (!pubA && !pubB) return 0;
    if (!pubA) return -1;
    if (!pubB) return 1;

    return compare(pubA, pubB);
}

/* Helper: determine if a post is new or missing updated timestamp */
function isNewOrMissingUpdated(post) {
    return post.get('isNew') || !post.get('updatedAtUTC');
}

/* Helper: compute click rate safely */
function computeClickRate(email, count) {
    if (!email?.emailCount || !count?.clicks) return 0;
    return Math.round((count.clicks / email.emailCount) * 100);
}

/* Helper: build visibility segment string */
function buildVisibilitySegment(post) {
    if (post.isPublic) {
        return post.settings.defaultContentVisibility === 'paid' ? 'status:-free' : 'status:free,status:-free';
    }

    switch (post.visibility) {
        case 'members':
            return 'status:free,status:-free';
        case 'paid':
            return 'status:-free';
        case 'tiers':
            if (post.tiers) {
                return post.tiers.map(t => `tier:${t.slug}`).join(',');
            }
            // fallthrough
        default:
            return post.visibility;
    }
}

/* Helper: combine newsletter and email segment filters */
function combineRecipientFilters(post) {
    if (!post.newsletter) return post.emailSegment;
    return `${post.newsletter.recipientFilter}+(${post.emailSegment})`;
}

/* Helper: evaluate past scheduled time */
function evaluatePastScheduled(publishedAtUTC) {
    const now = moment.utc();
    const target = publishedAtUTC || now;
    return target.diff(now, 'hours', true) < 0;
}

/* Helper: determine if analytics should be shown */
function shouldShowAttribution(post) {
    const isPageOrEmail = post.isPage || !post.emailOnly;
    return isPageOrEmail &&
        post.isPublished &&
        post.settings.membersTrackSources &&
        !post.membersUtils.isMembersInviteOnly &&
        !post.session.user.isContributor;
}

/* Helper: determine if email analytics should be shown */
function shouldShowEmailAnalytics(post, type) {
    const hasEmail = post.hasBeenEmailed;
    const isContributor = post.session.user.isContributor;
    const membersAccess = post.settings.membersSignupAccess !== 'none';
    const trackEnabled = type === 'open' ? post.settings.emailTrackOpens : post.settings.emailTrackClicks;
    const emailTrack = type === 'open' ? post.email?.trackOpens : post.email?.trackClicks;

    return hasEmail &&
        !isContributor &&
        membersAccess &&
        emailTrack &&
        trackEnabled;
}

/* Helper: determine if any analytics page should be shown */
function shouldShowAnalyticsPage(post) {
    return post.isPost &&
        post.session.user.isAdmin &&
        (post.showEmailOpenAnalytics || post.showEmailClickAnalytics || post.showAttributionAnalytics);
}

/* Helper: compute preview URL */
function computePreviewUrl(post) {
    if (!post.uuid) return '';
    const previewKeyword = 'p';
    return post.get('ghostPaths.url').join(post.config.blogUrl, previewKeyword, post.uuid);
}

/* Helper: determine public visibility */
function isPublicVisibility(visibility) {
    return visibility === 'public';
}

/* Helper: determine if post has email */
function hasEmail(email, emailOnly) {
    return email !== null || emailOnly;
}

/* Helper: determine if post will email */
function willEmail(isScheduled, newsletter, email) {
    return isScheduled && !!newsletter && !email;
}

/* Helper: determine if post has been emailed */
function hasBeenEmailed(isPost, isSent, isPublished, email) {
    return isPost && (isSent || isPublished) && email && email.status !== 'failed';
}

/* Helper: determine if email failed */
function didEmailFail(isPost, isSent, isPublished, email) {
    return isPost && (isSent || isPublished) && email && email.status === 'failed';
}

/* Helper: determine if audience feedback should be shown */
function showAudienceFeedback(feature, sentiment) {
    return feature.get('audienceFeedback') && sentiment !== undefined;
}

/* Helper: update tags by removing client-generated ones */
function cleanTags(tags) {
    const unsaved = tags.filterBy('id', null);
    tags.removeObjects(unsaved);
    unsaved.invoke('deleteRecord');
}

/* Helper: check if a user authored the post */
function authoredByUser(authors, user) {
    return authors.includes(user);
}

/* Helper: sort posts according to server logic */
function sortPosts(postA, postB) {
    if (isNewOrMissingUpdated(postA)) return -1;
    if (isNewOrMissingUpdated(postB)) return 1;

    const idResult = compare(postA.get('id'), postB.get('id'));
    const statusResult = compareStatus(postA, postB);
    const updatedResult = compare(postA.get('updatedAtUTC'), postB.get('updatedAtUTC'));
    const publishedResult = comparePublishedAt(postA, postB);

    if (statusResult !== 0) return statusResult;
    if (publishedResult !== 0) return -publishedResult;
    if (updatedResult !== 0) return -updatedResult;
    return -idResult;
}

export default Model.extend(Comparable, ValidationEngine, {
    session: service(),
    feature: service(),
    ghostPaths: service(),
    clock: service(),
    search: service(),
    settings: service(),
    membersUtils: service(),

    config: inject(),

    displayName: 'post',
    validationType: 'post',

    count: attr(),
    sentiment: attr(),
    createdAtUTC: attr('moment-utc'),
    excerpt: attr('string'),
    customExcerpt: attr('string'),
    featured: attr('boolean', {defaultValue: false}),
    canonicalUrl: attr('string'),
    codeinjectionFoot: attr('string', {defaultValue: ''}),
    codeinjectionHead: attr('string', {defaultValue: ''}),
    customTemplate: attr('string'),
    ogImage: attr('string'),
    ogTitle: attr('string'),
    ogDescription: attr('string'),
    twitterImage: attr('string'),
    twitterTitle: attr('string'),
    twitterDescription: attr('string'),
    emailSubject: attr('string'),
    html: attr('string'),
    visibility: attr('string'),
    metaDescription: attr('string'),
    metaTitle: attr('string'),
    mobiledoc: attr('json-string'),
    lexical: attr('string', {defaultValue: () => BLANK_LEXICAL}),
    plaintext: attr('string'),
    publishedAtUTC: attr('moment-utc'),
    slug: attr('string'),
    status: attr('string', {defaultValue: 'draft'}),
    title: attr('string', {defaultValue: ''}),
    updatedAtUTC: attr('moment-utc'),
    url: attr('string'),
    uuid: attr('string'),
    emailSegment: attr('members-segment-string', {defaultValue: null}),
    emailOnly: attr('boolean', {defaultValue: false}),

    featureImage: attr('string'),
    featureImageAlt: attr('string'),
    featureImageCaption: attr('string'),
    showTitleAndFeatureImage: attr('boolean', {defaultValue: true}),

    authors: hasMany('user', {embedded: 'always', async: false}),
    email: belongsTo('email', {async: false}),
    newsletter: belongsTo('newsletter', {embedded: 'always', async: false}),
    publishedBy: belongsTo('user', {async: true}),
    tags: hasMany('tag', {embedded: 'always', async: false}),
    postRevisions: hasMany('post_revisions', {embedded: 'always', async: false}),

    primaryAuthor: reads('authors.firstObject'),
    primaryTag: reads('tags.firstObject'),

    scratch: null,
    lexicalScratch: null,
    titleScratch: null,
    secondaryLexicalState: null,

    publishedAtBlogDate: '',
    publishedAtBlogTime: '',

    canonicalUrlScratch: boundOneWay('canonicalUrl'),
    customExcerptScratch: boundOneWay('customExcerpt'),
    codeinjectionFootScratch: boundOneWay('codeinjectionFoot'),
    codeinjectionHeadScratch: boundOneWay('codeinjectionHead'),
    metaDescriptionScratch: boundOneWay('metaDescription'),
    metaTitleScratch: boundOneWay('metaTitle'),
    ogDescriptionScratch: boundOneWay('ogDescription'),
    ogTitleScratch: boundOneWay('ogTitle'),
    twitterDescriptionScratch: boundOneWay('twitterDescription'),
    twitterTitleScratch: boundOneWay('twitterTitle'),
    tiers: attr('member-tier'),
    emailSubjectScratch: boundOneWay('emailSubject'),

    isPublished: equal('status', 'published'),
    isDraft: equal('status', 'draft'),
    internalTags: filterBy('tags', 'isInternal', true),
    isScheduled: equal('status', 'scheduled'),
    isSent: equal('status', 'sent'),

    isPost: equal('displayName', 'post'),
    isPage: equal('displayName', 'page'),

    hasEmail: computed('email', 'emailOnly', function () {
        return hasEmail(this.email, this.emailOnly);
    }),

    willEmail: computed('isScheduled', 'newsletter', 'email', function () {
        return willEmail(this.isScheduled, this.newsletter, this.email);
    }),

    hasBeenEmailed: computed('isPost', 'isSent', 'isPublished', 'email', function () {
        return hasBeenEmailed(this.isPost, this.isSent, this.isPublished, this.email);
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return didEmailFail(this.isPost, this.isSent, this.isPublished, this.email);
    }),

    showAudienceFeedback: computed('sentiment', function () {
        return showAudienceFeedback(this.feature, this.sentiment);
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return shouldShowEmailAnalytics(this, 'open');
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return shouldShowEmailAnalytics(this, 'click');
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return shouldShowAttribution(this);
    }),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', function () {
        return shouldShowAnalyticsPage(this);
    }),

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        return computePreviewUrl(this);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return isPublicVisibility(this.visibility);
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return buildVisibilitySegment(this);
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        return combineRecipientFilters(this);
    }),

    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        if (!this.isScheduled) return false;
        const result = evaluatePastScheduled(this.publishedAtUTC);
        // force recompute
        this.get('clock.second');
        return result;
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return this._getPublishedAtBlogTZ();
        },
        set(key, value) {
            const momentValue = value ? moment(value) : null;
            this._setPublishedAtBlogStrings(momentValue);
            return this._getPublishedAtBlogTZ();
        }
    }),

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        return computeClickRate(this.email, this.count);
    }),

    _getPublishedAtBlogTZ() {
        const {publishedAtUTC, publishedAtBlogDate, publishedAtBlogTime, settings: {timezone}} = this;

        if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
            return null;
        }

        if (publishedAtBlogDate && publishedAtBlogTime) {
            const blogMoment = moment.tz(`${publishedAtBlogDate} ${publishedAtBlogTime}`, timezone);
            if (publishedAtUTC && blogMoment.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
                return publishedAtUTC;
            }
            return blogMoment;
        }

        return moment.tz(publishedAtUTC, timezone);
    },

    // eslint-disable-next-line ghost/ember/no-observers
    _setPublishedAtBlogTZ: on('init', observer('publishedAtUTC', 'settings.timezone', function () {
        this._setPublishedAtBlogStrings(this.publishedAtUTC);
    })),

    _setPublishedAtBlogStrings(momentDate) {
        if (momentDate) {
            const blogTimezone = this.settings.timezone;
            const blogMoment = moment.tz(momentDate, blogTimezone);
            this.set('publishedAtBlogDate', blogMoment.format('YYYY-MM-DD'));
            this.set('publishedAtBlogTime', blogMoment.format('HH:mm'));
        } else {
            this.set('publishedAtBlogDate', '');
            this.set('publishedAtBlogTime', '');
        }
    },

    updateTags() {
        cleanTags(this.tags);
    },

    isAuthoredByUser(user) {
        return authoredByUser(this.authors, user);
    },

    compare(postA, postB) {
        return sortPosts(postA, postB);
    },

    beforeSave() {
        const tz = this.publishedAtBlogTZ;
        this.set('publishedAtUTC', tz ? tz.utc() : null);
    },

    save() {
        const [oldStatus] = this.changedAttributes().status || [];
        return this._super(...arguments).then(res => {
            if (this.status === 'published' || oldStatus === 'published') {
                this.search.expireContent();
            }
            return res;
        });
    }
});