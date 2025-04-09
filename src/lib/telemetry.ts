import TelemetryDeck from '@telemetrydeck/sdk';

// Create a telemetry instance with the provided app ID
const telemetry = new TelemetryDeck({
  appID: 'E1A9ED7A-A3D7-4D43-8267-8233305F31C7',
  clientUser: localStorage.getItem('telemetryUserId') || generateUserId()
});

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
  taskCreated: (frequency?: string) => sendSignal('Task.Created', { frequency }),
  apiKeySaved: () => sendSignal('Settings.ApiKeySaved'),
  timezoneDetected: (timezone: string) => sendSignal('App.Timezone', { timezone }),
};

export default signals;