
17|sales-dashboard-live  | > nx run sales-dashboard:serve:production --port=4300
17|sales-dashboard-live  | node:events:496
17|sales-dashboard-live  |       throw er; // Unhandled 'error' event
17|sales-dashboard-live  |       ^
17|sales-dashboard-live  | Error: spawn /root/.nvm/versions/node/v20.11.0/bin/node ENOENT
17|sales-dashboard-live  |     at ChildProcess._handle.onexit (node:internal/child_process:286:19)
17|sales-dashboard-live  |     at onErrorNT (node:internal/child_process:484:16)
17|sales-dashboard-live  |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21)
17|sales-dashboard-live  | Emitted 'error' event on ChildProcess instance at:
17|sales-dashboard-live  |     at ChildProcess._handle.onexit (node:internal/child_process:292:12)
17|sales-dashboard-live  |     at onErrorNT (node:internal/child_process:484:16)
17|sales-dashboard-live  |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21) {
17|sales-dashboard-live  |   errno: -2,
17|sales-dashboard-live  |   code: 'ENOENT',
17|sales-dashboard-live  |   syscall: 'spawn /root/.nvm/versions/node/v20.11.0/bin/node',
17|sales-dashboard-live  |   path: '/root/.nvm/versions/node/v20.11.0/bin/node',
17|sales-dashboard-live  |   spawnargs: [
17|sales-dashboard-live  |     '/home/sentra-live/node_modules/next/dist/bin/next',
17|sales-dashboard-live  |     'start',
17|sales-dashboard-live  |     '--port=4300'
17|sales-dashboard-live  |   ]
17|sales-dashboard-live  | }
17|sales-dashboard-live  | Node.js v20.11.0
17|sales-dashboard-live  | Task "sales-dashboard:serve:production" is continuous but exited with code 1
17|sales-dashboard-live  |  NX   Successfully ran target serve for project sales-dashboard


root@server1:/home/sentra-live# pm2 logs pm-dashboard-live --lines 100
[TAILING] Tailing last 100 lines for [pm-dashboard-live] process (change the value with --lines option)
/root/.pm2/logs/pm-dashboard-live-error.log last 100 lines:
18|pm-dash |   spawnargs: [
18|pm-dash |     '/home/sentra-live/node_modules/next/dist/bin/next',
18|pm-dash |     'start',
18|pm-dash |     '--port=4301'
18|pm-dash |   ]
18|pm-dash | }
18|pm-dash | Node.js v20.11.0
18|pm-dash | Task "pm-dashboard:serve:production" is continuous but exited with code 1
18|pm-dash | node:events:496
18|pm-dash |       throw er; // Unhandled 'error' event
18|pm-dash |       ^
18|pm-dash | Error: spawn /root/.nvm/versions/node/v20.11.0/bin/node ENOENT
18|pm-dash |     at ChildProcess._handle.onexit (node:internal/child_process:286:19)
18|pm-dash |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dash |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21)
18|pm-dash | Emitted 'error' event on ChildProcess instance at:
18|pm-dash |     at ChildProcess._handle.onexit (node:internal/child_process:292:12)
18|pm-dash |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dash |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21) {
18|pm-dash |   errno: -2,
18|pm-dash |   code: 'ENOENT',
18|pm-dash |   syscall: 'spawn /root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dash |   path: '/root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dash |   spawnargs: [
18|pm-dash |     '/home/sentra-live/node_modules/next/dist/bin/next',
18|pm-dash |     'start',
18|pm-dash |     '--port=4301'
18|pm-dash |   ]
18|pm-dash | }
18|pm-dash | Node.js v20.11.0
18|pm-dash | Task "pm-dashboard:serve:production" is continuous but exited with code 1
18|pm-dash | node:events:496
18|pm-dash |       throw er; // Unhandled 'error' event
18|pm-dash |       ^
18|pm-dash | Error: spawn /root/.nvm/versions/node/v20.11.0/bin/node ENOENT
18|pm-dash |     at ChildProcess._handle.onexit (node:internal/child_process:286:19)
18|pm-dash |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dash |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21)
18|pm-dash | Emitted 'error' event on ChildProcess instance at:
18|pm-dash |     at ChildProcess._handle.onexit (node:internal/child_process:292:12)
18|pm-dash |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dash |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21) {
18|pm-dash |   errno: -2,
18|pm-dash |   code: 'ENOENT',
18|pm-dash |   syscall: 'spawn /root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dash |   path: '/root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dash |   spawnargs: [
18|pm-dash |     '/home/sentra-live/node_modules/next/dist/bin/next',
18|pm-dash |     'start',
18|pm-dash |     '--port=4301'
18|pm-dash |   ]
18|pm-dash | }
18|pm-dash | Node.js v20.11.0
18|pm-dash | Task "pm-dashboard:serve:production" is continuous but exited with code 1
18|pm-dash | node:events:496
18|pm-dash |       throw er; // Unhandled 'error' event
18|pm-dash |       ^
18|pm-dash | Error: spawn /root/.nvm/versions/node/v20.11.0/bin/node ENOENT
18|pm-dash |     at ChildProcess._handle.onexit (node:internal/child_process:286:19)
18|pm-dash |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dash |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21)
18|pm-dash | Emitted 'error' event on ChildProcess instance at:
18|pm-dash |     at ChildProcess._handle.onexit (node:internal/child_process:292:12)
18|pm-dash |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dash |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21) {
18|pm-dash |   errno: -2,
18|pm-dash |   code: 'ENOENT',
18|pm-dash |   syscall: 'spawn /root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dash |   path: '/root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dash |   spawnargs: [
18|pm-dash |     '/home/sentra-live/node_modules/next/dist/bin/next',
18|pm-dash |     'start',
18|pm-dash |     '--port=4301'
18|pm-dash |   ]
18|pm-dash | }
18|pm-dash | Node.js v20.11.0
18|pm-dash | Task "pm-dashboard:serve:production" is continuous but exited with code 1
18|pm-dash | node:events:496
18|pm-dash |       throw er; // Unhandled 'error' event
18|pm-dash |       ^
18|pm-dash | Error: spawn /root/.nvm/versions/node/v20.11.0/bin/node ENOENT
18|pm-dash |     at ChildProcess._handle.onexit (node:internal/child_process:286:19)
18|pm-dash |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dash |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21)
18|pm-dash | Emitted 'error' event on ChildProcess instance at:
18|pm-dash |     at ChildProcess._handle.onexit (node:internal/child_process:292:12)
18|pm-dash |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dash |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21) {
18|pm-dash |   errno: -2,
18|pm-dash |   code: 'ENOENT',
18|pm-dash |   syscall: 'spawn /root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dash |   path: '/root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dash |   spawnargs: [
18|pm-dash |     '/home/sentra-live/node_modules/next/dist/bin/next',
18|pm-dash |     'start',
18|pm-dash |     '--port=4301'
18|pm-dash |   ]
18|pm-dash | }
18|pm-dash | Node.js v20.11.0
18|pm-dash | Task "pm-dashboard:serve:production" is continuous but exited with code 1

/root/.pm2/logs/pm-dashboard-live-out.log last 100 lines:
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash | > nx run pm-dashboard:serve:production --port=4301
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |
18|pm-dash |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dash |
18|pm-dash |

18|pm-dashboard-live  | > nx run pm-dashboard:serve:production --port=4301
18|pm-dashboard-live  | node:events:496
18|pm-dashboard-live  |       throw er; // Unhandled 'error' event
18|pm-dashboard-live  |       ^
18|pm-dashboard-live  | Error: spawn /root/.nvm/versions/node/v20.11.0/bin/node ENOENT
18|pm-dashboard-live  |     at ChildProcess._handle.onexit (node:internal/child_process:286:19)
18|pm-dashboard-live  |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dashboard-live  |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21)
18|pm-dashboard-live  | Emitted 'error' event on ChildProcess instance at:
18|pm-dashboard-live  |     at ChildProcess._handle.onexit (node:internal/child_process:292:12)
18|pm-dashboard-live  |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dashboard-live  |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21) {
18|pm-dashboard-live  |   errno: -2,
18|pm-dashboard-live  |   code: 'ENOENT',
18|pm-dashboard-live  |   syscall: 'spawn /root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dashboard-live  |   path: '/root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dashboard-live  |   spawnargs: [
18|pm-dashboard-live  |     '/home/sentra-live/node_modules/next/dist/bin/next',
18|pm-dashboard-live  |     'start',
18|pm-dashboard-live  |     '--port=4301'
18|pm-dashboard-live  |   ]
18|pm-dashboard-live  | }
18|pm-dashboard-live  | Node.js v20.11.0
18|pm-dashboard-live  | Task "pm-dashboard:serve:production" is continuous but exited with code 1
18|pm-dashboard-live  |  NX   Successfully ran target serve for project pm-dashboard
18|pm-dashboard-live  | > nx run pm-dashboard:serve:production --port=4301
18|pm-dashboard-live  | node:events:496
18|pm-dashboard-live  |       throw er; // Unhandled 'error' event
18|pm-dashboard-live  |       ^
18|pm-dashboard-live  | Error: spawn /root/.nvm/versions/node/v20.11.0/bin/node ENOENT
18|pm-dashboard-live  |     at ChildProcess._handle.onexit (node:internal/child_process:286:19)
18|pm-dashboard-live  |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dashboard-live  |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21)
18|pm-dashboard-live  | Emitted 'error' event on ChildProcess instance at:
18|pm-dashboard-live  |     at ChildProcess._handle.onexit (node:internal/child_process:292:12)
18|pm-dashboard-live  |     at onErrorNT (node:internal/child_process:484:16)
18|pm-dashboard-live  |     at process.processTicksAndRejections (node:internal/process/task_queues:82:21) {
18|pm-dashboard-live  |   errno: -2,
18|pm-dashboard-live  |   code: 'ENOENT',
18|pm-dashboard-live  |   syscall: 'spawn /root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dashboard-live  |   path: '/root/.nvm/versions/node/v20.11.0/bin/node',
18|pm-dashboard-live  |   spawnargs: [
18|pm-dashboard-live  |     '/home/sentra-live/node_modules/next/dist/bin/next',
18|pm-dashboard-live  |     'start',
18|pm-dashboard-live  |     '--port=4301'
18|pm-dashboard-live  |   ]
18|pm-dashboard-live  | }
18|pm-dashboard-live  | Node.js v20.11.0
18|pm-dashboard-live  | Task "pm-dashboard:serve:production" is continuous but exited with code 1
18|pm-dashboard-live  |  NX   Successfully ran target serve for project pm-dashboard


root@server1:/home/sentra-live# pm2 show sales-dashboard-live
 Describing process with id 17 - name sales-dashboard-live
┌───────────────────┬──────────────────────────────────────────────────┐
│ status            │ online                                           │
│ name              │ sales-dashboard-live                             │
│ namespace         │ default                                          │
│ version           │ 22.4.5                                           │
│ restarts          │ 101                                              │
│ uptime            │ 3s                                               │
│ script path       │ /home/sentra-live/node_modules/nx/bin/nx.js      │
│ script args       │ run sales-dashboard:serve:production --port=4300 │
│ error log path    │ /root/.pm2/logs/sales-dashboard-live-error.log   │
│ out log path      │ /root/.pm2/logs/sales-dashboard-live-out.log     │
│ pid path          │ /root/.pm2/pids/sales-dashboard-live-17.pid      │
│ interpreter       │ node                                             │
│ interpreter args  │ N/A                                              │
│ script id         │ 17                                               │
│ exec cwd          │ /home/sentra-live                                │
│ exec mode         │ fork_mode                                        │
│ node.js version   │ 20.11.0                                          │
│ node env          │ production                                       │
│ watch & reload    │ ✘                                                │
│ unstable restarts │ 0                                                │
│ created at        │ 2026-03-24T18:00:58.582Z                         │
└───────────────────┴──────────────────────────────────────────────────┘
 Actions available
┌────────────────────────┐
│ km:heapdump            │
│ km:cpu:profiling:start │
│ km:cpu:profiling:stop  │
│ km:heap:sampling:start │
│ km:heap:sampling:stop  │
└────────────────────────┘
 Trigger via: pm2 trigger sales-dashboard-live <action_name>

 Code metrics value
┌────────────────────────┬───────────┐
│ Used Heap Size         │ 20.87 MiB │
│ Heap Usage             │ 62.92 %   │
│ Heap Size              │ 33.17 MiB │
│ Event Loop Latency p95 │ 0.28 ms   │
│ Event Loop Latency     │ 0.15 ms   │
│ Active handles         │ 4         │
│ Active requests        │ 0         │
└────────────────────────┴───────────┘
 Divergent env variables from local env
┌────────┬───────────────────┐
│ SHLVL  │ 3                 │
│ OLDPWD │ /home/sentra-live │
└────────┴───────────────────┘

 Add your own code metrics: http://bit.ly/code-metrics
 Use `pm2 logs sales-dashboard-live [--lines 1000]` to display logs
 Use `pm2 env 17` to display environment variables
 Use `pm2 monit` to monitor CPU and Memory usage sales-dashboard-live
root@server1:/home/sentra-live#


root@server1:/home/sentra-live# pm2 show pm-dashboard-live
 Describing process with id 18 - name pm-dashboard-live
┌───────────────────┬───────────────────────────────────────────────┐
│ status            │ online                                        │
│ name              │ pm-dashboard-live                             │
│ namespace         │ default                                       │
│ version           │ 22.4.5                                        │
│ restarts          │ 355                                           │
│ uptime            │ 1s                                            │
│ script path       │ /home/sentra-live/node_modules/nx/bin/nx.js   │
│ script args       │ run pm-dashboard:serve:production --port=4301 │
│ error log path    │ /root/.pm2/logs/pm-dashboard-live-error.log   │
│ out log path      │ /root/.pm2/logs/pm-dashboard-live-out.log     │
│ pid path          │ /root/.pm2/pids/pm-dashboard-live-18.pid      │
│ interpreter       │ node                                          │
│ interpreter args  │ N/A                                           │
│ script id         │ 18                                            │
│ exec cwd          │ /home/sentra-live                             │
│ exec mode         │ fork_mode                                     │
│ node.js version   │ 20.11.0                                       │
│ node env          │ production                                    │
│ watch & reload    │ ✘                                             │
│ unstable restarts │ 0                                             │
│ created at        │ 2026-03-24T18:00:58.594Z                      │
└───────────────────┴───────────────────────────────────────────────┘
 Actions available
┌────────────────────────┐
│ km:heapdump            │
│ km:cpu:profiling:start │
│ km:cpu:profiling:stop  │
│ km:heap:sampling:start │
│ km:heap:sampling:stop  │
└────────────────────────┘
 Trigger via: pm2 trigger pm-dashboard-live <action_name>

 Divergent env variables from local env
┌────────┬───────────────────┐
│ SHLVL  │ 3                 │
│ OLDPWD │ /home/sentra-live │
└────────┴───────────────────┘

 Add your own code metrics: http://bit.ly/code-metrics
 Use `pm2 logs pm-dashboard-live [--lines 1000]` to display logs
 Use `pm2 env 18` to display environment variables
 Use `pm2 monit` to monitor CPU and Memory usage pm-dashboard-live
root@server1:/home/sentra-live#
