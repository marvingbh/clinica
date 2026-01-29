# PRD: Modern Mobile-First UI Redesign

## Overview
Modernize the Clinica application's UI across all pages with a Material UI-inspired design while using TailwindCSS. The redesign focuses on a mobile-first approach with card-based layouts, elevation/shadows, floating action buttons, bottom navigation, modern typography, and rich micro-interactions including skeleton loading states.

## Goals
- Transform the current generic look into a modern, polished Material-inspired design
- Maintain mobile-first approach with enhanced touch interactions
- Establish consistent visual language across all pages
- Improve perceived performance with skeleton loading states
- Create a neutral/minimal color palette that feels professional and clean

## Quality Gates

These commands must pass for every user story:
- `npm run build` - Next.js production build must succeed

For UI stories, also include:
- Visual verification in mobile viewport (375px width)
- Visual verification in desktop viewport (1280px width)

## User Stories

### US-001: Install and configure Lucide Icons
As a developer, I want Lucide Icons installed and configured so that I can use consistent, modern icons throughout the app.

**Acceptance Criteria:**
- [ ] Lucide React package installed
- [ ] Create an icon usage guide/pattern in the codebase
- [ ] Replace any existing icons with Lucide equivalents

### US-002: Create design tokens and extend Tailwind config
As a developer, I want a consistent design system with tokens for colors, shadows, spacing, and typography so that the UI is cohesive.

**Acceptance Criteria:**
- [ ] Define neutral/minimal color palette (grays, whites, subtle accents)
- [ ] Add elevation shadow scale (sm, md, lg, xl) matching Material Design
- [ ] Define typography scale with modern font weights
- [ ] Add border-radius tokens for consistent rounded corners
- [ ] Add transition/animation duration tokens

### US-003: Create reusable Card component with elevation
As a user, I want content displayed in elevated cards so that information is visually organized and modern.

**Acceptance Criteria:**
- [ ] Card component with configurable elevation levels
- [ ] Support for header, content, and footer sections
- [ ] Hover state with subtle shadow increase
- [ ] Smooth transition animations on interaction

### US-004: Create Bottom Navigation Bar component
As a mobile user, I want a bottom navigation bar so that I can quickly access main sections (Home, Agenda, Professionals, Profile/Settings).

**Acceptance Criteria:**
- [ ] Fixed bottom navigation visible only on mobile viewports
- [ ] Four items: Home, Agenda, Professionals, Profile/Settings
- [ ] Active state indication with icon and label highlight
- [ ] Smooth transition when switching between items
- [ ] Icons from Lucide library
- [ ] Hidden on desktop (use side/top navigation instead)

### US-005: Create Floating Action Button (FAB) component
As a mobile user, I want a floating action button for primary actions so that key actions are always accessible.

**Acceptance Criteria:**
- [ ] Circular button with elevation/shadow
- [ ] Configurable icon and color
- [ ] Position fixed at bottom-right (above bottom nav on mobile)
- [ ] Optional extended FAB variant with label
- [ ] Press animation feedback

### US-006: Create Skeleton loading components
As a user, I want to see skeleton placeholders while content loads so that I perceive faster performance.

**Acceptance Criteria:**
- [ ] Base Skeleton component with pulse animation
- [ ] SkeletonCard variant for card layouts
- [ ] SkeletonList variant for list items
- [ ] SkeletonText variant for text blocks
- [ ] SkeletonAvatar variant for profile images

### US-007: Redesign Homepage with modern layout
As a user, I want the homepage to look modern with cards, proper spacing, and visual hierarchy so that I have a great first impression.

**Acceptance Criteria:**
- [ ] Hero section with clean typography
- [ ] Feature/action cards with elevation
- [ ] Proper spacing using design tokens
- [ ] Skeleton loading state while data loads
- [ ] Responsive layout (mobile-first, adapts to desktop)
- [ ] FAB for primary action if applicable

### US-008: Redesign Professionals page with card grid
As a user, I want to browse professionals in a modern card-based grid so that I can easily scan and select.

**Acceptance Criteria:**
- [ ] Professional cards with avatar, name, specialty
- [ ] Card elevation and hover effects
- [ ] Grid layout: 1 column mobile, 2-3 columns tablet/desktop
- [ ] Skeleton loading state for professional cards
- [ ] Filter/search with modern input styling

### US-009: Redesign Agenda page with modern calendar UI
As a user, I want the agenda to have a clean, modern appearance so that managing appointments is pleasant.

**Acceptance Criteria:**
- [ ] Modern calendar/date picker styling
- [ ] Appointment cards with elevation
- [ ] Time slots with clear visual hierarchy
- [ ] Skeleton loading for appointments
- [ ] Smooth transitions between dates/views

### US-010: Create modern form inputs and buttons
As a user, I want form elements to look modern and provide good feedback so that interactions feel polished.

**Acceptance Criteria:**
- [ ] Text inputs with floating labels or modern bordered style
- [ ] Focus states with subtle color accent
- [ ] Button variants: primary, secondary, outlined, text
- [ ] Button with loading state (spinner)
- [ ] Ripple or press feedback animation on buttons

### US-011: Add page transition animations
As a user, I want smooth transitions between pages so that navigation feels fluid and modern.

**Acceptance Criteria:**
- [ ] Fade or slide transitions between routes
- [ ] Consistent animation duration using design tokens
- [ ] No janky or stuttering animations
- [ ] Respects reduced-motion preferences

### US-012: Implement responsive header/navigation for desktop
As a desktop user, I want a modern top navigation so that I can access all sections without the mobile bottom nav.

**Acceptance Criteria:**
- [ ] Clean header with logo and navigation links
- [ ] Active state indication for current page
- [ ] User profile/settings dropdown
- [ ] Smooth hover animations
- [ ] Hidden on mobile (bottom nav used instead)

## Functional Requirements
- FR-1: All pages must be fully functional on mobile viewports (320px - 768px)
- FR-2: Bottom navigation must be visible and functional on all mobile pages
- FR-3: Skeleton loaders must appear within 100ms of navigation/data fetch start
- FR-4: All interactive elements must have visible focus states for accessibility
- FR-5: Elevation shadows must follow a consistent scale across components
- FR-6: Typography must use a consistent scale with proper hierarchy
- FR-7: All animations must complete within 300ms for snappy feel
- FR-8: Color contrast must meet WCAG AA standards

## Non-Goals
- Dark mode support (can be added in future iteration)
- Custom icon creation (using Lucide library only)
- Complex gesture interactions (swipe, pinch-to-zoom)
- Pull-to-refresh functionality
- Backend/API changes
- Authentication flow redesign

## Technical Considerations
- Use Tailwind's `@apply` sparingly - prefer utility classes
- Consider creating a `components/ui` folder for reusable components
- Use CSS variables for design tokens to enable future theming
- Leverage Next.js App Router for page transitions if applicable
- Test on real mobile devices, not just browser dev tools
- Consider using `framer-motion` for complex animations if needed

## Success Metrics
- All pages render correctly on mobile (375px) and desktop (1280px)
- Lighthouse performance score remains above 90
- No layout shifts during skeleton-to-content transitions
- Consistent visual language across all pages
- Build passes without errors

## Open Questions
- Should we add a dark mode toggle in a future iteration?
- Are there specific brand colors that should be incorporated as accents?
- Should the FAB be present on all pages or only specific ones?