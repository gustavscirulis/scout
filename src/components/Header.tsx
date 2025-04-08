import { Button } from './ui/button'
import { CaretLeft, Gear, Plus, Trash } from '@phosphor-icons/react'

interface HeaderProps {
  showNewJobForm: boolean
  editingJobId: string | null
  settingsView: boolean
  apiKey: string | null
  onBack: () => void
  onSettings: () => void
  onNewTask: () => void
  onDeleteTask: (taskId: string) => void
}

export function Header({
  showNewJobForm,
  editingJobId,
  settingsView,
  apiKey,
  onBack,
  onSettings,
  onNewTask,
  onDeleteTask
}: HeaderProps) {
  return (
    <div className="h-12 -webkit-app-region-drag w-full flex items-center border-b bg-header">
      <div className="flex items-center w-12 pl-2">
        {(showNewJobForm || editingJobId || settingsView) ? (
          <Button
            variant="headerIcon"
            size="icon"
            onClick={onBack}
            title="Back"
            className="-webkit-app-region-no-drag"
          >
            <CaretLeft size={16} />
          </Button>
        ) : (
          <Button
            variant="headerIcon"
            size="icon"
            onClick={onSettings}
            title="Settings"
            className="-webkit-app-region-no-drag"
          >
            <Gear size={16} />
          </Button>
        )}
      </div>
      
      <div className="font-semibold text-sm -webkit-app-region-drag text-muted-foreground text-center flex-1">
        {(showNewJobForm || editingJobId) ? 
          (editingJobId ? 'Edit Task' : 'New Task') : 
          (settingsView ? 'Settings' : 'Scout')}
      </div>
      
      <div className="flex items-center justify-end w-12 pr-2">
        {!showNewJobForm && !editingJobId && !settingsView ? (
          apiKey ? (
            <Button
              variant="headerIcon"
              size="icon"
              onClick={onNewTask}
              title="New Task"
              className="-webkit-app-region-no-drag"
            >
              <Plus size={16} />
            </Button>
          ) : (
            <div></div> // Empty div when no API key
          )
        ) : editingJobId ? (
          <Button
            variant="headerIcon"
            size="icon"
            onClick={() => onDeleteTask(editingJobId)}
            title="Delete"
            className="-webkit-app-region-no-drag"
          >
            <Trash size={16} />
          </Button>
        ) : (
          <div></div> // Empty div to maintain layout
        )}
      </div>
    </div>
  )
} 