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

/**
 * Determines if an offer is active based on its status and tier active flag.
 * @param offer - The offer to evaluate.
 * @param tier - The tier associated with the offer.
 * @returns true if the offer is active and its tier is active.
 */
function isOfferActive(offer: any, tier: Tier | undefined): boolean {
    return offer.status === 'active' && tier?.active === true;
}

/**
 * Determines if an offer is archived based on its status and tier active flag.
 * @param offer - The offer to evaluate.
 * @param tier - The tier associated with the offer.
 * @returns true if the offer is archived or its tier is inactive.
 */
function isOfferArchived(offer: any, tier: Tier | undefined): boolean {
    return offer.status === 'archived' || (tier?.active === false);
}

/**
 * Comparator for sorting offers based on selected option and direction.
 * @param offer1 - First offer to compare.
 * @param offer2 - Second offer to compare.
 * @param sortOption - The field to sort by.
 * @param sortDirection - 'asc' or 'desc'.
 * @returns Comparison result.
 */
function compareOffers(
    offer1: any,
    offer2: any,
    sortOption: string,
    sortDirection: 'asc' | 'desc'
): number {
    const multiplier = sortDirection === 'desc' ? -1 : 1;
    switch (sortOption) {
        case 'name':
            return multiplier * offer1.name.localeCompare(offer2.name);
        case 'redemptions':
            return multiplier * (offer1.redemption_count - offer2.redemption_count);
        default:
            const date1 = offer1.created_at ? new Date(offer1.created_at).getTime() : 0;
            const date2 = offer2.created_at ? new Date(offer2.created_at).getTime() : 0;
            return multiplier * (date1 - date2);
    }
}

/**
 * Renders a single offer row in the offers table.
 * @param offer - The offer data.
 * @param tier - The tier associated with the offer.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element for the offer row or null if tier missing.
 */
function renderOfferRow(
    offer: any,
    tier: Tier | undefined,
    handleOfferEdit: (id: string) => void
): JSX.Element | null {
    if (!tier) {
        return null;
    }

    const isTierArchived = tier.active === false;
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        tier
    );

    const editHandler = () => {
        if (!isTierArchived) {
            handleOfferEdit(offer.id ?? '');
        }
    };

    const redemptionHref = offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ?? '') : undefined;
    const redemptionOnClick = () => {
        if (offer.redemption_count === 0 && !isTierArchived) {
            handleOfferEdit(offer.id ?? '');
        }
    };

    const copyLink = !isTierArchived ? <CopyLinkButton offerCode={offer.code} /> : null;

    const overlay = isTierArchived ? (
        <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
            This offer is disabled, because <br /> it is tied to an archived tier.
        </div>
    ) : null;

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`}
                    onClick={editHandler}
                >
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>
                        {tier.name} {getOfferCadence(offer.cadence)}
                    </span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                    onClick={editHandler}
                >
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>
                        {offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}
                    </span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                    onClick={editHandler}
                >
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
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
                    href={redemptionHref}
                    onClick={redemptionOnClick}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {copyLink}
            </td>
            {overlay}
        </tr>
    );
}

/**
 * Renders the table of offers based on the selected tab.
 * @param sortedOffers - Array of offers sorted by selected criteria.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab ('active' or 'archived').
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderOffersTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    const rows = sortedOffers
        .filter((offer) => {
            const tier = allTiers?.find((t) => t.id === offer.tier?.id);
            if (selectedTab === 'active') {
                return isOfferActive(offer, tier);
            }
            return isOfferArchived(offer, tier);
        })
        .map((offer) => {
            const tier = allTiers?.find((t) => t.id === offer.tier?.id);
            return renderOfferRow(offer, tier, handleOfferEdit);
        });

    const headerLabel = selectedTab === 'active'
        ? `${activeOffers.length} ${activeOffers.length !== 1 ? 'offers' : 'offer'}`
        : `${archivedOffers.length} ${archivedOffers.length !== 1 ? 'offers' : 'offer'}`;

    return (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full'>
                {(selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0) ? (
                    <tr className='border-b border-b-grey-300 dark:border-grey-800'>
                        <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>{headerLabel}</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
                        <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
                    </tr>
                ) : null}
                {rows}
            </table>
        </div>
    );
}

/**
 * Renders the header with tabs and sort menu.
 * @param selectedTab - Currently selected tab.
 * @param activeOffers - Array of active offers.
 * @param archivedOffers - Array of archived offers.
 * @param sortOption - Current sort option.
 * @param sortDirection - Current sort direction.
 * @param setSortingState - Function to update sorting state.
 * @param setSelectedTab - Function to change selected tab.
 * @returns JSX element for the header.
 */
function renderHeader(
    selectedTab: string,
    activeOffers: any[],
    archivedOffers: any[],
    sortOption: string,
    sortDirection: 'asc' | 'desc',
    setSortingState: any,
    setSelectedTab: (tab: string) => void
): JSX.Element {
    const showSortMenu = (selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0);

    const onDirectionChange = (selectedDirection: 'asc' | 'desc') => {
        const newDirection = selectedDirection === 'asc' ? 'desc' : 'asc';
        setSortingState?.([
            {
                type: 'offers',
                option: sortOption,
                direction: newDirection
            }
        ]);
    };

    const onSortChange = (selectedOption: string) => {
        setSortingState?.([
            {
                type: 'offers',
                option: selectedOption,
                direction: sortDirection
            }
        ]);
    };

    return (
        <header>
            <TabView
                selectedTab={selectedTab}
                tabs={[
                    {id: 'active', title: 'Active'},
                    {id: 'archived', title: 'Archived'}
                ]}
                topRightContent={
                    showSortMenu ? (
                        <div className='pt-1'>
                            <SortMenu
                                direction={sortDirection as 'asc' | 'desc'}
                                items={[
                                    {id: 'date-added', label: 'Date added', selected: sortOption === 'date-added', direction: sortDirection as 'asc' | 'desc'},
                                    {id: 'name', label: 'Name', selected: sortOption === 'name', direction: sortDirection as 'asc' | 'desc'},
                                    {id: 'redemptions', label: 'Redemptions', selected: sortOption === 'redemptions', direction: sortDirection as 'asc' | 'desc'}
                                ]}
                                position='end'
                                triggerButtonProps={{link: true}}
                                onDirectionChange={onDirectionChange}
                                onSortChange={onSortChange}
                            />
                        </div>
                    ) : null
                }
                onTabChange={setSelectedTab}
            />
        </header>
    );
}

/**
 * Renders an empty state message based on the selected tab.
 * @param selectedTab - Currently selected tab.
 * @param activeOffers - Array of active offers.
 * @param archivedOffers - Array of archived offers.
 * @param isFetchingOffers - Whether offers are being fetched.
 * @param updateRoute - Function to navigate to a route.
 * @param setSelectedTab - Function to change selected tab.
 * @returns JSX element for the empty state or null.
 */
function renderEmptyState(
    selectedTab: string,
    activeOffers: any[],
    archivedOffers: any[],
    isFetchingOffers: boolean,
    updateRoute: (route: string) => void,
    setSelectedTab: (tab: string) => void
): JSX.Element | null {
    if (selectedTab === 'active' && activeOffers.length === 0 && !isFetchingOffers) {
        return (
            <EmptyState
                buttonAction={() => updateRoute('offers/new')}
                buttonLabel='Create an offer'
                description='Grow your audience with discounts or free trials.'
            />
        );
    }

    if (selectedTab === 'archived' && archivedOffers.length === 0 && !isFetchingOffers) {
        return (
            <EmptyState
                buttonAction={() => setSelectedTab('active')}
                buttonLabel='Back to active'
                description='All archived offers will be shown here.'
            />
        );
    }

    return null;
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderTable(
    sortedOffers: any[],
    allTiers: Tier[] | undefined,
    selectedTab: string,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    return renderOffersTable(sortedOffers, allTiers, selectedTab, handleOfferEdit);
}

/**
 * Renders the array of offers into a table.
 * @param sortedOffers - Array of sorted offers.
 * @param allTiers - Array of all tiers.
 * @param selectedTab - Currently selected tab.
 * @param handleOfferEdit - Function to navigate to edit page.
 * @returns JSX element containing the offers table.
 */
function renderOfferRow(
    offer: any,
    tier: Tier | undefined,
    handleOfferEdit: (id: string) => void
): JSX.Element | null {
    if (!tier) {
        return null;
    }

    const isTierArchived = tier.active === false;
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        tier
    );

    const editHandler = () => {
        if (!isTierArchived) {
            handleOfferEdit(offer.id ?? '');
        }
    };

    const redemptionHref = offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ?? '') : undefined;
    const redemptionOnClick = () => {
        if (offer.redemption_count === 0 && !isTierArchived) {
            handleOfferEdit(offer.id ?? '');
        }
    };

    const copyLink = !isTierArchived ? <CopyLinkButton offerCode={offer.code} /> : null;

    const overlay = isTierArchived ? (
        <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
            This offer is disabled, because <br /> it is tied to an archived tier.
        </div>
    ) : null;

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`}
                    onClick={editHandler}
                >
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>
                        {tier.name} {getOfferCadence(offer.cadence)}
                    </span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                    onClick={editHandler}
                >
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                    onClick={editHandler}
                >
                    <span className='font-medium'>{updatedPriceWithCurrency}</span> {offer.type !== 'trial' ? <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>{originalPriceWithCurrency}</span> : null}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
                    href={redemptionHref}
                    onClick={redemptionOnClick}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {copyLink}
            </td>
            {overlay}
        </tr>
    );
}

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const signupOffers = allOffers.filter((offer) => offer.redemption_type === 'signup');
    const activeOffers = signupOffers.filter((offer) => {
        const offerTier = allTiers?.find((tier) => tier.id === offer?.tier?.id);
        return isOfferActive(offer, offerTier);
    });
    const archivedOffers = signupOffers.filter((offer) => {
        const offerTier = allTiers?.find((tier) => tier.id === offer?.tier?.id);
        return isOfferArchived(offer, offerTier);
    });

    const offersSorting = useSortingState()?.find((sorting) => sorting.type === 'offers');
    const [selectedTab, setSelectedTab] = useState('active');

    const sortOption = offersSorting?.option ?? 'date-added';
    const sortDirection = offersSorting?.direction ?? 'desc';

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const sortedOffers = signupOffers.sort((offer1, offer2) => compareOffers(offer1, offer2, sortOption, sortDirection));

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

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
                {renderHeader(
                    selectedTab,
                    activeOffers,
                    archivedOffers,
                    sortOption,
                    sortDirection,
                    setSortingState,
                    setSelectedTab
                )}
                {renderEmptyState(
                    selectedTab,
                    activeOffers,
                    archivedOffers,
                    isFetchingOffers,
                    updateRoute,
                    setSelectedTab
                )}
                {renderTable(sortedOffers, allTiers, selectedTab, handleOfferEdit)}
            </div>
        </Modal>
    );
};