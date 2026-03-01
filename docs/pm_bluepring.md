 🚀 SentraCore: Project Management Ecosystem Blueprint
  Status: Planning Phase (Locked Requirements)
  Objective: Transform agency operations into a professional, automated, and quality-driven "Publishing House" model.

  ---


  🏗️ 1. The Core Engine: Smart Templates (SOPs)
  Humein manually projects nahi banane, balki Blueprints use karne hain.
   * Modular Templates: Har business line (Book Publishing, Web Dev, Marketing) ke liye alag stages aur tasks predefined honge.
   * Stage-Level Tagging: Har stage ke saath ek Department tag (e.g., DESIGN, EDITING) juda hoga. Isse automatic filtering aur visibility handle hogi.
   * Dynamic Workflows: PM kisi bhi project mein specific stages ko add/remove/skip kar sakega.
   * SLA Engine: Template mein har stage ka default "Time-to-Complete" hoga jo auto-calculate karega final delivery date.

  ---


  👥 2. Roles & Intelligent Assignment
  "In-house employees" ke liye flexible assignment logic.
   * Global Roles: DESIGNER, EDITOR, DEVELOPER, QC_REVIEWER, PM, ADMIN.
   * Assignment Strategies:
       1. Manual: Lead Designer kisi specific artist ko select karega.
       2. Task Pool: Available team members task ko "Claim" kar sakenge.
       3. Smart Balance: System workload dekh kar auto-assign karega.
   * Explicit Membership: Sirf wahi project "My Tasks" mein dikhega jahan user assigned hai.

  ---


  🛠️ 3. Quality Control (QC) & "Stage-Gates"
  "No one marks their own work as perfect."
   * Mandatory Self-QC: Artist ko submit karne se pehle ek checklist confirm karni hogi.
   * The QC Loop:
       * Artist -> QC Reviewer -> (Approve/Reject).
       * Agar reject ho, toh feedback ke sath wapis artist ke paas.
       * 3-Strikes Rule: 3 baar rejection par automatic alert "Department Head" ko jayega.
   * PM Bypass: Urgent cases mein PM QC skip kar sakta hai, lekin ye "Red Flag" ke sath log hoga.

  ---


  📊 4. Performance & History Tracking
  "Responsibility follows Action" principle.
   * Junction Table (`TaskAssignments`): Hum history maintain karenge ke Ali ne 5 din kaam kiya aur phir Hamza ne 2 din. Ali ka record khatam nahi hoga.
   * Metrics:
       * Internal Quality Score: QC rejections par depend karega.
       * External Score: Client revisions (ghalti vs. pasand) par depend karega.
   * Handover Wizard: Admin ek click par "Ali" ke saare Active projects "Hamza" ko transfer kar sakega, jabke completed projects ka record "Ali" ke naam hi
     rahega.

  ---


  👁️ 5. Visibility: "My Work" vs. "Gallery"
  Information overload se bachne ka tarika.
   * My Workspace (Focus): Sirf wahi tasks jahan user currently assigned hai. Zero noise.
   * Department Gallery (Discovery): Designer apne department ke saare projects (even others' work) Read-Only dekh sakega for inspiration/consistency.
   * Logic: Gallery automatically filter hogi user ke role aur stage-tags (DESIGN, EDITING) ke mutabiq.

  ---


  💬 6. Centralized Communication & Approvals
  No more WhatsApp/External Emails for production.
   * Task-Level Chat: Internal team ki technical discussion ke liye.
   * Client Messaging Hub: Portal ke andar PM aur Client ki direct chat.
   * Email-to-Portal Sync: Client email reply karega toh wo portal thread mein khud aa jayega.
   * Immutable Approval Logs: Client jab "Approve" click karega, system Version ID, IP, aur Timestamp ka snapshot save karega.

  ---


  📂 7. Technical Infrastructure
   * Storage: Wasabi S3 with CDN. Signed URLs for security (15-20 min expiry).
   * Database: Prisma (PostgreSQL).
   * Schema Highlights:
       * Project (Main)
       * ProjectStage (with Dept Tag)
       * Task (Smallest unit)
       * TaskAssignments (History Log)
       * QCLog (Audit trail)
       * ApprovalSnapshot (Legal proof)

  ---