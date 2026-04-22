```tsx
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
import {useState, useMemo, useCallback} from 'react';

export type OfferType = 'percent' | 'fixed' | 'trial';

export const createRedemptionFilterUrl = (id: string): string =>
    `/ghost/#/members?filter=${encodeURIComponent(`offer_redemptions:[${id}]`)}`;

export const getOfferCadence = (cadence: string): string =>
    cadence === 'month' ? 'monthly' : 'yearly';

export const getOfferDuration = (duration: string): string =>
    duration === 'once' ? 'First payment' :
    duration === 'repeating' ? 'Repeating' : 'Forever';

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
) => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    const format = (n: number) => numberWithCommas(parseFloat(n.toFixed(2)));
    const toCurrency = (n: number) => `${getSymbol(currency)}${format(currencyToDecimal(n))}`;

    let discountColor = '';
    let discountOffer = '';
    let updatedPrice = originalPrice;
    let originalPriceWithCurrency = toCurrency(originalPrice);

    if (type === 'percent') {
        discountColor = 'text-green';
        discountOffer = `${amount}% off`;
        updatedPrice = originalPrice - (originalPrice * amount) / 100;
    } else if (type === 'fixed') {
        discountColor = 'text-blue';
        discountOffer = `${format(currencyToDecimal(amount))} ${currency} off`;
        updatedPrice = originalPrice - amount;
    } else if (type === 'trial') {
        discountColor = 'text-pink';
        discountOffer = `${amount} days free`;
        originalPriceWithCurrency = '';
    }

    if (updatedPrice < 0) updatedPrice = 0;

    return {
        discountColor,
        discountOffer,
        originalPriceWithCurrency,
        updatedPriceWithCurrency: toCurrency(updatedPrice)
    };
};

export const CopyLinkButton: React.FC<{offerCode: string}> = ({offerCode}) => {
    const [isCopied, setIsCopied] = useState(false);
    const {siteData} = useGlobalData();

    const handleCopyClick = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        const link = `${getHomepageUrl(siteData!)}${offerCode}`;
        navigator.clipboard.writeText(link);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <Tooltip
            containerClassName='group-hover:opacity-100 opacity-0 inline-flex items-center -mr-1 justify-center w-5 h-5'
            content={isCopied ? 'Copied' : 'Copy link'}
            size='sm'
        >
            <Button
                color='clear'
                hideLabel
                icon={isCopied ? 'check-circle' : 'hyperlink-circle'}
                iconColorClass={isCopied ? 'text-green w-[14px] h-[14px]' : 'w-[14px] h-[14px]'}
                label={isCopied ? 'Copied' : 'Copy'}
                unstyled
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
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='lg' />
        <h1 className='mt-4 text-xl'>{title}</h1>
        <p className='mt-1.5 max-w-[420px]'>{description}</p>
        <Button className='mt-6' color='grey' label={buttonLabel} onClick={buttonAction} />
    </div>
);

const OffersFilterPopover: React.FC<{
    statusFilter: 'active' | 'archived';
    setStatusFilter: (s: 'active' | 'archived') => void;
    sortOption: string;
    sortDirection: string;
    onSortChange: (opt: string) => void;
    onDirectionChange: () => void;
}> = ({
    statusFilter,
    setStatusFilter,
    sortOption,
    sortDirection,
    onSortChange,
    onDirectionChange
}) => (
    <Popover
        position='end'
        trigger={
            <button
                className='flex cursor-pointer items-center rounded p-1 hover:bg-grey-100 dark:hover:bg-grey-800'
                type='button'
            >
                <LucideIcon.ListFilter className='text-grey-700' size={16} strokeWidth={1.5} />
            </button>
        }
    >
        <div className='flex min-w-[220px] flex-col'>
            <div className='cursor-default select-none border-b border-b-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-b-grey-800'>
                Status
            </div>
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

            <div className='cursor-default select-none border-y border-y-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-grey-800'>
                Sort by
            </div>
            <div className='flex flex-col py-1'>
                {[
                    {id: 'date-added', label: 'Date added'},
                    {id: 'name', label: 'Name'},
                    {id: 'redemptions', label: 'Redemptions'}
                ].map(item => (
                    <div key={item.id} className='group relative mx-1 flex items-center rounded-[2.5px] hover:bg-grey-100 dark:hover:bg-grey-800'>
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
                                onClick={onDirectionChange}
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

type Offer = ReturnType<typeof useBrowseOffers>['data']['offers'][number];

const useSortedOffers = (
    offers: Offer[],
    sortOption: string,
    sortDirection: string
) => {
    return useMemo(() => {
        const multiplier = sortDirection === 'desc' ? -1 : 1;
        return [...offers].sort((a, b) => {
            switch (sortOption) {
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
    }, [offers, sortOption, sortDirection]);
};

const useFilteredOffers = (
    offers: Offer[],
    tiers: Tier[] | undefined,
    statusFilter: 'active' | 'archived'
) => {
    return useMemo(() => {
        return offers.filter(offer => {
            const tier = tiers?.find(t => t.id === offer.tier?.id);
            const isActiveTier = tier?.active === true;
            if (statusFilter === 'active') {
                return offer.status === 'active' && isActiveTier;
            }
            return offer.status === 'archived' || !isActiveTier;
        });
    }, [offers, tiers, statusFilter]);
};

const OfferRow: React.FC<{
    offer: Offer;
    tier: Tier;
    isTierArchived: boolean;
    onEdit: (id: string) => void;
}> = ({offer, tier, isTierArchived, onEdit}) => {
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        tier
    );

    const handleClick = isTierArchived ? undefined : () => onEdit(offer.id ?? '');

    return (
        <tr className='group relative border-b border-b-grey-200 dark:border-grey-800' data-testid='offer-item'>
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`}
                    onClick={handleClick}
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
                    onClick={handleClick}
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
                    onClick={handleClick}
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
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${
                        offer.redemption_count ? 'hover:underline' : ''
                    }`}
                    href={
                        offer.redemption_count
                            ? createRedemptionFilterUrl(offer.id ?? '')
                            : undefined
                    }
                    onClick={
                        offer.redemption_count
                            ? undefined
                            : handleClick
                    }
                >
                    {offer.redemption_count}
                </a>
            </td>

            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived && <CopyLinkButton offerCode={offer.code} />}
            </td>

            {isTierArchived && (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br />
                    it is tied to an archived tier.
                </div>
            )}
        </tr>
    );
};

export const OffersIndexModal: React.FC<{defaultTab?: string}> = ({defaultTab}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();

    const signupOffers = useMemo(
        () => allOffers.filter(o => o.redemption_type === 'signup'),
        [allOffers]
    );

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(s => s.type === 'offers');

    const [selectedTab, setSelectedTab] = useState(defaultTab || 'signup');
    const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');

    const sortOption = offersSorting?.option ?? 'date-added';
    const sortDirection = offersSorting?.direction ?? 'desc';

    const sortedOffers = useSortedOffers(signupOffers, sortOption, sortDirection);
    const filteredOffers = useFilteredOffers(sortedOffers, allTiers, statusFilter);
    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const handleOfferEdit = useCallback(
        (id: string) => {
            sessionStorage.setItem('editOfferPageSource', 'offersIndex');
            updateRoute(`offers/edit/${id}`);
        },
        [updateRoute]
    );

    const handleSortChange = (opt: string) => {
        setSortingState?.([{type: 'offers', option: opt, direction: sortDirection}]);
    };

    const handleDirectionChange = () => {
        const newDir = sortDirection === 'asc' ? 'desc' : 'asc';
        setSortingState?.([{type: 'offers', option: sortOption, direction: newDir}]);
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
        ...(selectedTab === 'signup'
            ? [
                  {
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
                  }
              ]
            : [])
    ];

    const renderHeader = () => {
        if (selectedTab !== 'signup') return null;

        const baseHeaders = (
            <>
                <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
                <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Price</span>
                <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
            </>
        );

        return (
            <div className='flex items-center'>
                {filteredOffers.length > 0 ? (
                    <>
                        {baseHeaders}
                        <span className='flex w-[80px] items-center justify-end'>
                            <OffersFilterPopover
                                statusFilter={statusFilter}
                                setStatusFilter={setStatusFilter}
                                sortOption={sortOption}
                                sortDirection={sortDirection}
                                onSortChange={handleSortChange}
                                onDirectionChange={handleDirectionChange}
                            />
                        </span>
                    </>
                ) : (
                    <OffersFilterPopover
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        sortOption={sortOption}
                        sortDirection={sortDirection}
                        onSortChange={handleSortChange}
                        onDirectionChange={handleDirectionChange}
                    />
                )}
            </div>
        );
    };

    const renderEmptyState = () => {
        if (selectedTab !== 'signup') return null;

        if (statusFilter === 'active' && filteredOffers.length === 0 && !isFetchingOffers) {
            return (
                <EmptyState
                    buttonAction={() => updateRoute('offers/new')}
                    buttonLabel='Create an offer'
                    description='Grow your audience with discounts or free trials.'
                />
            );
        }

        if (statusFilter === 'archived' && filteredOffers.length === 0 && !isFetchingOffers) {
            return (
                <EmptyState
                    buttonAction={() => setStatusFilter('active')}
                    buttonLabel='Back to active'
                    description='All archived offers will be shown here.'
                />
            );
        }

        return null;
    };

    const renderOffersTable = () => (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full table-fixed'>
                <colgroup>
                    <col />
                    <col className='w-[220px]' />
                    <col className='w-[220px]' />
                    <col className='w-[220px]' />
                    <col className='w-[80px]' />
                </colgroup>
                <tbody>
                    {filteredOffers.map(offer => {
                        const tier = allTiers?.find(t => t.id === offer.tier?.id);
                        if (!tier) return null;
                        const isTierArchived = tier.active === false;
                        return (
                            <OfferRow
                                key={offer.id}
                                offer={offer}
                                tier={tier}
                                isTierArchived={isTierArchived}
                                onEdit={handleOfferEdit}
                            />
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

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
                            {id: 'signup', title: 'Signup'},
                            {id: 'retention', title: 'Retention'}
                        ]}
                        topRightContent={renderHeader()}
                        onTabChange={tab => {
                            setSelectedTab(tab);
                            updateRoute(tab === 'retention' ? 'offers/edit/retention' : 'offers/edit');
                        }}
                    />
                </header>

                {renderEmptyState()}
                {selectedTab === 'retention' && <OffersRetention />}
                {selectedTab === 'signup' && renderOffersTable()}
            </div>
        </Modal>
    );
};
```