Here's the refactored code with improved quality and reduced complexity:

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

// Status ordering for sorting: scheduled comes first, then draft/published alphabetically
const STATUS_ORDER = {scheduled: 0, draft: 1, published: 2};

function compareNullable(a, b) {
    if (!a && !b) { return 0; }
    if (!a) { return -1; }
    if (!b) { return 1; }
    return null; // both values exist, caller should compare
}

function statusCompare(postA, postB) {
    const status1 = postA.get('status');
    const status2 = postB.get('status');

    const nullResult = compareNullable(status1, status2);
    if (nullResult !== null) { return nullResult; }

    const order1 = STATUS_ORDER[status1] ?? Infinity;
    const order2 = STATUS_ORDER[status2] ?? Infinity;

    if (order1 !== order2) { return order1 < order2 ? -1 : 1; }

    return compare(status1.valueOf(), status2.valueOf());
}

function publishedAtCompare(postA, postB) {
    const published1 = postA.get('publishedAtUTC');
    const published2 = postB.get('publishedAtUTC');

    const nullResult = compareNullable(published1, published2);
    if (nullResult !== null) { return nullResult; }

    return compare(published1.valueOf(), published2.valueOf());
}

// Scratch properties mapped to their source properties
const SCRATCH_PROPERTIES = {
    canonicalUrlScratch: 'canonicalUrl',
    customExcerptScratch: 'customExcerpt',
    codeinjectionFootScratch: 'codeinjectionFoot',
    codeinjectionHeadScratch: 'codeinjectionHead',
    metaDescriptionScratch: 'metaDescription',
    metaTitleScratch: 'metaTitle',
    ogDescriptionScratch: 'ogDescription',
    ogTitleScratch: 'ogTitle',
    twitterDescriptionScratch: 'twitterDescription',
    twitterTitleScratch: 'twitterTitle',
    emailSubjectScratch: 'emailSubject'
};

const scratchProperties = Object.fromEntries(
    Object.entries(SCRATCH_PROPERTIES).map(([key, value]) => [key, boundOneWay(value)])
);

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

    // Derived relationship reads
    primaryAuthor: reads('authors.firstObject'),
    primaryTag: reads('tags.firstObject'),

    // Scratch/transient state
    scratch: null,
    lexicalScratch: null,
    titleScratch: null,
    secondaryLexicalState: null,
    publishedAtBlogDate: '',
    publishedAtBlogTime: '',

    // Dynamically defined scratch properties
    ...scratchProperties,

    // Status computed properties
    isPublished: equal('status', 'published'),
    isDraft: equal('status', 'draft'),
    isScheduled: equal('status', 'scheduled'),
    isSent: equal('status', 'sent'),
    isPost: equal('displayName', 'post'),
    isPage: equal('displayName', 'page'),
    internalTags: filterBy('tags', 'isInternal', true),
    isFeedbackEnabledForEmail: reads('email.feedbackEnabled'),
    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    // Email state
    hasEmail: computed('email', 'emailOnly', function () {
        return this.email !== null || this.emailOnly;
    }),

    willEmail: computed('isScheduled', 'newsletter', 'email', function () {
        return this.isScheduled && !!this.newsletter && !this.email;
    }),

    hasBeenEmailed: computed('isPost', 'isSent', 'isPublished', 'email', function () {
        return this.isPost
            && (this.isSent || this.isPublished)
            && this.email?.status !== 'failed';
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return this.isPost
            && (this.isSent || this.isPublished)
            && this.email?.status === 'failed';
    }),

    // Analytics visibility
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
        'isPost', 'showEmailOpenAnalytics',
        'showEmailClickAnalytics', 'showAttributionAnalytics',
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

    // URL and visibility
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
        if (!this.newsletter) { return this.emailSegment; }
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

        // Preserve original seconds if the time hasn't changed (see GH-8603)
        const hasNotChanged = publishedAtUTC
            && publishedAtBlog.diff(publishedAtUTC.clone().startOf('minutes')) === 0;

        return hasNotChanged ? publishedAtUTC : publishedAtBlog;
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

    // Public methods

    // Remove client-generated tags (id: null) so Ember Data can reconcile
    // server-returned tags with IDs. See: https://github.com/emberjs/data/issues/1829
    updateTags() {
        const tags = this.tags;
        const clientTags = tags.filterBy('id', null);
        tags.removeObjects(clientTags);
        clientTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.authors.includes(user);
    },

    // Sort order mirrors server: scheduled → draft → published, then publishedAt DESC,
    // updatedAt DESC, id DESC
    compare(postA, postB) {
        const updated1 = postA.get('updatedAtUTC');
        const updated2 = postB.get('updatedAtUTC');

        // Models still being written from server response
        if (postA.get('isNew') || !updated1) { return -1; }
        if (postB.get('isNew') || !updated2) { return 1; }

        const statusResult = statusCompare(postA, postB);
        if (statusResult !== 0) { return statusResult; }

        const publishedAtResult = publishedAtCompare(postA, postB);
        if (publishedAtResult !== 0) { return publishedAtResult * -1; }

        const updatedAtResult = compare(updated1.valueOf(), updated2.valueOf());
        if (updatedAtResult !== 0) { return updatedAtResult * -1; }

        // TODO: revisit ID sorting — no longer auto-incrementing
        return compare(postA.get('id'), postB.get('id')) * -1;
    },

    // ValidationEngine hook: convert blog-timezone date/time strings to UTC before save
    beforeSave() {
        const publishedAtBlogTZ = this.publishedAtBlogTZ;
        this.set('publishedAtUTC', publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null);
    },

    // Expire search cache when a published post is created, updated, or deleted
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

Key improvements made:

1. **`compareNullable` helper**: Extracted repeated null-checking pattern from `statusCompare` and `publishedAtCompare` into a reusable function.

2. **`STATUS_ORDER` map**: Replaced chained `if/else` conditions in `statusCompare` with a lookup table, making priority order explicit and easy to extend.

3. **`SCRATCH_PROPERTIES` map + spread**: Eliminated 11 repetitive `boundOneWay` declarations by deriving them from a single map using `Object.fromEntries`.

4. **`visibilitySegment` simplification**: Replaced nested `if/else` with a `visibilityMap` lookup object for the common cases.

5. **`compare` method flattening**: Replaced deeply nested `if/else` blocks with early returns, making the sort logic linear and easier to follow.

6. **Optional chaining**: Used `?.` in `hasBeenEmailed`, `didEmailFail`, and `clickRate` to reduce verbose null guards.

7. **`isPublic` simplification**: Removed redundant ternary (`=== 'public' ? true : false` → `=== 'public'`).

8. **`_getPublishedAtBlogTZ` clarity**: Destructured properties at the top and added a comment explaining the seconds-preservation logic.

9. **`const` over `let`**: Used `const` throughout where values are not reassigned.

10. **Removed redundant comments**: Kept only meaningful comments that explain *why*, not *what*.