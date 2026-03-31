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

// Comparison utilities
const ComparisonUtils = {
    compareNullableValues(value1, value2) {
        if (!value1 && !value2) return 0;
        if (!value1) return -1;
        if (!value2) return 1;
        return null;
    },

    statusCompare(postA, postB) {
        const status1 = postA.get('status');
        const status2 = postB.get('status');
        const nullResult = this.compareNullableValues(status1, status2);
        
        if (nullResult !== null) return nullResult;

        const SCHEDULED_PRIORITY = -1;
        const OTHER_PRIORITY = 1;
        
        if (status1 === 'scheduled' && (status2 === 'draft' || status2 === 'published')) {
            return SCHEDULED_PRIORITY;
        }
        if (status2 === 'scheduled' && (status1 === 'draft' || status1 === 'published')) {
            return OTHER_PRIORITY;
        }

        return compare(status1.valueOf(), status2.valueOf());
    },

    publishedAtCompare(postA, postB) {
        const published1 = postA.get('publishedAtUTC');
        const published2 = postB.get('publishedAtUTC');
        const nullResult = this.compareNullableValues(published1, published2);
        
        if (nullResult !== null) return nullResult;
        return compare(published1.valueOf(), published2.valueOf());
    }
};

// Visibility segment builder
const VisibilitySegmentBuilder = {
    build(visibility, isPublic, tiers, defaultContentVisibility) {
        if (isPublic) {
            return defaultContentVisibility === 'paid' ? 'status:-free' : 'status:free,status:-free';
        }

        const visibilityMap = {
            'members': 'status:free,status:-free',
            'paid': 'status:-free'
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

// Analytics visibility checker
const AnalyticsVisibilityChecker = {
    canShowEmailOpenAnalytics(hasBeenEmailed, isContributor, membersSignupAccess, trackOpens, emailTrackOpens) {
        return hasBeenEmailed
            && !isContributor
            && membersSignupAccess !== 'none'
            && trackOpens
            && emailTrackOpens;
    },

    canShowEmailClickAnalytics(hasBeenEmailed, isContributor, membersSignupAccess, isSentOrPublished, trackClicks, emailTrackClicks) {
        return hasBeenEmailed
            && !isContributor
            && membersSignupAccess !== 'none'
            && isSentOrPublished
            && trackClicks
            && emailTrackClicks;
    },

    canShowAttributionAnalytics(isPageOrNotEmailOnly, isPublished, membersTrackSources, isMembersInviteOnly, isContributor) {
        return isPageOrNotEmailOnly
            && isPublished
            && membersTrackSources
            && !isMembersInviteOnly
            && !isContributor;
    }
};

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
    internalTags: filterBy('tags', 'isInternal', true),

    // Type computed properties
    isPost: equal('displayName', 'post'),
    isPage: equal('displayName', 'page'),

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

    // Analytics computed properties
    showAudienceFeedback: computed('sentiment', function () {
        return this.feature.get('audienceFeedback') && this.sentiment !== undefined;
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return AnalyticsVisibilityChecker.canShowEmailOpenAnalytics(
            this.hasBeenEmailed,
            this.session.user.isContributor,
            this.settings.membersSignupAccess,
            this.email?.trackOpens,
            this.settings.emailTrackOpens
        );
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return AnalyticsVisibilityChecker.canShowEmailClickAnalytics(
            this.hasBeenEmailed,
            this.session.user.isContributor,
            this.settings.membersSignupAccess,
            this.isSent || this.isPublished,
            this.email?.trackClicks,
            this.settings.emailTrackClicks
        );
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return AnalyticsVisibilityChecker.canShowAttributionAnalytics(
            this.isPage || !this.emailOnly,
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

    // Visibility computed properties
    isPublic: computed('visibility', function () {
        return this.visibility === 'public';
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return VisibilitySegmentBuilder.build(
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

    // Preview and URL computed properties
    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        if (!this.uuid) {
            return '';
        }
        return this.get('ghostPaths.url').join(this.config.blogUrl, 'p', this.uuid);
    }),

    // Scheduling computed properties
    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        if (!this.isScheduled) {
            return false;
        }

        const now = moment.utc();
        const publishedAtUTC = this.publishedAtUTC || now;
        const pastScheduledTime = publishedAtUTC.diff(now, 'hours', true) < 0;

        this.get('clock.second');
        return pastScheduledTime;
    }),

    // Click rate computed property
    clickRate: computed('email.emailCount', 'count.clicks', function () {
        if (!this.email?.emailCount || !this.count?.clicks) {
            return 0;
        }
        return Math.round(this.count.clicks / this.email.emailCount * 100);
    }),

    // Published at timezone computed property
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

    // Observers
    _setPublishedAtBlogTZ: on('init', observer('publishedAtUTC', 'settings.timezone', function () {
        this._setPublishedAtBlogStrings(this.publishedAtUTC);
    })),

    // Private methods
    _getPublishedAtBlogTZ() {
        const {publishedAtUTC, publishedAtBlogDate, publishedAtBlogTime} = this;
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

    _setPublishedAtBlogStrings(momentDate) {
        if (momentDate) {
            const blogTimezone = this.settings.timezone;
            const publishedAtBlog = moment.tz(momentDate, blogTimezone);

            this.set('publishedAtBlogDate', publishedAtBlog.format('YYYY-MM-DD'));
            this.set('publishedAtBlogTime', publishedAtBlog.format('HH:mm'));