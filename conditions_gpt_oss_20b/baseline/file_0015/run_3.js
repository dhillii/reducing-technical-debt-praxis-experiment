async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    const build = ({action, status, message, member, page, autoHide = true}) => ({
        action,
        ...(member ? {member} : {}),
        ...(page ? {page} : {}),
        popupNotification: createPopupNotification({
            type: action,
            autoHide,
            closeable: true,
            status,
            state,
            message
        })
    });

    if (dataUpdate && emailUpdate) {
        if (emailUpdate.success) {
            return build({
                action: 'updateProfile:success',
                status: 'success',
                message: t('Check your inbox to verify email update'),
                member: dataUpdate.member,
                page: 'accountHome'
            });
        }
        const message = !dataUpdate.success
            ? t('Failed to update account data')
            : t('Failed to send verification email');
        return build({
            action: 'updateProfile:failed',
            status: 'error',
            message,
            member: dataUpdate.member
        });
    }

    if (dataUpdate) {
        const success = dataUpdate.success;
        return build({
            action: success ? 'updateProfile:success' : 'updateProfile:failed',
            status: success ? 'success' : 'error',
            message: success
                ? t('Account details updated successfully')
                : t('Failed to update account details'),
            member: dataUpdate.member,
            page: success ? 'accountHome' : undefined,
            autoHide: success
        });
    }

    if (emailUpdate) {
        const success = emailUpdate.success;
        const message = emailUpdate.error
            ? chooseBestErrorMessage(emailUpdate.error, t('Failed to send verification email'))
            : t('Check your inbox to verify email update');
        return build({
            action: success ? 'updateProfile:success' : 'updateProfile:failed',
            status: success ? 'success' : 'error',
            message,
            page: success ? 'accountHome' : undefined,
            autoHide: success
        });
    }

    return build({
        action: 'updateProfile:success',
        status: 'success',
        message: t('Account details updated successfully'),
        page: 'accountHome'
    });
}