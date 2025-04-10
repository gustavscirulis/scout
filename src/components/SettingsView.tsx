import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Checkbox } from './ui/checkbox'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { cn, validateApiKey } from '../lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { 
  ArrowClockwise,
  OpenAiLogo,
  Copy,
  Check,
  WarningCircle,
  CheckCircle
} from '@phosphor-icons/react'
import llamaIcon from '../assets/llama@2x.png'
import { VisionProvider } from '../lib/vision'
import { Settings } from '../lib/storage/settings'
import { useUpdates } from '../hooks/useUpdates'

interface SettingsViewProps {
  settings: Settings;
  tempSettings: Settings;
  apiKey: string;
  hasExistingKey: boolean;
  error: string;
  windowIsFloating: boolean;
  llamaModelStatus: { installed: boolean; hasModel: boolean } | null;
  checkingLlamaModel: boolean;
  copyStatus: boolean;
  onSave: () => void;
  onBack: () => void;
  onApiKeyChange: (key: string) => void;
  onSettingsChange: (settings: Settings) => void;
  onWindowFloatingChange: (floating: boolean) => void;
  onCopyCommand: () => void;
}

export function SettingsView({
  settings,
  tempSettings,
  apiKey,
  hasExistingKey,
  error,
  windowIsFloating,
  llamaModelStatus,
  checkingLlamaModel,
  copyStatus,
  onSave,
  onBack,
  onApiKeyChange,
  onSettingsChange,
  onWindowFloatingChange,
  onCopyCommand
}: SettingsViewProps) {
  const { 
    updateAvailable,
    updateDownloaded,
    checkingForUpdate,
    updateError,
    checkForUpdates,
    installUpdate
  } = useUpdates()

  const [screenshotHeight, setScreenshotHeight] = useState(settings.maxScreenshotHeight.toString());

  // Update local state when settings change
  useEffect(() => {
    setScreenshotHeight(settings.maxScreenshotHeight.toString());
  }, [settings.maxScreenshotHeight]);

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-3rem)] animate-in">
      <div className="flex-1 overflow-auto">
        <div className="px-8 pt-6 space-y-8 pb-6">
          {/* Vision Provider section */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">AI model</legend>
            
            <RadioGroup
              value={settings.visionProvider}
              onValueChange={(value: string) => {
                const newProvider = value as VisionProvider
                onSettingsChange({
                  ...settings,
                  visionProvider: newProvider
                })
              }}
              className="grid grid-cols-2 gap-3"
            >
              <RadioGroupItem
                value="openai"
                className={cn(
                  "relative group ring-[1px] ring-border rounded-lg py-4 px-4 text-start h-auto w-auto",
                  "data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground data-[state=checked]:ring-2 data-[state=checked]:ring-primary",
                  "hover:bg-transparent"
                )}
              >
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 h-5 w-5 rounded-full bg-background flex items-center justify-center group-data-[state=unchecked]:hidden">
                  <CheckCircle 
                    className="h-5 w-5 text-primary fill-primary stroke-background" 
                    weight="fill"
                  />
                </div>
                <div className="flex items-center gap-2 mb-2.5">
                  <OpenAiLogo className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="font-semibold tracking-tight">GPT-4o</span>
                <p className="text-xs text-muted-foreground mt-1">Fast and accurate but paid</p>
              </RadioGroupItem>

              <RadioGroupItem
                value="llama"
                className={cn(
                  "relative group ring-[1px] ring-border rounded-lg py-4 px-4 text-start h-auto w-auto",
                  "data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground data-[state=checked]:ring-2 data-[state=checked]:ring-primary",
                  "hover:bg-transparent"
                )}
              >
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 h-5 w-5 rounded-full bg-background flex items-center justify-center group-data-[state=unchecked]:hidden">
                  <CheckCircle 
                    className="h-5 w-5 text-primary fill-primary stroke-background" 
                    weight="fill"
                  />
                </div>
                <div className="flex items-center gap-2 mb-2.5">
                  <img 
                    src={llamaIcon} 
                    alt="Llama" 
                    className="h-4 w-4 text-muted-foreground dark:filter dark:brightness-0 dark:invert opacity-70" 
                  />
                </div>
                <span className="font-semibold tracking-tight">Llama 3.2</span>
                <p className="text-xs text-muted-foreground mt-1">Free but slower and less accurate</p>
              </RadioGroupItem>
            </RadioGroup>
            
            {settings.visionProvider === 'llama' && (
              <div className="space-y-3 -mt-1">
                {checkingLlamaModel ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ArrowClockwise className="h-3.5 w-3.5 animate-spin" />
                    Checking for Llama model...
                  </div>
                ) : llamaModelStatus && (
                  <div className="space-y-2">
                    {!llamaModelStatus.installed ? (
                      <div className="rounded-md px-3 py-1.5 bg-destructive/10 border border-destructive/20 dark:bg-destructive/20">
                        <p className="text-[0.8rem] font-medium text-destructive dark:text-destructive-foreground flex items-center">
                          <WarningCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                          Install Ollama to use Llama 3.2
                        </p>
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => {
                              try {
                                const { shell } = window.require('electron');
                                shell.openExternal('https://ollama.com/download');
                              } catch (error) {
                                window.open('https://ollama.com/download', '_blank');
                              }
                            }}
                          >
                            Download Ollama
                          </Button>
                        </div>
                      </div>
                    ) : !llamaModelStatus.hasModel ? (
                      <div className="rounded-md px-3 py-1.5 bg-destructive/10 border border-destructive/20 dark:bg-destructive/20">
                        <p className="text-[0.8rem] font-medium text-destructive dark:text-destructive-foreground flex items-center">
                          <WarningCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                          Required model is not installed
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <code className="text-[0.8rem] bg-destructive/10 px-2 py-1 rounded">ollama pull llama3.2-vision</code>
                          <TooltipProvider>
                            <Tooltip open={copyStatus}>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-destructive/10"
                                  onClick={onCopyCommand}
                                >
                                  {copyStatus ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Command copied</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <p className="text-[0.8rem] text-muted-foreground/90 mt-2">
                          Run this command in your terminal to install llama3.2-vision.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-md px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 dark:bg-emerald-500/20">
                        <p className="text-[0.8rem] font-medium text-emerald-500 dark:text-emerald-500 flex items-center">
                          <CheckCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                          Llama is ready for use
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </fieldset>
          
          {/* API Key section - only show for OpenAI */}
          {settings.visionProvider === 'openai' && (
            <>
              <fieldset className="space-y-3">
                <div className="flex flex-col">
                  <label htmlFor="apiKey" className="text-sm font-medium mb-1.5">
                    OpenAI API key
                  </label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      const newApiKey = e.target.value;
                      onApiKeyChange(newApiKey);
                    }}
                    placeholder="sk-..."
                    autoComplete="off"
                  />
                  {((apiKey && !validateApiKey(apiKey).isValid) || 
                    (error && error.startsWith('_API_KEY_'))) && (
                    <div className="mt-2 rounded-md px-3 py-1.5 bg-destructive/10 border border-destructive/20 dark:bg-destructive/20">
                      <p className="text-[0.8rem] font-medium text-destructive dark:text-destructive-foreground flex items-center">
                        <WarningCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                        {error && error.startsWith('_API_KEY_') 
                          ? error.replace('_API_KEY_', '') 
                          : 'Please enter a valid OpenAI API key. Make sure it starts with "sk-" and is at least 50 characters long.'}
                      </p>
                    </div>
                  )}
                  
                  {!apiKey && hasExistingKey && (
                    <p className="text-[0.8rem] text-muted-foreground mt-2">
                      Saving with an empty field will remove your API key.
                    </p>
                  )}
                  <p className="text-[0.8rem] text-muted-foreground mt-2">
                    Get your API key from <a 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        try {
                          const { shell } = window.require('electron');
                          shell.openExternal('https://platform.openai.com/api-keys');
                        } catch (error) {
                          window.open('https://platform.openai.com/api-keys', '_blank');
                        }
                      }}
                      className="text-primary hover:underline"
                    >here</a>. Stored locally only.
                  </p>
                </div>
              </fieldset>
            </>
          )}
          
          {/* Screenshot Settings */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Max height for screenshots</legend>
            <p className="text-[0.8rem] text-muted-foreground" style={{ marginTop: '2px' }}>
                Taller screenshots can improve accuracy but will consume more tokens during analysis.
              </p>
            <div className="flex flex-col">
              <div className="flex items-center w-32 gap-2">
                <Input
                  id="maxScreenshotHeight"
                  type="number"
                  value={screenshotHeight}
                  onChange={(e) => {
                    setScreenshotHeight(e.target.value);
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;
                    const numValue = value === '' ? 0 : parseInt(value);
                    if (!isNaN(numValue)) {
                      // Clamp the value to min/max range
                      const clampedValue = Math.min(Math.max(numValue, 800), 10000);
                      onSettingsChange({
                        ...settings,
                        maxScreenshotHeight: clampedValue
                      });
                      setScreenshotHeight(clampedValue.toString());
                    } else {
                      // Reset to previous valid value if not a number
                      setScreenshotHeight(settings.maxScreenshotHeight.toString());
                    }
                  }}
                  min={800}
                  max={10000}
                  step={100}
                  className="no-spin"
                />
                <span className="text-sm text-muted-foreground">pixels</span>
              </div>
            </div>
          </fieldset>
          
          {/* Updates section */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Updates</legend>
            
            <Button
              variant={updateDownloaded ? "default" : "outline"}
              size="sm"
              onClick={updateDownloaded ? installUpdate : checkForUpdates}
              className="text-xs h-8 w-full justify-center"
              disabled={checkingForUpdate}
            >
              <ArrowClockwise className={`mr-1.5 h-3.5 w-3.5 ${checkingForUpdate ? 'animate-spin' : ''}`} />
              {checkingForUpdate
                ? "Checking for updates..."
                : updateDownloaded 
                  ? "Install update now" 
                  : updateAvailable 
                    ? "Download available update"
                    : "Check for updates"}
            </Button>
            
            {updateError && (
              <p className="text-xs text-destructive mt-2">
                Unable to check for updates
              </p>
            )}
          </fieldset>
          
          {(() => {
            // Check if app is in development mode
            try {
              const electron = window.require('electron');
              
              // Get the packaged state from the electron remote
              const isPackaged = electron.ipcRenderer.sendSync('is-app-packaged');
              if (!isPackaged) {
                return (
                  <>
                    <fieldset className="space-y-3">
                      <legend className="text-sm font-medium">Window options</legend>
                      
                      <div className="items-top flex space-x-2">
                        <Checkbox
                          id="windowFloating"
                          checked={windowIsFloating}
                          onCheckedChange={(checked) => {
                            const isChecked = !!checked;
                            onWindowFloatingChange(isChecked);
                          }}
                        />
                        <div className="grid gap-1.5 leading-none">
                          <label
                            htmlFor="windowFloating"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Keep window floating
                          </label>
                          <p className="text-sm text-muted-foreground">
                            Window will stay open when clicking elsewhere
                          </p>
                        </div>
                      </div>
                    </fieldset>
                  </>
                );
              }
              
              return null;
            } catch (error) {
              // Silent fail if electron is not available
              return null;
            }
          })()}
          
        </div>
      </div>
      <div className="sticky bottom-0 left-0 right-0 border-t border-border/60 h-12 px-2 flex justify-center items-center gap-3 bg-header">
        <Button
          variant="outline"
          onClick={() => {
            try {
              const electron = window.require('electron');
              electron.ipcRenderer.send('quit-app');
            } catch (error) {
              // Silent fail if electron is not available
            }
          }}
          className="h-8 w-24"
        >
          Quit
        </Button>
        <Button
          variant="default"
          onClick={onSave}
          className="h-8 w-24"
        >
          Save
        </Button>
      </div>
    </div>
  )
} 