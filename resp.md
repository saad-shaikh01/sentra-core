root@server1:/home/sentra-core# pm2 ls
┌────┬────────────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name                       │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼────────────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 5  │ chat-frontend              │ default     │ 0.39.0  │ fork    │ 1270435  │ 3D     │ 0    │ online    │ 0%       │ 25.1mb   │ root     │ disabled │
│ 1  │ client-portal              │ default     │ 1.0.0   │ fork    │ 1270350  │ 3D     │ 0    │ online    │ 0%       │ 55.8mb   │ root     │ disabled │
│ 8  │ comm-service               │ default     │ 22.4.5  │ fork    │ 1324021  │ 35h    │ 3    │ online    │ 0%       │ 29.1mb   │ root     │ disabled │
│ 13 │ comm-service-testing       │ default     │ 22.4.5  │ fork    │ 1367378  │ 91s    │ 0    │ online    │ 0%       │ 87.2mb   │ root     │ disabled │
│ 7  │ core-service               │ default     │ 22.4.5  │ fork    │ 1324049  │ 35h    │ 2    │ online    │ 0%       │ 25.2mb   │ root     │ disabled │
│ 12 │ core-service-testing       │ default     │ 22.4.5  │ fork    │ 1367377  │ 91s    │ 0    │ online    │ 0%       │ 87.9mb   │ root     │ disabled │
│ 3  │ ebook-backend              │ default     │ 1.0.0   │ fork    │ N/A      │ 0      │ 50   │ stopped   │ 0%       │ 0b       │ root     │ disabled │
│ 6  │ ebook-updated              │ default     │ 0.39.0  │ fork    │ 1270436  │ 3D     │ 0    │ online    │ 0%       │ 27.0mb   │ root     │ disabled │
│ 18 │ hrms-dashboard-testing     │ default     │ 22.4.5  │ fork    │ 1367429  │ 91s    │ 0    │ online    │ 0%       │ 86.4mb   │ root     │ disabled │
│ 17 │ hrms-service-testing       │ default     │ 22.4.5  │ fork    │ 1367418  │ 91s    │ 0    │ online    │ 0%       │ 88.5mb   │ root     │ disabled │
│ 4  │ jira-clone                 │ default     │ 0.39.0  │ fork    │ 1270364  │ 3D     │ 0    │ online    │ 0%       │ 26.2mb   │ root     │ disabled │
│ 11 │ pm-dashboard               │ default     │ 22.4.5  │ fork    │ 1270485  │ 3D     │ 0    │ online    │ 0%       │ 27.3mb   │ root     │ disabled │
│ 16 │ pm-dashboard-testing       │ default     │ 22.4.5  │ fork    │ 1375746  │ 4s     │ 17   │ online    │ 0%       │ 98.9mb   │ root     │ disabled │
│ 9  │ pm-service                 │ default     │ 22.4.5  │ fork    │ 1279269  │ 2D     │ 1    │ online    │ 0%       │ 22.8mb   │ root     │ disabled │
│ 14 │ pm-service-testing         │ default     │ 22.4.5  │ fork    │ 1367386  │ 91s    │ 0    │ online    │ 0%       │ 86.6mb   │ root     │ disabled │
│ 10 │ sales-dashboard            │ default     │ 22.4.5  │ fork    │ 1324088  │ 35h    │ 2    │ online    │ 0%       │ 23.8mb   │ root     │ disabled │
│ 15 │ sales-dashboard-testing    │ default     │ 22.4.5  │ fork    │ 1376039  │ 0s     │ 18   │ online    │ 33.3%    │ 82.2mb   │ root     │ disabled │
│ 0  │ server                     │ default     │ 1.0.0   │ fork    │ 1357040  │ 6h     │ 8    │ online    │ 0%       │ 43.5mb   │ root     │ disabled │
│ 2  │ server                     │ default     │ 1.0.0   │ fork    │ 1270362  │ 3D     │ 0    │ online    │ 0%       │ 50.2mb   │ root     │ disabled │
└────┴────────────────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
root@server1:/home/sentra-core#
