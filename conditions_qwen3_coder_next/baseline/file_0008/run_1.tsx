import OffersRetention from './offers-retention';
import {Button, type Tab, TabView} from '@tryghost/admin-x-design-system';
import {ButtonGroup, showToast} from '@tryghost/admin-x-design-system';
import {Icon} from '@tryghost/admin-x-design-system';
import {Modal} from '@tryghost/admin-x-design-system';
import {Popover} from '@tryghost/admin-x-design-system';
import {Tooltip} from '@tryghost/admin-x-design-system';
import {currencyToDecimal, getSymbol} from '../../../../utils/currency';
import {getHomepageUrl} from '@tryghost/admin-x-framework/api/site';
import {numberWithCommas} from '../../../../utils/helpers';
import {useBrowseOffers} from '@tryghost/admin-x-framework/api/offers';
import {useBrowseTiers} from '@tryghost/admin-x-framework/api/tiers';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useModal} from '@ebay/nice-modal-react';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {useSortingState} from '../../../providers/settings-app-provider';
import {useState} from 'react';
import {getPaidActiveTiers, type Tier} from '@tryghost/admin-x-framework/api/tiers';
import {CopyLinkButton, getOfferDiscount, getOfferCadence, getOfferDuration} from './OffersUtils';

interface OfferWithTier extends Tier {
    tier?: Tier;
}

const OffersFilterPopover = ({
    statusFilter,
    setStatusFilter,
    sortOption,
    sortDirection,
    onSortChange,
    onDirectionChange
}: {
    statusFilter: 'active' | 'archived';
    setStatusFilter: (status: 'active' | 'archived') => void;
    sortOption: string;
    sortDirection: string;
    onSortChange: (option: string) => void;
    onDirectionChange: () => void;
}) => {
    return (
        <Popover
            position='end'
            trigger={
                <button className='flex cursor-pointer items-center justify-center rounded p-1 hover:bg-grey-100 dark:hover:bg-grey-800' type='button'>
                    <Icon name='filter' className='text-grey-700' size={16} strokeWidth={1.5} />
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

const OfferRow = ({
    offer,
    tier,
    onEdit,
    isArchived
}: {
    offer: any;
    tier: Tier;
    onEdit: (id: string) => void;
    isArchived: boolean;
}) => {
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        tier
    );

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800 ${isArchived ? 'opacity-50' : ''}`} data-testid="offer-item">
            <td className='p-0'>
                <a
                    className={`block ${isArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`}
                    onClick={!isArchived ? () => onEdit(offer?.id ?? '') : undefined}
                >
                    <span className='font-semibold'>{offer?.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{tier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className='whitespace-nowrap p-0 text-sm'>
                <a
                    className={`block ${isArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                    onClick={!isArchived ? () => onEdit(offer?.id ?? '') : undefined}
                >
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className='whitespace-nowrap p-0 text-sm'>
                <a
                    className={`block ${isArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                    onClick={!isArchived ? () => onEdit(offer?.id ?? '') : undefined}
                >
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' && (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                            {originalPriceWithCurrency}
                        </span>
                    )}
                </a>
            </td>
            <td className='w-[120px] whitespace-nowrap p-0 text-sm'>
                <a
                    className={`block ${isArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
                    href={offer.redemption_count > 0 ? `/ghost/#/members?filter=offer_redemptions:[${offer.id}]` : undefined}
                    onClick={offer.redemption_count === 0 && !isArchived ? () => onEdit(offer?.id ?? '') : undefined}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className='w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none'>
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

const useOfferFiltering = (
    allOffers: any[],
    allTiers: Tier[] | undefined,
    statusFilter: 'active' | 'archived'
) => {
    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');

    const filteredOffers = signupOffers
        .filter((offer) => {
            const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
            if (statusFilter === 'active') {
                return offer.status === 'active' && offerTier?.active === true;
            }
            return offer.status === 'archived' || (offerTier && offerTier.active === false);
        });

    return {signupOffers, filteredOffers};
};

const useOfferSorting = (signupOffers: any[], sortOption: string, sortDirection: string) => {
    return signupOffers.sort((offer1, offer2) => {
        const multiplier = sortDirection === 'desc' ? -1 : 1;
        switch (sortOption) {
        case 'name':
            return multiplier * (offer1.name.localeCompare(offer2.name));
        case 'redemptions':
            return multiplier * (offer1.redemption_count - offer2.redemption_count);
        default:
            return multiplier * ((offer1.created_at ? new Date(offer1.created_at).getTime() : 0) - (offer2.created_at ? new Date(offer2.created_at).getTime() : 0));
        }
    });
};

const OffersIndexModal: React.FC<{defaultTab?: string}> = ({defaultTab}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');
    const [selectedTab, setSelectedTab] = useState(defaultTab || 'signup');
    const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');

    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const {signupOffers, filteredOffers} = useOfferFiltering(allOffers, allTiers, statusFilter);
    const sortedOffers = useOfferSorting(signupOffers, sortOption, sortDirection);

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const activeOffers = signupOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return offer.status === 'active' && offerTier?.active === true;
    });

    const archivedOffers = signupOffers.filter((offer) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        return offer.status === 'archived' || (offerTier && offerTier.active === false);
    });

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

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

    const buttons = [
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
    ] as const;

    const listLayoutOutput = <div className='overflow-x-auto'>
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
                const isTierArchived = offerTier?.active === false;

                if (!offerTier) {
                    return null;
                }

                return (
                    <OfferRow
                        key={offer.id}
                        offer={offer}
                        tier={offerTier}
                        onEdit={handleOfferEdit}
                        isArchived={isTierArchived}
                    />
                );
            })}
        </table>
    </div>;

    return <Modal
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
                        {id: 'signup', title: 'Signup'},
                        {id: 'retention', title: 'Retention'}
                    ]}
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
            {selectedTab === 'signup' && statusFilter === 'active' && activeOffers.length === 0 && (
                <div className='flex h-full grow flex-col items-center justify-center text-center'>
                    <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='lg' />
                    <h1 className='mt-4 text-xl'>No offers found</h1>
                    <p className='mt-1.5 max-w-[420px]'>Grow your audience with discounts or free trials.</p>
                    <Button className="mt-6" color="grey" label='Create an offer' onClick={() => updateRoute('offers/new')}></Button>
                </div>
            )}
            {selectedTab === 'signup' && statusFilter === 'archived' && archivedOffers.length === 0 && (
                <div className='flex h-full grow flex-col items-center justify-center text-center'>
                    <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='lg' />
                    <h1 className='mt-4 text-xl'>No archived offers</h1>
                    <p className='mt-1.5 max-w-[420px]'>All archived offers will be shown here.</p>
                    <Button className="mt-6" color="grey" label='Back to active' onClick={() => setStatusFilter('active')}></Button>
                </div>
            )}
            {selectedTab === 'retention' && <OffersRetention />}
            {selectedTab === 'signup' && listLayoutOutput}
        </div>
    </Modal>;
};

export default OffersIndexModal;