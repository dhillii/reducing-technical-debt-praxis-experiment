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

export const createRedemptionFilterUrl = (id: string): string => {
    const baseHref = '/ghost/#/members';
    const filterValue = `offer_redemptions:[${id}]`;
    return `${baseHref}?filter=${encodeURIComponent(filterValue)}`;
};

export const getOfferCadence = (cadence: string): string => {
    return cadence === 'month' ? 'monthly' : 'yearly';
};

export const getOfferDuration = (duration: string): string => {
    return (duration === 'once' ? 'First payment' : duration === 'repeating' ? 'Repeating' : 'Forever');
};

/** @internal Formats number to two decimal places */
const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

/** @internal Calculates discount for percent type offers */
const calculatePercentDiscount = (originalPrice: number, amount: number): {discountOffer: string, updatedPrice: number} => ({
    discountOffer: amount + '% off',
    updatedPrice: originalPrice - ((originalPrice * amount) / 100)
});

/** @internal Calculates discount for fixed type offers */
const calculateFixedDiscount = (originalPrice: number, amount: number, currency: string): {discountOffer: string, updatedPrice: number} => ({
    discountOffer: numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount))) + ' ' + currency + ' off',
    updatedPrice: originalPrice - amount
});

/** @internal Calculates discount for trial type offers */
const calculateTrialDiscount = (amount: number): {discountOffer: string, originalPriceWithCurrency: string} => ({
    discountOffer: amount + ' days free',
    originalPriceWithCurrency: ''
});

/** @internal Gets discount color based on offer type */
const getDiscountColor = (type: string): string => {
    switch (type) {
    case 'percent':
        return 'text-green';
    case 'fixed':
        return 'text-blue';
    case 'trial':
        return 'text-pink';
    default:
        return '';
    }
};

export const getOfferDiscount = (type: string, amount: number, cadence: string, currency: string, tier: Tier | undefined): {discountColor: string, discountOffer: string, originalPriceWithCurrency: string, updatedPriceWithCurrency: string} => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    let updatedPrice = originalPrice;
    let discountOffer = '';
    let originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));

    if (type === 'percent') {
        const result = calculatePercentDiscount(originalPrice, amount);
        discountOffer = result.discountOffer;
        updatedPrice = result.updatedPrice;
    } else if (type === 'fixed') {
        const result = calculateFixedDiscount(originalPrice, amount, currency);
        discountOffer = result.discountOffer;
        updatedPrice = result.updatedPrice;
    } else if (type === 'trial') {
        const result = calculateTrialDiscount(amount);
        discountOffer = result.discountOffer;
        originalPriceWithCurrency = result.originalPriceWithCurrency;
    }

    if (updatedPrice < 0) {
        updatedPrice = 0;
    }

    const updatedPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(updatedPrice)));

    return {
        discountColor: getDiscountColor(type),
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
        setTimeout(() => setIsCopied(false), 2000);
    };

    return <Tooltip containerClassName='group-hover:opacity-100 opacity-0 inline-flex items-center -mr-1 justify-center leading-none w-5 h-5' content={isCopied ? 'Copied' : 'Copy link'} size='sm'><Button color='clear' hideLabel={true} icon={isCopied ? 'check-circle' : 'hyperlink-circle'} iconColorClass={isCopied ? 'text-green w-[14px] h-[14px]' : 'w-[14px] h-[14px]'} label={isCopied ? 'Copied' : 'Copy'} unstyled={true} onClick={handleCopyClick} /></Tooltip>;
};

export const EmptyState: React.FC<{title?: string, description: string, buttonAction: () => void, buttonLabel: string}> = ({title = 'No offers found', description, buttonAction, buttonLabel}) => (
    <div className='flex h-full grow flex-col items-center justify-center text-center'>
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='lg' />
        <h1 className='mt-4 text-xl'>{title}</h1>
        <p className='mt-1.5 max-w-[420px]'>{description}</p>
        <Button className="mt-6" color="grey" label={buttonLabel} onClick={buttonAction}></Button>
    </div>
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
                <div className='cursor-default select-none border-b border-b-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-b-grey-800'>Status</div>
                <div className='flex flex-col py-1'>
                    {(['active', 'archived'] as const).map(status => (
                        <button
                            key={status}
                            className='group relative mx-1 flex cursor-pointer items-center rounded-[2.5px] px-8 py-1.5 text-left text-sm hover:bg-grey-100 dark:hover:bg-grey-800'
                            type='button'
                            onClick={() => setStatusFilter(status)}
                        >
                            {statusFilter === status && <Icon className='absolute left-2' name='check' size='xs' />}
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                    ))}
                </div>
                <div className='cursor-default select-none border-y border-y-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-grey-800'>Sort by</div>
                <div className='flex flex-col py-1'>
                    {[
                        {id: 'date-added', label: 'Date added'},
                        {id: 'name', label: 'Name'},
                        {id: 'redemptions', label: 'Redemptions'}
                    ].map(item => (
                        <div
                            key={item.id}
                            className='group relative mx-1 flex items-center rounded-[2.5px] hover:bg-grey-100 dark:hover:bg-grey-800'
                        >
                            <button
                                className='flex w-full cursor-pointer items-center px-8 py-1.5 pr-12 text-left text-sm'
                                type='button'
                                onClick={() => onSortChange(item.id)}
                            >
                                {sortOption === item.id && <Icon className='absolute left-2' name='check' size='xs' />}
                                {item.label}
                            </button>
                            {sortOption === item.id && (
                                <button
                                    className='absolute right-1 flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-grey-300 dark:hover:bg-grey-700'
                                    title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                                    type='button'
                                    onClick={() => onDirectionChange()}
                                >
                                    <Icon name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'} size='xs' />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Popover>
    );
};

/** @internal Checks if offer tier is active */
const isOfferTierActive = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offer.status === 'active' && offerTier && offerTier.active === true;
};

/** @internal Checks if offer is archived */
const isOfferArchived = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offer.status === 'archived' || (offerTier && offerTier.active === false);
};

/** @internal Checks if offer matches active status filter */
const matchesActiveFilter = (offer: any, allTiers: Tier[] | undefined): boolean => {
    return isOfferTierActive(offer, allTiers);
};

/** @internal Checks if offer matches archived status filter */
const matchesArchivedFilter = (offer: any, allTiers: Tier[] | undefined): boolean => {
    return isOfferArchived(offer, allTiers);
};

/** @internal Checks if offer matches status filter */
const matchesStatusFilter = (offer: any, statusFilter: 'active' | 'archived', allTiers: Tier[] | undefined): boolean => {
    if (statusFilter === 'active') {
        return matchesActiveFilter(offer, allTiers);
    }
    return matchesArchivedFilter(offer, allTiers);
};

/** @internal Compares offers by name */
const compareOffersByName = (offer1: any, offer2: any, multiplier: number): number => {
    return multiplier * offer1.name.localeCompare(offer2.name);
};

/** @internal Compares offers by redemption count */
const compareOffersByRedemptions = (offer1: any, offer2: any, multiplier: number): number => {
    return multiplier * (offer1.redemption_count - offer2.redemption_count);
};

/** @internal Compares offers by creation date */
const compareOffersByDate = (offer1: any, offer2: any, multiplier: number): number => {
    const date1 = offer1.created_at ? new Date(offer1.created_at).getTime() : 0;
    const date2 = offer2.created_at ? new Date(offer2.created_at).getTime() : 0;
    return multiplier * (date1 - date2);
};

/** @internal Sorts offers based on sort option */
const sortOffersByOption = (offer1: any, offer2: any, sortOption: string, multiplier: number): number => {
    if (sortOption === 'name') {
        return compareOffersByName(offer1, offer2, multiplier);
    }
    if (sortOption === 'redemptions') {
        return compareOffersByRedemptions(offer1, offer2, multiplier);
    }
    return compareOffersByDate(offer1, offer2, multiplier);
};

/** @internal Renders offer table row */
const OfferTableRow: React.FC<{
    offer: any;
    offerTier: Tier;
    isTierArchived: boolean;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
    onEdit: (id: string) => void;
}> = ({offer, offerTier, isTierArchived, discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency, onEdit}) => {
    const handleRowClick = () => {
        if (!isTierArchived) {
            onEdit(offer?.id ? offer.id : '');
        }
    };

    const handleRedemptionClick = () => {
        if (offer.redemption_count === 0 && !isTierArchived) {
            onEdit(offer?.id ? offer.id : '');
        }
    };

    const rowOpacity = isTierArchived ? 'opacity-50' : '';
    const rowCursor = isTierArchived ? 'cursor-default select-none' : 'cursor-pointer';

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${rowOpacity} p-0`}>
                <a className={`block ${rowCursor} p-5 pl