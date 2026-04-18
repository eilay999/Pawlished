import React, { useMemo, useState } from 'react';
import { AlertCircle, Bot, MessageCircle, User } from 'lucide-react';
import { WhatsAppMessage } from '../types';

interface MessagesViewProps {
  messages: WhatsAppMessage[];
}

type Conversation = {
  phone: string;
  messages: WhatsAppMessage[];
  latest: WhatsAppMessage;
  needsHuman: boolean;
};

const formatTime = (date: Date) =>
  date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

const groupMessages = (messages: WhatsAppMessage[]): Conversation[] => {
  const groups = new Map<string, WhatsAppMessage[]>();

  messages.forEach((message) => {
    const phone = message.phone || 'unknown';
    groups.set(phone, [...(groups.get(phone) || []), message]);
  });

  const lastTimeOf = (list: WhatsAppMessage[], predicate: (message: WhatsAppMessage) => boolean) => {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const message = list[index];
      if (predicate(message)) return message.createdAt.getTime();
    }
    return null;
  };

  return Array.from(groups.entries())
    .map(([phone, list]) => {
      const sorted = [...list].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      const latest = sorted[sorted.length - 1];
      const lastNeedsHumanAt = lastTimeOf(sorted, (message) => message.needsHuman);
      const lastHumanReplyAt = lastTimeOf(
        sorted,
        (message) => message.direction === 'OUTGOING' && message.intentKind === 'human_reply'
      );
      return {
        phone,
        messages: sorted,
        latest,
        needsHuman: Boolean(
          lastNeedsHumanAt !== null && (lastHumanReplyAt === null || lastNeedsHumanAt > lastHumanReplyAt)
        )
      };
    })
    .sort((left, right) => right.latest.createdAt.getTime() - left.latest.createdAt.getTime());
};

export const MessagesView: React.FC<MessagesViewProps> = ({ messages }) => {
  const conversations = useMemo(() => groupMessages(messages), [messages]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const selectedConversation =
    conversations.find((conversation) => conversation.phone === selectedPhone) || conversations[0] || null;
  const humanQueueCount = conversations.filter((conversation) => conversation.needsHuman).length;

  if (messages.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-6 md:p-8 bg-gray-50">
        <div className="max-w-5xl mx-auto bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <MessageCircle className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <h2 className="text-xl font-bold text-gray-800">אין עדיין הודעות WhatsApp</h2>
          <p className="text-sm text-gray-500 mt-2">
            אחרי שלקוחות ישלחו הודעה למספר העסק, השיחות יופיעו כאן.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 bg-gray-50 overflow-hidden flex flex-col">
      <div className="px-5 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">הודעות WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-1">
            {conversations.length} שיחות פעילות, {humanQueueCount} דורשות מענה
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2 rounded-xl">
          <AlertCircle className="w-4 h-4" />
          <span>הודעות שהבוט לא ידע לענות עליהן מסומנות כאן</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[340px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white">
          {conversations.map((conversation) => {
            const isSelected = selectedConversation?.phone === conversation.phone;
            return (
              <button
                key={conversation.phone}
                type="button"
                onClick={() => setSelectedPhone(conversation.phone)}
                className={`w-full text-right px-4 py-4 border-b border-gray-100 transition-colors ${
                  isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 truncate">{conversation.phone}</div>
                    <div className="text-xs text-gray-500 mt-1">{formatTime(conversation.latest.createdAt)}</div>
                  </div>
                  {conversation.needsHuman && (
                    <span className="shrink-0 text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                      צריך מענה
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 truncate mt-2">{conversation.latest.body}</div>
              </button>
            );
          })}
        </aside>

        <section className="min-h-0 overflow-y-auto p-4 md:p-6">
          {selectedConversation && (
            <div className="max-w-3xl mx-auto space-y-3">
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className="text-xs text-gray-400">שיחה עם</div>
                <div className="text-lg font-bold text-gray-900">{selectedConversation.phone}</div>
              </div>

              {selectedConversation.messages.map((message) => {
                const isIncoming = message.direction === 'INCOMING';
                return (
                  <div
                    key={message.id}
                    className={`flex ${isIncoming ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${
                        isIncoming
                          ? 'bg-white border-gray-200 text-gray-900'
                          : message.needsHuman
                            ? 'bg-amber-50 border-amber-200 text-amber-950'
                            : 'bg-blue-600 border-blue-600 text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs opacity-75 mb-1">
                        {isIncoming ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                        <span>{isIncoming ? 'לקוח' : 'בוט'}</span>
                        <span>{formatTime(message.createdAt)}</span>
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed">{message.body}</div>
                      {message.needsHuman && (
                        <div className="mt-2 text-xs font-bold text-amber-800">צריך מענה אנושי</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
