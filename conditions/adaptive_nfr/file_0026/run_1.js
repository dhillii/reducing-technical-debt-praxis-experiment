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

/** Get country name from ISO code, with fallback to code itself */
const getCountryName = (code: string): string => {
    return STATS_LABEL_MAPPINGS[code as keyof typeof STATS_LABEL_MAPPINGS] || countries.getName(code, 'en') || code;
};

/** Badge component displaying visit count for filter options */
const VisitCountBadge = ({visits}: {visits: number}) => (
    <span className="order-2 font-mono text-xs text-muted-foreground">
        {visits.toLocaleString()}
    </span>
);

interface FilterFieldDefinition {
    endpoint: string;
    valueKey: string;
    transformValue?: (value: string) => {value: string; label: string};
    filterItem?: (item: Record<string, unknown>) => boolean;
}

/** Device type label transformer */
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

/** UTM parameter value transformer - handles empty values */
const transformUtmValue = (value: string): {value: string; label: string} => ({
    value: value || '(not set)',
    label: value || '(not set)'
});

/** Source value transformer - handles empty values */
const transformSourceValue = (value: string): {value: string; label: string} => ({
    value: value || '',
    label: value || 'Direct'
});

/** Location value transformer - converts code to country name */
const transformLocationValue = (value: string): {value: string; label: string} => ({
    value,
    label: getCountryName(value)
});

/** Filter predicate for location items - excludes unknown locations */
const isValidLocation = (item: Record<string, unknown>): boolean => {
    const location = String(item.location || '');
    return location !== '' && !UNKNOWN_LOCATION_VALUES.includes(location);
};

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    utm_source: {
        endpoint: 'api_top_utm_sources',
        valueKey: 'utm_source',
        transformValue: transformUtmValue
    },
    utm_medium: {
        endpoint: 'api_top_utm_mediums',
        valueKey: 'utm_medium',
        transformValue: transformUtmValue
    },
    utm_campaign: {
        endpoint: 'api_top_utm_campaigns',
        valueKey: 'utm_campaign',
        transformValue: transformUtmValue
    },
    utm_content: {
        endpoint: 'api_top_utm_contents',
        valueKey: 'utm_content',
        transformValue: transformUtmValue
    },
    utm_term: {
        endpoint: 'api_top_utm_terms',
        valueKey: 'utm_term',
        transformValue: transformUtmValue
    },
    source: {
        endpoint: 'api_top_sources',
        valueKey: 'source',
        transformValue: transformSourceValue
    },
    location: {
        endpoint: 'api_top_locations',
        valueKey: 'location',
        filterItem: isValidLocation,
        transformValue: transformLocationValue
    },
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: (v) => ({
            value: v,
            label: transformDeviceLabel(v)
        })
    }
};

/** Determine if filter value is a post UUID */
const isPostUuid = (value: string): boolean => {
    return !value.startsWith('/');
};

/** Add post filter to params based on value type */
const addPostFilterParam = (
    params: Record<string, string>,
    value: string
): void => {
    if (isPostUuid(value)) {
        params.post_uuid = value;
    } else {
        params.pathname = value;
    }
};

/** Determine if field should be included in filter params */
const isFilterableField = (field: string): boolean => {
    return field === 'source' || field === 'device' || field === 'location' || field.startsWith('utm_');
};

/** Build filter params for Tinybird API, excluding the specified field */
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
            addPostFilterParam(params, value);
        } else if (filter.field === 'audience') {
            return;
        } else if (isFilterableField(filter.field)) {
            params[filter.field] = value;
        }
    });

    return params;
};

interface UseTinybirdFilterOptionsConfig {
    enabled?: boolean;
}

/** Generic hook to fetch filter options from Tinybird with transformation and deduplication */
const useTinybirdFilterOptions = (
    fieldKey: string,
    currentFilters: Filter[] = [],
    config: UseTinybirdFilterOptionsConfig = {}
) => {
    const {enabled = true} = config;
    const {statsConfig, range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);

    const definition = FILTER_FIELD_DEFINITIONS[fieldKey];

    const audience = useMemo(() => {
        const audienceFilter = currentFilters.find(f => f.field === 'audience');
        return getAudienceFromFilterValues(audienceFilter?.values as string[] | undefined);
    }, [currentFilters]);

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

/** Determine if post item has valid UUID */
const hasValidPostUuid = (item: {post_uuid?: string}): boolean => {
    return !!(item.post_uuid && item.post_uuid !== '' && item.post_uuid !== 'undefined');
};

/** Create unique key for post deduplication */
const createPostUniqueKey = (item: {post_uuid?: string; pathname: string}): string => {
    return hasValidPostUuid(item) ? `uuid:${item.post_uuid}` : `path:${item.pathname}`;
};

/** Get filter value for post item - prefers UUID over pathname */
const getPostFilterValue = (item: {post_uuid?: string; pathname: string}): string => {
    return hasValidPostUuid(item) ? item.post_uuid! : item.pathname;
};

/** Hook to fetch posts/pages options from Ghost API */
const usePostOptions = (currentFilters: Filter[] = [], config: UsePostOptionsConfig = {}) => {
    const {enabled = true} = config;
    const {range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);

    const audience = useMemo(() => {
        const audienceFilter = currentFilters.find(f => f.field === 'audience');
        return getAudienceFromFilterValues(audienceFilter?.values as string[] | undefined);
    }, [currentFilters]);

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

    const {data: topContentData, isLoading} = useTopContent({
        searchParams: queryParams,
        enabled
    });

    const options = useMemo(() => {
        const stats = topContentData?.stats;

        const seen = new Set<string>();
        return (stats || [])
            .filter((item) => {
                const uniqueKey = createPostUniqueKey(item);

                if (seen.has(uniqueKey)) {
                    return false;
                }
                seen.add(uniqueKey);
                return true;
            })
            .map((item) => {
                const visits = item.visits || 0;
                const filterValue = getPostFilterValue(item);

                return {
                    label: item.title || item.pathname || '(Untitled)',
                    value: filterValue,
                    icon: <VisitCountBadge visits={visits} />
                };
            });
    }, [topContentData]);

    return {options, loading: isLoading};
};

/** Configuration for UTM filter field */
interface UtmFieldConfig {
    key: string;
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    options: Array<{label: string; value: string; icon: React.ReactNode}>;
    isLoading: boolean;
}

/** Create UTM filter field configuration */
const createUtmFieldConfig = (config: UtmFieldConfig): FilterFieldConfig => ({
    key: config.key,
    label: config.label,
    type: 'select',
    icon: config.icon,
    placeholder: config.placeholder,
    operators: [{value: 'is', label: 'is'}],
    defaultOperator: 'is',
    hideOperatorSelect: true,
    options: config.options,
    isLoading: config.isLoading,
    className: 'w-60',
    popoverContentClassName: 'w-60',
    searchable: true,
    selectedOptionsClassName: 'hidden'
});

/** Create basic filter field configuration */
interface BasicFieldConfig {
    key: string;
    label: string;
    type: 'select' | 'multiselect';
    icon: React.ReactNode;
    placeholder?: string;
    options: Array<{label: string; value: string; icon?: React.ReactNode}>;
    isLoading?: boolean;
    searchable?: boolean;
    className?: string;
    popoverContentClassName?: string;
}

const createBasicFieldConfig = (config: BasicFieldConfig, operators: Array<{value: string; label: string}>): FilterFieldConfig => ({
    key: config.key,
    label: config.label,
    type: config.type,
    icon: config.icon,
    placeholder: config.placeholder,
    operators,
    defaultOperator: config.type === 'multiselect' ? 'is any of' : 'is',
    hideOperatorSelect: true,
    options: config.options,
    isLoading: config.isLoading,
    className: config.className,
    popoverContentClassName: config.popoverContentClassName,
    searchable: config.searchable,
    selectedOptionsClassName: 'hidden',
    autoCloseOnSelect: config.type === 'multiselect'
});

function StatsFilter({filters, onChange, ...props}: StatsFilterProps) {
    const {appSettings} = useAppContext();

    const [activeFilterField, setActiveFilterField] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 1024px)');

        const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
            setIsMobile(e.matches);
        };

        handleChange(mediaQuery);
        mediaQuery.addEventListener('change', handleChange);

        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    const audienceOptions = useMemo(() => {
        const options = [
            {value: 'undefined', label: 'Public visitors', icon: <LucideIcon.Globe className='text-gray-700'/>},
            {value: 'free', label: 'Free members', icon: <LucideIcon.User className='text-green'/>},
            {value: 'paid', label: 'Paid members', icon: <LucideIcon.UserPlus className='text-orange'/>}
        ];
        return appSettings?.paidMembersEnabled ? options : options.filter(opt => opt.value !== 'paid');
    }, [appSettings?.paidMembersEnabled]);

    const shouldFetchOptions = useCallback((fieldKey: string) => {
        const isActive = activeFilterField === fieldKey;
        const hasAppliedFilter = filters.some(f => f.field === fieldKey);
        return isActive || hasAppliedFilter;
    }, [activeFilterField, filters]);

    const {options: utmSourceOptions, loading: utmSourceLoading} = useTinybirdFilterOptions('utm_source', filters, {enabled: shouldFetchOptions('utm_source')});
    const {options: utmMediumOptions, loading: utmMediumLoading} = useTinybirdFilterOptions('utm_medium', filters, {enabled: shouldFetchOptions('utm_medium')});
    const {options: utmCampaignOptions, loading: utmCampaignLoading} = useTinybirdFilterOptions('utm_campaign', filters, {enabled: shouldFetchOptions('utm_campaign')});