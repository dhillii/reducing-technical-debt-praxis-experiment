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
import {useState, useCallback} from 'react';

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

/**
 * Returns the list of active signup offers.
 */
const getActiveOffers = (signupOffers: any[], allTiers: Tier[] | undefined) => {
    return signupOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return offer.status === 'active' && offerTier && offerTier.active === true;
    });
};

/**
 * Returns the list of archived signup offers.
 */
const getArchivedOffers = (signupOffers: any[], allTiers: Tier[] | undefined) => {
    return signupOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return offer.status === 'archived' || (offerTier && offerTier.active === false);
    });
};

/**
 * Sorts offers based on the selected option and direction.
 */
const getSortedOffers = (offers: any[], option: string, direction: string) => {
    const multiplier = direction === 'desc' ? -1 : 1;
    return offers.sort((a, b) => {
        switch (option) {
            case 'name':
                return multiplier * a.name.localeCompare(b.name);
            case 'redemptions':
                return multiplier * (a.redemption_count - b.redemption_count);
            default:
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return multiplier * (aTime - bTime);
        }
    });
};

/**
 * Filters offers based on status and tier activity.
 */
const getFilteredOffers = (offers: any[], status: 'active' | 'archived', allTiers: Tier[] | undefined) => {
    return offers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        if (status === 'active') {
            return offer.status === 'active' && offerTier && offerTier.active === true;
        }
        return offer.status === 'archived' || (offerTier && offerTier.active === false);
    });
};

/**
 * Returns the default tabs for the offers index.
 */
const getOffersTabs = (): Tab[] => [
    {id: 'signup', title: 'Signup'},
    {id: 'retention', title: 'Retention'}
];

/**
 * Returns the button configuration for the modal footer.
 */
const getFooterButtons = (
    selectedTab: string,
    paidActiveTiers: Tier[],
    modal: any,
    updateRoute: (path: string) => void,
    setStatusFilter: (status: 'active' | 'archived') => void,
    setSortingState: any,
    sortOption: string,
    sortDirection: string,
    handleDirectionChange: () => void,
    handleSortChange: (option: string) => void
): ButtonProps[] => {
    const baseButtons: ButtonProps[] = [
        {
            key: 'cancel-modal',
            label: 'Close',
            onClick: () => {
                modal.remove();
                updateRoute('offers');
            }
        }
    ];

    if (selectedTab === 'signup') {
        baseButtons.push({
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
        });
    }

    return baseButtons;
};

/**
 * Renders a single offer row.
 */
const OfferRow: React.FC<{
    offer: any;
    tier: Tier;
    onEdit: (id: string) => void;
}> = ({offer, tier, onEdit}) => {
    const isTierArchived = tier.active === false;
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', tier);

    const handleEdit = () => {
        if (!isTierArchived) {
            onEdit(offer.id ?? '');
        }
    };

    const redemptionUrl = offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ?? '') : undefined;

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`} onClick={handleEdit}>
                    <span className='font-semibold'>{offer.name}</span><br />
                    <span className='text-sm text-grey-700'>{tier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={handleEdit}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span><br />
                    <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={handleEdit}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' ? <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>{originalPriceWithCurrency}</span> : null}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`} href={redemptionUrl} onClick={offer.redemption_count === 0 ? handleEdit : undefined}>
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived ? <CopyLinkButton offerCode={offer.code} /> : null}
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
 * Renders the offers table.
 */
const OfferTable: React.FC<{
    offers: any[];
    tiers: Tier[];
    onEdit: (id: string) => void;
}> = ({offers, tiers, onEdit}) => {
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
                {offers.map((offer) => {
                    const offerTier = tiers?.find(tier => tier.id === offer?.tier?.id);
                    if (!offerTier) return null;
                    return <OfferRow key={offer.id} offer={offer} tier={offerTier} onEdit={onEdit} />;
                })}
            </table>
        </div>
    );
};

/**
 * Header section of the offers index modal.
 */
const OffersHeader: React.FC<{
    selectedTab: string;
    filteredOffers: any[];
    statusFilter: 'active' | 'archived';
    setStatusFilter: (status: 'active' | 'archived') => void;
    sortOption: string;
    sortDirection: string;
    onSortChange: (option: string) => void;
    onDirectionChange: () => void;
    offersTabs: Tab[];
}> = ({
    selectedTab,
    filteredOffers,
    statusFilter,
    setStatusFilter,
    sortOption,
    sortDirection,
    onSortChange,
    onDirectionChange,
    offersTabs
}) => {
    return (
        <header>
            <TabView
                selectedTab={selectedTab}
                tabs={offersTabs}
                topRightContent={
                    selectedTab === 'signup' && filteredOffers.length > 0 ?
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
                                    onDirectionChange={onDirectionChange}
                                    onSortChange={onSortChange}
                                />
                            </span>
                        </div> :
                        selectedTab === 'signup' ?
                            <div className='flex items-center'>
                                <OffersFilterPopover
                                    setStatusFilter={setStatusFilter}
                                    sortDirection={sortDirection}
                                    sortOption={sortOption}
                                    statusFilter={statusFilter}
                                    onDirectionChange={onDirectionChange}
                                    onSortChange={onSortChange}
                                />
                            </div> :
                            selectedTab === 'retention' ?
                                <div className='flex items-center pt-[3px]'>
                                    <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
                                    <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
                                    <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Status</span>
                                    <span className='w-[80px]'></span>
                                </div> :
                                null
                }
                onTabChange={(tab) => {
                    setSelectedTab(tab);
                    updateRoute(tab === 'retention' ? 'offers/edit/retention' : 'offers/edit');
                }}
            />
        </header>
    );
};

/**
 * Body section of the offers index modal.
 */
const OffersBody: React.FC<{
    selectedTab: string;
    statusFilter: 'active' | 'archived';
    activeOffers: any[];
    archivedOffers: any[];
    isFetchingOffers: boolean;
    filteredOffers: any[];
    handleOfferEdit: (id: string) => void;
    paidActiveTiers: Tier[];
    updateRoute: (path: string) => void;
    setStatusFilter: (status: 'active' | 'archived') => void;
}> = ({
    selectedTab,
    statusFilter,
    activeOffers,
    archivedOffers,
    isFetchingOffers,
    filteredOffers,
    handleOfferEdit,
    paidActiveTiers,
    updateRoute,
    setStatusFilter
}) => {
    if (selectedTab === 'signup' && statusFilter === 'active' && activeOffers.length === 0 && !isFetchingOffers) {
        return (
            <EmptyState
                buttonAction={() => updateRoute('offers/new')}
                buttonLabel='Create an offer'
                description='Grow your audience with discounts or free trials.'
            />
        );
    }

    if (selectedTab === 'signup' && statusFilter === 'archived' && archivedOffers.length === 0 && !isFetchingOffers) {
        return (
            <EmptyState
                buttonAction={() => setStatusFilter('active')}
                buttonLabel='Back to active'
                description='All archived offers will be shown here.'
            />
        );
    }

    if (selectedTab === 'retention') {
        return <OffersRetention />;
    }

    if (selectedTab === 'signup') {
        return <OfferTable offers={filteredOffers} tiers={allTiers} onEdit={handleOfferEdit} />;
    }

    return null;
};

export const OffersIndexModal: React.FC<{defaultTab?: string}> = ({defaultTab}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const activeOffers = getActiveOffers(signupOffers, allTiers);
    const archivedOffers = getArchivedOffers(signupOffers, allTiers);
    const offersTabs = getOffersTabs();

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');

    const [selectedTab, setSelectedTab] = useState(defaultTab || 'signup');
    const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');

    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const handleOfferEdit = useCallback((id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    }, [updateRoute]);

    const sortedOffers = getSortedOffers(signupOffers, sortOption, sortDirection);
    const paidActiveTiers = getPaidActiveTiers(allTiers || []);
    const filteredOffers = getFilteredOffers(sortedOffers, statusFilter, allTiers);

    const handleSortChange = useCallback((selectedOption: string) => {
        setSortingState?.([{
            type: 'offers',
            option: selectedOption,
            direction: sortDirection
        }]);
    }, [setSortingState, sortDirection]);

    const handleDirectionChange = useCallback(() => {
        const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        setSortingState?.([{
            type: 'offers',
            option: sortOption,
            direction: newDirection
        }]);
    }, [setSortingState, sortOption, sortDirection]);

    const footerButtons = getFooterButtons(
        selectedTab,
        paidActiveTiers,
        modal,
        updateRoute,
        setStatusFilter,
        setSortingState,
        sortOption,
        sortDirection,
        handleDirectionChange,
        handleSortChange
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
            topRightContent={<ButtonGroup buttons={footerButtons} />}
            width={1140}
        >
            <div className='flex h-full flex-col pt-8'>
                <OffersHeader
                    selectedTab={selectedTab}
                    filteredOffers={filteredOffers}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    sortOption={sortOption}
                    sortDirection={sortDirection}
                    onSortChange={handleSortChange}
                    onDirectionChange={handleDirectionChange}
                    offersTabs={offersTabs}
                />
                <OffersBody
                    selectedTab={selectedTab}
                    statusFilter={statusFilter}
                    activeOffers={activeOffers}
                    archivedOffers={archivedOffers}
                    isFetchingOffers={isFetchingOffers}
                    filteredOffers={filteredOffers}
                    handleOfferEdit={handleOfferEdit}
                    paidActiveTiers={paidActiveTiers}
                    updateRoute={updateRoute}
                    setStatusFilter={setStatusFilter}
                />
            </div>
        </Modal>
    );
};