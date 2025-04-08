import { Button } from './ui/button'
import { Plus, ShoppingBag, Ticket, Briefcase, ArrowClockwise } from '@phosphor-icons/react'

interface WelcomeViewProps {
  apiKey: string | null
  settingsView: boolean
  setSettingsView: (value: boolean) => void
  setShowNewJobForm: (value: boolean) => void
  setNewJob: (value: any) => void
  settings: any
  updateAvailable: boolean
  updateDownloaded: boolean
  checkingForUpdate: boolean
  checkForUpdates: () => void
  installUpdate: () => void
}

interface NewJobState {
  notificationCriteria: string
  analysisPrompt: string
  visionProvider: string
  [key: string]: any
}

export function WelcomeView({
  apiKey,
  settingsView,
  setSettingsView,
  setShowNewJobForm,
  setNewJob,
  settings,
  updateAvailable,
  updateDownloaded,
  checkingForUpdate,
  checkForUpdates,
  installUpdate
}: WelcomeViewProps) {
  return (
    <div className="flex flex-col items-center justify-center py-7 text-center px-6 animate-in">
      <div className="w-28 h-28 flex items-center justify-center mb-4">
        <img src="app_icon.png" alt="Scout" className="w-full h-full object-contain" />
      </div>
      {!apiKey ? (
        <>
          <h3 className="text-lg font-medium mb-2">Welcome to Scout!</h3>
          <div className="max-w-xl mx-auto mb-8">
            <p className="text-muted-foreground text-sm text-center">
              Scout uses AI to detect website changes.<br />Get started by adding your OpenAI API key.
            </p>
          </div>
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium mb-2">Set Up a Task</h3>
          <div className="max-w-xl mx-auto mb-8">
            <p className="text-muted-foreground text-sm text-center">
              Get notified when something changes on a website you care about.
            </p>
          </div>
        </>
      )}
      
      {!apiKey ? (
        <>
          <div className="w-full overflow-hidden border rounded-lg shadow-sm opacity-70 -webkit-app-region-no-drag mb-8">
            <div className="bg-accent p-4 text-left flex items-start border-b">
              <ShoppingBag size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-sm">Price drops</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  e.g. price goes below certain target
                </div>
              </div>
            </div>
            
            <div className="bg-accent p-4 text-left flex items-start border-b">
              <Ticket size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-sm">Back in stock</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  e.g. concert tickets become available
                </div>
              </div>
            </div>
            
            <div className="bg-accent p-4 text-left flex items-start">
              <Briefcase size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-sm">New content</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  e.g. certain job listing is posted
                </div>
              </div>
            </div>
          </div>
          
          <div className="max-w-xl mx-auto">
            <Button 
              onClick={() => {
                setSettingsView(true);
                // Focus on API key input after component renders
                setTimeout(() => {
                  const apiKeyInput = document.getElementById("apiKey");
                  if (apiKeyInput) {
                    apiKeyInput.focus();
                  }
                }, 0);
              }}
              className="rounded-full px-6"
              size="lg"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add API Key
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="w-full overflow-hidden border rounded-lg shadow-sm -webkit-app-region-no-drag mb-8">
            <button 
              onClick={() => {
                setNewJob((prev: NewJobState) => ({
                  ...prev,
                  notificationCriteria: 'product price drops below target price',
                  analysisPrompt: 'Analyze this webpage to determine if the product price has dropped below the target price.',
                  visionProvider: settings.visionProvider
                }));
                setShowNewJobForm(true);
              }}
              className="w-full bg-accent p-4 hover:bg-muted/30 transition-colors text-left flex items-start border-b"
            >
              <ShoppingBag size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-sm">Price drops</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  e.g. price goes below certain target
                </div>
              </div>
            </button>
            
            <button 
              onClick={() => {
                setNewJob((prev: NewJobState) => ({
                  ...prev,
                  notificationCriteria: 'Concert tickets are available for purchase',
                  analysisPrompt: 'Analyze this webpage to determine if concert tickets are available for purchase.',
                  visionProvider: settings.visionProvider
                }));
                setShowNewJobForm(true);
              }}
              className="w-full bg-accent p-4 hover:bg-muted/30 transition-colors text-left flex items-start border-b"
            >
              <Ticket size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-sm">Back in stock</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  e.g. concert tickets become available
                </div>
              </div>
            </button>
            
            <button 
              onClick={() => {
                setNewJob((prev: NewJobState) => ({
                  ...prev,
                  notificationCriteria: '[job] posting is available',
                  analysisPrompt: 'Analyze this webpage to determine if new job listings have appeared.',
                  visionProvider: settings.visionProvider
                }));
                setShowNewJobForm(true);
              }}
              className="w-full bg-accent p-4 hover:bg-muted/30 transition-colors text-left flex items-start"
            >
              <Briefcase size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-sm">New content</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  e.g. certain job listing is posted
                </div>
              </div>
            </button>
          </div>
          
          <div className="max-w-xl mx-auto">
            <Button 
              onClick={() => setShowNewJobForm(true)}
              className="rounded-full px-6"
              size="lg"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Task
            </Button>
          </div>
          
          {/* Update UI */}
          {(updateAvailable || updateDownloaded) && (
            <div className="mt-4 text-center">
              <Button
                variant={updateDownloaded ? "default" : "outline"}
                size="sm"
                onClick={updateDownloaded ? installUpdate : checkForUpdates}
                className="text-xs"
                disabled={checkingForUpdate}
              >
                <ArrowClockwise className={`mr-1 h-3 w-3 ${checkingForUpdate ? 'animate-spin' : ''}`} />
                {checkingForUpdate
                  ? "Checking..."
                  : updateDownloaded 
                    ? "Install update" 
                    : "Download update"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
} 