
import React, { useState } from 'react';
import { Customer, Appointment, Task } from '../types';
import { TrendingUp, Users, AlertTriangle, Wallet, CalendarOff, CheckCircle2, XCircle, PieChart, Activity, Trash2 } from 'lucide-react';
import { analyzeCustomerStatus } from '../utils';

interface StatsViewProps {
  customers: Customer[];
  appointments: Appointment[];
  tasks: Task[];
  onAddTask: (title: string, startDate: Date) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

export const StatsView: React.FC<StatsViewProps> = ({ customers, appointments, tasks, onAddTask, onToggleTask, onDeleteTask }) => {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskStartDate, setTaskStartDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0); 
  
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  // Financial Stats
  const thisMonthAllAppointments = appointments.filter(a => 
    a.date.getMonth() === currentMonth && 
    a.date.getFullYear() === currentYear
  );
  const activeAppointments = thisMonthAllAppointments.filter(a => a.status !== 'CANCELLED');
  const cancelledAppointments = thisMonthAllAppointments.filter(a => a.status === 'CANCELLED');

  const cancellationFees = cancelledAppointments.reduce((sum, app) => sum + (app.cancellationFee || 0), 0);
  const monthlyRevenue = activeAppointments.reduce((sum, app) => sum + (app.price || 0), 0) + cancellationFees;
  const yearlyCancellationFees = appointments
    .filter(a => a.date.getFullYear() === currentYear && a.status === 'CANCELLED')
    .reduce((sum, app) => sum + (app.cancellationFee || 0), 0);
  const yearlyRevenue =
    appointments
      .filter(a => a.date.getFullYear() === currentYear && a.status !== 'CANCELLED')
      .reduce((sum, app) => sum + (app.price || 0), 0) + yearlyCancellationFees;
  const cancellationLoss = cancelledAppointments.reduce(
    (sum, app) => sum + Math.max(0, (app.price || 0) - (app.cancellationFee || 0)),
    0
  );
  
  const totalAppointmentsCount = thisMonthAllAppointments.length;
  const cancelledCount = cancelledAppointments.length;
  const arrivedCount = activeAppointments.length;
  const cancellationRate = totalAppointmentsCount > 0 ? Math.round((cancelledCount / totalAppointmentsCount) * 100) : 0;


  // --- Customer Analysis (Centralized) ---
  const analyzedCustomers = customers.map(c => {
      const analysis = analyzeCustomerStatus(c, appointments);
      return { ...c, ...analysis };
  });

  const scheduledCustomers = analyzedCustomers.filter(c => c.status === 'SCHEDULED');
  const lateCustomers = analyzedCustomers.filter(c => c.status === 'LATE');
  const soonCustomers = analyzedCustomers.filter(c => c.status === 'SOON');
  const okCustomers = analyzedCustomers.filter(c => c.status === 'OK');

  const potentialLoss = lateCustomers.length * 200; // Est. avg price
  const totalCustomers = customers.length;

  // Chart Segments
  const chartSegments = [
    { label: '���� ��� �����', count: scheduledCustomers.length, color: '#10b981', textColor: 'text-emerald-600', bgColor: 'bg-emerald-500' },
    { label: '����� (����� �������)', count: okCustomers.length, color: '#e5e7eb', textColor: 'text-gray-500', bgColor: 'bg-gray-200' },
    { label: '������ ����� �����', count: soonCustomers.length, color: '#f97316', textColor: 'text-orange-500', bgColor: 'bg-orange-500' },
    { label: '������ (�����)', count: lateCustomers.length, color: '#ef4444', textColor: 'text-red-500', bgColor: 'bg-red-500' },
  ];

  let currentPos = 0;
  const gradientParts = chartSegments.map(seg => {
      const start = currentPos;
      // Prevent division by zero
      const percentage = totalCustomers > 0 ? (seg.count / totalCustomers) * 100 : 0;
      currentPos += percentage;
      return `${seg.color} ${start}% ${currentPos}%`;
  }).join(', ');
  
  // Fallback for 0 customers to show a gray circle instead of broken gradient
  const conicStyle = { 
    background: totalCustomers > 0 ? `conic-gradient(${gradientParts})` : '#f3f4f6' 
  };

  return (
    <div className="flex-1 bg-white/90 m-3 rounded-2xl shadow-sm flex flex-col overflow-y-auto border border-gray-100 custom-scrollbar backdrop-blur-sm">
      <div className="p-8 pb-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 via-white to-emerald-50">
         <h2 className="text-3xl font-bold text-gray-800 tracking-tight">��������� ������</h2>
         <p className="text-gray-500 mt-1">��� �� ������ ����, ������� ������ ������</p>
      </div>

      <div className="p-8 space-y-8">
        
        {/* Row 1: Revenue Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                <div className="flex justify-between items-start mb-4">
                    <div className="bg-white/20 p-2 rounded-lg">
                        <Wallet className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-full">�����</span>
                </div>
                <div className="text-3xl font-bold mb-1">�{monthlyRevenue.toLocaleString()}</div>
                <div className="text-blue-100 text-sm">������ �����</div>
            </div>

            <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
                 <div className="flex justify-between items-start mb-4">
                    <div className="bg-emerald-50 p-2 rounded-lg">
                        <TrendingUp className="w-6 h-6 text-emerald-600" />
                    </div>
                    <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full">����</span>
                </div>
                <div className="text-3xl font-bold text-gray-800 mb-1">�{yearlyRevenue.toLocaleString()}</div>
                <div className="text-gray-500 text-sm">������ ����</div>
            </div>

             <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
                 <div className="flex justify-between items-start mb-4">
                    <div className="bg-red-50 p-2 rounded-lg">
                        <CalendarOff className="w-6 h-6 text-red-600" />
                    </div>
                    <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full">��������</span>
                </div>
                <div className="text-3xl font-bold text-red-600 mb-1">�{potentialLoss.toLocaleString()}</div>
                <div className="text-gray-500 text-sm">���� ������� ��� ����</div>
            </div>
        </div>

        {/* Row 2: Operational Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="bg-white border border-gray-100 p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-50 rounded-full text-blue-600">
                        <Users className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-gray-600">���� ������</span>
                </div>
                <div className="text-3xl font-bold text-gray-800">{totalCustomers}</div>
                <div className="text-xs text-gray-400 mt-1">����� �������</div>
            </div>
            <div className="bg-white border border-gray-100 p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-50 rounded-full text-green-600">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-gray-600">����� �����</span>
                </div>
                <div className="text-3xl font-bold text-gray-800">{arrivedCount}</div>
                <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                    <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${100 - cancellationRate}%` }}></div>
                </div>
            </div>

            <div className="bg-white border border-gray-100 p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-red-50 rounded-full text-red-600">
                        <XCircle className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-gray-600">����� �����</span>
                </div>
                <div className="text-3xl font-bold text-gray-800">{cancelledCount}</div>
                <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                     <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${cancellationRate}%` }}></div>
                </div>
            </div>

             <div className="bg-white border border-gray-100 p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-orange-50 rounded-full text-orange-600">
                        <PieChart className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-gray-600">���� �������</span>
                </div>
                <div className="text-3xl font-bold text-gray-800">{cancellationRate}%</div>
                <div className="text-xs text-gray-400 mt-1">��� �� ������ ������</div>
            </div>

            <div className="bg-white border border-red-100 bg-red-50/10 p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-red-100 rounded-full text-red-600">
                        <Wallet className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-red-800">���� ��������</span>
                </div>
                <div className="text-3xl font-bold text-red-600">�{cancellationLoss.toLocaleString()}</div>
                <div className="text-xs text-red-400 mt-1">����� ����� �����</div>
            </div>
        </div>

        {/* Row 3: Retention Chart */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                        <Activity className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">����� ����� ������</h3>
                        <p className="text-xs text-gray-400">������� {totalCustomers} ������� �����</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-around gap-8">
                <div className="relative w-48 h-48 rounded-full shadow-inner shrink-0" style={conicStyle}>
                     <div className="absolute inset-0 m-8 bg-white rounded-full flex flex-col items-center justify-center shadow-sm">
                         <span className="text-3xl font-bold text-gray-800">{Math.round((scheduledCustomers.length / (totalCustomers || 1)) * 100)}%</span>
                         <span className="text-xs text-gray-500 font-medium">������ ���������</span>
                     </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
                    {chartSegments.map((segment, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-gray-50 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${segment.bgColor} shadow-sm`}></div>
                                <span className="text-sm font-bold text-gray-700">{segment.label}</span>
                            </div>
                            <span className="text-lg font-bold">{segment.count}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Row 4: Retention Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Late Customers Table */}
            <div className="bg-white border border-red-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-5 border-b border-red-50 bg-red-50/30 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        <h3 className="font-bold text-gray-800">������ ����� ��� ({lateCustomers.length})</h3>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto max-h-[300px]">
                    {lateCustomers.length === 0 ? (
                        <div className="p-10 text-center text-gray-400">�� ������� �������!</div>
                    ) : (
                        <table className="w-full text-sm text-right">
                            <thead className="text-xs text-gray-400 font-medium bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-5 py-3">����</th>
                                    <th className="px-5 py-3">����� �����</th>
                                    <th className="px-5 py-3">����� �</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {lateCustomers.map(c => {
                                    return (
                                        <tr key={c.id} className="hover:bg-red-50/20 transition-colors">
                                            <td className="px-5 py-3">
                                                <div className="font-bold text-gray-800">{c.name}</div>
                                                <div className="text-xs text-gray-500">{c.petName}</div>
                                            </td>
                                            <td className="px-5 py-3 text-gray-600">
                                                {c.lastEffectiveVisit.toLocaleDateString('he-IL')}
                                            </td>
                                            <td className="px-5 py-3 font-bold text-red-500">
                                                {Math.abs(c.daysDiff)} ����
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Due Soon Customers Table */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-5 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-500" />
                        <h3 className="font-bold text-gray-800">������ ����� ����� ({soonCustomers.length})</h3>
                    </div>
                    <span className="text-xs text-gray-400">���� �� ����</span>
                </div>
                
                <div className="flex-1 overflow-y-auto max-h-[300px]">
                    {soonCustomers.length === 0 ? (
                        <div className="p-10 text-center text-gray-400">��� ������ ������� ����� ����� �����</div>
                    ) : (
                        <table className="w-full text-sm text-right">
                            <thead className="text-xs text-gray-400 font-medium bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-5 py-3">����</th>
                                    <th className="px-5 py-3">���� ����</th>
                                    <th className="px-5 py-3">�����</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {soonCustomers.map(c => {
                                    return (
                                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-5 py-3">
                                                <div className="font-bold text-gray-800">{c.name}</div>
                                                <div className="text-xs text-gray-500">{c.petName}</div>
                                            </td>
                                            <td className="px-5 py-3 text-gray-600">
                                                {c.dueDate.toLocaleDateString('he-IL')}
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
                                                    {c.daysDiff === 0 ? '����' : `���� ${c.daysDiff} ����`}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

        </div>

        {/* Row 5: Tasks */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">������</h3>
                <span className="text-xs text-gray-400">��"�: {tasks.length}</span>
            </div>

            <div className="flex gap-2 mb-4">
                <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="���� �����..."
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <input
                    type="date"
                    value={taskStartDate}
                    onChange={(e) => setTaskStartDate(e.target.value)}
                    className="border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                    onClick={() => {
                        const trimmed = taskTitle.trim();
                        if (!trimmed) return;
                        onAddTask(trimmed, new Date(taskStartDate));
                        setTaskTitle('');
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                    ���� �����
                </button>
            </div>

            {tasks.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    ��� ������ ����
                </div>
            ) : (
                <div className="space-y-2">
                    {tasks.map(task => (
                        <div
                            key={task.id}
                            className={`w-full text-right px-3 py-2 rounded-xl border flex items-center justify-between transition-colors ${
                              task.status === 'DONE'
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <button
                              onClick={() => onToggleTask(task.id)}
                              className="flex-1 text-right"
                            >
                              <span className={`text-sm font-medium ${task.status === 'DONE' ? 'line-through' : ''}`}>
                                  {task.title}
                              </span>
                              <div className="text-[11px] text-gray-400 mt-1">
                                  �����: {task.startDate.toLocaleDateString('he-IL')}
                              </div>
                            </button>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold">
                                  {task.status === 'DONE' ? '����' : '����'}
                              </span>
                              <button
                                onClick={() => onDeleteTask(task.id)}
                                className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                aria-label="��� �����"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
