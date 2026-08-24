if (!response.ok) {
            throw this.createUploadError(response);
        }

        const json = await response.json();
        return json.fileUrl;
    }

    private createUploadError(response: Response): ApiError {
        const error: ApiError = {
            message: 'Upload failed',
            statusCode: response.status
        };

        try {
            const json = response.json() as Promise<Record<string, string>>;
            const errorMessage = json.message || json.error;

            if (errorMessage) {
                error.message = errorMessage;
            }

            if (json.code) {
                error.code = json.code;
            }
        } catch {
            // Leave the default message
        }

        return error;
    }