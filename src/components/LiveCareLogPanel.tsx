'use client';

import { useState } from 'react';
import { updateDoc, doc, arrayUnion, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { FileText, Loader2, Plus, Sparkles } from 'lucide-react';
import type { Shift, CareLogEntry, Conversation } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface LiveCareLogPanelProps {
  shift: Shift;
  currentUserId: string;
}

const LOG_OPTIONS = [
  { emoji: '🍼', label: 'Feeding' },
  { emoji: '😴', label: 'Nap Started' },
  { emoji: '🌅', label: 'Woke Up' },
  { emoji: '💩', label: 'Diaper Change' },
  { emoji: '⚽', label: 'Playtime' },
  { emoji: '🩹', label: 'First Aid' },
  { emoji: '⭐', label: 'General Update' },
];

export function LiveCareLogPanel({ shift, currentUserId }: LiveCareLogPanelProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const [isMainModalOpen, setIsMainModalOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(LOG_OPTIONS[0].emoji);
  const [logNote, setLogNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Both parties can post logs
  const isParticipant = shift.userIds.includes(currentUserId);
  const isAccepted = shift.status === 'accepted';
  const isCompleted = shift.status === 'completed';

  const parseTime = (timeStr: string) => {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return { hours, minutes };
  };

  const getShiftDurationHours = () => {
    const start = parseTime(shift.startTime);
    const end = parseTime(shift.endTime);
    let duration = end.hours - start.hours + (end.minutes - start.minutes) / 60;
    if (duration < 0) duration += 24; // Handle overnight
    return Math.ceil(duration);
  };

  const durationHours = getShiftDurationHours();
  const hourSlots = Array.from({ length: durationHours }, (_, i) => i + 1);

  const [activeHour, setActiveHour] = useState<number | null>(null);
  
  // Format the logs ordered by time
  const logs = shift.careLogs || [];
  const sortedLogs = [...logs].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const handleAddLog = async () => {
    if (!selectedEmoji || isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      const option = LOG_OPTIONS.find((o) => o.emoji === selectedEmoji);
      const newLog = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}`,
        emoji: selectedEmoji,
        label: option?.label || 'Update',
        time: new Date().toISOString(),
        note: logNote.trim() || undefined,
        hourIndex: activeHour, // Track which hour this belongs to
        postedBy: currentUserId
      };

      await updateDoc(doc(db, 'shifts', shift.id), {
        careLogs: arrayUnion(newLog)
      });
      
      // Notify the other party
      const otherUserId = shift.userIds.find(id => id !== currentUserId);
      if (otherUserId && user) {
        try {
          const idToken = await user.getIdToken();
          if (idToken) {
            fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({
                type: 'shift_updated',
                targetUserIds: [otherUserId],
                title: 'New Care Log Entry',
                body: `An update was posted for Hour ${activeHour} of the shift.`,
                link: '/families/calendar'
              })
            });
          }
        } catch (e) {
          console.error('Notify failed', e);
        }
      }

      toast({ title: 'Log added', description: `Hour ${activeHour} update was posted.` });
      setIsAdding(false);
      setLogNote('');
      setActiveHour(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'Could not add log.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalizeShift = async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    try {
      // 1. Mark shift complete
      await updateDoc(doc(db, 'shifts', shift.id), {
        status: 'completed',
        completedAt: serverTimestamp(),
      });

      // 2. Generate summary message
      const parentId = shift.userIds.find((id) => id !== currentUserId) || '';
      if (!parentId) throw new Error('Cannot identify parent.');

      // Check if conversation exists
      const userIds = [currentUserId, parentId].sort();
      const conversationId = `${userIds[0]}_${userIds[1]}`;
      const convSnap = await getDoc(doc(db, 'conversations', conversationId));
      
      if (!convSnap.exists()) {
         await setDoc(doc(db, 'conversations', conversationId), {
           userIds,
           createdAt: serverTimestamp(),
           lastMessage: 'Shift Completed & Report Sent',
           lastMessageAt: serverTimestamp(),
           lastMessageSenderId: currentUserId,
           userProfiles: {}
         }, { merge: true });
      }

      // Build the message block
      const logLines = sortedLogs.map((log) => {
        const timeStr = format(new Date(log.time), 'h:mm a');
        const noteStr = log.note ? `\n   "${log.note}"` : '';
        return `• ${log.emoji} ${timeStr} - ${log.label}${noteStr}`;
      }).join('\n');
      
      const text = `🎉 **Shift Completed!**\nDate: ${shift.date}\nTime: ${shift.startTime} - ${shift.endTime}\n\n**Care Report:**\n${logLines || 'No items logged.'}`;

      const newMessageData = {
        conversationId,
        senderId: currentUserId,
        text,
        createdAt: serverTimestamp(),
        readBy: [currentUserId],
      };

      const newMsgId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}`;
      const newMsgRef = doc(db, `conversations/${conversationId}/messages`, newMsgId);
      await setDoc(newMsgRef, newMessageData);

      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: "Care Report Sent",
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: currentUserId,
      });

      toast({ title: 'Shift Ended', description: 'Final report has been sent to the chat!' });
      router.push(`/families/messages/${conversationId}`);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'Could not end shift.' });
    } finally {
      setIsFinalizing(false);
    }
  };

  if (!isAccepted && !isCompleted && logs.length === 0) return null;

  return (
    <>
      <Button
        variant="outline"
        className={cn(
          "w-full flex items-center justify-between h-12 rounded-2xl border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition-all px-4",
          isAccepted && "border-emerald-200"
        )}
        onClick={() => setIsMainModalOpen(true)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center",
            isAccepted ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
          )}>
            <FileText className="h-4 w-4" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-700">Reporte de Cuidado</p>
            <p className="text-[10px] text-slate-400">
              {logs.length === 0 ? "Sin reportes aún" : `${logs.length} actualizaciones hoy`}
            </p>
          </div>
        </div>
        <Plus className="h-4 w-4 text-slate-300" />
      </Button>

      <Dialog open={isMainModalOpen} onOpenChange={setIsMainModalOpen}>
        <DialogContent className="max-w-[500px] p-0 border-none bg-slate-50/95 backdrop-blur-md overflow-hidden rounded-[2.5rem] shadow-2xl">
          <div className="p-6 pb-4 bg-white border-b border-slate-100">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="font-headline text-2xl text-[var(--navy)]">Reporte de Cuidado</DialogTitle>
                  <DialogDescription className="text-slate-500 text-xs">
                    Seguimiento horario compartido del turno
                  </DialogDescription>
                </div>
                {isAccepted && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 animate-pulse">
                    En vivo
                  </Badge>
                )}
              </div>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Hour Timeline */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {hourSlots.map((hour) => {
                const hourLogs = logs.filter((l: CareLogEntry) => l.hourIndex === hour);
                const isDone = hourLogs.length > 0;
                return (
                  <button
                    key={hour}
                    disabled={!isParticipant || !isAccepted}
                    onClick={() => {
                      setActiveHour(hour);
                      setIsAdding(true);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-3xl border-2 p-3 transition-all h-24 relative",
                      isDone 
                        ? "border-emerald-100 bg-white text-emerald-700 shadow-sm" 
                        : "border-dashed border-slate-200 bg-white/50 text-slate-400 hover:border-primary/30 hover:bg-white hover:text-primary shadow-none"
                    )}
                  >
                    <span className="text-[10px] font-bold uppercase mb-2 tracking-wider">Hora {hour}</span>
                    {isDone ? (
                      <div className="flex -space-x-1 mb-1">
                        {hourLogs.map((l: CareLogEntry) => (
                          <span key={l.id} className="text-xl" title={l.label}>{l.emoji}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center">
                        <Plus className="h-4 w-4 opacity-50" />
                      </div>
                    )}
                    {isDone && (
                      <div className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Recent Logs List */}
            {logs.length > 0 && (
              <div className="space-y-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Actualizaciones recientes</p>
                <div className="space-y-2">
                  {sortedLogs.slice().reverse().map((log: CareLogEntry) => (
                    <div key={log.id} className="flex items-start gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="text-2xl bg-slate-50 h-12 w-12 rounded-xl flex items-center justify-center">
                        {log.emoji}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700 text-sm">Hora {log.hourIndex}: {log.label}</span>
                          <span className="text-[10px] text-slate-400 font-medium">{format(new Date(log.time), 'h:mm a')}</span>
                        </div>
                        {log.note && <p className="text-slate-500 mt-1 text-xs italic leading-relaxed">"{log.note}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isParticipant && isAccepted && (
              <Button 
                onClick={handleFinalizeShift} 
                disabled={isFinalizing} 
                className="w-full ss-pill-btn h-12 text-sm font-bold shadow-lg shadow-primary/20"
              >
                {isFinalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Finalizar Turno y Enviar Reporte
              </Button>
            )}
          </div>

          <DialogFooter className="p-4 pt-0">
            <Button variant="ghost" className="w-full text-slate-400 text-xs" onClick={() => setIsMainModalOpen(false)}>
              Cerrar Resumen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Addition Modal */}
      <Dialog open={isAdding} onOpenChange={(val) => {
        setIsAdding(val);
        if (!val) setActiveHour(null);
      }}>
        <DialogContent className="max-w-[400px] p-6 border-none bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
          <DialogHeader className="mb-6">
            <DialogTitle className="font-headline text-2xl text-[var(--navy)] text-center">Hora {activeHour}</DialogTitle>
            <DialogDescription className="text-slate-500 text-center text-sm">
              ¿Qué sucedió durante esta hora?
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-4 gap-3 pt-2">
            {LOG_OPTIONS.map((opt) => (
              <button
                key={opt.emoji}
                onClick={() => setSelectedEmoji(opt.emoji)}
                className={cn(
                  "flex flex-col items-center justify-center rounded-2xl border-2 p-3 text-center transition-all aspect-square",
                  selectedEmoji === opt.emoji 
                    ? "border-primary bg-primary/5 text-primary shadow-sm" 
                    : "border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-100"
                )}
              >
                <span className="text-3xl mb-1">{opt.emoji}</span>
                <span className="text-[9px] font-bold leading-tight uppercase tracking-tighter">{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-2">
             <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Nota (Opcional)</label>
             <Input 
                placeholder="Ej. Tomó 4oz de leche..." 
                value={logNote} 
                onChange={(e) => setLogNote(e.target.value)} 
                className="rounded-xl border-slate-100 bg-slate-50 h-11 text-sm focus:ring-primary/20"
             />
          </div>

          <DialogFooter className="mt-8 gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsAdding(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleAddLog} disabled={isSubmitting} className="rounded-xl ss-pill-btn flex-1 h-11">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar Hora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
