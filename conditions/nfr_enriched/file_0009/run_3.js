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

type OfferDiscountResult = {
    discountColor: string;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
};

type SortOption = 'date-added' | 'name' | 'redemptions';
type SortDirection = 'asc' | 'desc';

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

const calculateDiscountForType = (
    type: OfferType,
    amount: number,
    originalPrice: number
): number => {
    switch (type) {
        case 'percent':
            return originalPrice - ((originalPrice * amount) / 100);
        case 'fixed':
            return originalPrice - amount;
        case 'trial':
            return originalPrice;
        default:
            return originalPrice;
    }
};

const getDiscountDisplayText = (type: OfferType, amount: number, currency: string): string => {
    switch (type) {
        case 'percent':
            return `${amount}% off`;
        case 'fixed':
            return `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`;
        case 'trial':
            return `${amount} days free`;
        default:
            return '';
    }
};

const getDiscountColor = (type: OfferType): string => {
    const colorMap: Record<OfferType, string> = {
        'percent': 'text-green',
        'fixed': 'text-blue',
        'trial': 'text-pink'
    };
    return colorMap[type];
};

export const getOfferDiscount = (
    type: OfferType,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): OfferDiscountResult => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    const updatedPrice = Math.max(0, calculateDiscountForType(type, amount, originalPrice));

    const originalPriceWithCurrency = type === 'trial'
        ? ''
        : getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));

    const updatedPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(updatedPrice)));

    return {
        discountColor: getDiscountColor(type),
        discountOffer: getDiscountDisplayText(type, amount, currency),
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

// Offer Row Component
const OfferTableRow: React.FC<{
    offer: any;
    offerTier: Tier;
    isTierArchived: boolean;
    onEdit: (id: string) => void;
}> = ({offer, offerTier, isTierArchived, onEdit}) => {
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        offerTier
    );

    const handleRowClick = useCallback(() => {
        if (!isTierArchived) {
            onEdit(offer.id || '');
        }
    }, [isTierArchived, offer.id, onEdit]);

    const handleRedemptionClick = useCallback(() => {
        if (offer.redemption_count === 0 && !isTierArchived) {
            onEdit(offer.id || '');
        }
    }, [offer.redemption_count, isTierArchived, offer.id, onEdit]);

    const rowOpacity = isTierArchived ? 'opacity-50' : '';
    const clickableClass = isTierArchived ? 'cursor-default select-none' : 'cursor-pointer';

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid="offer-item">
            <td className={`${rowOpacity} p-0`}>
                <a className={`block ${clickableClass} p-5 pl-0`} onClick={handleRowClick}>
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>
                        {offerTier.name} {getOfferCadence(offer.cadence)}
                    </span>
                </a>
            </td>
            <td className={`${rowOpacity} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${clickableClass} p-5`} onClick={handleRowClick}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>
                        {offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}
                    </span>
                </a>
            </td>
            <td className={`${rowOpacity} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${clickableClass} p-5`} onClick={handleRowClick}>
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
                    className={`block ${clickableClass} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
                    href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id || '') : undefined}
                    onClick={handleRedemptionClick}
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

// Offers Table Component
const OffersTable: React.FC<{
    offers: any[];
    tiers: Tier[] | undefined;
    selectedTab: string;
    activeOffers: any[];
    archivedOffers: any[];
    onEdit: (id: string) => void;
}> = ({offers, tiers, selectedTab, activeOffers, archivedOffers, onEdit}) => {
    const displayOffers = selectedTab === 'active' ? activeOffers : archivedOffers;
    const hasOffers = displayOffers.length > 0;

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
                        <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700' />
                    </tr>
                </thead>
                <tbody>
                    {displayOffers.map((offer) => {
                        const offerTier = tiers?.find(tier => tier.id === offer.tier?.id);
                        if (!offerTier) return null;

                        return (
                            <OfferTableRow
                                key={offer.id}
                                offer={offer}
                                offerTier={offerTier}
                                isTierArchived={offerTier.active === false}
                                onEdit={onEdit}
                            />
                        );
                    })}
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
    const {sortingState, setSortingState} = useSortingState();
    const [selectedTab, setSelectedTab] = useState('active');

    const signupOffers = useMemo(
        () => allOffers.filter(offer => offer.redemption_type === 'signup'),
        [allOffers]
    );

    const {activeOffers, archivedOffers} = useMemo(() => {
        const active = signupOffers.filter((offer) => {
            const offerTier = allTiers?.find(tier => tier.id === offer.tier?.id);
            return offer.status === 'active' && offerTier?.active === true;
        });

        const archived = signupOffers.filter((offer) => {
            const offerTier = allTiers?.find(tier => tier.id === offer.tier?.id);
            return offer.status === 'archived' || offerTier?.active === false;
        });

        return {activeOffers: active, archivedOffers: archived};
    }, [signupOffers, allTiers]);

    const offersSorting = useMemo(
        () => sortingState?.find(sorting => sorting.type === 'offers'),
        [sortingState]
    );

    const sortOption = (offersSorting?.option || 'date-added') as SortOption;
    const sortDirection = (