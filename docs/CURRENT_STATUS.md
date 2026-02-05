# Sentra Core System - Current Status Report
**Last Updated:** February 05, 2026
**Architecture:** Microservices (Nx Monorepo)

## 1. Project Overview
**Goal:** Production-grade ERP/CRM for Software Agencies (SaaS).
**Key Features:** Multi-tenancy (Organization -> Brand), Sales Dashboard, Client Portal, Email Automation (Agents), Finance.

## 2. Tech Stack & Infrastructure
| Component | Technology | Port (Local) | Description |
| :--- | :--- | :--- | :--- |
| **Monorepo** | Nx | N/A | Workspace management |
| **Backend Framework** | NestJS | See Services | Microservices |
| **Frontend Framework** | Next.js | 4200 / 4201 | Dashboard & Portal |
| **Primary DB** | PostgreSQL | 5432 | Transactional Data (Leads, Orders) |
| **Secondary DB** | MongoDB | 27017 | Unstructured Data (Emails, Logs) |
| **Cache / Queue** | Redis | 6379 | Caching & Job Queue |
| **Message Broker** | RabbitMQ | 5672 / 15672 | Event Bus |

## 3. Microservices Breakdown

### A. API Gateway (`apps/backend/api-gateway`)
* **Port:** `3333` (Defined in `.env` as `PORT_GATEWAY`)
* **Role:** Single Entry Point. Handles Auth Validation, Rate Limiting, and Routing to internal services.
* **Status:** Created. Pending Routing Logic.

### B. Core Service (`apps/backend/core-service`)
* **Port:** `3001` (Defined in `.env` as `PORT_CORE`)
* **Role:** Main Business Logic. Handles Organizations, Brands, Users, Leads, Clients, Finance.
* **Database:** PostgreSQL (via Prisma).
* **Status:** **ACTIVE**. Database connected. Server running.

### C. Communication Service (`apps/backend/comm-service`)
* **Port:** `3002` (Defined in `.env` as `PORT_COMM`)
* **Role:** Handles Email Sync (Gmail API), Notifications, Webhooks.
* **Database:** MongoDB (via Mongoose).
* **Status:** Created. Setup Pending.

## 4. Database Schema (PostgreSQL - Prisma)
**Location:** `libs/backend/prisma-client/prisma/schema.prisma`

### Key Modules:
1.  **Multi-Tenancy:**
    * `Organization` (Tenant) -> `Brand` (Sub-tenant/Workspace).
    * `Brand` has `domain` field for white-label routing (e.g., `app.thepulphouse.com`).
2.  **IAM (Identity & Access):**
    * `User` belongs to Organization.
    * `BrandAccess` table handles granular permissions (Which agent sees which brand).
3.  **Email System:**
    * `UserEmailConfig` stores encrypted OAuth tokens.
    * `EmailAlias` stores Gmail aliases (e.g., `mark@urbanquill.com`) linked to Brands.
4.  **Business Flow:**
    * `Lead` -> `Client` (Converted) -> `Order` -> `Invoice`.
    * `OutboxEvent` table implemented for Transactional Outbox Pattern (Reliability).

## 5. Directory Structure (Key Paths)
```text
/sentra-core
├── apps/
│   ├── backend/
│   │   ├── api-gateway/      # Port 3333
│   │   ├── core-service/     # Port 3001 (Business Logic)
│   │   └── comm-service/     # Port 3002 (Email/Sync)
│   └── frontend/
│       ├── sales-dashboard/  # Internal Agent UI
│       └── client-portal/    # External Client UI
├── libs/
│   ├── shared/
│   │   └── types/            # Shared Interfaces/DTOs
│   └── backend/
│       ├── prisma-client/    # Prisma Service (Postgres)
│       └── mongoose-client/  # Mongoose Service (Mongo)
├── docker-compose.yml        # Infra (Pg, Mongo, Redis, Rabbit)
└── .env                      # Config & Secrets