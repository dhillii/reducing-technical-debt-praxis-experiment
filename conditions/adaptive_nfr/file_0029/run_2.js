```javascript
import Component from '@glimmer/component';
import DeletePostModal from '../modals/delete-post';
import PostSuccessModal from '../modal-post-success';
import anime from 'animejs/lib/anime.es.js';
import {action} from '@ember/object';
import {didCancel, task} from 'ember-concurrency';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';
import {tracked} from '@glimmer/tracking';

/**
 * @typedef {import('../../services/dashboard-stats').SourceAttributionCount} SourceAttributionCount
*/

const DISPLAY_OPTIONS = [{
    name: 'Free signups',
    value: 'signups'
}, {
    name: 'Paid conversions',
    value: 'paid'
}];

const ANIMATION_CONFIG = {
    newNumber: {
        translateY: [10, 0],
        opacity: [0, 1],
        easing: 'easeOutElastic',
        elasticity: 650,
        duration: 1000
    },
    oldNumber: {
        translateY: [0, -10],
        opacity: [1, 0],
        easing: 'easeOutExpo',
        duration: 400
    }
};

const SUCCESS_MESSAGE_DURATION = 2000;
const LINK_FILTER_TEMPLATE = 'post_id:\'{{postId}}\'';
const MENTION_QUERY_LIMIT = 5;

export default class Analytics extends Component {
    @service ajax;
    @service ghostPaths;
    @service settings;
    @service membersUtils;
    @service utils;
    @service feature;
    @service store;
    @service router;
    @service modals;
    @service notifications;
    @service session;

    @inject config;

    @tracked sources = null;
    @tracked links = null;
    @tracked mentions = null;
    @tracked sortColumn = 'signups';
    @tracked showSuccess;
    @tracked updateLinkId;
    @tracked _post = null;
    @tracked postCount = null;
    @tracked showPostCount = false;
    @tracked shouldAnimate = false;
    @tracked previousSentCount = this.post.email?.emailCount;
    @tracked previousOpenedCount = this.post.email?.openedCount;
    @tracked previousClickedCount = this.post.count.clicks;
    @tracked previousFeedbackCount = this.totalFeedback;
    @tracked previousConversionsCount = this.post.count.conversions;
    displayOptions = DISPLAY_OPTIONS;

    constructor() {
        super(...arguments);
        this.checkPublishFlowModal();
    }

    get post() {
        return this._post ?? this.args.post;
    }

    set post(value) {
        this._post = value;
    }

    get hasPaidConversionData() {
        return this.sources?.some(sourceData => sourceData.paidConversions > 0) ?? false;
    }

    get hasFreeSignups() {
        return this.sources?.some(sourceData => sourceData.signups > 0) ?? false;
    }

    get allowedDisplayOptions() {
        if (!this.hasPaidConversionData) {
            return this.displayOptions.filter(d => d.value === 'signups');
        }

        if (!this.hasFreeSignups) {
            return this.displayOptions.filter(d => d.value === 'paid');
        }

        return this.displayOptions;
    }

    get isDropdownDisabled() {
        return !this.hasPaidConversionData || !this.hasFreeSignups;
    }

    get selectedDisplayOption() {
        const defaultValue = this.hasPaidConversionData ? 'paid' : 'signups';
        const value = this.hasFreeSignups ? this.sortColumn : defaultValue;
        return this.displayOptions.find(d => d.value === value) ?? this.displayOptions[0];
    }

    get selectedSortColumn() {
        if (!this.hasPaidConversionData) {
            return 'signups';
        }

        if (!this.hasFreeSignups) {
            return 'paid';
        }
        return this.sortColumn;
    }

    get totalFeedback() {
        return (this.post.count?.positive_feedback ?? 0) + (this.post.count?.negative_feedback ?? 0);
    }

    get feedbackChartData() {
        const values = [this.post.count.positive_feedback, this.post.count.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const links = [
            {filterParam: `(feedback.post_id:'${this.post.id}'+feedback.score:1)`},
            {filterParam: `(feedback.post_id:'${this.post.id}'+feedback.score:0)`}
        ];
        const colors = ['#F080B2', '#8452f633'];
        return {values, labels, links, colors};
    }

    get showLinks() {
        return this.post.showEmailClickAnalytics;
    }

    get showSources() {
        return this.post.showAttributionAnalytics;
    }

    get showMentions() {
        return this.feature.get('webmentions');
    }

    get isLoaded() {
        return this.links !== null && this.sources !== null && this.mentions !== null;
    }

    @action
    onDisplayChange(selected) {
        this.sortColumn = selected.value;
    }

    @action
    setSortColumn(column) {
        this.sortColumn = column;
    }

    @action
    updateLink(linkId, linkTo) {
        if (this._updateLinks.isRunning) {
            return this._updateLinks.last;
        }
        return this._updateLinks.perform(linkId, linkTo);
    }

    @action
    loadData() {
        if (this.showSources) {
            this.fetchReferrersStats();
        } else {
            this.sources = [];
        }

        if (this.showLinks) {
            this.fetchLinks();
        } else {
            this.links = [];
        }

        if (this.showMentions) {
            this.fetchMentions();
        } else {
            this.mentions = [];
        }
    }

    @action
    togglePublishFlowModal() {
        this.showPostCount = false;
        this.openPublishFlowModal();
    }

    @action
    confirmDeleteMember() {
        this.modals.open(DeletePostModal, {
            post: this.post
        });
    }

    @action
    applyClasses(element) {
        if (!this.shouldAnimate || !this.hasMetricChanged(element)) {
            return;
        }

        this.animateMetricChange(element);
    }

    openPublishFlowModal() {
        this.modals.open(PostSuccessModal, {
            post: this.post,
            postCount: this.postCount,
            showPostCount: this.showPostCount
        });
    }

    async checkPublishFlowModal() {
        if (localStorage.getItem('ghost-last-published-post')) {
            await this.fetchPostCountTask.perform();
            this.showPostCount = true;
            this.openPublishFlowModal();
            localStorage.removeItem('ghost-last-published-post');
        }
    }

    hasMetricChanged(element) {
        const classChecks = {
            'sent': () => this.post.email?.emailCount !== this.previousSentCount,
            'opened': () => this.post.email?.openedCount !== this.previousOpenedCount,
            'clicked': () => this.post.count.clicks !== this.previousClickedCount,
            'feedback': () => this.totalFeedback !== this.previousFeedbackCount,
            'conversions': () => this.post.count.conversions !== this.previousConversionsCount
        };

        return Array.from(element.classList).some(className => {
            const checker = classChecks[className];
            return checker ? checker() : false;
        });
    }

    animateMetricChange(element) {
        const selector = Array.from(element.classList).map(className => `.${className}`).join('');

        anime({
            targets: `${selector} .new-number span`,
            ...ANIMATION_CONFIG.newNumber,
            delay: (el, i) => 100 + 30 * i
        });

        anime({
            targets: `${selector} .old-number span`,
            ...ANIMATION_CONFIG.oldNumber,
            delay: (el, i) => 100 + 10 * i
        });
    }

    updateLinkData(linksData) {
        const cleanedLinks = linksData.map(link => this.cleanLinkData(link));
        const linksByTitle = this.groupLinksByTitle(cleanedLinks);
        this.links = Object.values(linksByTitle).sort((a, b) => {
            const aClicks = a.count?.clicks || 0;
            const bClicks = b.count?.clicks || 0;
            return bClicks - aClicks;
        });
    }

    cleanLinkData(link) {
        return {
            ...link,
            link: {
                ...link.link,
                originalTo: link.link.to,
                to: this.utils.cleanTrackedUrl(link.link.to, false),
                title: this.utils.cleanTrackedUrl(link.link.to, true)
            }
        };
    }

    groupLinksByTitle(cleanedLinks) {
        return cleanedLinks.reduce((acc, link) => {
            const title = link.link.title;
            if (!acc[title]) {
                acc[title] = link;
            } else {
                const clicks = link.count?.clicks ?? 0;
                acc[title].count = acc[title].count || {clicks: 0};
                acc[title].count.clicks += clicks;
            }
            return acc;
        }, {});
    }

    async fetchReferrersStats() {
        try {
            if (this._fetchReferrersStats.isRunning) {
                return this._fetchReferrersStats.last;
            }
            return this._fetchReferrersStats.perform();
        } catch (e) {
            if (!didCancel(e)) {
                throw e;
            }
        }
    }

    async fetchLinks() {
        try {
            if (this._fetchLinks.isRunning) {
                return this._fetchLinks.last;
            }
            return this._fetchLinks.perform();
        } catch (e) {
            if (!didCancel(e)) {
                throw e;
            }
        }
    }

    async fetchMentions() {
        if (this._fetchMentions.isRunning) {
            return this._fetchMentions.last;
        }
        return this._fetchMentions.perform();
    }

    @task
    *_updateLinks(linkId, newLink) {
        this.updateLinkId = linkId;
        let currentLink;
        this.links = this.links?.map((link) => {
            if (link.link.link_id === linkId) {
                currentLink = new URL(link.link.originalTo);
                return {
                    ...link,
                    link: {
                        ...link.link,
                        to: this.utils.cleanTrackedUrl(newLink, false),
                        title: this.utils.cleanTrackedUrl(newLink, true)
                    }
                };
            }
            return link;
        });

        yield this.updateLinkOnServer(currentLink, newLink);
        yield this.refreshLinksData();
        this.showSuccessMessage();
    }

    *updateLinkOnServer(currentLink, newLink) {
        const filter = `post_id:'${this.post.id}'+to:'${currentLink}'`;
        const bulkUpdateUrl = this.ghostPaths.url.api('links/bulk') + `?filter=${encodeURIComponent(filter)}`;
        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });
    }

    *refreshLinksData() {
        const filter = LINK_FILTER_TEMPLATE.replace('{{postId}}', this.post.id);
        const statsUrl = this.ghostPaths.url.api('links/') + `?filter=${encodeURIComponent(filter)}`;
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    showSuccessMessage() {
        this.showSuccess = this.updateLinkId;
        setTimeout(() => {
            this.showSuccess = null;
        }, SUCCESS_MESSAGE_DURATION);
    }

    @task
    *_fetchReferrersStats() {
        const statsUrl = this.ghostPaths.url.api(`stats/referrers/posts/${this.post.id}`);
        const result = yield this.ajax.request(statsUrl);
        this.sources = result.stats.map((stat) => {
            return {
                source: stat.source ?? 'Direct',
                signups: stat.signups,
                paidConversions: stat.paid_conversions
            };
        });
    }

    @task
    *_fetchLinks() {
        const filter = LINK_FILTER_TEMPLATE.replace('{{postId}}', this.post.id);
        const statsUrl = this.ghostPaths.url.api('links/') + `?filter=${encodeURIComponent(filter)}`;
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    @task
    *_fetchMentions() {
        const filter = `resource_id:'${this.post.id}'+resource_type:post`;
        this.mentions = yield this.store.query('mention', {
            limit: MENTION_QUERY_LIMIT,
            order: 'created_at desc',
            filter
        });
    }

    @task
    *fetchPostCountTask() {
        if (!this.post.emailOnly) {
            const result = yield this.store.query('post', {filter: 'status:published', limit: 1});
            this.postCount = result.meta.pagination.total;
        }
    }

    @task
    *fetchPostTask() {
        const previousMetrics = this.captureCurrentMetrics();
        this.shouldAnimate = true;

        const result = yield this.store.query('post', {
            filter: `id:${this.post.id}`,
            include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment',
            limit: 1
        });
        this.post = result.toArray()[0];

        this.restorePreviousMetrics(previousMetrics);
        yield this.fetchLinks();

        return true;
    }

    captureCurrentMetrics() {
        return {
            sentCount: this.post.email?.emailCount,
            openedCount: this.post.email?.openedCount,
            clickedCount: this.post.count.clicks,
            feedbackCount: this.totalFeedback,
            conversionsCount: this.post.count.conversions
        };
    }

    restorePreviousMetrics(metrics) {
        this.previousSentCount = metrics.sentCount;
        this.previousOpenedCount = metrics.openedCount;
        this.previousClickedCount = metrics.clickedCount;
        this.previousFeedbackCount = metrics.feedbackCount;
        this.previousConversionsCount = metrics.conversionsCount;
    }
}
```