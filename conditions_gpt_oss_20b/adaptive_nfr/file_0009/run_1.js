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
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='xl' />
        <h1 className='mt-6 text-2xl'>{title}</h1>
        <p className='mt-3 max-w-[420px] text-[1.6rem]'>{description}</p>
        <Button className="mt-8" color="grey" label={buttonLabel} onClick={buttonAction}></Button>
    </div>
);

/**
 * Determines if an offer is active based on its status and tier active flag.
 */
const isOfferActive = (offer: any, tier: Tier | undefined): boolean => {
    return offer.status === 'active' && tier?.active === true;
};

/**
 * Determines if an offer is archived based on its status or tier active flag.
 */
const isOfferArchived = (offer: any, tier: Tier | undefined): boolean => {
    return offer.status === 'archived' || tier?.active === false;
};

/**
 * Retrieves the tier associated with an offer.
 */
const getOfferTier = (offer: any, tiers: Tier[] | undefined): Tier | undefined => {
    return tiers?.find(tier => tier.id === offer?.tier?.id);
};

/**
 * Renders the table header row.
 */
const renderTableHeader = (
    selectedTab: string,
    activeOffers: any[],
    archivedOffers: any[]
): JSX.Element | null => {
    const count = selectedTab === 'active' ? activeOffers.length : archivedOffers.length;
    if (count === 0) {
        return null;
    }
    const label = count === 1 ? 'offer' : 'offers';
    return (
        <tr className='border-b border-b-grey-300 dark:border-grey-800'>
            <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>
                {count} {label}
            </th>
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
    handleOfferEdit: (id: string) => void
): JSX.Element | null => {
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

    const redemptionLink = offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ?? '') : undefined;
    const redemptionClick = () => {
        if (offer.redemption_count === 0 && !isTierArchived) {
            editHandler();
        }
    };

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
};

/**
 * Renders the list of offers.
 */
const renderOfferList = (
    sortedOffers: any[],
    selectedTab: string,
    allTiers: Tier[] | undefined,
    handleOfferEdit: (id: string) => void,
    activeOffers: any[],
    archivedOffers: any[]
): JSX.Element => {
    return (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full'>
                {renderTableHeader(selectedTab, activeOffers, archivedOffers)}
                {sortedOffers
                    .filter(offer => {
                        const tier = getOfferTier(offer, allTiers);
                        if (selectedTab === 'active') {
                            return isOfferActive(offer, tier);
                        }
                        return isOfferArchived(offer, tier);
                    })
                    .map(offer => {
                        const tier = getOfferTier(offer, allTiers);
                        return renderOfferRow(offer, tier, handleOfferEdit);
                    })}
            </table>
        </div>
    );
};

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();

    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');

    const activeOffers = signupOffers.filter(offer => {
        const tier = getOfferTier(offer, allTiers);
        return isOfferActive(offer, tier);
    });

    const archivedOffers = signupOffers.filter(offer => {
        const tier = getOfferTier(offer, allTiers);
        return isOfferArchived(offer, tier);
    });

    const offersTabs: Tab[] = [
        {id: 'active', title: 'Active'},
        {id: 'archived', title: 'Archived'}
    ];

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(s => s.type === 'offers');

    const [selectedTab, setSelectedTab] = useState('active');

    const sortOption = offersSorting?.option ?? 'date-added';
    const sortDirection = offersSorting?.direction ?? 'desc';

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const sortedOffers = signupOffers.sort((a, b) => {
        const multiplier = sortDirection === 'desc' ? -1 : 1;
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

    const renderSortMenu = () => {
        if ((selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0)) {
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
                            setSortingState?.([{type: 'offers', option: sortOption, direction: newDirection}]);
                        }}
                        onSortChange={selectedOption => {
                            setSortingState?.([{type: 'offers', option: selectedOption, direction: sortDirection}]);
                        }}
                    />
                </div>
            );
        }
        return null;
    };

    const renderEmptyState = () => {
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
                        topRightContent={renderSortMenu()}
                        onTabChange={setSelectedTab}
                    />
                </header>
                {renderEmptyState()}
                {renderOfferList(sortedOffers, selectedTab, allTiers, handleOfferEdit, activeOffers, archivedOffers)}
            </div>
        </Modal>
    );
};