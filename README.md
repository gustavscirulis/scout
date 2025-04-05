# Scout

Scout is a desktop application that monitors websites and notifies you when specified conditions are met. Perfect for tracking price drops, availability changes, or any other visual changes on websites you care about.

## Features

- **Website Tracking**: Set up tasks to track changes on websites
- **Visual Analysis**: Uses OpenAI's Vision API to analyze screenshots
- **Custom Conditions**: Define specific conditions that trigger notifications
- **Scheduling**: Set hourly, daily, or weekly checks
- **Mac-Style Interface**: Clean, native-feeling UI

## How It Works

Scout uses AI vision to monitor websites for you:

1. **Create a Task**: Enter the URL you want to monitor and define the condition you're looking for (e.g., "price drops below $500" or "tickets become available")
2. **Set Schedule**: Choose how often to check - hourly, daily, or weekly
3. **Test First**: Scout takes a screenshot and tests your condition before saving
4. **Automatic Monitoring**: Once saved, Scout will check the website automatically according to your schedule
5. **Get Notified**: When your condition is met, you'll receive a desktop notification

## Getting Started

1. **API Key**: You'll need an OpenAI API key with access to GPT-4o Vision. Enter it in the Settings screen.
2. **Create Tasks**: Click the "+" icon to create a new monitoring task
3. **Test Your Tasks**: Use the "Test" button to verify your condition works correctly
4. **Run Tasks**: Tasks run automatically in the background according to your schedule

## Example Use Cases

- **Price Tracking**: Monitor product pages for price drops (e.g., "price is below $300")
- **Stock Alerts**: Get notified when items come back in stock (e.g., "Add to Cart button is enabled")
- **Limited Releases**: Monitor for ticket sales, product launches, or limited releases
- **Job Listings**: Track career pages for specific job openings
- **Content Updates**: Get notified when websites update with specific information
- **Reservation Availability**: Monitor for available bookings at restaurants or venues

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Technology Stack

- **Frontend**: React, TypeScript, TailwindCSS
- **UI Components**: shadcn/ui
- **Desktop**: Electron
- **AI**: OpenAI Vision API (GPT-4o)

## Privacy & Security

- **Local-Only Processing**: Scout stores all your tasks and data locally on your device.
- **API Key Security**: Your OpenAI API key is stored securely in your system's keychain.
- **No Data Sharing**: Scout does not send any data to external servers beyond what's required for the OpenAI API.
- **Secure Screenshots**: Website screenshots are processed by OpenAI's API but not stored long-term.
- **Anonymous Analytics**: Scout uses TelemetryDeck to collect anonymous usage data to help us improve the application. This data includes app launches, feature usage, and error reports. No personally identifiable information is collected, and all data is anonymized. You can learn more about TelemetryDeck's privacy practices at [telemetrydeck.com/privacy](https://telemetrydeck.com/privacy).

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0) - see the LICENSE file for details. This license ensures that all modifications to this code remain open source.
