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

const AVAILABLE_ORDERS = [
    {name: 'Newest', value: null},
    {name: 'Open rate', value: 'email_open_rate'}
];

const STRIPE_FILTER_TYPES = [
    'subscriptions.plan_interval',
    'subscriptions.status',
    'subscriptions.start_date',
    'subscriptions.current_period_end',
    'conversion',
    'offer_redemptions'
];

const BRACKETS_SURROUNDED_RE = /^\(.*\)$/;
const MULTIPLE_GROUPS_RE = /\).*\(/;
const MAX_FILTER_COLUMNS = 2;
const FETCH_CACHE_DURATION = 60 * 1000; // 1 minute
const SEARCH_DEBOUNCE_MS = 250;
const MEMBERS_PER_PAGE = 50;

class FilterManager {
    constructor(filters = A([]), softFilters = A([])) {
        this.filters = filters;
        this.softFilters = softFilters;
    }

    get availableFilters() {
        return this.softFilters.length ? this.softFilters : this.filters;
    }

    get isFiltered() {
        return this.filters.length > 0;
    }

    getFilterColumns() {
        const columns = this.availableFilters.flatMap((filter) => {
            return this._extractFilterColumns(filter);
        });

        return this._deduplicateAndLimitColumns(columns);
    }

    _extractFilterColumns(filter) {
        if (filter.properties?.getColumns) {
            return filter.properties.getColumns(filter).map((c) => ({
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
                    ? (member => filter.properties.getColumnValue(member, filter))
                    : null
            }];
        }

        return [];
    }

    _deduplicateAndLimitColumns(columns) {
        const uniqueColumns = columns.filter((c, i) => {
            return columns.findIndex(c2 => c2.label === c.label) === i;
        });
        return uniqueColumns.splice(0, MAX_FILTER_COLUMNS);
    }

    reset() {
        this.filters = A([]);
        this.softFilters = A([]);
    }

    applySoft(filters, filterStr) {
        this.softFilters = filters;
        return filterStr || null;
    }

    apply(filters, filterStr) {
        this.softFilters = A([]);
        this.filters = filters;
        return filterStr || null;
    }

    hasSoftFilters() {
        return this.softFilters.length > 0;
    }

    containsStripeFilters() {
        return this.filters.some(f => STRIPE_FILTER_TYPES.includes(f.type));
    }

    includesTierQuery() {
        return this.availableFilters.some(f => f.type === 'tier');
    }
}

class QueryBuilder {
    constructor(label, paidParam, searchParam, filterParam) {
        this.label = label;
        this.paidParam = paidParam;
        this.searchParam = searchParam;
        this.filterParam = filterParam;
    }

    build(extraFilters = []) {
        let filters = [...extraFilters];
        let filterParam = this._normalizeFilterParam(this.filterParam);

        if (this.label) {
            filters.push(`label:'${this.label}'`);
        }

        if (this.paidParam !== null) {
            filters.push(this.paidParam === 'true' ? 'status:-free' : 'status:free');
        }

        if (filterParam) {
            filters.push(filterParam);
        }

        const query = {filter: filters.join('+')};

        if (this.searchParam) {
            query.search = this.searchParam;
        }

        return query;
    }

    _normalizeFilterParam(filterParam) {
        if (!filterParam) {
            return null;
        }

        if (BRACKETS_SURROUNDED_RE.test(filterParam) && !MULTIPLE_GROUPS_RE.test(filterParam)) {
            return filterParam.slice(1, -1);
        }

        return filterParam;
    }
}

class ExportService {
    constructor(getApiQueryObject) {
        this.getApiQueryObject = getApiQueryObject;
    }

    async export() {
        const exportUrl = ghostPaths().url.api('members/upload');
        const downloadParams = new URLSearchParams(this.getApiQueryObject());
        downloadParams.set('limit', 'all');
        const url = `${exportUrl}?${downloadParams.toString()}`;

        const blob = await fetch(url, {method: 'GET'}).then(res => res.blob());
        this._downloadBlob(blob);
    }

    _downloadBlob(blob) {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        const datetime = new Date().toJSON().substring(0, 10);

        link.href = blobUrl;
        link.download = `members.${datetime}.csv`;
        document.body.appendChild(link);
        link.click();

        link.remove();
        URL.revokeObjectURL(blobUrl);
    }
}

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
    @tracked postAnalytics = null;

    paidParams = PAID_PARAMS;

    constructor() {
        super(...arguments);
        this._availableLabels = this.store.peekAll('label');
        this._filterManager = new FilterManager(this.filters, this.softFilters);
        this._exportService = new ExportService(() => this.getApiQueryObject());
    }

    // Computed properties

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
            return members.length > 1
                ? `${count} match current filter`
                : `${count} matches current filter`;
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
        return this.feature.get('emailAnalytics') ? AVAILABLE_ORDERS : [];
    }

    get selectedOrder() {
        return this.availableOrders.find(order => order.value === this.orderParam);
    }

    get availableLabels() {
        const labels = this._availableLabels
            .filter(label => !label.isNew && label.id !== null)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {ignorePunctuation: true}));

        const options = labels.toArray();
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
        return this._filterManager.getFilterColumns();
    }

    get isBulkDeletePermitted() {
        return this.isFiltered && !this._filterManager.containsStripeFilters();
    }

    get fromAnalytics() {
        return this.postAnalytics ? [this.postAnalytics] : null;
    }

    // Actions

    @action
    refreshData() {
        try {
            this.fetchMembersTask.perform();
            this.fetchLabelsTask.perform();
        } catch (e) {
            if (didCancel(e)) {
                return;
            }
            throw e;
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
        if (this.softFilters.length > 0 || this.softFilterParam) {
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
        this.isExporting = true;
        try {
            await this._exportService.export();
        } catch (error) {
            // Handle error silently or show notification
        } finally {
            this.isExporting = false;
        }
    }

    @action
    changeLabel(label, e) {
        this._preventDefault(e);
        this.label = label.slug;
    }

    @action
    editLabel(label, e) {
        this._preventDefault(e);
        const modalLabel = this.availableLabels.findBy('slug', label);
        this.modalLabel = modalLabel;
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    toggleLabelModal() {
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    bulkAddLabel() {
        this.modals.open(BulkAddMembersLabelModal, {
            query: this.getApiQueryObject(),
            onComplete: () => this.resetAndReloadMembers()
        });
    }

    @action
    bulkRemoveLabel() {
        this.modals.open(BulkRemoveMembersLabelModal, {
            query: this.getApiQueryObject(),
            onComplete: () => this.resetAndReloadMembers()
        });
    }

    @action
    bulkUnsubscribe() {
        this.modals.open(BulkUnsubscribeMembersModal, {
            query: this.getApiQueryObject(),
            onComplete: () => this.resetAndReloadMembers()
        });
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
            onComplete: () => this._handleBulkDeleteComplete()
        });
    }

    @action
    changePaidParam(paid) {
        this.paidParam = paid.value;
    }

    // Tasks

    @task({restartable: true})
    *searchTask(query) {
        yield timeout(SEARCH_DEBOUNCE_MS);
        this.searchParam = query;
    }

    @task({restartable: true})
    *fetchLabelsTask() {
        yield this.store.query('label', {limit: 'all'});
    }

    @task({restartable: true})
    *fetchMembersTask(params) {
        const {label, paidParam, searchParam, orderParam, filterParam} = this._extractParams(params);
        const startDate = new Date();
        const forceReload = this._shouldForceReload(params, label, paidParam, searchParam, orderParam, filterParam);

        this._updateLastParams(label, paidParam, searchParam, orderParam, filterParam);

        if (!forceReload && this._isCacheValid(startDate)) {
            return this.members;
        }

        this._startDate = startDate;

        this.members = yield