# Scout - Development Guide

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