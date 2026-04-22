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

    @action
    togglePublishFlowModal() {
        this.showPostCount = false;
        this.openPublishFlowModal();
    }

    @action
    confirmDeleteMember() {
        this.modals.open(DeletePostModal, {post: this.post});
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
    /* Display options logic                                                */
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

    _computeAllowedDisplayOptions() {
        if (!this._hasPaidConversionData()) {
            return this.displayOptions.filter(d => d.value === 'signups');
        }
        if (!this._hasFreeSignups()) {
            return this.displayOptions.filter(d => d.value === 'paid');
        }
        return this.displayOptions;
    }

    _computeIsDropdownDisabled() {
        return !(this._hasPaidConversionData() && this._hasFreeSignups());
    }

    _computeSelectedDisplayOption() {
        if (!this._hasPaidConversionData()) {
            return this.displayOptions.find(d => d.value === 'signups');
        }
        if (!this._hasFreeSignups()) {
            return this.displayOptions.find(d => d.value === 'paid');
        }
        return this.displayOptions.find(d => d.value === this.sortColumn) ?? this.displayOptions[0];
    }

    _computeSelectedSortColumn() {
        if (!this._hasPaidConversionData()) {
            return 'signups';
        }
        if (!this._hasFreeSignups()) {
            return 'paid';
        }
        return this.sortColumn;
    }

    _hasPaidConversionData() {
        return this.sources?.some(source => source.paidConversions > 0) ?? false;
    }

    _hasFreeSignups() {
        return this.sources?.some(source => source.signups > 0) ?? false;
    }

    /* --------------------------------------------------------------------- */
    /* Feedback chart data                                                   */
    /* --------------------------------------------------------------------- */

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

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
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

    _loadSourcesIfNeeded() {
        if (this.showSources) {
            this.fetchReferrersStats();
        } else {
            this.sources = [];
        }
    }

    _loadLinksIfNeeded() {
        if (this.showLinks) {
            this.fetchLinks();
        } else {
            this.links = [];
        }
    }

    _loadMentionsIfNeeded() {
        if (this.showMentions) {
            this.fetchMentions();
        } else {
            this.mentions = [];
        }
    }

    @action
    applyClasses(element) {
        if (!this._shouldAnimateElement(element)) {
            return;
        }

        const selector = this._buildSelectorForElement(element);
        this._animateNewNumbers(selector);
        this._animateOldNumbers(selector);
    }

    _shouldAnimateElement(element) {
        if (!this.shouldAnimate) {
            return false;
        }
        const classList = element.classList;
        if (classList.contains('sent') && this.post.email.emailCount === this.previousSentCount) {
            return false;
        }
        if (classList.contains('opened') && this.post.email.openedCount === this.previousOpenedCount) {
            return false;
        }
        if (classList.contains('clicked') && this.post.count.clicks === this.previousClickedCount) {
            return false;
        }
        if (classList.contains('feedback') && this.totalFeedback === this.previousFeedbackCount) {
            return false;
        }
        if (classList.contains('conversions') && this.post.count.conversions === this.previousConversionsCount) {
            return false;
        }
        return true;
    }

    _buildSelectorForElement(element) {
        const classSelector = Array.from(element.classList)
            .map(className => `.${className}`)
            .join('');
        return `${classSelector} .new-number span`;
    }

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
    /* Data fetching tasks                                                   */
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
        const snapshot = {
            sent: this.post.email?.emailCount,
            opened: this.post.email?.openedCount,
            clicked: this.post.count?.clicks,
            feedback: this.totalFeedback,
            conversions: this.post.count?.conversions
        };

        this.shouldAnimate = true;

        const result = yield this.store.query('post', {
            filter: `id:${this.post.id}`,
            include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment',
            limit: 1
        });
        this.post = result.toArray()[0];

        this.previousSentCount = snapshot.sent;
        this.previousOpenedCount = snapshot.opened;
        this.previousClickedCount = snapshot.clicked;
        this.previousFeedbackCount = snapshot.feedback;
        this.previousConversionsCount = snapshot.conversions;

        yield this.fetchLinks();

        return true;
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
    /* Visibility helpers                                                    */
    /* --------------------------------------------------------------------- */

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