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

interface StatsFilterProps extends Omit<React.ComponentProps<typeof Filters>, 'fields' | 'onChange'> {
    filters: Filter[];
    onChange?: (filters: Filter[]) => void;
}

// Helper to get country name from code
const getCountryName = (code: string): string => {
    return STATS_LABEL_MAPPINGS[code as keyof typeof STATS_LABEL_MAPPINGS] || countries.getName(code, 'en') || code;
};

// Helper component for visit count badge - used by all filter options
const VisitCountBadge = ({visits}: {visits: number}) => (
    <span className="order-2 font-mono text-xs text-muted-foreground">
        {visits.toLocaleString()}
    </span>
);

// Configuration for each filter field type
interface FilterFieldDefinition {
    endpoint: string;
    valueKey: string;
    // Transform value and get display label
    transformValue?: (value: string) => {value: string; label: string};
    // Filter out invalid items from API response
    filterItem?: (item: Record<string, unknown>) => boolean;
}

// Transform device value to human-readable label
const transformDeviceLabel = (value: string): string => {
    const deviceLabelMap: Record<string, string> = {
        'mobile-ios': 'iOS',
        'mobile-android': 'Android',
        'desktop': 'Desktop',
        'bot': 'Bot',
        'unknown': 'Unknown'
    };
    return deviceLabelMap[value] || value;
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
        transformValue: v => ({
            value: v || '',
            label: v || 'Direct'
        })
    },
    location: {
        endpoint: 'api_top_locations',
        valueKey: 'location',
        filterItem(item) {
            const location = String(item.location || '');
            return location !== '' && !UNKNOWN_LOCATION_VALUES.includes(location);
        },
        transformValue: v => ({value: v, label: getCountryName(v)})
    },
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: v => ({
            value: v,
            label: transformDeviceLabel(v)
        })
    }
};

// Build filter params for Tinybird API, excluding the specified field to avoid circular filtering
const buildFilterParams = (
    currentFilters: Filter[],
    excludeField: string,
    baseParams: Record<string, string>
): Record<string, string> => {
    const params = {...baseParams};

    currentFilters.forEach((filter) => {
        if (filter.field === excludeField || filter.values.length === 0) {
            return;
        }

        const value = filter.values[0] as string;

        if (filter.field === 'post') {
            // Determine if the value is a post_uuid or a pathname
            if (value.startsWith('/')) {
                params.pathname = value;
            } else {
                params.post_uuid = value;
            }
        } else if (filter.field === 'audience') {
            // Skip audience - handled separately via member_status
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
    const {enabled = true} = config;
    const {statsConfig, range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);

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

        const items = (data as unknown as Array<Record<string, unknown>>) || [];

        // Filter and transform items
        return items
            .filter(item => (definition.filterItem ? definition.filterItem(item) : true))
            .map((item) => {
                const rawValue = String(item[definition.valueKey] ?? '');
                const visits = Number(item.visits) || 0;
                const {value, label} = definition.transformValue
                    ? definition.transformValue(rawValue)
                    : {value: rawValue, label: rawValue};

                return {
                    label,
                    value,
                    icon: <VisitCountBadge visits={visits} />
                };
            });
    }, [data, definition]);

    return {options, loading};
};

interface UsePostOptionsConfig {
    enabled?: boolean;
}

// Hook to fetch posts/pages options from Ghost API (which queries Tinybird and enriches with titles)
// This uses a different API pattern so it can't use the generic hook
const usePostOptions = (currentFilters: Filter[] = [], config: UsePostOptionsConfig = {}) => {
    const {enabled = true} = config;
    const {range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);

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
    const {data: topContentData, isLoading} = useTopContent({
        searchParams: queryParams,
        enabled
    });

    const options = useMemo(() => {
        const stats = topContentData?.stats;

        // Deduplicate items - prefer post_uuid for posts/pages, use pathname for other content
        const seen = new Set<string>();
        return (stats || [])
            .filter((item) => {
                // Create a unique key - prefer post_uuid if available, otherwise use pathname
                const hasValidPostUuid = item.post_uuid && item.post_uuid !== '' && item.post_uuid !== 'undefined';
                const uniqueKey = hasValidPostUuid ? `uuid:${item.post_uuid}` : `path:${item.pathname}`;

                if (seen.has(uniqueKey)) {
                    return false;
                }
                seen.add(uniqueKey);
                return true;
            })
            .map((item) => {
                const visits = item.visits || 0;
                // Use post_uuid as the filter value if available, otherwise use pathname
                const hasValidPostUuid = item.post_uuid && item.post_uuid !== '' && item.post_uuid !== 'undefined';
                const filterValue = hasValidPostUuid ? item.post_uuid! : item.pathname;

                return {
                    label: item.title || item.pathname || '(Untitled)',
                    value: filterValue,
                    icon: <VisitCountBadge visits={visits} />
                };
            });
    }, [topContentData]);

    return {options, loading: isLoading};
};

// Build audience filter options based on site settings
const buildAudienceOptions = (paidMembersEnabled: boolean) => {
    const allOptions = [
        {value: 'undefined', label: 'Public visitors', icon: <LucideIcon.Globe className='text-gray-700'/>},
        {value: 'free', label: 'Free members', icon: <LucideIcon.User className='text-green'/>},
        {value: 'paid', label: 'Paid members', icon: <LucideIcon.UserPlus className='text-orange'/>}
    ];
    return paidMembersEnabled ? allOptions : allOptions.filter(opt => opt.value !== 'paid');
};

// Create UTM filter field configurations
const createUtmFields = (
    supportedOperators: Array<{value: string; label: string}>,
    utmSourceOptions: Array<{label: string; value: string; icon: React.ReactNode}>,
    utmSourceLoading: boolean,
    utmMediumOptions: Array<{label: string; value: string; icon: React.ReactNode}>,
    utmMediumLoading: boolean,
    utmCampaignOptions: Array<{label: string; value: string; icon: React.ReactNode}>,
    utmCampaignLoading: boolean,
    utmContentOptions: Array<{label: string; value: string; icon: React.ReactNode}>,
    utmContentLoading: boolean,
    utmTermOptions: Array<{label: string; value: string; icon: React.ReactNode}>,
    utmTermLoading: boolean
): FilterFieldConfig[] => [
    {
        key: 'utm_source',
        label: 'UTM Source',
        type: 'select',
        icon: <LucideIcon.MousePointerClick className="size-4" />,
        placeholder: 'Select source',
        operators: supportedOperators,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        options: utmSourceOptions,
        isLoading: utmSourceLoading,
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    {
        key: 'utm_medium',
        label: 'UTM Medium',
        type: 'select',
        icon: <LucideIcon.SatelliteDish className="size-4" />,
        placeholder: 'Select medium',
        operators: supportedOperators,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        options: utmMediumOptions,
        isLoading: utmMediumLoading,
        className: 'w-60',
        popoverContentClassName: 'w-60',
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    {
        key: 'utm_campaign',
        label: 'UTM Campaign',
        type: 'select',
        icon: <LucideIcon.Flag className="size-4" />,
        placeholder: 'Select campaign',
        operators: supportedOperators,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        options: utmCampaignOptions,
        isLoading: utmCampaignLoading,
        className: 'w-60',
        popoverContentClassName: 'w-60',
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    {
        key: 'utm_content',
        label: 'UTM Content',
        type: 'select',
        icon: <LucideIcon.TextCursorInput className="size-4" />,
        placeholder: 'Select content',
        operators: supportedOperators,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        options: utmContentOptions,
        isLoading: utmContentLoading,
        className: 'w-60',
        popoverContentClassName: 'w-60',
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    {
        key: 'utm_term',
        label: 'UTM Term',
        type: 'select',
        icon: <LucideIcon.Tag className="size-4" />,
        placeholder: 'Select term',
        operators: supportedOperators,
        defaultOperator: 'is',
        hideOperatorSelect: true,
        options: utmTermOptions,
        isLoading: utmTermLoading,
        className: 'w-60',
        popoverContentClassName: 'w-60',
        searchable: true,
        selectedOptionsClassName: 'hidden'
    }
];

// Create basic filter field configurations
const createBasicFields = (
    supportedOperators: Array