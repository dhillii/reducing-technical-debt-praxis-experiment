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

export const getOfferCadence = (cadence: string): string => cadence === 'month' ? 'monthly' : 'yearly';

export const getOfferDuration = (duration: string): string =>
    duration === 'once' ? 'First payment' : duration === 'repeating' ? 'Repeating' : 'Forever';

/**
 * Returns discount information for an offer.
 */
export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): {
    discountColor: string;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
} => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    let updatedPrice = originalPrice;

    const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

    const originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));

    let discountColor = '';
    let discountOffer = '';

    if (type === 'percent') {
        discountColor = 'text-green';
        discountOffer = `${amount}% off`;
        updatedPrice = originalPrice - (originalPrice * amount) / 100;
    } else if (type === 'fixed') {
        discountColor = 'text-blue';
        discountOffer = `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`;
        updatedPrice = originalPrice - amount;
    } else if (type === 'trial') {
        discountColor = 'text-pink';
        discountOffer = `${amount} days free`;
        // trial offers hide original price
        return {
            discountColor,
            discountOffer,
            originalPriceWithCurrency: '',
            updatedPriceWithCurrency: ''
        };
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
        <Button className='mt-8' color='grey' label={buttonLabel} onClick={buttonAction} />
    </div>
);

/**
 * Determines if an offer should be considered active.
 */
function isActiveOffer(offer: any, tiers: Tier[] | undefined): boolean {
    const tier = tiers?.find(t => t.id === offer?.tier?.id);
    return offer.status === 'active' && !!tier && tier.active === true;
}

/**
 * Determines if an offer should be considered archived.
 */
function isArchivedOffer(offer: any, tiers: Tier[] | undefined): boolean {
    const tier = tiers?.find(t => t.id === offer?.tier?.id);
    return offer.status === 'archived' || (tier && tier.active === false);
}

/**
 * Returns true when the header row should be displayed.
 */
function shouldShowHeader(selectedTab: string, activeCount: number, archivedCount: number): boolean {
    if (selectedTab === 'active' && activeCount > 0) {
        return true;
    }
    if (selectedTab === 'archived' && archivedCount > 0) {
        return true;
    }
    return false;
}

/**
 * Renders a single offer row.
 */
function OfferRow(props: {
    offer: any;
    tier: Tier;
    isTierArchived: boolean;
    handleOfferEdit: (id: string) => void;
}): JSX.Element {
    const {offer, tier, isTierArchived, handleOfferEdit} = props;
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        tier
    );

    const editHandler = () => handleOfferEdit(offer.id ?? '');

    const renderLink = (content: JSX.Element, href?: string, onClick?: () => void) => {
        if (isTierArchived) {
            return <span className='block p-5'>{content}</span>;
        }
        return (
            <a className='block p-5' href={href} onClick={onClick}>
                {content}
            </a>
        );
    };

    const nameCell = renderLink(
        <>
            <span className='font-semibold'>{offer?.name}</span>
            <br />
            <span className='text-sm text-grey-700'>{tier.name} {getOfferCadence(offer.cadence)}</span>
        </>,
        undefined,
        editHandler
    );

    const termsCell = renderLink(
        <>
            <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
            <br />
            <span className='text-grey-700'>
                {offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}
            </span>
        </>,
        undefined,
        editHandler
    );

    const priceCell = renderLink(
        <>
            <span className='font-medium'>{updatedPriceWithCurrency}</span>{' '}
            {offer.type !== 'trial' && originalPriceWithCurrency && (
                <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                    {originalPriceWithCurrency}
                </span>
            )}
        </>,
        undefined,
        editHandler
    );

    const redemptionHref = offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ?? '') : undefined;
    const redemptionOnClick = offer.redemption_count === 0 && !isTierArchived ? editHandler : undefined;

    const redemptionCell = renderLink(
        <span>{offer.redemption_count}</span>,
        redemptionHref,
        redemptionOnClick
    );

    const copyCell = isTierArchived ? null : <CopyLinkButton offerCode={offer.code} />;

    return (
        <tr className={`group relative border-b border-b-grey-200 dark:border-grey-800 ${isTierArchived ? 'opacity-50' : ''}`} data-testid='offer-item'>
            <td className='p-0'>{nameCell}</td>
            <td className='whitespace-nowrap p-0 text-sm'>{termsCell}</td>
            <td className='whitespace-nowrap p-0 text-sm'>{priceCell}</td>
            <td className='w-[120px] whitespace-nowrap p-0 text-sm'>{redemptionCell}</td>
            <td className='w-[120px] p-5 pr-8 text-right text-sm leading-none'>{copyCell}</td>
            {isTierArchived && (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div>
            )}
        </tr>
    );
}

/**
 * Renders the table header row when needed.
 */
function HeaderRow({selectedTab, activeCount, archivedCount}: {selectedTab: string; activeCount: number; archivedCount: number}): JSX.Element | null {
    if (!shouldShowHeader(selectedTab, activeCount, archivedCount)) {
        return null;
    }

    const count = selectedTab === 'active' ? activeCount : archivedCount;
    const label = selectedTab === 'active' ? (activeCount !== 1 ? 'offers' : 'offer') : archivedCount !== 1 ? 'offers' : 'offer';

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
}

/**
 * Renders the sort menu when applicable.
 */
function SortMenuHeader(props: {
    selectedTab: string;
    activeOffers: any[];
    archivedOffers: any[];
    sortOption: string;
    sortDirection: string;
    setSortingState: ((state: any) => void) | undefined;
}): JSX.Element | null {
    const {selectedTab, activeOffers, archivedOffers, sortOption, sortDirection, setSortingState} = props;

    const hasOffers = (selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0);
    if (!hasOffers) {
        return null;
    }

    const toggleDirection = (selectedDirection: 'asc' | 'desc') => {
        const newDirection = selectedDirection === 'asc' ? 'desc' : 'asc';
        setSortingState?.([
            {
                type: 'offers',
                option: sortOption,
                direction: newDirection
            }
        ]);
    };

    const changeSort = (selectedOption: string) => {
        setSortingState?.([
            {
                type: 'offers',
                option: selectedOption,
                direction: sortDirection as 'asc' | 'desc'
            }
        ]);
    };

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
                onDirectionChange={toggleDirection}
                onSortChange={changeSort}
            />
        </div>
    );
}

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();

    const signupOffers = allOffers.filter(o => o.redemption_type === 'signup');

    const activeOffers = signupOffers.filter(o => isActiveOffer(o, allTiers));
    const archivedOffers = signupOffers.filter(o => isArchivedOffer(o, allTiers));

    const offersTabs: Tab[] = [
        {id: 'active', title: 'Active'},
        {id: 'archived', title: 'Archived'}
    ];

    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(s => s.type === 'offers');

    const [selectedTab, setSelectedTab] = useState('active');

    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const sortedOffers = signupOffers.sort((a, b) => {
        const multiplier = sortDirection === 'desc' ? -1 : 1;
        if (sortOption === 'name') {
            return multiplier * a.name.localeCompare(b.name);
        }
        if (sortOption === 'redemptions') {
            return multiplier * (a.redemption_count - b.redemption_count);
        }
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return multiplier * (aTime - bTime);
    });

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const renderOffers = sortedOffers
        .filter(offer => {
            const tier = allTiers?.find(t => t.id === offer?.tier?.id);
            if (!tier) {
                return false;
            }
            const isActive = selectedTab === 'active' && isActiveOffer(offer, allTiers);
            const isArchived = selectedTab === 'archived' && isArchivedOffer(offer, allTiers);
            return isActive || isArchived;
        })
        .map(offer => {
            const tier = allTiers?.find(t => t.id === offer?.tier?.id);
            if (!tier) {
                return null;
            }
            const isTierArchived = tier.active === false;
            return (
                <OfferRow
                    key={offer.id}
                    offer={offer}
                    tier={tier}
                    isTierArchived={isTierArchived}
                    handleOfferEdit={handleOfferEdit}
                />
            );
        });

    const listLayoutOutput = (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full'>
                <HeaderRow selectedTab={selectedTab} activeCount={activeOffers.length} archivedCount={archivedOffers.length} />
                <tbody>{renderOffers}</tbody>
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
                    return;
                }
                updateRoute('offers/new');
            }
        }
    ];

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
                        tabs={offersTabs}
                        topRightContent={
                            <SortMenuHeader
                                selectedTab={selectedTab}
                                activeOffers={activeOffers}
                                archivedOffers={archivedOffers}
                                sortOption={sortOption}
                                sortDirection={sortDirection}
                                setSortingState={setSortingState}
                            />
                        }
                        onTabChange={setSelectedTab}
                    />
                </header>
                {selectedTab === 'active' && activeOffers.length === 0 && !isFetchingOffers && (
                    <EmptyState
                        buttonAction={() => updateRoute('offers/new')}
                        buttonLabel='Create an offer'
                        description='Grow your audience with discounts or free trials.'
                    />
                )}
                {selectedTab === 'archived' && archivedOffers.length === 0 && !isFetchingOffers && (
                    <EmptyState
                        buttonAction={() => setSelectedTab('active')}
                        buttonLabel='Back to active'
                        description='All archived offers will be shown here.'
                    />
                )}
                {listLayoutOutput}
            </div>
        </Modal>
    );
};