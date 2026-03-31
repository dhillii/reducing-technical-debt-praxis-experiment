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

const DISPLAY_OPTIONS = [
    {name: 'Free signups', value: 'signups'},
    {name: 'Paid conversions', value: 'paid'}
];

const ANIMATION_CONFIG = {
    newNumber: {
        translateY: [10, 0],
        opacity: [0, 1],
        easing: 'easeOutElastic',
        elasticity: 650,
        duration: 1000,
        delayBase: 100,
        delayIncrement: 30
    },
    oldNumber: {
        translateY: [0, -10],
        opacity: [1, 0],
        easing: 'easeOutExpo',
        duration: 400,
        delayBase: 100,
        delayIncrement: 10
    }
};

const SUCCESS_MESSAGE_DURATION = 2000;

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
            return this.filterDisplayOptions('signups');
        }
        if (!this.hasFreeSignups) {
            return this.filterDisplayOptions('paid');
        }
        return this.displayOptions;
    }

    get isDropdownDisabled() {
        return !this.hasPaidConversionData || !this.hasFreeSignups;
    }

    get selectedDisplayOption() {
        const defaultValue = this.getDefaultSortValue();
        return this.displayOptions.find(d => d.value === defaultValue) ?? this.displayOptions[0];
    }

    get selectedSortColumn() {
        return this.getDefaultSortValue();
    }

    get totalFeedback() {
        return (this.post.count?.positive_feedback ?? 0) + (this.post.count?.negative_feedback ?? 0);
    }

    get feedbackChartData() {
        return {
            values: [this.post.count.positive_feedback, this.post.count.negative_feedback],
            labels: ['More like this', 'Less like this'],
            links: [
                {filterParam: `(feedback.post_id:'${this.post.id}'+feedback.score:1)`},
                {filterParam: `(feedback.post_id:'${this.post.id}'+feedback.score:0)`}
            ],
            colors: ['#F080B2', '#8452f633']
        };
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
        if (!this.shouldAnimate || !this.hasChangedMetrics(element)) {
            return;
        }

        this.animateNewNumbers(element);
        this.animateOldNumbers(element);
    }

    filterDisplayOptions(value) {
        return this.displayOptions.filter(d => d.value === value);
    }

    getDefaultSortValue() {
        if (!this.hasPaidConversionData) {
            return 'signups';
        }
        if (!this.hasFreeSignups) {
            return 'paid';
        }
        return this.sortColumn;
    }

    hasChangedMetrics(element) {
        const checks = [
            {class: 'sent', current: this.post.email?.emailCount, previous: this.previousSentCount},
            {class: 'opened', current: this.post.email?.openedCount, previous: this.previousOpenedCount},
            {class: 'clicked', current: this.post.count.clicks, previous: this.previousClickedCount},
            {class: 'feedback', current: this.totalFeedback, previous: this.previousFeedbackCount},
            {class: 'conversions', current: this.post.count.conversions, previous: this.previousConversionsCount}
        ];

        return checks.some(check => 
            element.classList.contains(check.class) && check.current !== check.previous
        );
    }

    animateNewNumbers(element) {
        const selector = this.buildAnimationSelector(element, '.new-number span');
        anime({
            targets: selector,
            translateY: ANIMATION_CONFIG.newNumber.translateY,
            opacity: ANIMATION_CONFIG.newNumber.opacity,
            easing: ANIMATION_CONFIG.newNumber.easing,
            elasticity: ANIMATION_CONFIG.newNumber.elasticity,
            duration: ANIMATION_CONFIG.newNumber.duration,
            delay: (el, i) => ANIMATION_CONFIG.newNumber.delayBase + ANIMATION_CONFIG.newNumber.delayIncrement * i
        });
    }

    animateOldNumbers(element) {
        const selector = this.buildAnimationSelector(element, '.old-number span');
        anime({
            targets: selector,
            translateY: ANIMATION_CONFIG.oldNumber.translateY,
            opacity: ANIMATION_CONFIG.oldNumber.opacity,
            easing: ANIMATION_CONFIG.oldNumber.easing,
            duration: ANIMATION_CONFIG.oldNumber.duration,
            delay: (el, i) => ANIMATION_CONFIG.oldNumber.delayBase + ANIMATION_CONFIG.oldNumber.delayIncrement * i
        });
    }

    buildAnimationSelector(element, suffix) {
        const classNames = Array.from(element.classList)
            .map(className => `.${className}`)
            .join('');
        return `${classNames} ${suffix}`;
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

    updateLinkData(linksData) {
        const cleanedLinks = linksData.map(link => this.cleanLinkData(link));
        const linksByTitle = this.groupLinksByTitle(cleanedLinks);
        this.links = this.sortLinksByClicks(Object.values(linksByTitle));
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
                acc[title].count = acc[title].count || {clicks: 0};
                acc[title].count.clicks += link.count?.clicks ?? 0;
            }
            return acc;
        }, {});
    }

    sortLinksByClicks(links) {
        return links.sort((a, b) => {
            const aClicks = a.count?.clicks || 0;
            const bClicks = b.count?.clicks || 0;
            return bClicks - aClicks;
        });
    }

    async fetchReferrersStats() {
        return this.executeTaskSafely(this._fetchReferrersStats);
    }

    async fetchLinks() {
        return this.executeTaskSafely(this._fetchLinks);
    }

    async fetchMentions() {
        return this.executeTaskSafely(this._fetchMentions);
    }

    executeTaskSafely(task) {
        try {
            if (task.isRunning) {
                return task.last;
            }
            return task.perform();
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
                return this.updateLinkInList(link, newLink);
            }
            return link;
        });

        yield this.updateLinkOnServer(currentLink, newLink);
        yield this.refreshLinksData();
        this.showSuccessMessage();
    }

    updateLinkInList(link, newLink) {
        return {
            ...link,
            link: {
                ...link.link,
                to: this.utils.cleanTrackedUrl(newLink, false),
                title: this.utils.cleanTrackedUrl(newLink, true)
            }
        };
    }

    updateLinkOnServer(currentLink, newLink) {
        const filter = `post_id:'${this.post.id}'+to:'${currentLink}'`;
        const bulkUpdateUrl = this.ghostPaths.url.api('links/bulk') + `?filter=${encodeURIComponent(filter)}`;
        return this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });
    }

    refreshLinksData() {
        const linksFilter = `post_id:'${this.post.id}'`;
        const statsUrl = this.ghostPaths.url.api('links/') + `?filter=${encodeURIComponent(linksFilter)}`;
        return this.ajax.request(statsUrl).then(result => {
            this.updateLinkData(result.links);
        });
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
        this.sources = result.stats.map(stat => ({
            source: stat.source ?? 'Direct',
            signups: stat.signups,
            paidConversions: stat.paid_conversions
        }));
    }

    @task
    *_fetchLinks() {
        const filter = `post_id:'${this.post.id}'`;
        const statsUrl = this.ghostPaths.url.api('links/') + `?filter=${encodeURIComponent(filter)}`;
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    @task
    *_fetchMentions() {
        const filter = `resource_id:'${this.post.id}'+resource_type:post`;
        this.mentions = yield this.store.query('mention', {
            limit: 5,
            order: 'created_at desc',
            filter
        });
    }

    @task
    *fetchPostCountTask() {
        if (!this.post.emailOnly) {
            const result = yield this.store.query('post', {
                filter: 'status:published',
                limit: 1
            });
            this.postCount = result.meta.pagination.total;
        }
    }

    @task
    *fetchPostTask() {
        const currentMetrics = this.captureCurrentMetrics();
        this.shouldAnimate = true;

        const result = yield this.store.query('post', {
            filter: `id:${this.post.id}`,
            include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment',
            limit: 1
        });

        this.post = result.toArray()[0];
        this.updatePreviousMetrics(currentMetrics);
        yield this.fetchLinks();

        return true;
    }

    captureCurrentMetrics() {
        return {
            sentCount: this.post.email?.emailCount,
            openedCount: this.post.email?.openedCount,
            clickedCount: this.post.count.clicks,
            feedbackCount: this