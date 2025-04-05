import { useState, ChangeEvent } from 'react'
import {
  WarningCircle,
  CheckCircle,
  XCircle,
  SpinnerGap,
  Check,
  X
} from '@phosphor-icons/react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { TimeInput } from './ui/time-input'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { validateUrl } from '../lib/utils'

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

export type RecurringFrequency = 'hourly' | 'daily' | 'weekly'

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

export interface JobFormData {
  websiteUrl: string;
  notificationCriteria: string;
  frequency: RecurringFrequency;
  scheduledTime: string;
  dayOfWeek?: DayOfWeek;
  analysisPrompt: string;
}

interface TestResult {
  result: string;
  matched?: boolean;
  timestamp?: Date;
  screenshot?: string;
}

interface TaskFormProps {
  formData: JobFormData;
  testResult: TestResult | null;
  loading: boolean;
  onFormChange: (data: JobFormData) => void;
  onTest: (data: JobFormData) => void;
  onSave: (data: JobFormData) => void;
}

export function TaskForm({
  formData,
  testResult,
  loading,
  onFormChange,
  onTest,
  onSave
}: TaskFormProps) {
  const [urlError, setUrlError] = useState<string | null>(null);

  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    onFormChange({ ...formData, websiteUrl: url });
    
    // Clear error when user is typing
    if (urlError) setUrlError(null);
  };

  const handleUrlBlur = () => {
    if (formData.websiteUrl) {
      const validation = validateUrl(formData.websiteUrl);
      if (!validation.isValid) {
        setUrlError(validation.message || 'Invalid URL');
      } else {
        setUrlError(null);
      }
    }
  };

  const handleCriteriaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const criteria = e.target.value;
    const analysisPrompt = criteria ? 
      `Analyze this webpage to determine if the following is true: "${criteria}". Check elements like prices, availability, text content, and other visible information.` : 
      '';
    
    onFormChange({ 
      ...formData, 
      notificationCriteria: criteria,
      analysisPrompt: analysisPrompt
    });
  };

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-3rem)]">
      <div className="flex-1 overflow-auto">
        <div className="px-8 pt-4 pb-8">
          <div>
            <label className="text-sm font-medium mb-2 block">Monitor</label>
            <div className="space-y-3">
              <Input
                type="url"
                value={formData.websiteUrl}
                placeholder="example.com"
                className={`h-9 ${urlError ? 'border-destructive' : ''}`}
                autoFocus
                onChange={handleUrlChange}
                onBlur={handleUrlBlur}
              />
              {urlError && (
                <div className="mt-2 rounded-md px-3 py-1.5 bg-destructive/10 border border-destructive/20 dark:bg-destructive/20">
                  <p className="text-[0.8rem] font-medium text-destructive dark:text-destructive-foreground flex items-center">
                    <WarningCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                    {urlError}
                  </p>
                </div>
              )}
            
              <div className="space-y-3">
                {/* First row: Frequency selector and time picker side by side */}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Select
                      value={formData.frequency}
                      onValueChange={(value) => {
                        const newFrequency = value as RecurringFrequency;
                        // Initialize dayOfWeek to "mon" when switching to weekly frequency
                        if (newFrequency === "weekly" && !formData.dayOfWeek) {
                          onFormChange({ 
                            ...formData, 
                            frequency: newFrequency,
                            dayOfWeek: "mon"
                          });
                        } else {
                          onFormChange({ ...formData, frequency: newFrequency });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Every Hour</SelectItem>
                        <SelectItem value="daily">Every Day</SelectItem>
                        <SelectItem value="weekly">Every Week</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1">
                    {formData.frequency !== 'hourly' ? (
                      <TimeInput
                        value={formData.scheduledTime}
                        onChange={(time) => onFormChange({ ...formData, scheduledTime: time })}
                        className="h-9"
                      />
                    ) : (
                      <div className="h-9 opacity-0 pointer-events-none">
                        {/* This invisible element maintains layout */}
                        <TimeInput
                          value={formData.scheduledTime}
                          onChange={() => {}}
                          className="invisible"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Second row: Day picker (only for weekly frequency) */}
                {formData.frequency === 'weekly' && (
                  <div>
                    <Tabs 
                      value={formData.dayOfWeek || "mon"}
                      onValueChange={(value) => onFormChange({ ...formData, dayOfWeek: value as DayOfWeek })}
                      className="w-full"
                    >
                      <TabsList className="grid grid-cols-7 w-full">
                        <TabsTrigger value="mon">Mon</TabsTrigger>
                        <TabsTrigger value="tue">Tue</TabsTrigger>
                        <TabsTrigger value="wed">Wed</TabsTrigger>
                        <TabsTrigger value="thu">Thu</TabsTrigger>
                        <TabsTrigger value="fri">Fri</TabsTrigger>
                        <TabsTrigger value="sat">Sat</TabsTrigger>
                        <TabsTrigger value="sun">Sun</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-sm font-medium mb-2 block">Notify Me When...</label>
            <Textarea
              value={formData.notificationCriteria}
              placeholder="e.g., 'product price drops below target price' or 'PS5 is back in stock'"
              onChange={handleCriteriaChange}
            />
          </div>
          
          {/* Task Results */}
          {(testResult || loading) && (
            <div className="mt-6">
              <label className="text-sm font-medium mb-2 block">Result</label>
              {testResult && (
                <div className="animate-in">
                  {testResult.screenshot && (
                    <div 
                      className="border border-input rounded-md overflow-hidden hover:shadow-md relative group transition-shadow duration-200"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const { ipcRenderer } = window.require('electron')
                          await ipcRenderer.invoke('open-image-preview', testResult.screenshot)
                        } catch (error) {
                          console.error('Error opening image preview:', error)
                        }
                      }}
                      title="Click to enlarge"
                    >
                      <img 
                        src={testResult.screenshot} 
                        alt="Screenshot of website" 
                        className="w-full h-auto" 
                      />
                      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30 border-t border-input">
                        <div className="flex flex-col">
                          <div className="text-sm text-foreground mb-1">{testResult.result}</div>
                          {testResult.timestamp && (
                            <div className="flex items-center text-xs">
                              {testResult.matched !== undefined && (
                                <>
                                  <span className={testResult.matched ? "text-green-600 dark:text-green-500 font-medium flex items-center" : "text-neutral-500 dark:text-neutral-400 font-medium flex items-center"}>
                                    {testResult.matched ? (
                                      <>
                                        <Check className="w-3 h-3 mr-1 text-green-500" weight="bold" />
                                        Matched
                                      </>
                                    ) : (
                                      <>
                                        <X className="w-3 h-3 mr-1 text-neutral-400" weight="bold" />
                                        Not matched
                                      </>
                                    )}
                                  </span>
                                  <span className="mx-1.5 text-muted-foreground/40">•</span>
                                </>
                              )}
                              <span className="text-muted-foreground/70">{formatTimeAgo(testResult.timestamp)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {loading && (
                <div className="border border-input rounded-md overflow-hidden animate-in">
                  <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30 border-t border-input flex items-center justify-center" style={{ height: "100px" }}>
                    <div className="relative w-5 h-5">
                      <div className="absolute top-0 left-0 w-full h-full border-[2px] border-t-primary border-r-primary/40 border-b-primary/20 border-l-primary/10 rounded-full animate-spin"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="sticky bottom-0 left-0 right-0 border-t border-border/60 h-12 px-2 flex justify-center items-center gap-3 bg-header">
        <Button
          variant="outline"
          onClick={() => onTest(formData)}
          disabled={!formData.websiteUrl || !formData.notificationCriteria || loading}
          className="h-8 w-24"
        >
          {loading ? 'Testing...' : 'Test'}
        </Button>
        <Button
          variant="default"
          onClick={() => onSave(formData)}
          disabled={!formData.websiteUrl || !formData.notificationCriteria || loading}
          className="h-8 w-24"
        >
          Save
        </Button>
      </div>
    </div>
  );
}