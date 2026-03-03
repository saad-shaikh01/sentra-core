'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MoreVertical,
  Plus,
  User,
  ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useTasksByStage } from '@/hooks/use-projects';
import { useMembers } from '@/hooks/use-organization';

interface StageCardProps {
  stage: any;
  projectId: string;
}

export function StageCard({ stage, projectId }: StageCardProps) {
  const [isExpanded, setIsExpanded] = useState(stage.status === 'ACTIVE');
  const { data: tasksData, isLoading: tasksLoading } = useTasksByStage(isExpanded ? stage.id : '');
  const { data: members } = useMembers();

  const getDepartmentColor = (code: string) => {
    const colors: Record<string, string> = {
      DESIGN: 'text-pink-400 bg-pink-400/10',
      EDITING: 'text-blue-400 bg-blue-400/10',
      MARKETING: 'text-purple-400 bg-purple-400/10',
      DEVELOPMENT: 'text-green-400 bg-green-400/10',
      QC: 'text-amber-400 bg-amber-400/10',
      OPERATIONS: 'text-indigo-400 bg-indigo-400/10',
    };
    return colors[code] || 'text-muted-foreground bg-white/5';
  };

  const memberMap = Object.fromEntries((members ?? []).map((m: any) => [m.id, m.name]));

  return (
    <div className={cn(
      "group bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl transition-all duration-300",
      isExpanded && "ring-1 ring-primary/20 shadow-xl shadow-primary/5 border-white/20"
    )}>
      <div 
        className="p-5 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4 flex-1">
          <div className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
            isExpanded ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground group-hover:bg-white/10"
          )}>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-foreground tracking-tight">{stage.name}</h3>
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                getDepartmentColor(stage.departmentCode)
              )}>
                {stage.departmentCode}
              </span>
              <StatusBadge status={stage.status} />
            </div>
            
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3" />
                <span>Lead: {stage.ownerLeadId ? (memberMap[stage.ownerLeadId] ?? 'Unknown') : 'Unassigned'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" />
                <span>{stage._count?.tasks ?? 0} Tasks</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {stage.requiresStageApproval && (
            <div className="h-8 w-8 rounded-full bg-amber-400/10 text-amber-400 flex items-center justify-center" title="Requires Approval">
              <ShieldCheck className="h-4 w-4" />
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-2 border-t border-white/5 space-y-3">
              {tasksLoading ? (
                <div className="space-y-2 py-4">
                  {[1, 2].map(i => (
                    <div key={i} className="h-12 w-full rounded-xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : tasksData?.data?.length > 0 ? (
                <div className="space-y-2">
                  {tasksData.data.map((task: any) => (
                    <div 
                      key={task.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all group/task"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          task.status === 'COMPLETED' ? "bg-green-500" : 
                          task.status === 'IN_PROGRESS' ? "bg-blue-500" : "bg-muted-foreground/30"
                        )} />
                        <div>
                          <p className="text-sm font-medium">{task.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                              {task.priority}
                            </span>
                            {task.assigneeId && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <User className="h-2 w-2" /> {memberMap[task.assigneeId]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <StatusBadge status={task.status} />
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/task:opacity-100 transition-opacity">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  <Button variant="ghost" size="sm" className="w-full mt-2 border border-dashed border-white/10 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all">
                    <Plus className="h-3.5 w-3.5 mr-2" /> Add Ad-hoc Task
                  </Button>
                </div>
              ) : (
                <div className="py-8 text-center border border-dashed border-white/10 rounded-xl">
                  <p className="text-sm text-muted-foreground">No tasks in this stage yet.</p>
                  <Button variant="link" size="sm" className="mt-1">Create one now</Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
