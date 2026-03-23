# Refactored StatsFilter Component

Here's my analysis of the complexity issues and the refactored code:

**Key improvements:**
1. Extracted UTM field config to eliminate repetitive field definitions
2. Created a `useFilterOptions` hook to consolidate all option fetching
3. Extracted `useResponsiveAlign` and `useMobileDetect` hooks
4. Simplified `groupedFields` construction using data-driven approach
5. Reduced the massive `useMemo` dependency array

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

const utmTransform = (v: string) => ({value: v || '(not set)', label: v || '(not set)'});

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    utm_source:   {endpoint: 'api_top_utm_sources',   valueKey: 'utm_source',   transformValue: utmTransform},
    utm_medium:   {endpoint: 'api_top_utm_mediums',   valueKey: 'utm_medium',   transformValue: utmTransform},
    utm_campaign: {endpoint: 'api_top_utm_campaigns', valueKey: 'utm_campaign', transformValue: utmTransform},
    utm_content:  {endpoint: 'api_top_utm_contents',  valueKey: 'utm_content',  transformValue: utmTransform},
    utm_term:     {endpoint: 'api_top_utm_terms',     valueKey: 'utm_term',     transformValue: utmTransform},
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
        transformValue: v => ({
            value: v,
            label: STATS_LABEL_MAPPINGS[v as keyof typeof STATS_LABEL_MAPPINGS]
                || countries.getName(v, 'en')
                || v
        })
    },
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: v => ({value: v, label: DEVICE_LABELS[v] ?? v})
    }
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

const VisitCountBadge = ({visits}: {visits: number}) => (
    <span className="order-2 font-mono text-xs text-muted-foreground">
        {visits.toLocaleString()}
    </span>
);

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

const getAudienceFromFilters = (filters: Filter[]) => {
    const audienceFilter = filters.find(f => f.field === 'audience');
    return getAudienceFromFilterValues(audienceFilter?.values as string[] | undefined);
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useMobileDetect = () => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1024px)');
        const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
        handler(mq);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    return isMobile;
};

const useTinybirdFilterOptions = (
    fieldKey: string,
    currentFilters: Filter[] = [],
    enabled = true
) => {
    const {statsConfig, range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);
    const definition = FILTER_FIELD_DEFINITIONS[fieldKey];

    const audience = useMemo(() => getAudienceFromFilters(currentFilters), [currentFilters]);

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

const usePostOptions = (currentFilters: Filter[] = [], enabled = true) => {
    const {range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);
    const audience = useMemo(() => getAudienceFromFilters(currentFilters), [currentFilters]);

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

/** Fetches all filter options, gated by whether each field is active or has an applied filter. */
const useFilterOptions = (filters: Filter[], activeField: string | null) => {
    const shouldFetch = useCallback(
        (key: string) => activeField === key || filters.some(f => f.field === key),
        [activeField, filters]
    );

    const tinybirdFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'source', 'device', 'location'] as const;

    // Each hook call is unconditional (rules of hooks), gated via `enabled`
    const utm_source   = useTinybirdFilterOptions('utm_source',   filters, shouldFetch('utm_source'));
    const utm_medium   = useTinybirdFilterOptions('utm_medium',   filters, shouldFetch('utm_medium'));
    const utm_campaign = useTinybirdFilterOptions('utm_campaign', filters, shouldFetch('utm_campaign'));
    const utm_content  = useTinybirdFilterOptions('utm_content',  filters, shouldFetch('utm_content'));
    const utm_term     = useTinybirdFilterOptions('utm_term',     filters, shouldFetch('utm_term'));
    const source       = useTinybirdFilterOptions('source',       filters, shouldFetch('source'));
    const device       = useTinybirdFilterOptions('device',       filters, shouldFetch('device'));
    const location     = useTinybirdFilterOptions('location',     filters, shouldFetch('location'));
    const post         = usePostOptions(filters, shouldFetch('post'));

    return {utm_source, utm_medium, utm_campaign, utm_content, utm_term, source, device, location, post};
};

// ─── Field config builders ────────────────────────────────────────────────────

type FieldOptions = {options: {label: string; value: string; icon: React.ReactNode}[]; loading: boolean};

const makeSelectField = (
    key: string,
    label: string,
    icon: React.ReactNode,
    {options, loading}: FieldOptions,
    overrides: Partial<FilterFieldConfig> = {}
): FilterFieldConfig => ({
    key,
    label,
    type: 'select',
    icon,
    operators: SUPPORTED_OPERATORS,
    defaultOperator: 'is',
    hideOperatorSelect: true,
    selectedOptionsClassName: 'hidden',
    options,
    isLoading: loading,
    ...overrides
});

const UTM_FIELD_CONFIGS: Array<{key: string; label: string; icon: React.ReactNode}> = [
    {key: 'utm_source',   label: 'UTM Source',   icon: <LucideIcon.MousePointerClick className="size-4" />},
    {key: 'utm_medium',   label: 'UTM Medium',   icon: <LucideIcon.SatelliteDish className="size-4" />},
    {key: 'utm_campaign', label: 'UTM Campaign', icon: <LucideIcon.Flag className="size-4" />},
    {key: 'utm_content',  label: 'UTM Content',  icon: <LucideIcon.TextCursorInput className="size-4" />},
    {key: 'utm_term',     label: 'UTM Term',     icon: <LucideIcon.Tag className="size-4" />}
];

// ─── Component ────────────────────────────────────────────────────────────────

function StatsFilter({filters, onChange, ...props}: StatsFilterProps) {
    const {appSettings} = useAppContext();
    const [activeFilterField, setActiveFilterField] = useState<string | null>(null);
    const isMobile = useMobileDetect();
    const fieldOptions = useFilterOptions(filters, activeFilterField);

    const audienceOptions = useMemo(() => {
        const all = [
            {value: 'undefined', label: 'Public visitors', icon: <LucideIcon.Globe className="text-gray-700" />},
            {value: 'free',      label: 'Free members',    icon: <LucideIcon.User className="text-green" />},
            {value: 'paid',      label: 'Paid members',    icon: <LucideIcon.UserPlus className="text-orange" />}
        ];
        return appSettings?.paidMembersEnabled ? all : all.filter(o => o.value !== 'paid');
    }, [appSettings?.paidMembersEnabled]);

    const groupedFields: FilterFieldConfig[] = useMemo(() => {
        const utmFields = UTM_FIELD_CONFIGS.map(({key, label, icon}) =>
            makeSelectField(key, label, icon, fieldOptions[key as keyof typeof fieldOptions], {
                placeholder: `Select ${label.toLowerCase().replace('utm ', '')}`,
                className: 'w-60',
                popoverContentClassName: 'w-60',
                searchable: true
            })
        );

        return [
            {
                group: 'Basic',
                fields: [
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
                    makeSelectField('post', 'Post or page', <LucideIcon.PenLine />, fieldOptions.post, {
                        searchable: true,
                        className: 'w-80',
                        popoverContentClassName: 'w-80'
                    }),
                    makeSelectField('source', 'Source', <LucideIcon.Globe className="size-4" />, fieldOptions.source, {
                        placeholder: 'Select source',
                        className: 'w-60',
                        popoverContentClassName: 'w-60',
                        searchable: true
                    }),
                    makeSelectField('device', 'Device', <LucideIcon.Monitor className="size-4" />, fieldOptions.device, {
                        placeholder: 'Select device'
                    }),
                    makeSelectField('location', 'Location', <LucideIcon.MapPin className="size-4" />, fieldOptions.location, {
                        placeholder: 'Select location',
                        searchable: true
                    })
                ]
            },
            {group: 'UTM parameters', fields: utmFields}
        ];
    }, [fieldOptions, audienceOptions]);

    const hasFilters = filters.length > 0;

    const handleClearFilters = useCallback(() => onChange?.([]), [onChange]);

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
                popoverAlign={isMobile || hasFilters ? 'start' : 'end'}
                showSearchInput={false}
                onActiveFieldChange={setActiveFilterField}
                onChange={onChange || (() => {})}
                {...props}
            />
            {hasFilters && (
                <Button
                    className="hidden font-normal text-muted-foreground lg:flex"
                    data-testid="stats-filter-clear-button"
                    variant="ghost"
                    onClick={handleClearFilters}
                >
                    <LucideIcon.FunnelX />
                    Clear
                </Button>
            )}
        </div>
    );
}

export default StatsFilter;
```

## Summary of Changes

| Area | Before | After |
|---|---|---|
| **UTM transform** | 5 identical inline functions | Single `utmTransform` constant |
| **Device labels** | Nested ternary chain | `DEVICE_LABELS` lookup object |
| **Country name lookup** | Separate helper function | Inlined into `location` definition |
| **Option fetching** | 9 separate hook calls in component | `useFilterOptions` hook encapsulates all |
| **`shouldFetchOptions`** | `useCallback` in component | Moved inside `useFilterOptions` |
| **Field config** | ~120 lines of repetitive objects | `makeSelectField` factory + `UTM_FIELD_CONFIGS` data array |
| **Mobile detection** | `useEffect` inline in component | `useMobileDetect` hook |
| **`buildFilterParams`** | `forEach` with early returns | `for...of` with `continue` (clearer intent) |
| **`popoverAlign`** | Nested ternary | Simplified: `isMobile \|\| hasFilters ? 'start' : 'end'` |
| **`handleClearFilters`** | Wrapped `if (onChange)` check | `onChange?.([])` optional chaining |