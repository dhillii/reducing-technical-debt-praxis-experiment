```typescript
import OffersRetention from './offers-retention';
import {Button, type Tab, TabView} from '@tryghost/admin-x-design-system';
import {ButtonGroup, type ButtonProps, showToast} from '@tryghost/admin-x-design-system';
import {Icon} from '@tryghost/admin-x-design-system';
import {LucideIcon} from '@tryghost/shade';
import {Modal} from '@tryghost/admin-x-design-system';
import {Popover} from '@tryghost/admin-x-design-system';
import {type Tier, getPaidActiveTiers, useBrowseTiers} from '@tryghost/admin-x-framework/api/tiers';
import {Tooltip} from '@tryghost/admin-x-design-system';
import {currencyToDecimal, getSymbol} from '../../../../utils/currency';
import {getHomepageUrl} from '@tryghost/admin-x-framework/api/site';
import {numberWithCommas} from '../../../../utils/helpers';
import {useBrowseOffers} from '@tryghost/admin-x-framework/api/offers';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useModal} from '@ebay/nice-modal-react';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {useSortingState} from '../../../providers/settings-app-provider';
import {useState} from 'react';

export type OfferType = 'percent' | 'fixed' | 'trial';

const SORT_OPTIONS = [
    {id: 'date-added', label: 'Date added'},
    {id: 'name', label: 'Name'},
    {id: 'redemptions', label: 'Redemptions'}
] as const;

const STATUS_FILTERS = ['active', 'archived'] as const;

const OFFERS_TABS: Tab[] = [
    {id: 'signup', title: 'Signup'},
    {id: 'retention', title: 'Retention'}
];

const DEFAULT_CURRENCY = 'USD';
const COPY_TIMEOUT = 2000;

export const createRedemptionFilterUrl = (id: string): string => {
    const baseHref = '/ghost/#/members';
    const filterValue = `offer_redemptions:[${id}]`;
    return `${baseHref}?filter=${encodeURIComponent(filterValue)}`;
};

export const getOfferCadence = (cadence: string): string => {
    return cadence === 'month' ? 'monthly' : 'yearly';
};

export const getOfferDuration = (duration: string): string => {
    const durationMap: Record<string, string> = {
        'once': 'First payment',
        'repeating': 'Repeating'
    };
    return durationMap[duration] || 'Forever';
};

const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

const calculateDiscountPrice = (originalPrice: number, type: string, amount: number): number => {
    let updatedPrice = originalPrice;
    
    if (type === 'percent') {
        updatedPrice = originalPrice - ((originalPrice * amount) / 100);
    } else if (type === 'fixed') {
        updatedPrice = originalPrice - amount;
    }
    
    return Math.max(updatedPrice, 0);
};

const getDiscountDisplay = (type: string, amount: number, currency: string): {color: string, text: string} => {
    const displayMap: Record<string, {color: string, text: string}> = {
        'percent': {
            color: 'text-green',
            text: `${amount}% off`
        },
        'fixed': {
            color: 'text-blue',
            text: `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`
        },
        'trial': {
            color: 'text-pink',
            text: `${amount} days free`
        }
    };
    
    return displayMap[type] || {color: '', text: ''};
};

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): {discountColor: string, discountOffer: string, originalPriceWithCurrency: string, updatedPriceWithCurrency: string} => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    const {color: discountColor, text: discountOffer} = getDiscountDisplay(type, amount, currency);
    
    let originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));
    
    if (type === 'trial') {
        originalPriceWithCurrency = '';
    }
    
    const updatedPrice = calculateDiscountPrice(originalPrice, type, amount);
    const updatedPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(updatedPrice)));

    return {
        discountColor,
        discountOffer,
        originalPriceWithCurrency,
        updatedPriceWithCurrency
    };
};

export const CopyLinkButton: React.FC<{offerCode: string}> = ({offerCode}) => {
    const [isCopied, setIsCopied] = useState(false);
    const {siteData} = useGlobalData();

    const handleCopyClick = (e?: React.MouseEvent<HTMLElement, MouseEvent>) => {
        e?.stopPropagation();
        const offerLink = `${getHomepageUrl(siteData!)}${offerCode}`;
        navigator.clipboard.writeText(offerLink);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), COPY_TIMEOUT);
    };

    return (
        <Tooltip
            containerClassName='group-hover:opacity-100 opacity-0 inline-flex items-center -mr-1 justify-center leading-none w-5 h-5'
            content={isCopied ? 'Copied' : 'Copy link'}
            size='sm'
        >
            <Button
                color='clear'
                hideLabel={true}
                icon={isCopied ? 'check-circle' : 'hyperlink-circle'}
                iconColorClass={isCopied ? 'text-green w-[14px] h-[14px]' : 'w-[14px] h-[14px]'}
                label={isCopied ? 'Copied' : 'Copy'}
                unstyled={true}
                onClick={handleCopyClick}
            />
        </Tooltip>
    );
};

export const EmptyState: React.FC<{
    title?: string,
    description: string,
    buttonAction: () => void,
    buttonLabel: string
}> = ({title = 'No offers found', description, buttonAction, buttonLabel}) => (
    <div className='flex h-full grow flex-col items-center justify-center text-center'>
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='lg' />
        <h1 className='mt-4 text-xl'>{title}</h1>
        <p className='mt-1.5 max-w-[420px]'>{description}</p>
        <Button className="mt-6" color="grey" label={buttonLabel} onClick={buttonAction} />
    </div>
);

const SortOptionButton: React.FC<{
    item: typeof SORT_OPTIONS[number],
    isSelected: boolean,
    sortDirection: string,
    onSelect: (id: string) => void,
    onDirectionChange: () => void
}> = ({item, isSelected, sortDirection, onSelect, onDirectionChange}) => (
    <div className='group relative mx-1 flex items-center rounded-[2.5px] hover:bg-grey-100 dark:hover:bg-grey-800'>
        <button
            className='flex w-full cursor-pointer items-center px-8 py-1.5 pr-12 text-left text-sm'
            type='button'
            onClick={() => onSelect(item.id)}
        >
            {isSelected && <Icon className='absolute left-2' name='check' size='xs' />}
            {item.label}
        </button>
        {isSelected && (
            <button
                className='absolute right-1 flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-grey-300 dark:hover:bg-grey-700'
                title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                type='button'
                onClick={onDirectionChange}
            >
                <Icon name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'} size='xs' />
            </button>
        )}
    </div>
);

const StatusFilterButton: React.FC<{
    status: typeof STATUS_FILTERS[number],
    isSelected: boolean,
    onSelect: (status: typeof STATUS_FILTERS[number]) => void
}> = ({status, isSelected, onSelect}) => (
    <button
        key={status}
        className='group relative mx-1 flex cursor-pointer items-center rounded-[2.5px] px-8 py-1.5 text-left text-sm hover:bg-grey-100 dark:hover:bg-grey-800'
        type='button'
        onClick={() => onSelect(status)}
    >
        {isSelected && <Icon className='absolute left-2' name='check' size='xs' />}
        {status.charAt(0).toUpperCase() + status.slice(1)}
    </button>
);

const OffersFilterPopover: React.FC<{
    statusFilter: 'active' | 'archived';
    setStatusFilter: (status: 'active' | 'archived') => void;
    sortOption: string;
    sortDirection: string;
    onSortChange: (option: string) => void;
    onDirectionChange: () => void;
}> = ({statusFilter, setStatusFilter, sortOption, sortDirection, onSortChange, onDirectionChange}) => {
    return (
        <Popover
            position='end'
            trigger={
                <button className='flex cursor-pointer items-center justify-center rounded p-1 hover:bg-grey-100 dark:hover:bg-grey-800' type='button'>
                    <LucideIcon.ListFilter className='text-grey-700' size={16} strokeWidth={1.5} />
                </button>
            }
        >
            <div className='flex min-w-[220px] flex-col'>
                <div className='cursor-default select-none border-b border-b-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-b-grey-800'>
                    Status
                </div>
                <div className='flex flex-col py-1'>
                    {STATUS_FILTERS.map(status => (
                        <StatusFilterButton
                            key={status}
                            isSelected={statusFilter === status}
                            status={status}
                            onSelect={setStatusFilter}
                        />
                    ))}
                </div>
                <div className='cursor-default select-none border-y border-y-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-grey-800'>
                    Sort by
                </div>
                <div className='flex flex-col py-1'>
                    {SORT_OPTIONS.map(item => (
                        <SortOptionButton
                            key={item.id}
                            isSelected={sortOption === item.id}
                            item={item}
                            sortDirection={sortDirection}
                            onDirectionChange={onDirectionChange}
                            onSelect={onSortChange}
                        />
                    ))}
                </div>
            </div>
        </Popover>
    );
};

const sortOffers = (offers: any[], sortOption: string, sortDirection: string) => {
    return offers.sort((offer1, offer2) => {
        const multiplier = sortDirection === 'desc' ? -1 : 1;
        
        switch (sortOption) {
        case 'name':
            return multiplier * offer1.name.localeCompare(offer2.name);
        case 'redemptions':
            return multiplier * (offer1.redemption_count - offer2.redemption_count);
        default:
            const date1 = offer1.created_at ? new Date(offer1.created_at).getTime() : 0;
            const date2 = offer2.created_at ? new Date(offer2.created_at).getTime() : 0;
            return multiplier * (date1 - date2);
        }
    });
};

const filterOffersByStatus = (offers: any[], allTiers: Tier[] | undefined, statusFilter: 'active' | 'archived') => {
    return offers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        const isActive = offer.status === 'active' && offerTier && offerTier.active === true;
        const isArchived = offer.status === 'archived' || (offerTier && offerTier.active === false);
        
        return statusFilter === 'active' ? isActive : isArchived;
    });
};

const getOfferTier = (offer: any, allTiers: Tier[] | undefined) => {
    return allTiers?.find(tier => tier.id === offer?.tier?.id);
};

const OfferTableRow: React.FC<{
    offer: any,
    offerTier: Tier,
    isTierArchived: boolean,
    onEdit: (id: string) => void
}> = ({offer, offerTier, isTierArchived, onEdit}) => {
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || DEFAULT_CURRENCY,
        offerTier
    );

    const handleRowClick = () => {
        if (!isTierArchived) {
            onEdit(offer?.id || '');
        }
    };

    const handleRedemptionClick = () => {
        if (offer.redemption_count === 0 && !isTierArchived) {
            onEdit(offer?.id || '');
        }
    };

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid="offer-item">
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`}
                    onClick={handleRowClick}
                >
                    <span className='font-semibold'>{offer?.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                    onClick={handleRowClick}
                >
                    <span className='text-[1.3rem] font-