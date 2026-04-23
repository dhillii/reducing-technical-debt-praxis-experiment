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

    get fromAnalytics() {
        return this.postAnalytics ? [this.postAnalytics] : null;
    }

    paidParams = PAID_PARAMS;

    constructor() {
        super(...arguments);
        this._availableLabels = this.store.peekAll('label');
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
        if (selectedLabel && selectedLabel.slug) {
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
        if (this.feature.get('emailAnalytics')) {
            return [
                {name: 'Newest', value: null},
                {name: 'Open rate', value: 'email_open_rate'}
            ];
        }
        return [];
    }

    get selectedOrder() {
        return this.availableOrders.find(order => order.value === this.orderParam);
    }

    get availableLabels() {
        const labels = this._availableLabels
            .filter(label => !label.isNew)
            .filter(label => label.id !== null)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {ignorePunctuation: true}));
        const options = labels.toArray();
        options.unshiftObject({name: 'All labels', slug: null});
        return options;
    }

    get selectedLabel() {
        const {label, availableLabels} = this;
        return availableLabels.findBy('slug', label);
    }

    get labelModalData() {
        const label = this.modalLabel;
        const labels = this.availableLabels;
        return {label, labels};
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
        const columns = this.availableFilters.flatMap(filter => {
            if (filter.properties?.getColumns) {
                return filter.properties.getColumns(filter).map(c => ({
                    label: filter.properties.columnLabel,
                    ...c,
                    name: filter.type
                }));
            }
            if (filter.properties?.columnLabel) {
                return [
                    {
                        name: filter.type,
                        label: filter.properties.columnLabel,
                        getValue: filter.properties.getColumnValue
                            ? member => filter.properties.getColumnValue(member, filter)
                            : null
                    }
                ];
            }
            return [];
        });
        const uniqueColumns = columns.filter((c, i) => columns.findIndex(c2 => c2.label === c.label) === i);
        return uniqueColumns.splice(0, 2);
    }

    get isBulkDeletePermitted() {
        if (!this.isFiltered) {
            return false;
        }
        const stripeFilters = this.filters.filter(f =>
            [
                'subscriptions.plan_interval',
                'subscriptions.status',
                'subscriptions.start_date',
                'subscriptions.current_period_end',
                'conversion',
                'offer_redemptions'
            ].includes(f.type)
        );
        return !(stripeFilters && stripeFilters.length >= 1);
    }

    includeTierQuery() {
        const availableFilters = this.filters.length ? this.filters : this.softFilters;
        return availableFilters.some(f => f.type === 'tier');
    }

    getApiQueryObject({params, extraFilters = []} = {}) {
        const {label, paidParam, searchParam, filterParam} = params ?? this;
        let fParam = filterParam;
        if (fParam) {
            const BRACKETS_SURROUNDED_RE = /^\(.*\)$/;
            const MULTIPLE_GROUPS_RE = /\).*\(/;
            if (BRACKETS_SURROUNDED_RE.test(fParam) && !MULTIPLE_GROUPS_RE.test(fParam)) {
                fParam = fParam.slice(1, -1);
            }
        }
        const filters = [...extraFilters];
        if (label) {
            filters.push(`label:'${label}'`);
        }
        if (paidParam !== null) {
            filters.push(paidParam === 'true' ? 'status:-free' : 'status:free');
        }
        if (fParam) {
            filters.push(fParam);
        }
        const searchQuery = searchParam ? {search: searchParam} : {};
        return {filter: filters.join('+'), ...searchQuery};
    }

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
            .then(blob => {
                const blobUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                const datetime = new Date().toJSON().substring(0, 10);
                a.href = blobUrl;
                a.download = `members.${datetime}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(blobUrl);
            })
            .catch(() => {})
            .finally(() => {
                this.isExporting = false;
            });
    }

    @action
    changeLabel(label, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        this.label = label.slug;
    }

    @action
    editLabel(label, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
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
            onComplete: this.resetAndReloadMembers
        });
    }

    @action
    bulkRemoveLabel() {
        this.modals.open(BulkRemoveMembersLabelModal, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers
        });
    }

    @action
    bulkUnsubscribe() {
        this.modals.open(BulkUnsubscribeMembersModal, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers
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
            onComplete: () => {
                this.store.unloadAll('member');
                this.router.transitionTo('members.index', {
                    queryParams: {...resetQueryParams('members.index')}
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
        const forceReload =
            !params ||
            label !== this._lastLabel ||
            paidParam !== this._lastPaidParam ||
            searchParam !== this._lastSearchParam ||
            orderParam !== this._lastOrderParam ||
            filterParam !== this._lastFilterParam;
        this._lastLabel = label;
        this._lastPaidParam = paidParam;
        this._lastSearchParam = searchParam;
        this._lastOrderParam = orderParam;
        this._lastFilterParam = filterParam;
        if (!forceReload && this._startDate && !(this._startDate - startDate > 1 * 60 * 1000)) {
            return this.members;
        }
        this._startDate = startDate;
        this.members = yield this.ellaSparse.array((range = {}, query = {}) => {
            const searchQuery = this.getApiQueryObject({
                params,
                extraFilters: [`created_at:<='${moment.utc(this._startDate).format('YYYY-MM-DD HH:mm:ss')}'`]
            });
            const order = orderParam ? `${orderParam} desc` : `created_at desc`;
            const includes = ['labels', 'tiers'];
            query = {
                include: includes.join(','),
                order,
                limit: range.length,
                page: range.page,
                ...searchQuery,
                ...query
            };
            return this.store.query('member', query).then(result => ({
                data: result,
                total: result.meta.pagination.total
            }));
        }, {limit: 50});
    }

    resetFilters(params) {
        if (!params?.filterParam) {
            this.filters = A([]);
            this.softFilterParam = null;
            this.softFilters = A([]);
        } else {
            this.filterParam = params.filterParam;
            this.parseFilterParamCounter += 1;
        }
    }

    reload(params) {
        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
        this.fetchMembersTask.perform(params);
    }
}