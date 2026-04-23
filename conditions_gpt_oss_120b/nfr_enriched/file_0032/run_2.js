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

/**
 * Compare post statuses with scheduled posts first.
 */
function statusCompare(postA, postB) {
    const statusA = postA.get('status');
    const statusB = postB.get('status');

    if (!statusA && !statusB) return 0;
    if (!statusA) return -1;
    if (!statusB) return 1;

    const isScheduledA = statusA === 'scheduled';
    const isScheduledB = statusB === 'scheduled';

    if (isScheduledA && (statusB === 'draft' || statusB === 'published')) return -1;
    if (isScheduledB && (statusA === 'draft' || statusA === 'published')) return 1;

    return compare(statusA, statusB);
}

/**
 * Compare published dates, handling missing values.
 */
function publishedAtCompare(postA, postB) {
    const publishedA = postA.get('publishedAtUTC');
    const publishedB = postB.get('publishedAtUTC');

    if (!publishedA && !publishedB) return 0;
    if (!publishedA) return -1;
    if (!publishedB) return 1;

    return compare(publishedA.valueOf(), publishedB.valueOf());
}

/**
 * Helper to invert comparison for descending order.
 */
function invert(value) {
    return -value;
}

/**
 * Determine if a post is new or missing updated timestamp.
 */
function isNewOrMissingUpdated(post) {
    return post.get('isNew') || !post.get('updatedAtUTC');
}

/**
 * Compute click rate safely.
 */
function computeClickRate(email, count) {
    if (!email?.emailCount || !count?.clicks) {
        return 0;
    }
    return Math.round(count.clicks / email.emailCount * 100);
}

/**
 * Resolve visibility segment based on visibility and tiers.
 */
function resolveVisibilitySegment(post) {
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
                return post.tiers.map(tier => `tier:${tier.slug}`).join(',');
            }
            // fallthrough
        default:
            return post.visibility;
    }
}

/**
 * Build full recipient filter string.
 */
function buildFullRecipientFilter(newsletter, emailSegment) {
    if (!newsletter) {
        return emailSegment;
    }
    return `${newsletter.recipientFilter}+(${emailSegment})`;
}

/**
 * Determine if the scheduled time has passed.
 */
function hasPastScheduledTime(isScheduled, publishedAtUTC) {
    if (!isScheduled) {
        return false;
    }
    const now = moment.utc();
    const scheduled = publishedAtUTC || now;
    return scheduled.diff(now, 'hours', true) < 0;
}

/**
 * Compute publishedAt in blog timezone.
 */
function computePublishedAtBlogTZ(post) {
    const {publishedAtUTC, publishedAtBlogDate, publishedAtBlogTime, settings} = post;
    const blogTZ = settings.timezone;

    if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
        return null;
    }

    if (publishedAtBlogDate && publishedAtBlogTime) {
        const blogMoment = moment.tz(`${publishedAtBlogDate} ${publishedAtBlogTime}`, blogTZ);

        if (publishedAtUTC && blogMoment.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
            return publishedAtUTC;
        }
        return blogMoment;
    }

    return moment.tz(publishedAtUTC, blogTZ);
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
        return this.email !== null || this.emailOnly;
    }),

    willEmail: computed('isScheduled', 'newsletter', 'email', function () {
        return this.isScheduled && !!this.newsletter && !this.email;
    }),

    hasBeenEmailed: computed('isPost', 'isSent', 'isPublished', 'email', function () {
        return this.isPost && (this.isSent || this.isPublished) && this.email && this.email.status !== 'failed';
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return this.isPost && (this.isSent || this.isPublished) && this.email && this.email.status === 'failed';
    }),

    showAudienceFeedback: computed('sentiment', function () {
        return this.feature.get('audienceFeedback') && this.sentiment !== undefined;
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return this.hasBeenEmailed &&
            !this.session.user.isContributor &&
            this.settings.membersSignupAccess !== 'none' &&
            this.email.trackOpens &&
            this.settings.emailTrackOpens;
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return this.hasBeenEmailed &&
            !this.session.user.isContributor &&
            this.settings.membersSignupAccess !== 'none' &&
            (this.isSent || this.isPublished) &&
            this.email.trackClicks &&
            this.settings.emailTrackClicks;
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return (this.isPage || !this.emailOnly) &&
            this.isPublished &&
            this.settings.membersTrackSources &&
            !this.membersUtils.isMembersInviteOnly &&
            !this.session.user.isContributor;
    }),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', function () {
        return this.isPost &&
            this.session.user.isAdmin &&
            (this.showEmailOpenAnalytics || this.showEmailClickAnalytics || this.showAttributionAnalytics);
    }),

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        if (!this.uuid) {
            return '';
        }
        const previewKeyword = 'p';
        return this.get('ghostPaths.url').join(this.config.blogUrl, previewKeyword, this.uuid);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return this.visibility === 'public';
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return resolveVisibilitySegment(this);
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        return buildFullRecipientFilter(this.newsletter, this.emailSegment);
    }),

    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        const past = hasPastScheduledTime(this.isScheduled, this.publishedAtUTC);
        // force recompute when scheduled
        if (this.isScheduled) {
            this.get('clock.second');
        }
        return past;
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return computePublishedAtBlogTZ(this);
        },
        set(key, value) {
            const momentValue = value ? moment(value) : null;
            this._setPublishedAtBlogStrings(momentValue);
            return computePublishedAtBlogTZ(this);
        }
    }),

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        return computeClickRate(this.email, this.count);
    }),

    _getPublishedAtBlogTZ() {
        return computePublishedAtBlogTZ(this);
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
        const tags = this.tags;
        const unsaved = tags.filterBy('id', null);
        tags.removeObjects(unsaved);
        unsaved.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.authors.includes(user);
    },

    compare(postA, postB) {
        if (isNewOrMissingUpdated(postA)) return -1;
        if (isNewOrMissingUpdated(postB)) return 1;

        const statusResult = statusCompare(postA, postB);
        if (statusResult !== 0) return statusResult;

        const publishedResult = publishedAtCompare(postA, postB);
        if (publishedResult !== 0) return invert(publishedResult);

        const updatedResult = compare(postA.get('updatedAtUTC').valueOf(), postB.get('updatedAtUTC').valueOf());
        if (updatedResult !== 0) return invert(updatedResult);

        const idResult = compare(postA.get('id'), postB.get('id'));
        return invert(idResult);
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