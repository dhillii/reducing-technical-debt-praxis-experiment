function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const isFreeProductSelected = () => selectedProduct === 'free';
    const isDisabled = () => action === 'signup:running' || isCookiesDisabled();

    const getFreeProductDescription = () => {
        const freeProductDescription = getFreeTierDescription({site});
        return freeProductDescription || 'Free preview';
    };

    const getFreeProductBenefits = () => getFreeProductBenefits({site});

    const getCurrencySymbol = () => {
        if (products && products[1]) {
            return getCurrencySymbol(products[1].monthlyPrice.currency);
        }
        return '$';
    };

    const hasOnlyFreeProduct = hasOnlyFreeProduct({site});

    const cardClass = isFreeProductSelected() ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    if (hasOnlyFreeProduct) {
        cardClass += ' only-free';
    }

    return (
        <>
            <div className={cardClass} onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct('free');
            }} data-test-tier="free">
                <div className='gh-portal-product-card-header'>
                    <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                    {!hasOnlyFreeProduct && (
                        <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                            <div className="gh-portal-product-price">
                                <span className={'currency-sign' + (getCurrencySymbol().length > 1 ? ' long' : '')}>{getCurrencySymbol()}</span>
                                <span className="amount" data-testid="product-amount">0</span>
                            </div>
                        </div>
                    )}
                </div>
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {getFreeProductDescription() && (
                            <div className="gh-portal-product-description" data-testid="product-description">
                                {getFreeProductDescription()}
                            </div>
                        )}
                        <ProductBenefitsContainer product={getFreeProduct({site})} />
                    </div>
                    {!hasOnlyFreeProduct && (
                        <div className='gh-portal-btn-product'>
                            <button
                                data-test-button='select-tier'
                                className='gh-portal-btn'
                                disabled={isDisabled()}
                                onClick={(e) => {
                                    handleChooseSignup(e, 'free');
                                }}>
                                {isDisabled() ? <LoaderIcon className='gh-portal-loadingicon' /> : t('Choose')}
                            </button>
                            {error && <div className="gh-portal-error-message">{error}</div>}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}