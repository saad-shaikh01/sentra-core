Please fix the layout and styling inconsistencies on this page, especially around the table section and the sticky pagination bar.

Exact issues observed
Layout alignment is inconsistent
The top controls, search/filter area, table container, and pagination bar are not aligned to the same horizontal grid.
The pagination bar appears visually disconnected and centered differently from the rest of the content.
Buttons, table, and content area feel left-aligned, but the pagination bar looks like it is positioned separately.
Table typography and row content sizing need improvement
The font size inside the table does not feel properly balanced.
Some text is wrapping into second and third lines too early.
This makes rows look uneven and hurts readability.
Table content should be cleaner, more compact, and better structured.
Pagination bar border styling is too strong
The current border feels too bright / too white / too heavy.
It should be lighter, subtler, and more refined.
Keep the modern glassmorphism feel, but reduce the harsh white outline.
Visual consistency is off
The page content mostly follows one alignment system, but the pagination component does not fully match it.
This creates a broken visual rhythm across the page.
What needs to be fixed
1. Align everything to the same content width

Make sure these all follow the exact same container width and horizontal alignment:

page header/content section
search and filter controls
table wrapper
sticky pagination bar

The pagination bar should feel like part of the same table/content system, not like an isolated floating element.

2. Improve table text styling

Please refine the table typography:

adjust font size for better readability
improve line height
reduce unnecessary text wrapping
ensure columns have better width allocation
avoid text breaking into second/third line too aggressively unless truly necessary
keep rows visually balanced and neat
3. Refine table layout behavior
improve spacing inside cells
make the table look cleaner and more premium
ensure column content alignment is consistent
preserve responsiveness without making text collapse too early
4. Refine pagination bar styling

For the sticky pagination bar:

keep it sticky
keep it reusable
keep glassmorphism effect
but soften the border significantly
avoid strong bright white outline
use a lighter, more subtle border treatment
make it visually elegant and integrated with the page
5. Fix pagination placement
the pagination bar should align with the table width
it should not feel unusually centered while the rest of the content is side-aligned
it should visually sit as the bottom continuation of the table section
Implementation expectations
Do not change business logic
Only improve layout, styling, spacing, typography, and alignment
Keep the component reusable
Maintain responsiveness
Make the final result feel polished and consistent with the rest of the dashboard
Expected result

After the fix:

page controls, table, and pagination should align perfectly
table text should be more readable and less awkwardly wrapped
pagination border should look subtle and premium
the whole section should feel like one cohesive layout system

Aik aur zyada direct developer version bhi use kar sakte ho:

Developer Task Prompt:

Fix the page layout and styling issues.

Required fixes:

align page content, filter/search section, table, and sticky pagination bar to the same container/grid width
pagination bar currently looks visually disconnected and centered differently; make it align with the table/content area
improve table typography: better font size, line height, spacing, and column balance
reduce early text wrapping inside table cells so content does not go to second/third line unnecessarily
refine cell spacing and row visual balance
keep table responsive without hurting readability
keep sticky pagination reusable and sticky, but soften its border
current border is too bright/heavy; use a lighter subtle border while keeping the glassmorphism effect
make the entire section feel visually cohesive

Important:

no logic changes
styling/layout only
maintain responsiveness and reusability