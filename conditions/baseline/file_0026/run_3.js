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

const getCountryName = (code: string): string => {
    return STATS_LABEL_MAPPINGS[code as keyof typeof STATS_LABEL_MAPPINGS] || countries.getName(code, 'en') || code;
};

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

const createUTMFieldDefinition = (fieldName: string): FilterFieldDefinition => ({
    endpoint: `api_top_${fieldName}s`,
    valueKey: fieldName,
    transformValue: v => ({value: v || '(not set)', label: v || '(not set)'})
});

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    utm_source: createUTMFieldDefinition('utm_source'),
    utm_medium: createUTMFieldDefinition('utm_medium'),
    utm_campaign: createUTMFieldDefinition('utm_campaign'),
    utm_content: createUTMFieldDefinition('utm_content'),
    utm_term: createUTMFieldDefinition('utm_term'),
    source: {
        endpoint: 'api_top_sources',
        valueKey: 'source',
        transformValue: v => ({value: v || '', label: v || 'Direct'})
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
        transformValue: v => {
            const deviceLabels: Record<string, string> = {
                'mobile-ios': 'iOS',
                'mobile-android': 'Android',
                'desktop': 'Desktop',
                'bot': 'Bot',
                'unknown': 'Unknown'
            };
            return {value: v, label: deviceLabels[v] || v};
        }
    }
};

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
            params[value.startsWith('/') ? 'pathname' : 'post_uuid'] = value;
        } else if (filter.field !== 'audience' && (filter.field === 'source' || filter.field === 'device' || filter.field === 'location' || filter.field.startsWith('utm_'))) {
            params[filter.field] = value;
        }
    });

    return params;
};

interface UseTinybirdFilterOptionsConfig {
    enabled?: boolean;
}

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
        if (!definition) return [];

        const items = (data as unknown as Array<Record<string, unknown>>) || [];
        return items
            .filter(item => (definition.filterItem ? definition.filterItem(item) : true))
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

interface UsePostOptionsConfig {
    enabled?: boolean;
}

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
        if (timezone) baseParams.timezone = timezone;
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
                const hasValidPostUuid = item.post_uuid && item.post_uuid !== '' && item.post_uuid !== 'undefined';
                const uniqueKey = hasValidPostUuid ? `uuid:${item.post_uuid}` : `path:${item.pathname}`;
                if (seen.has(uniqueKey)) return false;
                seen.add(uniqueKey);
                return true;
            })
            .map((item) => {
                const visits = item.visits || 0;
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

interface FilterFieldOptions {
    options: any[];
    loading: boolean;
}

interface FilterFieldsMap {
    [key: string]: FilterFieldOptions;
}

const useFilterFieldsData = (filters: Filter[], shouldFetchOptions: (field: string) => boolean) => {
    const utmFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    const basicFields = ['source', 'device', 'location'];
    const allFields = [...utmFields, ...basicFields, 'post'];

    const fieldsData: FilterFieldsMap = {};

    utmFields.forEach(field => {
        const {options, loading} = useTinybirdFilterOptions(field, filters, {enabled: shouldFetchOptions(field)});
        fieldsData[field] = {options, loading};
    });

    basicFields.forEach(field => {
        const {options, loading} = useTinybirdFilterOptions(field, filters, {enabled: shouldFetchOptions(field)});
        fieldsData[field] = {options, loading};
    });

    const {options: postOptions, loading: postLoading} = usePostOptions(filters, {enabled: shouldFetchOptions('post')});
    fieldsData.post = {options: postOptions, loading: postLoading};

    return fieldsData;
};

const createFilterFieldConfig = (
    key: string,
    label: string,
    icon: React.ReactNode,
    options: any[],
    isLoading: boolean,
    additionalConfig?: Partial<FilterFieldConfig>
): FilterFieldConfig => ({
    key,
    label,
    type: 'select',
    icon,
    placeholder: `Select ${label.toLowerCase()}`,
    operators: [{value: 'is', label: 'is'}],
    defaultOperator: 'is',
    hideOperatorSelect: true,
    options,
    isLoading,
    searchable: true,
    selectedOptionsClassName: 'hidden',
    ...additionalConfig
});

const createUTMFieldConfig = (
    key: string,
    label: string,
    icon: React.ReactNode,
    options: any[],
    isLoading: boolean
): FilterFieldConfig => createFilterFieldConfig(key, label, icon, options, isLoading, {
    className: 'w-60',
    popoverContentClassName: 'w-60'
});

const useMediaQuery = (query: string): boolean => {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia(query);
        const handleChange = (e: MediaQueryListEvent | MediaQueryList) => setMatches(e.matches);
        handleChange(mediaQuery);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [query]);

    return matches;
};

function StatsFilter({filters, onChange, ...props}: StatsFilterProps) {
    const {appSettings} = useAppContext();
    const [activeFilterField, setActiveFilterField] = useState<string | null>(null);
    const isMobile = useMediaQuery('(max-width: 1024px)');

    const shouldFetchOptions = useCallback((fieldKey: string) => {
        const isActive = activeFilterField === fieldKey;
        const hasAppliedFilter = filters.some(f => f.field === fieldKey);
        return isActive || hasAppliedFilter;
    }, [activeFilterField, filters]);

    const fieldsData = useFilterFieldsData(filters, shouldFetchOptions);

    const audienceOptions = useMemo(() => {
        const options = [
            {value: 'undefined', label: 'Public visitors', icon: <LucideIcon.Globe className='text-gray-700'/>},
            {value: 'free', label: 'Free members', icon: <LucideIcon.User className='text-green'/>},
            {value: 'paid', label: 'Paid members', icon: <LucideIcon.UserPlus className='text-orange'/>}
        ];
        return appSettings?.paidMembersEnabled ? options : options.filter(opt => opt.value !== 'paid');
    }, [appSettings?.paidMembersEnabled]);

    const supportedOperators = useMemo(() => [{value: 'is', label: 'is'}], []);

    const groupedFields: FilterFieldConfig[] = useMemo(() => {
        const utmFields: FilterFieldConfig[] = [
            createUTMFieldConfig('utm_source', 'UTM Source', <LucideIcon.MousePointerClick className="size-4" />, fieldsData.utm_source.options, fieldsData.utm_source.loading),
            createUTMFieldConfig('utm_medium', 'UTM Medium', <LucideIcon.SatelliteDish className="size-4" />, fieldsData.utm_medium.options, fieldsData.utm_medium.loading),
            createUTMFieldConfig('utm_campaign', 'UTM Campaign', <LucideIcon.Flag className="size-4" />, fieldsData.utm_campaign.options, fieldsData.utm_campaign.loading),
            createUTMFieldConfig('utm_content', 'UTM Content', <LucideIcon.TextCursorInput className="size-4" />, fieldsData.utm_content.options, fieldsData.utm_content.loading),
            createUTMFieldConfig('utm_term', 'UTM Term', <LucideIcon.Tag className="size-4" />, fieldsData.utm_term.options, fieldsData.utm_term.loading)
        ];

        return [
            {
                group: 'Basic',
                fields: [
                    {
                        key: 'audience',
                        label: 'Audience',
                        type: 'multiselect',
                        icon: <LucideIcon.Users />,
                        options: audienceOptions.map(({value, label, icon}) => ({value, label, icon})),
                        defaultOperator: 'is any of',
                        hideOperatorSelect: true,
                        autoCloseOnSelect: true
                    },
                    createFilterFieldConfig('post', 'Post or page', <LucideIcon.PenLine />, fieldsData.post.options, fieldsData.post.loading, {
                        className: 'w-80',
                        popoverContentClassName: 'w-80'
                    }),
                    createFilterFieldConfig('source', 'Source', <LucideIcon.Globe className="size-4" />, fieldsData.source.options, fieldsData.source.loading, {
                        className: 'w-60',
                        popoverContentClassName: 'w-60'
                    }),
                    createFilterFieldConfig('device', 'Device', <LucideIcon.Monitor className="size-4" />, fieldsData.device.options, fieldsData.device.loading),
                    createFilterFieldConfig('location', 'Location', <LucideIcon