# Refactored Post Model

The main complexity issues I identified:
1. Monolithic `Model.extend()` with mixed concerns
2. Complex comparison logic inline
3. Verbose computed properties with repeated patterns
4. Long `compare()` method with nested conditionals
5. Mixed old/new Ember patterns

```javascript
import Ember from 'ember';
import Model, { attr, belongsTo, hasMany } from '@ember-data/model';
import ValidationEngine from 'ghost-admin/mixins/validation-engine';
import boundOneWay from 'ghost-admin/utils/bound-one-way';
import moment from 'moment-timezone';
import { compare, isBlank } from '@ember/utils';
import { computed, observer } from '@ember/object';
import { equal, filterBy, reads } from '@ember/object/computed';
import { inject } from 'ghost-admin/decorators/inject';
import { on } from '@ember/object/evented';
import { inject as service } from '@ember/service';

// ─── Constants ───────────────────────────────────────────────────────────────

const BLANK_LEXICAL = '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

const STATUS = {
    SCHEDULED: 'scheduled',
    DRAFT: 'draft',
    PUBLISHED: 'published',
    SENT: 'sent',
};

const { Comparable } = Ember;

// ─── Comparison Helpers ───────────────────────────────────────────────────────

/**
 * Returns -1, 0, or 1 when either/both values are falsy.
 * Returns null when both values are present (caller handles that case).
 */
function compareNullable(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    return null;
}

function statusCompare(postA, postB) {
    const s1 = postA.get('status');
    const s2 = postB.get('status');

    const nullResult = compareNullable(s1, s2);
    if (nullResult !== null) return nullResult;

    // Scheduled posts sort before draft/published
    const s1Scheduled = s1 === STATUS.SCHEDULED;
    const s2Scheduled = s2 === STATUS.SCHEDULED;
    if (s1Scheduled && !s2Scheduled) return -1;
    if (s2Scheduled && !s1Scheduled) return 1;

    return compare(s1.valueOf(), s2.valueOf());
}

function publishedAtCompare(postA, postB) {
    const p1 = postA.get('publishedAtUTC');
    const p2 = postB.get('publishedAtUTC');

    const nullResult = compareNullable(p1, p2);
    if (nullResult !== null) return nullResult;

    return compare(p1.valueOf(), p2.valueOf());
}

/**
 * Sorts DESC by chaining comparison results.
 * Each entry is [result, descending].
 */
function firstNonZero(comparisons) {
    for (const [result, desc] of comparisons) {
        if (result !== 0) return desc ? result * -1 : result;
    }
    return 0;
}

// ─── Model ───────────────────────────────────────────────────────────────────

export default Model.extend(Comparable, ValidationEngine, {

    // ── Services ──────────────────────────────────────────────────────────────

    session: service(),
    feature: service(),
    ghostPaths: service(),
    clock: service(),
    search: service(),
    settings: service(),
    membersUtils: service(),
    config: inject(),

    // ── Identity ──────────────────────────────────────────────────────────────

    displayName: 'post',
    validationType: 'post',

    // ── Attributes ────────────────────────────────────────────────────────────

    count: attr(),
    sentiment: attr(),
    createdAtUTC: attr('moment-utc'),
    excerpt: attr('string'),
    customExcerpt: attr('string'),
    featured: attr('boolean', { defaultValue: false }),
    canonicalUrl: attr('string'),
    codeinjectionFoot: attr('string', { defaultValue: '' }),
    codeinjectionHead: attr('string', { defaultValue: '' }),
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
    lexical: attr('string', { defaultValue: () => BLANK_LEXICAL }),
    plaintext: attr('string'),
    publishedAtUTC: attr('moment-utc'),
    slug: attr('string'),
    status: attr('string', { defaultValue: STATUS.DRAFT }),
    title: attr('string', { defaultValue: '' }),
    updatedAtUTC: attr('moment-utc'),
    url: attr('string'),
    uuid: attr('string'),
    emailSegment: attr('members-segment-string', { defaultValue: null }),
    emailOnly: attr('boolean', { defaultValue: false }),
    featureImage: attr('string'),
    featureImageAlt: attr('string'),
    featureImageCaption: attr('string'),
    showTitleAndFeatureImage: attr('boolean', { defaultValue: true }),
    tiers: attr('member-tier'),

    // ── Relationships ─────────────────────────────────────────────────────────

    authors: hasMany('user', { embedded: 'always', async: false }),
    email: belongsTo('email', { async: false }),
    newsletter: belongsTo('newsletter', { embedded: 'always', async: false }),
    publishedBy: belongsTo('user', { async: true }),
    tags: hasMany('tag', { embedded: 'always', async: false }),
    postRevisions: hasMany('post_revisions', { embedded: 'always', async: false }),

    // ── Simple Derived State ──────────────────────────────────────────────────

    primaryAuthor: reads('authors.firstObject'),
    primaryTag: reads('tags.firstObject'),
    isFeedbackEnabledForEmail: reads('email.feedbackEnabled'),

    isPublished: equal('status', STATUS.PUBLISHED),
    isDraft: equal('status', STATUS.DRAFT),
    isScheduled: equal('status', STATUS.SCHEDULED),
    isSent: equal('status', STATUS.SENT),
    isPost: equal('displayName', 'post'),
    isPage: equal('displayName', 'page'),

    internalTags: filterBy('tags', 'isInternal', true),

    showPaidAttributionAnalytics: computed.and(
        'showAttributionAnalytics',
        'membersUtils.paidMembersEnabled'
    ),

    // ── Scratch Properties ────────────────────────────────────────────────────

    scratch: null,
    lexicalScratch: null,
    titleScratch: null,
    secondaryLexicalState: null,

    // Date/time strings for pickers; kept in sync with publishedAtUTC via observer
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
    emailSubjectScratch: boundOneWay('emailSubject'),

    // ── Email State ───────────────────────────────────────────────────────────

    hasEmail: computed('email', 'emailOnly', function () {
        return this.email !== null || this.emailOnly;
    }),

    willEmail: computed('isScheduled', 'newsletter', 'email', function () {
        return this.isScheduled && !!this.newsletter && !this.email;
    }),

    hasBeenEmailed: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return this.isPost
            && (this.isSent || this.isPublished)
            && this.email?.status !== 'failed'
            && !!this.email;
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return this.isPost
            && (this.isSent || this.isPublished)
            && this.email?.status === 'failed';
    }),

    // ── Analytics Visibility ──────────────────────────────────────────────────

    showAudienceFeedback: computed('sentiment', function () {
        return this.feature.get('audienceFeedback') && this.sentiment !== undefined;
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', function () {
        return this.hasBeenEmailed
            && !this.session.user.isContributor
            && this.settings.membersSignupAccess !== 'none'
            && this.email.trackOpens
            && this.settings.emailTrackOpens;
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return this.hasBeenEmailed
            && !this.session.user.isContributor
            && this.settings.membersSignupAccess !== 'none'
            && (this.isSent || this.isPublished)
            && this.email.trackClicks
            && this.settings.emailTrackClicks;
    }),

    showAttributionAnalytics: computed(
        'isPage', 'emailOnly', 'isPublished',
        'membersUtils.isMembersInviteOnly',
        'settings.membersTrackSources',
        function () {
            return (this.isPage || !this.emailOnly)
                && this.isPublished
                && this.settings.membersTrackSources
                && !this.membersUtils.isMembersInviteOnly
                && !this.session.user.isContributor;
        }
    ),

    hasAnalyticsPage: computed(
        'isPost',
        'showEmailOpenAnalytics',
        'showEmailClickAnalytics',
        'showAttributionAnalytics',
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

    // ── URL / Visibility ──────────────────────────────────────────────────────

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        if (!this.uuid) return '';
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

        const segmentMap = {
            members: 'status:free,status:-free',
            paid: 'status:-free',
        };

        if (segmentMap[this.visibility]) {
            return segmentMap[this.visibility];
        }

        if (this.visibility === 'tiers' && this.tiers) {
            return this.tiers.map(tier => `tier:${tier.slug}`).join(',');
        }

        return this.visibility;
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        if (!this.newsletter) return this.emailSegment;
        return `${this.newsletter.recipientFilter}+(${this.emailSegment})`;
    }),

    // ── Scheduling ────────────────────────────────────────────────────────────

    // Re-evaluates every second while observed
    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        if (!this.isScheduled) return false;

        const now = moment.utc();
        const publishedAtUTC = this.publishedAtUTC || now;

        this.get('clock.second'); // trigger recompute each second
        return publishedAtUTC.diff(now, 'hours', true) < 0;
    }),

    // ── Published-At Blog TZ ──────────────────────────────────────────────────

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return this._getPublishedAtBlogTZ();
        },
        set(_key, value) {
            this._setPublishedAtBlogStrings(value ? moment(value) : null);
            return this._getPublishedAtBlogTZ();
        },
    }),

    _getPublishedAtBlogTZ() {
        const { publishedAtUTC, publishedAtBlogDate, publishedAtBlogTime } = this;
        const blogTimezone = this.settings.timezone;

        if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
            return null;
        }

        if (!publishedAtBlogDate || !publishedAtBlogTime) {
            return moment.tz(publishedAtUTC, blogTimezone);
        }

        const publishedAtBlog = moment.tz(
            `${publishedAtBlogDate} ${publishedAtBlogTime}`,
            blogTimezone
        );

        // Preserve original seconds if the user hasn't changed the time
        // See: https://github.com/TryGhost/Ghost/issues/8603#issuecomment-309538395
        const isSameMinute = publishedAtUTC
            && publishedAtBlog.diff(publishedAtUTC.clone().startOf('minutes')) === 0;

        return isSameMinute ? publishedAtUTC : publishedAtBlog;
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

    // ── Click Rate ────────────────────────────────────────────────────────────

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        const emailCount = this.email?.emailCount;
        const clicks = this.count?.clicks;
        if (!emailCount || !clicks) return 0;
        return Math.round(clicks / emailCount * 100);
    }),

    // ── Methods ───────────────────────────────────────────────────────────────

    /**
     * Removes client-generated tags (id: null) so Ember Data can reconcile
     * them when the server returns them with real IDs.
     * https://github.com/emberjs/data/issues/1829
     */
    updateTags() {
        const clientTags = this.tags.filterBy('id', null);
        this.tags.removeObjects(clientTags);
        clientTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.authors.includes(user);
    },

    /**
     * Custom sort matching server order:
     *   status: scheduled → draft → published
     *   publishedAt: DESC, updatedAt: DESC, id: DESC
     */
    compare(postA, postB) {
        const updated1 = postA.get('updatedAtUTC');
        const updated2 = postB.get('updatedAtUTC');

        // New/unresolved records sort to the top
        if (postA.get('isNew') || !updated1) return -1;
        if (postB.get('isNew') || !updated2) return 1;

        return firstNonZero([
            [statusCompare(postA, postB), false],
            [publishedAtCompare(postA, postB), true],
            [compare(updated1.valueOf(), updated2.valueOf()), true],
            [compare(postA.get('id'), postB.get('id')), true],
        ]);
    },

    /**
     * ValidationEngine hook — called after validation, before save().
     * Converts the blog-timezone date/time strings back to UTC.
     */
    beforeSave() {
        const publishedAtBlogTZ = this.publishedAtBlogTZ;
        this.set('publishedAtUTC', publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null);
    },

    /**
     * Expires the search cache whenever a post is published or unpublished.
     */
    save() {
        const [oldStatus] = this.changedAttributes().status || [];

        return this._super(...arguments).then((res) => {
            if (this.status === STATUS.PUBLISHED || oldStatus === STATUS.PUBLISHED) {
                this.search.expireContent();
            }
            return res;
        });
    },
});
```

## Key Changes

| Area | Before | After |
|---|---|---|
| **Status strings** | Inline `'scheduled'`, `'draft'` etc. | `STATUS` constant object — single source of truth |
| **Null comparisons** | Repeated 3-branch `if (!a && !b)` blocks | `compareNullable()` helper eliminates duplication |
| **`compare()` method** | Nested `if/return` chains | `firstNonZero()` declaratively expresses priority + direction |
| **`statusCompare`** | Verbose boolean checks | Extracted variables `s1Scheduled`/`s2Scheduled` |
| **`visibilitySegment`** | Nested `if/else` | Flat lookup map + early returns |
| **`clickRate`** | Two separate null guards | Optional chaining + single guard |
| **`hasBeenEmailed`** | Redundant `email` dependency | Uses `email.status` dep + optional chaining |
| **`previewUrl`** | Intermediate variables | Inline, single return |
| **`isPublic`** | Ternary returning `true`/`false` | Direct boolean expression |
| **Comments** | Scattered inline | JSDoc on public methods, inline only where non-obvious |