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

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): {discountColor: string; discountOffer: string; originalPriceWithCurrency: string; updatedPriceWithCurrency: string} => {
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
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='lg' />
        <h1 className='mt-4 text-xl'>{title}</h1>
        <p className='mt-1.5 max-w-[420px]'>{description}</p>
        <Button className="mt-6" color="grey" label={buttonLabel} onClick={buttonAction}></Button>
    </div>
);

/**
 * Returns true if the offer is active and its tier is active.
 */
const isActiveOffer = (offer: any, tiers: Tier[] | undefined): boolean => {
    const tier = tiers?.find(t => t.id === offer?.tier?.id);
    return offer.status === 'active' && tier?.active === true;
};

/**
 * Returns true if the offer is archived or its tier is archived.
 */
const isArchivedOffer = (offer: any, tiers: Tier[] | undefined): boolean => {
    const tier = tiers?.find(t => t.id === offer?.tier?.id);
    return offer.status === 'archived' || (tier && tier.active === false);
};

/**
 * Sorts offers based on the selected option and direction.
 */
const getSortedOffers = (
    offers: any[],
    sortOption: string,
    sortDirection: string
): any[] => {
    const multiplier = sortDirection === 'desc' ? -1 : 1;
    return offers.sort((a, b) => {
        switch (sortOption) {
            case 'name':
                return multiplier * a.name.localeCompare(b.name);
            case 'redemptions':
                return multiplier * (a.redemption_count - b.redemption_count);
            default:
                const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
                return multiplier * (aDate - bDate);
        }
    });
};

/**
 * Filters offers based on status and tier activity.
 */
const getFilteredOffers = (
    offers: any[],
    tiers: Tier[] | undefined,
    statusFilter: 'active' | 'archived'
): any[] => {
    return offers.filter(offer => {
        const tier = tiers?.find(t => t.id === offer?.tier?.id);
        if (statusFilter === 'active') {
            return offer.status === 'active' && tier?.active === true;
        }
        return offer.status === 'archived' || (tier && tier.active === false);
    });
};

/**
 * Renders a single offer row.
 */
const OfferRow: React.FC<{
    offer: any;
    tier: Tier | undefined;
    handleOfferEdit: (id: string) => void;
}> = ({offer, tier, handleOfferEdit}) => {
    const isTierArchived = tier?.active === false;
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        tier
    );

    const isEditable = !isTierArchived;
    const redemptionLink = offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ?? '') : undefined;

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`}
                    onClick={isEditable ? () => handleOfferEdit(offer.id ?? '') : undefined}
                >
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>
                        {tier?.name} {getOfferCadence(offer.cadence)}
                    </span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`}
                    onClick={isEditable ? () => handleOfferEdit(offer.id ?? '') : undefined}
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
                    onClick={isEditable ? () => handleOfferEdit(offer.id ?? '') : undefined}
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
                    href={redemptionLink}
                    onClick={
                        offer.redemption_count === 0
                            ? isEditable
                                ? () => handleOfferEdit(offer.id ?? '')
                                : undefined
                            : undefined
                    }
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {isEditable && <CopyLinkButton offerCode={offer.code} />}
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
    tiers: Tier[] | undefined;
    handleOfferEdit: (id: string) => void;
}> = ({offers, tiers, handleOfferEdit}) => (
    <div className='overflow-x-auto'>
        <table className='m-0 w-full table-fixed'>
            <colgroup>
                <col />
                <col className='w-[220px]' />
                <col className='w-[220px]' />
                <col className='w-[220px]' />
                <col className='w-[80px]' />
            </colgroup>
            {offers.map(offer => {
                const tier = tiers?.find(t => t.id === offer?.tier?.id);
                if (!tier) return null;
                return <OfferRow key={offer.id} offer={offer} tier={tier} handleOfferEdit={handleOfferEdit} />;
            })}
        </table>
    </div>
);

/**
 * Renders the header content based on the selected tab.
 */
const HeaderContent: React.FC<{
    selectedTab: string;
    filteredOffers: any[];
    statusFilter: 'active' | 'archived';
    offersTabs: Tab[];
    sortOption: string;
    sortDirection: string;
    setStatusFilter: (status: 'active' | 'archived') => void;
    onSortChange: (option: string) => void;
    onDirectionChange: () => void;
}> = ({
    selectedTab,
    filteredOffers,
    statusFilter,
    offersTabs,
    sortOption,
    sortDirection,
    setStatusFilter,
    onSortChange,
    onDirectionChange
}) => {
    const renderSignupHeader = () => (
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
        </div>
    );

    const renderRetentionHeader = () => (
        <div className='flex items-center pt-[3px]'>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Status</span>
            <span className='w-[80px]'></span>
        </div>
    );

    if (selectedTab === 'signup') {
        return filteredOffers.length > 0 ? renderSignupHeader() : renderSignupHeader();
    }
    if (selectedTab === 'retention') {
        return renderRetentionHeader();
    }
    return null;
};

/**
 * Renders the empty state based on the selected tab and status.
 */
const EmptyStateWrapper: React.FC<{
    selectedTab: string;
    statusFilter: 'active' | 'archived';
    activeOffers: any[];
    archivedOffers: any[];
    isFetchingOffers: boolean;
    updateRoute: (path: string) => void;
}> = ({
    selectedTab,
    statusFilter,
    activeOffers,
    archivedOffers,
    isFetchingOffers,
    updateRoute
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
    return null;
};

/**
 * Returns the buttons for the modal footer.
 */
const getModalButtons = (
    selectedTab: string,
    paidActiveTiers: Tier[],
    updateRoute: (path: string) => void,
    modal: any
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

export const OffersIndexModal: React.FC<{defaultTab?: string}> = ({defaultTab}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const activeOffers = signupOffers.filter(offer => isActiveOffer(offer, allTiers));
    const archivedOffers = signupOffers.filter(offer => isArchivedOffer(offer, allTiers));

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

    const sortedOffers = getSortedOffers(signupOffers, sortOption, sortDirection);
    const filteredOffers = getFilteredOffers(sortedOffers, allTiers, statusFilter);

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const handleSortChange = (selectedOption: string) => {
        setSortingState?.([
            {
                type: 'offers',
                option: selectedOption,
                direction: sortDirection
            }
        ]);
    };

    const handleDirectionChange = () => {
        const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        setSortingState?.([
            {
                type: 'offers',
                option: sortOption,
                direction: newDirection
            }
        ]);
    };

    const buttons = getModalButtons(selectedTab, paidActiveTiers, updateRoute, modal);

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
                        topRightContent={
                            <HeaderContent
                                selectedTab={selectedTab}
                                filteredOffers={filteredOffers}
                                statusFilter={statusFilter}
                                offersTabs={offersTabs}
                                sortOption={sortOption}
                                sortDirection={sortDirection}
                                setStatusFilter={setStatusFilter}
                                onSortChange={handleSortChange}
                                onDirectionChange={handleDirectionChange}
                            />
                        }
                        onTabChange={tab => {
                            setSelectedTab(tab);
                            updateRoute(tab === 'retention' ? 'offers/edit/retention' : 'offers/edit');
                        }}
                    />
                </header>
                <EmptyStateWrapper
                    selectedTab={selectedTab}
                    statusFilter={statusFilter}
                    activeOffers={activeOffers}
                    archivedOffers={archivedOffers}
                    isFetchingOffers={isFetchingOffers}
                    updateRoute={updateRoute}
                />
                {selectedTab === 'retention' && <OffersRetention />}
                {selectedTab === 'signup' && <OfferTable offers={filteredOffers} tiers={allTiers} handleOfferEdit={handleOfferEdit} />}
            </div>
        </Modal>
    );
};