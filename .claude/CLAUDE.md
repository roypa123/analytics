I want you to act as a Senior Software Architect, Backend Architect, Frontend Architect, and Technical Product Designer.

I want to build a Google Analytics–like web application for collecting, processing, storing, and visualizing website analytics data.

Critical First Step

Before creating the implementation plan, first study and analyze the existing frontend and backend architecture of the current project.

Do not assume that the project is starting from scratch.

Analyze the existing:

Frontend project structure
Backend project structure
Existing folders
Existing architectural patterns
Existing configuration
Existing dependencies
Existing coding patterns
Existing API structure
Existing database structure
Existing authentication architecture, if available

The implementation plan must be designed to fit into and extend the current application architecture, rather than replacing the existing architecture unnecessarily.

Important Instructions
Do not write application code.
Focus only on creating a detailed implementation plan and technical architecture.
The final document should be approximately 100 pages of detailed technical planning.
Explain every major architectural decision clearly.
Do not generate random or generic folder structures without first considering the existing project architecture.
Maintain consistency with the existing frontend and backend architecture.
Clearly explain how the new Google Analytics–like functionality should be integrated into the existing application.
The plan should be practical and production-oriented.
Technology Stack
Frontend

The frontend uses:

React
Tailwind CSS
shadcn/ui
Jotai for client/global state management
TanStack Query for server state, API requests, caching, mutations, and data synchronization

The existing frontend already contains a structured src architecture with folders such as:

api
config
context
endpoints
hooks
lib
pages
routing
types
utils

The proposed frontend architecture must follow and extend this existing structure appropriately.

Explain clearly:

The responsibility of every existing folder
Where new analytics-related functionality should be placed
Whether new folders are necessary
How features should be organized
How API calls should be structured
How endpoints should be managed
How TypeScript types should be organized
How reusable hooks should be organized
How Jotai atoms should be organized
How TanStack Query queries and mutations should be organized
How Tailwind CSS should be used
How shadcn/ui components should be integrated
How reusable analytics components should be structured
How dashboard components should be structured
How routing should be organized
How authentication and protected routes should integrate with the existing routing architecture

Do not unnecessarily introduce another frontend architecture pattern if the current structure already supports the application.

Backend

The backend uses:

Python
FastAPI
PostgreSQL
Alembic for database migrations
REST API architecture
Background workers where necessary

The backend must follow a proper, scalable architecture based on clear separation of responsibilities.

The architecture should clearly define layers such as:

Models
Views
Controllers
Services
Repositories or data-access layer where appropriate
Schemas
Database layer
Configuration
Middleware
Dependencies
Utilities
Background tasks

Explain clearly how the backend should implement a clean architecture without unnecessary complexity.

Define the responsibilities and communication flow between:

Request → Router/View → Controller → Service → Repository/Data Access → Model/Database

Clearly explain which layer should contain:

HTTP request handling
Request validation
Response formatting
Business logic
Database queries
Database transactions
Authentication
Authorization
Analytics processing logic
Error handling

The architecture should be practical for FastAPI and production-ready.

Database

Use:

PostgreSQL
Alembic for schema migrations and version control

Explain:

Database architecture
Migration strategy
Alembic migration workflow
Development migrations
Staging migrations
Production migrations
Rollback considerations
Database versioning
Schema evolution
Indexing strategy
Partitioning strategy for analytics data
High-volume event storage
Data retention
Archiving