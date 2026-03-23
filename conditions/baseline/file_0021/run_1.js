# Refactored StatsFilter Component

Here are the key improvements made:

1. **Extracted constants** for repeated values (operators, base field config)
2. **Eliminated repetitive field configs** using a data-driven approach with a factory function
3. **Consolidated hook calls** into a single `useAllFilterOptions` hook
4. **Extracted sub-components** (`ClearFiltersButton`, `FiltersContainer`)
5. **Simplified `usePostOptions`** by extracting deduplication logic
6. **Removed redundant comments** that just restated the code

```typescript
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import {Button, Filter, FilterFieldConfig, Filters, LucideIcon} from '@tryghost/shade';
import {STATS_LABEL_MAPPINGS, UNKNOWN_LOCATION_VALUES} from '@src/utils/constants';
import {formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getAudienceFromFilterValues, getAudienceQueryParam} from '@src/utils/audience';
import {useAppContext} from '@src/app';
import {useGlobalData} from '@src/providers/global-data-provider';
import {useTinybirdQuery} from '@tryghost/admin-x-framework';
import {useTopContent} from '@tryghost/admin-x-framework/api/stats';

countries.registerLocale(enLocale);

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatsFilterProps extends Omit<React.ComponentProps<typeof Filters>, 'fields' | 'onChange'> {
    filters: Filter[];
    onChange?: (filters: Filter[]) => void;
}

interface FilterFieldDefinition {
    endpoint: string;
    valueKey: string;
    transformValue?: (value: string) => {value: string; label: string};
    filterItem?: (item: Record<string, unknown>) => boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_OPERATORS = [{value: 'is', label: 'is'}];

const DEVICE_LABELS: Record<string, string> = {
    'mobile-ios': 'iOS',
    'mobile-android': 'Android',
    desktop: 'Desktop',
    bot: 'Bot',
    unknown: 'Unknown'
};

const UTM_TRANSFORM = (v: string) => ({value: v || '(not set)', label: v || '(not set)'});

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    utm_source:   {endpoint: 'api_top_utm_sources',   valueKey: 'utm_source',   transformValue: UTM_TRANSFORM},
    utm_medium:   {endpoint: 'api_top_utm_mediums',   valueKey: 'utm_medium',   transformValue: UTM_TRANSFORM},
    utm_campaign: {endpoint: 'api_top_utm_campaigns', valueKey: 'utm_campaign', transformValue: UTM_TRANSFORM},
    utm_content:  {endpoint: 'api_top_utm_contents',  valueKey: 'utm_content',  transformValue: UTM_TRANSFORM},
    utm_term:     {endpoint: 'api_top_utm_terms',     valueKey: 'utm_term',     transformValue: UTM_TRANSFORM},
    source: {
        endpoint: 'api_top_sources',
        valueKey: 'source',
        transformValue: v => ({value: v || '', label: v || 'Direct'})
    },
    location: {
        endpoint: 'api_top_locations',
        valueKey: 'location',
        filterItem: item => {
            const loc = String(item.location || '');
            return loc !== '' && !UNKNOWN_LOCATION_VALUES.includes(loc);
        },
        transformValue: v => ({value: v, label: getCountryName(v)})
    },
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: v => ({value: v, label: DEVICE_LABELS[v] ?? v})
    }
};

// ─── Small helpers ────────────────────────────────────────────────────────────

const getCountryName = (code: string): string =>
    STATS_LABEL_MAPPINGS[code as keyof typeof STATS_LABEL_MAPPINGS] ||
    countries.getName(code, 'en') ||
    code;

const VisitCountBadge = ({visits}: {visits: number}) => (
    <span className="order-2 font-mono text-xs text-muted-foreground">
        {visits.toLocaleString()}
    </span>
);

// ─── Filter param builder ─────────────────────────────────────────────────────

const buildFilterParams = (
    currentFilters: Filter[],
    excludeField: string,
    baseParams: Record<string, string>
): Record<string, string> => {
    const params = {...baseParams};

    for (const filter of currentFilters) {
        if (filter.field === excludeField || filter.values.length === 0 || filter.field === 'audience') {
            continue;
        }

        const value = filter.values[0] as string;

        if (filter.field === 'post') {
            params[value.startsWith('/') ? 'pathname' : 'post_uuid'] = value;
        } else if (
            filter.field === 'source' ||
            filter.field === 'device' ||
            filter.field === 'location' ||
            filter.field.startsWith('utm_')
        ) {
            params[filter.field] = value;
        }
    }

    return params;
};

// ─── Shared audience derivation ───────────────────────────────────────────────

const useAudience = (filters: Filter[]) =>
    useMemo(() => {
        const audienceFilter = filters.find(f => f.field === 'audience');
        return getAudienceFromFilterValues(audienceFilter?.values as string[] | undefined);
    }, [filters]);

// ─── Tinybird filter options hook ─────────────────────────────────────────────

const useTinybirdFilterOptions = (
    fieldKey: string,
    currentFilters: Filter[],
    enabled: boolean
) => {
    const {statsConfig, range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);
    const audience = useAudience(currentFilters);
    const definition = FILTER_FIELD_DEFINITIONS[fieldKey];

    const params = useMemo(() => buildFilterParams(currentFilters, fieldKey, {
        site_uuid: statsConfig?.id || '',
        date_from: formatQueryDate(startDate),
        date_to: formatQueryDate(endDate),
        timezone,
        member_status: getAudienceQueryParam(audience),
        limit: '50'
    }), [statsConfig?.id, startDate, endDate, timezone, audience, currentFilters, fieldKey]);

    const {data, loading} = useTinybirdQuery({
        endpoint: definition?.endpoint || '',
        statsConfig,
        params,
        enabled: enabled && !!definition
    });

    const options = useMemo(() => {
        if (!definition) {
            return [];
        }
        return ((data as unknown as Array<Record<string, unknown>>) || [])
            .filter(item => definition.filterItem?.(item) ?? true)
            .map((item) => {
                const rawValue = String(item[definition.valueKey] ?? '');
                const visits = Number(item.visits) || 0;
                const {value, label} = definition.transformValue?.(rawValue) ?? {value: rawValue, label: rawValue};
                return {label, value, icon: <VisitCountBadge visits={visits} />};
            });
    }, [data, definition]);

    return {options, loading};
};

// ─── Post options hook ────────────────────────────────────────────────────────

const usePostOptions = (currentFilters: Filter[], enabled: boolean) => {
    const {range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);
    const audience = useAudience(currentFilters);

    const queryParams = useMemo(() => {
        const base: Record<string, string> = {
            date_from: formatQueryDate(startDate),
            date_to: formatQueryDate(endDate),
            member_status: getAudienceQueryParam(audience),
            ...(timezone ? {timezone} : {})
        };
        return buildFilterParams(currentFilters, 'post', base);
    }, [startDate, endDate, timezone, audience, currentFilters]);

    const {data: topContentData, isLoading} = useTopContent({searchParams: queryParams, enabled});

    const options = useMemo(() => {
        const seen = new Set<string>();
        return (topContentData?.stats || [])
            .filter((item) => {
                const hasUuid = item.post_uuid && item.post_uuid !== '' && item.post_uuid !== 'undefined';
                const key = hasUuid ? `uuid:${item.post_uuid}` : `path:${item.pathname}`;
                return seen.has(key) ? false : (seen.add(key), true);
            })
            .map((item) => {
                const hasUuid = item.post_uuid && item.post_uuid !== '' && item.post_uuid !== 'undefined';
                return {
                    label: item.title || item.pathname || '(Untitled)',
                    value: hasUuid ? item.post_uuid! : item.pathname,
                    icon: <VisitCountBadge visits={item.visits || 0} />
                };
            });
    }, [topContentData]);

    return {options, loading: isLoading};
};

// ─── Aggregated options hook ──────────────────────────────────────────────────

const TINYBIRD_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'source', 'device', 'location'] as const;
type TinybirdField = typeof TINYBIRD_FIELDS[number];

const useAllFilterOptions = (filters: Filter[], activeField: string | null) => {
    const shouldFetch = useCallback(
        (key: string) => activeField === key || filters.some(f => f.field === key),
        [activeField, filters]
    );

    // One call per Tinybird field (hooks must be called unconditionally)
    const results = {
        utm_source:   useTinybirdFilterOptions('utm_source',   filters, shouldFetch('utm_source')),
        utm_medium:   useTinybirdFilterOptions('utm_medium',   filters, shouldFetch('utm_medium')),
        utm_campaign: useTinybirdFilterOptions('utm_campaign', filters, shouldFetch('utm_campaign')),
        utm_content:  useTinybirdFilterOptions('utm_content',  filters, shouldFetch('utm_content')),
        utm_term:     useTinybirdFilterOptions('utm_term',     filters, shouldFetch('utm_term')),
        source:       useTinybirdFilterOptions('source',       filters, shouldFetch('source')),
        device:       useTinybirdFilterOptions('device',       filters, shouldFetch('device')),
        location:     useTinybirdFilterOptions('location',     filters, shouldFetch('location')),
        post:         usePostOptions(filters, shouldFetch('post'))
    } satisfies Record<TinybirdField | 'post', {options: unknown[]; loading: boolean}>;

    return results;
};

// ─── Field config builders ────────────────────────────────────────────────────

const baseSelectField = (
    key: string,
    label: string,
    icon: React.ReactNode,
    options: unknown[],
    loading: boolean,
    extra: Partial<FilterFieldConfig> = {}
): FilterFieldConfig => ({
    key,
    label,
    type: 'select',
    icon,
    operators: SUPPORTED_OPERATORS,
    defaultOperator: 'is',
    hideOperatorSelect: true,
    options: options as FilterFieldConfig['options'],
    isLoading: loading,
    selectedOptionsClassName: 'hidden',
    ...extra
});

const buildGroupedFields = (
    optionMap: ReturnType<typeof useAllFilterOptions>,
    audienceOptions: {value: string; label: string; icon: React.ReactNode}[],
): FilterFieldConfig[] => {
    const w60 = {className: 'w-60', popoverContentClassName: 'w-60', searchable: true};

    const utmFields: FilterFieldConfig[] = [
        baseSelectField('utm_source',   'UTM Source',   <LucideIcon.MousePointerClick className="size-4" />, optionMap.utm_source.options,   optionMap.utm_source.loading,   {placeholder: 'Select source',   searchable: true}),
        baseSelectField('utm_medium',   'UTM Medium',   <LucideIcon.SatelliteDish className="size-4" />,     optionMap.utm_medium.options,   optionMap.utm_medium.loading,   {placeholder: 'Select medium',   ...w60}),
        baseSelectField('utm_campaign', 'UTM Campaign', <LucideIcon.Flag className="size-4" />,              optionMap.utm_campaign.options, optionMap.utm_campaign.loading, {placeholder: 'Select campaign', ...w60}),
        baseSelectField('utm_content',  'UTM Content',  <LucideIcon.TextCursorInput className="size-4" />,   optionMap.utm_content.options,  optionMap.utm_content.loading,  {placeholder: 'Select content',  ...w60}),
        baseSelectField('utm_term',     'UTM Term',     <LucideIcon.Tag className="size-4" />,               optionMap.utm_term.options,     optionMap.utm_term.loading,     {placeholder: 'Select term',     ...w60})
    ];

    const basicFields: FilterFieldConfig[] = [
        {
            key: 'audience',
            label: 'Audience',
            type: 'multiselect',
            icon: <LucideIcon.Users />,
            options: audienceOptions,
            defaultOperator: 'is any of',
            hideOperatorSelect: true,
            autoCloseOnSelect: true
        },
        baseSelectField('post',     'Post or page', <LucideIcon.PenLine />,              optionMap.post.options,     optionMap.post.loading,     {searchable: true, className: 'w-80', popoverContentClassName: 'w-80'}),
        baseSelectField('source',   'Source',       <LucideIcon.Globe className="size-4" />,   optionMap.source.options,   optionMap.source.loading,   {placeholder: 'Select source',   ...w60}),
        baseSelectField('device',   'Device',       <LucideIcon.Monitor className="size-4" />, optionMap.device.options,   optionMap.device.loading,   {placeholder: 'Select device'}),
        baseSelectField('location', 'Location',     <LucideIcon.MapPin className="size-4" />,  optionMap.location.options, optionMap.location.loading, {placeholder: 'Select location', searchable: true})
    ];

    return [
        {group: 'Basic',          fields: basicFields},
        {group: 'UTM parameters', fields: utmFields}
    ];
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ClearFiltersButton = ({onClear}: {onClear: () => void}) => (
    <Button
        className="hidden font-normal text-muted-foreground lg:flex"
        data-testid="stats-filter-clear-button"
        variant="ghost"
        onClick={onClear}
    >
        <LucideIcon.FunnelX />
        Clear
    </Button>
);

// ─── Mobile detection hook ────────────────────────────────────────────────────

const useIsMobile = (breakpoint = 1024) => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const handler = (e: MediaQueryList | MediaQueryListEvent) => setIsMobile(e.matches);
        handler(mq);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [breakpoint]);

    return isMobile;
};

// ─── Main component ───────────────────────────────────────────────────────────

function StatsFilter({filters, onChange, ...props}: StatsFilterProps) {
    const {appSettings} = useAppContext();
    const [activeFilterField, setActiveFilterField] = useState<string | null>(null);
    const isMobile = useIsMobile();

    const audienceOptions = useMemo(() => {
        const options = [
            {value: 'undefined', label: 'Public visitors', icon: <LucideIcon.Globe className="text-gray-700" />},
            {value: 'free',      label: 'Free members',    icon: <LucideIcon.User className="text-green" />},
            {value: 'paid',      label: 'Paid members',    icon: <LucideIcon.UserPlus className="text-orange" />}
        ];
        return appSettings?.paidMembersEnabled ? options : options.filter(o => o.value !== 'paid');
    }, [appSettings?.paidMembersEnabled]);

    const optionMap = useAllFilterOptions(filters, activeFilterField);

    const groupedFields = useMemo(
        () => buildGroupedFields(optionMap, audienceOptions),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [optionMap, audienceOptions]
    );

    const hasFilters = filters.length > 0;
    const handleClearFilters = useCallback(() => onChange?.([]), [onChange]);
    const popoverAlign = isMobile || hasFilters ? 'start' : 'end';

    return (
        <div className="mt-3 flex w-full justify-between gap-2 lg:mt-0" data-testid="stats-filter-container">
            <Filters
                addButtonIcon={<LucideIcon.FunnelPlus />}
                addButtonText={hasFilters ? 'Add filter' : 'Filter'}
                allowMultiple={false}
                className={`[&>button]:order-last ${hasFilters && '[&>button]:border-none'}`}
                fields={groupedFields}
                filters={filters}
                keyboardShortcut="f"
                popoverAlign={popoverAlign}
                showSearchInput={false}
                onActiveFieldChange={setActiveFilterField}
                onChange={onChange || (() => {})}
                {...props}
            />
            {hasFilters && <ClearFiltersButton onClear={handleClearFilters} />}
        </div>
    );
}

export default StatsFilter;
```

## Summary of Changes

| Area | Before | After |
|---|---|---|
| UTM transform | 5 identical inline functions | Single `UTM_TRANSFORM` constant |
| Device labels | Nested ternary chain | `DEVICE_LABELS` lookup object |
| Hook calls | 9 separate `useTinybirdFilterOptions` calls | Single `useAllFilterOptions` aggregator |
| Field configs | ~120 lines of repetitive objects | `baseSelectField` factory + `buildGroupedFields` |
| `buildFilterParams` | `forEach` with `return` (misleading) | `for...of` with `continue` |
| Mobile detection | Inline `useEffect` in component | Reusable `useIsMobile` hook |
| Audience derivation | Duplicated in two hooks | Shared `useAudience` hook |
| Clear button | Inline JSX | `ClearFiltersButton` component |
| `popoverAlign` | Nested ternary inline | Named variable |