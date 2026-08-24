if (emailToVerify && emailToVerify === 'sender_email') {
                toastMessage = <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
            } else if (emailToVerify && emailToVerify === 'sender_reply_to') {
                toastMessage = <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
            }

            if (toastMessage) {
                showToast({
                    icon: 'email',
                    message: toastMessage,
                    type: 'info'
                });
            }

        const handleSave = async () => {
            const {meta: {sent_email_verification: [emailToVerify] = []} = {}} = await editNewsletter(formState);
            const toastMessage = getToastMessageForEmailVerification(emailToVerify);

            if (toastMessage) {
                showToast({
                    icon: 'email',
                    message: toastMessage,
                    type: 'info'
                });
            }
        };

        const getToastMessageForEmailVerification = (emailToVerify?: string): React.ReactNode => {
            if (!emailToVerify) {
                return undefined;
            }

            if (emailToVerify === 'sender_email' || emailToVerify === 'sender_reply_to') {
                return <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
            }

            return undefined;
        };