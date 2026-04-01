I need help with an issue I'm facing after adding a new feature for Gmail integration in the comm-service. Here's the situation:

I initially added the Gmail integration feature where, upon connecting the Gmail account, all previous emails (both sent and received) were syncing perfectly. The backfill for all old emails was working as expected, and emails were being sent successfully. This functionality was live and working fine in the live branch.
Then, I added tracking features in the main branch, which is the current branch. After implementing these tracking features, I deployed the app in the production environment and updated the .env.production file accordingly.

Now, the problem is:

Emails are being sent successfully.
However, incoming emails are not displaying in the inbox.
Old emails (both sent and received) are not syncing or backfilling at all.

Could you help me identify the issue? It worked perfectly before the tracking feature was added, so I suspect something in the integration with tracking features might have disrupted the sync process. Also, I would appreciate any advice on speeding up the process using sub-agents or optimizations, as this issue is affecting our users.

Please investigate the cause and suggest any possible fixes or debugging steps.