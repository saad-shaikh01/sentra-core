root@server1:/home/sentra-core# pm2 logs comm-service-testing --err --lines 50 --nostream
[TAILING] Tailing last 50 lines for [comm-service-testing] process (change the value with --lines option)
/root/.pm2/logs/comm-service-testing-error.log last 50 lines:
8|comm-ser | Starting inspector on localhost:9229 failed: address already in use
8|comm-ser |
8|comm-ser | [Nest] 1219932  - 03/31/2026, 11:25:25 PM   ERROR [WatchdogService] Watchdog: token revoked/invalid for identity 69c18c4025c020151aa446c7 (saad.madcomdigital@gmail.com): invalid_grant
8|comm-ser |
8|comm-ser | [Nest] 1219932  - 03/31/2026, 11:32:47 PM   ERROR [CommHTTP] {"service":"comm","requestId":"6a4f122611dab6ee","method":"POST","url":"/api/comm/messages/send","statusCode":500,"durationMs":781,"errorCode":"MongoServerError"}
8|comm-ser |
8|comm-ser | [Nest] 1219932  - 03/31/2026, 11:32:47 PM   ERROR [CommExceptions] Unhandled error: Updating the path 'identityId' would create a conflict at 'identityId'
8|comm-ser |
8|comm-ser | MongoServerError: Updating the path 'identityId' would create a conflict at 'identityId'
8|comm-ser |     at Connection.sendCommand (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/cmap/connection.ts:559:17)
8|comm-ser |     at processTicksAndRejections (node:internal/process/task_queues:95:5)
8|comm-ser |     at Connection.command (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/cmap/connection.ts:633:22)
8|comm-ser |     at Server.command (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/sdam/server.ts:350:21)
8|comm-ser |     at tryOperation (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/operations/execute_operation.ts:289:24)
8|comm-ser |     at executeOperation (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/operations/execute_operation.ts:119:12)
8|comm-ser |     at Collection.findOneAndUpdate (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/collection.ts:1041:12)
8|comm-ser |     at model.Query._findOneAndUpdate (/home/sentra-core/node_modules/mongoose/lib/query.js:3536:13)
8|comm-ser |     at model.Query.exec (/home/sentra-core/node_modules/mongoose/lib/query.js:4627:63)
8|comm-ser |     at SyncService.refreshThreadState (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.service.ts:463:21)
8|comm-ser |
8|comm-ser | [Nest] 1219932  - 03/31/2026, 11:34:51 PM   ERROR [CommHTTP] {"service":"comm","requestId":"266d425f9fdf59c9","method":"POST","url":"/api/comm/messages/send","statusCode":500,"durationMs":1328,"errorCode":"MongoServerError"}
8|comm-ser |
8|comm-ser | [Nest] 1219932  - 03/31/2026, 11:34:51 PM   ERROR [CommExceptions] Unhandled error: Updating the path 'identityId' would create a conflict at 'identityId'
8|comm-ser | MongoServerError: Updating the path 'identityId' would create a conflict at 'identityId'
8|comm-ser |     at Connection.sendCommand (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/cmap/connection.ts:559:17)
8|comm-ser |     at processTicksAndRejections (node:internal/process/task_queues:95:5)
8|comm-ser |     at Connection.command (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/cmap/connection.ts:633:22)
8|comm-ser |     at Server.command (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/sdam/server.ts:350:21)
8|comm-ser |     at tryOperation (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/operations/execute_operation.ts:289:24)
8|comm-ser |     at executeOperation (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/operations/execute_operation.ts:119:12)
8|comm-ser |     at Collection.findOneAndUpdate (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/collection.ts:1041:12)
8|comm-ser |     at model.Query._findOneAndUpdate (/home/sentra-core/node_modules/mongoose/lib/query.js:3536:13)
8|comm-ser |     at model.Query.exec (/home/sentra-core/node_modules/mongoose/lib/query.js:4627:63)
8|comm-ser |     at SyncService.refreshThreadState (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.service.ts:463:21)
8|comm-ser |
8|comm-ser | [Nest] 1219932  - 03/31/2026, 11:42:54 PM   ERROR [CommHTTP] {"service":"comm","requestId":"5ac0b78594087c94","method":"POST","url":"/api/comm/messages/send","statusCode":500,"durationMs":1016,"errorCode":"MongoServerError"}
8|comm-ser |
8|comm-ser | [Nest] 1219932  - 03/31/2026, 11:42:54 PM   ERROR [CommExceptions] Unhandled error: Updating the path 'identityId' would create a conflict at 'identityId'
8|comm-ser | MongoServerError: Updating the path 'identityId' would create a conflict at 'identityId'
8|comm-ser |     at Connection.sendCommand (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/cmap/connection.ts:559:17)
8|comm-ser |     at processTicksAndRejections (node:internal/process/task_queues:95:5)
8|comm-ser |     at Connection.command (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/cmap/connection.ts:633:22)
8|comm-ser |     at Server.command (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/sdam/server.ts:350:21)
8|comm-ser |     at tryOperation (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/operations/execute_operation.ts:289:24)
8|comm-ser |     at executeOperation (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/operations/execute_operation.ts:119:12)
8|comm-ser |     at Collection.findOneAndUpdate (/home/sentra-core/node_modules/mongoose/node_modules/mongodb/src/collection.ts:1041:12)
8|comm-ser |     at model.Query._findOneAndUpdate (/home/sentra-core/node_modules/mongoose/lib/query.js:3536:13)
8|comm-ser |     at model.Query.exec (/home/sentra-core/node_modules/mongoose/lib/query.js:4627:63)
8|comm-ser |     at SyncService.refreshThreadState (/home/sentra-core/dist/apps/backend/comm-service/webpack:/src/modules/sync/sync.service.ts:463:21)
8|comm-ser |

root@server1:/home/sentra-core#
