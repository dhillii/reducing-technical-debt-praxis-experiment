```typescript
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import { Button, Filter, FilterFieldConfig, Filters, LucideIcon } from '@tryghost/shade';
import { STATS_LABEL_MAPPINGS, UNKNOWN_LOCATION_VALUES } from '@src/utils/constants';
import { formatQueryDate, getRangeDates } from '@tryghost/shade';
import { getAudienceFromFilterValues, getAudienceQueryParam } from '@src/utils/audience';
import { useAppContext } from '@src/app';
import { useGlobalData } from '@src/providers/global-data-provider';
import { useTinybirdQuery } from '@tryghost/admin-x-framework';
import { useTopContent } from '@tryghost/admin-x-framework/api/stats';

countries.registerLocale(enLocale);

interface StatsFilterProps extends Omit<React.ComponentProps<typeof Filters>, 'fields' | 'onChange'> {
    filters: Filter[];
    onChange?: (filters: Filter[]) => void;
}

// Helper to get country name from code
const getCountryName = (code: string): string => {
    return STATS_LABEL_MAPPINGS[code as keyof typeof STATS_LABEL_MAPPINGS] || countries.getName(code, 'en') || code;
};

// Helper component for visit count badge - used by all filter options
const VisitCountBadge = ({ visits }: { visits: number }) => (
    <span className="order-2 font-mono text-xs text-muted-foreground">
        {visits.toLocaleString()}
    </span>
);

// Configuration for each filter field type
interface FilterFieldDefinition {
    endpoint: string;
    valueKey: string;
    transformValue?: (value: string) => { value: string; label: string };
    filterItem?: (item: Record<string, unknown>) => boolean;
}

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    utm_source: {
        endpoint: 'api_top_utm_sources',
        valueKey: 'utm_source',
        transformValue: v => ({ value: v || '(not set)', label: v || '(not set)' })
    },
    utm_medium: {
        endpoint: 'api_top_utm_mediums',
        valueKey: 'utm_medium',
        transformValue: v => ({ value: v || '(not set)', label: v || '(not set)' })
    },
    utm_campaign: {
        endpoint: 'api_top_utm_campaigns',
        valueKey: 'utm_campaign',
        transformValue: v => ({ value: v || '(not set)', label: v || '(not set)' })
    },
    utm_content: {
        endpoint: 'api_top_utm_contents',
        valueKey: 'utm_content',
        transformValue: v => ({ value: v || '(not set)', label: v || '(not set)' })
    },
    utm_term: {
        endpoint: 'api_top_utm_terms',
        valueKey: 'utm_term',
        transformValue: v => ({ value: v || '(not set)', label: v || '(not set)' })
    },
    source: {
        endpoint: 'api_top_sources',
        valueKey: 'source',
        transformValue: v => ({ value: v || '', label: v || 'Direct' })
    },
    location: {
        endpoint: 'api_top_locations',
        valueKey: 'location',
        filterItem(item) {
            const location = String(item.location || '');
            return location !== '' && !UNKNOWN_LOCATION_VALUES.includes(location);
        },
        transformValue: v => ({ value: v, label: getCountryName(v) })
    },
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: getDeviceLabel
    }
};

// Extracted device label mapping function
const getDeviceLabel = (value: string): { value: string; label: string } => {
    const labelMap: Record<string, string> = {
        'mobile-ios': 'iOS',
        'mobile-android': 'Android',
        'desktop': 'Desktop',
        'bot': 'Bot',
        'unknown': 'Unknown'
    };
    return { value, label: labelMap[value] || value };
};

// Build filter params for Tinybird API, excluding the specified field to avoid circular filtering
const buildFilterParams = (
    currentFilters: Filter[],
    excludeField: string,
    baseParams: Record<string, string>
): Record<string, string> => {
    const params = { ...baseParams };

    currentFilters.forEach((filter) => {
        if (filter.field === excludeField || filter.values.length === 0) {
            return;
        }

        const value = filter.values[0] as string;

        if (filter.field === 'post') {
            if (value.startsWith('/')) {
                params.pathname = value;
            } else {
                params.post_uuid = value;
            }
        } else if (filter.field === 'audience') {
            return;
        } else if (filter.field === 'source' || filter.field === 'device' || filter.field === 'location' || filter.field.startsWith('utm_')) {
            params[filter.field] = value;
        }
    });

    return params;
};

interface UseTinybirdFilterOptionsConfig {
    enabled?: boolean;
}

// Generic hook to fetch filter options from Tinybird
// Handles the common pattern: fetch data, transform to options, ensure selected value is included
const useTinybirdFilterOptions = (
    fieldKey: string,
    currentFilters: Filter[] = [],
    config: UseTinybirdFilterOptionsConfig = {}
) => {
    const { enabled = true } = config;
    const { statsConfig, range } = useGlobalData();
    const { startDate, endDate, timezone } = getRangeDates(range);

    const definition = FILTER_FIELD_DEFINITIONS[fieldKey];

    // Derive audience from filters (URL is the source of truth)
    const audience = useMemo(() => {
        const audienceFilter = currentFilters.find(f => f.field === 'audience');
        return getAudienceFromFilterValues(audienceFilter?.values as string[] | undefined);
    }, [currentFilters]);

    // Build params including filters from other fields
    const params = useMemo(() => {
        const baseParams: Record<string, string> = {
            site_uuid: statsConfig?.id || '',
            date_from: formatQueryDate(startDate),
            date_to: formatQueryDate(endDate),
            timezone: timezone,
            member_status: getAudienceQueryParam(audience),
            limit: '50'
        };

        return buildFilterParams(currentFilters, fieldKey, baseParams);
    }, [statsConfig?.id, startDate, endDate, timezone, audience, currentFilters, fieldKey]);

    const { data, loading } = useTinybirdQuery({
        endpoint: definition?.endpoint || '',
        statsConfig,
        params,
        enabled: enabled && !!definition
    });

    const options = useMemo(() => {
        if (!definition) {
            return [];
        }

        const items = (data as unknown as Array<Record<string, unknown>>) || [];

        // Filter and transform items
        return items
            .filter(item => (definition.filterItem ? definition.filterItem(item) : true))
            .map((item) => {
                const rawValue = String(item[definition.valueKey] ?? '');
                const visits = Number(item.visits) || 0;
                const { value, label } = definition.transformValue
                    ? definition.transformValue(rawValue)
                    : { value: rawValue, label: rawValue };

                return {
                    label,
                    value,
                    icon: <VisitCountBadge visits={visits} />
                };
            });
    }, [data, definition]);

    return { options, loading };
};

interface UsePostOptionsConfig {
    enabled?: boolean;
}

// Hook to fetch posts/pages options from Ghost API (which queries Tinybird and enriches with titles)
// This uses a different API pattern so it can't use the generic hook
const usePostOptions = (currentFilters: Filter[] = [], config: UsePostOptionsConfig = {}) => {
    const { enabled = true } = config;
    const { range } = useGlobalData();
    const { startDate, endDate, timezone } = getRangeDates(range);

    // Derive audience from filters (URL is the source of truth)
    const audience = useMemo(() => {
        const audienceFilter = currentFilters.find(f => f.field === 'audience');
        return getAudienceFromFilterValues(audienceFilter?.values as string[] | undefined);
    }, [currentFilters]);

    // Build query params including filters from other fields (excluding post to avoid circular filtering)
    const queryParams = useMemo(() => {
        const baseParams: Record<string, string> = {
            date_from: formatQueryDate(startDate),
            date_to: formatQueryDate(endDate),
            member_status: getAudienceQueryParam(audience)
        };

        if (timezone) {
            baseParams.timezone = timezone;
        }

        return buildFilterParams(currentFilters, 'post', baseParams);
    }, [startDate, endDate, timezone, audience, currentFilters]);

    // Fetch top content data from Ghost API (which queries Tinybird and enriches with titles)
    const { data: topContentData, isLoading } = useTopContent({
        searchParams: queryParams,
        enabled
    });

    const options = useMemo(() => {
        const stats = topContentData?.stats;

        // Deduplicate items - prefer post_uuid for posts/pages, use pathname for other content
        const seen = new Set<string>();
        return (stats || [])
            .filter(createPostFilter)
            .map(createPostOption);
    }, [topContentData]);

    return { options, loading: isLoading };
};

// Extracted post filtering logic
const createPostFilter = (item: Record<string, unknown>): boolean => {
    const hasValidPostUuid = item.post_uuid && item.post_uuid !== '' && item.post_uuid !== 'undefined';
    const uniqueKey = hasValidPostUuid ? `uuid:${item.post_uuid}` : `path:${item.pathname}`;

    if (seen.has(uniqueKey)) {
        return false;
    }
    seen.add(uniqueKey);
    return true;
};

// Extracted post option mapping logic
const createPostOption = (item: Record<string, unknown>): { label: string; value: string; icon: React.ReactNode } => {
    const visits = item.visits || 0;
    const hasValidPostUuid = item.post_uuid && item.post_uuid !== '' && item.post_uuid !== 'undefined';
    const filterValue = hasValidPostUuid ? item.post_uuid! : item.pathname;

    return {
        label: item.title || item.pathname || '(Untitled)',
        value: filterValue,
        icon: <VisitCountBadge visits={visits} />
    };
};

// Extracted audience options filtering logic
const createAudienceOptions = (appSettings: { paidMembersEnabled?: boolean }): { value: string; label: string; icon: React.ReactNode }[] => {
    const options = [
        { value: 'undefined', label: 'Public visitors', icon: <LucideIcon.Globe className='text-gray-700' /> },
        { value: 'free', label: 'Free members', icon: <LucideIcon.User className='text-green' /> },
        { value: 'paid', label: 'Paid members', icon: <LucideIcon.UserPlus className='text-orange' /> }
    ];
    return appSettings?.paidMembersEnabled ? options : options.filter(opt => opt.value !== 'paid');
};

// Extracted UTM field configuration
const createUtmFilterFieldConfig = (
    key: string,
    label: string,
    icon: React.ReactNode,
    options: any[],
    isLoading: boolean
): FilterFieldConfig => ({
    key,
    label,
    type: 'select',
    icon,
    placeholder: `Select ${label.replace('UTM ', '').toLowerCase()}`,
    operators: [{ value: 'is', label: 'is' }],
    defaultOperator: 'is',
    hideOperatorSelect: true,
    options,
    isLoading,
    searchable: true,
    selectedOptionsClassName: 'hidden'
});

// Extracted basic field configuration
const createBasicFilterFieldConfig = (
    key: string,
    label: string,
    type: 'select' | 'multiselect',
    icon: React.ReactNode,
    options: any[],
    searchable: boolean = true,
    className?: string,
    popoverContentClassName?: string
): FilterFieldConfig => ({
    key,
    label,
    type,
    icon,
    options,
    searchable,
    isLoading: false,
    operators: [{ value: 'is', label: 'is' }],
    defaultOperator: 'is',
    hideOperatorSelect: true,
    selectedOptionsClassName: 'hidden',
    ...(className && { className }),
    ...(popoverContentClassName && { popoverContentClassName })
});

function StatsFilter({ filters, onChange, ...props }: StatsFilterProps) {
    const { appSettings } = useAppContext();

    // Track which filter field is currently being selected (lazy loading)
    const [activeFilterField, setActiveFilterField] = useState<string | null>(null);

    // Track screen width for responsive popover alignment
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 1024px)'); // lg breakpoint

        const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
            setIsMobile(e.matches);
        };

        // Set initial value
        handleChange(mediaQuery);

        // Listen for changes
        mediaQuery.addEventListener('change', handleChange);

        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Filter audience options based on site settings
    const audienceOptions = useMemo(() => createAudienceOptions(appSettings), [appSettings?.paidMembersEnabled]);

    // Helper: determine if a filter field should fetch options
    // Enable fetching when the field is active OR has an applied filter value (for label display)
    const shouldFetchOptions = useCallback((fieldKey: string) => {
        const isActive = activeFilterField === fieldKey;
        const hasAppliedFilter = filters.some(f => f.field === fieldKey);
        return isActive || hasAppliedFilter;
    }, [activeFilterField, filters]);

    // Fetch options for all Tinybird-backed fields using the generic hook
    // Options are contextual - filtered based on currently applied filters
    // Lazy loading: only fetch when field is active or has applied filter
    const { options: utmSourceOptions, loading: utmSourceLoading } = useTinybirdFilterOptions('utm_source', filters, { enabled: shouldFetchOptions('utm_source') });
    const { options: utmMediumOptions, loading: utmMediumLoading } = useTinybirdFilterOptions('utm_medium', filters, { enabled: shouldFetchOptions('utm_medium') });
    const { options: utmCampaignOptions, loading: utmCampaignLoading } = useTinybirdFilterOptions('utm_campaign', filters, { enabled: shouldFetchOptions('utm_campaign') });
    const { options: utmContentOptions, loading: utmContentLoading } = useTinybirdFilterOptions('utm_content', filters, { enabled: shouldFetchOptions('utm_content') });
    const { options: utmTermOptions, loading: utmTermLoading } = useTinybirdFilterOptions('utm_term', filters, { enabled: shouldFetchOptions('utm_term') });
    const { options: sourceOptions, loading: sourceLoading } = useTinybirdFilterOptions('source', filters, { enabled: shouldFetchOptions('source') });
    const { options: deviceOptions, loading: deviceLoading } = useTinybirdFilterOptions('device', filters, { enabled: shouldFetchOptions('device') });
    const { options: locationOptions, loading: locationLoading } = useTinybirdFilterOptions('location', filters, { enabled: shouldFetchOptions('location') });

    // Fetch options for posts - data is contextual based on current filters
    const { options: postOptions, loading: postLoading } = usePostOptions(filters, { enabled: shouldFetchOptions('post') });

    // Note: Only 'is' operator supported - Tinybird pipes only support exact match
    const supportedOperators = useMemo(() => [{ value: 'is', label: 'is' }], []);

    // Grouped fields - memoized to avoid recreation on every render
    const groupedFields = useMemo(() => {
        const utmFields = [
            createUtmFilterFieldConfig('utm_source', 'UTM Source', <LucideIcon.MousePointerClick className="size-4" />, utmSourceOptions, utmSourceLoading),
            createUtmFilterFieldConfig('utm_medium', 'UTM Medium', <LucideIcon.SatelliteDish className="size-4" />, utmMediumOptions, utmMediumLoading),
            createUtmFilterFieldConfig('utm_campaign', 'UTM Campaign', <LucideIcon.Flag className="size-4" />, utmCampaignOptions, utmCampaignLoading),
            createUtmFilterFieldConfig('utm_content', 'UTM Content', <LucideIcon.TextCursorInput className="size-4" />, utmContentOptions, utmContentLoading),
            createUtmFilterFieldConfig('utm_term', 'UTM Term', <LucideIcon.Tag className="size-4" />, utmTermOptions, utmTermLoading)
        ];

        return [
            {
                group: 'Basic',
                fields: [
                    createBasicFilterFieldConfig('audience', 'Audience', 'multiselect', <LucideIcon.Users />, audienceOptions.map(({ value, label, icon }) => ({ value, label, icon }))),
                    createBasicFilterFieldConfig('post', 'Post or page', 'select', <LucideIcon.PenLine />, postOptions, true, 'w-80', 'w-80'),
                    createBasicFilterFieldConfig('source', 'Source', 'select', <LucideIcon.Globe className="size-4" />, sourceOptions, true, 'w-60', 'w-60'),
                    createBasicFilterFieldConfig('device', 'Device', 'select', <LucideIcon.Monitor className="size-4" />, deviceOptions, true),
                    createBasicFilterFieldConfig('location', 'Location', 'select', <LucideIcon.MapPin className="size-4" />, locationOptions, true)
                ]
            },
            {
                group: 'UTM parameters',
                fields: utmFields
            }
        ];
    }, [utmSourceOptions, utmSourceLoading, utmMediumOptions, utmMediumLoading, utmCampaignOptions, utmCampaignLoading, utmContentOptions, utmContentLoading, utmTermOptions, utmTermLoading, supportedOperators, postOptions, postLoading, audienceOptions, sourceOptions, sourceLoading, deviceOptions, deviceLoading, locationOptions, locationLoading]);

    // Show clear button when there's at least one filter
    const hasFilters = filters.length > 0;

    const handleClearFilters = useCallback(() => {
        if (onChange) {
            onChange([]);
        }
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
                popoverAlign={isMobile ? 'start' : (hasFilters ? 'start' : 'end')}
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
};

export default StatsFilter;
```