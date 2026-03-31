```javascript
import BulkAddMembersLabelModal from '../components/members/modals/bulk-add-label';
import BulkDeleteMembersModal from '../components/members/modals/bulk-delete';
import BulkRemoveMembersLabelModal from '../components/members/modals/bulk-remove-label';
import BulkUnsubscribeMembersModal from '../components/members/modals/bulk-unsubscribe';
import Controller from '@ember/controller';
import fetch from 'fetch';
import ghostPaths from 'ghost-admin/utils/ghost-paths';
import moment from 'moment-timezone';
import {A} from '@ember/array';
import {action} from '@ember/object';
import {didCancel, task, timeout} from 'ember-concurrency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject} from 'ghost-admin/decorators/inject';
import {resetQueryParams} from 'ghost-admin/helpers/reset-query-params';
import {inject as service} from '@ember/service';
import {tracked} from '@glimmer/tracking';

const PAID_PARAMS = [
    {name: 'All members', value: null},
    {name: 'Free members', value: 'false'},
    {name: 'Paid members', value: 'true'}
];

const STRIPE_FILTER_TYPES = [
    'subscriptions.plan_interval',
    'subscriptions.status',
    'subscriptions.start_date',
    'subscriptions.current_period_end',
    'conversion',
    'offer_redemptions'
];

const BULK_MODAL_CONFIG = {
    addLabel: BulkAddMembersLabelModal,
    removeLabel: BulkRemoveMembersLabelModal,
    unsubscribe: BulkUnsubscribeMembersModal
};

const FILTER_BRACKET_RE = /^\(.*\)$/;
const FILTER_MULTIPLE_GROUPS_RE = /\).*\(/;

export default class MembersController extends Controller {
    @service ajax;
    @service ellaSparse;
    @service feature;
    @service ghostPaths;
    @service membersStats;
    @service modals;
    @service router;
    @service store;
    @service utils;
    @service settings;

    @inject config;

    queryParams = [
        'label',
        {paidParam: 'paid'},
        {searchParam: 'search'},
        {orderParam: 'order'},
        {filterParam: 'filter'},
        {postAnalytics: 'post'}
    ];

    @tracked members = A([]);
    @tracked searchParam = '';
    @tracked searchIsFocused = false;
    @tracked filterParam = null;
    @tracked softFilterParam = null;
    @tracked paidParam = null;
    @tracked label = null;
    @tracked orderParam = null;
    @tracked modalLabel = null;
    @tracked showLabelModal = false;
    @tracked filters = A([]);
    @tracked softFilters = A([]);
    @tracked isExporting = false;
    @tracked _availableLabels = A([]);
    @tracked parseFilterParamCounter = 0;

    /**
     * Flag used to determine if we should return to the analytics page
     */
    @tracked postAnalytics = null;

    paidParams = PAID_PARAMS;

    constructor() {
        super(...arguments);
        this._availableLabels = this.store.peekAll('label');
    }

    // Computed properties -----------------------------------------------------

    get fromAnalytics() {
        return this.postAnalytics ? [this.postAnalytics] : null;
    }

    get listHeader() {
        const {searchParam, selectedLabel, members} = this;

        if (members.loading) {
            return 'Loading...';
        }

        if (searchParam) {
            return 'Search result';
        }

        const count = ghPluralize(members.length, 'member');

        if (selectedLabel?.slug) {
            return `${count} ${members.length > 1 ? 'match' : 'matches'} current filter`;
        }

        return count;
    }

    get hideSearchBar() {
        return !this.members.length && !this.searchParam && !this.searchIsFocused;
    }

    get showingAll() {
        return !this.searchParam && !this.paidParam && !this.label && !this.filterParam && !this.softFilterParam;
    }

    get availableOrders() {
        if (!this.feature.get('emailAnalytics')) {
            return [];
        }

        return [
            {name: 'Newest', value: null},
            {name: 'Open rate', value: 'email_open_rate'}
        ];
    }

    get selectedOrder() {
        return this.availableOrders.find(order => order.value === this.orderParam);
    }

    get availableLabels() {
        const sorted = this._availableLabels
            .filter(label => !label.isNew && label.id !== null)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {ignorePunctuation: true}));

        const options = sorted.toArray();
        options.unshiftObject({name: 'All labels', slug: null});

        return options;
    }

    get selectedLabel() {
        return this.availableLabels.findBy('slug', this.label);
    }

    get labelModalData() {
        return {
            label: this.modalLabel,
            labels: this.availableLabels
        };
    }

    get selectedPaidParam() {
        return this.paidParams.findBy('value', this.paidParam) || {value: '!unknown'};
    }

    get isFiltered() {
        return !!(this.label || this.paidParam || this.searchParam || this.filterParam);
    }

    get availableFilters() {
        return this.softFilters.length ? this.softFilters : this.filters;
    }

    get filterColumns() {
        const columns = this.availableFilters.flatMap((filter) => {
            if (filter.properties?.getColumns) {
                return filter.properties.getColumns(filter).map(c => ({
                    label: filter.properties.columnLabel,
                    ...c,
                    name: filter.type
                }));
            }

            if (filter.properties?.columnLabel) {
                return [{
                    name: filter.type,
                    label: filter.properties.columnLabel,
                    getValue: filter.properties.getColumnValue
                        ? member => filter.properties.getColumnValue(member, filter)
                        : null
                }];
            }

            return [];
        });

        const uniqueColumns = columns.filter((c, i) => columns.findIndex(c2 => c2.label === c.label) === i);
        return uniqueColumns.splice(0, 2);
    }

    /*
     * Due to a limitation with NQL, member bulk deletion is not permitted if any of the following Stripe subscription filters is used:
     *     - Billing period, Stripe subscription status, Paid start date,
     *       Next billing date, Subscription started on post/page, Offers
     *
     * See: https://linear.app/tryghost/issue/ENG-1484
     */
    get isBulkDeletePermitted() {
        if (!this.isFiltered) {
            return false;
        }

        return !this.filters.some(f => STRIPE_FILTER_TYPES.includes(f.type));
    }

    includeTierQuery() {
        const activeFilters = this.filters.length ? this.filters : this.softFilters;
        return activeFilters.some(f => f.type === 'tier');
    }

    getApiQueryObject({params, extraFilters = []} = {}) {
        let {label, paidParam, searchParam, filterParam} = params ?? this;

        if (filterParam && FILTER_BRACKET_RE.test(filterParam) && !FILTER_MULTIPLE_GROUPS_RE.test(filterParam)) {
            filterParam = filterParam.slice(1, -1);
        }

        const filters = [
            ...extraFilters,
            label && `label:'${label}'`,
            paidParam === 'true' && 'status:-free',
            paidParam === 'false' && 'status:free',
            filterParam
        ].filter(Boolean);

        const searchQuery = searchParam ? {search: searchParam} : {};

        return Object.assign({}, {filter: filters.join('+')}, searchQuery);
    }

    // Actions -----------------------------------------------------------------

    @action
    refreshData() {
        try {
            this.fetchMembersTask.perform();
            this.fetchLabelsTask.perform();
        } catch (e) {
            if (!didCancel(e)) {
                throw e;
            }
        }

        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
        this.membersStats.fetchMemberCount();
    }

    @action
    changeOrder(order) {
        this.orderParam = order.value;
    }

    @action
    applyFilter(filterStr, filters) {
        this.softFilters = A([]);
        this.filterParam = filterStr || null;
        this.filters = filters;
    }

    @action
    applyParsedFilter(filters) {
        this.softFilters = A([]);
        this.filters = filters;
    }

    @action
    applySoftFilter(filterStr, filters) {
        this.softFilters = filters;
        this.softFilterParam = filterStr || null;
        const {label, paidParam, searchParam, orderParam} = this;
        this.fetchMembersTask.perform({label, paidParam, searchParam, orderParam, filterParam: filterStr});
    }

    @action
    resetSoftFilter() {
        if (this.softFilters.length > 0 || !!this.softFilterParam) {
            this.softFilters = A([]);
            this.softFilterParam = null;
            this.fetchMembersTask.perform();
        }
    }

    @action
    resetFilter() {
        this.softFilters = A([]);
        this.softFilterParam = null;
        this.filters = A([]);
        this.filterParam = null;
        this.fetchMembersTask.perform();
    }

    @action
    search(e) {
        this.searchTask.perform(e.target.value);
    }

    @action
    async exportData() {
        const exportUrl = ghostPaths().url.api('members/upload');
        const downloadParams = new URLSearchParams(this.getApiQueryObject());
        downloadParams.set('limit', 'all');

        this.isExporting = true;

        try {
            const res = await fetch(`${exportUrl}?${downloadParams.toString()}`, {method: 'GET'});
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const datetime = new Date().toJSON().substring(0, 10);
            const a = Object.assign(document.createElement('a'), {
                href: blobUrl,
                download: `members.${datetime}.csv`
            });

            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(blobUrl);
        } finally {
            this.isExporting = false;
        }
    }

    @action
    changeLabel(label, e) {
        e?.preventDefault();
        e?.stopPropagation();
        this.label = label.slug;
    }

    @action
    editLabel(label, e) {
        e?.preventDefault();
        e?.stopPropagation();
        this.modalLabel = this.availableLabels.findBy('slug', label);
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    toggleLabelModal() {
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    bulkAddLabel() {
        this._openBulkModal(BULK_MODAL_CONFIG.addLabel);
    }

    @action
    bulkRemoveLabel() {
        this._openBulkModal(BULK_MODAL_CONFIG.removeLabel);
    }

    @action
    bulkUnsubscribe() {
        this._openBulkModal(BULK_MODAL_CONFIG.unsubscribe);
    }

    @action
    resetAndReloadMembers() {
        this.store.unloadAll('member');
        this.reload();
    }

    @action
    bulkDelete() {
        this.modals.open(BulkDeleteMembersModal, {
            query: this.getApiQueryObject(),
            onComplete: () => {
                this.store.unloadAll('member');
                this.router.transitionTo('members.index', {
                    queryParams: Object.assign(resetQueryParams('members.index'))
                });
                this.membersStats.invalidate();
                this.membersStats.fetchCounts();
            }
        });
    }

    @action
    changePaidParam(paid) {
        this.paidParam = paid.value;
    }

    // Tasks -------------------------------------------------------------------

    @task({restartable: true})
    *searchTask(query) {
        yield timeout(250);
        this.searchParam = query;
    }

    @task({restartable: true})
    *fetchLabelsTask() {
        yield this.store.query('label', {limit: 'all'});
    }

    @task({restartable: true})
    *fetchMembersTask(params) {
        const {label, paidParam, searchParam, orderParam, filterParam} = params ?? this;
        const startDate = new Date();

        const forceReload = this._hasParamsChanged({label, paidParam, searchParam, orderParam, filterParam}, !params);
        this._updateLastParams({label, paidParam, searchParam, orderParam, filterParam});

        if (!forceReload && this._startDate && !(this._startDate - startDate > 60_000)) {
            return this.members;
        }

        this._startDate = startDate;

        this.members = yield this.ellaSparse.array((range = {}, query = {}) => {
            const searchQuery = this.getApiQueryObject({
                params,
                extraFilters: [`created_at:<='${moment.utc(this._startDate).format('YYYY-MM-DD HH:mm:ss')}'`]
            });

            query = Object.assign({
                include: 'labels,tiers',
                order: orderParam ? `${orderParam} desc` : 'created_at desc',
                limit: range.length,
                page: range.page
            }, searchQuery, query);

            return this.store.query('member', query).then(result => ({
                data: result,
                total: result.meta.pagination.total
            }));
        }, {limit: 50});
    }

    // Internal ----------------------------------------------------------------

    _hasParamsChanged({label, paidParam, searchParam, orderParam, filterParam}, noParams) {
        return noParams
            || label !== this._lastLabel
            || paidParam !== this._lastPaidParam
            || searchParam !== this._lastSearchParam
            || orderParam !== this._lastOrderParam
            || filterParam !== this._lastFilterParam;
    }

    _updateLastParams({label, paidParam, searchParam, orderParam, filterParam}) {
        this._lastLabel = label;
        this._lastPaidParam = paidParam;
        this._lastSearchParam = searchParam;
        this._lastOrderParam = orderParam;
        this._lastFilterParam = filterParam;
    }

    _openBulkModal(ModalComponent) {
        this.modals.open(ModalComponent, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers
        });
    }

    resetFilters(params) {
        if (!params?.filterParam) {
            this.filters = A([]);
            this.softFilterParam = null;
            this.softFilters =