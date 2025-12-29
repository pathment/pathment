# Components Directory

This directory contains reusable components used throughout the application.

## Structure

### /ui
Contains basic UI components (buttons, cards, inputs, etc.)
- These should be generic and reusable
- Should not contain business logic
- Can be used across different features

### /layout
Contains layout components (Header, Footer, Sidebar, etc.)
- Components that define the app structure
- Usually used in root layout or page layouts

## Usage

Import components from this directory when building features:

\\\	sx
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/layout/Header';
\\\

## Best Practices

1. Keep components small and focused
2. Use TypeScript for prop types
3. Document complex components
4. Make components composable
5. Avoid putting business logic here - keep it in features
