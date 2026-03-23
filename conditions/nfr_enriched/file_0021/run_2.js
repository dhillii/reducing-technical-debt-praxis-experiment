# Refactored StatsFilter Component

## Key Improvements

1. **Extracted constants** for repeated values (operators, class names)
2. **Eliminated repetitive field configs** using data-driven approach
3. **Merged similar hooks** - `useTinybirdFilterOptions` and `usePostOptions` share audience/param logic
4. **Extracted custom hooks** for media query and filter options aggregation
5. **Reduced `groupedFields` memo** by building configs from a lookup table

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
    selectedOptionsClassName: 'hidden'
};

const WIDE_POPOVER = {
    className: 'w-60',
    popoverContentClassName: 'w-60'
};

const DEVICE_LABELS: Record<string, string> = {
    'mobile-ios': 'iOS',
    'mobile-android': 'Android',
    desktop: 'Desktop',
    bot: 'Bot',
    unknown: 'Unknown'
};

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    utm_source: {
        endpoint: 'api_top_utm_sources',
        valueKey: 'utm_source',
        transformValue: v => ({value: v || '(not set)', label: v || '(not set)'})
    },
    utm_medium: {
        endpoint: 'api_top_utm_mediums',
        valueKey: 'utm_medium',
        transformValue: v => ({value: v || '(not set)', label: v || '(not set)'})
    },
    utm_campaign: {
        endpoint: 'api_top_utm_campaigns',
        valueKey: 'utm_campaign',
        transformValue: v => ({value: v || '(not set)', label: v || '(not set)'})
    },
    utm_content: {
        endpoint: 'api_top_utm_contents',
        valueKey: 'utm_content',
        transformValue: v => ({value: v || '(not set)', label: v || '(not set)'})
    },
    utm_term: {
        endpoint: 'api_top_utm_terms',
        valueKey: 'utm_term',
        transformValue: v => ({value: v || '(not set)', label: v || '(not set)'})
    },
    source: {
        endpoint: 'api_top_sources',
        valueKey: 'source',
        transformValue: v => ({value: v || '', label: v || 'Direct'})
    },
    location: {
        endpoint: 'api_top_locations',
        valueKey: 'location',
        filterItem: item => {
            const location = String(item.location || '');
            return location !== '' && !UNKNOWN_LOCATION_VALUES.includes(location);
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const useIsMobile = (breakpoint = 1024): boolean => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const handleChange = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);

        handleChange(mediaQuery);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [breakpoint]);

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

// ─── Field config builders ────────────────────────────────────────────────────

type FieldOptions = {options: FilterFieldConfig['options']; isLoading?: boolean};

const buildUtmFields = (
    utmData: Record<string, FieldOptions>
): FilterFieldConfig[] => [
    {
        key: 'utm_source',
        label: 'UTM Source',
        icon: <LucideIcon.MousePointerClick className="size-4" />,
        placeholder: 'Select source',
        ...SHARED_SELECT_PROPS,
        ...utmData.utm_source
    },
    {
        key: 'utm_medium',
        label: 'UTM Medium',
        icon: <LucideIcon.SatelliteDish className="size-4" />,
        placeholder: 'Select medium',
        ...SHARED_SELECT_PROPS,
        ...WIDE_POPOVER,
        ...utmData.utm_medium
    },
    {
        key: 'utm_campaign',
        label: 'UTM Campaign',
        icon: <LucideIcon.Flag className="size-4" />,
        placeholder: 'Select campaign',
        ...SHARED_SELECT_PROPS,
        ...WIDE_POPOVER,
        ...utmData.utm_campaign
    },
    {
        key: 'utm_content',
        label: 'UTM Content',
        icon: <LucideIcon.TextCursorInput className="size-4" />,
        placeholder: 'Select content',
        ...SHARED_SELECT_PROPS,
        ...WIDE_POPOVER,
        ...utmData.utm_content
    },
    {
        key: 'utm_term',
        label: 'UTM Term',
        icon: <LucideIcon.Tag className="size-4" />,
        placeholder: 'Select term',
        ...SHARED_SELECT_PROPS,
        ...WIDE_POPOVER,
        ...utmData.utm_term
    }
];

// ─── Component ────────────────────────────────────────────────────────────────

function StatsFilter({filters, onChange, ...props}: StatsFilterProps) {
    const {appSettings} = useAppContext();
    const [activeFilterField, setActiveFilterField] = useState<string | null>(null);
    const isMobile = useIsMobile();

    const shouldFetch = useCallback(
        (fieldKey: string) => activeFilterField === fieldKey || filters.some(f => f.field === fieldKey),
        [activeFilterField, filters]
    );

    // Tinybird-backed options
    const {options: utmSourceOptions, loading: utmSourceLoading} = useTinybirdFilterOptions('utm_source', filters, shouldFetch('utm_source'));
    const {options: utmMediumOptions, loading: utmMediumLoading} = useTinybirdFilterOptions('utm_medium', filters, shouldFetch('utm_medium'));
    const {options: utmCampaignOptions, loading: utmCampaignLoading} = useTinybirdFilterOptions('utm_campaign', filters, shouldFetch('utm_campaign'));
    const {options: utmContentOptions, loading: utmContentLoading} = useTinybirdFilterOptions('utm_content', filters, shouldFetch('utm_content'));
    const {options: utmTermOptions, loading: utmTermLoading} = useTinybirdFilterOptions('utm_term', filters, shouldFetch('utm_term'));
    const {options: sourceOptions, loading: sourceLoading} = useTinybirdFilterOptions('source', filters, shouldFetch('source'));
    const {options: deviceOptions, loading: deviceLoading} = useTinybirdFilterOptions('device', filters, shouldFetch('device'));
    const {options: locationOptions, loading: locationLoading} = useTinybirdFilterOptions('location', filters, shouldFetch('location'));
    const {options: postOptions, loading: postLoading} = usePostOptions(filters, shouldFetch('post'));

    const audienceOptions = useMemo(() => {
        const all = [
            {value: 'undefined', label: 'Public visitors', icon: <LucideIcon.Globe className="text-gray-700" />},
            {value: 'free', label: 'Free members', icon: <LucideIcon.User className="text-green" />},
            {value: 'paid', label: 'Paid members', icon: <LucideIcon.UserPlus className="text-orange" />}
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
                    autoCloseOnSelect: true
                },
                {
                    key: 'post',
                    label: 'Post or page',
                    icon: <LucideIcon.PenLine />,
                    className: 'w-80',
                    popoverContentClassName: 'w-80',
                    ...SHARED_SELECT_PROPS,
                    options: postOptions,
                    isLoading: postLoading
                },
                {
                    key: 'source',
                    label: 'Source',
                    icon: <LucideIcon.Globe className="size-4" />,
                    placeholder: 'Select source',
                    ...SHARED_SELECT_PROPS,
                    ...WIDE_POPOVER,
                    options: sourceOptions,
                    isLoading: sourceLoading
                },
                {
                    key: 'device',
                    label: 'Device',
                    icon: <LucideIcon.Monitor className="size-4" />,
                    placeholder: 'Select device',
                    ...SHARED_SELECT_PROPS,
                    options: deviceOptions,
                    isLoading: deviceLoading
                },
                {
                    key: 'location',
                    label: 'Location',
                    icon: <LucideIcon.MapPin className="size-4" />,
                    placeholder: 'Select location',
                    ...SHARED_SELECT_PROPS,
                    options: locationOptions,
                    isLoading: locationLoading
                }
            ]
        },
        {
            group: 'UTM parameters',
            fields: buildUtmFields({
                utm_source: {options: utmSourceOptions, isLoading: utmSourceLoading},
                utm_medium: {options: utmMediumOptions, isLoading: utmMediumLoading},
                utm_campaign: {options: utmCampaignOptions, isLoading: utmCampaignLoading},
                utm_content: {options: utmContentOptions, isLoading: utmContentLoading},
                utm_term: {options: utmTermOptions, isLoading: utmTermLoading}
            })
        }
    ], [
        audienceOptions, postOptions, postLoading,
        sourceOptions, sourceLoading, deviceOptions, deviceLoading,
        locationOptions, locationLoading,
        utmSourceOptions, utmSourceLoading, utmMediumOptions, utmMediumLoading,
        utmCampaignOptions, utmCampaignLoading, utmContentOptions, utmContentLoading,
        utmTermOptions, utmTermLoading
    ]);

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
| `DEVICE_LABELS` | Nested ternary chain | Flat lookup object |
| `buildFilterParams` | `forEach` with `return` | `for...of` with `continue` |
| `getAudienceFromFilters` | Duplicated in two hooks | Extracted shared helper |
| `useIsMobile` | Inline in component | Dedicated reusable hook |
| Hook `enabled` param | `{enabled}` config object | Plain boolean |
| `groupedFields` UTM section | 5 nearly-identical objects | `buildUtmFields()` with spread |
| Shared field props | Repeated per field | `SHARED_SELECT_PROPS` / `WIDE_POPOVER` constants |
| `popoverAlign` logic | Ternary inside ternary | Simplified `isMobile \|\| hasFilters` |
| `getCountryName` | Standalone function | Inlined into `location` definition |