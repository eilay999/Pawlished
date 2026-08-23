import React from 'react';
import { PublicBooking } from '../../components/PublicBooking';

const ClientApp: React.FC = () => {
  return (
    <PublicBooking
      onBookingCreated={() => {
        // PublicBooking handles its own success UI; we only need a callback to satisfy the API.
      }}
    />
  );
};

export default ClientApp;
