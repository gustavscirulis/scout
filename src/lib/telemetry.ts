import TelemetryDeck from '@telemetrydeck/sdk';

// Create a telemetry instance with the provided app ID
const telemetry = new TelemetryDeck({
  appID: 'E1A9ED7A-A3D7-4D43-8267-8233305F31C7'
});

// Set user identifier (this is the proper way to set it according to the SDK)
telemetry.clientUser = localStorage.getItem('telemetryUserId') || generateUserId();

// Generate and save a random user ID if not already saved
function generateUserId(): string {
  const userId = Math.random().toString(36).substring(2, 15);
  localStorage.setItem('telemetryUserId', userId);
  return userId;
}

// Send a signal to TelemetryDeck
export function sendSignal(signalType: string, payload?: Record<string, unknown>): void {
  telemetry.signal(signalType, payload).catch(err => {
    console.error('Failed to send telemetry signal:', err);
  });
}

// Default signals for common events
export const signals = {
  appStarted: () => sendSignal('App.Started'),
  appClosed: () => sendSignal('App.Closed'),
  taskCreated: (frequency?: string) => sendSignal('Task.Created', { frequency }),
  taskEdited: (frequency?: string) => sendSignal('Task.Edited', { frequency }),
  taskDeleted: () => sendSignal('Task.Deleted'),
  taskStarted: () => sendSignal('Task.Started'),
  taskStopped: () => sendSignal('Task.Stopped'),
  analysisRun: (success?: boolean) => sendSignal('Analysis.Run', { success }),
  settingsOpened: () => sendSignal('Settings.Opened'),
  apiKeySaved: () => sendSignal('Settings.ApiKeySaved'),
  toggleWindowFloating: (isFloating: boolean) => sendSignal('Settings.WindowFloating', { isFloating }),
};

export default signals;