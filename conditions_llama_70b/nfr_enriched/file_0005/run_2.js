// ...

const getToastMessage = (emailToVerify: string | undefined): JSX.Element | undefined => {
    // Extracted function to get toast message based on emailToVerify
    if (emailToVerify === 'sender_email' || emailToVerify === 'sender_reply_to') {
        return <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
    }
    return undefined;
};

const NewsletterDetailModalContent: React.FC<{newsletter: Newsletter; onlyOne: boolean;}> = ({newsletter, onlyOne}) => {
    // ...

    const {formState, saveState, updateForm, setFormState, handleSave, validate, errors, clearError, okProps} = useForm({
        // ...
        onSave: async () => {
            const {meta: {sent_email_verification: [emailToVerify] = []} = {}} = await editNewsletter(formState);
            const toastMessage = getToastMessage(emailToVerify);

            if (toastMessage) {
                showToast({
                    icon: 'email',
                    message: toastMessage,
                    type: 'info'
                });
            }
        },
        // ...
    });

    // ...
};

// ...