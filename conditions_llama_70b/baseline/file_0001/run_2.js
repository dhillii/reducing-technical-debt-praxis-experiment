async upload(file: File): Promise<string> {
    const url = new URL('.ghost/activitypub/v1/upload/image', this.apiUrl);
    const formData = new FormData();
    formData.append('file', file);

    const token = await this.getToken();
    const response = await this.fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });

    if (!response.ok) {
        const error: ApiError = {
            message: 'Upload failed',
            statusCode: response.status
        };

        try {
            const json = await response.json();
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

        throw error;
    }

    const json = await response.json();
    return json.fileUrl;
}