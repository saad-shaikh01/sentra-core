Main ne file-level validation complete kar li: bash scripts syntax pass hain, Nginx/PM2/env files structured hain, aur VPS flow document bhi add ho gaya hai. Ab main final handoff me exact paths aur first-run commands de raha hoon.

Worked for 50m 19s
Setup code me add kar diya gaya hai. Ab repo me separate testing/live env examples, Docker infra files, PM2 configs, Nginx configs, aur deploy scripts maujood hain in .env.testing.example (line 1), .env.live.example (line 1), docker-compose.testing.yml (line 1), docker-compose.live.yml (line 1), deploy/pm2/ecosystem.testing.config.cjs (line 1), deploy/pm2/ecosystem.live.config.cjs (line 1), deploy/nginx/testinglinq.com.conf (line 1), deploy/nginx/sentracoresystems.com.conf (line 1), aur full runbook deploy/README.md (line 1) me hai. Deploy automation deploy/scripts/deploy-env.sh (line 1) me add hai, aur storage CORS bhi dono domains ke liye update kar diya in scripts/provision-storage.ts (line 46).

VPS par first-time setup ke liye yeh sequence run karo:

cd /home/sentra-core
git fetch origin
git checkout -b testing
git push -u origin testing
git worktree add /home/sentra-live main

cd /home/sentra-core
cp .env.testing.example .env.testing
cp deploy/env/infra.testing.env.example deploy/env/infra.testing.env

cd /home/sentra-live
cp .env.live.example .env.live
cp deploy/env/infra.live.env.example deploy/env/infra.live.env
Phir apni real credentials dono env files me fill karo, aur Nginx/SSL setup:

sudo cp /home/sentra-core/deploy/nginx/testinglinq.com.conf /etc/nginx/sites-available/testinglinq.com.conf
sudo cp /home/sentra-live/deploy/nginx/sentracoresystems.com.conf /etc/nginx/sites-available/sentracoresystems.com.conf
sudo ln -sf /etc/nginx/sites-available/testinglinq.com.conf /etc/nginx/sites-enabled/testinglinq.com.conf
sudo ln -sf /etc/nginx/sites-available/sentracoresystems.com.conf /etc/nginx/sites-enabled/sentracoresystems.com.conf
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d testinglinq.com -d sales.testinglinq.com -d pm.testinglinq.com -d hrms.testinglinq.com -d api.testinglinq.com
sudo certbot --nginx -d sentracoresystems.com -d sales.sentracoresystems.com -d pm.sentracoresystems.com -d hrms.sentracoresystems.com -d api.sentracoresystems.com
Regular deploy commands yeh hain:

cd /home/sentra-core
git pull origin testing
bash deploy/scripts/deploy-testing.sh
cd /home/sentra-live
git pull origin main
bash deploy/scripts/deploy-live.sh
Ek important note: .env.testing, .env.live, deploy/env/infra.testing.env, aur deploy/env/infra.live.env ko commit mat karna; maine unhein ignore bhi kar diya hai in .gitignore (line 50). Main bash scripts syntax-check kar saka, lekin is environment me node installed nahi tha, is liye PM2 config ko runtime par execute karke verify nahi kar saka. Agar chaho to next step me main aapke liye ek exact VPS checklist bhi short form me bana deta hoon jo aap copy-paste order me follow karo.


18 files changed
+823
-132
Undo

.env.live.example
.env.testing.example
.gitignore
README.md
infra.live.env.example
infra.testing.env.example
sentracoresystems.com.conf
testinglinq.com.conf
create-ecosystem.cjs
ecosystem.config.cjs
ecosystem.live.config.cjs
ecosystem.testing.config.cjs
deploy-env.sh
deploy-live.sh
deploy-testing.sh
docker-compose.live.yml
docker-compose.testing.yml
provision-storage.ts

}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}


Ab repo me actual tracked env files direct deploy ke liye ready hain: .env.testing (line 1), .env.live (line 1), deploy/env/infra.testing.env (line 1), aur deploy/env/infra.live.env (line 1). Maine .gitignore se inko ignore karna bhi hata diya hai in .gitignore (line 44), aur runbook ko no-manual-copy flow par update kar diya in deploy/README.md (line 59). Deploy scripts syntax-check bhi pass kar gaye, aur deploy/scripts/deploy-env.sh (line 1) ab seedha in actual files ko use karta hai.

VPS par ab aapko env files edit/copy karne ki zarurat nahi honi chahiye. First-time setup ke liye:

cd /home/sentra-core
git fetch origin
git checkout testing
git pull origin testing
git worktree add /home/sentra-live main

sudo cp /home/sentra-core/deploy/nginx/testinglinq.com.conf /etc/nginx/sites-available/testinglinq.com.conf
sudo cp /home/sentra-live/deploy/nginx/sentracoresystems.com.conf /etc/nginx/sites-available/sentracoresystems.com.conf
sudo ln -sf /etc/nginx/sites-available/testinglinq.com.conf /etc/nginx/sites-enabled/testinglinq.com.conf
sudo ln -sf /etc/nginx/sites-available/sentracoresystems.com.conf /etc/nginx/sites-enabled/sentracoresystems.com.conf
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d testinglinq.com -d sales.testinglinq.com -d pm.testinglinq.com -d hrms.testinglinq.com -d api.testinglinq.com
sudo certbot --nginx -d sentracoresystems.com -d sales.sentracoresystems.com -d pm.sentracoresystems.com -d hrms.sentracoresystems.com -d api.sentracoresystems.com
Phir deploy commands sirf yeh rahenge:

cd /home/sentra-core
git pull origin testing
bash deploy/scripts/deploy-testing.sh
cd /home/sentra-live
git pull origin main
bash deploy/scripts/deploy-live.sh
Live stack ke liye maine alag ports set kar diye hain, is liye dono same VPS par parallel chal sakte hain: app ports .env.live (line 5) me aur infra ports deploy/env/infra.live.env (line 1) me defined hain. Ek seedhi warning: ab testing aur live dono ke real credentials tracked files me hain. Agar repo shared/private hygiene concern hai to baad me in secrets ko rotate karke secrets manager ya server-only env par shift karna chahiye.


5 files changed
+109
-39
Undo

.env.live
.env.testing
.gitignore
README.md
infra.live.env

