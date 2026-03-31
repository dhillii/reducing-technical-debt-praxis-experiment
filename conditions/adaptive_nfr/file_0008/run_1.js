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
    const durationMap: Record<string, string> = {
        'once': 'First payment',
        'repeating': 'Repeating'
    };
    return durationMap[duration] || 'Forever';
};

const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

interface OfferDiscountResult {
    discountColor: string;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
}

const getDiscountByType = (
    type: string,
    amount: number,
    originalPrice: number,
    currency: string
): {discountColor: string; discountOffer: string; updatedPrice: number; originalPriceWithCurrency: string} => {
    const discountMap: Record<string, {color: string; calculate: () => {offer: string; price: number; originalPrice: string}}> = {
        'percent': {
            color: 'text-green',
            calculate: () => ({
                offer: `${amount}% off`,
                price: originalPrice - ((originalPrice * amount) / 100),
                originalPrice: getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)))
            })
        },
        'fixed': {
            color: 'text-blue',
            calculate: () => ({
                offer: `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`,
                price: originalPrice - amount,
                originalPrice: getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)))
            })
        },
        'trial': {
            color: 'text-pink',
            calculate: () => ({
                offer: `${amount} days free`,
                price: originalPrice,
                originalPrice: ''
            })
        }
    };

    const config = discountMap[type] || discountMap['percent'];
    const {offer, price, originalPrice: originalPriceStr} = config.calculate();

    return {
        discountColor: config.color,
        discountOffer: offer,
        updatedPrice: price,
        originalPriceWithCurrency: originalPriceStr
    };
};

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): OfferDiscountResult => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    const {discountColor, discountOffer, updatedPrice, originalPriceWithCurrency} = getDiscountByType(type, amount, originalPrice, currency);

    let finalUpdatedPrice = Math.max(updatedPrice, 0);
    const updatedPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(finalUpdatedPrice)));

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
        setTimeout(() => setIsCopied(false), 2000);
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

export const EmptyState: React.FC<{title?: string; description: string; buttonAction: () => void; buttonLabel: string}> = ({
    title = 'No offers found',
    description,
    buttonAction,
    buttonLabel
}) => (
    <div className='flex h-full grow flex-col items-center justify-center text-center'>
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='lg' />
        <h1 className='mt-4 text-xl'>{title}</h1>
        <p className='mt-1.5 max-w-[420px]'>{description}</p>
        <Button className='mt-6' color='grey' label={buttonLabel} onClick={buttonAction} />
    </div>
);

const SORT_OPTIONS = [
    {id: 'date-added', label: 'Date added'},
    {id: 'name', label: 'Name'},
    {id: 'redemptions', label: 'Redemptions'}
];

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
                <div className='cursor-default select-none border-y border-y-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-grey-800'>
                    Sort by
                </div>
                <div className='flex flex-col py-1'>
                    {SORT_OPTIONS.map(item => (
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

const useOfferFiltering = (allOffers: any[], allTiers: Tier[] | undefined) => {
    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');

    const filterOffersByStatus = (offers: any[], status: 'active' | 'archived') => {
        return offers.filter(offer => {
            const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
            if (status === 'active') {
                return offer.status === 'active' && offerTier && offerTier.active === true;
            }
            return offer.status === 'archived' || (offerTier && offerTier.active === false);
        });
    };

    const activeOffers = filterOffersByStatus(signupOffers, 'active');
    const archivedOffers = filterOffersByStatus(signupOffers, 'archived');

    return {signupOffers, activeOffers, archivedOffers};
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
            return multiplier * (
                (offer1.created_at ? new Date(offer1.created_at).getTime() : 0) -
                (offer2.created_at ? new Date(offer2.created_at).getTime() : 0)
            );
        }
    });
};

interface OfferRowProps {
    offer: any;
    offerTier: Tier;
    isTierArchived: boolean;
    onEdit: (id: string) => void;
}

const OfferTableRow: React.FC<OfferRowProps> = ({offer, offerTier, isTierArchived, onEdit}) => {
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        offerTier
    );

    const handleRowClick = () => {
        if (!isTierArchived) {
            onEdit(offer?.id || '');
        }
    };

    const rowOpacity = isTierArchived ? 'opacity-50' : '';
    const rowClickable = !isTierArchived ? 'cursor-pointer' : 'cursor-default select-none';

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid='offer-item'>
            <td className={`${rowOpacity} p-0`}>
                <a className={`block ${rowClickable} p-5 pl-0`} onClick={handleRowClick}>
                    <span className='font-semibold'>{offer?.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>
                        {offerTier.name} {getOfferCadence(offer.cadence)}
                    </span>
                </a>
            </td>
            <td className={`${rowOpacity} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${rowClickable} p-5`} onClick={handleRowClick}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>
                        {offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}
                    </span>
                </a>
            </td>
            <td className={`${rowOpacity} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${rowClickable} p-5`} onClick={handleRowClick}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' && (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-