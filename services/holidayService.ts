
export const getJewishHoliday = (date: Date): string | null => {
    try {
        // ���� ���� ��� ���� ������� �-API ������ �� ������
        // �� ����� ������� ���� ���� �������, �� ����� �������
        const formatter = new Intl.DateTimeFormat('en-US', {
            calendar: 'hebrew',
            day: 'numeric',
            month: 'long'
        });

        const parts = formatter.formatToParts(date);
        const day = parts.find(p => p.type === 'day')?.value;
        const month = parts.find(p => p.type === 'month')?.value;

        if (!day || !month) return null;

        const key = `${day} ${month}`;

        // ����� ������� ������ ����� �����
        const holidays: Record<string, string> = {
            // ����
            "1 Tishri": "��� ����",
            "2 Tishri": "��� ����",
            "9 Tishri": "��� ��� �����",
            "10 Tishri": "��� �����",
            "14 Tishri": "��� �����",
            "15 Tishri": "�����",
            "21 Tishri": "������ ���",
            "22 Tishri": "���� ����",

            // ���� (�����)
            "25 Kislev": "����� (�� 1)",
            "26 Kislev": "�����",
            "27 Kislev": "�����",
            "28 Kislev": "�����",
            "29 Kislev": "�����",
            "30 Kislev": "�����",

            // ���
            "15 Shevat": "�\"� ����",

            // ��� (����)
            "13 Adar": "����� ����",
            "14 Adar": "�����",
            "15 Adar": "���� �����",

            // ��� �' (���� ������ - ������ ���� ���)
            "13 Adar II": "����� ����",
            "14 Adar II": "�����",
            "15 Adar II": "���� �����",

            // ����
            "14 Nisan": "��� ���",
            "15 Nisan": "��� (�� �����)",
            "21 Nisan": "����� �� ���",
            "27 Nisan": "��� �����", // ����: ����� ���� ���� ���� ���

            // ����
            "4 Iyar": "��� �������", // ���� ����
            "5 Iyar": "��� �������", // ���� ����
            "14 Iyar": "��� ���",
            "18 Iyar": "�\"� �����",
            "28 Iyar": "��� �������",

            // �����
            "5 Sivan": "��� ������",
            "6 Sivan": "������",

            // ��
            "9 Av": "���� ���",
            "15 Av": "�\"� ��� (��� �����)"
        };

        return holidays[key] || null;
    } catch (e) {
        console.error("Error calculating holiday", e);
        return null;
    }
};

export const formatHebrewDate = (date: Date): string => {
    try {
        return new Intl.DateTimeFormat('he-IL', {
            calendar: 'hebrew',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(date);
    } catch (e) {
        return '';
    }
};
