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

function isPublished(post) {
    return post.get('status') === 'published';
}

function isDraft(post) {
    return post.get('status') === 'draft';
}

function isScheduled(post) {
    return post.get('status') === 'scheduled';
}

function isSent(post) {
    return post.get('status') === 'sent';
}

function hasEmail(post) {
    return post.get('email') !== null || post.get('emailOnly');
}

function willEmail(post) {
    return post.get('isScheduled') && !!post.get('newsletter') && !post.get('email');
}

function hasBeenEmailed(post) {
    return post.get('isPost')
        && (post.get('isSent') || post.get('isPublished'))
        && post.get('email') && post.get('email.status') !== 'failed';
}

function didEmailFail(post) {
    return post.get('isPost')
        && (post.get('isSent') || post.get('isPublished'))
        && post.get('email') && post.get('email.status') === 'failed';
}

function showAudienceFeedback(post) {
    return post.get('feature').get('audienceFeedback') && post.get('sentiment') !== undefined;
}

function showEmailOpenAnalytics(post) {
    return post.get('hasBeenEmailed')
        && !post.get('session.user.isContributor')
        && post.get('settings.membersSignupAccess') !== 'none'
        && post.get('email.trackOpens')
        && post.get('settings.emailTrackOpens');
}

function showEmailClickAnalytics(post) {
    return post.get('hasBeenEmailed')
        && !post.get('session.user.isContributor')
        && post.get('settings.membersSignupAccess') !== 'none'
        && (post.get('isSent') || post.get('isPublished'))
        && post.get('email.trackClicks')
        && post.get('settings.emailTrackClicks');
}

function showAttributionAnalytics(post) {
    return (post.get('isPage') || !post.get('emailOnly'))
            && post.get('isPublished')
            && post.get('settings.membersTrackSources')
            && !post.get('membersUtils.isMembersInviteOnly')
            && !post.get('session.user.isContributor');
}

function showPaidAttributionAnalytics(post) {
    return post.get('showAttributionAnalytics') && post.get('membersUtils.paidMembersEnabled');
}

function hasAnalyticsPage(post) {
    return post.get('isPost')
        && post.get('session.user.isAdmin')
        && (
            post.get('showEmailOpenAnalytics')
            || post.get('showEmailClickAnalytics')
            || post.get('showAttributionAnalytics')
        );
}

function getPreviewUrl(post) {
    let blogUrl = post.get('config.blogUrl');
    let uuid = post.get('uuid');
    let previewKeyword = 'p';

    if (!uuid) {
        return '';
    }

    return post.get('ghostPaths.url').join(blogUrl, previewKeyword, uuid);
}

function isFeedbackEnabledForEmail(post) {
    return post.get('email.feedbackEnabled');
}

function isPublic(post) {
    return post.get('visibility') === 'public';
}

function getVisibilitySegment(post) {
    if (post.get('isPublic')) {
        return post.get('settings.defaultContentVisibility') === 'paid' ? 'status:-free' : 'status:free,status:-free';
    } else {
        if (post.get('visibility') === 'members') {
            return 'status:free,status:-free';
        }
        if (post.get('visibility') === 'paid') {
            return 'status:-free';
        }
        if (post.get('visibility') === 'tiers' && post.get('tiers')) {
            let filter = post.get('tiers').map((tier) => {
                return `tier:${tier.slug}`;
            }).join(',');
            return filter;
        }
        return post.get('visibility');
    }
}

function getFullRecipientFilter(post) {
    if (!post.get('newsletter')) {
        return post.get('emailSegment');
    }

    return `${post.get('newsletter.recipientFilter')}+(${post.get('emailSegment')})`;
}

function isPastScheduledTime(post) {
    if (post.get('isScheduled')) {
        let now = moment.utc();
        let publishedAtUTC = post.get('publishedAtUTC') || now;
        let pastScheduledTime = publishedAtUTC.diff(now, 'hours', true) < 0;

        post.get('clock.second');

        return pastScheduledTime;
    } else {
        return false;
    }
}

function getPublishedAtBlogTZ(post) {
    let publishedAtUTC = post.get('publishedAtUTC');
    let publishedAtBlogDate = post.get('publishedAtBlogDate');
    let publishedAtBlogTime = post.get('publishedAtBlogTime');
    let blogTimezone = post.get('settings.timezone');

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
        return moment.tz(post.get('publishedAtUTC'), blogTimezone);
    }
}

function setPublishedAtBlogTZ(post, value) {
    let momentValue = value ? moment(value) : null;
    setPublishedAtBlogStrings(post, momentValue);
    return getPublishedAtBlogTZ(post);
}

function setPublishedAtBlogStrings(post, momentDate) {
    if (momentDate) {
        let blogTimezone = post.get('settings.timezone');
        let publishedAtBlog = moment.tz(momentDate, blogTimezone);

        post.set('publishedAtBlogDate', publishedAtBlog.format('YYYY-MM-DD'));
        post.set('publishedAtBlogTime', publishedAtBlog.format('HH:mm'));
    } else {
        post.set('publishedAtBlogDate', '');
        post.set('publishedAtBlogTime', '');
    }
}

function getClickRate(post) {
    if (!post.get('email') || !post.get('email.emailCount')) {
        return 0;
    }
    if (!post.get('count') || !post.get('count.clicks')) {
        return 0;
    }

    return Math.round(post.get('count.clicks') / post.get('email.emailCount') * 100);
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

    isPublished: computed('status', function () {
        return isPublished(this);
    }),
    isDraft: computed('status', function () {
        return isDraft(this);
    }),
    internalTags: filterBy('tags', 'isInternal', true),
    isScheduled: computed('status', function () {
        return isScheduled(this);
    }),
    isSent: computed('status', function () {
        return isSent(this);
    }),

    isPost: equal('displayName', 'post'),
    isPage: equal('displayName', 'page'),

    hasEmail: computed('email', 'emailOnly', function () {
        return hasEmail(this);
    }),
    willEmail: computed('isScheduled', 'newsletter', 'email', function () {
        return willEmail(this);
    }),

    hasBeenEmailed: computed('isPost', 'isSent', 'isPublished', 'email', function () {
        return hasBeenEmailed(this);
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return didEmailFail(this);
    }),

    showAudienceFeedback: computed('sentiment', function () {
        return showAudienceFeedback(this);
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return showEmailOpenAnalytics(this);
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return showEmailClickAnalytics(this);
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return showAttributionAnalytics(this);
    }),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', function () {
        return hasAnalyticsPage(this);
    }),

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        return getPreviewUrl(this);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return isPublic(this);
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return getVisibilitySegment(this);
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        return getFullRecipientFilter(this);
    }),

    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        return isPastScheduledTime(this);
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return getPublishedAtBlogTZ(this);
        },
        set(key, value) {
            return setPublishedAtBlogTZ(this, value);
        }
    }),

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        return getClickRate(this);
    }),

    updateTags() {
        let tags = this.get('tags');
        let oldTags = tags.filterBy('id', null);

        tags.removeObjects(oldTags);
        oldTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.get('authors').includes(user);
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
        let publishedAtBlogTZ = this.get('publishedAtBlogTZ');
        let publishedAtUTC = publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null;
        this.set('publishedAtUTC', publishedAtUTC);
    },

    save() {
        const [oldStatus] = this.changedAttributes().status || [];

        return this._super(...arguments).then((res) => {
            if (this.get('status') === 'published' || oldStatus === 'published') {
                this.get('search').expireContent();
            }

            return res;
        });
    }
});