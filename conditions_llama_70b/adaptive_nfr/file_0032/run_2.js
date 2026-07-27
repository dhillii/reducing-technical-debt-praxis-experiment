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

function statusCompare(postA, postB) {
    let status1 = postA.get('status');
    let status2 = postB.get('status');

    if (!status1 && !status2) {
        return 0;
    }

    if (!status1 && status2) {
        return -1;
    }

    if (!status2 && status1) {
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

function publishedAtCompare(postA, postB) {
    let published1 = postA.get('publishedAtUTC');
    let published2 = postB.get('publishedAtUTC');

    if (!published1 && !published2) {
        return 0;
    }

    if (!published1 && published2) {
        return -1;
    }

    if (!published2 && published1) {
        return 1;
    }

    return compare(published1.valueOf(), published2.valueOf());
}

function isPublicVisibility(visibility) {
    return visibility === 'public';
}

function getVisibilitySegment(visibility, isPublic, tiers, settings) {
    if (isPublic) {
        return settings.defaultContentVisibility === 'paid' ? 'status:-free' : 'status:free,status:-free';
    } else {
        switch (visibility) {
            case 'members':
                return 'status:free,status:-free';
            case 'paid':
                return 'status:-free';
            case 'tiers':
                if (tiers) {
                    let filter = tiers.map((tier) => {
                        return `tier:${tier.slug}`;
                    }).join(',');
                    return filter;
                }
                break;
            default:
                return visibility;
        }
    }
}

function hasBeenEmailed(isPost, isSent, isPublished, email) {
    return isPost && (isSent || isPublished) && email && email.status !== 'failed';
}

function didEmailFail(isPost, isSent, isPublished, emailStatus) {
    return isPost && (isSent || isPublished) && emailStatus === 'failed';
}

function showAudienceFeedback(sentiment, feature) {
    return feature.get('audienceFeedback') && sentiment !== undefined;
}

function showEmailOpenAnalytics(hasBeenEmailed, isSent, isPublished, session, settings, email) {
    return hasBeenEmailed && !session.user.isContributor && settings.membersSignupAccess !== 'none' && email.trackOpens && settings.emailTrackOpens;
}

function showEmailClickAnalytics(hasBeenEmailed, isSent, isPublished, email, session, settings) {
    return hasBeenEmailed && !session.user.isContributor && settings.membersSignupAccess !== 'none' && (isSent || isPublished) && email.trackClicks && settings.emailTrackClicks;
}

function showAttributionAnalytics(isPage, emailOnly, isPublished, membersUtils, settings, session) {
    return (isPage || !emailOnly) && isPublished && settings.membersTrackSources && !membersUtils.isMembersInviteOnly && !session.user.isContributor;
}

function showPaidAttributionAnalytics(showAttributionAnalytics, membersUtils) {
    return showAttributionAnalytics && membersUtils.paidMembersEnabled;
}

function hasAnalyticsPage(isPost, showEmailOpenAnalytics, showEmailClickAnalytics, showAttributionAnalytics, session) {
    return isPost && session.user.isAdmin && (showEmailOpenAnalytics || showEmailClickAnalytics || showAttributionAnalytics);
}

function getPreviewUrl(uuid, ghostPaths, config) {
    let blogUrl = config.blogUrl;
    let previewKeyword = 'p';

    if (!uuid) {
        return '';
    }

    return ghostPaths.url.join(blogUrl, previewKeyword, uuid);
}

function isFeedbackEnabledForEmail(email) {
    return email && email.feedbackEnabled;
}

function getFullRecipientFilter(newsletter, emailSegment) {
    if (!newsletter) {
        return emailSegment;
    }

    return `${newsletter.recipientFilter}+(${emailSegment})`;
}

function isPastScheduledTime(isScheduled, publishedAtUTC, clock) {
    if (isScheduled) {
        let now = moment.utc();
        let publishedAtUTCValue = publishedAtUTC || now;
        let pastScheduledTime = publishedAtUTCValue.diff(now, 'hours', true) < 0;

        clock.second;

        return pastScheduledTime;
    } else {
        return false;
    }
}

function getPublishedAtBlogTZ(publishedAtBlogDate, publishedAtBlogTime, settings) {
    let publishedAtUTC = publishedAtUTC;
    let publishedAtBlogDateValue = publishedAtBlogDate;
    let publishedAtBlogTimeValue = publishedAtBlogTime;
    let blogTimezone = settings.timezone;

    if (!publishedAtUTC && isBlank(publishedAtBlogDateValue) && isBlank(publishedAtBlogTimeValue)) {
        return null;
    }

    if (publishedAtBlogDateValue && publishedAtBlogTimeValue) {
        let publishedAtBlog = moment.tz(`${publishedAtBlogDateValue} ${publishedAtBlogTimeValue}`, blogTimezone);

        if (publishedAtUTC && publishedAtBlog.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
            return publishedAtUTC;
        }

        return publishedAtBlog;
    } else {
        return moment.tz(publishedAtUTC, blogTimezone);
    }
}

function setPublishedAtBlogTZ(publishedAtBlogTZ, settings) {
    let publishedAtBlogDate = publishedAtBlogTZ.format('YYYY-MM-DD');
    let publishedAtBlogTime = publishedAtBlogTZ.format('HH:mm');
    let blogTimezone = settings.timezone;

    return moment.tz(`${publishedAtBlogDate} ${publishedAtBlogTime}`, blogTimezone);
}

function getClickRate(email, count) {
    if (!email || !email.emailCount) {
        return 0;
    }

    if (!count || !count.clicks) {
        return 0;
    }

    return Math.round(count.clicks / email.emailCount * 100);
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
        return hasBeenEmailed(this.isPost, this.isSent, this.isPublished, this.email);
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return didEmailFail(this.isPost, this.isSent, this.isPublished, this.email.status);
    }),

    showAudienceFeedback: computed('sentiment', 'feature', function () {
        return showAudienceFeedback(this.sentiment, this.feature);
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'session', 'settings', 'email', function () {
        return showEmailOpenAnalytics(this.hasBeenEmailed, this.isSent, this.isPublished, this.session, this.settings, this.email);
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', 'session', 'settings', function () {
        return showEmailClickAnalytics(this.hasBeenEmailed, this.isSent, this.isPublished, this.email, this.session, this.settings);
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils', 'settings', 'session', function () {
        return showAttributionAnalytics(this.isPage, this.emailOnly, this.isPublished, this.membersUtils, this.settings, this.session);
    }),

    showPaidAttributionAnalytics: computed('showAttributionAnalytics', 'membersUtils', function () {
        return showPaidAttributionAnalytics(this.showAttributionAnalytics, this.membersUtils);
    }),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', 'session', function () {
        return hasAnalyticsPage(this.isPost, this.showEmailOpenAnalytics, this.showEmailClickAnalytics, this.showAttributionAnalytics, this.session);
    }),

    previewUrl: computed('uuid', 'ghostPaths', 'config', function () {
        return getPreviewUrl(this.uuid, this.ghostPaths, this.config);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return isPublicVisibility(this.visibility);
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', 'settings', function () {
        return getVisibilitySegment(this.visibility, this.isPublic, this.tiers, this.settings);
    }),

    fullRecipientFilter: computed('newsletter', 'emailSegment', function () {
        return getFullRecipientFilter(this.newsletter, this.emailSegment);
    }),

    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock', function () {
        return isPastScheduledTime(this.isScheduled, this.publishedAtUTC, this.clock);
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings', {
        get() {
            return getPublishedAtBlogTZ(this.publishedAtBlogDate, this.publishedAtBlogTime, this.settings);
        },
        set(key, value) {
            return setPublishedAtBlogTZ(value, this.settings);
        }
    }),

    clickRate: computed('email', 'count', function () {
        return getClickRate(this.email, this.count);
    }),

    updateTags() {
        let tags = this.tags;
        let oldTags = tags.filterBy('id', null);

        tags.removeObjects(oldTags);
        oldTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.authors.includes(user);
    },

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
        statusResult = statusCompare(postA, postB);
        updatedAtResult = compare(updated1.valueOf(), updated2.valueOf());
        publishedAtResult = publishedAtCompare(postA, postB);

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