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
    [key: string]: {
        options: Array<{value: string; label: string; icon: React.ReactNode}>;
        loading: boolean;
    };
}

const useFilterFieldOptions = (filters: Filter[], shouldFetchOptions: (field: string) => boolean) => {
    const fieldKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'source', 'device', 'location', 'post'] as const;
    
    const fieldOptions: FilterFieldOptions = {};
    
    fieldOptions.utm_source = useTinybirdFilterOptions('utm_source', filters, {enabled: shouldFetchOptions('utm_source')});
    fieldOptions.utm_medium = useTinybirdFilterOptions('utm_medium', filters, {enabled: shouldFetchOptions('utm_medium')});
    fieldOptions.utm_campaign = useTinybirdFilterOptions('utm_campaign', filters, {enabled: shouldFetchOptions('utm_campaign')});
    fieldOptions.utm_content = useTinybirdFilterOptions('utm_content', filters, {enabled: shouldFetchOptions('utm_content')});
    fieldOptions.utm_term = useTinybirdFilterOptions('utm_term', filters, {enabled: shouldFetchOptions('utm_term')});
    fieldOptions.source = useTinybirdFilterOptions('source', filters, {enabled: shouldFetchOptions('source')});
    fieldOptions.device = useTinybirdFilterOptions('device', filters, {enabled: shouldFetchOptions('device')});
    fieldOptions.location = useTinybirdFilterOptions('location', filters, {enabled: shouldFetchOptions('location')});
    fieldOptions.post = usePostOptions(filters, {enabled: shouldFetchOptions('post')});

    return fieldOptions;
};

interface FilterFieldConfigMap {
    [key: string]: Omit<FilterFieldConfig, 'key' | 'group'>;
}

const FILTER_FIELD_CONFIG_MAP: FilterFieldConfigMap = {
    utm_source: {
        label: 'UTM Source',
        type: 'select',
        icon: <LucideIcon.MousePointerClick className="size-4" />,
        placeholder: 'Select source',
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
        defaultOperator: 'is',
        hideOperatorSelect: true,
        className: 'w-60',
        popoverContentClassName: 'w-60',
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    source: {
        label: 'Source',
        type: 'select',
        icon: <LucideIcon.Globe className="size-4" />,
        placeholder: 'Select source',
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
        defaultOperator: 'is',
        hideOperatorSelect: true,
        selectedOptionsClassName: 'hidden'
    },
    location: {
        label: 'Location',
        type: 'select',
        icon: <LucideIcon.MapPin className="size-4" />,
        placeholder: 'Select location',
        defaultOperator: 'is',
        hideOperatorSelect: true,
        searchable: true,
        selectedOptionsClassName: 'hidden'
    },
    post: {
        label: 'Post or page',
        type: 'select',
        icon: <LucideIcon.PenLine />,
        searchable: true,
        defaultOperator: 'is',
        className: 'w-80',
        popoverContentClassName: 'w-80',
        hideOperatorSelect: true,
        selectedOptionsClassName: 'hidden'
    }
};

const buildGroupedFields = (
    fieldOptions: FilterFieldOptions,
    audienceOptions: Array<{value: string; label: string; icon: React.ReactNode}>,
    supportedOperators: Array<{value: string; label: string}>
): FilterFieldConfig[] => {
    const utmFields: FilterFieldConfig[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map(key => ({
        key,
        ...FILTER_FIELD_CONFIG_MAP[key],
        operators: supportedOperators,
        options: fieldOptions[key].options,
        isLoading: fieldOptions[key].loading
    }));

    const basicFields: FilterFieldConfig[] = [
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
            ...FILTER_FIELD_CONFIG_MAP.post,