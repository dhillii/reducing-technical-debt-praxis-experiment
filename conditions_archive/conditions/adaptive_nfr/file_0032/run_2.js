```javascript
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

// ember-cli-shims doesn't export these so we must get them manually
const {Comparable} = Ember;

/**
 * Compares two values handling null/undefined cases
 * @param {*} val1 - First value
 * @param {*} val2 - Second value
 * @returns {number} -1 if val1 is null, 1 if val2 is null, 0 if both null
 */
function compareNullValues(val1, val2) {
    if (!val1 && !val2) {
        return 0;
    }
    if (!val1) {
        return -1;
    }
    if (!val2) {
        return 1;
    }
    return null;
}

/**
 * Checks if status is draft or published
 * @param {string} status - Status value
 * @returns {boolean}
 */
function isDraftOrPublished(status) {
    return status === 'draft' || status === 'published';
}

/**
 * Checks if status is scheduled
 * @param {string} status - Status value
 * @returns {boolean}
 */
function isScheduledStatus(status) {
    return status === 'scheduled';
}

function statusCompare(postA, postB) {
    let status1 = postA.get('status');
    let status2 = postB.get('status');

    let nullResult = compareNullValues(status1, status2);
    if (nullResult !== null) {
        return nullResult;
    }

    // Scheduled posts listed first, then draft and published alphabetically
    if (isScheduledStatus(status1) && isDraftOrPublished(status2)) {
        return -1;
    }

    if (isScheduledStatus(status2) && isDraftOrPublished(status1)) {
        return 1;
    }

    return compare(status1.valueOf(), status2.valueOf());
}

function publishedAtCompare(postA, postB) {
    let published1 = postA.get('publishedAtUTC');
    let published2 = postB.get('publishedAtUTC');

    let nullResult = compareNullValues(published1, published2);
    if (nullResult !== null) {
        return nullResult;
    }

    return compare(published1.valueOf(), published2.valueOf());
}

/**
 * Visibility segment strategy lookup
 */
const visibilitySegmentStrategies = {
    /**
     * Returns segment for members visibility
     * @returns {string}
     */
    members() {
        return 'status:free,status:-free';
    },
    /**
     * Returns segment for paid visibility
     * @returns {string}
     */
    paid() {
        return 'status:-free';
    },
    /**
     * Returns segment for tiers visibility
     * @param {Array} tiers - Tier objects
     * @returns {string}
     */
    tiers(tiers) {
        if (!tiers) {
            return '';
        }
        return tiers.map((tier) => `tier:${tier.slug}`).join(',');
    }
};

/**
 * Gets visibility segment for non-public visibility
 * @param {string} visibility - Visibility type
 * @param {Array} tiers - Tier objects
 * @returns {string}
 */
function getNonPublicVisibilitySegment(visibility, tiers) {
    const strategy = visibilitySegmentStrategies[visibility];
    if (strategy) {
        return strategy(tiers);
    }
    return visibility;
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
    lexical: attr('string', {defaultValue: () => {
        return BLANK_LEXICAL;
    }}),
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
        return this.isPost
            && (this.isSent || this.isPublished)
            && this.email && this.email.status !== 'failed';
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return this.isPost
            && (this.isSent || this.isPublished)
            && this.email && this.email.status === 'failed';
    }),

    showAudienceFeedback: computed('sentiment', function () {
        return this.feature.get('audienceFeedback') && this.sentiment !== undefined;
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return this.hasBeenEmailed
            && !this.session.user.isContributor
            && this.settings.membersSignupAccess !== 'none'
            && this.email.trackOpens
            && this.settings.emailTrackOpens;
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return this.hasBeenEmailed
            && !this.session.user.isContributor
            && this.settings.membersSignupAccess !== 'none'
            && (this.isSent || this.isPublished)
            && this.email.trackClicks
            && this.settings.emailTrackClicks;
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return (this.isPage || !this.emailOnly)
                && this.isPublished
                && this.settings.membersTrackSources
                && !this.membersUtils.isMembersInviteOnly
                && !this.session.user.isContributor;
    }),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', function () {
        return this.isPost
            && this.session.user.isAdmin
            && (
                this.showEmailOpenAnalytics
                || this.showEmailClickAnalytics
                || this.showAttributionAnalytics
            );
    }),

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        let blogUrl = this.config.blogUrl;
        let uuid = this.uuid;
        // routeKeywords.preview: 'p'
        let previewKeyword = 'p';
        // New posts don't have a preview
        if (!uuid) {
            return '';
        }
        return this.get('ghostPaths.url').join(blogUrl, previewKeyword, uuid);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return this.visibility === 'public';
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        if (this.isPublic) {
            return this.settings.defaultContentVisibility === 'paid' ? 'status:-free' : 'status:free,status:-free';
        }
        return getNonPublicVisibilitySegment(this.visibility, this.tiers);
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

        let now = moment.utc();
        let publishedAtUTC = this.publishedAtUTC || now;
        let pastScheduledTime = publishedAtUTC.diff(now, 'hours', true) < 0;

        // force a recompute
        this.get('clock.second');

        return pastScheduledTime;
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return this._getPublishedAtBlogTZ();
        },
        set(key, value) {
            let momentValue = value ? moment(value) : null;
            this._setPublishedAtBlogStrings(momentValue);
            return this._getPublishedAtBlogTZ();
        }
    }),

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        if (!this.email || !this.email.emailCount) {
            return 0;
        }
        if (!this.count || !this.count.clicks) {
            return 0;
        }

        return Math.round(this.count.clicks / this.email.emailCount * 100);
    }),

    /**
     * Gets the published date/time in blog timezone
     * @returns {moment|null}
     */
    _getPublishedAtBlogTZ() {
        let publishedAtUTC = this.publishedAtUTC;
        let publishedAtBlogDate = this.publishedAtBlogDate;
        let publishedAtBlogTime = this.publishedAtBlogTime;
        let blogTimezone = this.settings.timezone;

        if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
            return null;
        }

        if (publishedAtBlogDate && publishedAtBlogTime) {
            return this._getPublishedAtBlogFromStrings(publishedAtBlogDate, publishedAtBlogTime, blogTimezone, publishedAtUTC);
        }

        return moment.tz(publishedAtUTC, blogTimezone);
    },

    /**
     * Constructs published date from blog date/time strings
     * @param {string} blogDate - Date string
     * @param {string} blogTime - Time string
     * @param {string} timezone - Timezone
     * @param {moment} publishedAtUTC - Original UTC time
     * @returns {moment}
     */
    _getPublishedAtBlogFromStrings(blogDate, blogTime, timezone, publishedAtUTC) {
        let publishedAtBlog = moment.tz(`${blogDate} ${blogTime}`, timezone);

        /**
         * Note:
         * If you create a post and publish it, we send seconds to the database.
         * If you edit the post afterwards, ember would send the date without seconds, because
         * the `publishedAtUTC` is based on `publishedAtBlogTime`, which is only in seconds.
         * The date time picker doesn't use seconds.
         *
         * This condition prevents the case:
         *   - you edit a post, but you don't change the published_at time
         *   - we keep the original date with seconds
         *
         * See https://github.com/TryGhost/Ghost/issues/8603#issuecomment-309538395.
         */
        if (publishedAtUTC && publishedAtBlog.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
            return publishedAtUTC;
        }

        return publishedAtBlog;
    },

    // TODO: is there a better way to handle this?
    // eslint-disable-next-line ghost/ember/no-observers
    _setPublishedAtBlogTZ: on('init', observer('publishedAtUTC', 'settings.timezone', function () {
        let publishedAtUTC = this.publishedAtUTC;
        this._setPublishedAtBlogStrings(publishedAtUTC);
    })),

    /**
     * Sets blog date/time strings from moment date
     * @param {moment|null} momentDate - Moment date object
     */
    _setPublishedAtBlogStrings(momentDate) {
        if (momentDate) {
            let blogTimezone = this.settings.timezone;
            let publishedAtBlog = moment.tz(momentDate, blogTimezone);

            this.set('publishedAtBlogDate', publishedAtBlog.format('YYYY-MM-DD'));
            this.set('publishedAtBlogTime', publishedAtBlog.format('HH:mm'));
        } else {
            this.set('publishedAtBlogDate', '');
            this.set('publishedAtBlogTime', '');
        }
    },

    updateTags() {
        let tags = this.tags;
        let oldTags = tags.filterBy('id', null);

        tags.removeObjects(oldTags);
        oldTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.authors.includes(user);
    },

    /**
     * Compares two posts for sorting
     * Order: status (scheduled, draft, published), publishedAt DESC, updatedAt DESC, id DESC
     * @param {Model} postA - First post
     * @param {Model} postB - Second post
     * @returns {number}
     */
    compare(postA, postB) {
        let updated1 = postA.get('updatedAtUTC');
        let updated2 = postB.get('updatedAtUTC');

        // when `updatedAt` is undefined, the model is still being written to
        if (postA.get('isNew') || !updated1) {
            return -1;
        }

        if (postB.get('isNew') || !updated2) {
            return 1;
        }

        let statusResult = statusCompare(postA, postB);
        if (statusResult !== 0) {
            return statusResult;
        }

        let publishedAtResult = publishedAtCompare(postA, postB);
        if (publishedAtResult !== 0) {
            return publishedAtResult * -1;
        }

        let updatedAtResult = compare(updated1.valueOf(), updated2.valueOf());
        if (updatedAtResult !== 0) {
            return updatedAtResult * -1;
        }

        // TODO: revisit the ID sorting because we no longer have auto-incrementing IDs
        let idResult = compare(postA.get('id'), postB.get('id'));
        return idResult * -1;
    },

    beforeSave() {
        let publishedAtBlogTZ = this.publishedAtBlogTZ;
        let publishedAtUTC = publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null;
        this.set('publishedAtUTC', publishedAtUTC);
    },

    save() {
        const [oldStatus] = this.changedAttributes().status || [];

        return this._super(...arguments).then((res) => {
            if (this.status === 'published' || oldStatus === 'published') {
                this.search.expireContent();
            }

            return res;
        });
    }
});
```