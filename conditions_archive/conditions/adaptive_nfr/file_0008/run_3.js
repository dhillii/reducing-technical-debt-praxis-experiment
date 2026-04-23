```typescript
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
    const originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));

    let discountColor = '';
    let discountOffer = '';
    let updatedPrice = originalPrice;
    let finalOriginalPriceWithCurrency = originalPriceWithCurrency;

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
        finalOriginalPriceWithCurrency = result.originalPriceWithCurrency;
    }

    updatedPrice = ensureNonNegativePrice(updatedPrice);
    const updatedPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(updatedPrice)));

    return {
        discountColor,
        discountOffer,
        originalPriceWithCurrency: finalOriginalPriceWithCurrency,
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

/** @internal Checks if offer is active and tier is active */
const isOfferActive = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offer.status === 'active' && offerTier && offerTier.active === true;
};

/** @internal Checks if offer is archived or tier is archived */
const isOfferArchived = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offer.status === 'archived' || (offerTier && offerTier.active === false);
};

/** @internal Checks if tier is archived */
const isTierArchived = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offerTier?.active === false;
};

/** @internal Matches filter status with offer status */
const matchesStatusFilter = (statusFilter: 'active' | 'archived', offer: any, allTiers: Tier[] | undefined): boolean => {
    if (statusFilter === 'active') {
        return isOfferActive(offer, allTiers);
    }
    return isOfferArchived(offer, allTiers);
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

/** @internal Compares offers by creation date */
const compareOffersByDate = (offer1: any, offer2: any, multiplier: number): number => {
    return multiplier * (getOfferTimestamp(offer1) - getOfferTimestamp(offer2));
};

/** @internal Sorts offers based on selected option */
const sortOffersByOption = (offer1: any, offer2: any, sortOption: string, multiplier: number): number => {
    if (sortOption === 'name') {
        return compareOffersByName(offer1, offer2, multiplier);
    }
    if (sortOption === 'redemptions') {
        return compareOffersByRedemptions(offer1, offer2, multiplier);
    }
    return compareOffersByDate(offer1, offer2, multiplier);
};

/** @internal Checks if should show empty state for active offers */
const shouldShowActiveEmptyState = (selectedTab: string, statusFilter: string, activeOffers: any[], isFetchingOffers: boolean): boolean => {
    return selectedTab === 'signup' && statusFilter === 'active' && activeOffers.length === 0 && !isFetchingOffers;
};

/** @internal Checks if should show empty state for archived offers */
const shouldShowArchivedEmptyState = (selectedTab: string, statusFilter: string, archivedOffers: any[], isFetchingOffers: boolean): boolean => {
    return selectedTab === 'signup' && statusFilter === 'archived' && archivedOffers.length === 0 && !isFetchingOffers;
};

/** @internal Checks if should show retention tab */
const shouldShowRetentionTab = (selectedTab: string): boolean => {
    return selectedTab === 'retention';
};

/** @internal Checks if should show signup list */
const shouldShowSignupList = (selectedTab: string): boolean => {
    return selectedTab === 'signup';
};

/** @internal Checks if should show filter headers */
const shouldShowFilterHeaders = (selectedTab: string, filteredOffers: any[]): boolean => {
    return selectedTab === 'signup' && filteredOffers.length > 0;
};

/** @internal Checks if should show filter popover only */
const shouldShowFilterPopoverOnly = (selectedTab: string, filteredOffers: any[]): boolean => {
    return selectedTab === 'signup' && filteredOffers.length === 0;
};

/** @internal Checks if should show retention headers */
const shouldShowRetentionHeaders = (selectedTab: string): boolean => {
    return selectedTab === 'retention';
};

/** @internal Checks if offer is clickable */
const isOfferClickable = (isTierArchived: boolean): boolean => {
    return !isTierArchived;
};

/** @internal Checks if redemption count is clickable */
const isRedemptionCountClickable = (redemptionCount: number): boolean => {
    return redemptionCount > 0;
};

/** @internal Gets redemption link or undefined */
const getRedemptionLink = (offer: any): string | undefined => {
    return offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ? offer.id : '') : undefined;
};

interface OfferRowProps {
    offer: any;
    offerTier: Tier;
    isTierArchivedFlag: boolean;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
    onEdit: (id: string) => void;
}

/** @internal Renders a single offer row */
const OfferRow: React.FC<OfferRowProps> = ({
    offer,
    offerTier,
    isTierArchivedFlag,
    discountOffer,
    originalPriceWithCurrency,
    updatedPriceWithCurrency,
    onEdit
}) => {
    const clickable = isOfferClickable(isTierArchivedFlag);
    const redemptionClickable = isRedemptionCountClickable(offer.redemption_count);
    const redemptionLink = getRedemptionLink(offer);

    const handleOfferClick = () => {
        if (clickable) {
            onEdit(offer?.id ? offer.id : '');
        }
    };

    const handleRedemptionClick = () => {
        if (!redemptionClickable && clickable) {
            onEdit(offer?.id ? offer.id : '');
        }
    };

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${isTierArchivedFlag ? 'opacity-50' : ''} p-0`}>
                <a className={`block ${clickable ? 'cursor-pointer' : 'cursor-default select-none'} p-5 pl-0`} onClick={handleOfferClick}>
                    <span className='font-semibold'>{offer?.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${isTierArchivedFlag ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${clickable ? 'cursor-pointer' : 'cursor-default select-none'} p-5`} onClick={handleOfferClick}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className={`${isTierArchivedFlag ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${clickable ? 'cursor-pointer' : 'cursor-default select-none'} p-5`} onClick={handleOfferClick}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' ? (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>{originalPriceWithCurrency}</span>
                    ) : null}
                </a>
            </td>
            <td className={`${isTierArchivedFlag ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${clickable ? 'cursor-pointer' : 'cursor-default select-none'} p-5 ${redemptionClickable ? 'hover:underline' : ''}`}
                    href={redemptionLink}
                    onClick={handleRedemptionClick}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isTierArchivedFlag ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchivedFlag ? <CopyLinkButton offerCode={offer.code} /> : null}
            </td>
            {isTierArchivedFlag ? (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div>
            ) : null}
        </tr>
    );
};

export const OffersIndexModal: React.FC<{defaultTab?: string}> = ({defaultTab}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const activeOffers = signupOffers.filter((offer) => isOfferActive(offer, allTiers));
    const archivedOffers = signupOffers.filter((offer) => isOfferArchived(offer, allTiers));

    const offersTabs: Tab[] = [
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

    const sortedOffers = signupOffers.sort((offer1, offer2) => {
        const multiplier = getSortMultiplier(sortDirection);
        return sortOffersByOption(offer1, offer2, sortOption, multiplier);
    });

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const filteredOffers = sortedOffers.filter((offer) => matchesStatusFilter(statusFilter, offer, allTiers));

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
        ...(selectedTab === 'signup' ? [{
            key: 'new-offer',
            icon: 'add',
            label: 'New offer',
            color: 'green' as const,
            onClick: handleNewOfferClick
        }] : [])
    ];

    const renderTopRightContent = () => {
        if (shouldShowFilterHeaders(selectedTab, filteredOffers)) {
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
        }

        if (shouldShowFilterPopoverOnly(selectedTab, filteredOffers)) {
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
        }

        if (shouldShowRetentionHeaders(selectedTab)) {
            return (
                <div className='flex items-center pt-[3px]'>
                    <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
                    <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
                    <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Status</span>
                    <span className='w-[80px]'></span>
                </div>
            );
        }

        return null;
    };

    const listLayoutOutput = (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full table-fixed'>
                <colgroup>
                    <col />
                    <col className='w-[220px]' />
                    <col className='w-[220px]' />
                    <col className='w-[220px]' />
                    <col className='w-[80px]' />
                </colgroup>
                {filteredOffers.map((offer) => {
                    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);

                    if (!offerTier) {
                        return null;
                    }

                    const isTierArchivedFlag = isTierArchived(offer, allTiers);
                    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
                        offer.type,
                        offer.amount,
                        offer.cadence,
                        offer.currency || 'USD',
                        offerTier
                    );

                    return (
                        <OfferRow
                            key={offer.id}
                            offer={offer}
                            offerTier={offerTier}
                            isTierArchivedFlag={isTierArchivedFlag}
                            discountOffer={discountOffer}
                            originalPriceWithCurrency={originalPriceWithCurrency}
                            updatedPriceWithCurrency={updatedPriceWithCurrency}
                            onEdit={handleOfferEdit}
                        />
                    );
                })}
            </table>
        </div>
    );

    const renderMainContent = () => {
        if (shouldShowActiveEmptyState(selectedTab, statusFilter, activeOffers, isFetchingOffers)) {
            return (
                <EmptyState
                    buttonAction={() => updateRoute('offers/new')}
                    buttonLabel='Create an offer'
                    description='Grow your audience with discounts or free trials.'
                />
            );
        }

        if (shouldShowArchivedEmptyState(selectedTab, statusFilter, archivedOffers, isFetchingOffers)) {
            return (
                <EmptyState
                    buttonAction={() => setStatusFilter('active')}
                    buttonLabel='Back to active'
                    description='All archived offers will be shown here.'
                />
            );
        }

        if (shouldShowRetentionTab(selectedTab)) {
            return <OffersRetention />;
        }

        if (shouldShowSignupList(selectedTab)) {
            return listLayoutOutput;
        }

        return null;
    };

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
                        topRightContent={renderTopRightContent()}
                        onTabChange={(tab) => {
                            setSelectedTab(tab);
                            updateRoute(tab === 'retention' ? 'offers/edit/retention' : 'offers/edit');
                        }}
                    />
                </header>
                {renderMainContent()}
            </div>
        </Modal>
    );
};
```