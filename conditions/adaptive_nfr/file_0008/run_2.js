import OffersRetention from './offers-retention';
import {Button, type Tab, TabView} from '@tryghost/admin-x-design-system';
import {ButtonGroup, type ButtonProps, showToast} from '@tryghost/admin-x-design-system';
import {Icon} from '@tryghost/admin-x-design-system';
import {LucideIcon} from '@tryghost/shade';
import {Modal} from '@tryghost/admin-x-design-system';
import {Popover} from '@tryghost/admin-x-design-system';
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

/** @internal Gets the original price based on cadence */
const getOriginalPrice = (cadence: string, tier: Tier | undefined): number => {
    return cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
};

/** @internal Calculates discount for percent type */
const calculatePercentDiscount = (originalPrice: number, amount: number): {discountOffer: string, updatedPrice: number, discountColor: string} => {
    return {
        discountColor: 'text-green',
        discountOffer: amount + '% off',
        updatedPrice: originalPrice - ((originalPrice * amount) / 100)
    };
};

/** @internal Calculates discount for fixed type */
const calculateFixedDiscount = (originalPrice: number, amount: number, currency: string): {discountOffer: string, updatedPrice: number, discountColor: string} => {
    return {
        discountColor: 'text-blue',
        discountOffer: numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount))) + ' ' + currency + ' off',
        updatedPrice: originalPrice - amount
    };
};

/** @internal Calculates discount for trial type */
const calculateTrialDiscount = (amount: number): {discountOffer: string, updatedPrice: number, discountColor: string, originalPriceWithCurrency: string} => {
    return {
        discountColor: 'text-pink',
        discountOffer: amount + ' days free',
        updatedPrice: 0,
        originalPriceWithCurrency: ''
    };
};

/** @internal Ensures updated price is not negative */
const ensureNonNegativePrice = (price: number): number => {
    return price < 0 ? 0 : price;
};

export const getOfferDiscount = (type: string, amount: number, cadence: string, currency: string, tier: Tier | undefined): {discountColor: string, discountOffer: string, originalPriceWithCurrency: string, updatedPriceWithCurrency: string} => {
    const originalPrice = getOriginalPrice(cadence, tier);
    let discountColor = '';
    let discountOffer = '';
    let updatedPrice = originalPrice;
    let originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));

    if (type === 'percent') {
        const result = calculatePercentDiscount(originalPrice, amount);
        discountColor = result.discountColor;
        discountOffer = result.discountOffer;
        updatedPrice = result.updatedPrice;
    } else if (type === 'fixed') {
        const result = calculateFixedDiscount(originalPrice, amount, currency);
        discountColor = result.discountColor;
        discountOffer = result.discountOffer;
        updatedPrice = result.updatedPrice;
    } else if (type === 'trial') {
        const result = calculateTrialDiscount(amount);
        discountColor = result.discountColor;
        discountOffer = result.discountOffer;
        updatedPrice = result.updatedPrice;
        originalPriceWithCurrency = result.originalPriceWithCurrency;
    }

    updatedPrice = ensureNonNegativePrice(updatedPrice);
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
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='lg' />
        <h1 className='mt-4 text-xl'>{title}</h1>
        <p className='mt-1.5 max-w-[420px]'>{description}</p>
        <Button className="mt-6" color="grey" label={buttonLabel} onClick={buttonAction}></Button>
    </div>
);

const OffersFilterPopover: React.FC<{
    statusFilter: 'active' | 'archived';
    setStatusFilter: (status: 'active' | 'archived') => void;
    sortOption: string;
    sortDirection: string;
    onSortChange: (option: string) => void;
    onDirectionChange: () => void;
}> = ({statusFilter, setStatusFilter, sortOption, sortDirection, onSortChange, onDirectionChange}) => {
    return (
        <Popover
            position='end'
            trigger={
                <button className='flex cursor-pointer items-center justify-center rounded p-1 hover:bg-grey-100 dark:hover:bg-grey-800' type='button'>
                    <LucideIcon.ListFilter className='text-grey-700' size={16} strokeWidth={1.5} />
                </button>
            }
        >
            <div className='flex min-w-[220px] flex-col'>
                <div className='cursor-default select-none border-b border-b-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-b-grey-800'>Status</div>
                <div className='flex flex-col py-1'>
                    {(['active', 'archived'] as const).map(status => (
                        <button
                            key={status}
                            className='group relative mx-1 flex cursor-pointer items-center rounded-[2.5px] px-8 py-1.5 text-left text-sm hover:bg-grey-100 dark:hover:bg-grey-800'
                            type='button'
                            onClick={() => setStatusFilter(status)}
                        >
                            {statusFilter === status && <Icon className='absolute left-2' name='check' size='xs' />}
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                    ))}
                </div>
                <div className='cursor-default select-none border-y border-y-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-grey-800'>Sort by</div>
                <div className='flex flex-col py-1'>
                    {[
                        {id: 'date-added', label: 'Date added'},
                        {id: 'name', label: 'Name'},
                        {id: 'redemptions', label: 'Redemptions'}
                    ].map(item => (
                        <div
                            key={item.id}
                            className='group relative mx-1 flex items-center rounded-[2.5px] hover:bg-grey-100 dark:hover:bg-grey-800'
                        >
                            <button
                                className='flex w-full cursor-pointer items-center px-8 py-1.5 pr-12 text-left text-sm'
                                type='button'
                                onClick={() => onSortChange(item.id)}
                            >
                                {sortOption === item.id && <Icon className='absolute left-2' name='check' size='xs' />}
                                {item.label}
                            </button>
                            {sortOption === item.id && (
                                <button
                                    className='absolute right-1 flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-grey-300 dark:hover:bg-grey-700'
                                    title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                                    type='button'
                                    onClick={() => onDirectionChange()}
                                >
                                    <Icon name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'} size='xs' />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Popover>
    );
};

/** @internal Checks if offer is active */
const isOfferActive = (offer: any, offerTier: Tier | undefined): boolean => {
    return offer.status === 'active' && offerTier && offerTier.active === true;
};

/** @internal Checks if offer is archived */
const isOfferArchived = (offer: any, offerTier: Tier | undefined): boolean => {
    return offer.status === 'archived' || (offerTier && offerTier.active === false);
};

/** @internal Filters offers based on status */
const filterOffersByStatus = (offers: any[], allTiers: Tier[] | undefined, statusFilter: 'active' | 'archived'): any[] => {
    return offers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        if (statusFilter === 'active') {
            return isOfferActive(offer, offerTier);
        }
        return isOfferArchived(offer, offerTier);
    });
};

/** @internal Gets sort multiplier based on direction */
const getSortMultiplier = (sortDirection: string): number => {
    return sortDirection === 'desc' ? -1 : 1;
};

/** @internal Compares offers by name */
const compareOffersByName = (offer1: any, offer2: any, multiplier: number): number => {
    return multiplier * offer1.name.localeCompare(offer2.name);
};

/** @internal Compares offers by redemption count */
const compareOffersByRedemptions = (offer1: any, offer2: any, multiplier: number): number => {
    return multiplier * (offer1.redemption_count - offer2.redemption_count);
};

/** @internal Gets timestamp from offer creation date */
const getOfferTimestamp = (offer: any): number => {
    return offer.created_at ? new Date(offer.created_at).getTime() : 0;
};

/** @internal Compares offers by date added */
const compareOffersByDate = (offer1: any, offer2: any, multiplier: number): number => {
    return multiplier * (getOfferTimestamp(offer1) - getOfferTimestamp(offer2));
};

/** @internal Sorts offers based on selected option */
const sortOffers = (offers: any[], sortOption: string, sortDirection: string): any[] => {
    const multiplier = getSortMultiplier(sortDirection);

    return offers.sort((offer1, offer2) => {
        if (sortOption === 'name') {
            return compareOffersByName(offer1, offer2, multiplier);
        }
        if (sortOption === 'redemptions') {
            return compareOffersByRedemptions(offer1, offer2, multiplier);
        }
        return compareOffersByDate(offer1, offer2, multiplier);
    });
};

/** @internal Checks if tier is archived */
const isTierArchived = (tier: Tier | undefined): boolean => {
    return tier?.active === false;
};

/** @internal Checks if offer can be edited */
const canEditOffer = (tier: Tier | undefined): boolean => {
    return !isTierArchived(tier);
};

/** @internal Handles offer edit navigation */
const handleOfferEditClick = (offerId: string, tier: Tier | undefined, handleOfferEdit: (id: string) => void): void => {
    if (!canEditOffer(tier)) {
        return;
    }
    handleOfferEdit(offerId);
};

/** @internal Renders offer name cell */
const renderOfferNameCell = (offer: any, offerTier: Tier | undefined, handleOfferEdit: (id: string) => void): React.ReactNode => {
    const archived = isTierArchived(offerTier);
    return (
        <td className={`${archived ? 'opacity-50' : ''} p-0`}>
            <a
                className={`block ${archived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`}
                onClick={() => handleOfferEditClick(offer?.id || '', offerTier, handleOfferEdit)}
            >
                <span className='font-semibold'>{offer?.name}</span>
                <br />
                <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
            </a>
        </td>
    );
};

/** @internal Renders offer discount cell */
const renderOfferDiscountCell = (offer: any, offerTier: Tier | undefined, discountOffer: string, handleOfferEdit: (id: string) => void): React.ReactNode => {
    const archived = isTierArchived(offerTier);
    const durationLabel = offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period';
    return (
        <td className={`${archived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
            <a
                className={`block ${archived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                onClick={() => handleOfferEditClick(offer?.id || '', offerTier, handleOfferEdit)}
            >
                <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                <br />
                <span className='text-grey-700'>{durationLabel}</span>
            </a>
        </td>
    );
};

/** @internal Renders offer price cell */
const renderOfferPriceCell = (offer: any, offerTier: Tier | undefined, updatedPriceWithCurrency: string, originalPriceWithCurrency: string, handleOfferEdit: (id: string) => void): React.ReactNode => {
    const archived = isTierArchived(offerTier);
    const showStrikethrough = offer.type !== 'trial';
    return (
        <td className={`${archived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
            <a
                className={`block ${archived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                onClick={() => handleOfferEditClick(offer?.id || '', offerTier, handleOfferEdit)}
            >
                <span className='font-medium'>{updatedPriceWithCurrency}</span>
                {showStrikethrough && (
                    <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                        {originalPriceWithCurrency}
                    </span>
                )}
            </a>
        </td>
    );
};

/** @internal Renders offer redemptions cell */
const renderOfferRedemptionsCell = (offer: any, offerTier: Tier | undefined, handleOfferEdit: (id: string) => void): React.ReactNode => {
    const archived = isTierArchived(offerTier);
    const hasRedemptions = offer.redemption_count > 0;
    const href = hasRedemptions ? createRedemptionFilterUrl(offer.id || '') : undefined;

    return (
        <td className={`${archived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}>
            <a
                className={`block ${archived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${hasRedemptions ? 'hover:underline' : ''}`}
                href={href}
                onClick={() => {
                    if (!hasRedemptions && !archived) {
                        handleOfferEdit(offer?.id || '');
                    }
                }}
            >
                {offer.redemption_count}
            </a>
        </td>
    );
};

/** @internal Renders offer copy link cell */
const renderOfferCopyLinkCell = (offer: any, offerTier: Tier | undefined): React.ReactNode => {
    const archived = isTierArchived(offerTier);
    return (
        <td className={`${archived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
            {!archived && <CopyLinkButton offerCode={offer.code} />}
        </td>
    );
};

/** @internal Renders archived tier tooltip */
const renderArchivedTierTooltip = (offerTier: Tier | undefined): React.ReactNode => {
    if (isTierArchived(offerTier)) {
        return (
            <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                This offer is disabled, because <br /> it is tied to an archived tier.
            </div>
        );
    }
    return null;
};

/** @internal Renders a single offer row */
const renderOfferRow = (offer: any, allTiers: Tier[] | undefined, handleOfferEdit: (id: string) => void): React.ReactNode => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);

    if (!offerTier) {
        return null;
    }

    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        offerTier
    );

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid="offer-item">
            {renderOfferNameCell(offer, offerTier, handleOfferEdit)}
            {renderOfferDiscountCell(offer, offerTier, discountOffer, handleOfferEdit)}
            {renderOfferPriceCell(offer, offerTier, updatedPriceWithCurrency, originalPriceWithCurrency, handleOfferEdit)}
            {renderOfferRedemptionsCell(offer, offerTier, handleOfferEdit)}
            {renderOfferCopyLinkCell(offer, offerTier)}
            {renderArchivedTierTooltip(offerTier)}
        </tr>
    );
};

/** @internal Renders the offers table */
const renderOffersTable = (filteredOffers: any[], allTiers: Tier[] | undefined, handleOfferEdit: (id: string) => void): React.ReactNode => {
    return (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full table-fixed'>
                <colgroup>
                    <col />
                    <col className='w-[220px]' />
                    <col className='w-[220px]' />
                    <col className='w-[220px]' />
                    <col className='w-[80px]' />
                </colgroup>
                {filteredOffers.map((offer) => renderOfferRow(offer, allTiers, handleOfferEdit))}
            </table>
        </div>
    );
};

/** @internal Renders top right content for signup tab with offers */
const renderSignupTabHeaderWithOffers = (sortOption: string, sortDirection: string, statusFilter: 'active' | 'archived', setStatusFilter: (status: 'active' | 'archived') => void, handleSortChange: (option: string) => void, handleDirectionChange: () => void): React.ReactNode => {
    return (
        <div className='flex items-center'>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Price</span>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
            <span className='flex w-[80px] items-center justify-end'>
                <OffersFilterPopover
                    setStatusFilter={setStatusFilter}
                    sortDirection={sortDirection}
                    sortOption={sortOption}
                    statusFilter={statusFilter}
                    onDirectionChange={handleDirectionChange}
                    onSortChange={handleSortChange}
                />
            </span>
        </div>
    );
};

/** @internal Renders top right content for signup tab without offers */
const renderSignupTabHeaderEmpty = (sortOption: string, sortDirection: string, statusFilter: 'active' | 'archived', setStatusFilter: (status: 'active' | 'archived') => void, handleSortChange: (option: string) => void, handleDirectionChange: () => void): React.ReactNode => {
    return (
        <div className='flex items-center'>
            <OffersFilterPopover
                setStatusFilter={setStatusFilter}
                sortDirection={sortDirection}
                sortOption={sortOption}
                statusFilter={statusFilter}
                onDirectionChange={handleDirectionChange}
                onSortChange={handleSortChange}
            />
        </div>
    );
};

/** @internal Renders top right content for retention tab */
const renderRetentionTabHeader = (): React.ReactNode => {
    return (
        <div className='flex items-center pt-[3px]'>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Status</span>
            <span className='w-[80px]'></span>
        </div>
    );
};

/** @internal Determines tab header content */
const getTabHeaderContent = (selectedTab: string, filteredOffers: any[], sortOption: string, sortDirection: string, statusFilter: 'active' | 'archived', setStatusFilter: (status: 'active' | 'archived') => void, handleSortChange: (option: string) => void, handleDirectionChange: () => void): React.ReactNode => {
    if (selectedTab === 'signup' && filteredOffers.length > 0) {
        return renderSignupTabHeaderWithOffers(sortOption, sortDirection, statusFilter, setStatusFilter, handleSortChange, handleDirectionChange);
    }
    if (selectedTab === 'signup') {
        return renderSignupTabHeaderEmpty(sortOption, sortDirection, statusFilter, setStatusFilter, handleSortChange, handleDirectionChange);
    }
    if (selectedTab === 'retention') {
        return renderRetentionTabHeader();
    }
    return null;
};

/** @internal Checks if should show active empty state */
const shouldShowActiveEmptyState = (selectedTab: string, statusFilter: 'active' | 'archived', activeOffers: any[], isFetchingOffers: boolean): boolean => {
    return selectedTab === 'signup' && statusFilter === 'active' && activeOffers.length === 0 && !isFetchingOffers;
};

/** @internal Checks if should show archived empty state */
const shouldShowArchivedEmptyState = (selectedTab: string, statusFilter: 'active' | 'archived', archivedOffers: any[], isFetchingOffers: boolean): boolean => {
    return selectedTab === 'signup' && statusFilter === 'archived' && archivedOffers.length === 0 && !isFetchingOffers;
};

/** @internal Checks if should show retention tab */
const shouldShowRetentionTab = (selectedTab: string): boolean => {
    return selectedTab === 'retention';
};

/** @internal Checks if should show offers list */
const shouldShowOffersList = (selectedTab: string): boolean => {
    return selectedTab === 'signup';
};

export const OffersIndexModal: React.FC<{defaultTab?: string}> = ({defaultTab}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const activeOffers = filterOffersByStatus(signupOffers, allTiers, 'active');
    const archivedOffers = filterOffersByStatus(signupOffers, allTiers, 'archived');

    let offersTabs: Tab[] = [
        {id: 'signup', title: 'Signup'},
        {id: 'retention', title: 'Retention'}
    ];

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');

    const [selectedTab, setSelectedTab] = useState(defaultTab || 'signup');
    const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');

    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const sortedOffers = sortOffers(signupOffers, sortOption, sortDirection);
    const paidActiveTiers = getPaidActiveTiers(allTiers || []);
    const filteredOffers = filterOffersByStatus(sortedOffers, allTiers, statusFilter);

    const handleSortChange = (selectedOption: string) => {
        setSortingState?.([{
            type: 'offers',
            option: selectedOption,
            direction: sortDirection
        }]);
    };

    const handleDirectionChange = () => {
        const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        setSortingState?.([{
            type: 'offers',
            option: sortOption,
            direction: newDirection
        }]);
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
        ...(selectedTab === 'signup' ? [{
            key: 'new-offer',
            icon: 'add',
            label: 'New offer',
            color: 'green' as const,
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
        }] : [])
    ];

    const listLayoutOutput = renderOffersTable(filteredOffers, allTiers, handleOfferEdit);

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
        topRightContent={<ButtonGroup buttons={buttons} />}
        width={1140}
    >
        <div className='flex h-full flex-col pt-8'>
            <header>
                <TabView
                    selectedTab={selectedTab}
                    tabs={offersTabs}
                    topRightContent={getTabHeaderContent(selectedTab, filteredOffers, sortOption, sortDirection, statusFilter, setStatusFilter, handleSortChange, handleDirectionChange)}
                    onTabChange={(tab) => {
                        setSelectedTab(tab);
                        updateRoute(tab === 'retention' ? 'offers/edit/retention' : 'offers/edit');
                    }}
                />
            </header>
            {shouldShowActiveEmptyState(selectedTab, statusFilter, activeOffers, isFetchingOffers) && (
                <EmptyState
                    buttonAction={() => updateRoute('offers/new')}
                    buttonLabel='Create an offer'
                    description='Grow your audience with discounts or free trials.'
                />
            )}
            {shouldShowArchivedEmptyState(selectedTab, statusFilter, archivedOffers, isFetchingOffers) && (
                <EmptyState
                    buttonAction={() => setStatusFilter('active')}
                    buttonLabel='Back to active'
                    description='All archived offers will be shown here.'
                />
            )}
            {shouldShowRetentionTab(selectedTab) && <OffersRetention />}
            {shouldShowOffersList(selectedTab) && listLayoutOutput}
        </div>
    </Modal>;
};