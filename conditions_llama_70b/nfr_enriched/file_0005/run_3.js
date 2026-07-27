// Extracted function to handle email verification toast messages
const handleEmailVerificationToast = (emailToVerify: string | undefined) => {
    let toastMessage;

    if (emailToVerify === 'sender_email' || emailToVerify === 'sender_reply_to') {
        toastMessage = <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
    }

    if (toastMessage) {
        showToast({
            icon: 'email',
            message: toastMessage,
            type: 'info'
        });
    }
};

// ...

const NewsletterDetailModalContent: React.FC<{newsletter: Newsletter; onlyOne: boolean;}> = ({newsletter, onlyOne}) => {
    // ...

    const {formState, saveState, updateForm, setFormState, handleSave, validate, errors, clearError, okProps} = useForm({
        initialState: newsletter,
        savingDelay: 500,
        onSave: async () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            const {meta: {sent_email_verification: [emailToVerify] = []} = {}} = await editNewsletter(formState); 

            handleEmailVerificationToast(emailToVerify);
        },
        // ...
    });

    // ...
};