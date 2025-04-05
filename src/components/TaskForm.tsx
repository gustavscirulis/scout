import { useState, ChangeEvent } from 'react'
import {
  WarningCircle,
  CheckCircle,
  XCircle,
  SpinnerGap
} from '@phosphor-icons/react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { TimeInput } from './ui/time-input'
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

export interface JobFormData {
  websiteUrl: string;
  notificationCriteria: string;
  frequency: RecurringFrequency;
  scheduledTime: string;
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
        <div className="space-y-6 px-8 pt-4">
          <div>
            <label className="text-sm font-medium mb-2 block">URL</label>
            <Input
              type="url"
              value={formData.websiteUrl}
              placeholder="https://example.com"
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
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Notify Me When...</label>
            <Textarea
              value={formData.notificationCriteria}
              placeholder="e.g., 'product price drops below target price' or 'PS5 is back in stock'"
              onChange={handleCriteriaChange}
            />
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Check</label>
              <Select
                value={formData.frequency}
                onValueChange={(value) => onFormChange({ ...formData, frequency: value as RecurringFrequency })}
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
              <TimeInput
                value={formData.scheduledTime}
                onChange={(time) => onFormChange({ ...formData, scheduledTime: time })}
                className="h-9"
              />
            </div>
          </div>
          
          {/* Task Results */}
          {(testResult || loading) && (
            <div>
              <label className="text-sm font-medium mb-2 block">Result</label>
              {testResult && (
                <div className="animate-in">
                  {testResult.screenshot && (
                    <div 
                      className="border border-input rounded-md overflow-hidden cursor-zoom-in hover:shadow-md relative group transition-shadow duration-200"
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
                        <div className="flex items-start gap-2 mb-1">
                          <span className="flex-shrink-0 mt-0.5">
                            {testResult.matched === true ? (
                              <CheckCircle className="w-4 h-4 text-[#43A047] dark:text-green-500" weight="fill" />
                            ) : testResult.matched === false ? (
                              <XCircle className="w-4 h-4 text-[#757575] dark:text-rose-400" weight="fill" />
                            ) : (
                              <WarningCircle className="w-4 h-4 text-destructive" weight="fill" />
                            )}
                          </span>
                          <span className="font-medium">{testResult.result}</span>
                        </div>
                        {testResult.timestamp && (
                          <div className="text-muted-foreground/70">Ran {formatTimeAgo(testResult.timestamp)}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {loading && (
                <div className="p-4 bg-muted border rounded-md flex items-center justify-center animate-in">
                  <SpinnerGap className="animate-spin h-5 w-5" />
                  <span className="text-sm">Running test...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="sticky bottom-0 left-0 right-0 border-t border-border/60 h-12 px-8 flex justify-end items-center gap-3 bg-white">
        <Button
          variant="outline"
          onClick={() => onTest(formData)}
          disabled={!formData.websiteUrl || !formData.notificationCriteria || loading}
          className="h-8 px-4"
        >
          {loading ? 'Testing...' : 'Test'}
        </Button>
        <Button
          variant="default"
          onClick={() => onSave(formData)}
          disabled={!formData.websiteUrl || !formData.notificationCriteria || loading}
          className="h-8 px-4"
        >
          Save
        </Button>
      </div>
    </div>
  );
}