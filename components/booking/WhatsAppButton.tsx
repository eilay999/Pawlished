import React from 'react';
import { MessageCircle } from 'lucide-react';
import { whatsappLink } from './config';

interface WhatsAppButtonProps {
  raised?: boolean;
}

export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({ raised }) => {
  const href = whatsappLink('שלום, אשמח לעזרה בנוגע לתור');
  if (!href) return null;

  return (
    <a
      className={`bk-wa${raised ? ' bk-wa--raised' : ''}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="שליחת הודעה בוואטסאפ"
    >
      <MessageCircle size={28} strokeWidth={2.2} />
    </a>
  );
};
