```tsx
import {
    Button,
    ButtonGroup,
    type ButtonProps,
    Icon,
    Modal,
    showToast,
    SortMenu,
    type Tab,
    TabView,
    Tooltip
} from '@tryghost/admin-x-design-system';
import {type Tier, getPaidActiveTiers, useBrowseTiers} from '@tryghost/admin-x-framework/api/tiers';
import {getHomepageUrl} from '@tryghost/admin-x-framework/api/site';
import {useBrowseOffers} from '@tryghost/admin-x-framework/api/offers';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useModal} from '@ebay/nice-modal-react';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {useSortingState} from '../../../providers/settings-app-provider';
import {useState} from 'react';
import {currencyToDecimal, getSymbol} from '../../../../utils/currency';
import {numberWithCommas} from '../../../../utils/helpers';

export type OfferType = 'percent' | 'fixed' | 'trial';

// ─── Pure Utility Functions ───────────────────────────────────────────────────

export const createRedemptionFilterUrl = (id: string): string => {
    const filterValue = `offer_redemptions:[${id}]`;
    return `/ghost/#/members?filter=${encodeURIComponent(filterValue)}`;
};

export const getOfferCadence = (cadence: string): string =>
    cadence === 'month' ? 'monthly' : 'yearly';

export const getOfferDuration = (duration: string): string => {
    const durationMap: Record<string, string> = {
        once: 'First payment',
        repeating: 'Repeating',
        forever: 'Forever'
    };
    return durationMap[duration] ?? duration;
};

const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

const formatPrice = (currency: string, amount: number): string =>
    getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)));

type DiscountResult = {
    discountColor: string;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
};

const DISCOUNT_CONFIG: Record<string, {color: string}> = {
    percent: {color: 'text-green'},
    fixed: {color: 'text-blue'},
    trial: {color: 'text-pink'}
};

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): DiscountResult => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    const discountColor = DISCOUNT_CONFIG[type]?.color ?? '';

    if (type === 'trial') {
        return {
            discountColor,
            discountOffer: `${amount} days free`,
            originalPriceWithCurrency: '',
            updatedPriceWithCurrency: formatPrice(currency, originalPrice)
        };
    }

    const discountOffer =
        type === 'percent'
            ? `${amount}% off`
            : `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`;

    const rawUpdatedPrice =
        type === 'percent'
            ? originalPrice - (originalPrice * amount) / 100
            : originalPrice - amount;

    const updatedPrice = Math.max(0, rawUpdatedPrice);

    return {
        discountColor,
        discountOffer,
        originalPriceWithCurrency: formatPrice(currency, originalPrice),
        updatedPriceWithCurrency: formatPrice(currency, updatedPrice)
    };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

export const CopyLinkButton: React.FC<{offerCode: string}> = ({offerCode}) => {
    const [isCopied, setIsCopied] = useState(false);
    const {siteData} = useGlobalData();

    const handleCopyClick = (e?: React.MouseEvent<HTMLElement, MouseEvent>) => {
        e?.stopPropagation();
        navigator.clipboard.writeText(`${getHomepageUrl(siteData!)}${offerCode}`);
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

type EmptyStateProps = {
    title?: string;
    description: string;
    buttonAction: () => void;
    buttonLabel: string;
};

export const EmptyState: React.FC<EmptyStateProps> = ({
    title = 'No offers found',
    description,
    buttonAction,
    buttonLabel
}) => (
    <div className='flex h-full grow flex-col items-center justify-center text-center'>
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='xl' />
        <h1 className='mt-6 text-2xl'>{title}</h1>
        <p className='mt-3 max-w-[420px] text-[1.6rem]'>{description}</p>
        <Button className='mt-8' color='grey' label={buttonLabel} onClick={buttonAction} />
    </div>
);

// ─── Offer Table ──────────────────────────────────────────────────────────────

type OfferRowProps = {
    offer: ReturnType<typeof useBrowseOffers>['data']['offers'][number];
    offerTier: Tier;
    onEdit: (id: string) => void;
};

const OfferRow: React.FC<OfferRowProps> = ({offer, offerTier, onEdit}) => {
    const isTierArchived = offerTier.active === false;
    const offerId = offer.id ?? '';
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type,
        offer.amount,
        offer.cadence,
        offer.currency || 'USD',
        offerTier
    );

    const cellClass = `${isTierArchived ? 'opacity-50' : ''} p-0`;
    const linkClass = `block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'}`;
    const handleEdit = !isTierArchived ? () => onEdit(offerId) : () => {};

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid='offer-item'>
            <td className={cellClass}>
                <a className={`${linkClass} p-5 pl-0`} onClick={handleEdit}>
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`${linkClass} p-5`} onClick={handleEdit}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>
                        {offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}
                    </span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`${linkClass} p-5`} onClick={handleEdit}>
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
                    className={`${linkClass} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
                    href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offerId) : undefined}
                    onClick={offer.redemption_count === 0 ? handleEdit : () => {}}
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

type OffersTableProps = {
    offers: ReturnType<typeof useBrowseOffers>['data']['offers'];
    allTiers: Tier[] | undefined;
    selectedTab: string;
    activeCount: number;
    archivedCount: number;
    onEdit: (id: string) => void;
};

const OffersTable: React.FC<OffersTableProps> = ({
    offers,
    allTiers,
    selectedTab,
    activeCount,
    archivedCount,
    onEdit
}) => {
    const count = selectedTab === 'active' ? activeCount : archivedCount;
    const hasOffers = count > 0;

    return (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full'>
                {hasOffers && (
                    <tr className='border-b border-b-grey-300 dark:border-grey-800'>
                        <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>
                            {count} {count !== 1 ? 'offers' : 'offer'}
                        </th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
                        <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700' />
                    </tr>
                )}
                {offers.map((offer) => {
                    const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
                    if (!offerTier) {
                        return null;
                    }
                    return <OfferRow key={offer.id} offer={offer} offerTier={offerTier} onEdit={onEdit} />;
                })}
            </table>
        </div>
    );
};

// ─── Sorting Helpers ──────────────────────────────────────────────────────────

type SortOption = 'date-added' | 'name' | 'redemptions';
type SortDirection = 'asc' | 'desc';

type Offer = ReturnType<typeof useBrowseOffers>['data']['offers'][number];

const sortOffers = (offers: Offer[], option: SortOption, direction: SortDirection): Offer[] => {
    const multiplier = direction === 'desc' ? -1 : 1;
    return [...offers].sort((a, b) => {
        switch (option) {
        case 'name':
            return multiplier * a.name.localeCompare(b.name);
        case 'redemptions':
            return multiplier * (a.redemption_count - b.redemption_count);
        default:
            return multiplier * (
                (a.created_at ? new Date(a.created_at).getTime() : 0) -
                (b.created_at ? new Date(b.created_at).getTime() : 0)
            );
        }
    });
};

const isOfferActive = (offer: Offer, allTiers: Tier[] | undefined): boolean => {
    const tier = allTiers?.find(t => t.id === offer?.tier?.id);
    return offer.status === 'active' && !!tier && tier.active === true;
};

const isOfferArchived = (offer: Offer, allTiers: Tier[] | undefined): boolean => {
    const tier = allTiers?.find(t => t.id === offer?.tier?.id);
    return offer.status === 'archived' || (!!tier && tier.active === false);
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

const OFFERS_TABS: Tab[] = [
    {id: 'active', title: 'Active'},
    {id: 'archived', title: 'Archived'}
];

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const {sortingState, setSortingState} = useSortingState();
    const [selectedTab, setSelectedTab] = useState('active');

    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const activeOffers = signupOffers.filter(offer => isOfferActive(offer, allTiers));
    const archivedOffers = signupOffers.filter(offer => isOfferArchived(offer, allTiers));

    const offersSorting = sortingState?.