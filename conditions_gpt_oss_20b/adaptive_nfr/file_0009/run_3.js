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

export const getOfferDiscount = (type: string, amount: number, cadence: string, currency: string, tier: Tier | undefined): {discountColor: string, discountOffer: string, originalPriceWithCurrency: string, updatedPriceWithCurrency: string} => {
    let discountColor = '';
    let discountOffer = '';
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    let updatedPrice = originalPrice;

    const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

    let originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));

    switch (type) {
    case 'percent':
        discountColor = 'text-green';
        discountOffer = amount + '% off';
        updatedPrice = originalPrice - ((originalPrice * amount) / 100);
        break;
    case 'fixed':
        discountColor = 'text-blue';
        discountOffer = numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount))) + ' ' + currency + ' off';
        updatedPrice = originalPrice - amount;
        break;
    case 'trial':
        discountColor = 'text-pink';
        discountOffer = amount + ' days free';
        originalPriceWithCurrency = '';
        break;
    default:
        break;
    };

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

/**
 * Determines if an offer is active based on its status and tier activity.
 * @param offer The offer to evaluate.
 * @param tier The tier associated with the offer.
 * @returns True if the offer is active and its tier is active.
 */
const isActiveOffer = (offer: any, tier: Tier | undefined): boolean => {
    return offer.status === 'active' && tier?.active === true;
};

/**
 * Determines if an offer is archived based on its status or tier activity.
 * @param offer The offer to evaluate.
 * @param tier The tier associated with the offer.
 * @returns True if the offer is archived or its tier is inactive.
 */
const isArchivedOffer = (offer: any, tier: Tier | undefined): boolean => {
    return offer.status === 'archived' || tier?.active === false;
};

/**
 * Comparator for sorting offers by name.
 */
const compareByName = (a: any, b: any, multiplier: number): number => {
    return multiplier * a.name.localeCompare(b.name);
};

/**
 * Comparator for sorting offers by redemption count.
 */
const compareByRedemptions = (a: any, b: any, multiplier: number): number => {
    return multiplier * (a.redemption_count - b.redemption_count);
};

/**
 * Comparator for sorting offers by creation date.
 */
const compareByDateAdded = (a: any, b: any, multiplier: number): number => {
    const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
    return multiplier * (aDate - bDate);
};

/**
 * Renders the table header row based on the selected tab and offer counts.
 */
const renderTableHeader = (selectedTab: string, activeOffers: any[], archivedOffers: any[]): JSX.Element | null => {
    const count = selectedTab === 'active' ? activeOffers.length : archivedOffers.length;
    const label = count === 1 ? 'offer' : 'offers';
    if (count === 0) return null;
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

/**
 * Renders a single offer row.
 */
const renderOfferRow = (
    offer: any,
    tier: Tier | undefined,
    handleOfferEdit: (id: string) => void,
    offerCode: string
): JSX.Element | null => {
    if (!tier) return null;
    const isTierArchived = tier.active === false;
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        tier
    );

    const editHandler = isTierArchived ? undefined : () => handleOfferEdit(offer.id ?? '');
    const redemptionLink = offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ?? '') : undefined;
    const redemptionClick = offer.redemption_count === 0
        ? isTierArchived
            ? undefined
            : () => handleOfferEdit(offer.id ?? '')
        : undefined;

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`} onClick={editHandler}>
                    <span className='font-semibold'>{offer.name}</span><br />
                    <span className='text-sm text-grey-700'>{tier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={editHandler}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span><br />
                    <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={editHandler}>
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
                    href={redemptionLink}
                    onClick={redemptionClick}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived && <CopyLinkButton offerCode={offerCode} />}
            </td>
            {isTierArchived && (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div>
            )}
        </tr>
    );
};

/**
 * Renders all offer rows for the selected tab.
 */
const renderOfferRows = (
    sortedOffers: any[],
    selectedTab: string,
    allTiers: Tier[] | undefined,
    handleOfferEdit: (id: string) => void
): JSX.Element[] => {
    return sortedOffers
        .filter((offer) => {
            const tier = allTiers?.find(t => t.id === offer.tier?.id);
            if (selectedTab === 'active') {
                return isActiveOffer(offer, tier);
            }
            return isArchivedOffer(offer, tier);
        })
        .map((offer) => {
            const tier = allTiers?.find(t => t.id === offer.tier?.id);
            return renderOfferRow(offer, tier, handleOfferEdit, offer.code);
        })
        .filter(Boolean) as JSX.Element[];
};

/**
 * Renders the empty state for the current tab.
 */
const renderEmptyState = (
    selectedTab: string,
    activeOffers: any[],
    archivedOffers: any[],
    isFetchingOffers: boolean,
    updateRoute: (path: string) => void
): JSX.Element | null => {
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
};

/**
 * Renders the sort menu if there are offers to sort.
 */
const renderSortMenu = (
    selectedTab: string,
    activeOffers: any[],
    archivedOffers: any[],
    sortOption: string,
    sortDirection: string,
    setSortingState: any
): JSX.Element | null => {
    const hasOffers = (selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0);
    if (!hasOffers) return null;

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
        return isActiveOffer(offer, offerTier);
    });
    const archivedOffers = signupOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return isArchivedOffer(offer, offerTier);
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

    const sortedOffers = signupOffers.sort((offer1, offer2) => {
        const multiplier = sortDirection === 'desc' ? -1 : 1;
        switch (sortOption) {
            case 'name':
                return compareByName(offer1, offer2, multiplier);
            case 'redemptions':
                return compareByRedemptions(offer1, offer2, multiplier);
            default:
                return compareByDateAdded(offer1, offer2, multiplier);
        }
    });

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const listLayoutOutput = (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full'>
                {renderTableHeader(selectedTab, activeOffers, archivedOffers)}
                {renderOfferRows(sortedOffers, selectedTab, allTiers, handleOfferEdit)}
            </table>
        </div>
    );

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
                <header>
                    <TabView
                        selectedTab={selectedTab}
                        tabs={offersTabs}
                        topRightContent={renderSortMenu(selectedTab, activeOffers, archivedOffers, sortOption, sortDirection, setSortingState)}
                        onTabChange={setSelectedTab}
                    />
                </header>
                {renderEmptyState(selectedTab, activeOffers, archivedOffers, isFetchingOffers, updateRoute)}
                {listLayoutOutput}
            </div>
        </Modal>
    );
};