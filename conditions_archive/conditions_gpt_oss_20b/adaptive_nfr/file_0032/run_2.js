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
 * Compare two posts by status.
 * @private
 */
function compareStatus(postA, postB) {
    const status1 = postA.get('status');
    const status2 = postB.get('status');

    if (!status1 && !status2) { return 0; }
    if (!status1) { return -1; }
    if (!status2) { return 1; }

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
 * @private
 */
function comparePublishedAt(postA, postB) {
    const published1 = postA.get('publishedAtUTC');
    const published2 = postB.get('publishedAtUTC');

    if (!published1 && !published2) { return 0; }
    if (!published1) { return -1; }
    if (!published2) { return 1; }

    return compare(published1.valueOf(), published2.valueOf());
}

/**
 * Compare two posts for sorting.
 * @private
 */
function comparePosts(postA, postB) {
    const updated1 = postA.get('updatedAtUTC');
    const updated2 = postB.get('updatedAtUTC');

    if (postA.get('isNew') || !updated1) { return -1; }
    if (postB.get('isNew') || !updated2) { return 1; }

    const idResult = compare(postA.get('id'), postB.get('id'));
    const statusResult = compareStatus(postA, postB);
    const updatedAtResult = compare(updated1.valueOf(), updated2.valueOf());
    const publishedAtResult = comparePublishedAt(postA, postB);

    if (statusResult !== 0) { return statusResult; }
    if (publishedAtResult !== 0) { return -publishedAtResult; }
    if (updatedAtResult !== 0) { return -updatedAtResult; }

    return -idResult;
}

/**
 * Determine visibility segment string.
 * @private
 */
function getVisibilitySegment(visibility, isPublic, tiers, settings) {
    if (isPublic) {
        return settings.defaultContentVisibility === 'paid'
            ? 'status:-free'
            : 'status:free,status:-free';
    }

    const visibilityMap = {
        members: 'status:free,status:-free',
        paid: 'status:-free'
    };

    if (visibilityMap[visibility]) {
        return visibilityMap[visibility];
    }

    if (visibility === 'tiers' && tiers) {
        return tiers.map(t => `tier:${t.slug}`).join(',');
    }

    return visibility;
}

/**
 * Compute full recipient filter string.
 * @private
 */
function getFullRecipientFilter(newsletter, emailSegment) {
    return newsletter ? `${newsletter.recipientFilter}+(${emailSegment})` : emailSegment;
}

/**
 * Determine if scheduled time has passed.
 * @private
 */
function isPastScheduledTime(isScheduled, publishedAtUTC, clock) {
    if (!isScheduled) { return false; }

    const now = moment.utc();
    const scheduled = publishedAtUTC || now;
    const past = scheduled.diff(now, 'hours', true) < 0;

    // force recompute
    clock.second();

    return past;
}

/**
 * Resolve publishedAtBlogTZ value.
 * @private
 */
function resolvePublishedAtBlogTZ(publishedAtUTC, publishedAtBlogDate, publishedAtBlogTime, settings) {
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
}

/**
 * Set publishedAtBlogDate and publishedAtBlogTime strings.
 * @private
 */
function setPublishedAtBlogStrings(momentDate, settings, set) {
    if (momentDate) {
        const blogTimezone = settings.timezone;
        const blogMoment = moment.tz(momentDate, blogTimezone);

        set('publishedAtBlogDate', blogMoment.format('YYYY-MM-DD'));
        set('publishedAtBlogTime', blogMoment.format('HH:mm'));
    } else {
        set('publishedAtBlogDate', '');
        set('publishedAtBlogTime', '');
    }
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
        const uuid = this.uuid;
        if (!uuid) { return ''; }
        const blogUrl = this.config.blogUrl;
        const previewKeyword = 'p';
        return this.get('ghostPaths.url').join(blogUrl, previewKeyword, uuid);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return this.visibility === 'public';
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return getVisibilitySegment(this.visibility, this.isPublic, this.tiers, this.settings);
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        return getFullRecipientFilter(this.newsletter, this.emailSegment);
    }),

    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        return isPastScheduledTime(this.isScheduled, this.publishedAtUTC, this.clock);
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return resolvePublishedAtBlogTZ(
                this.publishedAtUTC,
                this.publishedAtBlogDate,
                this.publishedAtBlogTime,
                this.settings
            );
        },
        set(key, value) {
            const momentValue = value ? moment(value) : null;
            setPublishedAtBlogStrings(momentValue, this.settings, this.set.bind(this));
            return resolvePublishedAtBlogTZ(
                this.publishedAtUTC,
                this.publishedAtBlogDate,
                this.publishedAtBlogTime,
                this.settings
            );
        }
    }),

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        if (!this.email || !this.email.emailCount) { return 0; }
        if (!this.count || !this.count.clicks) { return 0; }
        return Math.round(this.count.clicks / this.email.emailCount * 100);
    }),

    _getPublishedAtBlogTZ() {
        return resolvePublishedAtBlogTZ(
            this.publishedAtUTC,
            this.publishedAtBlogDate,
            this.publishedAtBlogTime,
            this.settings
        );
    },

    _setPublishedAtBlogTZ: on('init', observer('publishedAtUTC', 'settings.timezone', function () {
        setPublishedAtBlogStrings(this.publishedAtUTC, this.settings, this.set.bind(this));
    })),

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
        const utc = tz ? tz.utc() : null;
        this.set('publishedAtUTC', utc);
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