import { CaretRight } from '@phosphor-icons/react'
import { Task } from '../lib/storage/tasks'

// Function to format time in a simple "ago" format
const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface TaskListProps {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
}

export function TaskList({ tasks, onTaskClick }: TaskListProps) {
  return (
    <div className="pb-6">
      <div className="rounded-lg overflow-hidden animate-in border-x-0 rounded-none">
        {[...tasks].reverse().map((task, index) => (
          <div 
            key={task.id}
            className={`flex items-center px-5 py-5 border-b border-border/50 hover:bg-accent transition-colors ${index === 0 ? 'border-t-0' : ''}`}
            onClick={(e) => {
              // Only trigger if not clicking on buttons
              if (!(e.target as HTMLElement).closest('button')) {
                onTaskClick(task.id);
              }
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center">
                {task.isRunning && (
                  <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${(task.lastMatchedCriteria || task.lastTestResult?.matched)
                    ? 'bg-emerald-500 dark:bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.7)]' 
                    : 'bg-[#007AFF] dark:bg-[#007AFF] shadow-[0_0_4px_rgba(0,122,255,0.7)]'} 
                    animate-[subtle-pulse_1.5s_ease-in-out_infinite,scale_1.5s_ease-in-out_infinite] flex-shrink-0 origin-center`}></span>
                )}
                <h3 className="font-medium text-sm truncate" title={task.websiteUrl}>
                  {task.websiteUrl}
                </h3>
              </div>
              
              <div className="flex items-center mt-1 text-xs text-muted-foreground">
                <div className="w-[7px] flex-shrink-0 mr-1"></div>
                <span 
                  className="flex-shrink-0 cursor-default" 
                  title={task.lastRun ? `Checked ${formatTimeAgo(new Date(task.lastRun))}` : "Waiting for first check"}
                >
                  {task.frequency === 'hourly' ? 'Hourly' : 
                   task.frequency === 'daily' ? `Daily at ${task.scheduledTime}` : 
                   task.frequency === 'weekly' ? `Weekly on ${task.dayOfWeek || 'Mon'} at ${task.scheduledTime}` : ''}
                </span>
                  
                <span className="mx-1.5 text-muted-foreground/40">•</span>
                
                {/* Display matched state from either regular run or test run */}
                {(task.lastMatchedCriteria || task.lastTestResult?.matched) ? (
                  <span className="truncate" title={task.notificationCriteria}>
                    Matched: {task.notificationCriteria}
                  </span>
                ) : (
                  <span className="truncate" title={task.notificationCriteria}>
                    {task.notificationCriteria}
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center ml-4 mr-0">
              <CaretRight className="text-muted-foreground/70 flex-shrink-0" size={16} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 