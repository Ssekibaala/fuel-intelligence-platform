# Fleet Sentinel Luxury Dashboard Design Guidelines

## Design Approach
**Reference-Based Approach**: Drawing inspiration from premium tech products like Apple, Tesla, Notion, Linear, and Figma to create a luxury-class fleet management dashboard that rivals top-tier SaaS applications.

## Core Design Principles
- **Luxury Minimalism**: Absolute clarity with immaculate spacing, flawless alignment, and unobtrusive elegance
- **Future-Tech Atmosphere**: Subtle depth with high-definition visuals and motion that feels alive yet effortless
- **Premium Digital Product**: Every interaction should feel crafted and intentional

## Color Palette
**Primary Colors (Dark Mode Default)**:
- Background: 220 30% 8% (deep graphite)
- Surface: 220 20% 12% (elevated panels)
- Text Primary: 220 10% 95% (soft white)
- Text Secondary: 220 10% 65% (cool gray)

**Accent Colors**:
- Electric Blue: 210 100% 60% (primary accent for CTAs and highlights)
- Success Green: 142 76% 36% (positive states)
- Warning Amber: 45 93% 58% (alerts)
- Danger Red: 0 84% 60% (critical states)

**Glassmorphism Treatment**:
- Glass panels: rgba(255,255,255,0.02) with backdrop-blur-md
- Borders: rgba(255,255,255,0.04) for subtle separation
- Elevated glass: rgba(255,255,255,0.05) for hover states

## Typography
**Font System**: Inter or SF Pro Display via Google Fonts
- Headline Large: 32px, font-weight 600, letter-spacing -0.02em
- Headline Medium: 24px, font-weight 600, letter-spacing -0.01em
- Body Large: 16px, font-weight 400, line-height 1.6
- Body Small: 14px, font-weight 400, line-height 1.5
- Caption: 12px, font-weight 500, letter-spacing 0.01em
- Labels: 10px, font-weight 600, uppercase, letter-spacing 0.05em

## Layout System
**Spacing Scale**: Use Tailwind units of 2, 4, 8, 12, and 16 for consistent rhythm
- Component padding: p-4 or p-8
- Section margins: mt-8 or mt-16
- Element gaps: gap-2, gap-4, gap-8

## Component Library

### Navigation
- **Sidebar**: Collapsible glass panel (16px → 256px width) with magnetic hover expansion
- **Header**: Sticky with backdrop-blur-md and gradient fade from dark to transparent
- **Navigation Items**: Rounded corners, subtle hover states with glow effects

### Data Display
- **KPI Cards**: Frosted glass backgrounds with subtle gradients and ultra-soft shadows
- **Tables**: Alternating row highlights with hover states
- **Charts**: Clean data visualization with accent color highlights
- **Notifications**: Live feed with status-coded indicators and smooth animations

### Interactive Elements
- **Buttons**: Glass morphism with spring-physics hover depth
- **Form Inputs**: Dark backgrounds with focused border glow
- **Toggles**: Smooth state transitions with micro-animations
- **Dropdowns**: Elevated glass panels with smooth reveal animations

### Overlays
- **Modals**: Full-screen overlays with frosted backdrop
- **Investigation Panels**: Slide-in side panels for detailed views
- **Tooltips**: Subtle glass containers with perfect positioning

## Visual Effects
**Liquid Background**: Subtle animated gradient mesh in background layer
**Micro-Interactions**: Spring-physics style transitions on all interactive elements
**Hover States**: Magnetic feel with depth changes and glow effects
**Page Transitions**: Smooth fade/slide transitions between views

## Dark/Light Mode Implementation
- Seamless toggle with smooth animated transitions
- Maintain glassmorphism effects in both modes
- Light mode uses inverted color relationships while preserving hierarchy
- Consistent accent colors across both themes

## Responsive Behavior
- Desktop-first with fluid breakpoints
- Sidebar collapses to icon-only on tablet
- Mobile navigation transforms to bottom sheet
- KPI cards stack vertically on smaller screens
- Maintain touch-friendly interaction zones (44px minimum)

## Key Features to Highlight
- Real-time fleet monitoring with live data feeds
- Predictive analytics with AI confidence indicators
- Interactive vehicle selection and filtering
- Cost analysis with currency conversion
- Alert system with investigation workflows

This design system creates a premium, luxury-class fleet management experience that feels both sophisticated and highly functional, with every detail crafted to provide an exceptional user experience.