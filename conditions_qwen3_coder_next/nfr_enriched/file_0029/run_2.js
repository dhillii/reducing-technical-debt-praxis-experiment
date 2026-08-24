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

    openPublishFlowModal() {
        this.modals.open(PostSuccessModal, {
            post: this.post,
            postCount: this.postCount,
            showPostCount: this.showPostCount
        });
    }

    checkPublishFlowModal() {
        const lastPublishedPost = localStorage.getItem('ghost-last-published-post');
        if (!lastPublishedPost) {
            return;
        }

        this.fetchPostCountTask.perform();
        this.showPostCount = true;
        this.openPublishFlowModal();
        localStorage.removeItem('ghost-last-published-post');
    }

    get post() {
        return this._post ?? this.args.post;
    }

    set post(value) {
        this._post = value;
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
        if (!this.hasPaidConversionData) {
            return this.displayOptions.find(d => d.value === 'signups');
        }

        if (!this.hasFreeSignups) {
            return this.displayOptions.find(d => d.value === 'paid');
        }

        return this.displayOptions.find(d => d.value === this.sortColumn) ?? this.displayOptions[0];
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

    get hasPaidConversionData() {
        return this.sources.some(sourceData => sourceData.paidConversions > 0);
    }

    get hasFreeSignups() {
        return this.sources.some(sourceData => sourceData.signups > 0);
    }

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    get feedbackChartData() {
        const values = [this.post.count.positive_feedback, this.post.count.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const links = this.feedbackLinkConfigs;
        const colors = ['#F080B2', '#8452f633'];
        return {values, labels, links, colors};
    }

    get feedbackLinkConfigs() {
        return [
            {filterParam: `(feedback.post_id:'${this.post.id}'+feedback.score:1)`},
            {filterParam: `(feedback.post_id:'${this.post.id}'+feedback.score:0)`}
        ];
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
        this.sources = this.showSources ? this.sources : [];
        this.links = this.showLinks ? this.links : [];
        this.mentions = this.showMentions ? this.mentions : [];
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

    updateLinkData(linksData) {
        const cleanedLinks = this.mapLinksToCleanFormat(linksData);
        const groupedLinks = this.groupLinksByTitle(cleanedLinks);

        this.links = this.sortLinksByClicks(Object.values(groupedLinks));
    }

    mapLinksToCleanFormat(linksData) {
        return linksData.map((link) => {
            return {
                ...link,
                link: {
                    ...link.link,
                    originalTo: link.link.to,
                    to: this.utils.cleanTrackedUrl(link.link.to, false),
                    title: this.utils.cleanTrackedUrl(link.link.to, true)
                }
            };
        });
    }

    groupLinksByTitle(links) {
        return links.reduce((acc, link) => {
            const title = link.link.title;
            if (!acc[title]) {
                acc[title] = link;
            } else if (!acc[title].count) {
                acc[title].count = {clicks: 0};
            } else if (!acc[title].count.clicks) {
                acc[title].count.clicks = 0;
            }

            acc[title].count.clicks += (link.count?.clicks ?? 0);
            return acc;
        }, {});
    }

    sortLinksByClicks(links) {
        const getClicks = (link) => link.count?.clicks ?? 0;
        return links.sort((a, b) => getClicks(b) - getClicks(a));
    }

    async fetchReferrersStats() {
        try {
            if (this._fetchReferrersStats.isRunning) {
                return this._fetchReferrersStats.last;
            }
            return this._fetchReferrersStats.perform();
        } catch (e) {
            if (didCancel(e)) {
                return;
            }
            throw e;
        }
    }

    async fetchLinks() {
        try {
            if (this._fetchLinks.isRunning) {
                return this._fetchLinks.last;
            }
            return this._fetchLinks.perform();
        } catch (e) {
            if (didCancel(e)) {
                return;
            }
            throw e;
        }
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

        const filter = `post_id:'${this.post.id}'+to:'${currentLink}'`;
        const bulkUpdateUrl = this.buildBulkUpdateUrl(filter);
        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        yield this.refreshAndLoadLinks();
        this.showSuccess = this.updateLinkId;

        setTimeout(() => {
            this.showSuccess = null;
        }, 2000);
    }

    buildBulkUpdateUrl(filter) {
        const filterParam = encodeURIComponent(filter);
        return `${this.ghostPaths.url.api('links/bulk')}?filter=${filterParam}`;
    }

    *refreshAndLoadLinks() {
        const filter = `post_id:'${this.post.id}'`;
        const statsUrl = `${this.ghostPaths.url.api('links/')}?filter=${encodeURIComponent(filter)}`;
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    @task
    *_fetchReferrersStats() {
        const statsUrl = `${this.ghostPaths.url.api(`stats/referrers/posts/${this.post.id}`)}`;
        const result = yield this.ajax.request(statsUrl);

        this.sources = result.stats.map((stat) => ({
            source: stat.source ?? 'Direct',
            signups: stat.signups,
            paidConversions: stat.paid_conversions
        }));
    }

    @task
    *_fetchLinks() {
        const filter = `post_id:'${this.post.id}'`;
        const statsUrl = `${this.ghostPaths.url.api('links/')}`;
        const url = `${statsUrl}?filter=${encodeURIComponent(filter)}`;
        const result = yield this.ajax.request(url);

        this.updateLinkData(result.links);
    }

    async fetchMentions() {
        if (this._fetchMentions.isRunning) {
            return this._fetchMentions.last;
        }
        return this._fetchMentions.perform();
    }

    @task
    *_fetchMentions() {
        const filter = `resource_id:'${this.post.id}'+resource_type:post`;
        this.mentions = yield this.store.query('mention', {limit: 5, order: 'created_at desc', filter});
    }

    @task
    *fetchPostCountTask() {
        if (this.post.emailOnly) {
            return;
        }

        const result = yield this.store.query('post', {filter: 'status:published', limit: 1});
        this.postCount = result.meta.pagination.total;
    }

    @task
    *fetchPostTask() {
        const currentSentCount = this.post.email?.emailCount;
        const currentOpenedCount = this.post.email?.openedCount;
        const currentClickedCount = this.post.count.clicks;
        const currentFeedbackCount = this.totalFeedback;
        const currentConversionsCount = this.post.count.conversions;

        this.shouldAnimate = true;

        const result = yield this.store.query('post', {
            filter: `id:${this.post.id}`,
            include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment',
            limit: 1
        });

        this.post = result.toArray()[0];

        this.previousSentCount = currentSentCount;
        this.previousOpenedCount = currentOpenedCount;
        this.previousClickedCount = currentClickedCount;
        this.previousFeedbackCount = currentFeedbackCount;
        this.previousConversionsCount = currentConversionsCount;

        yield this.fetchLinks();
    }

    @action
    applyClasses(element) {
        if (!this.shouldAnimate || this.isAnimationSkipped(element)) {
            return;
        }

        this.animateNumericChange(element, 'new-number', [10, 0], 'easeOutElastic', 650, 1000, 30);
        this.animateNumericChange(element, 'old-number', [0, -10], 'easeOutExpo', 0, 400, 10);
    }

    isAnimationSkipped(element) {
        const {post} = this;
        const clas = element.classList;

        return (
            post.email.emailCount === this.previousSentCount && clas.contains('sent') ||
            post.email.openedCount === this.previousOpenedCount && clas.contains('opened') ||
            post.count.clicks === this.previousClickedCount && clas.contains('clicked') ||
            this.totalFeedback === this.previousFeedbackCount && clas.contains('feedback') ||
            post.count.conversions === this.previousConversionsCount && clas.contains('conversions')
        );
    }

    animateNumericChange(element, targetClass, translateY, easing, elasticity, duration, delayStep) {
        const classSelector = Array.from(element.classList)
            .map(className => `.${className}`)
            .join('');
        const selector = `${classSelector} .${targetClass} span`;

        anime({
            targets: selector,
            translateY,
            easing,
            elasticity,
            duration,
            delay: (el, i) => 100 + delayStep * i
        });
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
}