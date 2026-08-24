if (res.ok) {
                return res.json();
            } else {
                const humanError = await HumanReadableError.fromApiResponse(res);
                if (humanError) {
                    throw humanError;
                }