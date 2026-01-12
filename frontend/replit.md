cd frontend;  npm run dev





# Fleet Sentinel - Luxury Fleet Management Dashboard

## Overview

Fleet Sentinel is a premium fleet management dashboard that provides predictive analytics, real-time monitoring, and luxury-class user experience for fleet operations. The application combines fuel intelligence capabilities with a sophisticated dark-mode interface inspired by premium tech products like Apple, Tesla, and top-tier SaaS platforms (Notion, Linear, Figma).

The system focuses on fuel efficiency monitoring, asset tracking, predictive maintenance alerts, and comprehensive fleet analytics through an immersive glassmorphism-designed interface with liquid animated backgrounds and micro-interactions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript in a full-stack setup
- **Styling**: TailwindCSS with extensive customization for luxury aesthetics
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Design System**: Custom glassmorphism theme with liquid backgrounds, premium color palette, and micro-interactions
- **State Management**: TanStack Query for server state, React hooks for local state
- **Build Tool**: Vite with custom configuration for client-server integration

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript throughout the stack
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **API Design**: RESTful API structure with express routes
- **Development**: Hot-reload development server with Vite integration

### Design Philosophy
- **Luxury Minimalism**: Absolute clarity with immaculate spacing and flawless alignment
- **Future-Tech Atmosphere**: Subtle depth with high-definition visuals and alive-yet-effortless motion
- **Glassmorphism**: Frosted glass backgrounds with backdrop blur effects
- **Dark-First Design**: Premium dark mode with electric blue accents and sophisticated color system

### Component Architecture
- **Modular Components**: Reusable UI components following atomic design principles
- **Theme System**: Comprehensive dark/light mode support with CSS custom properties
- **Animation System**: Liquid backgrounds, hover elevations, and spring-physics transitions
- **Responsive Design**: Mobile-first approach with fluid breakpoints

### Data Layer
- **Database Schema**: PostgreSQL with Drizzle ORM migrations
- **Schema Validation**: Zod integration for type-safe data validation
- **Storage Interface**: Abstracted storage layer supporting both memory and database implementations

## External Dependencies

### Core Framework Dependencies
- **@tanstack/react-query**: Server state management and caching
- **drizzle-orm**: Type-safe database ORM
- **drizzle-zod**: Schema validation integration
- **@neondatabase/serverless**: PostgreSQL serverless driver

### UI/UX Dependencies
- **@radix-ui/react-***: Comprehensive accessible component primitives (accordion, dialog, dropdown, select, etc.)
- **class-variance-authority**: Utility for creating variant-based component APIs
- **clsx**: Conditional className utility
- **tailwind-merge**: TailwindCSS class merging utility
- **cmdk**: Command palette component
- **embla-carousel-react**: Carousel/slider functionality

### Form and Validation
- **@hookform/resolvers**: React Hook Form resolvers
- **react-hook-form**: Form state management
- **zod**: Schema validation library

### Development Tools
- **tsx**: TypeScript execution for development
- **esbuild**: Fast JavaScript bundler for production builds
- **vite**: Frontend build tool and development server
- **@replit/vite-plugin-***: Replit-specific development enhancements

### Database and Session Management
- **connect-pg-simple**: PostgreSQL session store
- **date-fns**: Date manipulation utilities

### Styling and Design
- **tailwindcss**: Utility-first CSS framework
- **autoprefixer**: CSS vendor prefixing
- **postcss**: CSS post-processor

The application leverages a modern tech stack optimized for luxury user experiences while maintaining high performance and accessibility standards.