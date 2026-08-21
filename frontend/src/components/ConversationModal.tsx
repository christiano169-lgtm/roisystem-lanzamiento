import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import Modal from './Modal';

interface Message {
  id: string;
  direction: string | null;
  body: string | null;
  ghlCreatedAt: string | null;
}

interface ConversationResponse {
  conversation: { id: string; messages: Message[] } | null;
}

/** Reused by Bandeja and CRM — the "Ver conversación" action that shows a contact's real GHL message thread. */
export default function ConversationModal({ contactId, name, onClose }: { contactId: string; name: string; onClose: () => void }) {
  const [data, setData] = useState<ConversationResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<ConversationResponse>(`/api/contacts/${contactId}/conversation`)
      .then((res) => !cancelled && setData(res))
      .catch(() => !cancelled && setData({ conversation: null }));
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return (
    <Modal title={`Conversación — ${name}`} onClose={onClose}>
      {!data && <p className="text-[13px] text-gray-500">Cargando…</p>}
      {data && !data.conversation && <p className="text-[13px] text-gray-500">Sin conversación registrada para este contacto.</p>}
      {data?.conversation && data.conversation.messages.length === 0 && (
        <p className="text-[13px] text-gray-500">La conversación existe pero no tiene mensajes sincronizados.</p>
      )}
      {data?.conversation && (
        <div className="flex flex-col gap-2.5">
          {data.conversation.messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3.5 py-2.5 text-[13px] ${m.direction === 'outbound' ? 'bg-accent/15 text-accent' : 'bg-card text-gray-200'}`}
              >
                <p>{m.body ?? <span className="italic text-gray-500">(sin texto — adjunto o llamada)</span>}</p>
                {m.ghlCreatedAt && <p className="mt-1 text-[10px] text-gray-500">{new Date(m.ghlCreatedAt).toLocaleString('es-CO')}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
