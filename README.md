# Project Assessment — Backend Evaluation

This repository contains the implementation of a Vehicle Maintenance Scheduler and a Notification Service.

## Repository Structure

- `logging_middleware/`: Centralized logging utilities.
- `vehicle_maintence_scheduler/`: Service for optimizing vehicle maintenance tasks using 0/1 Knapsack algorithm.
- `notification_app_be/`: Backend service for handling student notifications (PostgreSQL + SSE).
- `notification_system_design.md`: Comprehensive 6-stage design documentation.
- `postman_collection.json`: API testing suite.

---

## 1. Vehicle Maintenance Scheduler

This service identifies the optimal set of vehicles to maintain based on mechanic capacity and task impact.

### Setup & Run
```bash
cd vehicle_maintence_scheduler
npm install
cp .env.example .env
# Configure .env with API credentials
npm run schedule:vehicles
```

### Output
Results are saved to `output/depot-results.json`.

---

## 2. Notification Service

A scalable system for managing and delivering notifications to students in real-time.

### Setup & Run
```bash
cd notification_app_be
npm install
# Configure PostgreSQL database (see notification_system_design.md for schema)
cp .env.example .env
# Configure .env with DB and API credentials
npm run dev
```

### Priority Inbox
To run the Top-N priority inbox logic:
```bash
npm run priority:inbox
```
Results are saved to `output/priority-top10.json`.

---

## 3. API Testing

Import `postman_collection.json` into Postman to test all endpoints.
Variables:
- `notif_base`: http://localhost:3002
- `sched_base`: http://localhost:3001
- `token`: Your API authentication token

---

## Prerequisites
- Node.js >= 20
- PostgreSQL >= 15
- npm >= 10

## Submitted By
- Candidate Name: Vansh Agrawal
- Roll No: RA2311026010120