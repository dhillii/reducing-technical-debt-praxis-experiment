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

/** @internal Formats number to two decimal places */
const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

/** @internal Calculates percent discount amount */
const calculatePercentDiscount = (originalPrice: number, amount: number): number => {
    return originalPrice - ((originalPrice * amount) / 100);
};

/** @internal Calculates fixed discount amount */
const calculateFixedDiscount = (originalPrice: number, amount: number): number => {
    return originalPrice - amount;
};

/** @internal Ensures price is not negative */
const ensureNonNegativePrice = (price: number): number => {
    return price < 0 ? 0 : price;
};

/** @internal Gets discount color for offer type */
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

/** @internal Gets discount offer text */
const getDiscountOfferText = (type: string, amount: number, currency: string): string => {
    switch (type) {
    case 'percent':
        return amount + '% off';
    case 'fixed':
        return numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount))) + ' ' + currency + ' off';
    case 'trial':
        return amount + ' days free';
    default:
        return '';
    }
};

export const getOfferDiscount = (type: string, amount: number, cadence: string, currency: string, tier: Tier | undefined): {discountColor: string, discountOffer: string, originalPriceWithCurrency: string, updatedPriceWithCurrency: string} => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    
    let updatedPrice = originalPrice;
    if (type === 'percent') {
        updatedPrice = calculatePercentDiscount(originalPrice, amount);
    } else if (type === 'fixed') {
        updatedPrice = calculateFixedDiscount(originalPrice, amount);
    }
    
    updatedPrice = ensureNonNegativePrice(updatedPrice);

    const originalPriceWithCurrency = type === 'trial' ? '' : getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));
    const updatedPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(updatedPrice)));

    return {
        discountColor: getDiscountColor(type),
        discountOffer: getDiscountOfferText(type, amount, currency),
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

/** @internal Checks if offer tier is active */
const isOfferTierActive = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offerTier?.active === true;
};

/** @internal Checks if offer is active */
const isOfferActive = (offer: any, allTiers: Tier[] | undefined): boolean => {
    return offer.status === 'active' && isOfferTierActive(offer, allTiers);
};

/** @internal Checks if offer is archived */
const isOfferArchived = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offer.status === 'archived' || (offerTier && offerTier.active === false);
};

/** @internal Checks if tab should display offers */
const shouldDisplayOffersForTab = (selectedTab: string, offer: any, allTiers: Tier[] | undefined): boolean => {
    if (selectedTab === 'active') {
        return isOfferActive(offer, allTiers);
    }
    return isOfferArchived(offer, allTiers);
};

/** @internal Checks if sort menu should be visible */
const shouldShowSortMenu = (selectedTab: string, activeOffers: any[], archivedOffers: any[]): boolean => {
    return (selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0);
};

/** @internal Gets offer count label */
const getOfferCountLabel = (count: number): string => {
    return count !== 1 ? 'offers' : 'offer';
};

/** @internal Gets current offers list based on tab */
const getCurrentOffersList = (selectedTab: string, activeOffers: any[], archivedOffers: any[]): any[] => {
    return selectedTab === 'active' ? activeOffers : archivedOffers;
};

/** @internal Compares offers by name */
const compareOffersByName = (offer1: any, offer2: any, multiplier: number): number => {
    return multiplier * offer1.name.localeCompare(offer2.name);
};

/** @internal Compares offers by redemptions */
const compareOffersByRedemptions = (offer1: any, offer2: any, multiplier: number): number => {
    return multiplier * (offer1.redemption_count - offer2.redemption_count);
};

/** @internal Compares offers by date */
const compareOffersByDate = (offer1: any, offer2: any, multiplier: number): number => {
    const date1 = offer1.created_at ? new Date(offer1.created_at).getTime() : 0;
    const date2 = offer2.created_at ? new Date(offer2.created_at).getTime() : 0;
    return multiplier * (date1 - date2);
};

/** @internal Sorts offers based on option */
const sortOffersByOption = (offer1: any, offer2: any, sortOption: string, multiplier: number): number => {
    switch (sortOption) {
    case 'name':
        return compareOffersByName(offer1, offer2, multiplier);
    case 'redemptions':
        return compareOffersByRedemptions(offer1, offer2, multiplier);
    default:
        return compareOffersByDate(offer1, offer2, multiplier);
    }
};

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const activeOffers = signupOffers.filter((offer) => isOfferActive(offer, allTiers));
    const archivedOffers = signupOffers.filter((offer) => isOfferArchived(offer, allTiers));

    let offersTabs: Tab[] = [
        {id: 'active', title: 'Active'},
        {id: 'archived', title: 'Archived'}
    ];

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');

    const [selectedTab, setSelectedTab] = useState('active');

    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const handleOfferEdit = (id:string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const sortedOffers = signupOffers.sort((offer1, offer2) => {
        const multiplier = sortDirection === 'desc' ? -1 : 1;
        return sortOffersByOption(offer1, offer2, sortOption, multiplier);
    });

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const currentOffersList = getCurrentOffersList(selectedTab, activeOffers, archivedOffers);
    const shouldShowTable = currentOffersList.length > 0;
    const offerCountLabel = getOfferCountLabel(currentOffersList.length);

    const listLayoutOutput = <div className='overflow-x-auto'>
        <table className='m-0 w-full'>
            {shouldShowTable ?
                <tr className='border-b border-b-grey-300 dark:border-grey-800'>
                    <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>{currentOffersList.length} {offerCountLabel}</th>
                    <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
                    <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
                    <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
                    <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
                </tr> :
                null
            }
            {sortedOffers.filter((offer) => shouldDisplayOffersForTab(selectedTab, offer, allTiers)).map((offer) => {
                const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);

                if (!offerTier) {
                    return null;
                }

                const isTierArchived = offerTier?.active === false;
                const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier);

                return <OfferTableRow
                    key={offer.id}
                    offer={offer}
                    offerTier={offerTier}
                    isTierArchived={isTierArchived}
                    discountOffer={discountOffer}
                    originalPriceWithCurrency={originalPriceWithCurrency}
                    updatedPriceWithCurrency={updatedPriceWithCurrency}
                    onEdit={handleOfferEdit}
                />;
            })}
        </table>
    </div>;

    const handleNewOfferClick = () => {
        if (paidActiveTiers.length === 0) {
            showToast({
                type: 'info',
                title: 'You must have an active tier to create an offer.'
            });
            return;
        }
        updateRoute('offers/new');
    };

    const buttons: ButtonProps[] = [
        {
            key: 'cancel-modal',
            label: 'Close',
            onClick: () => {
                modal.remove();
                updateRoute('offers');
            }
        },
        {
            key: 'new-offer',
            icon: 'add',
            label: 'New offer',
            color: 'green',
            onClick: handleNewOfferClick
        }
    ];

    return <Modal
        afterClose={() => {
            updateRoute('offers');
        }}
        animate={false}
        backDropClick={false}
        cancelLabel=''
        footer={false}
        height='full'
        size='lg'
        testId='offers-modal'
        title='Offers'
        topRight