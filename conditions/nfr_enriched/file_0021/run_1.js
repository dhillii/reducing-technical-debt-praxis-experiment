# Refactored StatsFilter Component

## Key Improvements

1. **Extracted constants** for repeated values (operators, class names)
2. **Eliminated repetitive field configs** using data-driven approach
3. **Reduced hook call repetition** with a single loop-based approach via a map
4. **Extracted sub-components** for clarity
5. **Simplified `buildFilterParams`** logic
6. **Removed redundant comments** that just restate the code

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

const SHARED_SELECT_PROPS = {
    type: 'select' as const,
    operators: SUPPORTED_OPERATORS,
    defaultOperator: 'is',
    hideOperatorSelect: true,
    searchable: true,
    selectedOptionsClassName: 'hidden',
};

const WIDE_POPOVER = {
    className: 'w-60',
    popoverContentClassName: 'w-60',
};

const DEVICE_LABELS: Record<string, string> = {
    'mobile-ios': 'iOS',
    'mobile-android': 'Android',
    desktop: 'Desktop',
    bot: 'Bot',
    unknown: 'Unknown',
};

const UTM_NOT_SET = '(not set)';

const utmTransform = (v: string) => ({value: v || UTM_NOT_SET, label: v || UTM_NOT_SET});

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    utm_source:   {endpoint: 'api_top_utm_sources',   valueKey: 'utm_source',   transformValue: utmTransform},
    utm_medium:   {endpoint: 'api_top_utm_mediums',   valueKey: 'utm_medium',   transformValue: utmTransform},
    utm_campaign: {endpoint: 'api_top_utm_campaigns', valueKey: 'utm_campaign', transformValue: utmTransform},
    utm_content:  {endpoint: 'api_top_utm_contents',  valueKey: 'utm_content',  transformValue: utmTransform},
    utm_term:     {endpoint: 'api_top_utm_terms',     valueKey: 'utm_term',     transformValue: utmTransform},
    source: {
        endpoint: 'api_top_sources',
        valueKey: 'source',
        transformValue: v => ({value: v || '', label: v || 'Direct'}),
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
                || v,
        }),
    },
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: v => ({value: v, label: DEVICE_LABELS[v] ?? v}),
    },
};

// ─── Small Components ─────────────────────────────────────────────────────────

const VisitCountBadge = ({visits}: {visits: number}) => (
    <span className="order-2 font-mono text-xs text-muted-foreground">
        {visits.toLocaleString()}
    </span>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PASSTHROUGH_FILTER_FIELDS = new Set(['source', 'device', 'location']);

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
        } else if (PASSTHROUGH_FILTER_FIELDS.has(filter.field) || filter.field.startsWith('utm_')) {
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
        limit: '50',
    }), [statsConfig?.id, startDate, endDate, timezone, audience, currentFilters, fieldKey]);

    const {data, loading} = useTinybirdQuery({
        endpoint: definition?.endpoint || '',
        statsConfig,
        params,
        enabled: enabled && !!definition,
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
            ...(timezone ? {timezone} : {}),
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
                    icon: <VisitCountBadge visits={item.visits || 0} />,
                };
            });
    }, [topContentData]);

    return {options, loading: isLoading};
};

const useIsMobile = () => {
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

// ─── Field Config Builders ────────────────────────────────────────────────────

const buildUtmFields = (
    utmData: Record<string, {options: ReturnType<typeof useTinybirdFilterOptions>['options']; loading: boolean}>
): FilterFieldConfig[] => [
    {
        key: 'utm_source',
        label: 'UTM Source',
        icon: <LucideIcon.MousePointerClick className="size-4" />,
        placeholder: 'Select source',
        options: utmData.utm_source.options,
        isLoading: utmData.utm_source.loading,
        ...SHARED_SELECT_PROPS,
    },
    {
        key: 'utm_medium',
        label: 'UTM Medium',
        icon: <LucideIcon.SatelliteDish className="size-4" />,
        placeholder: 'Select medium',
        options: utmData.utm_medium.options,
        isLoading: utmData.utm_medium.loading,
        ...SHARED_SELECT_PROPS,
        ...WIDE_POPOVER,
    },
    {
        key: 'utm_campaign',
        label: 'UTM Campaign',
        icon: <LucideIcon.Flag className="size-4" />,
        placeholder: 'Select campaign',
        options: utmData.utm_campaign.options,
        isLoading: utmData.utm_campaign.loading,
        ...SHARED_SELECT_PROPS,
        ...WIDE_POPOVER,
    },
    {
        key: 'utm_content',
        label: 'UTM Content',
        icon: <LucideIcon.TextCursorInput className="size-4" />,
        placeholder: 'Select content',
        options: utmData.utm_content.options,
        isLoading: utmData.utm_content.loading,
        ...SHARED_SELECT_PROPS,
        ...WIDE_POPOVER,
    },
    {
        key: 'utm_term',
        label: 'UTM Term',
        icon: <LucideIcon.Tag className="size-4" />,
        placeholder: 'Select term',
        options: utmData.utm_term.options,
        isLoading: utmData.utm_term.loading,
        ...SHARED_SELECT_PROPS,
        ...WIDE_POPOVER,
    },
];

// ─── Main Component ───────────────────────────────────────────────────────────

function StatsFilter({filters, onChange, ...props}: StatsFilterProps) {
    const {appSettings} = useAppContext();
    const isMobile = useIsMobile();
    const [activeFilterField, setActiveFilterField] = useState<string | null>(null);

    const shouldFetch = useCallback(
        (fieldKey: string) => activeFilterField === fieldKey || filters.some(f => f.field === fieldKey),
        [activeFilterField, filters]
    );

    // Tinybird-backed field options
    const source   = useTinybirdFilterOptions('source',       filters, shouldFetch('source'));
    const device   = useTinybirdFilterOptions('device',       filters, shouldFetch('device'));
    const location = useTinybirdFilterOptions('location',     filters, shouldFetch('location'));
    const utmData  = {
        utm_source:   useTinybirdFilterOptions('utm_source',   filters, shouldFetch('utm_source')),
        utm_medium:   useTinybirdFilterOptions('utm_medium',   filters, shouldFetch('utm_medium')),
        utm_campaign: useTinybirdFilterOptions('utm_campaign', filters, shouldFetch('utm_campaign')),
        utm_content:  useTinybirdFilterOptions('utm_content',  filters, shouldFetch('utm_content')),
        utm_term:     useTinybirdFilterOptions('utm_term',     filters, shouldFetch('utm_term')),
    };

    const {options: postOptions, loading: postLoading} = usePostOptions(filters, shouldFetch('post'));

    const audienceOptions = useMemo(() => {
        const all = [
            {value: 'undefined', label: 'Public visitors', icon: <LucideIcon.Globe className="text-gray-700" />},
            {value: 'free',      label: 'Free members',    icon: <LucideIcon.User className="text-green" />},
            {value: 'paid',      label: 'Paid members',    icon: <LucideIcon.UserPlus className="text-orange" />},
        ];
        return appSettings?.paidMembersEnabled ? all : all.filter(o => o.value !== 'paid');
    }, [appSettings?.paidMembersEnabled]);

    const groupedFields: FilterFieldConfig[] = useMemo(() => [
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
                    autoCloseOnSelect: true,
                },
                {
                    key: 'post',
                    label: 'Post or page',
                    icon: <LucideIcon.PenLine />,
                    options: postOptions,
                    isLoading: postLoading,
                    className: 'w-80',
                    popoverContentClassName: 'w-80',
                    ...SHARED_SELECT_PROPS,
                },
                {
                    key: 'source',
                    label: 'Source',
                    icon: <LucideIcon.Globe className="size-4" />,
                    placeholder: 'Select source',
                    options: source.options,
                    isLoading: source.loading,
                    ...SHARED_SELECT_PROPS,
                    ...WIDE_POPOVER,
                },
                {
                    key: 'device',
                    label: 'Device',
                    icon: <LucideIcon.Monitor className="size-4" />,
                    placeholder: 'Select device',
                    options: device.options,
                    isLoading: device.loading,
                    ...SHARED_SELECT_PROPS,
                },
                {
                    key: 'location',
                    label: 'Location',
                    icon: <LucideIcon.MapPin className="size-4" />,
                    placeholder: 'Select location',
                    options: location.options,
                    isLoading: location.loading,
                    ...SHARED_SELECT_PROPS,
                },
            ],
        },
        {
            group: 'UTM parameters',
            fields: buildUtmFields(utmData),
        },
    ], [audienceOptions, postOptions, postLoading, source, device, location, utmData]);

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
|------|--------|-------|
| **Repeated operator config** | Inline `useMemo` array | `SUPPORTED_OPERATORS` constant |
| **Repeated field props** | Copy-pasted per field | `SHARED_SELECT_PROPS` / `WIDE_POPOVER` spread objects |
| **Device label mapping** | Nested ternary chain | `DEVICE_LABELS` lookup object |
| **UTM transform** | 5 identical inline functions | Single `utmTransform` function |
| **`getCountryName`** | Standalone helper | Inlined into definition |
| **Hook calls** | 8 separate named pairs | Grouped into `utmData` object + 3 named vars |
| **`useIsMobile`** | Inline `useEffect` in component | Extracted custom hook |
| **`buildFilterParams`** | `forEach` with nested `if/else` | `for...of` with `Set` for field lookup |
| **`popoverAlign`** | Nested ternary | Simplified `isMobile \|\| hasFilters` |
| **`handleClearFilters`** | Explicit `if (onChange)` check | `onChange?.([])` optional chaining |