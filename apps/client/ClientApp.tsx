import React from 'react';
import { PublicBooking } from '../../components/PublicBooking';
import { BookingErrorBoundary } from '../../components/booking/ErrorBoundary';
import '../../components/booking/booking.css';

const ClientApp: React.FC = () => {
  return (
    <BookingErrorBoundary>
      <PublicBooking
        onBookingCreated={() => {
          // PublicBooking handles its own success UI; we only need a callback to satisfy the API.
        }}
      />
    </BookingErrorBoundary>
  );
};

export default ClientApp;
