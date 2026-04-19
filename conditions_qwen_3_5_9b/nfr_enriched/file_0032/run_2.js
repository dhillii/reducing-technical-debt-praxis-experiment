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
 * Compares two post statuses for sorting purposes.
 * Scheduled posts are listed first, then draft and published alphabetically.
 * @param {string} statusA - Status of the first post
 * @param {string} statusB - Status of the second post
 * @returns {number} - Comparison result (-1, 0, or 1)
 */
function comparePostStatus(statusA, statusB) {
    if (!statusA && !statusB) {
        return 0;
    }

    if (!statusA && statusB) {
        return -1;
    }

    if (!statusB && statusA) {
        return 1;
    }

    if (statusA === 'scheduled' && (statusB === 'draft' || statusB === 'published')) {
        return -1;
    }

    if (statusB === 'scheduled' && (statusA === 'draft' || statusA === 'published')) {
        return 1;
    }

    return compare(statusA.valueOf(), statusB.valueOf());
}

/**
 * Compares two published dates for sorting purposes.
 * @param {Date} publishedA - Published date of the first post
 * @param {Date} publishedB - Published date of the second post
 * @returns {number} - Comparison result (-1, 0, or 1)
 */
function comparePublishedAt(publishedA, publishedB) {
    if (!publishedA && !publishedB) {
        return 0;
    }

    if (!publishedA && publishedB) {
        return -1;
    }

    if (!publishedB && publishedA) {
        return 1;
    }

    return compare(publishedA.valueOf(), publishedB.valueOf());
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
        let previewKeyword = 'p';

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

        if (this.visibility === 'members') {
            return 'status:free,status:-free';
        }

        if (this.visibility === 'paid') {
            return 'status:-free';
        }

        if (this.visibility === 'tiers' && this.tiers) {
            let filter = this.tiers.map((tier) => {
                return `tier:${tier.slug}`;
            }).join(',');
            return filter;
        }

        return this.visibility;
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

    _getPublishedAtBlogTZ() {
        let publishedAtUTC = this.publishedAtUTC;
        let publishedAtBlogDate = this.publishedAtBlogDate;
        let publishedAtBlogTime = this.publishedAtBlogTime;
        let blogTimezone = this.settings.timezone;

        if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
            return null;
        }

        if (publishedAtBlogDate && publishedAtBlogTime) {
            let publishedAtBlog = moment.tz(`${publishedAtBlogDate} ${publishedAtBlogTime}`, blogTimezone);

            if (publishedAtUTC && publishedAtBlog.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
                return publishedAtUTC;
            }

            return publishedAtBlog;
        } else {
            return moment.tz(this.publishedAtUTC, blogTimezone);
        }
    },

    _setPublishedAtBlogTZ: on('init', observer('publishedAtUTC', 'settings.timezone', function () {
        let publishedAtUTC = this.publishedAtUTC;
        this._setPublishedAtBlogStrings(publishedAtUTC);
    })),

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

    /**
     * Removes client-generated tags with null IDs from the tags collection.
     * Ember Data won't automatically update these when returned from the server.
     */
    updateTags() {
        let tags = this.tags;
        let oldTags = tags.filterBy('id', null);

        tags.removeObjects(oldTags);
        oldTags.invoke('deleteRecord');
    },

    /**
     * Checks if the current user authored this post.
     * @param {User} user - The user to check against
     * @returns {boolean} - True if the user authored this post
     */
    isAuthoredByUser(user) {
        return this.authors.includes(user);
    },

    /**
     * Compares two posts for sorting according to Ghost's server-side sorting logic.
     * Sorts by: status (scheduled, draft, published), publishedAt (DESC), updatedAt (DESC), id (DESC)
     * @param {Post} postA - First post to compare
     * @param {Post} postB - Second post to compare
     * @returns {number} - Comparison result (-1, 0, or 1)
     */
    compare(postA, postB) {
        let updated1 = postA.get('updatedAtUTC');
        let updated2 = postB.get('updatedAtUTC');
        let idResult,
            publishedAtResult,
            statusResult,
            updatedAtResult;

        if (postA.get('isNew') || !updated1) {
            return -1;
        }

        if (postB.get('isNew') || !updated2) {
            return 1;
        }

        idResult = compare(postA.get('id'), postB.get('id'));
        statusResult = comparePostStatus(postA, postB);
        updatedAtResult = compare(updated1.valueOf(), updated2.valueOf());
        publishedAtResult = comparePublishedAt(postA, postB);

        if (statusResult === 0) {
            if (publishedAtResult === 0) {
                if (updatedAtResult === 0) {
                    return idResult * -1;
                }
                return updatedAtResult * -1;
            }
            return publishedAtResult * -1;
        }

        return statusResult;
    },

    /**
     * Prepares the post for saving by converting blog timezone to UTC.
     */
    beforeSave() {
        let publishedAtBlogTZ = this.publishedAtBlogTZ;
        let publishedAtUTC = publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null;
        this.set('publishedAtUTC', publishedAtUTC);
    },

    /**
     * Saves the post and expires search cache if the post is published.
     * @returns {Promise} - Promise that resolves when the save is complete
     */
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