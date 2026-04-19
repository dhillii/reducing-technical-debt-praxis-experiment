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
 * Compare two posts by status.
 *
 * @param {Model} postA
 * @param {Model} postB
 * @returns {number} -1, 0, or 1
 */
function compareStatus(postA, postB) {
    const status1 = postA.get('status');
    const status2 = postB.get('status');

    if (!status1 && !status2) {
        return 0;
    }
    if (!status1) {
        return -1;
    }
    if (!status2) {
        return 1;
    }

    if (status1 === 'scheduled' && (status2 === 'draft' || status2 === 'published')) {
        return -1;
    }
    if (status2 === 'scheduled' && (status1 === 'draft' || status1 === 'published')) {
        return 1;
    }

    return compare(status1.valueOf(), status2.valueOf());
}

/**
 * Compare two posts by publishedAtUTC.
 *
 * @param {Model} postA
 * @param {Model} postB
 * @returns {number} -1, 0, or 1
 */
function comparePublishedAt(postA, postB) {
    const published1 = postA.get('publishedAtUTC');
    const published2 = postB.get('publishedAtUTC');

    if (!published1 && !published2) {
        return 0;
    }
    if (!published1) {
        return -1;
    }
    if (!published2) {
        return 1;
    }

    return compare(published1.valueOf(), published2.valueOf());
}

/**
 * Compare two posts by updatedAtUTC.
 *
 * @param {Model} postA
 * @param {Model} postB
 * @returns {number} -1, 0, or 1
 */
function compareUpdatedAt(postA, postB) {
    const updated1 = postA.get('updatedAtUTC');
    const updated2 = postB.get('updatedAtUTC');

    if (!updated1 && !updated2) {
        return 0;
    }
    if (!updated1) {
        return -1;
    }
    if (!updated2) {
        return 1;
    }

    return compare(updated1.valueOf(), updated2.valueOf());
}

/**
 * Compare two posts by id.
 *
 * @param {Model} postA
 * @param {Model} postB
 * @returns {number} -1, 0, or 1
 */
function compareId(postA, postB) {
    return compare(postA.get('id'), postB.get('id'));
}

/**
 * Main comparison function for sorting posts.
 *
 * @param {Model} postA
 * @param {Model} postB
 * @returns {number} -1, 0, or 1
 */
function comparePosts(postA, postB) {
    // New posts should appear first
    if (postA.get('isNew') || !postA.get('updatedAtUTC')) {
        return -1;
    }
    if (postB.get('isNew') || !postB.get('updatedAtUTC')) {
        return 1;
    }

    const statusResult = compareStatus(postA, postB);
    if (statusResult !== 0) {
        return statusResult;
    }

    const publishedResult = comparePublishedAt(postA, postB);
    if (publishedResult !== 0) {
        return -publishedResult; // descending
    }

    const updatedResult = compareUpdatedAt(postA, postB);
    if (updatedResult !== 0) {
        return -updatedResult; // descending
    }

    const idResult = compareId(postA, postB);
    return -idResult; // descending
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
        const blogUrl = this.config.blogUrl;
        const uuid = this.uuid;
        const previewKeyword = 'p';
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
        } else {
            if (this.visibility === 'members') {
                return 'status:free,status:-free';
            }
            if (this.visibility === 'paid') {
                return 'status:-free';
            }
            if (this.visibility === 'tiers' && this.tiers) {
                const filter = this.tiers.map((tier) => `tier:${tier.slug}`).join(',');
                return filter;
            }
            return this.visibility;
        }
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        if (!this.newsletter) {
            return this.emailSegment;
        }
        return `${this.newsletter.recipientFilter}+(${this.emailSegment})`;
    }),

    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        if (this.isScheduled) {
            const now = moment.utc();
            const publishedAtUTC = this.publishedAtUTC || now;
            const pastScheduledTime = publishedAtUTC.diff(now, 'hours', true) < 0;
            this.get('clock.second');
            return pastScheduledTime;
        }
        return false;
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
        if (!this.email || !this.email.emailCount) {
            return 0;
        }
        if (!this.count || !this.count.clicks) {
            return 0;
        }
        return Math.round(this.count.clicks / this.email.emailCount * 100);
    }),

    _getPublishedAtBlogTZ() {
        const publishedAtUTC = this.publishedAtUTC;
        const publishedAtBlogDate = this.publishedAtBlogDate;
        const publishedAtBlogTime = this.publishedAtBlogTime;
        const blogTimezone = this.settings.timezone;

        if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
            return null;
        }

        if (publishedAtBlogDate && publishedAtBlogTime) {
            const publishedAtBlog = moment.tz(`${publishedAtBlogDate} ${publishedAtBlogTime}`, blogTimezone);

            if (publishedAtUTC && publishedAtBlog.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
                return publishedAtUTC;
            }

            return publishedAtBlog;
        }

        return moment.tz(this.publishedAtUTC, blogTimezone);
    },

    _setPublishedAtBlogTZ: on('init', observer('publishedAtUTC', 'settings.timezone', function () {
        const publishedAtUTC = this.publishedAtUTC;
        this._setPublishedAtBlogStrings(publishedAtUTC);
    })),

    _setPublishedAtBlogStrings(momentDate) {
        if (momentDate) {
            const blogTimezone = this.settings.timezone;
            const publishedAtBlog = moment.tz(momentDate, blogTimezone);
            this.set('publishedAtBlogDate', publishedAtBlog.format('YYYY-MM-DD'));
            this.set('publishedAtBlogTime', publishedAtBlog.format('HH:mm'));
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
        const publishedAtBlogTZ = this.publishedAtBlogTZ;
        const publishedAtUTC = publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null;
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