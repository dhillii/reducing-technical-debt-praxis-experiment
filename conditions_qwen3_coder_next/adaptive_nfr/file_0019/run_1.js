<div className='gh-portal-signup-logo' src={siteIcon} alt={site.title} />
            );
        }

        if (!hasAvailablePrices({site, pageQuery}) || isInviteOnly({site}) || !isSignupAllowed({site})) {
            return (
                <InvitationIcon className='gh-portal-icon gh-portal-icon-invitation' />
            );
        }

        return null;
    }

    renderFormHeader() {
        const {site} = this.context;
        const siteTitle = site.title || '';
        return (
            <header className='gh-portal-signup-header'>
                {this.renderSiteIcon()}
                <h1 className="gh-portal-main-title" data-testid='site-title-text'>{siteTitle}</h1>
            </header>
        );
    }

    /**
     * @param {string} type conditional type to dispatch
     * @returns {Function} handler function for the type
     */
    getFormTypeHandler(type) {
        const handlers = {
            'inviteOnly': () => this.renderInviteOnlyMessage(),
            'paidMembersOnlyFree': () => this.renderPaidMembersOnlyMessage(),
            'notSignupableNoPricesNoSignin': () => this.renderMembersDisabledMessage(),
            'notSignupableNoPrices': () => this.renderInviteOnlyMessage(),
            'normal': () => null
        };

        return handlers[type] || handlers.normal;
    }

    /**
     * @param {string} type conditional type to dispatch
     * @param {JSX.Element} fallback fallback if no handler present
     * @returns {JSX.Element} rendered content
     */
    renderConditionalFormContent(type, fallback = null) {
        const handler = this.getFormTypeHandler(type);
        return handler() || fallback;
    }

    renderForm() {
        const fields = this.getInputFields({state: this.state});
        const {site, pageQuery} = this.context;

        if (this.state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => {
                        this.setState({
                            showNewsletterSelection: false
                        });
                    }}
                />
            );
        }

        const isInviteOnlyCase = isInviteOnly({site});
        const isPaidMembersOnlyFree = isPaidMembersOnly({site}) && pageQuery === 'free';
        const notSignupable = !isSignupAllowed({site}) || !hasAvailablePrices({site, pageQuery});
        const noSignin = !isSigninAllowed({site});
        const notSignupableNoPricesNoSignin = notSignupable && noSignin;
        const notSignupableNoPrices = notSignupable && !noSignin;

        let formContent = null;

        if (isInviteOnlyCase) {
            formContent = this.renderConditionalFormContent('inviteOnly');
        } else if (isPaidMembersOnlyFree) {
            formContent = this.renderConditionalFormContent('paidMembersOnlyFree');
        } else if (notSignupableNoPricesNoSignin) {
            formContent = this.renderConditionalFormContent('notSignupableNoPricesNoSignin');
        } else if (notSignupableNoPrices) {
            formContent = this.renderConditionalFormContent('notSignupableNoPrices');
        }

        if (formContent) {
            return formContent;
        }

        const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
        const hasOnlyFree = hasOnlyFreePlan({site}) || showOnlyFree;

        const signupTerms = this.renderSignupTerms();

        return (
            <section className="gh-portal-signup">
                <div className='gh-portal-section'>
                    <div className='gh-portal-logged-out-form-container'>
                        <InputForm
                            fields={fields}
                            onChange={(e, field) => this.handleInputChange(e, field)}
                            onKeyDown={e => this.onKeyDown(e)}
                        />
                    </div>
                    <div>
                        {(hasOnlyFree ?
                            <>
                                {this.renderProducts()}
                                {signupTerms &&
                                <div className='gh-portal-signup-terms-wrapper free-only'>
                                    {signupTerms}
                                </div>
                                }
                            </> :
                            <>
                                {signupTerms &&
                                <div className='gh-portal-signup-terms-wrapper'>
                                    {signupTerms}
                                </div>
                                }
                                {this.renderProducts()}
                            </>)}

                        {(hasOnlyFree ?
                            <div className='gh-portal-btn-container'>
                                <div className='gh-portal-logged-out-form-container'>
                                    {this.renderSubmitButton()}
                                    {this.renderLoginMessage()}
                                </div>
                            </div>
                            :
                            this.renderLoginMessage())}
                    </div>
                </div>
            </section>
        );
    }

    renderPaidMembersOnlyMessage() {
        return (
            <section>
                <div className='gh-portal-section'>
                    <p
                        className='gh-portal-paid-members-only-notification'
                        data-testid="paid-members-only-notification-text"
                    >
                        {t('This site only accepts paid members.')}
                    </p>
                    {this.renderLoginMessage()}
                </div>
            </section>
        );
    }

    renderInviteOnlyMessage() {
        return (
            <section>
                <div className='gh-portal-section'>
                    <p
                        className='gh-portal-invite-only-notification'
                        data-testid="invite-only-notification-text"
                    >
                        {t('This site is invite-only, contact the owner for access.')}
                    </p>
                    {this.renderLoginMessage()}
                </div>
            </section>
        );
    }

    renderMembersDisabledMessage() {
        return (
            <section>
                <div className='gh-portal-section'>
                    <p
                        className='gh-portal-members-disabled-notification'
                        data-testid="members-disabled-notification-text"
                    >
                        {t('Memberships unavailable, contact the owner for access.')}
                    </p>
                </div>
            </section>
        );
    }

    renderSiteIcon() {
        const {site, pageQuery} = this.context;
        const siteIcon = site.icon;

        if (siteIcon) {
            return (
                <img className='gh-portal-signup-logo' src={siteIcon} alt={site.title} />
            );
        }

        if (!hasAvailablePrices({site, pageQuery}) || isInviteOnly({site}) || !isSignupAllowed({site})) {
            return (
                <InvitationIcon className='gh-portal-icon gh-portal-icon-invitation' />
            );
        }

        return null;
    }

    renderFormHeader() {
        const {site} = this.context;
        const siteTitle = site.title || '';
        return (
            <header className='gh-portal-signup-header'>
                {this.renderSiteIcon()}
                <h1 className="gh-portal-main-title" data-testid='site-title-text'>{siteTitle}</h1>
            </header>
        );
    }

    getClassNames() {
        const {site, pageQuery} = this.context;
        const plansData = getSitePrices({site, pageQuery});
        const fields = this.getInputFields({state: this.state});
        let sectionClass = '';
        let footerClass = '';

        if (plansData.length <= 1 || isInviteOnly({site})) {
            if ((plansData.length === 1 && plansData[0].type === 'free') || isInviteOnly({site, pageQuery})) {
                sectionClass = freeHasBenefitsOrDescription({site}) ? 'singleplan' : 'noplan';
                if (fields.length === 1) {
                    sectionClass = 'single-field';
                }
                if (isInviteOnly({site})) {
                    footerClass = 'invite-only';
                    sectionClass = 'invite-only';
                }
            } else {
                sectionClass = 'singleplan';
            }
        }

        return {sectionClass, footerClass};
    }

    render() {
        let {sectionClass} = this.getClassNames();
        return (
            <>
                <div className='gh-portal-back-sitetitle'>
                    <SiteTitleBackButton
                        onBack={() => {
                            if (this.state.showNewsletterSelection) {
                                this.setState({
                                    showNewsletterSelection: false
                                });
                            } else {
                                this.context.doAction('closePopup');
                            }
                        }}
                    />
                </div>
                <CloseButton />
                <div className={'gh-portal-content signup ' + sectionClass}>
                    {this.renderFormHeader()}
                    {this.renderForm()}
                </div>
            </>
        );
    }
}

export default SignupPage;