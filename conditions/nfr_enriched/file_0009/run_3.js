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

// Helper function to format numbers to two decimal places
const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

// Helper function to calculate discount for percent type offers
const calculatePercentDiscount = (originalPrice: number, amount: number, currency: string): {discountOffer: string, updatedPrice: number} => {
    const discountOffer = amount + '% off';
    const updatedPrice = originalPrice - ((originalPrice * amount) / 100);
    return {discountOffer, updatedPrice};
};

// Helper function to calculate discount for fixed type offers
const calculateFixedDiscount = (originalPrice: number, amount: number, currency: string): {discountOffer: string, updatedPrice: number} => {
    const discountOffer = numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount))) + ' ' + currency + ' off';
    const updatedPrice = originalPrice - amount;
    return {discountOffer, updatedPrice};
};

// Helper function to calculate discount for trial type offers
const calculateTrialDiscount = (amount: number): {discountOffer: string, originalPriceWithCurrency: string} => {
    const discountOffer = amount + ' days free';
    return {discountOffer, originalPriceWithCurrency: ''};
};

export const getOfferDiscount = (type: string, amount: number, cadence: string, currency: string, tier: Tier | undefined): {discountColor: string, discountOffer: string, originalPriceWithCurrency: string, updatedPriceWithCurrency: string} => {
    let discountColor = '';
    let discountOffer = '';
    let originalPriceWithCurrency = '';
    let updatedPrice = 0;

    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));

    switch (type) {
    case 'percent': {
        discountColor = 'text-green';
        const result = calculatePercentDiscount(originalPrice, amount, currency);
        discountOffer = result.discountOffer;
        updatedPrice = result.updatedPrice;
        break;
    }
    case 'fixed': {
        discountColor = 'text-blue';
        const result = calculateFixedDiscount(originalPrice, amount, currency);
        discountOffer = result.discountOffer;
        updatedPrice = result.updatedPrice;
        break;
    }
    case 'trial': {
        discountColor = 'text-pink';
        const result = calculateTrialDiscount(amount);
        discountOffer = result.discountOffer;
        originalPriceWithCurrency = result.originalPriceWithCurrency;
        updatedPrice = originalPrice;
        break;
    }
    default:
        break;
    }

    if (updatedPrice < 0) {
        updatedPrice = 0;
    }

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

// Helper function to filter offers by status and tier activity
const filterOffersByStatus = (offers: any[], allTiers: Tier[] | undefined, status: 'active' | 'archived'): any[] => {
    return offers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        if (status === 'active') {
            return offer.status === 'active' && offerTier && offerTier.active === true;
        }
        return offer.status === 'archived' || (offerTier && offerTier.active === false);
    });
};

// Helper function to sort offers based on selected option and direction
const sortOffers = (offers: any[], sortOption: string, sortDirection: string): any[] => {
    return offers.sort((offer1, offer2) => {
        const multiplier = sortDirection === 'desc' ? -1 : 1;
        switch (sortOption) {
        case 'name':
            return multiplier * offer1.name.localeCompare(offer2.name);
        case 'redemptions':
            return multiplier * (offer1.redemption_count - offer2.redemption_count);
        default:
            return multiplier * ((offer1.created_at ? new Date(offer1.created_at).getTime() : 0) - (offer2.created_at ? new Date(offer2.created_at).getTime() : 0));
        }
    });
};

// Helper function to get offer count label
const getOfferCountLabel = (count: number): string => {
    return count !== 1 ? 'offers' : 'offer';
};

// Helper function to determine if offer row should be disabled
const isOfferDisabled = (offerTier: Tier | undefined): boolean => {
    return offerTier?.active === false;
};

// Helper function to handle offer edit navigation
const handleOfferEditNavigation = (offerId: string, updateRoute: (path: string) => void): void => {
    sessionStorage.setItem('editOfferPageSource', 'offersIndex');
    updateRoute(`offers/edit/${offerId}`);
};

// Helper function to render offer table row
const renderOfferTableRow = (offer: any, offerTier: Tier, allTiers: Tier[] | undefined, handleOfferEdit: (id: string) => void): React.ReactNode => {
    const isTierArchived = isOfferDisabled(offerTier);
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier);
    const disabledClass = isTierArchived ? 'opacity-50' : '';
    const clickableClass = isTierArchived ? 'cursor-default select-none' : 'cursor-pointer';

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item" key={offer.id}>
            <td className={`${disabledClass} p-0`}>
                <a className={`block ${clickableClass} p-5 pl-0`} onClick={!isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {}}>
                    <span className='font-semibold'>{offer?.name}</span><br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${disabledClass} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${clickableClass} p-5`} onClick={!isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {}}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span><br />
                    <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className={`${disabledClass} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${clickableClass} p-5`} onClick={!isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {}}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' ? <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>{originalPriceWithCurrency}</span> : null}
                </a>
            </td>
            <td className={`${disabledClass} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${clickableClass} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`} href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ? offer.id : '') : undefined} onClick={offer.redemption_count === 0 ? !isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {} : () => {}}>
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${disabledClass} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived ? <CopyLinkButton offerCode={offer.code} /> : null}
            </td>
            {isTierArchived ?
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div> :
                null
            }
        </tr>
    );
};

// Helper function to render table header
const renderTableHeader = (selectedTab: string, activeOffersCount: number, archivedOffersCount: number): React.ReactNode => {
    const count = selectedTab === 'active' ? activeOffersCount : archivedOffersCount;
    const label = getOfferCountLabel(count);

    return (
        <tr className='border-b border-b-grey-300 dark:border-grey-800'>
            <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>{count} {label}</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
            <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
        </tr>
    );
};

// Helper function to render offers table
const renderOffersTable = (sortedOffers: any[], selectedTab: string, allTiers: Tier[] | undefined, activeOffersCount: number, archivedOffersCount: number, handleOfferEdit: (id: string) => void): React.ReactNode => {
    const shouldShowHeader = (selectedTab === 'active' && activeOffersCount > 0) || (selectedTab === 'archived' && archivedOffersCount > 0);
    const visibleOffers = sortedOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return (selectedTab === 'active' && (offer.status === 'active' && offerTier && offerTier.active === true)) ||
            (selectedTab === 'archived' && (offer