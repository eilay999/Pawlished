
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { NotificationsPanel } from './components/NotificationsPanel';
import { Calendar } from './components/Calendar';
import { CustomersView } from './components/CustomersView';
import { CustomerModal } from './components/CustomerModal';
import { AppointmentModal } from './components/AppointmentModal';
import { StatsView } from './components/StatsView';
import { MOCK_APPOINTMENTS, MOCK_CUSTOMERS } from './constants';
import { ViewType, Appointment, Customer, AppointmentStatus } from './types';
import { supabase } from './services/supabaseClient';

type DbCustomer = {
  id: string;
  name: string;
  phone: string;
  pet_name: string;
  pet_type: string;
  last_visit: string;
  visit_frequency_weeks: number;
  default_price: number | null;
};

type DbAppointment = {
  id: string;
  customer_id: string;
  date: string;
  service: string;
  status: AppointmentStatus;
  notes: string | null;
  price: number;
};

const mapCustomerFromDb = (row: DbCustomer): Customer => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  petName: row.pet_name,
  petType: row.pet_type,
  lastVisit: new Date(row.last_visit),
  visitFrequencyWeeks: row.visit_frequency_weeks,
  defaultPrice: row.default_price ?? undefined,
});

const mapAppointmentFromDb = (row: DbAppointment): Appointment => ({
  id: row.id,
  customerId: row.customer_id,
  date: new Date(row.date),
  service: row.service,
  status: row.status,
  notes: row.notes ?? undefined,
  price: row.price,
});

const mapCustomerToDb = (customer: Customer): DbCustomer => ({
  id: customer.id,
  name: customer.name,
  phone: customer.phone,
  pet_name: customer.petName,
  pet_type: customer.petType,
  last_visit: customer.lastVisit.toISOString(),
  visit_frequency_weeks: customer.visitFrequencyWeeks,
  default_price: customer.defaultPrice ?? null,
});

const mapAppointmentToDb = (appointment: Appointment): DbAppointment => ({
  id: appointment.id,
  customer_id: appointment.customerId,
  date: appointment.date.toISOString(),
  service: appointment.service,
  status: appointment.status,
  notes: appointment.notes ?? null,
  price: appointment.price,
});

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('CALENDAR');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Data State
  const [appointments, setAppointments] = useState<Appointment[]>(MOCK_APPOINTMENTS);
  const [customers, setCustomers] = useState<Customer[]>(MOCK_CUSTOMERS);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Modal State
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Appointment Modal State
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedDateForAppointment, setSelectedDateForAppointment] = useState<Date>(new Date());
  const [preSelectedCustomerId, setPreSelectedCustomerId] = useState<string | undefined>(undefined);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (!supabase) {
        setLoadError('Supabase env vars are missing. Using local data only.');
        return;
      }

      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*');

      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select('*');

      if (customersError || appointmentsError) {
        console.error('Supabase load error', customersError || appointmentsError);
        if (isMounted) {
          setLoadError('Failed to load data from Supabase. Using local data only.');
        }
        return;
      }

      const mappedCustomers = (customersData || []).map(mapCustomerFromDb);
      const mappedAppointments = (appointmentsData || []).map(mapAppointmentFromDb);

      if (mappedCustomers.length === 0 && mappedAppointments.length === 0) {
        const { error: seedCustomersError } = await supabase
          .from('customers')
          .insert(MOCK_CUSTOMERS.map(mapCustomerToDb));
        const { error: seedAppointmentsError } = await supabase
          .from('appointments')
          .insert(MOCK_APPOINTMENTS.map(mapAppointmentToDb));

        if (seedCustomersError || seedAppointmentsError) {
          console.error('Supabase seed error', seedCustomersError || seedAppointmentsError);
          if (isMounted) {
            setLoadError('Failed to seed Supabase. Using local data only.');
          }
          return;
        }
      } else if (isMounted) {
        setCustomers(mappedCustomers);
        setAppointments(mappedAppointments);
      }
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleDayClick = (date: Date) => {
    setSelectedDateForAppointment(date);
    setPreSelectedCustomerId(undefined); 
    setEditingAppointment(null); 
    setIsAppointmentModalOpen(true);
  };
  
  const handleAppointmentClick = (appointment: Appointment) => {
    setEditingAppointment(appointment);
    setIsAppointmentModalOpen(true);
  };

  const handleMoveAppointment = (appointmentId: string, newDate: Date) => {
      let updatedAppointment: Appointment | null = null;
      setAppointments(prev => prev.map(appt => {
          if (appt.id === appointmentId) {
              const updatedDate = new Date(newDate);
              const originalTime = new Date(appt.date);
              
              // Preserve the original time (hour/minute), only update the calendar date
              updatedDate.setHours(originalTime.getHours(), originalTime.getMinutes());
              
              // Smart Logic: Reset status if moving to future
              // If you drag a 'Late' or 'Completed' appointment to a future date, it implies rescheduling.
              let newStatus = appt.status;
              const now = new Date();
              
              // Check if moved to future (and wasn't already just scheduled)
              if (updatedDate > now) {
                  if (appt.status === AppointmentStatus.LATE || 
                      appt.status === AppointmentStatus.CANCELLED || 
                      appt.status === AppointmentStatus.COMPLETED) {
                      newStatus = AppointmentStatus.SCHEDULED;
                  }
              }

              updatedAppointment = { 
                  ...appt, 
                  date: updatedDate,
                  status: newStatus 
              };
              return updatedAppointment;
          }
          return appt;
      }));

      if (updatedAppointment && supabase) {
        void supabase
          .from('appointments')
          .upsert(mapAppointmentToDb(updatedAppointment))
          .then(({ error }) => {
            if (error) {
              console.error('Supabase appointment move error', error);
            }
          });
      }
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsCustomerModalOpen(true);
  };

  const handleAddCustomer = () => {
    setEditingCustomer(null);
    setIsCustomerModalOpen(true);
  };

  const handleSaveCustomer = (updatedCustomer: Customer) => {
    setCustomers(prev => {
      const exists = prev.find(c => c.id === updatedCustomer.id);
      if (exists) {
        return prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c);
      } else {
        return [...prev, updatedCustomer];
      }
    });
    setIsCustomerModalOpen(false);

    if (supabase) {
      void supabase.from('customers').upsert(mapCustomerToDb(updatedCustomer)).then(({ error }) => {
        if (error) {
          console.error('Supabase customer upsert error', error);
        }
      });
    }
  };

  const handleDeleteCustomer = (customerId: string) => {
    setCustomers(prev => prev.filter(c => c.id !== customerId));
    setAppointments(prev => prev.filter(a => a.customerId !== customerId));
    setIsCustomerModalOpen(false);
    setEditingCustomer(null);

    if (supabase) {
      void supabase
        .from('appointments')
        .delete()
        .eq('customer_id', customerId)
        .then(({ error: appointmentsError }) => {
          if (appointmentsError) {
            console.error('Supabase appointment delete error', appointmentsError);
          }
        });

      void supabase
        .from('customers')
        .delete()
        .eq('id', customerId)
        .then(({ error: customersError }) => {
          if (customersError) {
            console.error('Supabase customer delete error', customersError);
          }
        });
    }
  };

  const handleSaveAppointment = (savedAppointment: Appointment) => {
    setAppointments(prev => {
      const exists = prev.find(a => a.id === savedAppointment.id);
      if (exists) {
        return prev.map(a => a.id === savedAppointment.id ? savedAppointment : a);
      }
      return [...prev, savedAppointment];
    });

    let updatedCustomer: Customer | null = null;
    if (savedAppointment.status === AppointmentStatus.COMPLETED) {
      const existingCustomer = customers.find(c => c.id === savedAppointment.customerId);
      if (existingCustomer) {
        const newDate = new Date(savedAppointment.date);
        const currentLastVisit = new Date(existingCustomer.lastVisit);
        if (newDate > currentLastVisit) {
          updatedCustomer = { ...existingCustomer, lastVisit: newDate };
        }
      }
      setCustomers(prev => prev.map(c => {
        if (updatedCustomer && c.id === updatedCustomer.id) {
          return updatedCustomer;
        }
        return c;
      }));
    }

    setIsAppointmentModalOpen(false);
    setEditingAppointment(null);

    if (supabase) {
      void supabase
        .from('appointments')
        .upsert(mapAppointmentToDb(savedAppointment))
        .then(({ error }) => {
          if (error) {
            console.error('Supabase appointment upsert error', error);
          }
        });
    }

    if (updatedCustomer && supabase) {
      void supabase
        .from('customers')
        .upsert(mapCustomerToDb(updatedCustomer))
        .then(({ error }) => {
          if (error) {
            console.error('Supabase customer update error', error);
          }
        });
    }
  };

  const handleDeleteAppointment = (appointmentId: string) => {
    setAppointments(prev => prev.filter(a => a.id !== appointmentId));
    setIsAppointmentModalOpen(false);
    setEditingAppointment(null);

    if (supabase) {
      void supabase
        .from('appointments')
        .delete()
        .eq('id', appointmentId)
        .then(({ error }) => {
          if (error) {
            console.error('Supabase appointment delete error', error);
          }
        });
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] text-gray-800 font-sans overflow-hidden flex-col md:flex-row">
      {loadError && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] bg-amber-50 text-amber-900 border border-amber-200 text-xs px-3 py-1.5 rounded-full shadow-sm">
          {loadError}
        </div>
      )}
      
      {/* Navigation */}
      <Sidebar 
        currentView={currentView} 
        onChangeView={setCurrentView} 
        onQuickAdd={() => {
            setSelectedDateForAppointment(new Date());
            setPreSelectedCustomerId(undefined);
            setEditingAppointment(null);
            setIsAppointmentModalOpen(true);
        }}
      />

      {/* Center Content */}
      <main className="flex-1 flex flex-col relative h-full overflow-hidden pb-16 md:pb-0">
        {currentView === 'CALENDAR' ? (
          <Calendar 
            currentDate={currentDate} 
            onDateChange={setCurrentDate} 
            appointments={appointments}
            customers={customers}
            onDayClick={handleDayClick}
            onAppointmentClick={handleAppointmentClick}
            onAppointmentMove={handleMoveAppointment}
          />
        ) : currentView === 'CUSTOMERS' ? (
          <CustomersView 
            customers={customers}
            appointments={appointments}
            onEditCustomer={handleEditCustomer}
            onAddCustomer={handleAddCustomer}
          />
        ) : (
          <StatsView 
            customers={customers}
            appointments={appointments}
          />
        )}
      </main>

      {/* Notifications Panel - Only visible on Large screens to avoid squashing the calendar */}
      {currentView === 'CALENDAR' && (
        <NotificationsPanel 
          appointments={appointments} 
          customers={customers} 
          onAppointmentCreate={handleSaveAppointment}
          onCreateNewCustomer={handleAddCustomer}
          onCustomerClick={handleEditCustomer}
          onAppointmentUpdate={handleSaveAppointment}
        />
      )}

      {/* Customer Modal */}
      <CustomerModal 
        isOpen={isCustomerModalOpen}
        customer={editingCustomer}
        onClose={() => setIsCustomerModalOpen(false)}
        onSave={handleSaveCustomer}
        onDelete={handleDeleteCustomer}
      />

      {/* Appointment Modal */}
      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => {
            setIsAppointmentModalOpen(false);
            setEditingAppointment(null);
        }}
        onSave={handleSaveAppointment}
        onDelete={handleDeleteAppointment}
        initialDate={selectedDateForAppointment}
        customers={customers}
        preSelectedCustomerId={preSelectedCustomerId}
        onCreateNewCustomer={handleAddCustomer}
        appointment={editingAppointment}
      />

    </div>
  );
};

export default App;
