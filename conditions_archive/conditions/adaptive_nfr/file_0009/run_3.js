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

/** @internal Calculates updated price based on offer type and amount */
const calculateUpdatedPrice = (type: string, originalPrice: number, amount: number): number => {
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

/** @internal Generates discount offer text based on type and amount */
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
    const discountColor = getDiscountColor(type);
    const discountOffer = getDiscountOfferText(type, amount, currency);
    
    let originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));
    if (type === 'trial') {
        originalPriceWithCurrency = '';
    }

    let updatedPrice = calculateUpdatedPrice(type, originalPrice, amount);
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

/** @internal Checks if offer is active */
const isOfferActive = (offer: any, offerTier: Tier | undefined): boolean => {
    return offer.status === 'active' && offerTier && offerTier.active === true;
};

/** @internal Checks if offer is archived */
const isOfferArchived = (offer: any, offerTier: Tier | undefined): boolean => {
    return offer.status === 'archived' || (offerTier && offerTier.active === false);
};

/** @internal Checks if tier is archived */
const isTierArchived = (offerTier: Tier | undefined): boolean => {
    return offerTier?.active === false;
};

/** @internal Checks if should show sort menu */
const shouldShowSortMenu = (selectedTab: string, activeOffers: any[], archivedOffers: any[]): boolean => {
    return (selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0);
};

/** @internal Checks if should show empty state for active tab */
const shouldShowActiveEmptyState = (selectedTab: string, activeOffers: any[], isFetchingOffers: boolean): boolean => {
    return selectedTab === 'active' && activeOffers.length === 0 && !isFetchingOffers;
};

/** @internal Checks if should show empty state for archived tab */
const shouldShowArchivedEmptyState = (selectedTab: string, archivedOffers: any[], isFetchingOffers: boolean): boolean => {
    return selectedTab === 'archived' && archivedOffers.length === 0 && !isFetchingOffers;
};

/** @internal Checks if should show table header */
const shouldShowTableHeader = (selectedTab: string, activeOffers: any[], archivedOffers: any[]): boolean => {
    return (selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0);
};

/** @internal Gets offer count label */
const getOfferCountLabel = (count: number): string => {
    return count !== 1 ? 'offers' : 'offer';
};

/** @internal Filters offers by selected tab */
const filterOffersByTab = (offers: any[], selectedTab: string, allTiers: Tier[] | undefined): any[] => {
    return offers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        if (selectedTab === 'active') {
            return isOfferActive(offer, offerTier);
        }
        return isOfferArchived(offer, offerTier);
    });
};

/** @internal Sorts offers based on sort option and direction */
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

/** @internal Renders offer table row */
const renderOfferRow = (offer: any, offerTier: Tier | undefined, handleOfferEdit: (id: string) => void, allTiers: Tier[] | undefined): React.ReactNode => {
    if (!offerTier) {
        return null;
    }

    const isArchived = isTierArchived(offerTier);
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier);
    const offerId = offer?.id ? offer.id : '';
    const handleClick = isArchived ? () => {} : () => handleOfferEdit(offerId);
    const hasRedemptions = offer.redemption_count > 0;
    const redemptionUrl = hasRedemptions ? createRedemptionFilterUrl(offerId) : undefined;

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item" key={offerId}>
            <td className={`${isArchived ? 'opacity-50' : ''} p-0`}>
                <a className={`block ${isArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`} onClick={handleClick}>
                    <span className='font-semibold'>{offer?.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${isArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={handleClick}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className={`${isArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={handleClick}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' && <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>{originalPriceWithCurrency}</span>}
                </a>
            </td>
            <td className={`${isArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${hasRedemptions ? 'hover:underline' : ''}`} href={redemptionUrl} onClick={!hasRedemptions && !isArchived ? () => handleOfferEdit(offerId) : () => {}}>
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isArchived && <CopyLinkButton offerCode={offer.code} />}
            </td>
            {isArchived && (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div>
            )}
        </tr>
    );
};

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const activeOffers = signupOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return isOfferActive(offer, offerTier);
    });
    const archivedOffers = signupOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return isOfferArchived(offer, offerTier);
    });

    const offersTabs: Tab[] = [
        {id: 'active', title: 'Active'},
        {id: 'archived', title: 'Archived'}
    ];

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');

    const [selectedTab, setSelectedTab] = useState('active');

    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const sortedOffers = sortOffers(signupOffers, sortOption, sortDirection);
    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

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

    const displayedOffers = filterOffersByTab(sortedOffers, selectedTab, allTiers);
    const showTableHeader = shouldShowTableHeader(selectedTab, activeOffers, archivedOffers);
    const displayCount = selectedTab === 'active' ? activeOffers.length : archivedOffers.length;
    const countLabel = getOfferCountLabel(displayCount);

    const listLayoutOutput = (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full'>
                {showTableHeader && (
                    <tr className='border-b border-b-grey-300 dark:border-grey-800'>
                        <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>{displayCount} {countLabel}</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
                        <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
                    </tr>
                )}
                {displayedOffers.map((offer) => {
                    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
                    return renderOfferRow(offer, offerTier, handleOfferEdit, allTiers);
                })}
            </table>
        </div>
    );

    return (
        <Modal
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
            topRightContent={<ButtonGroup buttons={buttons} />}
            width={1140}
        >
            <div className='flex h-full flex-col pt-8'>
                <header>
                    <TabView
                        selectedTab={selectedTab}
                        tabs={offersTabs}
                        topRightContent={
                            shouldShowSortMenu(selectedTab, activeOffers, archivedOffers) ? (
                                <div className='pt-1'>
                                    <SortMenu
                                        direction={sortDirection as 'asc' | 'desc'}
                                        items={[
                                            {id: 'date-added', label: 'Date added', selected: sortOption === 'date-added', direction: sortDirection as 'asc' | 'desc'},
                                            {id: 'name', label: 'Name', selected: sortOption === 'name', direction: sortDirection as 'asc' | 'desc'},
                                            {id: 'redemptions', label: 'Redemptions', selected: sortOption === 'redemptions', direction: sortDirection as 'asc' | 'desc'}
                                        ]}
                                        position='end'
                                        triggerButtonProps={{
                                            link: true
                                        }}
                                        onDirectionChange={(selectedDirection) => {
                                            const newDirection = selectedDirection === 'asc' ? 'desc' : 'asc';
                                            setSortingState?.([{
                                                type: 'offers',
                                                option: sortOption,
                                                direction: newDirection
                                            }]);
                                        }}
                                        onSortChange={(selectedOption) => {
                                            setSortingState?.([{
                                                type: 'offers',
                                                option: selectedOption,
                                                direction: sortDirection
                                            }]);
                                        }}
                                    />
                                </div>
                            ) : null
                        }
                        onTabChange={setSelectedTab}
                    />
                </header>
                {shouldShowActiveEmptyState(selectedTab, activeOffers, isFetchingOffers) && (
                    <EmptyState
                        buttonAction={() => updateRoute('offers/new')}
                        buttonLabel='Create an offer'
                        description='Grow your audience with discounts or free trials.'
                    />
                )}
                {shouldShowArchivedEmptyState(selectedTab, archivedOffers, isFetchingOffers) && (
                    <EmptyState
                        buttonAction={() => setSelectedTab('active')}
                        buttonLabel='Back to active'
                        description='All archived offers will be shown here.'
                    />
                )}
                {listLayoutOutput}
            </div>
        </Modal>
    );
};
```