```typescript
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

/** @internal Formats number to two decimal places */
const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

/** @internal Calculates percent discount amount */
const calculatePercentDiscount = (originalPrice: number, amount: number): number => {
    return originalPrice - ((originalPrice * amount) / 100);
};

/** @internal Calculates fixed discount amount */
const calculateFixedDiscount = (originalPrice: number, amount: number): number => {
    return originalPrice - amount;
};

/** @internal Ensures price is not negative */
const ensureNonNegativePrice = (price: number): number => {
    return price < 0 ? 0 : price;
};

/** @internal Builds discount result for percent type */
const buildPercentDiscountResult = (amount: number, originalPrice: number, currency: string) => {
    const updatedPrice = calculatePercentDiscount(originalPrice, amount);
    return {
        discountColor: 'text-green',
        discountOffer: amount + '% off',
        updatedPrice: ensureNonNegativePrice(updatedPrice),
        originalPriceWithCurrency: getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)))
    };
};

/** @internal Builds discount result for fixed type */
const buildFixedDiscountResult = (amount: number, originalPrice: number, currency: string) => {
    const updatedPrice = calculateFixedDiscount(originalPrice, amount);
    return {
        discountColor: 'text-blue',
        discountOffer: numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount))) + ' ' + currency + ' off',
        updatedPrice: ensureNonNegativePrice(updatedPrice),
        originalPriceWithCurrency: getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)))
    };
};

/** @internal Builds discount result for trial type */
const buildTrialDiscountResult = (amount: number) => {
    return {
        discountColor: 'text-pink',
        discountOffer: amount + ' days free',
        updatedPrice: 0,
        originalPriceWithCurrency: ''
    };
};

export const getOfferDiscount = (type: string, amount: number, cadence: string, currency: string, tier: Tier | undefined): {discountColor: string, discountOffer: string, originalPriceWithCurrency: string, updatedPriceWithCurrency: string} => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;

    let result;
    switch (type) {
    case 'percent':
        result = buildPercentDiscountResult(amount, originalPrice, currency);
        break;
    case 'fixed':
        result = buildFixedDiscountResult(amount, originalPrice, currency);
        break;
    case 'trial':
        result = buildTrialDiscountResult(amount);
        break;
    default:
        result = {
            discountColor: '',
            discountOffer: '',
            updatedPrice: originalPrice,
            originalPriceWithCurrency: getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)))
        };
    }

    const updatedPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(result.updatedPrice)));

    return {
        discountColor: result.discountColor,
        discountOffer: result.discountOffer,
        originalPriceWithCurrency: result.originalPriceWithCurrency,
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

/** @internal Checks if offer tier exists and is active */
const isOfferTierActive = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offerTier?.active === true;
};

/** @internal Checks if offer is in active status and tier is active */
const isActiveOffer = (offer: any, allTiers: Tier[] | undefined): boolean => {
    return offer.status === 'active' && isOfferTierActive(offer, allTiers);
};

/** @internal Checks if offer is archived or tier is archived */
const isArchivedOffer = (offer: any, allTiers: Tier[] | undefined): boolean => {
    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
    return offer.status === 'archived' || (offerTier && offerTier.active === false);
};

/** @internal Checks if offer matches selected tab filter */
const offerMatchesTabFilter = (offer: any, selectedTab: string, allTiers: Tier[] | undefined): boolean => {
    if (selectedTab === 'active') {
        return isActiveOffer(offer, allTiers);
    }
    return isArchivedOffer(offer, allTiers);
};

/** @internal Gets plural form of 'offer' */
const getOfferCountLabel = (count: number): string => {
    return count !== 1 ? 'offers' : 'offer';
};

/** @internal Builds sort comparison for offers */
const buildOfferSortComparison = (offer1: any, offer2: any, sortOption: string, multiplier: number): number => {
    switch (sortOption) {
    case 'name':
        return multiplier * offer1.name.localeCompare(offer2.name);
    case 'redemptions':
        return multiplier * (offer1.redemption_count - offer2.redemption_count);
    default:
        return multiplier * ((offer1.created_at ? new Date(offer1.created_at).getTime() : 0) - (offer2.created_at ? new Date(offer2.created_at).getTime() : 0));
    }
};

/** @internal Renders offer table header */
const renderOfferTableHeader = (selectedTab: string, activeOffers: any[], archivedOffers: any[]): React.ReactNode => {
    const shouldShowHeader = (selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0);
    
    if (!shouldShowHeader) {
        return null;
    }

    const offerList = selectedTab === 'active' ? activeOffers : archivedOffers;
    const countLabel = getOfferCountLabel(offerList.length);

    return (
        <tr className='border-b border-b-grey-300 dark:border-grey-800'>
            <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>{offerList.length} {countLabel}</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
            <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
        </tr>
    );
};

/** @internal Renders offer table row */
const renderOfferTableRow = (offer: any, offerTier: Tier, isTierArchived: boolean, handleOfferEdit: (id: string) => void): React.ReactNode => {
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier);
    const opacityClass = isTierArchived ? 'opacity-50' : '';
    const cursorClass = isTierArchived ? 'cursor-default select-none' : 'cursor-pointer';
    const offerId = offer?.id ? offer.id : '';

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${opacityClass} p-0`}><a className={`block ${cursorClass} p-5 pl-0`} onClick={!isTierArchived ? () => handleOfferEdit(offerId) : () => {}}><span className='font-semibold'>{offer?.name}</span><br /><span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span></a></td>
            <td className={`${opacityClass} whitespace-nowrap p-0 text-sm`}><a className={`block ${cursorClass} p-5`} onClick={!isTierArchived ? () => handleOfferEdit(offerId) : () => {}}><span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span><br /><span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span></a></td>
            <td className={`${opacityClass} whitespace-nowrap p-0 text-sm`}><a className={`block ${cursorClass} p-5`} onClick={!isTierArchived ? () => handleOfferEdit(offerId) : () => {}}><span className='font-medium'>{updatedPriceWithCurrency}</span> {offer.type !== 'trial' ? <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>{originalPriceWithCurrency}</span> : null}</a></td>
            <td className={`${opacityClass} w-[120px] whitespace-nowrap p-0 text-sm`}><a className={`block ${cursorClass} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`} href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ? offer.id : '') : undefined} onClick={offer.redemption_count === 0 ? !isTierArchived ? () => handleOfferEdit(offerId) : () => {} : () => {}}>{offer.redemption_count}</a></td>
            <td className={`${opacityClass} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>{!isTierArchived ? <CopyLinkButton offerCode={offer.code} /> : null}</td>
            {isTierArchived ?
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>This offer is disabled, because <br /> it is tied to an archived tier.</div> :
                null
            }
        </tr>
    );
};

/** @internal Renders sort menu when offers exist */
const renderSortMenu = (selectedTab: string, activeOffers: any[], archivedOffers: any[], sortOption: string, sortDirection: string, setSortingState: any): React.ReactNode => {
    const shouldShowSort = (selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0);
    
    if (!shouldShowSort) {
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

/** @internal Renders empty state for active tab */
const renderActiveEmptyState = (selectedTab: string, activeOffers: any[], isFetchingOffers: boolean, updateRoute: any): React.ReactNode => {
    if (selectedTab !== 'active' || activeOffers.length > 0 || isFetchingOffers) {
        return null;
    }

    return (
        <EmptyState
            buttonAction={() => updateRoute('offers/new')}
            buttonLabel='Create an offer'
            description='Grow your audience with discounts or free trials.'
        />
    );
};

/** @internal Renders empty state for archived tab */
const renderArchivedEmptyState = (selectedTab: string, archivedOffers: any[], isFetchingOffers: boolean, setSelectedTab: any): React.ReactNode => {
    if (selectedTab !== 'archived' || archivedOffers.length > 0 || isFetchingOffers) {
        return null;
    }

    return (
        <EmptyState
            buttonAction={() => setSelectedTab('active')}
            buttonLabel='Back to active'
            description='All archived offers will be shown here.'
        />
    );
};

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const activeOffers = signupOffers.filter((offer) => isActiveOffer(offer, allTiers));
    const archivedOffers = signupOffers.filter((offer) => isArchivedOffer(offer, allTiers));

    let offersTabs: Tab[] = [
        {id: 'active', title: 'Active'},
        {id: 'archived', title: 'Archived'}
    ];

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');

    const [selectedTab, setSelectedTab] = useState('active');

    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const handleOfferEdit = (id:string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const sortedOffers = signupOffers
        .sort((offer1, offer2) => {
            const multiplier = sortDirection === 'desc' ? -1 : 1;
            return buildOfferSortComparison(offer1, offer2, sortOption, multiplier);
        });

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const listLayoutOutput = <div className='overflow-x-auto'>
        <table className='m-0 w-full'>
            {renderOfferTableHeader(selectedTab, activeOffers, archivedOffers)}
            {sortedOffers.filter((offer) => offerMatchesTabFilter(offer, selectedTab, allTiers)).map((offer) => {
                const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);

                if (!offerTier) {
                    return null;
                }

                const isTierArchived = offerTier?.active === false;

                return renderOfferTableRow(offer, offerTier, isTierArchived, handleOfferEdit);
            })}
        </table>
    </div>;

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
                    topRightContent={renderSortMenu(selectedTab, activeOffers, archivedOffers, sortOption, sortDirection, setSortingState)}
                    onTabChange={setSelectedTab}
                />
            </header>
            {renderActiveEmptyState(selectedTab, activeOffers, isFetchingOffers, updateRoute)}
            {renderArchivedEmptyState(selectedTab, archivedOffers, isFetchingOffers, setSelectedTab)}
            {listLayoutOutput}
        </div>
    </Modal>;
};
```