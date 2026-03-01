📑 Project Specification: SentraCore Ecosystem
  Version: 1.0 (Planning Phase)
  Modules: Sales Dashboard | Project Management | Client Portal


  1. Executive Summary
  SentraCore ek integrated SaaS platform hai jo agency business ko end-to-end manage karta hai. Iska maqsad "Gig Operation" se "Professional Enterprise" level
  ki efficiency hasil karna hai.
   * Sales Dashboard: Leads generate aur close karna.
   * Project Management (The Factory): Production workflow aur quality control.
   * Client Portal (The Window): Client interaction, approvals, aur delivery.

  ---

  2. The Project Management (PM) Engine


  Feature 1: Advanced Template Engine (SOPs as Code)
   * Modular Blueprints: Har business line (Publishing, Web, Marketing) ke liye alag templates.
   * CRUD for Templates: Admin naye workflows bana sakta hai, delete kar sakta hai, ya update kar sakta hai.
   * SLA & Auto-Scheduling: Har stage ka default "Time-to-Complete" hoga jo final delivery date auto-calculate karega.
   * Assignment Logic (The "Who" Problem):
       * Manual Assign: Lead Designer specific person (Editor/Artist) ko select karega.
       * Pool/Claim: Task ek common queue mein jayega jahan se koi bhi available editor usey "Claim" kar sakega.
       * Round Robin: System automatically bari-bari assign karega.


  Feature 2: Performance & Accountability System
   * Role Hierarchy: Project Manager (PM) -> Lead Designer (Supervisor) -> Artist (Execution).
   * Action-Based Performance:
       * Artist Score: Task completion speed aur QC pass rate par depend karega.
       * Lead Score: Overall project deadline aur client satisfaction (Net Promoter Score) par depend karega.
   * Revision Metrics:
       * Internal Revision: Team ki ghalti (Score negative).
       * External Revision: Client ki subjective choice (No negative score).


  Feature 3: Quality Control (QC) & Stage-Gates
   * No Self-Approval: Koi bhi artist apna kaam khud approve nahi kar sakta.
   * Self-QC Checklists: Submit karne se pehle artist ko mandatory checklist confirm karni hogi.
   * QC Rejection Loop: 3 baar rejection par automatic notification "Department Head" ko jayegi.
   * PM Bypass: Urgent cases mein PM QC skip kar sakega, lekin ye system mein "Red Flag" ke taur par record hoga.
   * Sample-Based QC: High volume tasks (e.g., 100 social media posts) mein sirf 10-20% ka audit hoga.


  Feature 4: Centralized Communication & Approvals
   * Task-Level Chat: Internal team discussion ke liye har task ka apna comment section.
   * External Hub: Client Portal ke andar direct messaging system.
   * Email-to-Portal Sync: Client email ka reply karega toh wo automatically portal ke chat thread mein aa jayega.
   * Immutable Approval Logs: Client jab "Approve" click karega, system timestamp, IP, aur version ID record karega for future dispute protection.

  ---

  3. The "Unified Flow" (How it Syncs)


   1. Sales -> Project: Jab Sales Dashboard mein payment confirm hogi (Authorize.Net/Stripe), system automatically Project Management mein relevant template ke
      sath project create kar dega.
   2. Project -> Client: Jab production team (Artist + QC) satisfy ho jayegi, PM "Publish to Client" click karega.
   3. Client -> Project: Client Client Portal par login karke design dekhega. Agar "Reject" karega toh notification seedha Artist aur PM ko jayegi.
   4. Upsell Loop: Agar project ke beech mein client extra revision ya extra feature mangta hai, PM wahan se "Upsell Request" generate karega jo wapis
      Sales/Invoicing module se link ho jayegi.

  ---


  4. Technical Stack (Current Status)
   * Backend: NestJS Microservices (PostgreSQL via Prisma).
   * Frontend: Next.js (TanStack Query, Zustand, Framer Motion).
   * Storage: Wasabi S3 (with CDN) for high-speed file delivery.
   * Infrastructure: Redis for Caching, RabbitMQ for Event Bus (Sales to Project sync).

  ---


  5. Next Steps for Planning
   1. Database Schema Design: Project, Stage, Task, Assignment, QC_Log, Message tables ka relationship define karna.
   2. API Endpoint Mapping: Frontend aur Backend ke darmiyan communication contracts.
   3. UI/UX Wireframing: PM Dashboard aur Kanban view ka design.
