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

    async enableBluesky() {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/enable', this.apiUrl);

        await this.fetchJSON(url, 'POST');
    }

    async disableBluesky() {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/disable', this.apiUrl);

        await this.fetchJSON(url, 'POST');
    }

    async confirmBlueskyHandle(): Promise<string> {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/confirm-handle', this.apiUrl);

        const json = await this.fetchJSON(url, 'POST');

        if (json === null || !('handle' in json) || typeof json.handle !== 'string') {
            return '';
        }

        return String(json.handle);
    }
}