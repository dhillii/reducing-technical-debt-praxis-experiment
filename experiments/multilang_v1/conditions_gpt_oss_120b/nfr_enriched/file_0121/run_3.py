def handleStatus_200(self):
        # This method is intentionally left empty because the base HTTPPageGetter
        # does not need to perform any special actions for a 200 OK response.
        # Subclasses such as HTTPPageDownloader override this method to implement
        # response handling (e.g., start transmitting the page). Keeping the
        # method defined (even as a no‑op) allows the generic status‑dispatch
        # logic in handleEndHeaders to call it safely.