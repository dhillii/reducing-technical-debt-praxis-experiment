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
const {Comparable} = Ember;

// ============================================================================
// Comparison Utilities
// ============================================================================

const ComparisonUtils = {
    compareNullableValues(value1, value2) {
        if (!value1 && !value2) return 0;
        if (!value1) return -1;
        if (!value2) return 1;
        return null;
    },

    statusPriority: {
        scheduled: 0,
        draft: 1,
        published: 1
    },

    statusCompare(postA, postB) {
        const status1 = postA.get('status');
        const status2 = postB.get('status');
        const nullResult = this.compareNullableValues(status1, status2);

        if (nullResult !== null) return nullResult;

        const priority1 = this.statusPriority[status1] ?? 2;
        const priority2 = this.statusPriority[status2] ?? 2;

        if (priority1 !== priority2) {
            return priority1 - priority2;
        }

        return compare(status1.valueOf(), status2.valueOf());
    },

    publishedAtCompare(postA, postB) {
        const published1 = postA.get('publishedAtUTC');
        const published2 = postB.get('publishedAtUTC');
        const nullResult = this.compareNullableValues(published1, published2);

        return nullResult !== null ? nullResult : compare(published1.valueOf(), published2.valueOf());
    }
};

// ============================================================================
// Visibility Segment Calculator
// ============================================================================

const VisibilitySegmentCalculator = {
    calculate(visibility, isPublic, tiers, defaultContentVisibility) {
        if (isPublic) {
            return defaultContentVisibility === 'paid' ? 'status:-free' : 'status:free,status:-free';
        }

        const visibilityMap = {
            members: 'status:free,status:-free',
            paid: 'status:-free'
        };

        if (visibilityMap[visibility]) {
            return visibilityMap[visibility];
        }

        if (visibility === 'tiers' && tiers) {
            return tiers.map(tier => `tier:${tier.slug}`).join(',');
        }

        return visibility;
    }
};

// ============================================================================
// Analytics Visibility Helpers
// ============================================================================

const AnalyticsVisibilityHelpers = {
    canShowEmailAnalytics(hasBeenEmailed, isContributor, membersSignupAccess, emailTrackProperty, settingsTrackProperty) {
        return hasBeenEmailed
            && !isContributor
            && membersSignupAccess !== 'none'
            && emailTrackProperty
            && settingsTrackProperty;
    },

    canShowAttributionAnalytics(isPage, emailOnly, isPublished, membersTrackSources, isMembersInviteOnly, isContributor) {
        return (isPage || !emailOnly)
            && isPublished
            && membersTrackSources
            && !isMembersInviteOnly
            && !isContributor;
    }
};

// ============================================================================
// Post Model
// ============================================================================

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

    // Attributes
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
    tiers: attr('member-tier'),

    // Relationships
    authors: hasMany('user', {embedded: 'always', async: false}),
    email: belongsTo('email', {async: false}),
    newsletter: belongsTo('newsletter', {embedded: 'always', async: false}),
    publishedBy: belongsTo('user', {async: true}),
    tags: hasMany('tag', {embedded: 'always', async: false}),
    postRevisions: hasMany('post_revisions', {embedded: 'always', async: false}),

    // Computed relationships
    primaryAuthor: reads('authors.firstObject'),
    primaryTag: reads('tags.firstObject'),

    // Scratch properties
    scratch: null,
    lexicalScratch: null,
    titleScratch: null,
    secondaryLexicalState: null,
    publishedAtBlogDate: '',
    publishedAtBlogTime: '',

    // Bound one-way properties
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
    emailSubjectScratch: boundOneWay('emailSubject'),

    // Status computed properties
    isPublished: equal('status', 'published'),
    isDraft: equal('status', 'draft'),
    isScheduled: equal('status', 'scheduled'),
    isSent: equal('status', 'sent'),
    isPost: equal('displayName', 'post'),
    isPage: equal('displayName', 'page'),
    internalTags: filterBy('tags', 'isInternal', true),

    // Email computed properties
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

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    // Audience feedback
    showAudienceFeedback: computed('sentiment', function () {
        return this.feature.get('audienceFeedback') && this.sentiment !== undefined;
    }),

    // Analytics computed properties
    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return AnalyticsVisibilityHelpers.canShowEmailAnalytics(
            this.hasBeenEmailed,
            this.session.user.isContributor,
            this.settings.membersSignupAccess,
            this.email?.trackOpens,
            this.settings.emailTrackOpens
        );
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return AnalyticsVisibilityHelpers.canShowEmailAnalytics(
            this.hasBeenEmailed,
            this.session.user.isContributor,
            this.settings.membersSignupAccess,
            this.email?.trackClicks,
            this.settings.emailTrackClicks
        ) && (this.isSent || this.isPublished);
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return AnalyticsVisibilityHelpers.canShowAttributionAnalytics(
            this.isPage,
            this.emailOnly,
            this.isPublished,
            this.settings.membersTrackSources,
            this.membersUtils.isMembersInviteOnly,
            this.session.user.isContributor
        );
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

    // Preview and visibility
    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        if (!this.uuid) {
            return '';
        }
        return this.get('ghostPaths.url').join(this.config.blogUrl, 'p', this.uuid);
    }),

    isPublic: computed('visibility', function () {
        return this.visibility === 'public';
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return VisibilitySegmentCalculator.calculate(
            this.visibility,
            this.isPublic,
            this.tiers,
            this.settings.defaultContentVisibility
        );
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        if (!this.newsletter) {
            return this.emailSegment;
        }
        return `${this.newsletter.recipientFilter}+(${this.emailSegment})`;
    }),

    // Scheduling
    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        if (!this.isScheduled) {
            return false;
        }

        const now = moment.utc();
        const publishedAtUTC = this.publishedAtUTC || now;
        this.get('clock.second');

        return publishedAtUTC.diff(now, 'hours', true) < 0;
    }),

    // Published at timezone handling
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

    // Click rate analytics
    clickRate: computed('email.emailCount', 'count.clicks', function () {
        if (!this.email?.emailCount || !this.count?.clicks) {
            return 0;
        }
        return Math.round(this.count.clicks / this.email.emailCount * 100);
    }),

    // ========================================================================
    // Methods
    // ========================================================================

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

        return moment.tz(publishedAtUTC, blogTimezone);
    },

    // eslint-disable-next-line ghost/ember/no-observers
    _setPublishedAtBlogTZ: on('init', observer('publishedAtUTC', 'settings.timezone', function () {
        this._setPublishedAtBlogStrings(this.publishedAtUTC);
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
        const tags = this.tags