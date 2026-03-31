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

const AVAILABLE_ORDERS = [
    {name: 'Newest', value: null},
    {name: 'Open rate', value: 'email_open_rate'}
];

const BRACKETS_SURROUNDED_RE = /^\(.*\)$/;
const MULTIPLE_GROUPS_RE = /\).*\(/;

const MAX_FILTER_COLUMNS = 2;
const CACHE_DURATION_MS = 60 * 1000;
const SEARCH_DEBOUNCE_MS = 250;
const FETCH_LIMIT = 50;

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
    }

    // Computed properties

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
            .sort((labelA, labelB) => 
                labelA.name.localeCompare(labelB.name, undefined, {ignorePunctuation: true})
            )
            .toArray();

        labels.unshiftObject({name: 'All labels', slug: null});
        return labels;
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
        const columns = this.availableFilters.flatMap(filter => this._getFilterColumns(filter));
        const uniqueColumns = this._deduplicateColumns(columns);
        return uniqueColumns.slice(0, MAX_FILTER_COLUMNS);
    }

    get isBulkDeletePermitted() {
        if (!this.isFiltered) {
            return false;
        }

        const hasStripeFilters = this.filters.some(f => STRIPE_FILTER_TYPES.includes(f.type));
        return !hasStripeFilters;
    }

    // Helper methods

    _getFilterColumns(filter) {
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
                    ? (member => filter.properties.getColumnValue(member, filter))
                    : null
            }];
        }

        return [];
    }

    _deduplicateColumns(columns) {
        return columns.filter((c, i) => columns.findIndex(c2 => c2.label === c.label) === i);
    }

    _cleanupFilterParam(filterParam) {
        if (!filterParam) {
            return filterParam;
        }

        if (BRACKETS_SURROUNDED_RE.test(filterParam) && !MULTIPLE_GROUPS_RE.test(filterParam)) {
            return filterParam.slice(1, -1);
        }

        return filterParam;
    }

    _buildFilters(label, paidParam, filterParam, extraFilters = []) {
        const filters = [...extraFilters];

        if (label) {
            filters.push(`label:'${label}'`);
        }

        if (paidParam !== null) {
            filters.push(paidParam === 'true' ? 'status:-free' : 'status:free');
        }

        if (filterParam) {
            filters.push(filterParam);
        }

        return filters;
    }

    _shouldForceReload(params) {
        if (!params) {
            return true;
        }

        const {label, paidParam, searchParam, orderParam, filterParam} = params;

        return label !== this._lastLabel
            || paidParam !== this._lastPaidParam
            || searchParam !== this._lastSearchParam
            || orderParam !== this._lastOrderParam
            || filterParam !== this._lastFilterParam;
    }

    _isCacheValid() {
        return this._startDate && (Date.now() - this._startDate) < CACHE_DURATION_MS;
    }

    _updateLastParams(label, paidParam, searchParam, orderParam, filterParam) {
        this._lastLabel = label;
        this._lastPaidParam = paidParam;
        this._lastSearchParam = searchParam;
        this._lastOrderParam = orderParam;
        this._lastFilterParam = filterParam;
    }

    includeTierQuery() {
        const availableFilters = this.filters.length ? this.filters : this.softFilters;
        return availableFilters.some(f => f.type === 'tier');
    }

    getApiQueryObject({params, extraFilters = []} = {}) {
        const {label, paidParam, searchParam, filterParam: rawFilterParam} = params || this;
        const filterParam = this._cleanupFilterParam(rawFilterParam);
        const filters = this._buildFilters(label, paidParam, filterParam, extraFilters);
        const searchQuery = searchParam ? {search: searchParam} : {};

        return Object.assign({filter: filters.join('+')}, searchQuery);
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
    exportData() {
        const exportUrl = ghostPaths().url.api('members/upload');
        const downloadParams = new URLSearchParams(this.getApiQueryObject());
        downloadParams.set('limit', 'all');
        const url = `${exportUrl}?${downloadParams.toString()}`;

        this.isExporting = true;

        fetch(url, {method: 'GET'})
            .then(res => res.blob())
            .then(blob => this._downloadBlob(blob))
            .catch(() => {
                // Handle errors silently
            })
            .finally(() => {
                this.isExporting = false;
            });
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

    _preventDefault(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
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

    _handleBulkDeleteComplete() {
        this.store.unloadAll('member');
        this.router.transitionTo('members.index', {
            queryParams: resetQueryParams('members.index')
        });
        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
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
        const {label, paidParam, searchParam, orderParam, filterParam} = params || this;
        const startDate = new Date();
        const forceReload = this._shouldForceReload(params);

        this._updateLastParams(label, paidParam, searchParam, orderParam, filterParam);

        if (!forceReload && this._isCacheValid()) {
            return this.members;
        }

        this._startDate = startDate;

        this.members = yield this.ellaSparse.array((range = {}, query = {})