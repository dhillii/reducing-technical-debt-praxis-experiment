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
    @tracked previousSentCount = this.post?.email?.emailCount;
    @tracked previousOpenedCount = this.post?.email?.openedCount;
    @tracked previousClickedCount = this.post?.count?.clicks;
    @tracked previousFeedbackCount = this.totalFeedback;
    @tracked previousConversionsCount = this.post?.count?.conversions;

    displayOptions = DISPLAY_OPTIONS;

    constructor() {
        super(...arguments);
        this.checkPublishFlowModal();
    }

    /* --------------------------------------------------------------------- */
    /* Modal handling                                                       */
    /* --------------------------------------------------------------------- */

    openPublishFlowModal() {
        this.modals.open(PostSuccessModal, {
            post: this.post,
            postCount: this.postCount,
            showPostCount: this.showPostCount
        });
    }

    async checkPublishFlowModal() {
        if (!localStorage.getItem('ghost-last-published-post')) {
            return;
        }
        await this.fetchPostCountTask.perform();
        this.showPostCount = true;
        this.openPublishFlowModal();
        localStorage.removeItem('ghost-last-published-post');
    }

    /* --------------------------------------------------------------------- */
    /* Post getter/setter                                                   */
    /* --------------------------------------------------------------------- */

    get post() {
        return this._post ?? this.args.post;
    }

    set post(value) {
        this._post = value;
    }

    /* --------------------------------------------------------------------- */
    /* Display option helpers                                               */
    /* --------------------------------------------------------------------- */

    get allowedDisplayOptions() {
        return this._computeAllowedDisplayOptions();
    }

    get isDropdownDisabled() {
        return this._computeIsDropdownDisabled();
    }

    get selectedDisplayOption() {
        return this._computeSelectedDisplayOption();
    }

    get selectedSortColumn() {
        return this._computeSelectedSortColumn();
    }

    /** @private compute allowed display options based on data availability */
    _computeAllowedDisplayOptions() {
        if (!this._hasPaidConversionData()) {
            return this.displayOptions.filter(d => d.value === 'signups');
        }
        if (!this._hasFreeSignups()) {
            return this.displayOptions.filter(d => d.value === 'paid');
        }
        return this.displayOptions;
    }

    /** @private compute dropdown disabled state */
    _computeIsDropdownDisabled() {
        return !this._hasPaidConversionData() || !this._hasFreeSignups();
    }

    /** @private compute currently selected display option */
    _computeSelectedDisplayOption() {
        if (!this._hasPaidConversionData()) {
            return this.displayOptions.find(d => d.value === 'signups');
        }
        if (!this._hasFreeSignups()) {
            return this.displayOptions.find(d => d.value === 'paid');
        }
        return this.displayOptions.find(d => d.value === this.sortColumn) ?? this.displayOptions[0];
    }

    /** @private compute selected sort column */
    _computeSelectedSortColumn() {
        if (!this._hasPaidConversionData()) {
            return 'signups';
        }
        if (!this._hasFreeSignups()) {
            return 'paid';
        }
        return this.sortColumn;
    }

    /** @private check if any source has paid conversions */
    _hasPaidConversionData() {
        return this.sources?.some(source => source.paidConversions > 0) ?? false;
    }

    /** @private check if any source has free signups */
    _hasFreeSignups() {
        return this.sources?.some(source => source.signups > 0) ?? false;
    }

    /* --------------------------------------------------------------------- */
    /* Feedback chart data                                                   */
    /* --------------------------------------------------------------------- */

    get totalFeedback() {
        return this.post?.count?.positive_feedback + this.post?.count?.negative_feedback;
    }

    get feedbackChartData() {
        return this._buildFeedbackChartData();
    }

    /** @private build chart data for feedback modal */
    _buildFeedbackChartData() {
        const values = [this.post?.count?.positive_feedback, this.post?.count?.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const postId = this.post?.id ?? '';
        const links = [
            {filterParam: `(feedback.post_id:'${postId}'+feedback.score:1)`},
            {filterParam: `(feedback.post_id:'${postId}'+feedback.score:0)`}
        ];
        const colors = ['#F080B2', '#8452f633'];
        return {values, labels, links, colors};
    }

    /* --------------------------------------------------------------------- */
    /* UI actions                                                            */
    /* --------------------------------------------------------------------- */

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
        this._loadSourcesIfNeeded();
        this._loadLinksIfNeeded();
        this._loadMentionsIfNeeded();
    }

    @action
    togglePublishFlowModal() {
        this.showPostCount = false;
        this.openPublishFlowModal();
    }

    @action
    confirmDeleteMember() {
        this.modals.open(DeletePostModal, {post: this.post});
    }

    /** @private load sources when required */
    _loadSourcesIfNeeded() {
        if (this.showSources) {
            this.fetchReferrersStats();
        } else {
            this.sources = [];
        }
    }

    /** @private load links when required */
    _loadLinksIfNeeded() {
        if (this.showLinks) {
            this.fetchLinks();
        } else {
            this.links = [];
        }
    }

    /** @private load mentions when required */
    _loadMentionsIfNeeded() {
        if (this.showMentions) {
            this.fetchMentions();
        } else {
            this.mentions = [];
        }
    }

    /* --------------------------------------------------------------------- */
    /* Link data processing                                                  */
    /* --------------------------------------------------------------------- */

    updateLinkData(linksData) {
        const cleanedLinks = linksData.map(link => ({
            ...link,
            link: {
                ...link.link,
                originalTo: link.link.to,
                to: this.utils.cleanTrackedUrl(link.link.to, false),
                title: this.utils.cleanTrackedUrl(link.link.to, true)
            }
        }));

        const aggregated = cleanedLinks.reduce((acc, link) => {
            const title = link.link.title;
            if (!acc[title]) {
                acc[title] = link;
                return acc;
            }
            acc[title].count = acc[title].count ?? {clicks: 0};
            acc[title].count.clicks += link.count?.clicks ?? 0;
            return acc;
        }, {});

        this.links = Object.values(aggregated).sort((a, b) => {
            const aClicks = a.count?.clicks || 0;
            const bClicks = b.count?.clicks || 0;
            return bClicks - aClicks;
        });
    }

    /* --------------------------------------------------------------------- */
    /* Data fetching helpers                                                 */
    /* --------------------------------------------------------------------- */

    async fetchReferrersStats() {
        if (this._fetchReferrersStats.isRunning) {
            return this._fetchReferrersStats.last;
        }
        return this._fetchReferrersStats.perform();
    }

    async fetchLinks() {
        if (this._fetchLinks.isRunning) {
            return this._fetchLinks.last;
        }
        return this._fetchLinks.perform();
    }

    async fetchMentions() {
        if (this._fetchMentions.isRunning) {
            return this._fetchMentions.last;
        }
        return this._fetchMentions.perform();
    }

    /* --------------------------------------------------------------------- */
    /* Tasks                                                                  */
    /* --------------------------------------------------------------------- */

    @task
    *_updateLinks(linkId, newLink) {
        this.updateLinkId = linkId;
        let currentLink;

        this.links = this.links?.map(link => {
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
        const bulkUpdateUrl = `${this.ghostPaths.url.api('links/bulk')}?filter=${encodeURIComponent(filter)}`;

        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        // Refresh links data
        const linksFilter = `post_id:'${this.post.id}'`;
        const statsUrl = `${this.ghostPaths.url.api('links/')}?filter=${encodeURIComponent(linksFilter)}`;
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
        this.showSuccess = this.updateLinkId;
        setTimeout(() => (this.showSuccess = null), 2000);
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
        const statsUrl = `${this.ghostPaths.url.api('links/')}?filter=${encodeURIComponent(filter)}`;
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
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
        const prevSent = this.post?.email?.emailCount;
        const prevOpened = this.post?.email?.openedCount;
        const prevClicked = this.post?.count?.clicks;
        const prevFeedback = this.totalFeedback;
        const prevConversions = this.post?.count?.conversions;

        this.shouldAnimate = true;

        const result = yield this.store.query('post', {
            filter: `id:${this.post.id}`,
            include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment',
            limit: 1
        });
        this.post = result.toArray()[0];

        this.previousSentCount = prevSent;
        this.previousOpenedCount = prevOpened;
        this.previousClickedCount = prevClicked;
        this.previousFeedbackCount = prevFeedback;
        this.previousConversionsCount = prevConversions;

        yield this.fetchLinks();

        return true;
    }

    /* --------------------------------------------------------------------- */
    /* Animation handling                                                    */
    /* --------------------------------------------------------------------- */

    @action
    applyClasses(element) {
        if (this._shouldSkipAnimation(element)) {
            return;
        }

        const selector = this._buildElementSelector(element);
        this._animateNewNumbers(selector);
        this._animateOldNumbers(selector);
    }

    /** @private determine if animation should be skipped */
    _shouldSkipAnimation(element) {
        if (!this.shouldAnimate) {
            return true;
        }
        const classList = element.classList;
        if (classList.contains('sent') && this.post.email.emailCount === this.previousSentCount) {
            return true;
        }
        if (classList.contains('opened') && this.post.email.openedCount === this.previousOpenedCount) {
            return true;
        }
        if (classList.contains('clicked') && this.post.count.clicks === this.previousClickedCount) {
            return true;
        }
        if (classList.contains('feedback') && this.totalFeedback === this.previousFeedbackCount) {
            return true;
        }
        if (classList.contains('conversions') && this.post.count.conversions === this.previousConversionsCount) {
            return true;
        }
        return false;
    }

    /** @private build a CSS selector string for the element's classes */
    _buildElementSelector(element) {
        const classSelector = Array.from(element.classList)
            .map(cls => `.${cls}`)
            .join('');
        return `${classSelector} .new-number span`;
    }

    /** @private animate the appearance of new numbers */
    _animateNewNumbers(selector) {
        anime({
            targets: selector,
            translateY: [10, 0],
            opacity: [0, 1],
            easing: 'easeOutElastic',
            elasticity: 650,
            duration: 1000,
            delay: (el, i) => 100 + 30 * i
        });
    }

    /** @private animate the disappearance of old numbers */
    _animateOldNumbers(selector) {
        const oldSelector = selector.replace('.new-number', '.old-number');
        anime({
            targets: oldSelector,
            translateY: [0, -10],
            opacity: [1, 0],
            easing: 'easeOutExpo',
            duration: 400,
            delay: (el, i) => 100 + 10 * i
        });
    }

    /* --------------------------------------------------------------------- */
    /* Computed visibility helpers                                           */
    /* --------------------------------------------------------------------- */

    get showLinks() {
        return this.post?.showEmailClickAnalytics ?? false;
    }

    get showSources() {
        return this.post?.showAttributionAnalytics ?? false;
    }

    get showMentions() {
        return this.feature.get('webmentions');
    }

    get isLoaded() {
        return this.links !== null && this.sources !== null && this.mentions !== null;
    }
}