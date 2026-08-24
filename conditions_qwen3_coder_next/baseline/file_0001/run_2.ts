if (!response.ok) {
            const error: ApiError = {
                message: 'Upload failed',
                statusCode: response.status
            };
            throw error;
        }