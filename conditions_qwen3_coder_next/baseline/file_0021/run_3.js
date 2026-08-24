if (res.ok) {
                return await res.json();
            } else {
                const humanError = await HumanReadableError.fromApiResponse(res);
                if (humanError) {
                    throw humanError;
                }