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
        e?.stop astore();
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
 * Retrieves offers filtered by type 'signup'.
 */
const useSignupOffers = () => {
    const {data: {offers: allOffers = []} = {}} = useBrowseOffers();
    return allOffers.filter(offer => offer.redemption_type === 'signup');
};

/**
 * Retrieves active tiers associated with the given offers.
 * Returns a map of tier ID to tier for efficient lookup.
 */
const useActiveTierMap = (signupOffers: typeof useBrowseOffers().data.offers) => {
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const validTierIds = signupOffers.map(offer => offer.tier?.id).filter(Boolean) as string[];
    const activeTiers = getPaidActiveTiers(allTiers || []);
    const activeTierMap = new Map<string, Tier>();
    activeTiers.forEach(tier => activeTierMap.set(tier.id, tier));
    return {activeTierMap, allTiers};
};

/**
 * Filters offers based on their status and associated tier activity.
 */
const useFilteredOffersByStatus = (signupOffers: typeof useBrowseOffers().data.offers, statusFilter: 'active' | 'archived', allTiers: Tier[] | undefined) => {
    const activeTierMap = new Map<string, Tier>();
    allTiers?.forEach(tier => activeTierMap.set(tier.id, tier));

    const filtered = signupOffers.filter((offer) => {
        const offerTier = offer.tier?.id ? activeTierMap.get(offer.tier.id) : undefined;
        if (statusFilter === 'active') {
            return offer.status === 'active' && offerTier && offerTier.active === true;
        } else {
            return offer.status === 'archived' || (offerTier && offerTier.active === false);
        }
    });
    return filtered;
};

/**
 * Sorts the offers based on selected option and direction.
 */
const useSortedOffers = (signupOffers: typeof useBrowseOffers().data.offers, sortOption: string, sortDirection: string) => {
    return [...signupOffers].sort((offer1, offer2) => {
        const multiplier = sortDirection === 'desc' ? -1 : 1;
        switch (sortOption) {
        case 'name':
            return multiplier * (offer1.name.localeCompare(offer2.name));
        case 'redemptions':
            return multiplier * (offer1.redemption_count - offer2.redemption_count);
        default:
            const offer1Date = offer1.created_at ? new Date(offer1.created_at).getTime() : 0;
            const offer2Date = offer2.created_at ? new Date(offer2.created_at).getTime() : 0;
            return multiplier * (offer1Date - offer2Date);
        }
    });
};

/**
 * Renders a single offer row with proper interactions and conditional content.
 */
const renderOfferRow = (offer: any, offerTier: Tier, allTiers: Tier[] | undefined) => {
    const isTierArchived = offerTier?.active === false;
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier
    );

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <OfferCellName offer={offer} offerTier={offerTier} isTierArchived={isTierArchived} />
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <OfferCellTerms discountOffer={discountOffer} offer={offer} isTierArchived={isTierArchived} />
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <OfferCellPrice updatedPriceWithCurrency={updatedPriceWithCurrency} originalPriceWithCurrency={originalPriceWithCurrency} offer={offer} isTierArchived={isTierArchived} />
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <RedemptionCell offer={offer} isTierArchived={isTierArchived} />
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived && <CopyLinkButton offerCode={offer.code} />}
            </td>
            {isTierArchived && (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because<br />
                    it is tied to an archived tier.
                </div>
            )}
        </tr>
    );
};

/**
 * Renders the offer name and tier info cell.
 */
const OfferCellName: React.FC<{offer: any, offerTier: Tier, isTierArchived: boolean}> = ({offer, offerTier, isTierArchived}) => {
    const {handleOfferEdit, updateRoute} = useRoutingContext();
    return (
        <a
            className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`}
            onClick={!isTierArchived ? () => handleOfferEdit(offer.id) : () => {}}
        >
            <span className='font-semibold'>{offer.name}</span>
            <br />
            <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
        </a>
    );
};

/**
 * Renders the offer terms cell.
 */
const OfferCellTerms: React.FC<{discountOffer: string, offer: any, isTierArchived: boolean}> = ({discountOffer, offer, isTierArchived}) => {
    const {handleOfferEdit} = useRoutingContext();
    return (
        <a
            className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
            onClick={!isTierArchived ? () => handleOfferEdit(offer.id) : () => {}}
        >
            <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span><br />
            <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
        </a>
    );
};

/**
 * Renders the offer price cell.
 */
const OfferCellPrice: React.FC<{updatedPriceWithCurrency: string, originalPriceWithCurrency: string, offer: any, isTierArchived: boolean}> = ({updatedPriceWithCurrency, originalPriceWithCurrency, offer, isTierArchived}) => {
    const {handleOfferEdit} = useRoutingContext();
    return (
        <a
            className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
            onClick={!isTierArchived ? () => handleOfferEdit(offer.id) : () => {}}
        >
            <span className='font-medium'>{updatedPriceWithCurrency}</span>
            {offer.type !== 'trial' && (
                <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                    {originalPriceWithCurrency}
                </span>
            )}
        </a>
    );
};

/**
 * Renders the redemption count cell.
 */
const RedemptionCell: React.FC<{offer: any, isTierArchived: boolean}> = ({offer, isTierArchived}) => {
    const {handleOfferEdit} = useRoutingContext();
    return (
        <a
            className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
            href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id) : undefined}
            onClick={offer.redemption_count === 0 ? !isTierArchived ? () => handleOfferEdit(offer.id) : () => {} : () => {}}
        >
            {offer.redemption_count}
        </a>
    );
};

/**
 * Returns a mock routing hook context for extractable cell components.
 */
const useRoutingContext = () => {
    const {updateRoute} = useRouting();
    const {sessionStorage} = window;
    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };
    return {handleOfferEdit, updateRoute};
};

const OffersIndexModal: React.FC<{defaultTab?: string}> = ({defaultTab}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const signupOffers = useSignupOffers();
    const {activeTierMap, allTiers: allTiersWithValues} = useActiveTierMap(signupOffers);
    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    constsignupOffersWithValidTiers = signupOffers.filter(o => o.tier && activeTierMap.has(o.tier.id));

    const activeOffers = signupOffersWithValidTiers.filter((offer) => {
        const offerTier = offer.tier?.id ? activeTierMap.get(offer.tier.id) : undefined;
        return offer.status === 'active' && offerTier?.active === true;
    });
    const archivedOffers = signupOffersWithValidTiers.filter((offer) => {
        const offerTier = offer.tier?.id ? activeTierMap.get(offer.tier.id) : undefined;
        return offer.status === 'archived' || (offerTier?.active === false);
    });

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

    const sortedOffers = useSortedOffers(signupOffers, sortOption, sortDirection);

    const filteredOffers = useFilteredOffersByStatus(signupOffers, statusFilter, allTiers);

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
                    const offerTier = offer.tier?.id ? activeTierMap.get(offer.tier.id) : undefined;
                    if (!offerTier) {
                        return null;
                    }
                    return renderOfferRow(offer, offerTier, allTiers);
                })}
            </table>
        </div>
    );

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
                                        onDirectionChange={handleDirectionChange}
                                        onSortChange={handleSortChange}
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
                                        onDirectionChange={handleDirectionChange}
                                        onSortChange={handleSortChange}
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
            {selectedTab === 'signup' && statusFilter === 'active' && activeOffers.length === 0 && !isFetchingOffers ?
                <EmptyState
                    buttonAction={() => updateRoute('offers/new')}
                    buttonLabel='Create an offer'
                    description='Grow your audience with discounts or free trials.'
                /> :
                null
            }
            {selectedTab === 'signup' && statusFilter === 'archived' && archivedOffers.length === 0 && !isFetchingOffers ?
                <EmptyState
                    buttonAction={() => setStatusFilter('active')}
                    buttonLabel='Back to active'
                    description='All archived offers will be shown here.'
                /> :
                null
            }
            {selectedTab === 'retention' && <OffersRetention />}
            {selectedTab === 'signup' && listLayoutOutput}
        </div>
    </Modal>;
};