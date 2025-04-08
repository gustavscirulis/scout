import { Task } from '../storage/tasks'

export function sendNotification(task: Task, analysis: string): void {
  if (Notification.permission === 'granted') {
    // Extract just the domain from the URL
    const urlObj = new URL(task.websiteUrl.startsWith('http') ? task.websiteUrl : `http://${task.websiteUrl}`);
    const domain = urlObj.hostname;
    
    const title = `${domain} matched your condition`;
    
    // Create a notification body that just includes the rationale (analysis)
    let body = analysis;
    if (analysis && analysis.length > 100) {
      body = analysis.slice(0, 100) + '...';
    }
    
    // Create notification that will persist until explicitly dismissed
    const notification = new Notification(title, {
      body: body,
      icon: '/favicon.ico',
      requireInteraction: true, // Prevents auto-closing
      silent: false,
      tag: `analysis-${task.id}`,
      // The timeoutType property is not standard but supported in some implementations
      // @ts-ignore
      timeoutType: 'never'
    })

    // When notification is clicked, just focus the window but don't close the notification
    // This allows the user to see it until they explicitly dismiss it
    notification.onclick = () => {
      const { ipcRenderer } = window.require('electron')
      ipcRenderer.send('focus-window')
      // Not closing the notification here so it persists until user dismisses it
    }
  }
} 