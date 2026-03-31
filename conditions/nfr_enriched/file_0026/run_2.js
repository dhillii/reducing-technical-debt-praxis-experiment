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

interface UseTinybirdFilterOptionsConfig {
    enabled?: boolean;
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

const UTM_TRANSFORM = (v: string) => ({value: v || '(not set)', label: v || '(not set)'});

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    utm_source: {endpoint: 'api_top_utm_sources', valueKey: 'utm_source', transformValue: UTM_TRANSFORM},
    utm_medium: {endpoint: 'api_top_utm_mediums', valueKey: 'utm_medium', transformValue: UTM_TRANSFORM},
    utm_campaign: {endpoint: 'api_top_utm_campaigns', valueKey: 'utm_campaign', transformValue: UTM_TRANSFORM},
    utm_content: {endpoint: 'api_top_utm_contents', valueKey: 'utm_content', transformValue: UTM_TRANSFORM},
    utm_term: {endpoint: 'api_top_utm_terms', valueKey: 'utm_term', transformValue: UTM_TRANSFORM},
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
            label: STATS_LABEL_MAPPINGS[v as keyof typeof STATS_LABEL_MAPPINGS] || countries.getName(v, 'en') || v
        })
    },
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: v => ({value: v, label: DEVICE_LABELS[v] ?? v})
    }
};

// ─── Shared UI ────────────────────────────────────────────────────────────────

const VisitCountBadge = ({visits}: {visits: number}) => (
    <span className="order-2 font-mono text-xs text-muted-foreground">
        {visits.toLocaleString()}
    </span>
);

// ─── Shared Utilities ─────────────────────────────────────────────────────────

const deriveAudience = (filters: Filter[]) => {
    const audienceFilter = filters.find(f => f.field === 'audience');
    return getAudienceFromFilterValues(audienceFilter?.values as string[] | undefined);
};

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
        } else if (filter.field === 'source' || filter.field === 'device' || filter.field === 'location' || filter.field.startsWith('utm_')) {
            params[filter.field] = value;
        }
    }

    return params;
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useMobileDetect = () => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 1024px)');
        const handleChange = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
        handleChange(mediaQuery);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    return isMobile;
};

const useTinybirdFilterOptions = (
    fieldKey: string,
    currentFilters: Filter[] = [],
    {enabled = true}: UseTinybirdFilterOptionsConfig = {}
) => {
    const {statsConfig, range} = useGlobalData();
    const {startDate, endDate, timezone} = getRangeDates(range);
    const definition = FILTER_FIELD_DEFINITIONS[fieldKey];

    const audience = useMemo(() => deriveAudience(currentFilters), [currentFilters]);

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

const usePostOptions = (currentFilters: Filter[] = [], {enabled = true} = {}) => {
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

// ─── Field Config Builders ────────────────────────────────────────────────────

const makeSelectField = (
    key: string,
    label: string,
    icon: React.ReactNode,
    options: unknown[],
    isLoading: boolean,
    overrides: Partial<FilterFieldConfig> = {}
): FilterFieldConfig => ({
    key,
    label,
    type: 'select',
    icon,
    operators: SUPPORTED_OPERATORS,
    defaultOperator: 'is',
    hideOperatorSelect: true,
    selectedOptionsClassName: 'hidden',
    searchable: false,
    options,
    isLoading,
    ...overrides
});

const makeWideSelectField = (
    key: string,
    label: string,
    icon: React.ReactNode,
    options: unknown[],
    isLoading: boolean,
    overrides: Partial<FilterFieldConfig> = {}
): FilterFieldConfig => makeSelectField(key, label, icon, options, isLoading, {
    className: 'w-60',
    popoverContentClassName: 'w-60',
    searchable: true,
    placeholder: `Select ${label.toLowerCase()}`,
    ...overrides
});

// ─── Component ────────────────────────────────────────────────────────────────

function StatsFilter({filters, onChange, ...props}: StatsFilterProps) {
    const {appSettings} = useAppContext();
    const [activeFilterField, setActiveFilterField] = useState<string | null>(null);
    const isMobile = useMobileDetect();

    const shouldFetch = useCallback(
        (fieldKey: string) => activeFilterField === fieldKey || filters.some(f => f.field === fieldKey),
        [activeFilterField, filters]
    );

    const {options: utmSourceOptions, loading: utmSourceLoading} = useTinybirdFilterOptions('utm_source', filters, {enabled: shouldFetch('utm_source')});
    const {options: utmMediumOptions, loading: utmMediumLoading} = useTinybirdFilterOptions('utm_medium', filters, {enabled: shouldFetch('utm_medium')});
    const {options: utmCampaignOptions, loading: utmCampaignLoading} = useTinybirdFilterOptions('utm_campaign', filters, {enabled: shouldFetch('utm_campaign')});
    const {options: utmContentOptions, loading: utmContentLoading} = useTinybirdFilterOptions('utm_content', filters, {enabled: shouldFetch('utm_content')});
    const {options: utmTermOptions, loading: utmTermLoading} = useTinybirdFilterOptions('utm_term', filters, {enabled: shouldFetch('utm_term')});
    const {options: sourceOptions, loading: sourceLoading} = useTinybirdFilterOptions('source', filters, {enabled: shouldFetch('source')});
    const {options: deviceOptions, loading: deviceLoading} = useTinybirdFilterOptions('device', filters, {enabled: shouldFetch('device')});
    const {options: locationOptions, loading: locationLoading} = useTinybirdFilterOptions('location', filters, {enabled: shouldFetch('location')});
    const {options: postOptions, loading: postLoading} = usePostOptions(filters, {enabled: shouldFetch('post')});

    const audienceOptions = useMemo(() => {
        const options = [
            {value: 'undefined', label: 'Public visitors', icon: <LucideIcon.Globe className='text-gray-700' />},
            {value: 'free', label: 'Free members', icon: <LucideIcon.User className='text-green' />},
            {value: 'paid', label: 'Paid members', icon: <LucideIcon.UserPlus className='text-orange' />}
        ];
        return appSettings?.paidMembersEnabled ? options : options.filter(opt => opt.value !== 'paid');
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
                makeSelectField('post', 'Post or page', <LucideIcon.PenLine />, postOptions, postLoading, {
                    searchable: true,
                    className: 'w-80',
                    popoverContentClassName: 'w-80'
                }),
                makeWideSelectField('source', 'Source', <LucideIcon.Globe className="size-4" />, sourceOptions, sourceLoading),
                makeSelectField('device', 'Device', <LucideIcon.Monitor className="size-4" />, deviceOptions, deviceLoading),
                makeWideSelectField('location', 'Location', <LucideIcon.MapPin className="size-4" />, locationOptions, locationLoading)
            ]
        },
        {
            group: 'UTM parameters',
            fields: [
                makeWideSelectField('utm_source', 'UTM Source', <LucideIcon.MousePointerClick className="size-4" />, utmSourceOptions, utmSourceLoading),
                makeWideSelectField('utm_medium', 'UTM Medium', <LucideIcon.SatelliteDish className="size-4" />, utmMediumOptions, utmMediumLoading),
                makeWideSelectField('utm_campaign', 'UTM Campaign', <LucideIcon.Flag className="size-4" />, utmCampaignOptions, utmCampaignLoading),
                makeWideSelectField('utm_content', 'UTM Content', <LucideIcon.TextCursorInput className="size-4" />, utmContentOptions, utmContentLoading),
                makeWideSelectField('utm_term', 'UTM Term', <LucideIcon.Tag className="size-4" />, utmTermOptions