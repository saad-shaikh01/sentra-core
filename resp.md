root@server1:/# sudo apt update && sudo apt install -y postgresql-client-15
Failed to add a watch for /run/systemd/ask-password: inotify watch limit reached
Hit:1 https://download.docker.com/linux/ubuntu jammy InRelease
Hit:2 http://us.archive.ubuntu.com/ubuntu jammy InRelease
Hit:3 http://us.archive.ubuntu.com/ubuntu jammy-updates InRelease
Hit:4 http://us.archive.ubuntu.com/ubuntu jammy-backports InRelease
Hit:5 https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 InRelease
Hit:6 http://us.archive.ubuntu.com/ubuntu jammy-security InRelease
Hit:7 https://apt.postgresql.org/pub/repos/apt jammy-pgdg InRelease
Reading package lists... Done
Building dependency tree... Done
Reading state information... Done
92 packages can be upgraded. Run 'apt list --upgradable' to see them.
Reading package lists... Done
Building dependency tree... Done
Reading state information... Done
The following packages were automatically installed and are no longer required:
  mongodb-database-tools mongodb-mongosh
Use 'sudo apt autoremove' to remove them.
The following additional packages will be installed:
  libpq5
Suggested packages:
  libpq-oauth postgresql-15 postgresql-doc-15
The following NEW packages will be installed:
  postgresql-client-15
The following packages will be upgraded:
  libpq5
1 upgraded, 1 newly installed, 0 to remove and 91 not upgraded.
Need to get 1,981 kB of archives.
After this operation, 8,776 kB of additional disk space will be used.
Get:1 https://apt.postgresql.org/pub/repos/apt jammy-pgdg/main amd64 libpq5 amd64 18.3-1.pgdg22.04+1 [255 kB]
Get:2 https://apt.postgresql.org/pub/repos/apt jammy-pgdg/main amd64 postgresql-client-15 amd64 15.17-1.pgdg22.04+1 [1,726 kB]
Fetched 1,981 kB in 1s (1,582 kB/s)
(Reading database ... 111231 files and directories currently installed.)
Preparing to unpack .../libpq5_18.3-1.pgdg22.04+1_amd64.deb ...
Unpacking libpq5:amd64 (18.3-1.pgdg22.04+1) over (14.22-0ubuntu0.22.04.1) ...
Selecting previously unselected package postgresql-client-15.
Preparing to unpack .../postgresql-client-15_15.17-1.pgdg22.04+1_amd64.deb ...
Unpacking postgresql-client-15 (15.17-1.pgdg22.04+1) ...
Setting up libpq5:amd64 (18.3-1.pgdg22.04+1) ...
Setting up postgresql-client-15 (15.17-1.pgdg22.04+1) ...
update-alternatives: using /usr/share/postgresql/15/man/man1/psql.1.gz to provide /usr/share/man/man1/psql.1.gz (psql.1.gz) in auto mode
Processing triggers for libc-bin (2.35-0ubuntu3.13) ...
Scanning processes...
Scanning candidates...
Scanning linux images...

Restarting services...
Service restarts being deferred:
 /etc/needrestart/restart.d/dbus.service
 systemctl restart docker.service
 systemctl restart getty@tty1.service
 systemctl restart systemd-logind.service
 systemctl restart unattended-upgrades.service
 systemctl restart user@0.service

No containers need to be restarted.

No user sessions are running outdated binaries.

No VM guests are running outdated hypervisor (qemu) binaries on this host.
root@server1:/# pg_dump --version
pg_dump (PostgreSQL) 15.17 (Ubuntu 15.17-1.pgdg22.04+1)
root@server1:/# cd /home/sentra-live && node deploy/scripts/backup-databases.cjs live
Creating PostgreSQL backup for live...
Creating MongoDB backup for live...
2026-04-02T00:56:27.306+0000    writing sentra_comm_live.comm_messages to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.307+0000    writing sentra_comm_live.comm_entity_links to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.308+0000    writing sentra_comm_live.comm_audit_logs to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.315+0000    done dumping sentra_comm_live.comm_entity_links (1 document)
2026-04-02T00:56:27.317+0000    writing sentra_comm_live.comm_sync_jobs to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.330+0000    done dumping sentra_comm_live.comm_audit_logs (246 documents)
2026-04-02T00:56:27.331+0000    writing sentra_comm_live.comm_gsuite_connections to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.352+0000    done dumping sentra_comm_live.comm_gsuite_connections (1 document)
2026-04-02T00:56:27.353+0000    writing sentra_comm_live.comm_identities to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.363+0000    done dumping sentra_comm_live.comm_identities (1 document)
2026-04-02T00:56:27.363+0000    writing sentra_comm_live.comm_message_events to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.391+0000    writing sentra_comm_live.comm_threads to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.652+0000    done dumping sentra_comm_live.comm_messages (754 documents)
2026-04-02T00:56:27.652+0000    done dumping sentra_comm_live.comm_threads (507 documents)
2026-04-02T00:56:27.653+0000    writing sentra_comm_live.comm_signatures to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.653+0000    done dumping sentra_comm_live.comm_message_events (0 documents)
2026-04-02T00:56:27.654+0000    writing sentra_comm_live.comm_settings to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.655+0000    done dumping sentra_comm_live.comm_sync_jobs (1 document)
2026-04-02T00:56:27.656+0000    writing sentra_comm_live.comm_email_templates to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.661+0000    writing sentra_comm_live.comm_alerts to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.742+0000    done dumping sentra_comm_live.comm_alerts (0 documents)
2026-04-02T00:56:27.749+0000    writing sentra_comm_live.comm_attachments to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.800+0000    done dumping sentra_comm_live.comm_settings (0 documents)
2026-04-02T00:56:27.800+0000    done dumping sentra_comm_live.comm_signatures (0 documents)
2026-04-02T00:56:27.800+0000    writing sentra_comm_live.comm_message_tracking_tokens to archive '/home/sentra-live/tmp/db-backups/live/2026-04-02T00-56-26-455Z/mongo.archive.gz'
2026-04-02T00:56:27.841+0000    done dumping sentra_comm_live.comm_message_tracking_tokens (0 documents)
2026-04-02T00:56:27.842+0000    done dumping sentra_comm_live.comm_attachments (0 documents)
2026-04-02T00:56:27.842+0000    done dumping sentra_comm_live.comm_email_templates (0 documents)
Skipping Redis backup because redis-cli is not available.
Compressing backup for live...
Uploading backup to Wasabi: sentra-assets-live/system-backups/databases/live/2026-04-02T00-56-26-455Z.tar.gz
Backup uploaded successfully: sentra-assets-live/system-backups/databases/live/2026-04-02T00-56-26-455Z.tar.gz
No old backups to delete (retention: 7 days).
root@server1:/home/sentra-live#
