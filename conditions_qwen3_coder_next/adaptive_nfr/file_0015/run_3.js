async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([updateMemberData({data, state, api}), updateMemberEmail({data, state, api})]);

    if (!dataUpdate && !emailUpdate) {
        return createSuccessUpdateProfileNotification({state});
    }

    if (dataUpdate && emailUpdate) {
        if (emailUpdate.success) {
            return createProfileUpdateSuccessWithVerification({
                state,
                member: dataUpdate.member
            });
        }

        return createProfileUpdateFailure({
            state,
            dataUpdate,
            emailUpdate
        });
    }

    if (dataUpdate) {
        return handleDataUpdateOnly({state, dataUpdate});
    }

    return handleEmailUpdateOnly({state, emailUpdate});
}

function createSuccessUpdateProfileNotification({state}) {
    return {
        action: 'updateProfile:success',
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success',
            autoHide: true,
            closeable: true,
            status: 'success',
            state,
            message: t('Account details updated successfully')
        })
    };
}

function createProfileUpdateSuccessWithVerification({state, member}) {
    return {
        action: 'updateProfile:success',
        ...(member ? {member} : {}),
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success',
            autoHide: true,
            closeable: true,
            status: 'success',
            state,
            message: t('Check your inbox to verify email update')
        })
    };
}

function createProfileUpdateFailure({state, dataUpdate, emailUpdate}) {
    const message = !dataUpdate.success ? t('Failed to update account data') : t('Failed to send verification email');
    return {
        action: 'updateProfile:failed',
        ...(dataUpdate.member ? {member: dataUpdate.member} : {}),
        popupNotification: createPopupNotification({
            type: 'updateProfile:failed',
            autoHide: true,
            closeable: true,
            status: 'error',
            message,
            state
        })
    };
}

function handleDataUpdateOnly({state, dataUpdate}) {
    const action = dataUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
    const status = dataUpdate.success ? 'success' : 'error';
    const message = !dataUpdate.success ? t('Failed to update account details') : t('Account details updated successfully');

    return {
        action,
        ...(dataUpdate.success ? {member: dataUpdate.member, page: 'accountHome'} : {}),
        popupNotification: createPopupNotification({
            type: action,
            autoHide: dataUpdate.success,
            closeable: true,
            status,
            state,
            message
        })
    };
}

function handleEmailUpdateOnly({state, emailUpdate}) {
    const action = emailUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
    const status = emailUpdate.success ? 'success' : 'error';
    let message = '';

    if (emailUpdate.error) {
        message = chooseBestErrorMessage(emailUpdate.error, t('Failed to send verification email'));
    } else {
        message = t('Check your inbox to verify email update');
    }

    return {
        action,
        ...(emailUpdate.success ? {page: 'accountHome'} : {}),
        popupNotification: createPopupNotification({
            type: action,
            autoHide: emailUpdate.success,
            closeable: true,
            status,
            state,
            message
        })
    };
}