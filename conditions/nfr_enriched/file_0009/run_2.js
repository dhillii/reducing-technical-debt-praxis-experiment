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
import {useState, useMemo, useCallback} from 'react';

export type OfferType = 'percent' | 'fixed' | 'trial';

type SortOption = 'date-added' | 'name' | 'redemptions';
type SortDirection = 'asc' | 'desc';

interface OfferDiscount {
    discountColor: string;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
}

interface OfferWithTier {
    offer: any;
    tier: Tier;
    isTierArchived: boolean;
}

// Utility Functions
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

const calculateDiscountPrice = (type: string, originalPrice: number, amount: number): number => {
    switch (type) {
        case 'percent':
            return originalPrice - ((originalPrice * amount) / 100);
        case 'fixed':
            return originalPrice - amount;
        default:
            return originalPrice;
    }
};

const getDiscountDisplay = (type: string, amount: number, currency: string): {color: string; text: string} => {
    const displayMap: Record<string, {color: string; text: string}> = {
        'percent': {color: 'text-green', text: `${amount}% off`},
        'fixed': {color: 'text-blue', text: `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`},
        'trial': {color: 'text-pink', text: `${amount} days free`}
    };
    return displayMap[type] || {color: '', text: ''};
};

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): OfferDiscount => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    const {color: discountColor, text: discountOffer} = getDiscountDisplay(type, amount, currency);
    
    let updatedPrice = calculateDiscountPrice(type, originalPrice, amount);
    updatedPrice = Math.max(0, updatedPrice);

    const originalPriceWithCurrency = type === 'trial' 
        ? '' 
        : getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));
    
    const updatedPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(updatedPrice)));

    return {
        discountColor,
        discountOffer,
        originalPriceWithCurrency,
        updatedPriceWithCurrency
    };
};

// Components
export const CopyLinkButton: React.FC<{offerCode: string}> = ({offerCode}) => {
    const [isCopied, setIsCopied] = useState(false);
    const {siteData} = useGlobalData();

    const handleCopyClick = useCallback((e?: React.MouseEvent<HTMLElement, MouseEvent>) => {
        e?.stopPropagation();
        const offerLink = `${getHomepageUrl(siteData!)}${offerCode}`;
        navigator.clipboard.writeText(offerLink);
        setIsCopied(true);
        const timer = setTimeout(() => setIsCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [offerCode, siteData]);

    const icon = isCopied ? 'check-circle' : 'hyperlink-circle';
    const label = isCopied ? 'Copied' : 'Copy';
    const iconColorClass = isCopied ? 'text-green w-[14px] h-[14px]' : 'w-[14px] h-[14px]';

    return (
        <Tooltip 
            containerClassName='group-hover:opacity-100 opacity-0 inline-flex items-center -mr-1 justify-center leading-none w-5 h-5' 
            content={label} 
            size='sm'
        >
            <Button 
                color='clear' 
                hideLabel={true} 
                icon={icon} 
                iconColorClass={iconColorClass} 
                label={label} 
                unstyled={true} 
                onClick={handleCopyClick} 
            />
        </Tooltip>
    );
};

export const EmptyState: React.FC<{
    title?: string;
    description: string;
    buttonAction: () => void;
    buttonLabel: string;
}> = ({title = 'No offers found', description, buttonAction, buttonLabel}) => (
    <div className='flex h-full grow flex-col items-center justify-center text-center'>
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='xl' />
        <h1 className='mt-6 text-2xl'>{title}</h1>
        <p className='mt-3 max-w-[420px] text-[1.6rem]'>{description}</p>
        <Button className="mt-8" color="grey" label={buttonLabel} onClick={buttonAction} />
    </div>
);

// Table Row Component
const OfferTableRow: React.FC<{
    offerWithTier: OfferWithTier;
    onEdit: (id: string) => void;
}> = ({offerWithTier: {offer, tier, isTierArchived}, onEdit}) => {
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        tier
    );

    const handleRowClick = useCallback(() => {
        if (!isTierArchived) {
            onEdit(offer.id || '');
        }
    }, [isTierArchived, offer.id, onEdit]);

    const rowOpacity = isTierArchived ? 'opacity-50' : '';
    const rowClickable = !isTierArchived ? 'cursor-pointer' : 'cursor-default select-none';

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid="offer-item">
            <td className={`${rowOpacity} p-0`}>
                <a className={`block ${rowClickable} p-5 pl-0`} onClick={handleRowClick}>
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{tier.name} {getOfferCadence(offer.cadence)}</span>
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
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                            {originalPriceWithCurrency}
                        </span>
                    )}
                </a>
            </td>
            <td className={`${rowOpacity} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a 
                    className={`block ${rowClickable} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
                    href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id || '') : undefined}
                    onClick={offer.redemption_count === 0 ? handleRowClick : undefined}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${rowOpacity} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived && <CopyLinkButton offerCode={offer.code} />}
            </td>
            {isTierArchived && (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div>
            )}
        </tr>
    );
};

// Table Component
const OffersTable: React.FC<{
    offers: any[];
    tiers: Tier[];
    selectedTab: string;
    activeOffers: any[];
    archivedOffers: any[];
    onEdit: (id: string) => void;
}> = ({offers, tiers, selectedTab, activeOffers, archivedOffers, onEdit}) => {
    const displayOffers = selectedTab === 'active' ? activeOffers : archivedOffers;
    const hasOffers = displayOffers.length > 0;

    const offersWithTiers: OfferWithTier[] = useMemo(() => {
        return offers
            .map(offer => {
                const tier = tiers.find(t => t.id === offer.tier?.id);
                return tier ? {offer, tier, isTierArchived: !tier.active} : null;
            })
            .filter((item): item is OfferWithTier => item !== null)
            .filter(({offer, tier}) => {
                const isActive = offer.status === 'active' && tier.active;
                const isArchived = offer.status === 'archived' || !tier.active;
                return selectedTab === 'active' ? isActive : isArchived;
            });
    }, [offers, tiers, selectedTab]);

    if (!hasOffers) {
        return null;
    }

    return (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full'>
                <thead>
                    <tr className='border-b border-b-grey-300 dark:border-grey-800'>
                        <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>
                            {displayOffers.length} {displayOffers.length !== 1 ? 'offers' : 'offer'}
                        </th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
                        <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
                    </tr>
                </thead>
                <tbody>
                    {offersWithTiers.map(offerWithTier => (
                        <OfferTableRow 
                            key={offerWithTier.offer.id} 
                            offerWithTier={offerWithTier} 
                            onEdit={onEdit}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// Main Modal Component
export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const [selectedTab, setSelectedTab] = useState<'active' | 'archived'>('active');

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');
    const sortOption = (offersSorting?.option || 'date-added') as SortOption;
    const sortDirection = (offersSorting?.direction || 'desc') as SortDirection;

    const signupOffers = useMemo(() => 
        allOffers.filter(offer => offer.redemption_type === 'signup'),
        [allOffers]
    );

    const {activeOffers, archivedOffers} = useMemo(() => {
        const active = signupOffers.filter(offer => {
            const tier = allTiers?.find(t => t.id === offer.tier?.id);
            return offer.status === 'active' && tier?.active === true;
        });
        const archived = signupOffers.filter(offer => {
            const tier = allTiers?.find(t => t.id === offer.tier?.id);
            return offer.