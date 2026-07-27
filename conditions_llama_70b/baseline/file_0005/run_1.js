if (emailToVerify && ['sender_email', 'sender_reply_to'].includes(emailToVerify)) {
    toastMessage = <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
}