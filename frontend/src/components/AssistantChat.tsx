import { useState, type FormEvent } from 'react';
import { apiPost, ApiError } from '../lib/api';
import { useActiveLaunch } from '../lib/useActiveLaunch';

interface ChatMsg {
  who: 'user' | 'ia';
  text: string;
}

export default function AssistantChat({ locationId }: { locationId: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const launch = useActiveLaunch(locationId);
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { who: 'ia', text: 'Hola, soy tu analista. Pregúntame algo sobre el lanzamiento activo, por ejemplo: "¿cuántos con dinero sobre la mesa ya compraron?"' },
  ]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const question = input.trim();
    if (!question || loading) return;
    if (!launch) {
      setMsgs((m) => [...m, { who: 'user', text: question }, { who: 'ia', text: 'Todavía no hay ningún lanzamiento creado — creá uno en Configuración → Lanzamientos primero.' }]);
      setInput('');
      return;
    }
    setInput('');
    setMsgs((m) => [...m, { who: 'user', text: question }]);
    setLoading(true);
    try {
      const res = await apiPost<{ answer: string }>('/api/assistant/ask', {
        locationId,
        launchId: launch.id,
        question,
      });
      setMsgs((m) => [...m, { who: 'ia', text: res.answer }]);
    } catch (err) {
      setMsgs((m) => [...m, { who: 'ia', text: err instanceof ApiError ? err.message : 'No pude responder ahora mismo.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-8 right-7 z-20 flex items-center gap-2.5 whitespace-nowrap rounded-full border border-accent/35 bg-[#0b1016] px-5 py-3 text-[13px] font-semibold shadow-[0_0_26px_rgba(34,211,238,.18)] hover:border-accent/60"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.8">
          <path d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z" />
        </svg>
        Habla con tus datos
      </button>

      {open && (
        <div className="roi-pop fixed bottom-24 right-7 z-[75] flex max-h-[64vh] w-[400px] flex-col overflow-hidden rounded-lg border border-accent/30 bg-[#0e0e11] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#242429] px-4 py-3.5">
            <span className="text-[14px] font-bold">Habla con tus datos</span>
            <button onClick={() => setOpen(false)} className="text-[17px] leading-none text-gray-500 hover:text-gray-200">
              ×
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 overflow-auto p-4">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`roi-in max-w-[86%] whitespace-pre-line rounded-md px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  m.who === 'ia' ? 'self-start bg-[#17171c]' : 'self-end bg-accent/15'
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && <div className="roi-pulse self-start text-[12px] text-gray-500">Pensando…</div>}
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-[#242429] p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pregunta por tus métricas…"
              className="flex-1 rounded border border-border2 bg-input px-3 py-2 text-[13px] outline-none focus:border-accent/60"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-[13px] font-bold text-[#04212b] disabled:opacity-60"
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
