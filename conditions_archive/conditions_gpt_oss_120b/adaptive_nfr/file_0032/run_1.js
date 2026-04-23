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
 * Compare two possibly null values.
 * Returns 0 if both are null/undefined, -1 if a is null, 1 if b is null, otherwise uses compare().
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
function compareNullable(a, b) {
    if (!a && !b) {
        return 0;
    }
    if (!a) {
        return -1;
    }
    if (!b) {
        return 1;
    }
    return compare(a.valueOf(), b.valueOf());
}

/**
 * Compare post status with scheduled taking precedence.
 * @param {Model} postA
 * @param {Model} postB
 * @returns {number}
 */
function statusCompare(postA, postB) {
    const statusA = postA.get('status');
    const statusB = postB.get('status');

    if (statusA === 'scheduled' && (statusB === 'draft' || statusB === 'published')) {
        return -1;
    }
    if (statusB === 'scheduled' && (statusA === 'draft' || statusA === 'published')) {
        return 1;
    }
    return compare(statusA?.valueOf(), statusB?.valueOf());
}

/**
 * Compare published dates, handling nulls.
 * @param {Model} postA
 * @param {Model} postB
 * @returns {number}
 */
function publishedAtCompare(postA, postB) {
    return compareNullable(postA.get('publishedAtUTC'), postB.get('publishedAtUTC'));
}

/**
 * Determine if a post is public.
 * @param {string} visibility
 * @returns {boolean}
 */
function isPublicVisibility(visibility) {
    return visibility === 'public';
}

/**
 * Build visibility segment filter.
 * @param {string} visibility
 * @param {boolean} isPublic
 * @param {Array} tiers
 * @param {object} settings
 * @returns {string}
 */
function buildVisibilitySegment(visibility, isPublic, tiers, settings) {
    if (isPublic) {
        return settings.defaultContentVisibility === 'paid' ? 'status:-free' : 'status:free,status:-free';
    }
    if (visibility === 'members') {
        return 'status:free,status:-free';
    }
    if (visibility === 'paid') {
        return 'status:-free';
    }
    if (visibility === 'tiers' && tiers) {
        return tiers.map(tier => `tier:${tier.slug}`).join(',');
    }
    return visibility;
}

/**
 * Determine if attribution analytics should be shown.
 * @param {object} ctx
 * @returns {boolean}
 */
function shouldShowAttributionAnalytics(ctx) {
    const {isPage, emailOnly, isPublished, settings, membersUtils, session} = ctx;
    return (isPage || !emailOnly) &&
        isPublished &&
        settings.membersTrackSources &&
        !membersUtils.isMembersInviteOnly &&
        !session.user.isContributor;
}

/**
 * Determine if email open analytics should be shown.
 * @param {object} ctx
 * @returns {boolean}
 */
function shouldShowEmailOpenAnalytics(ctx) {
    const {hasBeenEmailed, session, settings, email} = ctx;
    return hasBeenEmailed &&
        !session.user.isContributor &&
        settings.membersSignupAccess !== 'none' &&
        email.trackOpens &&
        settings.emailTrackOpens;
}

/**
 * Determine if email click analytics should be shown.
 * @param {object} ctx
 * @returns {boolean}
 */
function shouldShowEmailClickAnalytics(ctx) {
    const {hasBeenEmailed, session, settings, email, isSent, isPublished} = ctx;
    return hasBeenEmailed &&
        !session.user.isContributor &&
        settings.membersSignupAccess !== 'none' &&
        (isSent || isPublished) &&
        email.trackClicks &&
        settings.emailTrackClicks;
}

/**
 * Determine if analytics page should be shown.
 * @param {object} ctx
 * @returns {boolean}
 */
function shouldShowAnalyticsPage(ctx) {
    const {isPost, session, showEmailOpenAnalytics, showEmailClickAnalytics, showAttributionAnalytics} = ctx;
    return isPost &&
        session.user.isAdmin &&
        (showEmailOpenAnalytics || showEmailClickAnalytics || showAttributionAnalytics);
}

/**
 * Compute click rate safely.
 * @param {number} emailCount
 * @param {number} clicks
 * @returns {number}
 */
function computeClickRate(emailCount, clicks) {
    if (!emailCount || !clicks) {
        return 0;
    }
    return Math.round(clicks / emailCount * 100);
}

/**
 * Compare two posts according to Ghost sorting rules.
 * @param {Model} postA
 * @param {Model} postB
 * @returns {number}
 */
function comparePosts(postA, postB) {
    const updatedA = postA.get('updatedAtUTC');
    const updatedB = postB.get('updatedAtUTC');

    if (postA.get('isNew') || !updatedA) {
        return -1;
    }
    if (postB.get('isNew') || !updatedB) {
        return 1;
    }

    const idResult = compare(postA.get('id'), postB.get('id'));
    const statusResult = statusCompare(postA, postB);
    const updatedResult = compare(updatedA.valueOf(), updatedB.valueOf());
    const publishedResult = publishedAtCompare(postA, postB);

    if (statusResult !== 0) {
        return statusResult;
    }
    if (publishedResult !== 0) {
        return -publishedResult;
    }
    if (updatedResult !== 0) {
        return -updatedResult;
    }
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
        return !!this.email || this.emailOnly;
    }),

    willEmail: computed('isScheduled', 'newsletter', 'email', function () {
        return this.isScheduled && !!this.newsletter && !this.email;
    }),

    hasBeenEmailed: computed('isPost', 'isSent', 'isPublished', 'email', function () {
        return this.isPost &&
            (this.isSent || this.isPublished) &&
            this.email &&
            this.email.status !== 'failed';
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return this.isPost &&
            (this.isSent || this.isPublished) &&
            this.email &&
            this.email.status === 'failed';
    }),

    showAudienceFeedback: computed('sentiment', function () {
        return this.feature.get('audienceFeedback') && this.sentiment !== undefined;
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return shouldShowEmailOpenAnalytics(this);
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return shouldShowEmailClickAnalytics(this);
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return shouldShowAttributionAnalytics(this);
    }),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', function () {
        return shouldShowAnalyticsPage(this);
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
        return isPublicVisibility(this.visibility);
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return buildVisibilitySegment(this.visibility, this.isPublic, this.tiers, this.settings);
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        if (!this.newsletter) {
            return this.emailSegment;
        }
        return `${this.newsletter.recipientFilter}+(${this.emailSegment})`;
    }),

    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        if (!this.isScheduled) {
            return false;
        }
        const now = moment.utc();
        const scheduled = this.publishedAtUTC || now;
        const past = scheduled.diff(now, 'hours', true) < 0;
        this.get('clock.second'); // force recompute
        return past;
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
        const emailCount = this.email?.emailCount;
        const clicks = this.count?.clicks;
        return computeClickRate(emailCount, clicks);
    }),

    _getPublishedAtBlogTZ() {
        const {publishedAtUTC, publishedAtBlogDate, publishedAtBlogTime, settings} = this;
        const blogTimezone = settings.timezone;

        if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
            return null;
        }

        if (publishedAtBlogDate && publishedAtBlogTime) {
            const blogMoment = moment.tz(`${publishedAtBlogDate} ${publishedAtBlogTime}`, blogTimezone);
            if (publishedAtUTC && blogMoment.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
                return publishedAtUTC;
            }
            return blogMoment;
        }

        return moment.tz(publishedAtUTC, blogTimezone);
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
        const oldTags = tags.filterBy('id', null);
        tags.removeObjects(oldTags);
        oldTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.authors.includes(user);
    },

    compare(postA, postB) {
        return comparePosts(postA, postB);
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