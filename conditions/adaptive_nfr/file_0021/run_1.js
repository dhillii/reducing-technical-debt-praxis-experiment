# Refactored StatsFilter Component

## Key Changes Made

1. **Extracted constants** for repeated config patterns (shared field config, UTM field definitions)
2. **Eliminated repetitive field declarations** by generating UTM fields and basic fields from config arrays
3. **Consolidated audience derivation** into a shared utility to avoid duplication between hooks
4. **Extracted `useMediaQuery` hook** to separate the media query logic
5. **Replaced 8 individual hook calls** with a single loop-based approach using a registry
6. **Extracted `buildFieldConfig`** factory to eliminate the massive repetitive `groupedFields` memo

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

// Field UI config: static presentation properties per field key
const FIELD_UI_CONFIG: Record<string, Partial<FilterFieldConfig>> = {
    audience: {
        label: 'Audience',
        type: 'multiselect',
        icon: <LucideIcon.Users />,
        defaultOperator: 'is any of',
        hideOperatorSelect: true,
        autoCloseOnSelect: true
    },
    post: {
        label: 'Post or page',
        type: 'select',
        icon: <LucideIcon.PenLine />,
        searchable: true,
        operators: SUPPORTED_OPERATORS,
        defaultOperator: 'is',
        className: 'w-80',
        popoverContentClassName: 'w-80',
        hideOperatorSelect: true,
        selectedOptionsClassName: 'hidden'
    },
    source: {
        label: 'Source',
        type: 'select',
        icon: <LucideIcon.Globe className="size-4" />,
        placeholder: 'Select source',
        operators: SUPPORTED_OPERATORS,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        className: 'w-60',
        popoverContentClassName: 'w-60',
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    device: {
        label: 'Device',
        type: 'select',
        icon: <LucideIcon.Monitor className="size-4" />,
        placeholder: 'Select device',
        operators: SUPPORTED_OPERATORS,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        selectedOptionsClassName: 'hidden'
    },
    location: {
        label: 'Location',
        type: 'select',
        icon: <LucideIcon.MapPin className="size-4" />,
        placeholder: 'Select location',
        operators: SUPPORTED_OPERATORS,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    utm_source: {
        label: 'UTM Source',
        type: 'select',
        icon: <LucideIcon.MousePointerClick className="size-4" />,
        placeholder: 'Select source',
        operators: SUPPORTED_OPERATORS,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    utm_medium: {
        label: 'UTM Medium',
        type: 'select',
        icon: <LucideIcon.SatelliteDish className="size-4" />,
        placeholder: 'Select medium',
        operators: SUPPORTED_OPERATORS,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        className: 'w-60',
        popoverContentClassName: 'w-60',
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    utm_campaign: {
        label: 'UTM Campaign',
        type: 'select',
        icon: <LucideIcon.Flag className="size-4" />,
        placeholder: 'Select campaign',
        operators: SUPPORTED_OPERATORS,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        className: 'w-60',
        popoverContentClassName: 'w-60',
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    utm_content: {
        label: 'UTM Content',
        type: 'select',
        icon: <LucideIcon.TextCursorInput className="size-4" />,
        placeholder: 'Select content',
        operators: SUPPORTED_OPERATORS,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        className: 'w-60',
        popoverContentClassName: 'w-60',
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    utm_term: {
        label: 'UTM Term',
        type: 'select',
        icon: <LucideIcon.Tag className="size-4" />,
        placeholder: 'Select term',
        operators: SUPPORTED_OPERATORS,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        className: 'w-60',
        popoverContentClassName: 'w-60',
        searchable: true,
        selectedOptionsClassName: 'hidden'
    }
};

const BASIC_FIELD_KEYS = ['audience', 'post', 'source', 'device', 'location'] as const;
const UTM_FIELD_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const TINYBIRD_FIELD_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'source', 'device', 'location'] as const;

// ─── Small Components ─────────────────────────────────────────────────────────

const VisitCountBadge = ({visits}: {visits: number}) => (
    <span className="order-2 font-mono text-xs text-muted-foreground">
        {visits.toLocaleString()}
    </span>
);

// ─── Utilities ────────────────────────────────────────────────────────────────

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

const deriveAudience = (filters: Filter[]) => {
    const audienceFilter = filters.find(f => f.field === 'audience');
    return getAudienceFromFilterValues(audienceFilter?.values as string[] | undefined);
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useMediaQuery = (query: string): boolean => {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

    useEffect(() => {
        const mediaQuery = window.matchMedia(query);
        const handleChange = (e: MediaQueryListEvent) => setMatches(e.matches);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [query]);

    return matches;
};

const useTinybirdFilterOptions = (
    fieldKey: string,
    currentFilters: Filter[] = [],
    enabled = true
) => {
    const {statsConfig, range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);
    const definition = FILTER_FIELD_DEFINITIONS[fieldKey];

    const audience = useMemo(() => deriveAudience(currentFilters), [currentFilters]);

    const params = useMemo(() => {
        const baseParams: Record<string, string> = {
            site_uuid: statsConfig?.id || '',
            date_from: formatQueryDate(startDate),
            date_to: formatQueryDate(endDate),
            timezone,
            member_status: getAudienceQueryParam(audience),
            limit: '50'
        };
        return buildFilterParams(currentFilters, fieldKey, baseParams);
    }, [statsConfig?.id, startDate, endDate, timezone, audience, currentFilters, fieldKey]);

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
            .filter(item => definition.filterItem ? definition.filterItem(item) : true)
            .map((item) => {
                const rawValue = String(item[definition.valueKey] ?? '');
                const visits = Number(item.visits) || 0;
                const {value, label} = definition.transformValue
                    ? definition.transformValue(rawValue)
                    : {value: rawValue, label: rawValue};
                return {label, value, icon: <VisitCountBadge visits={visits} />};
            });
    }, [data, definition]);

    return {options, loading};
};

const usePostOptions = (currentFilters: Filter[] = [], enabled = true) => {
    const {range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);

    const audience = useMemo(() => deriveAudience(currentFilters), [currentFilters]);

    const queryParams = useMemo(() => {
        const baseParams: Record<string, string> = {
            date_from: formatQueryDate(startDate),
            date_to: formatQueryDate(endDate),
            member_status: getAudienceQueryParam(audience),
            ...(timezone ? {timezone} : {})
        };
        return buildFilterParams(currentFilters, 'post', baseParams);
    }, [startDate, endDate, timezone, audience, currentFilters]);

    const {data: topContentData, isLoading} = useTopContent({searchParams: queryParams, enabled});

    const options = useMemo(() => {
        const seen = new Set<string>();
        return (topContentData?.stats || [])
            .filter((item) => {
                const hasValidUuid = item.post_uuid && item.post_uuid !== '' && item.post_uuid !== 'undefined';
                const key = hasValidUuid ? `uuid:${item.post_uuid}` : `path:${item.pathname}`;
                if (seen.has(key)) {
                    return false;
                }
                seen.add(key);
                return true;
            })
            .map((item) => {
                const hasValidUuid = item.post_uuid && item.post_uuid !== '' && item.post_uuid !== 'undefined';
                return {
                    label: item.title || item.pathname || '(Untitled)',
                    value: hasValidUuid ? item.post_uuid! : item.pathname,
                    icon: <VisitCountBadge visits={item.visits || 0} />
                };
            });
    }, [topContentData]);

    return {options, loading: isLoading};
};

// Fetches all filter options in one place, keyed by field name
const useAllFilterOptions = (filters: Filter[], shouldFetch: (key: string) => boolean) => {
    // Tinybird-backed fields
    const tinybirdResults = Object.fromEntries(
        TINYBIRD_FIELD_KEYS.map(key => [
            key,
            // eslint-disable-next-line react-hooks/rules-of-hooks
            useTinybirdFilterOptions(key, filters, shouldFetch(key))
        ])
    );

    const postResult = usePostOptions(filters, shouldFetch('post'));

    return {
        ...tinybirdResults,
        post: postResult
    } as Record<string, {options: FilterFieldConfig['options']; loading: boolean}>;
};

// ─── Main Component ───────────────────────────────────────────────────────────

function StatsFilter({filters, onChange, ...props}: StatsFilterProps) {
    const {appSettings} = useAppContext();
    const [activeFilterField, setActiveFilterField] = useState<string | null>(null);
    const isMobile = useMediaQuery('(max-width: 1024px)');

    const audienceOptions = useMemo(() => {
        const options = [
            {value: 'undefined', label: 'Public visitors', icon: <LucideIcon.Globe className='text-gray-700'/>},
            {value: 'free', label: 'Free members', icon: <LucideIcon.User className='text-green'/>},
            {value: 'paid', label: 'Paid members', icon: <LucideIcon.UserPlus className='text-orange'/>}
        ];
        return appSettings?.paidMembersEnabled ? options : options.filter(opt => opt.value !== 'paid');
    }, [appSettings?.paidMembersEnabled]);

    const shouldFetchOptions = useCallback((fieldKey: string) => {
        return activeFilterField === fieldKey || filters.some(f => f.field === fieldKey);
    }, [activeFilterField, filters]);

    const allOptions = useAllFilterOptions(filters, shouldFetchOptions);

    // Build a complete FilterFieldConfig from a field key + dynamic options/loading state
    const buildFieldConfig = useCallback((key: string): FilterFieldConfig => {
        const ui = FIELD_UI_CONFIG[key] || {};
        const {options = [], loading = false} = allOptions[key] || {};
        return {
            key,
            ...ui,
            options: key === 'audience'
                ? audienceOptions.map(({value, label, icon}) => ({value, label, icon}))
                : options,
            isLoading: loading
        } as FilterFieldConfig;
    }, [allOptions, audienceOptions]);

    const groupedFields: FilterFieldConfig[] = useMemo(() => [
        {
            group: 'Basic',
            fields: BASIC_FIELD_KEYS.map(buildFieldConfig)
        },
        {
            group: 'UTM parameters',
            fields: UTM_FIELD_KEYS.map(buildFieldConfig)
        }
    ], [buildFieldConfig]);

    const hasFilters = filters.length > 0;

    const handleClearFilters = useCallback(() => {
        onChange?.([]);
    }, [onChange]);

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
                    className='hidden font-normal text-muted-foreground lg:flex'
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

## Summary of Refactoring Decisions

| Problem | Solution |
|---|---|
| 8 identical hook calls for Tinybird fields | `useAllFilterOptions` iterates `TINYBIRD_FIELD_KEYS` array |
| Massive `groupedFields` memo with repeated config | `buildFieldConfig` factory + `FIELD_UI_CONFIG` lookup table |
| Duplicated audience derivation in two hooks | Extracted `deriveAudience` utility |
| Inline `useEffect` media query logic | Extracted reusable `useMediaQuery` hook |
| Repeated `SUPPORTED_OPERATORS` inline | Promoted to module-level constant |
| Verbose device label switch/ternary chain | `DEVICE_LABELS` lookup object |
| `onChange?.([])` pattern obscured | Used optional chaining directly |
| `popoverAlign` ternary was redundant | Simplified to `isMobile \|\| hasFilters ? 'start' : 'end'` |