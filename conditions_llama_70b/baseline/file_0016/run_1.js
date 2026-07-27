function FreeProductCard({ products, handleChooseSignup, error }) {
    const { site, action } = useContext(AppContext);
    const { selectedProduct, setSelectedProduct } = useContext(ProductsContext);

    const product = getFreeProduct({ site });
    const freeProductDescription = getFreeTierDescription({ site });
    const freeBenefits = getFreeProductBenefits({ site });
    const hasOnlyFree = hasOnlyFreeProduct({ site });

    const disabled = (action === 'signup:running') || isCookiesDisabled();

    const cardClass = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';

    if (hasOnlyFree && (!freeProductDescription && !freeBenefits.length)) {
        return null;
    }

    if (!freeProductDescription && !freeBenefits.length) {
        freeProductDescription = 'Free preview';
    }

    const renderProductCardHeader = () => {
        if (hasOnlyFree) {
            return (
                <div className='gh-portal-product-card-header'>
                    <h4 className="gh-portal-product-name">{getFreeTierTitle({ site })}</h4>
                </div>
            );
        } else {
            return (
                <div className='gh-portal-product-card-header'>
                    <h4 className="gh-portal-product-name">{getFreeTierTitle({ site })}</h4>
                    <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                        <div className="gh-portal-product-price">
                            <span className={'currency-sign'}>$</span>
                            <span className="amount" data-testid="product-amount">0</span>
                        </div>
                    </div>
                </div>
            );
        }
    };

    const renderProductCardDetails = () => {
        if (hasOnlyFree) {
            return (
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {freeProductDescription ? <div className="gh-portal-product-description" data-testid="product-description">{freeProductDescription}</div> : ''}
                        <ProductBenefitsContainer product={product} />
                    </div>
                </div>
            );
        } else {
            return (
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {freeProductDescription ? <div className="gh-portal-product-description" data-testid="product-description">{freeProductDescription}</div> : ''}
                        <ProductBenefitsContainer product={product} />
                    </div>
                    <div className='gh-portal-btn-product'>
                        <button
                            data-test-button='select-tier'
                            className='gh-portal-btn'
                            disabled={disabled}
                            onClick={(e) => {
                                handleChooseSignup(e, 'free');
                            }}>
                            {((selectedProduct === 'free' && disabled) ? <LoaderIcon className='gh-portal-loadingicon' /> : t('Choose'))}
                        </button>
                        {error && <div className="gh-portal-error-message">{error}</div>}
                    </div>
                </div>
            );
        }
    };

    return (
        <>
            <div className={cardClass + (hasOnlyFree ? ' only-free' : '')} onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct('free');
            }} data-test-tier="free">
                {renderProductCardHeader()}
                {renderProductCardDetails()}
            </div>
        </>
    );
}