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

export const getOfferCadence = (cadence: string): string => cadence === 'month' ? 'monthly' : 'yearly';

export const getOfferDuration = (duration: string): string =>
    duration === 'once' ? 'First payment' : duration === 'repeating' ? 'Repeating' : 'Forever';

/**
 * Returns discount information for an offer.
 */
export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): {
    discountColor: string;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
} => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    const formatToTwoDecimals = (num: number) => parseFloat(num.toFixed(2));

    let discountColor = '';
    let discountOffer = '';
    let updatedPrice = originalPrice;
    let originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));

    if (type === 'percent') {
        discountColor = 'text-green';
        discountOffer = `${amount}% off`;
        updatedPrice = originalPrice - (originalPrice * amount) / 100;
    } else if (type === 'fixed') {
        discountColor = 'text-blue';
        discountOffer = `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`;
        updatedPrice = originalPrice - amount;
    } else if (type === 'trial') {
        discountColor = 'text-pink';
        discountOffer = `${amount} days free`;
        originalPriceWithCurrency = '';
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
        <Button className='mt-8' color='grey' label={buttonLabel} onClick={buttonAction} />
    </div>
);

/**
 * Determines if an offer belongs to an active tier and is active.
 */
function isActiveOffer(offer: any, tiers: Tier[] | undefined): boolean {
    const tier = tiers?.find(t => t.id === offer?.tier?.id);
    return !!tier && tier.active === true && offer.status === 'active';
}

/**
 * Determines if an offer belongs to an archived tier or is archived.
 */
function isArchivedOffer(offer: any, tiers: Tier[] | undefined): boolean {
    const tier = tiers?.find(t => t.id === offer?.tier?.id);
    return offer.status === 'archived' || (tier?.active === false);
}

/**
 * Retrieves the tier associated with an offer.
 */
function getOfferTier(offer: any, tiers: Tier[] | undefined): Tier | undefined {
    return tiers?.find(t => t.id === offer?.tier?.id);
}

/**
 * Returns a sorted copy of the offers array based on the selected option and direction.
 */
function getSortedOffers(
    offers: any[],
    sortOption: string,
    sortDirection: string
): any[] {
    const multiplier = sortDirection === 'desc' ? -1 : 1;
    return [...offers].sort((a, b) => {
        if (sortOption === 'name') {
            return multiplier * a.name.localeCompare(b.name);
        }
        if (sortOption === 'redemptions') {
            return multiplier * (a.redemption_count - b.redemption_count);
        }
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return multiplier * (aTime - bTime);
    });
}

/**
 * Renders the table header row when there are offers to display.
 */
function renderHeaderRow(selectedTab: string, activeCount: number, archivedCount: number): JSX.Element | null {
    const hasActive = selectedTab === 'active' && activeCount > 0;
    const hasArchived = selectedTab === 'archived' && archivedCount > 0;
    if (!hasActive && !hasArchived) {
        return null;
    }
    const count = selectedTab === 'active' ? activeCount : archivedCount;
    const label = selectedTab === 'active' ? (activeCount !== 1 ? 'offers' : 'offer') : (archivedCount !== 1 ? 'offers' : 'offer');
    return (
        <tr className='border-b border-b-grey-300 dark:border-grey-800'>
            <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>{count} {label}</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
            <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
        </tr>
    );
}

/**
 * Renders a single offer row.
 */
function renderOfferRow(
    offer: any,
    tier: Tier,
    isTierArchived: boolean,
    handleOfferEdit: (id: string) => void
): JSX.Element {
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        tier
    );

    const editHandler = !isTierArchived ? () => handleOfferEdit(offer.id ?? '') : undefined;
    const redemptionLink = offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ?? '') : undefined;
    const redemptionClick = offer.redemption_count === 0 && !isTierArchived ? editHandler : undefined;

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid='offer-item'>
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`}
                    onClick={editHandler}
                >
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{tier.name} {getOfferCadence(offer.cadence)}</span>
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
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>{' '}
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
                    href={redemptionLink}
                    onClick={redemptionClick}
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
}

/**
 * Renders the list layout table.
 */
function renderListLayout(
    selectedTab: string,
    activeOffers: any[],
    archivedOffers: any[],
    allTiers: Tier[] | undefined,
    sortedOffers: any[],
    handleOfferEdit: (id: string) => void
): JSX.Element {
    const rows = sortedOffers
        .filter(offer => {
            if (selectedTab === 'active') {
                return isActiveOffer(offer, allTiers);
            }
            return isArchivedOffer(offer, allTiers);
        })
        .map(offer => {
            const tier = getOfferTier(offer, allTiers);
            if (!tier) {
                return null;
            }
            const isTierArchived = tier.active === false;
            return renderOfferRow(offer, tier, isTierArchived, handleOfferEdit);
        })
        .filter(Boolean) as JSX.Element[];

    return (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full'>
                {renderHeaderRow(selectedTab, activeOffers.length, archivedOffers.length)}
                {rows}
            </table>
        </div>
    );
}

/**
 * Handles the click for creating a new offer.
 */
function handleNewOfferClick(paidActiveTiers: Tier[], updateRoute: (path: string) => void): void {
    if (paidActiveTiers.length === 0) {
        showToast({
            type: 'info',
            title: 'You must have an active tier to create an offer.'
        });
        return;
    }
    updateRoute('offers/new');
}

/**
 * Renders the top‑right content of the TabView (sorting controls).
 */
function renderSortControls(
    selectedTab: string,
    activeOffers: any[],
    archivedOffers: any[],
    sortOption: string,
    sortDirection: string,
    setSortingState: ((state: any) => void) | undefined
): JSX.Element | null {
    const hasActive = selectedTab === 'active' && activeOffers.length > 0;
    const hasArchived = selectedTab === 'archived' && archivedOffers.length > 0;
    if (!hasActive && !hasArchived) {
        return null;
    }

    return (
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
                onDirectionChange={selectedDirection => {
                    const newDirection = selectedDirection === 'asc' ? 'desc' : 'asc';
                    setSortingState?.([{
                        type: 'offers',
                        option: sortOption,
                        direction: newDirection
                    }]);
                }}
                onSortChange={selectedOption => {
                    setSortingState?.([{
                        type: 'offers',
                        option: selectedOption,
                        direction: sortDirection
                    }]);
                }}
            />
        </div>
    );
}

/**
 * Main modal component for offers index.
 */
export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();

    const signupOffers = allOffers.filter(o => o.redemption_type === 'signup');
    const activeOffers = signupOffers.filter(o => isActiveOffer(o, allTiers));
    const archivedOffers = signupOffers.filter(o => isArchivedOffer(o, allTiers));

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(s => s.type === 'offers');
    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const [selectedTab, setSelectedTab] = useState('active');

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const sortedOffers = getSortedOffers(signupOffers, sortOption, sortDirection);
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
            onClick: () => handleNewOfferClick(paidActiveTiers, updateRoute)
        }
    ];

    return (
        <Modal
            afterClose={() => updateRoute('offers')}
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
                        tabs={[
                            {id: 'active', title: 'Active'},
                            {id: 'archived', title: 'Archived'}
                        ]}
                        topRightContent={renderSortControls(selectedTab, activeOffers, archivedOffers, sortOption, sortDirection, setSortingState)}
                        onTabChange={setSelectedTab}
                    />
                </header>

                {selectedTab === 'active' && activeOffers.length === 0 && !isFetchingOffers && (
                    <EmptyState
                        buttonAction={() => updateRoute('offers/new')}
                        buttonLabel='Create an offer'
                        description='Grow your audience with discounts or free trials.'
                    />
                )}

                {selectedTab === 'archived' && archivedOffers.length === 0 && !isFetchingOffers && (
                    <EmptyState
                        buttonAction={() => setSelectedTab('active')}
                        buttonLabel='Back to active'
                        description='All archived offers will be shown here.'
                    />
                )}

                {renderListLayout(selectedTab, activeOffers, archivedOffers, allTiers, sortedOffers, handleOfferEdit)}
            </div>
        </Modal>
    );
};