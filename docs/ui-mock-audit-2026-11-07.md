# StudyMind Web UI audit against approved mock direction — 2026-11-07

## Basis and limits
Approved direction from earlier design review: clean/light Careerquis-like interface, compact top header/content/footer, **no permanent sidebar**, not busy or cluttered; separate student dashboard/modules and lecturer portal, documents, Tutor, Quiz, Flashcards, Summary. Custom React UI, direct StudyMind AI API endpoints, **not** the `@studymind/react` component. Inspected current Next.js JSX and `src/app/globals.css` on main. **This is a source-based layout audit, not a pixel-level comparison to original image assets or a browser screenshot review.** Do not claim visual parity.

## Screen-by-screen
| Page | Assessment | Findings |
| --- | --- | --- |
| Landing `src/app/page.tsx` | Mostly aligned | Light hero, restrained 3-feature section, simple preview; generic text-only module mock rather than approved polished presentation. |
| Shared layout `src/app/layout.tsx` | Partially aligned | Compact top header/footer and no sidebar match. Header always shows Sign in/Get started even when authenticated; no role-specific nav. Mobile hides links with `desktop-only` but provides no menu. |
| Student dashboard `src/app/dashboard/page.tsx` | Partial | Generic 3-stat grid, truncated module list used as count, little study progress or quick action emphasis. |
| Modules `src/app/modules/page.tsx` | Mostly aligned | Lecturer creation, student join and simple module cards; create errors still raw JSON, join errors inline. |
| Lecturer dashboard `src/app/lecturer/page.tsx` | Partial | Functional stats and module list, but simplistic management hierarchy. |
| Lecturer module `src/app/lecturer/modules/[id]/page.tsx` | Needs refinement | Multiple grids/sections and two similar assessment links, one placeholder. CSS `.grid3` collapses to one column at <=760px but inline `gridColumn:'span 2'` can create unintended mobile grid columns. |
| Module overview `src/app/modules/[id]/page.tsx` | Partial | Overview/Documents/Chat/Quiz/Flashcards/Summary look like tabs, but Chat/Quiz/Flashcards/Summary all link to same route and always open default Tutor; Overview is noninteractive. |
| Documents `src/app/modules/[id]/documents/page.tsx` | Partial | Clear Class vs My notes separation; personal notes upload not implemented, lecturer upload present. |
| AI Tutor `src/app/modules/[id]/study/study-workspace.tsx` | Needs redesign | Plain stacked message bubbles, no conversation sidebar/history, input beneath; functional shell only. |
| Quiz `study-workspace.tsx` | Needs redesign | Stacked question panels, feedback immediately on choice, no progress/finish/review flow. |
| Flashcards `study-workspace.tsx` | Needs redesign | One large plain flip card; no progress overview, learning controls or polished card treatment. |
| Summary `study-workspace.tsx` | Needs refinement | Plain text panel with topic input; no saved summaries or clear reading structure. |
| Billing `src/app/billing/page.tsx` | Partial | Clean simple panel; price/duration omitted before redirect; pending activation not clearly indicated after return. |
| Authentication `src/app/sign-in/page.tsx`, `src/app/sign-up/page.tsx` | Partial | Light form UI but native submit failures show JSON, not inline form errors. |

## Priority fixes
1. **P0 navigation correctness:** pass selected tab via URL query or distinct route so clicking Quiz, Flashcards, Summary opens the correct tool; make module nav semantic links and show active state.
2. **P0 responsive:** remove inline two-column span on lecturer management grid for narrow viewports; test at 375, 768 and 1280px.
3. **P1 auth UX:** inline sign-in/sign-up errors and sensible loading states; signed-in header should reflect session and role, with a usable mobile menu.
4. **P1 learner experience:** redesign Tutor, Quiz, Flashcards and Summary around approved light mock direction; preserve direct API integrations.
5. **P1 lecturer UX:** simplify management sections and remove placeholder/duplicate assessment card; prioritize module code, materials, enrolled students and AI setup.
6. **P1 billing:** show configured price/duration and webhook-confirmed access/pending state.
7. **P2 polish:** consistent type scale, spacing, focus-visible styles, empty/loading/error states, contrast and keyboard interactions.

## Acceptance
- Compare actual rendered screens against the original approved images at desktop/tablet/mobile dimensions.
- Student: login, join module, open each correct study tab, generate content, flip cards and navigate quiz.
- Lecturer: create module, copy code, edit settings, upload documents, view enrolments, prepare AI course.
- Billing: price/pass copy, checkout redirect, cancellation, pending webhook and active pass.
- Confirm no permanent sidebar, no busy layout, and no `@studymind/react` UI integration.

**Decision:** direction aligned, visual parity **not verified**; significant screen-level gaps remain.
