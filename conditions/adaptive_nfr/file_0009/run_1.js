```typescript
import {Button, type Tab, TabView} from '@tryghost/admin-x-design-system';
import {ButtonGroup, type ButtonProps, showToast} from '@tryghost/admin-x-design-system';
import {Icon} from '@tryghost/admin-x-design-system';
import {Modal} from '@tryghost/admin-x-design-system';
import {SortMenu} from '@tryghost/admin-x-design-system';
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

/**
 * Formats a number to two decimal places
 */
const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

/**
 * Calculates discount for percent type offers
 */
const calculatePercentDiscount = (originalPrice: number, amount: number): {discountColor: string, discountOffer: string, updatedPrice: number} => {
    return {
        discountColor: 'text-green',
        discountOffer: amount + '% off',
        updatedPrice: originalPrice - ((originalPrice * amount) / 100)
    };
};

/**
 * Calculates discount for fixed type offers
 */
const calculateFixedDiscount = (originalPrice: number, amount: number, currency: string): {discountColor: string, discountOffer: string, updatedPrice: number} => {
    return {
        discountColor: 'text-blue',
        discountOffer: numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount))) + ' ' + currency + ' off',
        updatedPrice: originalPrice - amount
    };
};

/**
 * Calculates discount for trial type offers
 */
const calculateTrialDiscount = (amount: number): {discountColor: string, discountOffer: string, updatedPrice: number, isTrialType: boolean} => {
    return {
        discountColor: 'text-pink',
        discountOffer: amount + ' days free',
        updatedPrice: 0,
        isTrialType: true
    };
};

/**
 * Gets the appropriate discount calculation based on offer type
 */
const getDiscountByType = (type: string, amount: number, originalPrice: number, currency: string): {discountColor: string, discountOffer: string, updatedPrice: number, isTrialType?: boolean} => {
    switch (type) {
    case 'percent':
        return calculatePercentDiscount(originalPrice, amount);
    case 'fixed':
        return calculateFixedDiscount(originalPrice, amount, currency);
    case 'trial':
        return calculateTrialDiscount(amount);
    default:
        return {discountColor: '', discountOffer: '', updatedPrice: originalPrice};
    }
};

/**
 * Ensures updated price is not negative
 */
const ensureNonNegativePrice = (price: number): number => {
    return price < 0 ? 0 : price;
};

export const getOfferDiscount = (type: string, amount: number, cadence: string, currency: string, tier: Tier | undefined): {discountColor: string, discountOffer: string, originalPriceWithCurrency: string, updatedPriceWithCurrency: string} => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    
    const discountData = getDiscountByType(type, amount, originalPrice, currency);
    const updatedPrice = ensureNonNegativePrice(discountData.updatedPrice);
    
    let originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));
    
    if (discountData.isTrialType) {
        originalPriceWithCurrency = '';
    }

    const updatedPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(updatedPrice)));

    return {
        discountColor: discountData.discountColor,
        discountOffer: discountData.discountOffer,
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
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='xl' />
        <h1 className='mt-6 text-2xl'>{title}</h1>
        <p className='mt-3 max-w-[420px] text-[1.6rem]'>{description}</p>
        <Button className="mt-8" color="grey" label={buttonLabel} onClick={buttonAction}></Button>
    </div>
);

/**
 * Checks if offer tier exists and is active
 */
const isOfferTierActive = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offerTier?.active === true;
};

/**
 * Checks if offer is in active status and tier is active
 */
const isActiveOffer = (offer: any, allTiers: Tier[] | undefined): boolean => {
    return offer.status === 'active' && isOfferTierActive(offer, allTiers);
};

/**
 * Checks if offer is archived or its tier is archived
 */
const isArchivedOffer = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offer.status === 'archived' || (offerTier && offerTier.active === false);
};

/**
 * Checks if offer matches the selected tab filter
 */
const offerMatchesTabFilter = (offer: any, selectedTab: string, allTiers: Tier[] | undefined): boolean => {
    if (selectedTab === 'active') {
        return isActiveOffer(offer, allTiers);
    }
    return isArchivedOffer(offer, allTiers);
};

/**
 * Gets the plural form of 'offer' based on count
 */
const getOfferCountLabel = (count: number): string => {
    return count !== 1 ? 'offers' : 'offer';
};

/**
 * Determines if tier is archived
 */
const isTierArchived = (offerTier: Tier | undefined): boolean => {
    return offerTier?.active === false;
};

/**
 * Gets the display text for offer duration
 */
const getOfferDurationDisplay = (offerType: string, duration: string): string => {
    return offerType !== 'trial' ? getOfferDuration(duration) : 'Trial period';
};

/**
 * Determines if price strikethrough should be shown
 */
const shouldShowStrikethrough = (offerType: string): boolean => {
    return offerType !== 'trial';
};

/**
 * Determines if redemption count link should be clickable
 */
const isRedemptionCountClickable = (redemptionCount: number): boolean => {
    return redemptionCount > 0;
};

/**
 * Renders offer table row
 */
const OfferTableRow: React.FC<{
    offer: any,
    offerTier: Tier | undefined,
    allTiers: Tier[] | undefined,
    handleOfferEdit: (id: string) => void
}> = ({offer, offerTier, allTiers, handleOfferEdit}) => {
    if (!offerTier) {
        return null;
    }

    const isArchived = isTierArchived(offerTier);
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        offerTier
    );

    const handleRowClick = () => {
        if (!isArchived) {
            handleOfferEdit(offer?.id ? offer.id : '');
        }
    };

    const handleRedemptionClick = () => {
        if (isRedemptionCountClickable(offer.redemption_count) || !isArchived) {
            handleOfferEdit(offer?.id ? offer.id : '');
        }
    };

    const opacityClass = isArchived ? 'opacity-50' : '';
    const cursorClass = isArchived ? 'cursor-default select-none' : 'cursor-pointer';

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${opacityClass} p-0`}>
                <a className={`block ${cursorClass} p-5 pl-0`} onClick={handleRowClick}>
                    <span className='font-semibold'>{offer?.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${opacityClass} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${cursorClass} p-5`} onClick={handleRowClick}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>{getOfferDurationDisplay(offer.type, offer.duration)}</span>
                </a>
            </td>
            <td className={`${opacityClass} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${cursorClass} p-5`} onClick={handleRowClick}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {shouldShowStrikethrough(offer.type) ? (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>{originalPriceWithCurrency}</span>
                    ) : null}
                </a>
            </td>
            <td className={`${opacityClass} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${cursorClass} p-5 ${isRedemptionCountClickable(offer.redemption_count) ? 'hover:underline' : ''}`}
                    href={isRedemptionCountClickable(offer.redemption_count) ? createRedemptionFilterUrl(offer.id ? offer.id : '') : undefined}
                    onClick={handleRedemptionClick}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${opacityClass} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isArchived ? <CopyLinkButton offerCode={offer.code} /> : null}
            </td>
            {isArchived ? (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div>
            ) : null}
        </tr>
    );
};

/**
 * Renders table header with offer count
 */
const OfferTableHeader: React.FC<{
    selectedTab: string,
    activeOffersCount: number,
    archivedOffersCount: number
}> = ({selectedTab, activeOffersCount, archivedOffersCount}) => {
    const count = selectedTab === 'active' ? activeOffersCount : archivedOffersCount;
    const label = getOfferCountLabel(count);

    return (
        <tr className='border-b border-b-grey-300 dark:border-grey-800'>
            <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>{count} {label}</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
            <th className='px-5 py-2.5 text-xs