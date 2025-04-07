# Scout

Scout is a desktop application that monitors websites and notifies you when specified conditions are met. It's perfect for tracking price drops, availability changes, or other visual updates on websites you care about.

| Welcome Screen | Task List | Task Details |
|:-------------:|:---------:|:------------:|
| ![Welcome Screen](/public/01_welcome@2x.png) | ![Task List](/public/02_list@2x.png) | ![Task Details](/public/03_task@2x.png) |

## Features

- **Website Monitoring** – Track visual changes on any webpage
- **AI-Powered Analysis** – Uses OpenAI's Vision API to understand page content
- **Custom Conditions** – Get notified when your specific condition is met
- **Scheduled Checks** – Monitor hourly, daily, or weekly
- **Native Mac Interface** – Clean, minimal, and feels at home on macOS

## How It Works

Scout uses AI to visually analyze webpages and alert you when your condition is met:

1. **Create a Task** – Enter a URL and describe what you're watching for (e.g. "price drops below $500" or "tickets available")
2. **Set a Schedule** – Choose how often Scout checks the page
3. **Test It First** – Preview a screenshot and test your condition before saving
4. **Let It Run** – Scout checks the site automatically in the background
5. **Get Notified** – When your condition is met, you'll receive a desktop notification

## Installation

Download and install Scout from the [releases page](https://github.com/gustavscirulis/scout/releases).

## Getting Started

1. **API Key** – You'll need an OpenAI API key with access to GPT-4o Vision. Enter it under Settings.
2. **Create a Task** – Click the "+" icon to start monitoring a new page
3. **Test the Task** – Use the "Test" button to verify your condition
4. **Run Automatically** – Tasks will run in the background based on your schedule

## Example Use Cases

- **Price Tracking** – Get notified when a product drops below your target price
- **Stock Alerts** – Monitor for "Add to Cart" buttons or availability text
- **Limited Releases** – Catch product launches, ticket drops, and flash sales
- **Job Listings** – Track career pages for specific job titles
- **Content Updates** – Watch for new articles, headlines, or page changes
- **Reservation Availability** – Monitor booking sites for open time slots

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Privacy & Security

- **Local-Only Processing** – All tasks and data are stored locally on your device
- **Secure API Key Storage** – Your OpenAI API key is saved in your system keychain
- **No Unnecessary Data Sharing** – Scout only communicates with OpenAI's API
- **Secure Screenshots** – Screenshots are sent to OpenAI for analysis, but not stored
- **Anonymous Analytics** – Scout uses TelemetryDeck to collect anonymized usage data (e.g. app launches, errors, feature use). No personal information is collected. Learn more at [telemetrydeck.com/privacy](https://telemetrydeck.com/privacy)

## Limitations

Scout captures a screenshot of the specified URL and analyzes it visually — it does not interact with the page or run scripts. As a result, it has a few limitations:

- **Login-Required Pages** – Pages that require authentication can't be accessed.
- **CAPTCHAs** – Pages that require CAPTCHA verification can’t be captured.
- **Cookie/GDPR Banners** – Consent popups may block page content, as Scout can’t accept them.
- **Non-Interactive** – Scout cannot click, scroll, or interact with elements on the page.
- **Above-the-Fold Only** – Only the visible part of the page (above the fold) is captured.

## Notarization

To notarize the app for macOS distribution:

1. **Setup Environment Variables** – Create a `.env` file in the project root with the following variables:
   ```
   APPLE_ID=your@email.com
   APPLE_PASSWORD=app-specific-password
   APPLE_TEAM_ID=your-team-id
   ```
   Note: The `APPLE_PASSWORD` should be an app-specific password generated from your Apple ID account.

2. **Run Build Script** – Execute the build script which handles both building and notarization:
   ```bash
   ./build-with-notarize.sh
   ```

The script will automatically:
- Build the app
- Notarize it with Apple
- Staple the notarization ticket
- Create a distributable package

## Acknowledgements

- **Claude Code** – For helping me build the app without coding skills
- **OpenAI GPT-4o** – For powering the Vision API and generating the app icon
- **shadcn/ui** – For accessible, elegant UI components
- **Phosphor Icons** – For the icon set used in the app
- **TelemetryDeck** – For privacy-first analytics
- **Electron** – For cross-platform desktop app support
- **React & TypeScript** – For frontend development and type safety

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0). See the LICENSE file for details. This license ensures that all modifications remain open source.