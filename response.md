root@server1:/home/sentra-core# docker exec sentra_redis_testing redis-cli -a sentra_redis_password HGETALL "bull:comm-sync:1022" 2>/dev/null | grep -v Warning
ats
3
opts
{"backoff":{"delay":2000,"type":"exponential"},"attempts":3}
priority
0
processedOn
1774372935949
data
{"identityId":"69c18c4025c020151aa446c7","messageId":"19d20dc9054d5992"}
failedReason
Requested entity was not found.
atm
3
stacktrace
["Error: Requested entity was not found.\n    at Gaxios._request (/home/sentra-core/node_modules/gaxios/src/gaxios.ts:213:15)\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)\n    at OAuth2Client.requestAsync (/home/sentra-core/node_modules/google-auth-library/build/src/auth/oauth2client.js:463:20)\n    at createAPIRequestAsync (/home/sentra-core/node_modules/googleapis-common/build/src/apirequest.js:308:25)\n    at GmailApiService.getMessage (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/gmail-api.service.ts:125:18)\n    at SyncService.executeGmailCall (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.service.ts:523:14)\n    at SyncService.processMessage (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.service.ts:327:17)\n    at SyncProcessor.handleProcessMessage (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.processor.ts:140:5)\n    at SyncProcessor.process (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.processor.ts:64:11)\n    at /home/sentra-core/node_modules/bullmq/src/classes/worker.ts:998:26","Error: Requested entity was not found.\n    at Gaxios._request (/home/sentra-core/node_modules/gaxios/src/gaxios.ts:213:15)\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)\n    at OAuth2Client.requestAsync (/home/sentra-core/node_modules/google-auth-library/build/src/auth/oauth2client.js:463:20)\n    at createAPIRequestAsync (/home/sentra-core/node_modules/googleapis-common/build/src/apirequest.js:308:25)\n    at GmailApiService.getMessage (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/gmail-api.service.ts:125:18)\n    at SyncService.executeGmailCall (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.service.ts:523:14)\n    at SyncService.processMessage (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.service.ts:327:17)\n    at SyncProcessor.handleProcessMessage (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.processor.ts:140:5)\n    at SyncProcessor.process (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.processor.ts:64:11)\n    at /home/sentra-core/node_modules/bullmq/src/classes/worker.ts:998:26","Error: Requested entity was not found.\n    at Gaxios._request (/home/sentra-core/node_modules/gaxios/src/gaxios.ts:213:15)\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)\n    at OAuth2Client.requestAsync (/home/sentra-core/node_modules/google-auth-library/build/src/auth/oauth2client.js:463:20)\n    at createAPIRequestAsync (/home/sentra-core/node_modules/googleapis-common/build/src/apirequest.js:308:25)\n    at GmailApiService.getMessage (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/gmail-api.service.ts:125:18)\n    at SyncService.executeGmailCall (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.service.ts:523:14)\n    at SyncService.processMessage (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.service.ts:327:17)\n    at SyncProcessor.handleProcessMessage (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.processor.ts:140:5)\n    at SyncProcessor.process (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.processor.ts:64:11)\n    at /home/sentra-core/node_modules/bullmq/src/classes/worker.ts:998:26"]
delay
0
name
process-message
finishedOn
1774372936650
timestamp
1774372928840
root@server1:/home/sentra-core#
