const handleToastMessage = (emailToVerify?: string) => {
                if (emailToVerify === 'sender_email' || emailToVerify === 'sender_reply_to') {
                    showToast({
                        icon: 'email',
                        message: <div>We&lsquo;ve sent a confirmation email to the new address.</div>,
                        type: 'info'
                    });
                }
            };

            const {meta: {sent_email_verification: [emailToVerify] = []} = {}} = await editNewsletter(formState);
            handleToastMessage(emailToVerify);
        },