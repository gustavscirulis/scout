# Scout

Scout is a simple Mac app that keeps an eye on websites for you. Whether you're waiting for a price drop, a restock, or a new job listing—Scout uses AI to spot the changes you care about and lets you know when they happen. Just set it and forget it.

| Welcome Screen | Task List | Task Details |
|:-------------:|:---------:|:------------:|
| ![Welcome Screen](/public/01_welcome@2x.png) | ![Task List](/public/02_list@2x.png) | ![Task Details](/public/03_task@2x.png) |

## Features

- **AI-powered website monitoring** – Track visual changes on any webpage  
- **Custom conditions** – Get notified when your specific condition is met  
- **Scheduled checks** – Monitor pages hourly, daily, or weekly  
- **Native Mac interface** – Clean, minimal, and feels right at home on macOS

## Installation

Download and install Scout from the [releases page](https://github.com/gustavscirulis/scout/releases). Choose the version that matches your Mac's architecture:

- **Apple Silicon (M1/M2/M3) Macs**: Download the `-arm64` version
- **Intel Macs**: Download the `-x64` version

Both versions are available as:
- `.dmg` installer (recommended)
- `.zip` archive (for manual installation)

## Getting Started

1. **API key** – You'll need either:  
   - Your OpenAI API key (enter it under Settings), or  
   - Ollama installed with the Llama 3.2 Vision model (note: Llama can be resource-intensive and may not work well on all computers)  
2. **Create a task** – Click the "+" icon to start monitoring a new page  
3. **Test the task** – Use the "Test" button to verify your condition  
4. **Save to run automatically** – Tasks run in the background on your chosen schedule

## Example Use Cases

- **Price tracking** – Get notified when a product drops below your target price  
- **Stock alerts** – Monitor for "Add to Cart" buttons or availability text  
- **Limited releases** – Catch product launches, ticket drops, or flash sales  
- **Job listings** – Track career pages for specific job titles  
- **Content updates** – Watch for new articles, headlines, or visible changes  
- **Reservation availability** – Monitor booking sites for open time slots

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

- **Local-only processing** – All tasks and data are stored locally on your device  
- **Secure API key storage** – Your API keys are encrypted and stored securely  
- **No unnecessary data sharing** – Scout only communicates with OpenAI's API or your local Ollama instance  
- **Anonymous analytics** – Scout uses TelemetryDeck to collect anonymized usage data (e.g. app launches, errors, feature use). No personal information is collected. Learn more at [telemetrydeck.com/privacy](https://telemetrydeck.com/privacy)

## Limitations

Scout captures a screenshot of the specified URL and analyzes it visually — it does not interact with the page or run scripts. As a result, there are a few limitations:

- **Login-required pages** – Pages that require authentication can't be accessed  
- **CAPTCHAs** – Pages that require CAPTCHA verification can't be captured  
- **Cookie/GDPR banners** – Consent popups may block content, as Scout can't accept them  

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
- **OpenAI GPT-4.1 Mini** – For powering the Vision API
- **Ollama** – For providing local AI capabilities with Llama 3.2 Vision
- **shadcn/ui** – For accessible, elegant UI components
- **Phosphor Icons** – For the icon set used in the app
- **TelemetryDeck** – For privacy-first analytics
- **Electron** – For cross-platform desktop app support
- **React & TypeScript** – For frontend development and type safety

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0). See the LICENSE file for details. This license ensures that all modifications remain open source.