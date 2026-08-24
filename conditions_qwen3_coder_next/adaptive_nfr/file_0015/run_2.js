async function updateMemberData({data, state, api}) {
    const name = data?.name?.trim();
    const originalName = getMemberName({member: state.member});

    if (originalName === name) {
        return null;
    }

    try {
        const member = await api.member.update({name});
        if (!member) {
            throw new Error('Failed to update member');
        }
        return {
            member,
            success: true
        };
    } catch (err) {
        return {
            success: false,
            error: err
        };
    }
}

async function updateMemberEmail({data, state, api}) {
    const {email} = data;
    const originalEmail = getMemberEmail({member: state.member});

    if (email === originalEmail) {
        return null;
    }

    try {
        await api.member.updateEmailAddress({email});
        return {
            success: true
        };
    } catch (err) {
        return {
            success: false,
            error: err
        };
    }
}

/**
 * Determines if both updates completed successfully
 * @param {Object} dataUpdate
 * @param {Object} emailUpdate
 * @returns {boolean}
 */
function bothUpdatesSuccessful(dataUpdate, emailUpdate) {
    return dataUpdate && emailUpdate && emailUpdate.success;
}

/**
 * Determines if only data update exists
 * @param {Object} dataUpdate
 * @param {Object} emailUpdate
 * @returns {boolean}
 */
function onlyDataUpdateExists(dataUpdate, emailUpdate) {
    return dataUpdate && !emailUpdate;
}

/**
 * Determines if only email update exists
 * @param {Object} dataUpdate
 * @param {Object} emailUpdate
 * @returns {boolean}
 */
function onlyEmailUpdateExists(dataUpdate, emailUpdate) {
    return emailUpdate && !dataUpdate;
}

/**
 * Determines if neither update occurred
 * @param {Object} dataUpdate
 * @param {Object} emailUpdate
 * @returns {boolean}
 */
function noUpdatesOccurred(dataUpdate, emailUpdate) {
    return !dataUpdate && !emailUpdate;
}

/**
 * Creates notification for profile update success with email verification step
 */
function createEmailVerificationSuccessNotification(state) {
    return createPopupNotification({
        type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
        message: t('Check your inbox to verify email update')
    });
}

/**
 * Creates notification for profile update failure
 * @param {Object} dataUpdate
 * @param {Object} emailUpdate
 * @param {Object} state
 * @returns {Object}
 */
function createFailureNotification(dataUpdate, emailUpdate, state) {
    const message = !dataUpdate.success ? t('Failed to update account data') : t('Failed to send verification email');
    return createPopupNotification({
        type: 'updateProfile:failed', autoHide: true, closeable: true, status: 'error', message, state
    });
}

/**
 * Creates notification for data-only profile update success
 */
function createDataUpdateSuccessNotification(member, state) {
    return {
        action: 'updateProfile:success',
        ...(member ? {member} : {}),
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
            message: t('Account details updated successfully')
        })
    };
}

/**
 * Creates notification for data-only profile update failure
 * @param {Object} dataUpdate
 * @param {Object} state
 * @returns {Object}
 */
function createDataUpdateFailureNotification(dataUpdate, state) {
    return {
        action: 'updateProfile:failed',
        ...(dataUpdate.member ? {member: dataUpdate.member} : {}),
        popupNotification: createPopupNotification({
            type: 'updateProfile:failed', autoHide: true, closeable: true, status: 'error',
            message: t('Failed to update account details'), state
        })
    };
}

/**
 * Creates notification for email-only profile update success
 * @param {Object} emailUpdate
 * @param {Object} state
 * @returns {Object}
 */
function createEmailUpdateSuccessNotification(emailUpdate, state) {
    return {
        action: 'updateProfile:success',
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success', autoHide: emailUpdate.success, closeable: true, status: 'success', state,
            message: t('Check your inbox to verify email update')
        })
    };
}

/**
 * Creates notification for email-only profile update failure
 * @param {Object} emailUpdate
 * @param {Object} state
 * @returns {Object}
 */
function createEmailUpdateFailureNotification(emailUpdate, state) {
    const message = emailUpdate.error ? chooseBestErrorMessage(emailUpdate.error, t('Failed to send verification email')) : t('Check your inbox to verify email update');
    return {
        action: 'updateProfile:failed',
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:failed', autoHide: emailUpdate.success, closeable: true, status: 'error', message, state
        })
    };
}

/**
 * Handles updateProfile action by coordinating member data and email updates
 * @param {Object} params
 * @param {Object} params.data
 * @param {Object} params.state
 * @param {Object} params.api
 * @returns {Promise<Object>}
 */
async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    if (bothUpdatesSuccessful(dataUpdate, emailUpdate)) {
        return {
            action: 'updateProfile:success',
            ...(dataUpdate.member ? {member: dataUpdate.member} : {}),
            page: 'accountHome',
            popupNotification: createEmailVerificationSuccessNotification(state)
        };
    }

    if (onlyDataUpdateExists(dataUpdate, emailUpdate)) {
        if (dataUpdate.success) {
            return createDataUpdateSuccessNotification(dataUpdate.member, state);
        }
        return createDataUpdateFailureNotification(dataUpdate, state);
    }

    if (onlyEmailUpdateExists(dataUpdate, emailUpdate)) {
        if (emailUpdate.success) {
            return createEmailUpdateSuccessNotification(emailUpdate, state);
        }
        return createEmailUpdateFailureNotification(emailUpdate, state);
    }

    if (noUpdatesOccurred(dataUpdate, emailUpdate)) {
        return {
            action: 'updateProfile:success',
            page: 'accountHome',
            popupNotification: createPopupNotification({
                type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
                message: t('Account details updated successfully')
            })
        };
    }

    return {};
}