import {type OfferType, createRedemptionFilterUrl, getOfferCadence, getOfferDuration, getOfferDiscount, CopyLinkButton, EmptyState} from './OffersIndexComponents';
import {Button, type Tab, TabView} from '@tryghost/admin-x-design-system';
import {ButtonGroup, showToast} from '@tryghost/admin-x-design-system';
import {Modal} from '@tryghost/admin-x-design-system';
import {SortMenu} from '@tryghost/admin-x-design-system';
import {type Tier, getPaidActiveTiers, useBrowseTiers} from '@tryghost/admin-x-framework/api/tiers';
import {getHomepageUrl} from '@tryghost/admin-x-framework/api/site';
import {useBrowseOffers} from '@tryghost/admin-x-framework/api/offers';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useModal} from '@ebay/nice-modal-react';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {useSortingState} from '../../../providers/settings-app-provider';
import {useState} from 'react';

/**
 * Filters and separates offers into active and archived segments based on tier status and offer status.
 * @param allOffers - Full list of offers
 * @param allTiers - Full list of tiers
 * @returns Object with filtered active and archived offers arrays
 */
const useFilteredOffers = (allOffers: any[], allTiers: Tier[] | undefined) => {
    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const activeOffers = signupOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return offer.status === 'active' && offerTier?.active === true;
    });
    const archivedOffers = signupOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return offer.status === 'archived' || (offerTier && offerTier.active === false);
    });

    return {activeOffers, archivedOffers};
};

/**
 * Handles sorting of offers based on provided sort configuration.
 * @param offers - Array of offers to sort
 * @param sortOption - Sort key: 'name', 'redemptions', or 'date-added'
 * @param sortDirection - Sort direction: 'asc' or 'desc'
 * @returns Sorted offer array
 */
const useSortedOffers = (offers: any[], sortOption: string, sortDirection: 'asc' | 'desc') => {
    return [...offers].sort((offer1, offer2) => {
        const multiplier = sortDirection === 'desc' ? -1 : 1;
        switch (sortOption) {
        case 'name':
            return multiplier * (offer1.name.localeCompare(offer2.name));
        case 'redemptions':
            return multiplier * (offer1.redemption_count - offer2.redemption_count);
        default:
            const date1 = offer1.created_at ? new Date(offer1.created_at).getTime() : 0;
            const date2 = offer2.created_at ? new Date(offer2.created_at).getTime() : 0;
            return multiplier * (date1 - date2);
        }
    });
};

/**
 * Renders the list layout for offers, applying tab-based filtering and mapping each offer to its row representation.
 * @param selectedTab - Currently selected tab ('active' or 'archived')
 * @param allTiers - Full list of tiers
 * @param activeOffers - Pre-filtered active offers
 * @param archivedOffers - Pre-filtered archived offers
 * @param sortedOffers - Fully sorted offers list
 * @param handleOfferEdit - Callback for editing an offer
 * @returns JSX for offer list layout
 */
const renderOffersList = (selectedTab: string, allTiers: Tier[] | undefined, activeOffers: any[], archivedOffers: any[], sortedOffers: any[], handleOfferEdit: (id: string) => void) => {
    const displayOffers = sortedOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return (selectedTab === 'active' && offer.status === 'active' && offerTier?.active === true) ||
               (selectedTab === 'archived' && (offer.status === 'archived' || (offerTier && offerTier.active === false)));
    });

    return (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full'>
                {(selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0) ?
                    <tr className='border-b border-b-grey-300 dark:border-grey-800'>
                        <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>{selectedTab === 'active' ? activeOffers.length : archivedOffers.length} {selectedTab === 'active' ? (activeOffers.length !== 1 ? 'offers' : 'offer') : (archivedOffers.length !== 1 ? 'offers' : 'offer')}</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
                        <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
                    </tr> :
                    null
                }
                {displayOffers.map((offer) => renderOfferRow(offer, allTiers, handleOfferEdit))}
            </table>
        </div>
    );
};

/**
 * Renders a single offer row with supporting UI elements including discount display and linking.
 * @param offer - Offer object
 * @param allTiers - Full list of tiers
 * @param handleOfferEdit - Callback for editing an offer
 * @returns JSX for a single row
 */
const renderOfferRow = (offer: any, allTiers: Tier[] | undefined, handleOfferEdit: (id: string) => void) => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    if (!offerTier) {
        return null;
    }

    const isTierArchived = offerTier.active === false;
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier);

    return (
        <tr className="group relative scale-100 border-b border-b-grey-200 dark:border-grey-800" data-testid="offer-item" key={offer.id}>
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`}
                    onClick={!isTierArchived ? () => handleOfferEdit(offer.id) : () => {}}
                >
                    <span className="font-semibold">{offer.name}</span><br />
                    <span className="text-sm text-grey-700">{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                    onClick={!isTierArchived ? () => handleOfferEdit(offer.id) : () => {}}
                >
                    <span className="text-[1.3rem] font-medium uppercase">{discountOffer}</span><br />
                    <span className="text-grey-700">{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                    onClick={!isTierArchived ? () => handleOfferEdit(offer.id) : () => {}}
                >
                    <span className="font-medium">{updatedPriceWithCurrency}</span>{' '}
                    {offer.type !== 'trial' ? (
                        <span className="relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-['']">{originalPriceWithCurrency}</span>
                    ) : null}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
                    href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id) : undefined}
                    onClick={offer.redemption_count === 0 ? () => !isTierArchived && handleOfferEdit(offer.id) : () => {}}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived ? <CopyLinkButton offerCode={offer.code} /> : null}
            </td>
            {isTierArchived ? (
                <div className="absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950">
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div>
            ) : null}
        </tr>
    );
};

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();

    const {activeOffers, archivedOffers} = useFilteredOffers(allOffers, allTiers);

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');
    const [selectedTab, setSelectedTab] = useState('active');

    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const sortedOffers = useSortedOffers(allOffers, sortOption, sortDirection);
    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const buttons: any[] = [
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
            onClick: () => {
                if (paidActiveTiers.length === 0) {
                    showToast({
                        type: 'info',
                        title: 'You must have an active tier to create an offer.'
                    });
                } else {
                    updateRoute('offers/new');
                }
            }
        }
    ];

    const tabs: Tab[] = [{id: 'active', title: 'Active'}, {id: 'archived', title: 'Archived'}];

    return <Modal
        afterClose={() => {
            updateRoute('offers');
        }}
        animate={false}
        backDropClick={false}
        cancelLabel=""
        footer={false}
        height="full"
        size="lg"
        testId="offers-modal"
        title="Offers"
        topRightContent={<ButtonGroup buttons={buttons} />}
        width={1140}
    >
        <div className="flex h-full flex-col pt-8">
            <header>
                <TabView
                    selectedTab={selectedTab}
                    tabs={tabs}
                    topRightContent={
                        (selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0) ?
                            <div className="pt-1">
                                <SortMenu
                                    direction={sortDirection as 'asc' | 'desc'}
                                    items={[
                                        {id: 'date-added', label: 'Date added', selected: sortOption === 'date-added', direction: sortDirection as 'asc' | 'desc'},
                                        {id: 'name', label: 'Name', selected: sortOption === 'name', direction: sortDirection as 'asc' | 'desc'},
                                        {id: 'redemptions', label: 'Redemptions', selected: sortOption === 'redemptions', direction: sortDirection as 'asc' | 'desc'}
                                    ]}
                                    position="end"
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
                            </div> :
                            null
                    }
                    onTabChange={setSelectedTab}
                />
            </header>

            {selectedTab === 'active' && activeOffers.length === 0 && !isFetchingOffers && (
                <EmptyState
                    buttonAction={() => updateRoute('offers/new')}
                    buttonLabel="Create an offer"
                    description="Grow your audience with discounts or free trials."
                />
            )}

            {selectedTab === 'archived' && archivedOffers.length === 0 && !isFetchingOffers && (
                <EmptyState
                    buttonAction={() => setSelectedTab('active')}
                    buttonLabel="Back to active"
                    description="All archived offers will be shown here."
                />
            )}

            {renderOffersList(selectedTab, allTiers, activeOffers, archivedOffers, sortedOffers, handleOfferEdit)}
        </div>
    </Modal>;
};