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

const STATUS = {
    SCHEDULED: 'scheduled',
    DRAFT: 'draft',
    PUBLISHED: 'published',
    SENT: 'sent'
};

function compareNullable(a, b) {
    if (!a && !b) { return 0; }
    if (!a) { return -1; }
    if (!b) { return 1; }
    return null;
}

function statusCompare(postA, postB) {
    const status1 = postA.get('status');
    const status2 = postB.get('status');

    const nullResult = compareNullable(status1, status2);
    if (nullResult !== null) { return nullResult; }

    const nonScheduled = [STATUS.DRAFT, STATUS.PUBLISHED];
    if (status1 === STATUS.SCHEDULED && nonScheduled.includes(status2)) { return -1; }
    if (status2 === STATUS.SCHEDULED && nonScheduled.includes(status1)) { return 1; }

    return compare(status1.valueOf(), status2.valueOf());
}

function publishedAtCompare(postA, postB) {
    const published1 = postA.get('publishedAtUTC');
    const published2 = postB.get('publishedAtUTC');

    const nullResult = compareNullable(published1, published2);
    if (nullResult !== null) { return nullResult; }

    return compare(published1.valueOf(), published2.valueOf());
}

function descending(result) {
    return result * -1;
}

export default Model.extend(Comparable, ValidationEngine, {
    // Services
    session: service(),
    feature: service(),
    ghostPaths: service(),
    clock: service(),
    search: service(),
    settings: service(),
    membersUtils: service(),
    config: inject(),

    // Model metadata
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
    status: attr('string', {defaultValue: STATUS.DRAFT}),
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

    // Derived reads
    primaryAuthor: reads('authors.firstObject'),
    primaryTag: reads('tags.firstObject'),
    isFeedbackEnabledForEmail: reads('email.feedbackEnabled'),

    // Scratch fields
    scratch: null,
    lexicalScratch: null,
    titleScratch: null,
    secondaryLexicalState: null,

    // Date/time picker fields
    publishedAtBlogDate: '',
    publishedAtBlogTime: '',

    // Scratch computed properties
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

    // Status flags
    isPublished: equal('status', STATUS.PUBLISHED),
    isDraft: equal('status', STATUS.DRAFT),
    isScheduled: equal('status', STATUS.SCHEDULED),
    isSent: equal('status', STATUS.SENT),
    isPost: equal('displayName', 'post'),
    isPage: equal('displayName', 'page'),
    internalTags: filterBy('tags', 'isInternal', true),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    // Computed properties
    hasEmail: computed('email', 'emailOnly', function () {
        return this.email !== null || this.emailOnly;
    }),

    willEmail: computed('isScheduled', 'newsletter', 'email', function () {
        return this.isScheduled && !!this.newsletter && !this.email;
    }),

    hasBeenEmailed: computed('isPost', 'isSent', 'isPublished', 'email', function () {
        return this.isPost
            && (this.isSent || this.isPublished)
            && this.email
            && this.email.status !== 'failed';
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return this.isPost
            && (this.isSent || this.isPublished)
            && this.email
            && this.email.status === 'failed';
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

    showAttributionAnalytics: computed(
        'isPage', 'emailOnly', 'isPublished',
        'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources',
        function () {
            return (this.isPage || !this.emailOnly)
                && this.isPublished
                && this.settings.membersTrackSources
                && !this.membersUtils.isMembersInviteOnly
                && !this.session.user.isContributor;
        }
    ),

    hasAnalyticsPage: computed(
        'isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics',
        function () {
            return this.isPost
                && this.session.user.isAdmin
                && (
                    this.showEmailOpenAnalytics
                    || this.showEmailClickAnalytics
                    || this.showAttributionAnalytics
                );
        }
    ),

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        if (!this.uuid) { return ''; }
        return this.get('ghostPaths.url').join(this.config.blogUrl, 'p', this.uuid);
    }),

    isPublic: computed('visibility', function () {
        return this.visibility === 'public';
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        if (this.isPublic) {
            return this.settings.defaultContentVisibility === 'paid'
                ? 'status:-free'
                : 'status:free,status:-free';
        }

        const visibilityMap = {
            members: 'status:free,status:-free',
            paid: 'status:-free'
        };

        if (visibilityMap[this.visibility]) {
            return visibilityMap[this.visibility];
        }

        if (this.visibility === 'tiers' && this.tiers) {
            return this.tiers.map(tier => `tier:${tier.slug}`).join(',');
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
        if (!this.isScheduled) { return false; }

        const now = moment.utc();
        const publishedAtUTC = this.publishedAtUTC || now;

        // Access clock.second to force recompute every second
        this.get('clock.second');

        return publishedAtUTC.diff(now, 'hours', true) < 0;
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return this._getPublishedAtBlogTZ();
        },
        set(key, value) {
            this._setPublishedAtBlogStrings(value ? moment(value) : null);
            return this._getPublishedAtBlogTZ();
        }
    }),

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        if (!this.email?.emailCount || !this.count?.clicks) { return 0; }
        return Math.round(this.count.clicks / this.email.emailCount * 100);
    }),

    // Private methods
    _getPublishedAtBlogTZ() {
        const {publishedAtUTC, publishedAtBlogDate, publishedAtBlogTime} = this;
        const blogTimezone = this.settings.timezone;

        if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
            return null;
        }

        if (!publishedAtBlogDate || !publishedAtBlogTime) {
            return moment.tz(publishedAtUTC, blogTimezone);
        }

        const publishedAtBlog = moment.tz(`${publishedAtBlogDate} ${publishedAtBlogTime}`, blogTimezone);

        // Preserve original seconds if the time hasn't changed
        // See https://github.com/TryGhost/Ghost/issues/8603#issuecomment-309538395
        if (publishedAtUTC && publishedAtBlog.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
            return publishedAtUTC;
        }

        return publishedAtBlog;
    },

    // eslint-disable-next-line ghost/ember/no-observers
    _setPublishedAtBlogTZ: on('init', observer('publishedAtUTC', 'settings.timezone', function () {
        this._setPublishedAtBlogStrings(this.publishedAtUTC);
    })),

    _setPublishedAtBlogStrings(momentDate) {
        if (momentDate) {
            const publishedAtBlog = moment.tz(momentDate, this.settings.timezone);
            this.set('publishedAtBlogDate', publishedAtBlog.format('YYYY-MM-DD'));
            this.set('publishedAtBlogTime', publishedAtBlog.format('HH:mm'));
        } else {
            this.set('publishedAtBlogDate', '');
            this.set('publishedAtBlogTime', '');
        }
    },

    // Public methods
    updateTags() {
        const tags = this.tags;
        const clientTags = tags.filterBy('id', null);
        tags.removeObjects(clientTags);
        clientTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.authors.includes(user);
    },

    compare(postA, postB) {
        const updated1 = postA.get('updatedAtUTC');
        const updated2 = postB.get('updatedAtUTC');

        if (postA.get('isNew') || !updated1) { return -1; }
        if (postB.get('isNew') || !updated2) { return 1; }

        const statusResult = statusCompare(postA, postB);
        if (statusResult !== 0) { return statusResult; }

        const publishedAtResult = publishedAtCompare(postA, postB);
        if (publishedAtResult !== 0) { return descending(publishedAtResult); }

        const updatedAtResult = compare(updated1.valueOf(), updated2.valueOf());
        if (updatedAtResult !== 0) { return descending(updatedAtResult); }

        return descending(compare(postA.get('id'), postB.get('id')));
    },

    beforeSave() {
        const publishedAtBlogTZ = this.publishedAtBlogTZ;
        this.set('publishedAtUTC',