 1. Scope Definition

 In-Scope

 - Create lead (form → POST /leads)
 - Read lead list (table + kanban) and detail (sheet)
 - Update/edit lead (wiring existing modal for edit mode)
 - Delete lead (soft-delete, restricted by role)
 - Status change (all transitions, including FOLLOW_UP with followUpDate)
 - Form validation: brandId required client-side
 - Frontend role-based permission gating (delete, assign, convert actions)
 - Graceful handling of useMembers() 403 for low-privilege roles
 - Lead detail data contract: assignedTo full user object included in GET /leads/:id
 - Convert flow: duplicate-email returns 409 not 500
 - Build health of lead-related files only
 - Automated test coverage (Playwright e2e + backend NestJS integration tests)

 Out-of-Scope

 - Public capture endpoint (POST /leads/capture)
 - Comm service email tab in detail sheet
 - Lead bulk import/export
 - Notification or webhook triggers
 - Reporting/analytics on lead data
 - PM dashboard
 - Resolving TypeScript errors in non-lead modules (comm, socket.io-client)

 Deferred Unless Proven Blocking

 - Inline editing inside the detail sheet
 - Activity feed rich type-specific rendering
 - Kanban pagination
 - Advanced duplicate lead detection at create time

 ---
 2. Current-State Assessment

 ┌───────────────────────┬──────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────┐     
 │         Area          │        Status        │                                          Reasoning                                          │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Create lead           │ Implemented but      │ Form and hook wired; backend requires brandId but no client-side validation — only server   │     
 │                       │ incomplete           │ rejection guards it                                                                         │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Read list             │ Implemented and      │ useLeads, table, kanban functional; enrichment works when useMembers succeeds               │     
 │                       │ working              │                                                                                             │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Read detail           │ Implemented and      │ useLead(id), detail sheet renders. GET /leads/:id returns assignedTo full User object, but  │     
 │                       │ working              │ this is not leveraged in fallback logic yet                                                 │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Update/edit lead      │ Implemented but      │ LeadFormModal has full edit mode (isEdit = !!lead) but page.tsx never passes lead prop —    │     
 │                       │ broken               │ unreachable from UI                                                                         │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Delete lead           │ Implemented and      │ Table delete → confirm dialog → useDeleteLead; soft-delete confirmed in service             │     
 │                       │ working              │                                                                                             │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Status → FOLLOW_UP    │ Implemented but      │ api.ts changeLeadStatus() only sends { status }. Backend throws 400 when followUpDate       │     
 │                       │ broken               │ absent for FOLLOW_UP. No date-picker UI exists.                                             │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Status → other        │ Implemented and      │ Works for all non-FOLLOW_UP transitions                                                     │     
 │ statuses              │ working              │                                                                                             │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Permission gating     │ Missing              │ Delete/assign/convert visible to all roles; backend rejects but UI does not prevent the     │     
 │ (frontend)            │                      │ attempt                                                                                     │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Members 403 for       │ Implemented but      │ useMembers() 403 for agents causes silent undefined in enrichment; no fallback text         │     
 │ agents                │ broken               │                                                                                             │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Convert duplicate     │ Partially broken     │ Prisma P2002 propagates as unformatted 500; should be 409                                   │     
 │ email                 │                      │                                                                                             │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Build health          │ Unknown / Reported   │ Backend Prisma type errors reported; frontend socket.io-client missing. Neither assessed    │     
 │                       │ broken               │ for lead-specific impact.                                                                   │     
 ├───────────────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤     
 │ Automated tests       │ Missing              │ E2E suite covers auth/team only; zero lead CRUD coverage                                    │     
 └───────────────────────┴──────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────┘     

 ---
 3. Execution Strategy

 Phase 0 — Build Health (Stop-the-line prerequisite)

 LEAD-000 assesses, LEAD-001 and LEAD-002 fix. No implementation ticket may start until build is clean for lead-related files.

 Stop gate: tsc --noEmit produces zero errors in lead module paths.

 Phase 1 — Data Contract (Required before LEAD-012)

 LEAD-003 defines the exact return shape of useLead / GET /leads/:id. Required before any assignee fallback logic can be written correctly.

 Phase 2 — FOLLOW_UP Status Fix (Critical path)

 LEAD-004 and LEAD-005 are sequential API/hook fixes. LEAD-006 (kanban dialog) and LEAD-007 (detail sheet dialog) both depend on LEAD-005. LEAD-008 
  (kanban verification) closes only after LEAD-006 is implemented and evidence is captured.

 Stop gate: PATCH /leads/:id/status with { status: "FOLLOW_UP", followUpDate: "..." } returns 200.

 Phase 3 — Edit Flow (Independent, parallel-eligible with Phase 2)

 LEAD-009 wires the edit path.

 Stop gate: Editing a lead from detail sheet updates the record and refreshes list and detail.

 Phase 4 — Form Validation

 LEAD-010 depends on LEAD-009 (modal must be stable for both create and edit).

 Phase 5 — Permission Gating

 LEAD-011 depends on LEAD-009 (edit modal stable) and LEAD-003 (data contract clear).

 Phase 6 — Members Graceful Degradation

 LEAD-012 depends on LEAD-003 (assignedTo shape known) and LEAD-011 (role gating complete so agent can distinguish rendering rules per role).       

 Phase 7 — Convert Error Handling

 LEAD-013 is a backend-only change, independent of frontend phases.

 Phase 8 — Tests

 LEAD-014 (Playwright e2e) and LEAD-015 (backend integration) can run in parallel. Both require all Phase 0–7 tickets complete.

 ---
 4. Ticket Backlog

 ---
 [LEAD-000] Assess TypeScript build state for lead module files (read-only, no code changes)

 - Objective: Determine exactly which TypeScript errors exist in lead-related files in both backend and frontend. Produce a written findings        
 report. Make no code changes.
 - Why this exists: Backend Prisma type errors and frontend socket.io-client errors have been reported. It is unknown whether any of these affect   
 lead module files specifically. LEAD-001 and LEAD-002 cannot be scoped without this assessment.
 - Scope: Run tsc --noEmit in both workspaces. Filter output to lead-related paths. Document findings. Do not fix anything.
 - Out of scope: Any code changes. Any errors in comm, socket.io, pm-service, or unrelated modules.
 - Depends on: Nothing.
 - Files likely touched: None (read-only).
 - Commands to run:
 cd apps/backend/core-service && npx tsc --noEmit 2>&1 | grep -E "(leads|prisma)" | head -60
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep -E "(leads|use-leads)" | head -60
 - Implementation expectations:
   - Run the above commands verbatim.
   - If Prisma client is stale: note it (npx prisma generate would fix it, but do not run it here).
   - Produce a written summary: list each error file path, error code, and whether it is in a lead-related path.
   - Classify each error as: (a) lead-blocking, (b) non-lead, or (c) Prisma regeneration required.
 - Acceptance criteria:
   - A written findings report exists (as a comment on this ticket or in a file at docs/lead-build-assessment.md).
   - The report explicitly lists zero or more lead-related TypeScript errors with file paths.
   - No code has been modified.
 - Evidence required before closing:
   - Copy of tsc --noEmit output filtered to lead paths.
   - Classification of each error.
 - Must not change: Any source files. Any tsconfig files.
 - Failure conditions: Any code edit is made during this ticket. Any assumption about errors without running the commands.
 - Reviewer checklist:
   - No source files modified in this commit.
   - Report lists specific error paths, not general descriptions.
   - Errors are classified as lead-blocking or not.
 - Definition of done: Written findings report produced. No code changed.

 ---
 [LEAD-001] Fix backend lead module TypeScript and Prisma type errors

 - Objective: Resolve all TypeScript errors in apps/backend/core-service/src/modules/leads/ identified by LEAD-000.
 - Why this exists: Lead service cannot be compiled or tested if its own files have type errors.
 - Scope: Only files inside apps/backend/core-service/src/modules/leads/. If Prisma client is stale, run prisma generate only. Do not touch other   
 modules.
 - Out of scope: Errors in non-lead backend files. Frontend. Any schema migration.
 - Depends on: LEAD-000 (findings report must exist and identify specific errors).
 - Files likely touched:
   - apps/backend/core-service/src/modules/leads/leads.service.ts
   - apps/backend/core-service/src/modules/leads/leads.controller.ts
   - apps/backend/core-service/src/modules/leads/dto/*.ts
   - Possibly: libs/backend/prisma-client/ (if prisma generate needed)
 - Commands to run:
 # If Prisma client stale:
 cd libs/backend/prisma-client && npx prisma generate
 # Verify after fix:
 cd apps/backend/core-service && npx tsc --noEmit 2>&1 | grep -E "(leads)" | head -30
 - Implementation expectations:
   - Address each error identified in LEAD-000 that is classified as lead-blocking.
   - If the fix requires prisma generate, run it and commit the regenerated client.
   - Do not introduce new logic changes in service or controller methods while fixing types.
 - Acceptance criteria:
   - tsc --noEmit in apps/backend/core-service produces zero errors in lead-related paths.
 - Evidence required before closing:
   - tsc --noEmit output showing zero lead-path errors (paste output).
 - Must not change: Business logic in service methods. Endpoint paths. DTO field names or required/optional status.
 - Failure conditions: Fix introduces a change to service logic beyond type annotations. tsc --noEmit still shows lead-path errors after the fix.   
 - Reviewer checklist:
   - Only lead module files (or Prisma client) changed.
   - No service method logic altered.
   - tsc --noEmit output attached showing zero lead errors.
 - Definition of done: Zero TypeScript errors in lead backend files.

 ---
 [LEAD-002] Fix frontend lead module TypeScript errors

 - Objective: Resolve all TypeScript errors in lead-related frontend files identified by LEAD-000.
 - Why this exists: Frontend components will silently fail type checks if types are misaligned between hooks, components, and shared types.
 - Scope: Only files in apps/frontend/sales-dashboard/src/app/dashboard/leads/ and src/hooks/use-leads.ts. Do not fix errors in comm, socket.io, or 
  other modules.
 - Out of scope: Non-lead frontend errors. Backend.
 - Depends on: LEAD-000 (findings report must identify specific errors).
 - Files likely touched:
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/page.tsx
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/*.tsx
   - apps/frontend/sales-dashboard/src/hooks/use-leads.ts
 - Commands to run:
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep -E "(leads|use-leads)" | head -30
 - Implementation expectations:
   - Address each error identified in LEAD-000 that is classified as lead-blocking.
   - Do not change component rendering logic, only fix type annotations.
 - Acceptance criteria:
   - tsc --noEmit in apps/frontend/sales-dashboard produces zero errors in lead-related paths.
 - Evidence required before closing:
   - tsc --noEmit output showing zero lead-path errors.
 - Must not change: Component render logic. Hook return values. API call bodies.
 - Failure conditions: Fix changes component behavior. Non-lead errors are introduced or "fixed" by suppression (// @ts-ignore).
 - Reviewer checklist:
   - Only lead-path files changed.
   - No @ts-ignore or as any added to suppress errors.
   - Output attached.
 - Definition of done: Zero TypeScript errors in lead frontend files.

 ---
 [LEAD-003] Define and document lead detail data contract

 - Objective: Establish and document the exact return shape of useLead(id) / GET /leads/:id, specifically including the assignedTo User object, so  
 all downstream tickets can rely on a known interface.
 - Why this exists: GET /leads/:id returns ILead & { activities: ILeadActivity[]; assignedTo?: User } — the full User object is included. But the   
 shared ILead interface does not reflect this. LEAD-012 (members fallback) and LEAD-011 (permission gating) both need to know whether
 lead.assignedTo is available in the detail sheet without a separate members lookup.
 - Scope:
   - Verify the actual Prisma query in leads.service.findOne() includes assignedTo: true.
   - Verify the controller return type.
   - Update the shared type ILead or add a ILeadDetail interface that includes assignedTo?: { id: string; name: string; email: string }.
   - Update useLead hook return type annotation to use ILeadDetail.
   - Update lead-detail-sheet.tsx prop type to use ILeadDetail instead of ILead if a separate type is created.
 - Out of scope: Changing the actual Prisma query. Changing what the endpoint returns. Frontend rendering logic (that is LEAD-012).
 - Depends on: LEAD-001, LEAD-002.
 - Files likely touched:
   - libs/shared/types/src/lib/types.ts
   - apps/frontend/sales-dashboard/src/hooks/use-leads.ts
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx (prop type only)
 - Commands to run:
 grep -n "assignedTo" apps/backend/core-service/src/modules/leads/leads.service.ts
 grep -n "ILead" libs/shared/types/src/lib/types.ts
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep leads | head -20
 - Implementation expectations:
   - If ILead already has an optional assignedTo field: verify the type is correct and document it.
   - If ILead does not include assignedTo: create ILeadDetail extends ILead { assignedTo?: { id: string; name: string; email: string } } in
 types.ts.
   - Update useLead return type: UseQueryResult<ILeadDetail>.
   - Update LeadDetailSheet props: lead: ILeadDetail.
   - The assignedTo shape must match what Prisma's include: { assignedTo: true } actually returns (id, name, email at minimum).
 - Acceptance criteria:
   - ILeadDetail (or updated ILead) includes assignedTo?: { id: string; name: string; email: string }.
   - useLead return type annotation reflects this.
   - tsc --noEmit passes with no new errors.
 - Evidence required before closing:
   - Diff of types.ts showing the new/updated interface.
   - tsc --noEmit output showing zero errors.
 - Must not change: The actual Prisma query. The API endpoint response. Any rendering logic.
 - Failure conditions: assignedTo type is defined as any. New type is not used in useLead. tsc fails.
 - Reviewer checklist:
   - ILeadDetail or updated ILead has typed assignedTo (not any).
   - useLead hook uses the updated type.
   - LeadDetailSheet props updated.
   - tsc --noEmit output attached.
 - Definition of done: A typed interface exists for the lead detail response including assignedTo. All callers use it.

 ---
 [LEAD-004] Fix api.ts changeLeadStatus to forward followUpDate

 - Objective: Update the API client method so the FOLLOW_UP status transition can include followUpDate in the request body.
 - Why this exists: Backend PATCH /leads/:id/status throws 400 Bad Request when status=FOLLOW_UP and followUpDate is absent. Current method
 signature only accepts status, making FOLLOW_UP transitions always fail at the API layer.
 - Scope: Single method in api.ts. Signature change only.
 - Out of scope: Hook changes (LEAD-005). UI changes (LEAD-006, LEAD-007).
 - Depends on: LEAD-001, LEAD-002.
 - Files likely touched:
   - apps/frontend/sales-dashboard/src/lib/api.ts
 - Commands to run:
 grep -n "changeLeadStatus" apps/frontend/sales-dashboard/src/lib/api.ts
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep api.ts | head -10
 - Implementation expectations:
   - Change: changeLeadStatus(id: string, status: string) → changeLeadStatus(id: string, status: string, followUpDate?: string)
   - Body: { status, ...(followUpDate ? { followUpDate } : {}) }
   - No other methods changed.
 - Acceptance criteria:
   - Method has three parameters, third optional.
   - When followUpDate is provided: body is { status, followUpDate }.
   - When followUpDate is omitted: body is { status } only (no followUpDate key, not even null).
   - tsc --noEmit passes.
 - Evidence required before closing:
   - Diff of api.ts showing only changeLeadStatus changed.
   - tsc --noEmit output.
 - Must not change: Any other lead API method. HTTP method or path.
 - Failure conditions: followUpDate is sent as null when absent. Other methods are touched.
 - Reviewer checklist:
   - Only changeLeadStatus changed in api.ts.
   - Body uses spread to conditionally include followUpDate.
   - tsc passes.
 - Definition of done: changeLeadStatus in api.ts accepts optional followUpDate and conditionally includes it in the request body.

 ---
 [LEAD-005] Update useChangeLeadStatus hook variables type to include followUpDate

 - Objective: Update the React Query mutation hook to accept and forward followUpDate to the updated api.changeLeadStatus.
 - Why this exists: The hook's mutation variables are typed as { id: string; status: LeadStatus }. This must be updated to { id: string; status:    
 LeadStatus; followUpDate?: string } so callers can pass the date.
 - Scope: Single hook in use-leads.ts.
 - Out of scope: Any UI component changes.
 - Depends on: LEAD-004.
 - Files likely touched:
   - apps/frontend/sales-dashboard/src/hooks/use-leads.ts
 - Commands to run:
 grep -n -A 15 "useChangeLeadStatus" apps/frontend/sales-dashboard/src/hooks/use-leads.ts
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep use-leads | head -10
 - Implementation expectations:
   - Mutation variables type: { id: string; status: LeadStatus; followUpDate?: string }.
   - In mutationFn: api.changeLeadStatus(variables.id, variables.status, variables.followUpDate).
   - Keep all existing cache invalidation (leadsKeys.lists()) and setQueryData logic unchanged.
   - Keep existing toast.success / toast.error calls unchanged.
 - Acceptance criteria:
   - Hook accepts { id, status, followUpDate? } as mutation variables.
   - followUpDate is forwarded to api.changeLeadStatus.
   - tsc --noEmit passes.
 - Evidence required before closing:
   - Diff of use-leads.ts showing only the variables type and mutationFn changed.
   - tsc --noEmit output.
 - Must not change: Cache invalidation logic. Toast messages. Query key factory.
 - Failure conditions: followUpDate is not forwarded. Cache invalidation logic altered. tsc fails.
 - Reviewer checklist:
   - Variables type includes optional followUpDate.
   - mutationFn passes all three args to API.
   - No other hook logic changed.
 - Definition of done: useChangeLeadStatus accepts and forwards optional followUpDate.

 ---
 [LEAD-006] Add followUpDate date-picker dialog in kanban for FOLLOW_UP drag-drop

 - Objective: When a lead card is dragged to the FOLLOW_UP column, display a date-picker dialog to collect followUpDate before calling the status   
 mutation. Do not call the mutation until the user confirms a date.
 - Why this exists: Without a date, the mutation returns 400. The card must not appear to move unless the mutation succeeds.
 - Scope: leads-kanban.tsx onDragEnd handler only. A dialog for date input. Mutation call updated.
 - Out of scope: Detail sheet status buttons (LEAD-007). Any other kanban changes.
 - Depends on: LEAD-005.
 - Files likely touched:
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/leads-kanban.tsx
 - Implementation expectations:
   a. Add state: const [pendingFollowUp, setPendingFollowUp] = useState<{ leadId: string } | null>(null).
   b. Add state: const [followUpDate, setFollowUpDate] = useState<string>('').
   c. In onDragEnd: when newStatus === LeadStatus.FOLLOW_UP and transition is valid per LEAD_STATUS_TRANSITIONS, call setPendingFollowUp({ leadId:  
 lead.id }) and return without calling the mutation. The card does NOT move optimistically.
   d. Render a Dialog (Radix Dialog pattern, consistent with codebase) with:
       - Title: "Set Follow-Up Date"
     - A <input type="date" /> bound to followUpDate state. Min date: today (use new Date().toISOString().split('T')[0]).
     - "Confirm" button: disabled if followUpDate is empty.
     - "Cancel" button.
   e. On confirm: call changeStatus.mutate({ id: pendingFollowUp.leadId, status: LeadStatus.FOLLOW_UP, followUpDate: new
 Date(followUpDate).toISOString() }), clear pendingFollowUp and followUpDate.
   f. On cancel: clear pendingFollowUp only. No mutation. Board state unchanged.
   g. All non-FOLLOW_UP drag transitions continue to call mutation directly (no dialog).
 - Commands to run:
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep leads-kanban | head -10
 - Acceptance criteria:
   - Dragging to FOLLOW_UP opens date dialog.
   - Confirm with date: mutation fires with { status: "FOLLOW_UP", followUpDate: "..." }, card moves to FOLLOW_UP column on success.
   - Cancel: no mutation, card stays in original column (board re-renders from server state).
   - Confirm button is disabled when no date selected.
   - Dragging to non-FOLLOW_UP column: no dialog, mutation fires immediately.
   - tsc --noEmit passes.
 - Evidence required before closing:
   - tsc --noEmit output clean.
   - Verification completed in LEAD-008.
 - Must not change: Transition validation logic (LEAD_STATUS_TRANSITIONS check). Non-FOLLOW_UP drag behavior.
 - Failure conditions: Card moves before mutation succeeds. Dialog appears for non-FOLLOW_UP drags. followUpDate sent as empty string or null.      
 Confirm button enabled with no date.
 - Reviewer checklist:
   - No optimistic board update before mutation.
   - followUpDate converted to ISO string before sending.
   - Confirm disabled when date empty.
   - Cancel leaves board unchanged.
   - tsc passes.
 - Definition of done: FOLLOW_UP drag triggers date dialog; mutation receives correct body only after user confirms a date.

 ---
 [LEAD-007] Add followUpDate date-picker in detail sheet FOLLOW_UP status button

 - Objective: When the FOLLOW_UP status transition button is clicked in LeadDetailSheet, show a date-picker dialog before calling the mutation.     
 Identical behavior to LEAD-006 but in the sheet component.
 - Why this exists: Detail sheet status buttons call changeStatus.mutate({ id, status }) without a date — 400 for FOLLOW_UP. Same fix, different    
 component.
 - Scope: Status button click handler in lead-detail-sheet.tsx only.
 - Out of scope: Kanban (LEAD-006). Other status buttons.
 - Depends on: LEAD-005.
 - Files likely touched:
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx
 - Implementation expectations:
   a. Add state: const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false).
   b. Add state: const [followUpDate, setFollowUpDate] = useState<string>('').
   c. In the status button onClick for FOLLOW_UP only: call setFollowUpDialogOpen(true) instead of calling mutation.
   d. Render a Dialog (consistent Radix Dialog pattern) inside the sheet with date input.
       - Min date: today.
     - Confirm button disabled when followUpDate is empty.
     - On confirm: changeStatus.mutate({ id: lead.id, status: LeadStatus.FOLLOW_UP, followUpDate: new Date(followUpDate).toISOString() }), close    
 dialog, reset followUpDate.
     - On cancel: close dialog, reset followUpDate.
   e. All other status transition buttons continue to call mutation directly.
 - Commands to run:
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep lead-detail | head -10
 - Acceptance criteria:
   - Clicking FOLLOW_UP button opens date dialog.
   - Confirming with a date fires mutation with correct body.
   - Canceling closes dialog, no mutation.
   - Non-FOLLOW_UP buttons fire mutation directly.
   - tsc --noEmit passes.
 - Evidence required before closing: Manual verification (see LEAD-008 TC-6 in Playwright suite LEAD-014).
 - Must not change: Other status button behavior. Existing toast logic on mutation success/error.
 - Failure conditions: Dialog shown for non-FOLLOW_UP buttons. followUpDate not reset after dialog closes. tsc fails.
 - Reviewer checklist:
   - Only FOLLOW_UP button triggers dialog.
   - followUpDate state reset on both confirm and cancel.
   - Confirm button disabled when empty.
   - tsc passes.
 - Definition of done: FOLLOW_UP status button in detail sheet shows date dialog; mutation receives correct payload on confirm.

 ---
 [LEAD-008] Mandatory verification: kanban FOLLOW_UP drag-drop with network evidence

 - Objective: Produce captured, reproducible evidence that a kanban drag-drop to the FOLLOW_UP column triggers the date dialog, and that the        
 resulting PATCH request body contains followUpDate. This ticket exists because Playwright drag-drop with @hello-pangea/dnd is unreliable and the   
 module cannot be marked complete without verified kanban behavior.
 - Why this exists: Kanban FOLLOW_UP is a required behavior (it is listed in the module exit criteria). "Manual verification" without specific      
 evidence is skippable. This ticket enforces non-skippable evidence capture.
 - Scope: Verification only. No code changes. Uses the running dev server.
 - Out of scope: Any code changes. Frontend tests (those are LEAD-014).
 - Depends on: LEAD-006 (kanban dialog implemented).
 - Approach — Playwright keyboard-driven test (preferred):
 @hello-pangea/dnd supports keyboard navigation. Use Playwright keyboard events:
   a. Focus the draggable card.
   b. Press Space to start drag.
   c. Press ArrowRight to move to next column (repeat as needed to reach FOLLOW_UP).
   d. Press Space to drop.
   e. Assert dialog appears.
   f. Fill date input, click Confirm.
   g. Assert PATCH request body contains followUpDate.

 Implement this as a standalone Playwright script (not part of the main test suite) run with:
 cd apps/frontend/sales-dashboard
 npx playwright test tests/kanban-followup-verify.spec.ts --headed
 - Fallback — HAR capture (if keyboard approach fails):
 If the keyboard approach fails due to dnd internals:
   a. Run app in dev mode.
   b. Open Chrome DevTools → Network tab → filter by "status".
   c. Manually drag a lead card to FOLLOW_UP column.
   d. Confirm dialog appears.
   e. Select a date and confirm.
   f. Export HAR file and capture a screenshot of the PATCH request body showing followUpDate.
   g. Attach both the HAR file and screenshot as artifacts in the commit message or a docs/verification/lead-kanban-followup.md note.
 - Files likely touched:
   - apps/frontend/sales-dashboard/tests/kanban-followup-verify.spec.ts (new, standalone, not part of main suite)
   - OR docs/verification/lead-kanban-followup.md (HAR/screenshot evidence)
 - Commands to run:
 # Preferred:
 npx playwright test tests/kanban-followup-verify.spec.ts --headed --reporter=list
 # OR: produce HAR export manually and confirm network tab shows followUpDate in PATCH body
 - Evidence required before closing (one of the following must exist):
   - Option A: Playwright test at tests/kanban-followup-verify.spec.ts passes (exit code 0), with assertion on PATCH request body.
   - Option B: Committed file at docs/verification/lead-kanban-followup.md containing: a screenshot of the Chrome Network tab showing the PATCH     
 /leads/:id/status request with body { "status": "FOLLOW_UP", "followUpDate": "..." }, AND confirmation that the date dialog appeared before the    
 request was sent.
 - Must not change: Application source code.
 - Failure conditions: Ticket closed without one of the above two evidence artifacts. Evidence shows request body is { "status": "FOLLOW_UP" } only 
  (no followUpDate).
 - Reviewer checklist:
   - Evidence artifact exists (test file OR verification doc).
   - PATCH body in evidence contains followUpDate field with a non-empty ISO date string.
   - Dialog appearance is confirmed (screenshot or test assertion).
 - Definition of done: One of the two evidence artifacts exists and confirms FOLLOW_UP drag-drop sends correct PATCH body with date.

 ---
 [LEAD-009] Wire edit lead: page state + detail sheet onEdit callback + modal lead prop

 - Objective: Make the edit lead flow reachable by connecting LeadFormModal's existing edit mode to a button in LeadDetailSheet via the page state. 
 - Why this exists: LeadFormModal fully supports edit mode (isEdit = !!lead), but page.tsx never passes a lead prop. The entire update flow is      
 unreachable from the UI.
 - Scope: Three files changed atomically. No new hooks. No new API endpoints.
 - Out of scope: Inline editing in the sheet. New API endpoints. Any changes to useUpdateLead hook.
 - Depends on: LEAD-001, LEAD-002, LEAD-003.
 - Files likely touched:
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/page.tsx
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-form-modal.tsx
 - Implementation expectations:
   a. page.tsx:
       - Add: const [editLead, setEditLead] = useState<ILeadDetail | null>(null).
     - Update <LeadFormModal>: add lead={editLead ?? undefined}.
     - Update <LeadFormModal onOpenChange>: on close (false), call setModalOpen(false) AND setEditLead(null).
     - Pass to <LeadDetailSheet>: onEdit={(lead) => { setEditLead(lead); setModalOpen(true); }}.
   b. lead-detail-sheet.tsx:
       - Add prop: onEdit: (lead: ILeadDetail) => void.
     - Render an "Edit" icon button in the sheet header (use Pencil icon from lucide-react, consistent with codebase style).
     - onClick: call onEdit(lead).
   c. lead-form-modal.tsx:
       - Verify: useEffect(() => { if (lead) { reset({ title: lead.title, name: lead.name ?? '', email: lead.email ?? '', ... }); } else {
 reset(defaultValues); } }, [lead, reset]).
     - If this useEffect is missing, add it. If it exists, verify it resets correctly on lead change.
     - Verify form title: renders "Edit Lead" when isEdit is true, "New Lead" when false.
 - Commands to run:
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep -E "(page|detail-sheet|form-modal)" | head -20
 - Acceptance criteria:
   - Edit button is visible in detail sheet header.
   - Clicking Edit opens LeadFormModal with all fields pre-filled from the lead's current data.
   - Submitting the form calls useUpdateLead.mutate({ id: lead.id, ...formData }).
   - On success: list refreshes and detail sheet reflects updated values.
   - Clicking "New Lead" button in page header opens empty modal (not pre-filled).
   - Closing edit modal without saving: editLead state is cleared; reopening new lead modal shows empty form.
   - tsc --noEmit passes.
 - Evidence required before closing:
   - tsc --noEmit output clean.
   - Manual verification of steps in LEAD-014 TC-4.
 - Must not change: useUpdateLead hook. API endpoint. useCreateLead behavior.
 - Failure conditions: Edit modal pre-fills from previous lead when reopened for a different lead (stale state). Create modal shows pre-filled      
 data. tsc fails.
 - Reviewer checklist:
   - editLead state cleared on modal close.
   - useEffect in modal resets form when lead prop changes.
   - "New Lead" opens empty form.
   - tsc output attached.
 - Definition of done: Edit lead is reachable from the UI, updates correctly, and create flow is unaffected.

 ---
 [LEAD-010] Add required validation for brandId in LeadFormModal

 - Objective: Prevent form submission when brandId is not selected; show a visible field-level error message.
 - Why this exists: Backend CreateLeadDto requires brandId. Current form allows empty brand and relies on server rejection with no user-facing      
 field hint.
 - Scope: LeadFormModal only. One field's validation rule.
 - Out of scope: Other form fields. Backend validation. Edit mode (brand is pre-filled for existing leads).
 - Depends on: LEAD-009 (modal stable for both create and edit).
 - Files likely touched:
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-form-modal.tsx
 - Implementation expectations:
   - Add to useForm registration after useForm(...): register('brandId', { required: 'Brand is required' }).
   - In brand Select onValueChange: setValue('brandId', value, { shouldValidate: true }).
   - Render below the Select: {errors.brandId && <p className="text-sm text-red-400 mt-1">{errors.brandId.message}</p>}.
   - For edit mode: brand is pre-filled via reset() in LEAD-009. Validation must not fire on open.
   - Follow the react-hook-form + Select pattern documented in project memory.
 - Commands to run:
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep form-modal | head -10
 - Acceptance criteria:
   - Submitting create form with no brand selected: "Brand is required" appears below brand Select. No API request is made.
   - Selecting a brand clears the error.
   - Submitting after brand selected: API call proceeds.
   - Edit modal with pre-filled brand: error does not appear on open.
   - tsc --noEmit passes.
 - Evidence required before closing: LEAD-014 TC-2 passes (invalid submit test case).
 - Must not change: Other field validation. Form submission logic for non-brandId fields.
 - Failure conditions: API called when brandId is empty. Error not cleared after brand selected. Edit modal shows brand error on open.
 - Reviewer checklist:
   - register('brandId', { required: ... }) present.
   - setValue uses { shouldValidate: true }.
   - Error message renders below Select.
   - tsc passes.
 - Definition of done: Brand select has required client-side validation. Error renders. API not called without brandId.

 ---
 [LEAD-011] Frontend role-based permission gating for delete, assign, and convert

 - Objective: Hide (not disable) delete, assign, and convert controls from roles the backend will reject.
 - Why this exists: Backend enforces: delete → OWNER/ADMIN only; assign → OWNER/ADMIN/SALES_MANAGER; convert → OWNER/ADMIN/SALES_MANAGER. UI shows  
 all controls to all roles, creating 403 error states with no UI context.
 - Source of truth for role:
   - Use useAuth() hook. Specifically: const { user } = useAuth(). The role is at user?.role typed as UserRole | undefined.
   - Use hasMinimumRole(userRole, requiredRole) from @sentra-core/types.
 - Loading state behavior:
   - While user is undefined (auth still loading): render nothing for permission-gated controls. Do not render a disabled placeholder. Do not       
 render a loading spinner for each button.
 - Rendering rule: Unauthorized controls must be not rendered (return null or conditional rendering). Must not use disabled as the gating
 mechanism. Rationale: a disabled button still reveals the existence of the action and invites support questions.
 - Scope: Three specific UI locations only.
 - Out of scope: Backend changes. Status change buttons (agents may change status). Note/add functionality.
 - Depends on: LEAD-009.
 - Files likely touched:
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/leads-table.tsx
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx
 - Per-location implementation:

 - 1. Table delete button:
 // In leads-table.tsx
 const { user } = useAuth();
 const canDelete = user ? hasMinimumRole(user.role, UserRole.ADMIN) : false;
 // In column def for actions:
 {canDelete && <button onClick={...}>Delete</button>}
 // If no actions remain for a role, the actions column may be omitted entirely.

 - 2. Detail sheet — Assign dropdown:
 const canAssign = user ? hasMinimumRole(user.role, UserRole.SALES_MANAGER) : false;
 // Render assign Select only if canAssign.
 // If !canAssign: render read-only text: lead.assignedTo?.name ?? (lead.assignedToId ? 'Assigned' : 'Unassigned')

 - 3. Detail sheet — Convert button:
 const canConvert = user ? hasMinimumRole(user.role, UserRole.SALES_MANAGER) : false;
 {canConvert && !lead.convertedClientId && lead.status !== 'CLOSED' && <ConvertButton />}
 - Commands to run:
 grep -n "useAuth\|canDelete\|canAssign\|canConvert" \
   apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/leads-table.tsx \
   apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep -E "(leads-table|detail-sheet)" | head -10
 - Acceptance criteria by role:
 | Role                     | Delete       | Assign                              | Convert      |
 |--------------------------|--------------|-------------------------------------|--------------|
 | FRONTSELL_AGENT          | Not rendered | Not rendered (read-only text shown) | Not rendered |
 | UPSELL_AGENT             | Not rendered | Not rendered                        | Not rendered |
 | PROJECT_MANAGER          | Not rendered | Not rendered                        | Not rendered |
 | SALES_MANAGER            | Not rendered | Rendered                            | Rendered     |
 | ADMIN                    | Rendered     | Rendered                            | Rendered     |
 | OWNER                    | Rendered     | Rendered                            | Rendered     |
 | Loading (user undefined) | Not rendered | Not rendered                        | Not rendered |

 - Evidence required before closing: LEAD-014 TC-8 and TC-9 pass.
 - Must not change: Status change buttons (visible to all authenticated roles). Note-add functionality.
 - Failure conditions: disabled used instead of conditional render. Controls visible during auth loading. tsc fails.
 - Reviewer checklist:
   - hasMinimumRole used (not manual role string comparison).
   - user?.role is the input to role checks.
   - Controls not rendered (not disabled) for unauthorized roles.
   - Auth loading state results in no render.
   - tsc passes.
 - Definition of done: Delete/assign/convert not rendered for unauthorized roles. No 403s from role-appropriate actions.

 ---
 [LEAD-012] Handle useMembers() 403 gracefully with per-view fallback text

 - Objective: Prevent UI breakage and define specific fallback text for each view when useMembers() fails (typically 403 for agents).
 - Why this exists: Agents cannot load /organization/members. Enrichment via membersMap produces undefined assignee display, resulting in blank or  
 broken cells. The full User object IS available in the detail endpoint (LEAD-003) but NOT in the list endpoint, so each view needs a different     
 fallback strategy.
 - Fallback text definitions (exact, not to be approximated):
   - lead.assignedToId === null | undefined → display: "Unassigned"
   - lead.assignedToId is non-null but member name unavailable (useMembers errored) → display: "Assigned"
   - Member name loaded successfully → display: full name string
 - Per-view behavior:

 - Table (list endpoint, no assignedTo object):
   - Source: lead.assignedToId + membersMap
   - Fallback: membersMap.get(lead.assignedToId) ?? (lead.assignedToId ? 'Assigned' : 'Unassigned')
   - Do not show any error indicator for the 403.

 Kanban card (list endpoint, no assignedTo object):
   - If kanban cards display assignee: apply same fallback as table.
   - If kanban cards do not display assignee: no change needed (document this).

 Detail sheet (detail endpoint, has assignedTo User object from LEAD-003):
   - For read-only display (when canAssign = false per LEAD-011): lead.assignedTo?.name ?? (lead.assignedToId ? 'Assigned' : 'Unassigned')
   - For assign dropdown (when canAssign = true): useMembers() members list populates dropdown. If useMembers errors AND canAssign is true: show an 
  empty or error state in the dropdown only; do not block the rest of the sheet.
 - 403 error handling:
   - Suppress the 403 entirely. Do not toast. Do not console.error. Do not show any error indicator.
   - In TanStack Query v5: set retry: false on useMembers() so it does not retry the 403 repeatedly.
   - useMembers should have retry: false if it doesn't already.
 - Scope: page.tsx enrichment logic; detail sheet read-only assignee display; useMembers hook retry config.
 - Out of scope: Backend changes. Showing member names to roles that cannot access the endpoint.
 - Depends on: LEAD-003 (assignedTo shape known), LEAD-011 (role gating determines which view to use for assignee).
 - Files likely touched:
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/page.tsx
   - apps/frontend/sales-dashboard/src/hooks/use-organization.ts
   - apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx
 - Commands to run:
 grep -n "useMembers\|membersMap\|assigneeName\|assignedTo" \
   apps/frontend/sales-dashboard/src/app/dashboard/leads/page.tsx \
   apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx
 cd apps/frontend/sales-dashboard && npx tsc --noEmit 2>&1 | grep -E "(page|detail-sheet|use-organization)" | head -10
 - Acceptance criteria:
   - Agent loads leads list: all rows show either a member name OR "Assigned" OR "Unassigned". No blank cells. No undefined. No console errors. No  
 error toast.
   - Agent opens detail sheet: assignee reads lead.assignedTo?.name ?? "Unassigned" (does NOT depend on useMembers).
   - High-privilege user (admin) sees full names as before.
   - tsc --noEmit passes.
 - Evidence required before closing:
   - LEAD-014 TC (agent loads leads page) passes.
   - OR: screenshot showing leads table as FRONTSELL_AGENT with no blank assignee cells and no error toast.
 - Must not change: Member name display for high-privilege roles. useMembers query key or fetch logic (only add retry: false).
 - Failure conditions: undefined or blank displayed for assignee. Error toast appears for 403. tsc fails.
 - Reviewer checklist:
   - Fallback text matches spec exactly ("Assigned" / "Unassigned").
   - retry: false added to useMembers.
   - Detail sheet uses lead.assignedTo?.name (not membersMap) for read-only display.
   - No 403 toast or console.error.
   - tsc passes.
 - Definition of done: All three views render assignee without errors when useMembers returns 403. Exact fallback text matches spec.

 ---
 [LEAD-013] Add Prisma P2002 error handling in leads.service.convert()

 - Objective: Return HTTP 409 when lead conversion fails because the client email already exists in the organization.
 - Why this exists: Prisma throws PrismaClientKnownRequestError code P2002 on @@unique([email, organizationId]) violation. This propagates as 500.  
 Users receive no actionable error message.
 - Scope: Single try/catch addition in leads.service.ts convert() method.
 - Out of scope: Frontend convert modal changes. Any other service methods.
 - Depends on: LEAD-001.
 - Files likely touched:
   - apps/backend/core-service/src/modules/leads/leads.service.ts
 - Implementation expectations:
 import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
 import { ConflictException } from '@nestjs/common';

 // In convert():
 try {
   // existing transaction logic
 } catch (error) {
   if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
     throw new ConflictException(
       'A client with this email address already exists in your organization'
     );
   }
   throw error;
 }
   - Import path for PrismaClientKnownRequestError must match what is already used elsewhere in the codebase. Check for existing usage with: grep   
 -r "PrismaClientKnownRequestError" apps/backend/.
   - Do not change the happy-path convert logic.
 - Commands to run:
 grep -rn "PrismaClientKnownRequestError" apps/backend/core-service/src/ | head -5
 cd apps/backend/core-service && npx tsc --noEmit 2>&1 | grep leads.service | head -10
 - Acceptance criteria:
   - POST /leads/:id/convert with an email matching an existing client in the org returns HTTP 409 with body { error: { code: "ConflictException",  
 message: "A client with this email address already exists in your organization", ... } }.
   - Happy-path convert (new email) still succeeds with 201.
   - Lead record and client record are consistent (transaction rolls back fully on conflict — no partial state).
 - Evidence required before closing: LEAD-015 TC-B6 passes.
 - Must not change: Happy-path convert logic. Activity creation. Cache invalidation.
 - Failure conditions: 500 still returned for duplicate email. Happy-path broken. tsc fails.
 - Reviewer checklist:
   - P2002 code checked explicitly (not generic catch-all).
   - ConflictException from @nestjs/common used.
   - All other errors re-thrown.
   - tsc passes.
 - Definition of done: Duplicate email during convert returns 409 with exact message. No 500.

 ---
 [LEAD-014] Playwright e2e tests for Lead CRUD, status changes, and permission gating

 - Objective: Add automated Playwright e2e tests covering all Lead CRUD operations and key flows.
 - Why this exists: Zero automated coverage of the lead module. No test suite confirms create/edit/delete/status-change work end-to-end.
 - Scope: New test file. Tests run against a live dev server.
 - Out of scope: Backend unit tests (LEAD-015). Kanban drag-drop (LEAD-008). Comm email tab.
 - Depends on: LEAD-004 through LEAD-013 all complete.
 - Files to create:
   - apps/frontend/sales-dashboard/tests/leads.spec.ts
 - Test file location: apps/frontend/sales-dashboard/tests/ (same directory as critical-flow.spec.ts).
 - Test conventions to follow (from critical-flow.spec.ts):
   - Serial mode: test.describe.configure({ mode: 'serial' }).
   - Auth: form-based login using a test account (use dynamic Date.now() based credentials or a fixed test account).
   - Network waits: page.waitForLoadState('networkidle').
   - Assertions: expect(locator).toBeVisible({ timeout: 10000 }).
   - Do not use page.waitForTimeout() — diagnose and fix flakiness instead.
 - Test cases:

 - TC-1: Create lead — happy path (as SALES_MANAGER)
   - Login as SALES_MANAGER.
   - Click "New Lead" button.
   - Fill title field with unique string.
   - Select a brand from dropdown.
   - Click Save.
   - Assert toast "Lead created" appears OR new lead row is visible in table with the title.

 TC-2: Create lead — brandId missing shows validation error
   - Click "New Lead".
   - Fill title only (no brand selected).
   - Click Save.
   - Assert "Brand is required" text is visible.
   - Assert no navigation or list update occurs.

 TC-3: Read lead detail
   - Switch to table view.
   - Click a lead row.
   - Assert detail sheet opens.
   - Assert lead title is visible inside the sheet.
   - Assert status badge is visible.

 TC-4: Edit lead
   - Open detail sheet for a lead.
   - Click "Edit" button in sheet header.
   - Assert modal opens with title field pre-filled.
   - Change title to a new unique string.
   - Click Save.
   - Assert list row updates to new title (wait for networkidle).
   - Re-open detail sheet for same lead; assert new title is shown.

 TC-5: Delete lead (as ADMIN)
   - Login as ADMIN.
   - Click delete icon for a lead in table.
   - Confirm deletion in confirm dialog.
   - Assert lead no longer appears in list.

 TC-6: Status change to FOLLOW_UP via detail sheet
   - Open detail sheet for a NEW lead.
   - Click FOLLOW_UP status button.
   - Assert date-picker dialog is visible.
   - Fill date input with a future date.
   - Click Confirm.
   - Assert status badge in sheet shows "FOLLOW_UP".

 TC-7: Status change to non-FOLLOW_UP — no dialog appears
   - Open detail sheet for a NEW lead.
   - Click CONTACTED status button.
   - Assert NO dialog appears.
   - Assert status badge updates to CONTACTED.

 TC-8: Permission gating — FRONTSELL_AGENT cannot see delete
   - Login as FRONTSELL_AGENT.
   - Switch to table view.
   - Assert delete icon/column is NOT present in any row.

 TC-9: Permission gating — FRONTSELL_AGENT cannot see convert
   - As FRONTSELL_AGENT, open a lead detail sheet.
   - Assert no "Convert" button is present.
 - Commands to run:
 cd apps/frontend/sales-dashboard
 npx playwright test tests/leads.spec.ts --reporter=list
 # Run 3 times to confirm no flakiness:
 for i in 1 2 3; do npx playwright test tests/leads.spec.ts --reporter=list; done
 - Acceptance criteria: All 9 TCs pass across 3 consecutive runs.
 - Evidence required before closing: Terminal output from 3 consecutive runs showing all 9 tests passing.
 - Must not change: critical-flow.spec.ts. Playwright config. App source files.
 - Failure conditions: Any test uses waitForTimeout. Any test passes on run 1 but fails on runs 2 or 3 (flakiness). Fewer than 9 TCs implemented.   
 - Reviewer checklist:
   - 9 TCs present and named as above.
   - No waitForTimeout used.
   - 3-run evidence attached.
   - Serial mode configured.
 - Definition of done: leads.spec.ts has 9 TCs. All pass in 3 consecutive runs. No waitForTimeout.

 ---
 [LEAD-015] Backend integration tests: changeStatus validation and visibility scoping

 - Objective: Add NestJS integration tests for the two highest-risk lead service behaviors: FOLLOW_UP date enforcement and role-based visibility    
 scoping.
 - Why this exists: No backend tests exist for lead service. These behaviors are security-sensitive (scoping) and contract-critical (FOLLOW_UP date 
  enforcement). Regressions will not be caught otherwise.
 - Scope: New spec file colocated with the service.
 - Out of scope: Controller HTTP tests. Frontend tests.
 - Depends on: LEAD-001, LEAD-013.
 - Files to create:
   - apps/backend/core-service/src/modules/leads/leads.service.spec.ts
 - Test file location and pattern: Colocated with leads.service.ts. Use Test.createTestingModule() from @nestjs/testing (follow
 app.controller.spec.ts pattern). Mock PrismaService, CacheService, and TeamsService as needed. Use jest.fn() for Prisma client methods.
 - Test cases:

 - TC-B1: changeStatus to FOLLOW_UP without followUpDate throws BadRequestException
 // Mock lead exists with status NEW
 await expect(
   service.changeStatus(leadId, orgId, userId, { status: LeadStatus.FOLLOW_UP })
 ).rejects.toThrow(BadRequestException);

 - TC-B2: changeStatus to FOLLOW_UP with followUpDate succeeds
 const result = await service.changeStatus(leadId, orgId, userId, {
   status: LeadStatus.FOLLOW_UP,
   followUpDate: '2026-06-01',
 });
 expect(result.status).toBe(LeadStatus.FOLLOW_UP);
 expect(result.followUpDate).toBeTruthy();

 - TC-B3: changeStatus to CONTACTED without followUpDate succeeds
 await expect(
   service.changeStatus(leadId, orgId, userId, { status: LeadStatus.CONTACTED })
 ).resolves.not.toThrow();

 - TC-B4: findAll for FRONTSELL_AGENT only returns own leads
 // Two leads: one with assignedToId=userId, one with assignedToId=otherUserId
 const result = await service.findAll(orgId, {}, userId, UserRole.FRONTSELL_AGENT);
 expect(result.data.every(l => l.assignedToId === userId)).toBe(true);

 - TC-B5: findAll for ADMIN returns all org leads
 const result = await service.findAll(orgId, {}, adminId, UserRole.ADMIN);
 expect(result.data.length).toBeGreaterThanOrEqual(2);

 - TC-B6: convert with duplicate email throws ConflictException
 // Mock Prisma to throw PrismaClientKnownRequestError with code P2002
 await expect(
   service.convert(leadId, orgId, userId, { email: 'existing@example.com', ... })
 ).rejects.toThrow(ConflictException);
 - Commands to run:
 cd apps/backend/core-service
 npx jest --testPathPattern=leads.service.spec.ts --verbose
 - Acceptance criteria: All 6 TCs pass. jest exits 0.
 - Evidence required before closing: Terminal output from jest --testPathPattern=leads.service.spec.ts --verbose showing 6 passing tests.
 - Must not change: leads.service.ts logic. Existing app-level specs.
 - Failure conditions: Any test is skipped (test.skip). Fewer than 6 TCs implemented. Tests mock so aggressively that actual service logic is not   
 exercised.
 - Reviewer checklist:
   - 6 TCs present and named as above.
   - No test.skip or .only.
   - Service methods called directly (not via HTTP).
   - Jest output attached showing 6 passing.
 - Definition of done: leads.service.spec.ts has 6 TCs. All pass. Jest exits 0.

 ---
 5. Module Exit Criteria

 The Lead CRUD module is complete when ALL of the following conditions are met:

 Build

 - tsc --noEmit produces zero errors in lead-related paths in both backend and frontend.

 CRUD

 - Create: form enforces brandId client-side; lead appears in list on submit.
 - Read: list loads with pagination, status/brand/assignee/date filters, and search. Detail sheet shows all data.
 - Update: Edit button in detail sheet opens pre-filled modal; submit updates record; list and detail reflect changes.
 - Delete: OWNER/ADMIN can delete; lead disappears from list. Other roles do not see the delete control.

 Status Changes

 - Non-FOLLOW_UP transitions fire immediately without dialog.
 - FOLLOW_UP transitions via detail sheet show date dialog; confirm sends { status, followUpDate }; cancel has no effect.
 - FOLLOW_UP transitions via kanban drag-drop are verified per LEAD-008 evidence requirements.
 - Backend rejects FOLLOW_UP without followUpDate (400). Backend integration test TC-B1 confirms this.

 Permission Parity

 - FRONTSELL_AGENT / UPSELL_AGENT: delete, assign, convert not rendered.
 - PROJECT_MANAGER: delete, assign, convert not rendered.
 - SALES_MANAGER: assign and convert rendered; delete not rendered.
 - ADMIN / OWNER: all controls rendered.
 - Status change and note-add buttons: visible to all authenticated roles.

 Graceful Degradation

 - Agents can load leads list without console errors or blank cells when useMembers returns 403.
 - Assignee displays "Unassigned" or "Assigned" per exact spec in all three views.

 Convert Error Handling

 - Duplicate email during convert returns 409 with message "A client with this email address already exists in your organization".

 Tests

 - All 9 Playwright TCs in leads.spec.ts pass in 3 consecutive runs.
 - All 6 backend integration TCs in leads.service.spec.ts pass.
 - LEAD-008 evidence artifact exists and confirms FOLLOW_UP kanban mutation body.

 ---
 6. Risks and Open Questions

 Risk 1: Prisma client regeneration vs. schema migration

 If LEAD-000 finds that backend errors are due to a stale Prisma client (generated files out of sync with schema), prisma generate resolves it      
 without any DB migration. If schema migrations are missing (new columns in schema not applied to DB), prisma migrate dev would be required — this  
 could require a dev DB reset. LEAD-000 must determine which case applies before LEAD-001 executes.

 Risk 2: Kanban drag-drop keyboard navigation may vary by dnd version

 @hello-pangea/dnd keyboard navigation (Space to pick up, Arrow to move, Space to drop) works in most configurations but can be affected by focus   
 management. If LEAD-008's keyboard-based Playwright test fails due to focus trapping, fall back to the HAR evidence approach specified in the      
 ticket.

 Risk 3: useMembers retry behavior may cause excessive 403 requests

 If useMembers does not have retry: false, TanStack Query v5 defaults to 3 retries with exponential backoff. For a 403 (not retryable), this        
 produces 4 total failed requests on every page load. LEAD-012 must add retry: false to suppress this.

 Risk 4: Edit modal stale state when multiple leads opened

 If a user opens detail sheet for Lead A, clicks Edit, closes the modal, then opens Lead B's detail sheet and clicks Edit — the editLead state must 
  update to Lead B. This relies on LEAD-009's useEffect in the modal resetting correctly when the lead prop changes. Reviewer must test this        
 specific sequence.

 Open question (no code impact): Should agents be able to self-assign leads?

 Currently, assign is restricted to SALES_MANAGER+ by the backend. An agent cannot assign a lead to themselves. If this is intentional product      
 behavior, no change is needed. If agents should be able to self-assign only, a separate backend endpoint or guard change would be required. This   
 is out of scope for this plan but should be confirmed with product before LEAD-011 closes.