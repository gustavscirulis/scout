# Vision Tasks - Development Guide

## Build/Development Commands
- `npm run dev` - Run dev server + Electron (development mode)
- `npm run build` - Build and package with electron-builder
- `npm run lint` - Run ESLint on TS/TSX files
- `npm test` - Run tests (add test id for single test: `npm test -- -t "test name"`)

## Code Style Guidelines
- **TypeScript**: Use strict typing. Avoid `any` and `as` casts where possible
- **Components**: Functional components with hooks. Use named exports
- **Imports**: Group by: 1) React/framework 2) Libraries 3) Components 4) Utilities
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Error Handling**: Use try/catch with specific error messages and UI indicators
- **UI Components**: Extend shadcn/ui components from `/components/ui`
- **Utilities**: Place reusable functions in `/lib/utils.ts`
- **State Management**: React Context for global state, local state with useState
- **Vision API**: All vision-related code in `/lib/vision` directory

Run `npm run lint` before committing to ensure code quality.