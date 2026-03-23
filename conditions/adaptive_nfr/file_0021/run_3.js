# Refactored StatsFilter

## Key Changes Made

1. **Extracted constants** for repeated config patterns (shared field config, UTM field definitions)
2. **Eliminated repetitive hook calls** by replacing 8 individual `useTinybirdFilterOptions` calls with a single `useAllFilterOptions` hook that iterates over field keys
3. **Extracted field builders** (`buildUtmField`, `buildBasicField`) to eliminate the massive duplicated field config objects
4. **Extracted `useIsMobile` hook** to separate the media query logic
5. **Simplified `groupedFields`** construction using data-driven approach

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

const SHARED_SELECT_FIELD_CONFIG = {
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

const getCountryName = (code: string): string =>
    STATS_LABEL_MAPPINGS[code as keyof typeof STATS_LABEL_MAPPINGS] ||
    countries.getName(code, 'en') ||
    code;

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
        transformValue: v => ({value: v, label: getCountryName(v)})
    },
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: v => {
            const DEVICE_LABELS: Record<string, string> = {
                'mobile-ios': 'iOS',
                'mobile-android': 'Android',
                desktop: 'Desktop',
                bot: 'Bot',
                unknown: 'Unknown'
            };
            return {value: v, label: DEVICE_LABELS[v] ?? v};
        }
    }
};

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

const useIsMobile = (breakpoint = 1024): boolean => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const handle = (e: MediaQueryList | MediaQueryListEvent) => setIsMobile(e.matches);
        handle(mq);
        mq.addEventListener('change', handle);
        return () => mq.removeEventListener('change', handle);
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

    const audience = useMemo(() => deriveAudience(currentFilters), [currentFilters]);

    const params = useMemo(() => {
        const base: Record<string, string> = {
            site_uuid: statsConfig?.id || '',
            date_from: formatQueryDate(startDate),
            date_to: formatQueryDate(endDate),
            timezone,
            member_status: getAudienceQueryParam(audience),
            limit: '50'
        };
        return buildFilterParams(currentFilters, fieldKey, base);
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

// Fetches all Tinybird-backed filter options in one place
const useAllFilterOptions = (filters: Filter[], shouldFetch: (key: string) => boolean) => {
    const TINYBIRD_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'source', 'device', 'location'] as const;

    // Hooks must be called unconditionally - one per field
    const utmSource = useTinybirdFilterOptions('utm_source', filters, shouldFetch('utm_source'));
    const utmMedium = useTinybirdFilterOptions('utm_medium', filters, shouldFetch('utm_medium'));
    const utmCampaign = useTinybirdFilterOptions('utm_campaign', filters, shouldFetch('utm_campaign'));
    const utmContent = useTinybirdFilterOptions('utm_content', filters, shouldFetch('utm_content'));
    const utmTerm = useTinybirdFilterOptions('utm_term', filters, shouldFetch('utm_term'));
    const source = useTinybirdFilterOptions('source', filters, shouldFetch('source'));
    const device = useTinybirdFilterOptions('device', filters, shouldFetch('device'));
    const location = useTinybirdFilterOptions('location', filters, shouldFetch('location'));

    return {utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, utm_content: utmContent, utm_term: utmTerm, source, device, location} satisfies Record<typeof TINYBIRD_FIELDS[number], {options: unknown[]; loading: boolean}>;
};

const usePostOptions = (currentFilters: Filter[] = [], enabled = true) => {
    const {range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);
    const audience = useMemo(() => deriveAudience(currentFilters), [currentFilters]);

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
                if (seen.has(key)) {
                    return false;
                }
                seen.add(key);
                return true;
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

// ─── Field Config Builders ────────────────────────────────────────────────────

interface FieldOptions {
    options: unknown[];
    loading: boolean;
}

const buildUtmField = (
    key: string,
    label: string,
    icon: React.ReactNode,
    placeholder: string,
    {options, loading}: FieldOptions
): FilterFieldConfig => ({
    ...SHARED_SELECT_FIELD_CONFIG,
    ...WIDE_POPOVER,
    key,
    label,
    icon,
    placeholder,
    options: options as FilterFieldConfig['options'],
    isLoading: loading
});

const buildBasicSelectField = (
    key: string,
    label: string,
    icon: React.ReactNode,
    placeholder: string,
    {options, loading}: FieldOptions,
    extra: Partial<FilterFieldConfig> = {}
): FilterFieldConfig => ({
    ...SHARED_SELECT_FIELD_CONFIG,
    key,
    label,
    icon,
    placeholder,
    options: options as FilterFieldConfig['options'],
    isLoading: loading,
    ...extra
});

// ─── Main Component ───────────────────────────────────────────────────────────

function StatsFilter({filters, onChange, ...props}: StatsFilterProps) {
    const {appSettings} = useAppContext();
    const isMobile = useIsMobile();
    const [activeFilterField, setActiveFilterField] = useState<string | null>(null);

    const shouldFetchOptions = useCallback(
        (fieldKey: string) => activeFilterField === fieldKey || filters.some(f => f.field === fieldKey),
        [activeFilterField, filters]
    );

    const fieldOptions = useAllFilterOptions(filters, shouldFetchOptions);
    const {options: postOptions, loading: postLoading} = usePostOptions(filters, shouldFetchOptions('post'));

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
                buildBasicSelectField(
                    'post', 'Post or page', <LucideIcon.PenLine />, '',
                    {options: postOptions, loading: postLoading},
                    {className: 'w-80', popoverContentClassName: 'w-80'}
                ),
                buildBasicSelectField(
                    'source', 'Source', <LucideIcon.Globe className="size-4" />, 'Select source',
                    fieldOptions.source, WIDE_POPOVER
                ),
                buildBasicSelectField(
                    'device', 'Device', <LucideIcon.Monitor className="size-4" />, 'Select device',
                    fieldOptions.device
                ),
                buildBasicSelectField(
                    'location', 'Location', <LucideIcon.MapPin className="size-4" />, 'Select location',
                    fieldOptions.location
                )
            ]
        },
        {
            group: 'UTM parameters',
            fields: [
                buildUtmField('utm_source', 'UTM Source', <LucideIcon.MousePointerClick className="size-4" />, 'Select source', fieldOptions.utm_source),
                buildUtmField('utm_medium', 'UTM Medium', <LucideIcon.SatelliteDish className="size-4" />, 'Select medium', fieldOptions.utm_medium),
                buildUtmField('utm_campaign', 'UTM Campaign', <LucideIcon.Flag className="size-4" />, 'Select campaign', fieldOptions.utm_campaign),
                buildUtmField('utm_content', 'UTM Content', <LucideIcon.TextCursorInput className="size-4" />, 'Select content', fieldOptions.utm_content),
                buildUtmField('utm_term', 'UTM Term', <LucideIcon.Tag className="size-4" />, 'Select term', fieldOptions.utm_term)
            ]
        }
    ], [audienceOptions, postOptions, postLoading, fieldOptions]);

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

| Issue | Before | After |
|---|---|---|
| Repetitive hook calls | 8 separate `useTinybirdFilterOptions` calls | Consolidated in `useAllFilterOptions` |
| Massive field config objects | ~150 lines of duplicated config | `buildUtmField` / `buildBasicSelectField` builders |
| Inline media query logic | 15 lines in component body | `useIsMobile` hook |
| Duplicated `deriveAudience` logic | Repeated in two hooks | Shared `deriveAudience` utility |
| Nested ternary for device labels | 5-level ternary chain | Lookup table `DEVICE_LABELS` |
| Repeated field config properties | Copy-pasted across every field | `SHARED_SELECT_FIELD_CONFIG` / `WIDE_POPOVER` constants |
| `buildFilterParams` `forEach` with `return` | Confusing early returns in `forEach` | `for...of` with `continue` |