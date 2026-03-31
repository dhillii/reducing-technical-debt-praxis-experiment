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
    const durationMap: Record<string, string> = {
        'once': 'First payment',
        'repeating': 'Repeating'
    };
    return durationMap[duration] || 'Forever';
};

const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

const getDiscountInfo = (type: OfferType, amount: number): {color: string, offer: string} => {
    const discountMap: Record<OfferType, {color: string, offer: (amount: number) => string}> = {
        'percent': {
            color: 'text-green',
            offer: (amount) => `${amount}% off`
        },
        'fixed': {
            color: 'text-blue',
            offer: (amount) => `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} off`
        },
        'trial': {
            color: 'text-pink',
            offer: (amount) => `${amount} days free`
        }
    };

    const config = discountMap[type];
    return {
        color: config.color,
        offer: config.offer(amount)
    };
};

const calculateUpdatedPrice = (type: OfferType, originalPrice: number, amount: number): number => {
    switch (type) {
    case 'percent':
        return originalPrice - ((originalPrice * amount) / 100);
    case 'fixed':
        return originalPrice - amount;
    case 'trial':
        return originalPrice;
    }
};

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): {discountColor: string, discountOffer: string, originalPriceWithCurrency: string, updatedPriceWithCurrency: string} => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    const {color: discountColor, offer: discountOffer} = getDiscountInfo(type as OfferType, amount);

    let originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));
    if (type === 'trial') {
        originalPriceWithCurrency = '';
    }

    let updatedPrice = calculateUpdatedPrice(type as OfferType, originalPrice, amount);
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

export const EmptyState: React.FC<{title?: string, description: string, buttonAction: () => void, buttonLabel: string}> = ({
    title = 'No offers found',
    description,
    buttonAction,
    buttonLabel
}) => (
    <div className='flex h-full grow flex-col items-center justify-center text-center'>
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='xl' />
        <h1 className='mt-6 text-2xl'>{title}</h1>
        <p className='mt-3 max-w-[420px] text-[1.6rem]'>{description}</p>
        <Button className="mt-8" color="grey" label={buttonLabel} onClick={buttonAction} />
    </div>
);

const OFFERS_TABS: Tab[] = [
    {id: 'active', title: 'Active'},
    {id: 'archived', title: 'Archived'}
];

const filterOffersByStatus = (offers: any[], tiers: Tier[] | undefined, status: 'active' | 'archived'): any[] => {
    return offers.filter((offer) => {
        const offerTier = tiers?.find(tier => tier.id === offer?.tier?.id);
        if (status === 'active') {
            return offer.status === 'active' && offerTier && offerTier.active === true;
        }
        return offer.status === 'archived' || (offerTier && offerTier.active === false);
    });
};

const sortOffers = (offers: any[], sortOption: string, sortDirection: string): any[] => {
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

    const rowClassName = `${isTierArchived ? 'opacity-50' : ''} p-0`;
    const cellClassName = `${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} block p-5`;

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid="offer-item">
            <td className={rowClassName}>
                <a className={cellClassName} onClick={handleRowClick}>
                    <span className='font-semibold'>{offer?.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={cellClassName} onClick={handleRowClick}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>
                        {offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}
                    </span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={cellClassName} onClick={handleRowClick}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' && (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                            {originalPriceWithCurrency}
                        </span>
                    )}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'} ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'}`}
                    href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id || '') : undefined}
                    onClick={offer.redemption_count === 0 && !isTierArchived ? handleRowClick : undefined}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
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

interface OfferTableProps {
    offers: any[];
    allTiers: Tier[] | undefined;
    selectedTab: 'active' | 'archived';
    onEdit: (id: string) => void;
}

const OfferTable: React.FC<OfferTableProps> = ({offers, allTiers, selectedTab, onEdit}) => {
    const displayOffers = offers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return (selectedTab === 'active' && (offer.status === 'active' && offerTier && offerTier.active === true)) ||
               (selectedTab === 'archived' && (offer.status === 'archived' || (offerTier && offerTier.active === false)));
    });

    const offerCount = displayOffers.length;
    const offerLabel = offerCount !== 1 ? 'offers' : 'offer';

    return (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full'>
                {offerCount > 0 && (
                    <tr className='border-b border-b-grey-300 dark:border-grey-800'>
                        <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>
                            {offerCount} {offerLabel}
                        </th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
                        <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
                    </tr>
                )}
                {displayOffers.map((offer) => {
                    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
                    if (!offerTier) {
                        return null;
                    }
                    const isTierArchived = offerTier?.active === false;
                    return (
                        <OfferTableRow
                            key={offer.id}
                            offer={offer}
                            offerTier={offerTier}
                            isTierArchived={isTierArchived}
                            onEdit={onEdit}
                        />
                    );
                })}
            </table>
        </div>
    );
};

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} =