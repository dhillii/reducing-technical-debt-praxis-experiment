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

/** Device label transformation strategy */
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

/** UTM parameter transformation strategy */
const transformUtmValue = (value: string): {value: string; label: string} => ({
    value: value || '(not set)',
    label: value || '(not set)'
});

/** Source transformation strategy */
const transformSourceValue = (value: string): {value: string; label: string} => ({
    value: value || '',
    label: value || 'Direct'
});

/** Location transformation strategy */
const transformLocationValue = (value: string): {value: string; label: string} => ({
    value: value,
    label: getCountryName(value)
});

/** Device transformation strategy */
const transformDeviceValue = (value: string): {value: string; label: string} => ({
    value: value,
    label: transformDeviceLabel(value)
});

/** Location filter predicate */
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
        transformValue: transformDeviceValue
    }
};

/** Build filter parameters for Tinybird API, excluding specified field */
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

/** Fetch filter options from Tinybird with transformation and deduplication */
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

/** Determine if post UUID is valid */
const isValidPostUuid = (uuid: string | undefined): boolean => {
    return uuid !== undefined && uuid !== '' && uuid !== 'undefined';
};

/** Get unique key for post deduplication */
const getPostUniqueKey = (item: {post_uuid?: string; pathname: string}): string => {
    return isValidPostUuid(item.post_uuid) ? `uuid:${item.post_uuid}` : `path:${item.pathname}`;
};

/** Get filter value for post item */
const getPostFilterValue = (item: {post_uuid?: string; pathname: string}): string => {
    return isValidPostUuid(item.post_uuid) ? item.post_uuid! : item.pathname;
};

/** Fetch posts/pages options from Ghost API */
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
                const uniqueKey = getPostUniqueKey(item);

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

/** Create UTM field configuration */
const createUtmFieldConfig = (
    key: string,
    label: string,
    icon: React.ReactNode,
    options: Array<{label: string; value: string; icon: React.ReactNode}>,
    isLoading: boolean,
    supportedOperators: Array<{value: string; label: string}>
): FilterFieldConfig => ({
    key,
    label,
    type: 'select',
    icon,
    placeholder: `Select ${label.toLowerCase()}`,
    operators: supportedOperators,
    defaultOperator: 'is',
    hideOperatorSelect: true,
    options,
    isLoading,
    className: 'w-60',
    popoverContentClassName: 'w-60',
    searchable: true,
    selectedOptionsClassName: 'hidden'
});

/** Create basic filter field configuration */
const createBasicFieldConfig = (
    key: string,
    label: string,
    type: 'select' | 'multiselect',
    icon: React.ReactNode,
    options: Array<{label: string; value: string; icon?: React.ReactNode}>,
    supportedOperators: Array<{value: string; label: string}>,
    isLoading?: boolean,
    searchable?: boolean
): FilterFieldConfig => {
    const config: FilterFieldConfig = {
        key,
        label,
        type,
        icon,
        operators: supportedOperators,
        defaultOperator: type === 'multiselect' ? 'is any of' : 'is',
        hideOperatorSelect: true,
        options,
        selectedOptionsClassName: 'hidden'
    };

    if (type === 'multiselect') {
        config.autoCloseOnSelect = true;
    } else {
        config.placeholder = `Select ${label.toLowerCase()}`;
        if (isLoading !== undefined) {
            config.isLoading = isLoading;
        }
        if (searchable !== undefined) {
            config.searchable = searchable;
        }
        if (key === 'post') {
            config.className = 'w-80';
            config.popoverContentClassName = 'w-80';
        } else if (key !== 'device') {
            config.className = 'w-60';
            config.popoverContentClassName = 'w-60';
        }
    }

    return config;
};

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
    const {options: utmContentOptions, loading: utmContentLoading} = useTinybirdFilterOptions('utm_content', filters, {enabled: shouldFetchOptions('utm_content')});
    const {options: utmTermOptions, loading: utmTermLoading} = useTinybirdFilterOptions('utm_term', filters, {enabled: shouldFetchOptions('utm_term')});
    const {options: sourceOptions, loading: sourceLoading} = useTinybirdFilterOptions('source', filters, {enabled: shouldFetchOptions('source')});
    const {options: deviceOptions, loading: deviceLoading} = useTinybirdFilterOptions('device', filters, {enabled: shouldFetchOptions('device')});
    const {options: locationOptions, loading: locationLoading} = useTinybirdFilterOptions('location', filters, {enabled: shouldFetchOptions('location')});

    const {options: postOptions, loading: postLoading} = usePostOptions(filters, {enabled: shouldFetchOptions('post')});

    const supportedOperators = useMemo(() => [
        {value: 'is', label: 'is'}
    ], []);

    const groupedFields: FilterFieldConfig[] = useMemo(() => {
        const utmFields: FilterFieldConfig[] = [
            createUtmFieldConfig('utm_source', 'UTM Source', <LucideIcon.MousePointerClick className="size-4" />, utmSourceOptions, utmSourceLoading, supportedOperators),
            createUtmFieldConfig('utm_medium', 'UTM Medium', <LucideIcon.SatelliteDish className="size-4" />, utmMediumOptions, utmMediumLoading, supportedOperators),
            createUtmFieldConfig('utm_campaign', 'UTM Campaign', <LucideIcon.Flag className="size-4" />, utmCampaignOptions, utmCampaignLoading, supportedOperators),
            createUtmFieldConfig('utm_content', 'UTM Content', <LucideIcon.TextCursorInput className="size-4" />, utmContentOptions, utmContentLoading, supportedOperators),
            createUtmFieldConfig('utm_term', 'UTM Term', <LucideIcon.Tag className="size-4" />, utmTermOptions, utmTermLoading, supportedOperators)
        ];

        const basicFields: FilterFieldConfig[] = [
            createBasicFieldConfig('audience', 'Audience', 'multiselect', <LucideIcon.Users />, audienceOptions.map(({value, label, icon}) => ({value, label, icon})), supportedOperators),
            createBasicFieldConfig('post', 'Post or page', 'select', <LucideIcon.PenLine />, postOptions, supportedOperators, postLoading, true),
            createBasicFieldConfig('source', 'Source', 'select', <LucideIcon.Globe className="size-4" />, sourceOptions, supportedOperators, sourceLoading, true),
            createBasicFieldConfig('device', 'Device', 'select', <LucideIcon.Monitor className="size-4" />, deviceOptions, supportedOperators, deviceLoading),
            createBasicFieldConfig('location', 'Location', 'select', <LucideIcon.MapPin className="size-4" />, locationOptions, supportedOperators, locationLoading, true)
        ];

        return [
            {
                group: 'Basic',
                fields: basicFields
            },
            {
                group: 'UTM parameters',
                fields: utmFields
            }
        ];
    }, [utmSourceOptions, utmSourceLoading, utmMediumOptions, utmMediumLoading, utmCampaignOptions, utmCampaignLoading, utmContentOptions, utmContentLoading, utmTermOptions, utmTermLoading, supportedOperators, postOptions, postLoading, audienceOptions, sourceOptions, sourceLoading, deviceOptions, deviceLoading, locationOptions, locationLoading]);

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
}

export default StatsFilter;