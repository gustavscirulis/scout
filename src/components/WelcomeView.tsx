import { Button } from './ui/button'
import { Plus, ShoppingBag, Ticket, Briefcase, ArrowClockwise } from '@phosphor-icons/react'
import { VisionProvider } from '../lib/vision'
import { Settings } from '../lib/storage/settings'

interface SetupState {
  isConfigured: boolean;
  provider: VisionProvider;
  requirements: {
    openai: {
      needsApiKey: boolean;
      hasApiKey: boolean;
    };
    llama: {
      needsOllama: boolean;
      hasOllama: boolean;
      needsModel: boolean;
      hasModel: boolean;
    };
  };
}

interface WelcomeViewProps {
  apiKey: string | null;
  settingsView: boolean;
  setSettingsView: (value: boolean) => void;
  setShowNewJobForm: (value: boolean) => void;
  setNewJob: (value: any) => void;
  settings: Settings;
  updateAvailable: boolean;
  updateDownloaded: boolean;
  checkingForUpdate: boolean;
  checkForUpdates: () => void;
  installUpdate: () => void;
  llamaModelStatus: { installed: boolean; hasModel: boolean } | null;
}

interface NewJobState {
  notificationCriteria: string;
  analysisPrompt: string;
  visionProvider: string;
  [key: string]: any;
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
  installUpdate,
  llamaModelStatus
}: WelcomeViewProps) {
  // Calculate setup state based on current configuration
  const setupState: SetupState = {
    isConfigured: false,
    provider: settings.visionProvider,
    requirements: {
      openai: {
        needsApiKey: settings.visionProvider === 'openai',
        hasApiKey: !!apiKey
      },
      llama: {
        needsOllama: settings.visionProvider === 'llama',
        hasOllama: !!llamaModelStatus?.installed,
        needsModel: settings.visionProvider === 'llama',
        hasModel: !!llamaModelStatus?.hasModel
      }
    }
  };

  // Determine if the current provider is fully configured
  setupState.isConfigured = settings.visionProvider === 'openai' 
    ? setupState.requirements.openai.hasApiKey
    : (setupState.requirements.llama.hasOllama && setupState.requirements.llama.hasModel);

  return (
    <div className="flex flex-col items-center justify-center py-7 text-center px-6 animate-in">
      <div className="w-28 h-28 flex items-center justify-center mb-4">
        <img src="app_icon.png" alt="Scout" className="w-full h-full object-contain" />
      </div>
      
      <h3 className="text-lg font-medium mb-2">
        {setupState.isConfigured ? 'Set Up a Task' : 'Welcome to Scout!'}
      </h3>
      <div className="max-w-xl mx-auto mb-8">
        <p className="text-muted-foreground text-sm text-center">
          {setupState.isConfigured 
            ? 'Get notified when something changes on a website you care about.'
            : 'Scout uses AI to detect website changes. Choose your AI model to get started.'}
        </p>
      </div>
      
      <div className="w-full overflow-hidden border rounded-lg shadow-sm -webkit-app-region-no-drag mb-8">
        <div 
          className={`bg-accent p-4 text-left flex items-start border-b ${!setupState.isConfigured ? 'opacity-70' : ''} ${setupState.isConfigured ? 'cursor-pointer hover:bg-accent/80 transition-colors' : ''}`}
          onClick={() => {
            if (setupState.isConfigured) {
              setNewJob({
                websiteUrl: '',
                notificationCriteria: 'the price of [product name] is below [target price]',
                analysisPrompt: 'Analyze this webpage to determine if the following is true: "the price of [product name] is below [target price]". Check elements like prices, availability, text content, and other visible information.',
                frequency: 'daily',
                scheduledTime: '09:00',
                dayOfWeek: 'mon',
                visionProvider: settings.visionProvider
              });
              setShowNewJobForm(true);
            }
          }}
        >
          <ShoppingBag size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium text-sm">Price drops</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              e.g. price goes below certain target
            </div>
          </div>
        </div>
        
        <div 
          className={`bg-accent p-4 text-left flex items-start border-b ${!setupState.isConfigured ? 'opacity-70' : ''} ${setupState.isConfigured ? 'cursor-pointer hover:bg-accent/80 transition-colors' : ''}`}
          onClick={() => {
            if (setupState.isConfigured) {
              setNewJob({
                websiteUrl: '',
                notificationCriteria: 'size [your size] is available for [product name]',
                analysisPrompt: 'Analyze this webpage to determine if the following is true: "size [your size] is available for [product name]". Check elements like prices, availability, text content, and other visible information.',
                frequency: 'daily',
                scheduledTime: '09:00',
                dayOfWeek: 'mon',
                visionProvider: settings.visionProvider
              });
              setShowNewJobForm(true);
            }
          }}
        >
          <Ticket size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium text-sm">Back in stock</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              e.g. your shoe size becomes available
            </div>
          </div>
        </div>
        
        <div 
          className={`bg-accent p-4 text-left flex items-start ${!setupState.isConfigured ? 'opacity-70' : ''} ${setupState.isConfigured ? 'cursor-pointer hover:bg-accent/80 transition-colors' : ''}`}
          onClick={() => {
            if (setupState.isConfigured) {
              setNewJob({
                websiteUrl: '',
                notificationCriteria: 'a [job title] position is available in [location]',
                analysisPrompt: 'Analyze this webpage to determine if the following is true: "a [job title] position is available in [location]". Check elements like prices, availability, text content, and other visible information.',
                frequency: 'daily',
                scheduledTime: '09:00',
                dayOfWeek: 'mon',
                visionProvider: settings.visionProvider
              });
              setShowNewJobForm(true);
            }
          }}
        >
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
        {setupState.isConfigured ? (
          <Button 
            onClick={() => setShowNewJobForm(true)}
            className="rounded-full px-6"
            size="lg"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Task
          </Button>
        ) : (
          <Button 
            onClick={() => {
              setSettingsView(true);
              // Focus on API key input after component renders if using OpenAI
              if (settings.visionProvider === 'openai') {
                setTimeout(() => {
                  const apiKeyInput = document.getElementById("apiKey");
                  if (apiKeyInput) {
                    apiKeyInput.focus();
                  }
                }, 0);
              }
            }}
            className="rounded-full px-6"
            size="lg"
          >
            Configure AI
          </Button>
        )}
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
    </div>
  )
} 