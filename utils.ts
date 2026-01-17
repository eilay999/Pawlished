
import { Customer, Appointment, AppointmentStatus } from './types';

export type CalculatedStatus = 'LATE' | 'SOON' | 'SCHEDULED' | 'OK';

export interface CustomerAnalysis {
    status: CalculatedStatus;
    dueDate: Date;
    daysDiff: number;
    nextAppointment?: Date;
    lastEffectiveVisit: Date;
}

export const analyzeCustomerStatus = (customer: Customer, appointments: Appointment[]): CustomerAnalysis => {
    // 1. נרמול תאריך "היום" לשעה 00:00 למניעת טעויות חישוב
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const safeLastVisit = new Date(customer.lastVisit);
    if (isNaN(safeLastVisit.getTime())) {
        return {
            status: 'OK',
            dueDate: today,
            daysDiff: 0,
            lastEffectiveVisit: today
        };
    }

    // 2. מציאת הביקור האחרון שבוצע בפועל (כולל היסטוריית תורים)
    let effectiveLastVisit = safeLastVisit;
    effectiveLastVisit.setHours(0,0,0,0);

    if (appointments && appointments.length > 0) {
        const recentCompletedAppt = appointments
            .filter(a => a.customerId === customer.id && a.status === AppointmentStatus.COMPLETED)
            .map(a => new Date(a.date))
            .sort((a, b) => b.getTime() - a.getTime())[0];

        if (recentCompletedAppt) {
            const recentDate = new Date(recentCompletedAppt);
            recentDate.setHours(0,0,0,0);
            if (recentDate.getTime() > effectiveLastVisit.getTime()) {
                effectiveLastVisit = recentDate;
            }
        }
    }

    // 3. בדיקה אם כבר יש תור עתידי
    const futureAppt = appointments
        .filter(a => a.customerId === customer.id && a.status !== AppointmentStatus.CANCELLED)
        .map(a => new Date(a.date))
        .sort((a, b) => a.getTime() - b.getTime())
        .find(date => {
            const d = new Date(date);
            d.setHours(0,0,0,0);
            return d.getTime() >= today.getTime();
        });

    // 4. חישוב תאריך היעד (Due Date)
    // אם לקוח בא כל שבועיים (2) -> נוסיף 14 יום לתאריך הביקור האחרון
    const frequencyDays = (customer.visitFrequencyWeeks || 4) * 7;
    const dueDate = new Date(effectiveLastVisit);
    dueDate.setDate(dueDate.getDate() + frequencyDays);
    dueDate.setHours(0,0,0,0);
    
    // 5. חישוב ההפרש בימים
    const timeDiff = dueDate.getTime() - today.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    // 6. קביעת סטטוס
    let status: CalculatedStatus = 'OK';

    if (futureAppt) {
        status = 'SCHEDULED'; // כבר קבע תור - הכל טוב
    } else {
        if (daysDiff < 0) {
            status = 'LATE'; // עבר התאריך
        } else if (daysDiff <= 7) {
            // החוק שלך: שבוע לפני המועד (או פחות) -> נכנס ל"בקרוב"
            status = 'SOON'; 
        } else {
            status = 'OK'; // יש עוד זמן
        }
    }

    return {
        status,
        dueDate,
        daysDiff,
        nextAppointment: futureAppt,
        lastEffectiveVisit: effectiveLastVisit
    };
};
