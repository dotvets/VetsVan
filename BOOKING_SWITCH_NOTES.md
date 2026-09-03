# Booking source switch

This branch adds a dashboard-controlled booking source for the VETS VAN Book Now page.

- `internal`: keeps the existing VETS VAN booking flow.
- `digitail`: hides the existing flow and loads the Digitail public calendar widget.
- Default Digitail clinic slug: `vetsvan-01-5519deb-ryd`.
- The selection is stored in `site_settings` using `booking_source` and `digitail_clinic_slug`.
- Public clients only receive these two non-sensitive values through `/api/booking-config`.

The existing booking form and its payment/notification integrations are not removed.
