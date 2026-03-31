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
        transformValue: v => ({
            value: v,
            label: {
                'mobile-ios': 'iOS',
                'mobile-android': 'Android',
                'desktop': 'Desktop',
                'bot': 'Bot',
                'unknown': 'Unknown'
            }[v] || v
        })
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

interface FilterFieldConfigWithMeta extends FilterFieldConfig {
    options?: Array<{value: string; label: string; icon?: React.ReactNode}>;
    isLoading?: boolean;
}

const createSelectFieldConfig = (
    key: string,
    label: string,
    icon: React.ReactNode,
    options: Array<{value: string; label: string; icon?: React.ReactNode}>,
    isLoading: boolean,
    placeholder?: string,
    searchable: boolean = true,
    width: string = 'w-60'
): FilterFieldConfigWithMeta => ({
    key,
    label,
    type: 'select',
    icon,
    placeholder,
    operators: [{value: 'is', label: 'is'}],
    defaultOperator: 'is',
    hideOperatorSelect: true,
    options,
    isLoading,
    className: width,
    popoverContentClassName: width,
    searchable,
    selectedOptionsClassName: 'hidden'
});

const createUTMFieldConfig = (
    fieldName: string,
    label: string,
    icon: React.ReactNode,
    options: Array<{value: string; label: string; icon?: React.ReactNode}>,
    isLoading: boolean
): FilterFieldConfigWithMeta => createSelectFieldConfig(
    fieldName,
    label,
    icon,
    options,
    isLoading,
    `Select ${fieldName.replace('utm_', '')}`,
    true,
    'w-60'
);

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

    const groupedFields: FilterFieldConfig[] = useMemo(() => {
        const utmFields: FilterFieldConfigWithMeta[] = [
            createUTMFieldConfig('utm_source', 'UTM Source', <LucideIcon.MousePointerClick className="size-4" />, utmSourceOptions, utmSourceLoading),
            createUTMFieldConfig('utm_medium', 'UTM Medium', <LucideIcon.SatelliteDish className="size-4" />, utmMediumOptions, utmMediumLoading),
            createUTMFieldConfig('utm_campaign', 'UTM Campaign', <LucideIcon.Flag className="size-4" />, utmCampaignOptions, utmCampaignLoading),
            createUTMFieldConfig('utm_content', 'UTM Content', <LucideIcon.TextCursorInput className="size-4" />, utmContentOptions, utmContentLoading),
            createUTMFieldConfig('utm_term', 'UTM Term', <LucideIcon.Tag className="size-4" />, utmTermOptions, utmTermLoading)
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
                        options: audienceOptions,
                        defaultOperator: 'is any of',
                        hideOperatorSelect: true,
                        autoCloseOnSelect: true
                    },
                    createSelectFieldConfig('post', 'Post or page', <LucideIcon.PenLine />, postOptions, postLoading, undefined, true, 'w-80'),
                    createSelectFieldConfig('source', 'Source', <LucideIcon.Globe className="size-4" />, sourceOptions, sourceLoading, 'Select source', true, 'w-60'),
                    createSelectFieldConfig('device', 'Device', <LucideIcon.Monitor className="size-4" />, deviceOptions, deviceLoading, 'Select device', false, ''),
                    createSelectFieldConfig('location', 'Location', <Lucide